import { resolve, join, basename } from 'path';
import { existsSync } from 'fs';
import { glob } from 'glob';
import pLimit from 'p-limit';
import chalk from 'chalk';
import ora from 'ora';

import { ensureOwHome, getProjectContentPath } from '../storage/paths.js';
import { isFumadocsReady, setupFumadocs } from '../storage/setup.js';
import {
  upsertProject, updateProjectLastIndexed,
  getProjectFiles, deleteFile, upsertFile, upsertSymbols, getFileHash,
  updateProjectDocs, getProjectDocs,
} from '../storage/db.js';
import { buildIgnorePatterns } from '../indexer/ignore.js';
import { detectLanguage } from '../indexer/parser.js';
import { FilePool } from '../indexer/file-pool.js';
import type { WorkerResult } from '../indexer/file-pool.js';
import {
  generateFileDoc,
  generateProjectOverview, generateArchitectureMermaid,
} from '../llm/generate.js';
import type { FileDoc } from '../llm/generate.js';
import { checkProviderReady } from '../llm/provider.js';
import { writeProjectIndex, writeFilePage, writeMetaJson, removeFilePage } from '../output/mdx.js';
import type { SymbolWithComment } from '../indexer/comments.js';

/** Max concurrent LLM calls — 1 call per file now (no nested limits), so 10 is safe */
const LLM_CONCURRENCY = 10;

export async function indexProject(
  projectPath: string,
  options: { provider?: string; name?: string; force?: boolean }
): Promise<void> {
  const absPath = resolve(process.cwd(), projectPath);

  if (!existsSync(absPath)) {
    console.error(chalk.red(`Path not found: ${absPath}`));
    process.exit(1);
  }

  const projectName = options.name ?? basename(absPath);
  console.log(chalk.bold(`\nIndexing ${chalk.cyan(projectName)} at ${chalk.gray(absPath)}\n`));

  ensureOwHome();
  checkProviderReady(options.provider);

  if (!isFumadocsReady()) {
    await setupFumadocs();
  }

  // Phase 1: Collect source files
  const collectSpinner = ora('Collecting source files...').start();
  const ignorePatterns = buildIgnorePatterns(absPath);
  const allFiles = await glob('**/*', { cwd: absPath, ignore: ignorePatterns, nodir: true });
  const sourceFiles = allFiles.filter((f) => detectLanguage(f) !== null);
  collectSpinner.succeed(`Found ${chalk.bold(sourceFiles.length)} source files`);

  if (sourceFiles.length === 0) {
    console.log(chalk.yellow('No supported source files found (JS/TS/Python).'));
    return;
  }

  // DB setup
  const projectId = upsertProject(projectName, absPath);
  const dbFiles = getProjectFiles(projectId);
  const dbPathSet = new Set(dbFiles.map((f) => f.rel_path));
  const currentSet = new Set(sourceFiles);
  const deletedFiles = dbFiles.filter((f) => !currentSet.has(f.rel_path));

  if (deletedFiles.length > 0) {
    for (const f of deletedFiles) {
      deleteFile(projectId, f.rel_path);
      removeFilePage(projectName, f.rel_path);
    }
    console.log(chalk.gray(`  Removed ${deletedFiles.length} deleted file(s)`));
  }

  // Phase 2: Parallel parse via worker pool
  const parseSpinner = ora(`Parsing ${sourceFiles.length} files...`).start();
  const pool = new FilePool();
  const parsedFiles: WorkerResult[] = [];
  const internalEdges: Array<{ from: string; to: string }> = [];

  pool.on('file:ready', (result: WorkerResult) => {
    parsedFiles.push(result);
    for (const imp of result.deps.internal) {
      internalEdges.push({ from: result.relPath, to: imp });
    }
    parseSpinner.text = `Parsing files... (${parsedFiles.length}/${sourceFiles.length})`;
  });

  await pool.processAll(
    sourceFiles.map((relPath) => ({ relPath, absFilePath: join(absPath, relPath) }))
  );
  await pool.terminate();
  parseSpinner.succeed(`Parsed ${chalk.bold(parsedFiles.length)} files`);

  // Phase 3: Separate changed vs unchanged, write to DB
  // Force re-index if: --force flag OR wiki.mdx is missing with no cached overview
  const wikiPath = join(getProjectContentPath(projectName), 'wiki.mdx');
  const wikiMissing = !existsSync(wikiPath);
  const cachedDocs = getProjectDocs(projectId);
  const forceReindex = options.force || (wikiMissing && !cachedDocs.overview);

  if (forceReindex && !options.force) {
    console.log(chalk.yellow('  wiki.mdx missing with no cache — forcing full re-index...'));
  }

  const changedFiles: WorkerResult[] = [];
  const unchangedPaths: string[] = [];

  for (const result of parsedFiles) {
    if (result.error) { unchangedPaths.push(result.relPath); continue; }

    const storedHash = getFileHash(projectId, result.relPath);
    const isNew = !dbPathSet.has(result.relPath);
    const isChanged = storedHash !== result.hash;

    if (forceReindex || isNew || isChanged) {
      const fileId = upsertFile(projectId, result.relPath, result.hash);
      upsertSymbols(fileId, (result.symbols as SymbolWithComment[]).map((s) => ({
        name: s.name, type: s.type,
        line_start: s.lineStart, line_end: s.lineEnd,
        signature: s.signature, doc_comment: s.docComment,
      })));
      changedFiles.push(result);
    } else {
      unchangedPaths.push(result.relPath);
    }
  }

  console.log(chalk.gray(
    `  ${chalk.bold(changedFiles.length)} changed · ${chalk.bold(unchangedPaths.length)} unchanged`
  ));

  // Phase 4: Concurrent LLM generation — 1 structured call per file, no nested limits
  if (changedFiles.length > 0) {
    const llmSpinner = ora(`Generating docs (${LLM_CONCURRENCY} concurrent)...`).start();
    let llmDone = 0;
    const limit = pLimit(LLM_CONCURRENCY);

    interface FileDocEntry {
      relPath: string;
      doc: FileDoc;
      symbols: SymbolWithComment[];
    }

    const fileDocResults: FileDocEntry[] = await Promise.all(
      changedFiles.map((file) =>
        limit(async (): Promise<FileDocEntry> => {
          const symbols = file.symbols as SymbolWithComment[];
          const doc = await generateFileDoc(
            { filePath: file.relPath, content: file.content, symbols, deps: file.deps },
            options.provider
          );
          llmDone++;
          llmSpinner.text = `Generating docs... (${llmDone}/${changedFiles.length})`;
          return { relPath: file.relPath, doc, symbols };
        })
      )
    );

    llmSpinner.succeed(`Generated docs for ${chalk.bold(changedFiles.length)} file(s)`);

    for (const { relPath, doc, symbols } of fileDocResults) {
      const symbolDocsMap: Record<string, string> = Object.fromEntries(
        doc.symbols.map((s) => [s.name, s.doc])
      );
      writeFilePage(projectName, relPath, doc.summary, symbols, symbolDocsMap, doc.title);
    }

    // Phase 5: Project overview (both calls run concurrently)
    const overviewSpinner = ora('Generating project overview...').start();
    const allProcessedPaths = [...changedFiles.map((f) => f.relPath), ...unchangedPaths];
    const fileSummaries = fileDocResults.map(({ relPath, doc }) => ({ relPath, summary: doc.summary }));

    const [overview, mermaid] = await Promise.all([
      generateProjectOverview({
        projectName, projectPath: absPath, fileSummaries,
        totalFiles: allProcessedPaths.length,
        totalSymbols: parsedFiles.reduce((n, f) => n + f.symbols.length, 0),
      }, options.provider),
      generateArchitectureMermaid(
        { projectName, internalDeps: internalEdges, fileGroups: {} },
        options.provider
      ),
    ]);

    writeProjectIndex(projectName, overview, mermaid);
    writeMetaJson(projectName, allProcessedPaths);
    updateProjectDocs(projectId, overview, mermaid);
    overviewSpinner.succeed('Project overview generated');
  } else {
    writeMetaJson(projectName, parsedFiles.map((f) => f.relPath));

    // Restore wiki.mdx from DB cache if missing (e.g. after ow setup --reset)
    if (!existsSync(wikiPath) && cachedDocs.overview) {
      writeProjectIndex(projectName, cachedDocs.overview, cachedDocs.mermaid ?? null);
      console.log(chalk.gray('  Restored project wiki from cache.'));
    }

    console.log(chalk.gray('  All files up to date, skipping LLM generation.'));
  }

  updateProjectLastIndexed(projectId);

  console.log(chalk.bold(`\n✓ Documentation ready!\n`));
  console.log(`  ${chalk.cyan(`http://localhost:8383/docs/${projectName}/wiki`)}`);
  console.log(chalk.gray(`\n  Run ${chalk.white('ow serve')} to start the docs server.\n`));
}

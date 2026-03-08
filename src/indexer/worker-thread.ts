/**
 * Worker thread: reads a source file, hashes it, parses it with tree-sitter,
 * and returns symbols + dependency info. Runs inside a Node.js Worker.
 */
import { parentPort } from 'worker_threads';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { detectLanguage, parseFile } from './parser.js';
import { extractSymbols } from './symbols.js';
import { attachComments } from './comments.js';
import { extractDependencies } from './deps.js';
import type { SymbolWithComment } from './comments.js';
import type { DependencyMap } from './deps.js';

export interface WorkerTask {
  id: number;
  relPath: string;
  absFilePath: string;
}

export interface WorkerResult {
  id: number;
  relPath: string;
  hash: string;
  lang: string | null;
  symbols: SymbolWithComment[];
  deps: DependencyMap;
  /** File content, capped at 100 KB to limit structured-clone overhead */
  content: string;
  error?: string;
}

if (!parentPort) throw new Error('worker-thread.ts must run inside a Worker');

parentPort.on('message', (task: WorkerTask) => {
  try {
    const rawContent = readFileSync(task.absFilePath, 'utf-8');
    // Cap content at 100 KB for inter-thread transfer
    const content = rawContent.length > 100_000 ? rawContent.slice(0, 100_000) : rawContent;
    const hash = createHash('sha256').update(rawContent).digest('hex');
    const lang = detectLanguage(task.relPath);

    if (!lang) {
      parentPort!.postMessage({
        id: task.id,
        relPath: task.relPath,
        hash,
        lang: null,
        symbols: [],
        deps: { internal: [], external: [] },
        content: '',
      } satisfies WorkerResult);
      return;
    }

    const tree = parseFile(content, lang);
    const rawSymbols = extractSymbols(tree, content, lang);
    const symbols = attachComments(tree, content, rawSymbols);
    const deps = extractDependencies(tree, lang);

    parentPort!.postMessage({
      id: task.id,
      relPath: task.relPath,
      hash,
      lang,
      symbols,
      deps,
      content,
    } satisfies WorkerResult);
  } catch (err: unknown) {
    parentPort!.postMessage({
      id: task.id,
      relPath: task.relPath,
      hash: '',
      lang: null,
      symbols: [],
      deps: { internal: [], external: [] },
      content: '',
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResult);
  }
});

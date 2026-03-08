import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './provider.js';
import type { SymbolWithComment } from '../indexer/comments.js';
import type { DependencyMap } from '../indexer/deps.js';

interface FileSummaryInput {
  filePath: string;
  content: string;
  symbols: SymbolWithComment[];
  deps: DependencyMap;
}

export async function generateFileSummary(
  input: FileSummaryInput,
  provider?: string
): Promise<string> {
  const symbolList = input.symbols
    .map((s) => `- ${s.type} \`${s.name}\` (line ${s.lineStart + 1})${s.docComment ? ': ' + s.docComment.split('\n')[0] : ''}`)
    .join('\n');

  const { text } = await generateText({
    model: getModel(provider),
    prompt: `You are a technical documentation writer. Analyze this source file and write a concise markdown summary.

File: ${input.filePath}
External dependencies: ${input.deps.external.join(', ') || 'none'}
Internal imports: ${input.deps.internal.join(', ') || 'none'}

Symbols defined:
${symbolList || '(none found)'}

File content (first 3000 chars):
\`\`\`
${input.content.slice(0, 3000)}
\`\`\`

Write a 2-4 sentence summary of what this file does, its purpose in the codebase, and any notable patterns. Be concise and technical. Output plain markdown (no headings).`,
  });

  return text;
}

interface SymbolDocInput {
  symbol: SymbolWithComment;
  fileContent: string;
  filePath: string;
}

export async function generateSymbolDoc(
  input: SymbolDocInput,
  provider?: string
): Promise<string> {
  const lines = input.fileContent.split('\n');
  // Extract a window of lines around the symbol
  const start = Math.max(0, input.symbol.lineStart - 2);
  const end = Math.min(lines.length, input.symbol.lineEnd + 3);
  const snippet = lines.slice(start, end).join('\n');

  const { text } = await generateText({
    model: getModel(provider),
    prompt: `Document this ${input.symbol.type} from ${input.filePath}.

\`\`\`
${snippet}
\`\`\`

${input.symbol.docComment ? `Existing doc comment: ${input.symbol.docComment}` : ''}

Write markdown documentation for this ${input.symbol.type} \`${input.symbol.name}\`. Include:
- What it does (1-2 sentences)
- Parameters/arguments if it's a function (use a markdown list)
- Return value if applicable
- Any important notes

Keep it concise. Output plain markdown.`,
  });

  return text;
}

// ── Single-call structured file documentation ─────────────────────────────────

const FileDocSchema = z.object({
  title: z.string().describe('Short human-readable sidebar title (2-5 words, no file extension). Examples: "SGD Optimizer", "NumPy Backend", "Tensor Operations", "Model Training Loop"'),
  summary: z.string().describe('2-4 sentence markdown summary of what this file does and its role'),
  symbols: z.array(z.object({
    name: z.string(),
    doc: z.string().describe('1-3 sentence markdown documentation for this symbol'),
  })).describe('Documentation for each top-level symbol listed'),
});

export type FileDoc = z.infer<typeof FileDocSchema>;

/**
 * Single structured LLM call that returns both the file summary and all
 * symbol docs in one shot — replaces the old generateFileSummary +
 * N×generateSymbolDoc pattern that caused a pLimit deadlock.
 */
const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);

function isTsJs(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return TS_EXTENSIONS.has(ext);
}

export async function generateFileDoc(
  input: FileSummaryInput,
  provider?: string
): Promise<FileDoc> {
  const topSymbols = input.symbols
    .filter((s) => s.type !== 'method')
    .slice(0, 10);

  const symbolList = topSymbols
    .map((s) => `- ${s.type} \`${s.name}\` (line ${s.lineStart + 1})${s.docComment ? ': ' + s.docComment.split('\n')[0] : ''}`)
    .join('\n');

  const isTypeScript = isTsJs(input.filePath);

  const twoslashInstructions = isTypeScript ? `
TWOSLASH CODE EXAMPLES (TypeScript/JavaScript only):
For functions, classes, and non-trivial types, append a short interactive Twoslash code example to the doc string. Rules:
- Open with \`\`\`ts twoslash
- Always put \`// @noErrors\` on the first line (prevents build failures)
- Before \`// ---cut---\`: use \`declare\` statements to set up types/functions (never import real modules)
- After \`// ---cut---\`: show 1-3 lines of usage
- Use \`//    ^?\` under a variable to reveal its inferred type (align the ^ under the variable name)
- Use \`//   ^^^\` under an identifier to highlight it
- Keep the visible section (after ---cut---) to 1-3 lines
- Only add an example if it meaningfully shows types or usage — skip for simple constants, re-exports, or trivial getters

Example for a function returning a union type:
\`\`\`ts twoslash
// @noErrors
declare function getUser(id: string): { name: string; role: 'admin' | 'user' } | null;
// ---cut---
const user = getUser('123');
//    ^?
\`\`\`
` : '';

  const { object } = await generateObject({
    model: getModel(provider),
    schema: FileDocSchema,
    prompt: `Document this source file and its top-level symbols.

File: ${input.filePath}
External deps: ${input.deps.external.join(', ') || 'none'}
Internal imports: ${input.deps.internal.join(', ') || 'none'}

Symbols to document:
${symbolList || '(none)'}

File content (first 4000 chars):
\`\`\`
${input.content.slice(0, 4000)}
\`\`\`
${twoslashInstructions}
Return:
- title: short human-readable sidebar label (2-5 words, no extension, e.g. "SGD Optimizer" not "optimizers.py")
- summary: 2-4 sentence description of the file's purpose, responsibilities, and role in the codebase
- symbols: for each symbol, 1-3 sentences of prose covering what it does, parameters, and return value${isTypeScript ? ', optionally followed by a Twoslash code block as described above' : ''}`,
  });

  return object;
}

interface ProjectOverviewInput {
  projectName: string;
  projectPath: string;
  fileSummaries: Array<{ relPath: string; summary: string }>;
  totalFiles: number;
  totalSymbols: number;
}

export async function generateProjectOverview(
  input: ProjectOverviewInput,
  provider?: string
): Promise<string> {
  const summarySnippet = input.fileSummaries
    .slice(0, 20) // limit context
    .map((f) => `**${f.relPath}**: ${f.summary}`)
    .join('\n\n');

  const { text } = await generateText({
    model: getModel(provider),
    prompt: `You are writing an overview for a codebase documentation wiki.

Project: ${input.projectName}
Path: ${input.projectPath}
Files indexed: ${input.totalFiles}
Symbols extracted: ${input.totalSymbols}

File summaries:
${summarySnippet}

Write a 3-5 paragraph project overview in markdown covering:
1. What this project is and its primary purpose
2. Key architectural patterns observed
3. Main modules/files and their roles

Be technical and precise. Use markdown formatting with headers.`,
  });

  return text;
}

interface ArchitectureMermaidInput {
  projectName: string;
  internalDeps: Array<{ from: string; to: string }>;  // file-to-file edges
  fileGroups: Record<string, string[]>;  // group label → file paths
}

export async function generateArchitectureMermaid(
  input: ArchitectureMermaidInput,
  provider?: string
): Promise<string> {
  const edgeList = input.internalDeps
    .slice(0, 30)
    .map((e) => `${e.from} → ${e.to}`)
    .join('\n');

  const { text } = await generateText({
    model: getModel(provider),
    prompt: `Generate a Mermaid flowchart diagram showing the architecture of the "${input.projectName}" project.

Internal dependencies (file → file):
${edgeList || '(no internal dependencies detected)'}

Rules:
- Use \`graph TD\` direction
- Group related files using subgraphs where appropriate
- Use short node labels (basename only, no extensions)
- Only include the most important relationships
- Output ONLY the mermaid code block, no explanation

Example format:
\`\`\`mermaid
graph TD
  subgraph Core
    A[parser] --> B[symbols]
  end
\`\`\``,
  });

  // Extract just the mermaid block content
  const match = text.match(/```mermaid\n([\s\S]+?)```/);
  return match ? match[1].trim() : text.trim();
}

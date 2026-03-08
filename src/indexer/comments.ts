import type { ExtractedSymbol } from './symbols.js';

export interface SymbolWithComment extends ExtractedSymbol {
  docComment: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function attachComments(tree: any, source: string, symbols: ExtractedSymbol[]): SymbolWithComment[] {
  const lines = source.split('\n');

  return symbols.map((sym) => {
    const docComment = extractCommentBefore(lines, sym.lineStart);
    return { ...sym, docComment };
  });
}

function extractCommentBefore(lines: string[], lineIndex: number): string | null {
  const commentLines: string[] = [];
  let i = lineIndex - 1;

  // Skip blank lines immediately before
  while (i >= 0 && lines[i].trim() === '') i--;

  if (i < 0) return null;

  const line = lines[i].trim();

  // Single-line comment
  if (line.startsWith('//') || line.startsWith('#')) {
    // Walk up consecutive single-line comments
    while (i >= 0 && (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('#'))) {
      commentLines.unshift(
        lines[i].trim().replace(/^\/\/\s?/, '').replace(/^#\s?/, '')
      );
      i--;
    }
    return commentLines.join('\n').trim() || null;
  }

  // JSDoc block comment ending at line i
  if (line.endsWith('*/')) {
    const endIdx = i;
    while (i >= 0 && !lines[i].trim().startsWith('/*')) i--;
    if (i < 0) return null;
    const block = lines.slice(i, endIdx + 1).join('\n');
    return cleanJsDoc(block);
  }

  // Python docstring (triple quotes) — handled by checking the first child of the body
  // We already extract these as part of the symbol extraction; skip here.
  return null;
}

function cleanJsDoc(raw: string): string {
  return raw
    .replace(/\/\*\*?\s*/g, '')
    .replace(/\s*\*\//g, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim();
}

// For Python: extract the docstring from the first statement of a function/class body
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPythonDocstring(node: any): string | null {
  // node is a function_definition or class_definition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = node.childForFieldName?.('body') as any;
  if (!body) return null;

  const firstStmt = body.firstChild;
  if (!firstStmt) return null;

  // expression_statement containing a string
  if (firstStmt.type === 'expression_statement') {
    const expr = firstStmt.firstChild;
    if (expr?.type === 'string') {
      return expr.text.replace(/^["']{3}|["']{3}$/g, '').trim();
    }
  }
  return null;
}

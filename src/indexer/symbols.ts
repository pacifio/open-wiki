import { createRequire } from 'module';
import type { SupportedLanguage } from './parser.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Parser = require('tree-sitter') as any;

export interface ExtractedSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method';
  lineStart: number;
  lineEnd: number;
  signature: string;
}

// Tree-sitter S-expression queries per language
const JS_TS_QUERY = `
  (function_declaration name: (identifier) @name) @symbol
  (class_declaration name: (identifier) @name) @symbol
  (method_definition name: (property_identifier) @name) @symbol
  (export_statement declaration: (function_declaration name: (identifier) @name)) @symbol
  (export_statement declaration: (class_declaration name: (identifier) @name)) @symbol
  (lexical_declaration (variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)])) @symbol
`;

const TS_EXTRA_QUERY = `
  (interface_declaration name: (type_identifier) @name) @symbol
  (type_alias_declaration name: (type_identifier) @name) @symbol
  (export_statement declaration: (interface_declaration name: (type_identifier) @name)) @symbol
  (export_statement declaration: (type_alias_declaration name: (type_identifier) @name)) @symbol
`;

const PYTHON_QUERY = `
  (function_definition name: (identifier) @name) @symbol
  (class_definition name: (identifier) @name) @symbol
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLanguageGrammar(lang: SupportedLanguage): any {
  switch (lang) {
    case 'javascript':
      return require('tree-sitter-javascript');
    case 'typescript':
      return require('tree-sitter-typescript').typescript;
    case 'tsx':
      return require('tree-sitter-typescript').tsx;
    case 'python':
      return require('tree-sitter-python');
  }
}

function getQueryString(lang: SupportedLanguage): string {
  if (lang === 'python') return PYTHON_QUERY;
  if (lang === 'typescript' || lang === 'tsx') return JS_TS_QUERY + TS_EXTRA_QUERY;
  return JS_TS_QUERY;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferType(node: any, lang: SupportedLanguage): ExtractedSymbol['type'] {
  const nodeType: string = node.type;
  if (nodeType === 'function_declaration' || nodeType === 'arrow_function' || nodeType === 'function_expression') return 'function';
  if (nodeType === 'class_declaration') return 'class';
  if (nodeType === 'interface_declaration') return 'interface';
  if (nodeType === 'type_alias_declaration') return 'type';
  if (nodeType === 'method_definition') return 'method';
  if (nodeType === 'function_definition' && lang === 'python') return 'function';
  if (nodeType === 'class_definition' && lang === 'python') return 'class';
  if (nodeType === 'lexical_declaration') return 'variable';
  if (nodeType === 'export_statement') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decl = node.childForFieldName?.('declaration') as any;
    if (decl) return inferType(decl, lang);
  }
  return 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSymbols(tree: any, source: string, lang: SupportedLanguage): ExtractedSymbol[] {
  const grammar = getLanguageGrammar(lang);
  const queryStr = getQueryString(lang);

  let query;
  try {
    query = new Parser.Query(grammar, queryStr);
  } catch {
    return [];
  }

  const lines = source.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: any[] = query.matches(tree.rootNode);
  const seen = new Set<string>();
  const symbols: ExtractedSymbol[] = [];

  for (const match of matches) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameCapture = match.captures.find((c: any) => c.name === 'name');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const symbolCapture = match.captures.find((c: any) => c.name === 'symbol');
    if (!nameCapture || !symbolCapture) continue;

    const name: string = nameCapture.node.text;
    const symbolNode = symbolCapture.node;
    const lineStart: number = symbolNode.startPosition.row;
    const lineEnd: number = symbolNode.endPosition.row;

    // Deduplicate by name + line
    const key = `${name}:${lineStart}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Extract signature: first line of the symbol node
    const signature = lines[lineStart]?.trim() ?? '';

    symbols.push({
      name,
      type: inferType(symbolNode, lang),
      lineStart,
      lineEnd,
      signature,
    });
  }

  return symbols;
}

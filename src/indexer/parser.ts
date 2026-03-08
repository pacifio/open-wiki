import { extname } from 'path';
// tree-sitter uses CommonJS requires; we import via createRequire
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Parser = require('tree-sitter') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JavaScript = require('tree-sitter-javascript') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypeScript = require('tree-sitter-typescript').typescript as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSX = require('tree-sitter-typescript').tsx as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Python = require('tree-sitter-python') as any;

export type SupportedLanguage = 'javascript' | 'typescript' | 'tsx' | 'python';

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.py':
      return 'python';
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parserCache = new Map<SupportedLanguage, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getParser(lang: SupportedLanguage): any {
  if (parserCache.has(lang)) return parserCache.get(lang)!;

  const parser = new Parser();
  switch (lang) {
    case 'javascript':
      parser.setLanguage(JavaScript);
      break;
    case 'typescript':
      parser.setLanguage(TypeScript);
      break;
    case 'tsx':
      parser.setLanguage(TSX);
      break;
    case 'python':
      parser.setLanguage(Python);
      break;
  }
  parserCache.set(lang, parser);
  return parser;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFile(content: string, lang: SupportedLanguage): any {
  return getParser(lang).parse(content);
}

import { createRequire } from 'module';
import type { SupportedLanguage } from './parser.js';

const require = createRequire(import.meta.url);

export interface DependencyMap {
  internal: string[];   // relative import paths
  external: string[];   // package names
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractDependencies(tree: any, lang: SupportedLanguage): DependencyMap {
  if (lang === 'python') return extractPythonDeps(tree);
  return extractJsTsDeps(tree);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJsTsDeps(tree: any): DependencyMap {
  const internal: string[] = [];
  const external: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visit(node: any): void {
    if (
      node.type === 'import_statement' ||
      node.type === 'export_statement'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source = node.childForFieldName?.('source') as any;
      if (source?.type === 'string') {
        const path = source.text.replace(/['"]/g, '');
        if (path.startsWith('.')) {
          internal.push(path);
        } else {
          // Package name is up to the first /
          const pkg = path.startsWith('@')
            ? path.split('/').slice(0, 2).join('/')
            : path.split('/')[0];
          if (pkg && !external.includes(pkg)) external.push(pkg);
        }
      }
    }

    // require() calls
    if (
      node.type === 'call_expression' &&
      node.firstChild?.text === 'require'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = node.childForFieldName?.('arguments') as any;
      const firstArg = args?.firstChild?.nextSibling;
      if (firstArg?.type === 'string') {
        const path = firstArg.text.replace(/['"]/g, '');
        if (path.startsWith('.')) {
          internal.push(path);
        } else {
          const pkg = path.startsWith('@')
            ? path.split('/').slice(0, 2).join('/')
            : path.split('/')[0];
          if (pkg && !external.includes(pkg)) external.push(pkg);
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  visit(tree.rootNode);
  return { internal: [...new Set(internal)], external };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPythonDeps(tree: any): DependencyMap {
  const internal: string[] = [];
  const external: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function visit(node: any): void {
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moduleName = node.childForFieldName?.('name') as any;
      const text: string = moduleName?.text ?? '';

      if (node.type === 'import_from_statement') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const moduleField = node.childForFieldName?.('module_name') as any;
        const moduleText: string = moduleField?.text ?? '';
        if (moduleText.startsWith('.')) {
          internal.push(moduleText);
        } else if (moduleText && !external.includes(moduleText.split('.')[0])) {
          external.push(moduleText.split('.')[0]);
        }
      } else if (text && !external.includes(text.split('.')[0])) {
        external.push(text.split('.')[0]);
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  visit(tree.rootNode);
  return { internal: [...new Set(internal)], external: [...new Set(external)] };
}

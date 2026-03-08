import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { getProjectContentPath } from '../storage/paths.js';
import type { SymbolWithComment } from '../indexer/comments.js';

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Escape { and } in LLM-generated text so MDX doesn't treat them as JSX expressions.
 * Skips content inside code spans and code fences.
 */
function escapeMdxText(text: string): string {
  // Split on code spans and code fences, only escape text parts
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // Inside code span/fence — leave as-is
    return part.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }).join('');
}

/** Normalize a relative file path to a safe MDX filename */
export function toMdxFilename(relPath: string): string {
  return relPath.replace(/\//g, '__').replace(/\.[^.]+$/, '') + '.mdx';
}

/** Write the project index page (overview + architecture mermaid) */
export function writeProjectIndex(
  projectName: string,
  overview: string,
  mermaidDiagram: string | null
): void {
  const dir = getProjectContentPath(projectName);
  ensureDir(dir);

  const mermaidSection = mermaidDiagram
    ? `\n## Architecture\n\n\`\`\`mermaid\n${mermaidDiagram}\n\`\`\`\n`
    : '';

  const content = `---
title: ${projectName}
description: Auto-generated documentation for ${projectName}
---

${escapeMdxText(overview)}
${mermaidSection}`;

  writeFileSync(join(dir, 'wiki.mdx'), content, 'utf-8');
}

/** Write a per-file documentation page */
export function writeFilePage(
  projectName: string,
  relPath: string,
  summary: string,
  symbols: SymbolWithComment[],
  symbolDocs: Record<string, string>,  // symbol name → generated doc
  pageTitle?: string
): void {
  const dir = getProjectContentPath(projectName);
  ensureDir(dir);

  const title = pageTitle ?? basename(relPath);
  const fileExt = extname(relPath).slice(1);
  const safeSummary = escapeMdxText(summary);

  const symbolsSection = symbols.length > 0
    ? `\n## Symbols\n\n` + symbols.map((s) => {
        const doc = escapeMdxText(symbolDocs[s.name] ?? '');
        return `### \`${s.name}\` <span style={{color:'var(--fd-muted-foreground)',fontSize:'0.8em'}}>${s.type}</span>\n\n` +
          (doc ? doc + '\n\n' : '') +
          `**Defined at:** line ${s.lineStart + 1}\n\n` +
          `\`\`\`${fileExt}\n${s.signature}\n\`\`\``;
      }).join('\n\n---\n\n')
    : '';

  const content = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${safeSummary.split('\n')[0].slice(0, 120).replace(/"/g, '\\"')}"
---

## Overview

${safeSummary}
${symbolsSection}`;

  const mdxFilename = toMdxFilename(relPath);
  writeFileSync(join(dir, mdxFilename), content, 'utf-8');
}

/** Write meta.json for fumadocs sidebar */
export function writeMetaJson(
  projectName: string,
  relPaths: string[]
): void {
  const dir = getProjectContentPath(projectName);
  ensureDir(dir);

  const pages = [
    'wiki',
    ...relPaths.map((p) => toMdxFilename(p).replace('.mdx', '')),
  ];

  const meta = {
    title: projectName,
    pages,
  };

  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

/** Remove an MDX file when a source file is deleted */
export function removeFilePage(projectName: string, relPath: string): void {
  const dir = getProjectContentPath(projectName);
  const mdxFilename = toMdxFilename(relPath);
  const fullPath = join(dir, mdxFilename);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
}

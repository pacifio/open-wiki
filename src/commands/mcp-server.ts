import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { CONTENT_PATH } from '../storage/paths.js';
import { getAllProjects, getProject, getProjectFiles, getProjectSymbols, getProjectStats } from '../storage/db.js';

function readMdxFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

function relPathToMdxFilename(relPath: string): string {
  return relPath.replace(/\//g, '__').replace(/\.[^.]+$/, '') + '.mdx';
}

export async function runMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'open-wiki',
    version: '1.0.0',
  });

  // list_projects — returns all indexed projects
  server.tool(
    'list_projects',
    'List all projects indexed by open-wiki with stats',
    {},
    async () => {
      const projects = getAllProjects();
      if (projects.length === 0) {
        return { content: [{ type: 'text', text: 'No projects indexed yet. Run `ow <path>` to index a codebase.' }] };
      }
      const rows = projects.map((p) => {
        const stats = getProjectStats(p.id);
        const lastIndexed = p.last_indexed ? new Date(p.last_indexed).toISOString() : 'never';
        return `- **${p.name}** (${p.path})\n  Files: ${stats.fileCount}, Symbols: ${stats.symbolCount}, Last indexed: ${lastIndexed}`;
      });
      return { content: [{ type: 'text', text: rows.join('\n') }] };
    }
  );

  // get_project_overview — returns the wiki overview MDX for a project
  server.tool(
    'get_project_overview',
    'Get the overview documentation (architecture, summary, mermaid diagram) for an indexed project',
    { project: z.string().describe('The project name (as shown by list_projects)') },
    async ({ project }) => {
      const p = getProject(project);
      if (!p) {
        return { content: [{ type: 'text', text: `Project "${project}" not found. Run list_projects to see available projects.` }] };
      }
      const mdxPath = join(CONTENT_PATH, project, 'index.mdx');
      const content = readMdxFile(mdxPath);
      if (!content) {
        return { content: [{ type: 'text', text: `No overview found for "${project}". Try re-indexing with \`ow ${p.path}\`.` }] };
      }
      return { content: [{ type: 'text', text: content }] };
    }
  );

  // get_file_doc — returns the MDX documentation for a specific file
  server.tool(
    'get_file_doc',
    'Get the documentation for a specific file in an indexed project',
    {
      project: z.string().describe('The project name'),
      file: z.string().describe('The relative file path (e.g. src/utils/parser.ts)'),
    },
    async ({ project, file }) => {
      const p = getProject(project);
      if (!p) {
        return { content: [{ type: 'text', text: `Project "${project}" not found.` }] };
      }
      const mdxFilename = relPathToMdxFilename(file);
      const mdxPath = join(CONTENT_PATH, project, mdxFilename);
      const content = readMdxFile(mdxPath);
      if (!content) {
        return { content: [{ type: 'text', text: `No documentation found for "${file}" in project "${project}".` }] };
      }
      return { content: [{ type: 'text', text: content }] };
    }
  );

  // search_docs — full-text search across all MDX files for a project
  server.tool(
    'search_docs',
    'Search documentation content for a project by keyword or phrase',
    {
      project: z.string().describe('The project name'),
      query: z.string().describe('The search query'),
    },
    async ({ project, query }) => {
      const p = getProject(project);
      if (!p) {
        return { content: [{ type: 'text', text: `Project "${project}" not found.` }] };
      }
      const projectDir = join(CONTENT_PATH, project);
      if (!existsSync(projectDir)) {
        return { content: [{ type: 'text', text: `No docs found for "${project}".` }] };
      }

      const mdxFiles = readdirSync(projectDir).filter((f) => f.endsWith('.mdx'));
      const lowerQuery = query.toLowerCase();
      const results: string[] = [];

      for (const filename of mdxFiles) {
        const filePath = join(projectDir, filename);
        const text = readFileSync(filePath, 'utf-8');
        const lines = text.split('\n');
        const matches: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length - 1, i + 1);
            matches.push(`  Line ${i + 1}: ${lines.slice(start, end + 1).join(' | ').trim()}`);
          }
        }
        if (matches.length > 0) {
          results.push(`**${filename}**:\n${matches.slice(0, 5).join('\n')}`);
        }
      }

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found for "${query}" in project "${project}".` }] };
      }
      return { content: [{ type: 'text', text: results.join('\n\n') }] };
    }
  );

  // get_symbols — returns all symbols for a file or entire project
  server.tool(
    'get_symbols',
    'Get all symbols (functions, classes, interfaces) for a file or entire project',
    {
      project: z.string().describe('The project name'),
      file: z.string().optional().describe('Optional: relative file path to filter by (e.g. src/parser.ts)'),
    },
    async ({ project, file }) => {
      const p = getProject(project);
      if (!p) {
        return { content: [{ type: 'text', text: `Project "${project}" not found.` }] };
      }
      const symbols = getProjectSymbols(project, file);
      if (symbols.length === 0) {
        const scope = file ? `file "${file}"` : `project "${project}"`;
        return { content: [{ type: 'text', text: `No symbols found for ${scope}.` }] };
      }
      const rows = symbols.map((s) => {
        const location = s.line_start ? `:${s.line_start}` : '';
        const sig = s.signature ? ` — \`${s.signature}\`` : '';
        const rel = (s as { rel_path?: string }).rel_path ? ` [${(s as { rel_path?: string }).rel_path}]` : '';
        return `- **${s.name}** (${s.type})${rel}${location}${sig}`;
      });
      return { content: [{ type: 'text', text: rows.join('\n') }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

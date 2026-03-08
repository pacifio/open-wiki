#!/usr/bin/env node
import { Command } from 'commander';
import { configSetKey, configList, configSetDefault } from './commands/config.js';
import { serve } from './commands/serve.js';
import { listProjects } from './commands/list.js';
import { indexProject } from './commands/index-cmd.js';
import { resetSetup } from './storage/setup.js';

const program = new Command();

program
  .name('ow')
  .description('Open Wiki — index and document any codebase with LLMs')
  .version('0.1.0');

// ow [path] — index a project
program
  .argument('[path]', 'Path to the project to index (defaults to current directory)', '.')
  .option('-p, --provider <provider>', 'LLM provider to use (anthropic, openai, google)')
  .option('--name <name>', 'Override project name (defaults to directory name)')
  .option('--force', 'Force re-indexing of all files regardless of changes')
  .action(async (projectPath: string, options: { provider?: string; name?: string; force?: boolean }) => {
    await indexProject(projectPath, options);
  });

// ow config
const config = program.command('config').description('Manage configuration');

config
  .command('set-key <provider> <key>')
  .description('Set an API key for a provider (anthropic, openai, google, etc.)')
  .action((provider: string, key: string) => {
    configSetKey(provider, key);
  });

config
  .command('list')
  .description('List configured providers')
  .action(() => {
    configList();
  });

config
  .command('set-default <provider>')
  .description('Set the default LLM provider')
  .action((provider: string) => {
    configSetDefault(provider);
  });

// ow serve
program
  .command('serve')
  .description('Start the open-wiki docs server')
  .option('-p, --port <port>', 'Port to listen on', '8383')
  .action(async (options: { port: string }) => {
    await serve(parseInt(options.port, 10));
  });

// ow list
program
  .command('list')
  .description('List all indexed projects')
  .action(() => {
    listProjects();
  });

// ow setup --reset
program
  .command('setup')
  .description('Set up or re-install the open-wiki app')
  .option('--reset', 'Tear down and reinstall the fumadocs app from scratch')
  .action(async (options: { reset?: boolean }) => {
    const { setupFumadocs } = await import('./storage/setup.js');
    await setupFumadocs(options.reset);
  });

// ow mcp
const mcp = program.command('mcp').description('MCP server for coding agents');

mcp
  .command('install')
  .description('Register open-wiki with Claude Code (~/.claude/settings.json)')
  .action(async () => {
    const { installMcp } = await import('./commands/mcp-install.js');
    installMcp();
  });

mcp
  .action(async () => {
    const { runMcpServer } = await import('./commands/mcp-server.js');
    await runMcpServer();
  });

program.parse();

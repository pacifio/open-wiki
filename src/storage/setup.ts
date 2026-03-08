import { existsSync, cpSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { execSync, spawnSync } from 'child_process';
import ora from 'ora';
import chalk from 'chalk';
import { FUMADOCS_PATH } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
// template/ is three levels up from dist/storage/ at runtime
const TEMPLATE_DIR = resolve(dirname(__filename), '../../template');

// ── Version constants ─────────────────────────────────────────────────────────
// Single source of truth for fumadocs app dependencies.
// fumadocs-ui v15+ has full Tailwind v4 support; v14 required Tailwind v3.
// Update these constants to upgrade — no other files need changing.
const APP_DEPS: Record<string, string> = {
  '@ai-sdk/anthropic': '^3.0.0',
  '@ai-sdk/google': '^3.0.0',
  '@ai-sdk/openai': '^3.0.0',
  '@ai-sdk/react': '^3.0.0',
  '@radix-ui/react-presence': '^1.1.0',
  'ai': '^6.0.0',
  'better-sqlite3': '^9.6.0',
  'class-variance-authority': '^0.7.0',
  'date-fns': '^3.6.0',
  'fumadocs-core': '^15.0.0',
  'fumadocs-mdx': '^11.1.0',
  'fumadocs-twoslash': '^3.0.0',
  'fumadocs-ui': '^15.0.0',
  'twoslash': '^0.3.0',
  'hast-util-to-jsx-runtime': '^2.3.0',
  'lucide-react': '^0.500.0',
  'mermaid': '^11.0.0',
  'next-themes': '^0.4.0',
  'next': '^15.0.0',
  'react': '^19.0.0',
  'react-dom': '^19.0.0',
  'remark': '^15.0.0',
  'remark-gfm': '^4.0.0',
  'remark-rehype': '^11.0.0',
  'tailwind-merge': '^3.0.0',
  'zod': '^4.0.0',
};

const APP_DEV_DEPS: Record<string, string> = {
  '@tailwindcss/postcss': '^4.0.0',
  '@types/better-sqlite3': '^7.6.10',
  '@types/node': '^20.0.0',
  '@types/react': '^19.0.0',
  '@types/react-dom': '^19.0.0',
  'tailwindcss': '^4.0.0',
  'typescript': '^5.4.0',
  'unist-util-visit': '^5.0.0',
};

const READY_MARKER = join(FUMADOCS_PATH, '.ow-ready');

/** True only when the fumadocs app has been fully installed */
export function isFumadocsReady(): boolean {
  return existsSync(READY_MARKER);
}

/** Tear down the installed fumadocs app */
export function resetSetup(): void {
  if (existsSync(FUMADOCS_PATH)) {
    execSync(`rm -rf "${FUMADOCS_PATH}"`);
    console.log(chalk.green('✓ open-wiki app reset. Run `ow setup` or `ow <path>` to reinstall.'));
  } else {
    console.log(chalk.yellow('Nothing to reset — open-wiki app not installed.'));
  }
}


export async function setupFumadocs(forceReset = false): Promise<void> {
  if (forceReset && existsSync(FUMADOCS_PATH)) {
    execSync(`rm -rf "${FUMADOCS_PATH}"`);
  }

  if (isFumadocsReady()) return;

  const spinner = ora('Setting up open-wiki app...').start();

  if (!existsSync(TEMPLATE_DIR)) {
    spinner.fail('Template directory not found. Reinstall open-wiki.');
    process.exit(1);
  }

  // Copy template files — package.json is written below with CLI-managed versions
  cpSync(TEMPLATE_DIR, FUMADOCS_PATH, {
    recursive: true,
    filter: (src) => !src.endsWith('package.json'),
  });

  // Write package.json from CLI-managed version constants
  writeFileSync(
    join(FUMADOCS_PATH, 'package.json'),
    JSON.stringify(
      {
        name: 'open-wiki-app',
        version: '0.1.0',
        private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: APP_DEPS,
        devDependencies: APP_DEV_DEPS,
      },
      null,
      2
    ),
    'utf-8'
  );

  spinner.text = 'Installing dependencies (this may take a minute)...';

  const result = spawnSync('npm', ['install', '--legacy-peer-deps'], {
    cwd: FUMADOCS_PATH,
    stdio: 'pipe',
    shell: true,
  });

  if (result.status !== 0) {
    spinner.fail('Failed to install fumadocs dependencies.');
    console.error(chalk.red(result.stderr?.toString()));
    process.exit(1);
  }

  // Write ready marker — subsequent runs skip setup entirely
  writeFileSync(READY_MARKER, new Date().toISOString(), 'utf-8');
  spinner.succeed('open-wiki app ready');
}

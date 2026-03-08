import { spawn } from 'child_process';
import chalk from 'chalk';
import { FUMADOCS_PATH } from '../storage/paths.js';
import { isFumadocsReady, setupFumadocs } from '../storage/setup.js';

export async function serve(port = 8383): Promise<void> {
  if (!isFumadocsReady()) {
    // Auto-setup on first `ow serve` even if user hasn't indexed yet
    await setupFumadocs();
  }

  console.log(chalk.bold(`\nStarting open-wiki at ${chalk.cyan(`http://localhost:${port}`)}\n`));

  const child = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd: FUMADOCS_PATH,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error(chalk.red(`Failed to start server: ${err.message}`));
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
}

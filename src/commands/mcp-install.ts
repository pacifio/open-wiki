import { execSync } from 'child_process';
import chalk from 'chalk';

export function installMcp(): void {
  // Resolve the absolute path to `ow` so Claude Code finds it regardless of PATH
  let owPath = 'ow';
  try {
    owPath = execSync('which ow', { encoding: 'utf-8' }).trim();
  } catch {
    // fallback — user may need to ensure ow is on PATH
  }

  // Use the official `claude mcp add` command (Claude Code CLI)
  try {
    execSync(
      `claude mcp add --transport stdio open-wiki -- ${owPath} mcp`,
      { stdio: 'pipe' }
    );
    console.log(chalk.green('✓ open-wiki MCP server registered with Claude Code.'));
    console.log(chalk.dim(`  Command: ${owPath} mcp`));
    console.log(chalk.dim('  Run /mcp in Claude Code to verify.'));
  } catch (err) {
    const msg = (err as { stderr?: Buffer }).stderr?.toString().trim();
    if (msg?.includes('already exists')) {
      // Already registered — update it
      execSync(
        `claude mcp remove open-wiki && claude mcp add --transport stdio open-wiki -- ${owPath} mcp`,
        { stdio: 'pipe' }
      );
      console.log(chalk.green('✓ open-wiki MCP server updated in Claude Code.'));
    } else {
      console.error(chalk.red('Failed to register MCP server:'), msg || err);
      process.exit(1);
    }
  }
}

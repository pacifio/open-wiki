import chalk from 'chalk';
import { setApiKey, readConfig, setDefaultProvider } from '../storage/config.js';

export function configSetKey(provider: string, key: string): void {
  setApiKey(provider, key);
  console.log(chalk.green(`✓ API key set for provider: ${chalk.bold(provider)}`));
}

export function configList(): void {
  const config = readConfig();
  const providers = Object.keys(config.providers);

  if (providers.length === 0) {
    console.log(chalk.yellow('No API keys configured. Use: ow config set-key <provider> <key>'));
    return;
  }

  console.log(chalk.bold('\nConfigured providers:'));
  for (const provider of providers) {
    const key = config.providers[provider]!;
    const masked = key.slice(0, 8) + '...' + key.slice(-4);
    const isDefault = provider === config.defaultProvider;
    console.log(
      `  ${chalk.cyan(provider)}  ${chalk.gray(masked)}${isDefault ? chalk.green('  (default)') : ''}`
    );
  }
  console.log();
}

export function configSetDefault(provider: string): void {
  const config = readConfig();
  if (!config.providers[provider]) {
    console.error(chalk.red(`No API key found for provider: ${provider}`));
    console.error(chalk.gray(`Run: ow config set-key ${provider} <key>`));
    process.exit(1);
  }
  setDefaultProvider(provider);
  console.log(chalk.green(`✓ Default provider set to: ${chalk.bold(provider)}`));
}

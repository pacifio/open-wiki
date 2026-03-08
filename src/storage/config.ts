import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CONFIG_PATH, ensureOwHome } from './paths.js';

export interface OWConfig {
  providers: Partial<Record<string, string>>;
  defaultProvider: string;
}

const DEFAULT_CONFIG: OWConfig = {
  providers: {},
  defaultProvider: 'anthropic',
};

export function readConfig(): OWConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as OWConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: OWConfig): void {
  ensureOwHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function setApiKey(provider: string, key: string): void {
  const config = readConfig();
  config.providers[provider] = key;
  if (Object.keys(config.providers).length === 1) {
    config.defaultProvider = provider;
  }
  writeConfig(config);
}

export function getApiKey(provider?: string): string | undefined {
  const config = readConfig();
  const p = provider ?? config.defaultProvider;
  return config.providers[p];
}

export function getDefaultProvider(): string {
  return readConfig().defaultProvider;
}

export function setDefaultProvider(provider: string): void {
  const config = readConfig();
  config.defaultProvider = provider;
  writeConfig(config);
}

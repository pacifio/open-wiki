import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { readConfig, getDefaultProvider } from '../storage/config.js';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
};

/** Check early (before any parsing) that a provider key is configured. */
export function checkProviderReady(providerOverride?: string): void {
  const config = readConfig();
  const provider = providerOverride ?? config.defaultProvider ?? 'anthropic';
  if (!config.providers[provider]) {
    console.error(
      `\nNo API key configured for "${provider}".\n` +
      `Run: ow config set-key ${provider} <key>\n`
    );
    process.exit(1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getModel(providerOverride?: string): any {
  const config = readConfig();
  const provider = providerOverride ?? config.defaultProvider ?? 'anthropic';
  const key = config.providers[provider];

  if (!key) {
    throw new Error(
      `No API key configured for provider "${provider}". Run: ow config set-key ${provider} <key>`
    );
  }

  const modelId = DEFAULT_MODELS[provider] ?? DEFAULT_MODELS['anthropic'];

  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: key })(modelId);
    case 'openai':
      return createOpenAI({ apiKey: key })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: key })(modelId);
    default:
      // Fallback to anthropic
      return createAnthropic({ apiKey: key })(DEFAULT_MODELS['anthropic']);
  }
}

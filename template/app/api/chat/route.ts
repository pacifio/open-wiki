import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { convertToModelMessages, streamText } from 'ai';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const OW_HOME = join(homedir(), '.ow');
const CONFIG_PATH = join(OW_HOME, 'config.json');
const CONTENT_PATH = join(OW_HOME, 'fumadocs', 'content', 'docs');

function getDocsContext(): string {
  if (!existsSync(CONTENT_PATH)) return '';
  const texts: string[] = [];
  function readDir(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) readDir(join(dir, e.name));
      else if (e.name.endsWith('.mdx')) {
        texts.push(readFileSync(join(dir, e.name), 'utf-8'));
      }
    }
  }
  readDir(CONTENT_PATH);
  // Limit context to avoid exceeding model context windows
  return texts.join('\n\n---\n\n').slice(0, 80_000);
}

export async function POST(req: Request) {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return Response.json(
      { error: 'No AI config found. Run `ow config set-key <provider> <key>`.' },
      { status: 500 },
    );
  }

  const providers = (config.providers ?? {}) as Record<string, string>;
  const defaultProvider = (config.defaultProvider as string) ?? 'anthropic';
  const apiKey = providers[defaultProvider];

  if (!apiKey) {
    return Response.json(
      { error: `No API key for "${defaultProvider}". Run \`ow config set-key ${defaultProvider} <key>\`.` },
      { status: 500 },
    );
  }

  let model;
  switch (defaultProvider) {
    case 'anthropic':
      model = createAnthropic({ apiKey })('claude-sonnet-4-6');
      break;
    case 'openai':
      model = createOpenAI({ apiKey })('gpt-4o');
      break;
    case 'google':
      model = createGoogleGenerativeAI({ apiKey })('gemini-2.0-flash');
      break;
    default:
      return Response.json({ error: `Unknown provider: ${defaultProvider}` }, { status: 500 });
  }

  const docsContext = getDocsContext();
  const reqJson = await req.json();

  const result = streamText({
    model,
    system: `You are a helpful documentation assistant for this codebase. Answer questions accurately and concisely based on the documentation below. If the answer isn't in the docs, say so.\n\n<documentation>\n${docsContext}\n</documentation>`,
    messages: await convertToModelMessages(reqJson.messages, {
      ignoreIncompleteToolCalls: true,
    }),
  });

  return result.toUIMessageStreamResponse();
}

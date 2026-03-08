import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export const OW_HOME = join(homedir(), '.ow');
export const CONFIG_PATH = join(OW_HOME, 'config.json');
export const DB_PATH = join(OW_HOME, 'db.sqlite');
export const FUMADOCS_PATH = join(OW_HOME, 'fumadocs');
export const CONTENT_PATH = join(FUMADOCS_PATH, 'content', 'docs');

export function getProjectContentPath(projectName: string): string {
  return join(CONTENT_PATH, projectName);
}

export function ensureOwHome(): void {
  const dirs = [OW_HOME, CONTENT_PATH];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

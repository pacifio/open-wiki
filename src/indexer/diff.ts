import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { getFileHash } from '../storage/db.js';

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export interface FileDiff {
  added: string[];     // rel paths of new files
  modified: string[];  // rel paths of changed files
  deleted: string[];   // rel paths of removed files
}

export function computeDiff(
  projectId: number,
  currentFiles: string[],  // relative paths currently on disk
  allDbPaths: string[],    // relative paths stored in DB
): FileDiff {
  const currentSet = new Set(currentFiles);
  const dbSet = new Set(allDbPaths);

  const deleted = allDbPaths.filter((p) => !currentSet.has(p));
  const added: string[] = [];
  const modified: string[] = [];

  for (const relPath of currentFiles) {
    if (!dbSet.has(relPath)) {
      added.push(relPath);
    }
    // Modified files are determined at processing time by comparing hashes
    // We mark them here by checking stored hashes inline if needed,
    // but actual hash comparison happens in the pipeline using hashFile + getFileHash
  }

  return { added, modified, deleted };
}

export function isFileChanged(projectId: number, relPath: string, currentHash: string): boolean {
  const storedHash = getFileHash(projectId, relPath);
  return storedHash !== currentHash;
}

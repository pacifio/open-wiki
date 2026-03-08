import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const DB_PATH = join(homedir(), '.ow', 'db.sqlite');

interface ProjectRow {
  id: number;
  name: string;
  path: string;
  last_indexed: number | null;
}

export function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });

    const projects = db.prepare('SELECT * FROM projects ORDER BY last_indexed DESC').all() as ProjectRow[];

    const result = projects.map((p) => {
      const { fileCount } = db
        .prepare('SELECT COUNT(*) as fileCount FROM files WHERE project_id = ?')
        .get(p.id) as { fileCount: number };

      const { symbolCount } = db
        .prepare(`
          SELECT COUNT(*) as symbolCount FROM symbols
          WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)
        `)
        .get(p.id) as { symbolCount: number };

      return { ...p, fileCount, symbolCount };
    });

    db.close();
    return NextResponse.json(result);
  } catch {
    // DB doesn't exist yet or other error — return empty list
    return NextResponse.json([]);
  }
}

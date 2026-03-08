import Database from 'better-sqlite3';
import { DB_PATH, ensureOwHome } from './paths.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureOwHome();
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  // Migrate existing projects table to add overview/mermaid columns if missing
  const cols = (db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map((c) => c.name);
  if (cols.length > 0 && !cols.includes('overview')) {
    db.exec('ALTER TABLE projects ADD COLUMN overview TEXT');
    db.exec('ALTER TABLE projects ADD COLUMN mermaid TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_indexed INTEGER,
      overview TEXT,
      mermaid TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      rel_path TEXT NOT NULL,
      hash TEXT NOT NULL,
      last_indexed INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      UNIQUE(project_id, rel_path)
    );

    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      line_start INTEGER,
      line_end INTEGER,
      signature TEXT,
      doc_comment TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id)
    );
  `);
}

// Projects
export interface ProjectRow {
  id: number;
  name: string;
  path: string;
  created_at: number;
  last_indexed: number | null;
  overview: string | null;
  mermaid: string | null;
}

export function upsertProject(name: string, path: string): number {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO projects (name, path, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET path = excluded.path
  `).run(name, path, now);
  const row = db.prepare('SELECT id FROM projects WHERE name = ?').get(name) as { id: number };
  return row.id;
}

export function updateProjectLastIndexed(projectId: number): void {
  getDb().prepare('UPDATE projects SET last_indexed = ? WHERE id = ?').run(Date.now(), projectId);
}

export function updateProjectDocs(projectId: number, overview: string, mermaid: string | null): void {
  getDb().prepare('UPDATE projects SET overview = ?, mermaid = ? WHERE id = ?').run(overview, mermaid, projectId);
}

export function getProjectDocs(projectId: number): { overview: string | null; mermaid: string | null } {
  const row = getDb().prepare('SELECT overview, mermaid FROM projects WHERE id = ?').get(projectId) as { overview: string | null; mermaid: string | null } | undefined;
  return row ?? { overview: null, mermaid: null };
}

export function getAllProjects(): ProjectRow[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY last_indexed DESC').all() as ProjectRow[];
}

export function getProject(name: string): ProjectRow | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRow | undefined;
}

// Files
export interface FileRow {
  id: number;
  project_id: number;
  rel_path: string;
  hash: string;
  last_indexed: number;
}

export function getFileHash(projectId: number, relPath: string): string | null {
  const row = getDb()
    .prepare('SELECT hash FROM files WHERE project_id = ? AND rel_path = ?')
    .get(projectId, relPath) as { hash: string } | undefined;
  return row?.hash ?? null;
}

export function upsertFile(projectId: number, relPath: string, hash: string): number {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO files (project_id, rel_path, hash, last_indexed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, rel_path) DO UPDATE SET hash = excluded.hash, last_indexed = excluded.last_indexed
  `).run(projectId, relPath, hash, now);
  const row = db.prepare('SELECT id FROM files WHERE project_id = ? AND rel_path = ?').get(projectId, relPath) as { id: number };
  return row.id;
}

export function getProjectFiles(projectId: number): FileRow[] {
  return getDb().prepare('SELECT * FROM files WHERE project_id = ?').all(projectId) as FileRow[];
}

export function deleteFile(projectId: number, relPath: string): void {
  const db = getDb();
  const row = db.prepare('SELECT id FROM files WHERE project_id = ? AND rel_path = ?').get(projectId, relPath) as { id: number } | undefined;
  if (row) {
    db.prepare('DELETE FROM symbols WHERE file_id = ?').run(row.id);
    db.prepare('DELETE FROM files WHERE id = ?').run(row.id);
  }
}

// Symbols
export interface SymbolRow {
  id: number;
  file_id: number;
  name: string;
  type: string;
  line_start: number | null;
  line_end: number | null;
  signature: string | null;
  doc_comment: string | null;
}

export function upsertSymbols(fileId: number, symbols: Omit<SymbolRow, 'id' | 'file_id'>[]): void {
  const db = getDb();
  db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);
  const stmt = db.prepare(`
    INSERT INTO symbols (file_id, name, type, line_start, line_end, signature, doc_comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of symbols) {
    stmt.run(fileId, s.name, s.type, s.line_start, s.line_end, s.signature, s.doc_comment);
  }
}

export function getFileSymbols(fileId: number): SymbolRow[] {
  return getDb().prepare('SELECT * FROM symbols WHERE file_id = ?').all(fileId) as SymbolRow[];
}

export function getProjectSymbols(
  projectName: string,
  relPath?: string
): (SymbolRow & { rel_path?: string })[] {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE name = ?').get(projectName) as { id: number } | undefined;
  if (!project) return [];
  if (relPath) {
    return db.prepare(`
      SELECT s.id, s.file_id, s.name, s.type, s.line_start, s.line_end, s.signature, s.doc_comment
      FROM symbols s JOIN files f ON s.file_id = f.id
      WHERE f.project_id = ? AND f.rel_path = ?
    `).all(project.id, relPath) as SymbolRow[];
  }
  return db.prepare(`
    SELECT s.id, s.file_id, s.name, s.type, s.line_start, s.line_end, s.signature, s.doc_comment, f.rel_path
    FROM symbols s JOIN files f ON s.file_id = f.id
    WHERE f.project_id = ?
  `).all(project.id) as (SymbolRow & { rel_path: string })[];
}

// Stats
export function getProjectStats(projectId: number): { fileCount: number; symbolCount: number } {
  const db = getDb();
  const { fileCount } = db.prepare('SELECT COUNT(*) as fileCount FROM files WHERE project_id = ?').get(projectId) as { fileCount: number };
  const { symbolCount } = db.prepare(`
    SELECT COUNT(*) as symbolCount FROM symbols
    WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)
  `).get(projectId) as { symbolCount: number };
  return { fileCount, symbolCount };
}

import { existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// These are always ignored regardless of project type.
// Universal dep directories are listed here so they're blocked before the
// marker-based walk even starts — this prevents recursing into them.
const BASE_IGNORE: string[] = [
  // Version control
  '.git/**',

  // Universal Node.js (every project has node_modules at root; nested ones
  // are handled per-directory by the marker walk)
  'node_modules/**',
  '.npm/**',
  '.yarn/**',
  '.pnp.js',

  // Common build output / generated files
  'dist/**',
  'build/**',
  '.next/**',
  'out/**',
  'coverage/**',

  // Minified / compiled artifacts
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.lock',
  '**/*.snap',

  // Python bytecode
  '**/*.pyc',
  '**/__pycache__/**',

  // OS / editor noise
  '**/.DS_Store',
  '**/.env',
  '**/.env.*',
  '**/.idea/**',
  '**/.vscode/**',
];

// ─── Marker → dependency directory rules ──────────────────────────────────────

interface MarkerRule {
  /** File whose existence signals this project type */
  markerFile: string;
  /** Sibling directories to ignore when the marker is found */
  ignoreDirs: string[];
}

const MARKER_RULES: MarkerRule[] = [
  // Node.js / JavaScript
  { markerFile: 'package.json',    ignoreDirs: ['node_modules', '.npm', '.yarn', '.pnp'] },
  { markerFile: 'pnpm-workspace.yaml', ignoreDirs: ['node_modules'] },

  // Rust
  { markerFile: 'Cargo.toml',      ignoreDirs: ['target'] },

  // Go
  { markerFile: 'go.mod',          ignoreDirs: ['vendor'] },

  // Java / Kotlin (Maven)
  { markerFile: 'pom.xml',         ignoreDirs: ['target', '.mvn'] },

  // Java / Kotlin (Gradle)
  { markerFile: 'build.gradle',    ignoreDirs: ['build', '.gradle'] },
  { markerFile: 'build.gradle.kts', ignoreDirs: ['build', '.gradle'] },

  // Ruby
  { markerFile: 'Gemfile',         ignoreDirs: ['vendor/bundle', '.bundle'] },

  // PHP
  { markerFile: 'composer.json',   ignoreDirs: ['vendor'] },

  // Python (coverage / pytest artifacts)
  { markerFile: 'setup.py',        ignoreDirs: ['.eggs', '*.egg-info', 'dist', 'build'] },
  { markerFile: 'pyproject.toml',  ignoreDirs: ['.eggs', '*.egg-info', 'dist', 'build'] },
  { markerFile: 'setup.cfg',       ignoreDirs: ['.eggs', '*.egg-info'] },

  // .NET
  { markerFile: '*.csproj',        ignoreDirs: ['bin', 'obj'] },
  { markerFile: '*.sln',           ignoreDirs: ['bin', 'obj'] },

  // Swift / Xcode
  { markerFile: 'Package.swift',   ignoreDirs: ['.build'] },
  { markerFile: '*.xcodeproj',     ignoreDirs: ['DerivedData'] },

  // Elixir
  { markerFile: 'mix.exs',         ignoreDirs: ['_build', 'deps'] },

  // Haskell
  { markerFile: 'stack.yaml',      ignoreDirs: ['.stack-work'] },
  { markerFile: '*.cabal',         ignoreDirs: ['dist-newstyle', '.cabal-sandbox'] },
];

// ─── Virtual environment detection ────────────────────────────────────────────

/** Signatures that indicate a directory is a Python virtual environment */
const VENV_SIGNATURES = [
  'pyvenv.cfg',                   // created by venv / virtualenv
  'bin/activate',                 // Unix activate script
  'Scripts/activate.bat',         // Windows activate script
  'Scripts/activate',             // Windows Git Bash
];

/** Common names people give to virtual envs */
const COMMON_VENV_NAMES = new Set([
  '.venv', 'venv', 'env', '.env',
  'virtualenv', '.virtualenv',
  'pyenv', '.pyenv',
]);

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan the project root (up to maxDepth levels) for marker files and virtual
 * environments, then return a combined list of glob ignore patterns.
 */
export function buildIgnorePatterns(projectRoot: string, maxDepth = 4): string[] {
  const patterns = new Set<string>(BASE_IGNORE);

  // Walk the tree to find markers and venvs
  walk(projectRoot, projectRoot, 0, maxDepth, patterns);

  return [...patterns];
}

function walk(
  projectRoot: string,
  dir: string,
  depth: number,
  maxDepth: number,
  patterns: Set<string>,
): void {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // permission error or broken symlink — skip
  }

  // Classify entries up front so we can process files first
  const files: string[] = [];
  const dirs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let entryIsDir = false;
    try {
      entryIsDir = statSync(fullPath).isDirectory();
    } catch {
      continue;
    }
    if (entryIsDir) dirs.push(entry);
    else files.push(entry);
  }

  // ── Phase 1: process all files in this directory first ───────────────────
  // This ensures marker-derived ignore patterns (e.g. node_modules/**) are
  // added BEFORE we try to recurse into sibling directories.
  for (const entry of files) {
    applyMarkerRules(entry, join(dir, entry), dir, projectRoot, patterns);
  }

  // ── Phase 2: recurse into subdirectories using updated patterns ───────────
  for (const entry of dirs) {
    const fullPath = join(dir, entry);
    const relToRoot = relative(projectRoot, fullPath);

    // Check if this directory is a virtual environment
    if (isVenvDir(fullPath, entry)) {
      patterns.add(`${relToRoot}/**`);
      continue;
    }

    // Skip directories already covered by our ignore patterns
    if (isAlreadyIgnored(relToRoot, patterns)) continue;

    walk(projectRoot, fullPath, depth + 1, maxDepth, patterns);
  }
}

function applyMarkerRules(
  filename: string,
  _fullPath: string,
  parentDir: string,
  projectRoot: string,
  patterns: Set<string>,
): void {
  for (const rule of MARKER_RULES) {
    if (!matchesMarker(filename, rule.markerFile)) continue;

    const relParent = relative(projectRoot, parentDir);
    const prefix = relParent ? relParent + '/' : '';

    for (const ignoreDir of rule.ignoreDirs) {
      // ignoreDir may contain a glob wildcard like "*.egg-info"
      if (ignoreDir.includes('*')) {
        patterns.add(`${prefix}${ignoreDir}/**`);
      } else {
        // Only add if the directory actually exists (avoids noise)
        const absIgnore = join(parentDir, ignoreDir);
        if (existsSync(absIgnore)) {
          patterns.add(`${prefix}${ignoreDir}/**`);
        } else {
          // Add it anyway so future runs are covered
          patterns.add(`${prefix}${ignoreDir}/**`);
        }
      }
    }
  }
}

/** Match a filename against a marker pattern (supports leading *. glob) */
function matchesMarker(filename: string, marker: string): boolean {
  if (marker.startsWith('*.')) {
    return filename.endsWith(marker.slice(1));
  }
  return filename === marker;
}

/** Heuristic: is this directory a Python virtual environment? */
function isVenvDir(dirPath: string, dirName: string): boolean {
  // Fast check: common names first
  if (COMMON_VENV_NAMES.has(dirName.toLowerCase())) {
    // Verify it actually looks like a venv
    return VENV_SIGNATURES.some((sig) => existsSync(join(dirPath, sig)));
  }

  // Slower check: any directory with pyvenv.cfg is definitely a venv
  return existsSync(join(dirPath, 'pyvenv.cfg'));
}

/** Quick check to avoid recursing into already-ignored subtrees */
function isAlreadyIgnored(relPath: string, patterns: Set<string>): boolean {
  for (const p of patterns) {
    // Strip trailing /** to get the directory prefix
    const prefix = p.endsWith('/**') ? p.slice(0, -3) : p;
    if (relPath === prefix || relPath.startsWith(prefix + '/')) return true;
  }
  return false;
}

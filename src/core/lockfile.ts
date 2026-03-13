/**
 * Lockfile module for three-way merge support
 *
 * Records SHA-256 checksums of all template files at install time.
 * Enables three-way merge during `omcustom update` by providing
 * the original template state (base) to detect user modifications
 * vs. upstream template changes.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileExists, readJsonFile, writeJsonFile } from '../utils/fs.js';
import { debug, warn } from '../utils/logger.js';

export const LOCKFILE_NAME = '.omcustom.lock.json';
export const LOCKFILE_VERSION = 1 as const;

/**
 * Per-file entry in the lockfile
 */
export interface LockfileEntry {
  /** SHA-256 hash of the template file at install time */
  templateHash: string;
  /** File size in bytes at install time */
  size: number;
  /** Component this file belongs to (rules, agents, skills, guides, hooks, contexts, ontology) */
  component: string;
}

/**
 * Root lockfile structure
 */
export interface Lockfile {
  /** Lockfile format version */
  lockfileVersion: typeof LOCKFILE_VERSION;
  /** oh-my-customcode version that generated this lockfile */
  generatorVersion: string;
  /** ISO timestamp of lockfile generation */
  generatedAt: string;
  /** Template manifest version at install time */
  templateVersion: string;
  /** Per-file entries, keyed by relative path from project root */
  files: Record<string, LockfileEntry>;
}

/**
 * Diff result between two lockfiles
 */
export interface LockfileDiff {
  /** Files in current but not in base */
  added: string[];
  /** Files in base but not in current */
  removed: string[];
  /** Files in both but with different hashes */
  modified: string[];
  /** Files in both with same hash */
  unchanged: string[];
}

/**
 * Component path mapping: directory path prefix -> component name
 */
const COMPONENT_PATHS: ReadonlyArray<readonly [string, string]> = [
  ['.claude/rules', 'rules'],
  ['.claude/agents', 'agents'],
  ['.claude/skills', 'skills'],
  ['.claude/hooks', 'hooks'],
  ['.claude/contexts', 'contexts'],
  ['.claude/ontology', 'ontology'],
  ['guides', 'guides'],
] as const;

/**
 * Compute SHA-256 hash of a file using a read stream.
 * Returns lowercase hex digest.
 */
export function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', (err) => {
      reject(err);
    });

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

/**
 * Read the lockfile from targetDir.
 * Returns null if the file does not exist or has an invalid lockfileVersion.
 */
export async function readLockfile(targetDir: string): Promise<Lockfile | null> {
  const lockfilePath = join(targetDir, LOCKFILE_NAME);

  const exists = await fileExists(lockfilePath);
  if (!exists) {
    debug('lockfile.not_found', { path: lockfilePath });
    return null;
  }

  try {
    const data = await readJsonFile<unknown>(lockfilePath);

    if (
      typeof data !== 'object' ||
      data === null ||
      (data as Record<string, unknown>).lockfileVersion !== LOCKFILE_VERSION
    ) {
      warn('lockfile.invalid_version', { path: lockfilePath });
      return null;
    }

    return data as Lockfile;
  } catch (err) {
    warn('lockfile.read_failed', { path: lockfilePath, error: String(err) });
    return null;
  }
}

/**
 * Write a lockfile to targetDir with 2-space indented JSON.
 */
export async function writeLockfile(targetDir: string, lockfile: Lockfile): Promise<void> {
  const lockfilePath = join(targetDir, LOCKFILE_NAME);
  await writeJsonFile(lockfilePath, lockfile);
  debug('lockfile.written', { path: lockfilePath });
}

/**
 * Determine the component name for a given file path.
 * Uses the first matching prefix from COMPONENT_PATHS.
 * Falls back to 'unknown' if no prefix matches.
 */
function resolveComponent(relativePath: string): string {
  // Normalize to forward slashes for cross-platform matching
  const normalized = relativePath.replace(/\\/g, '/');

  for (const [prefix, component] of COMPONENT_PATHS) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return component;
    }
  }

  return 'unknown';
}

/**
 * Walk a directory recursively and collect all file paths.
 * Skips entries that are not regular files (directories, symlinks, etc.).
 * Skips hidden entries (starting with '.') only at the top level of targetDir.
 */
async function collectFiles(
  dir: string,
  projectRoot: string,
  isTopLevel: boolean
): Promise<string[]> {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory does not exist or is not readable — skip silently
    return results;
  }

  for (const entry of entries) {
    // Skip hidden entries only at the project root level
    if (isTopLevel && entry.startsWith('.') && entry !== '.claude') {
      continue;
    }

    const fullPath = join(dir, entry);

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(fullPath);
    } catch {
      // File disappeared between readdir and stat — skip
      continue;
    }

    if (fileStat.isDirectory()) {
      const subFiles = await collectFiles(fullPath, projectRoot, false);
      results.push(...subFiles);
    } else if (fileStat.isFile()) {
      results.push(fullPath);
    }
    // Symlinks and other special files are intentionally skipped
  }

  return results;
}

/**
 * Generate a lockfile by walking all installed template files in targetDir.
 * Computes SHA-256 for each file and resolves the component from the path.
 */
export async function generateLockfile(
  targetDir: string,
  generatorVersion: string,
  templateVersion: string
): Promise<Lockfile> {
  const files: Record<string, LockfileEntry> = {};

  // Walk each component root that may exist in the target directory
  const componentRoots = COMPONENT_PATHS.map(([prefix]) => join(targetDir, prefix));

  for (const componentRoot of componentRoots) {
    const exists = await fileExists(componentRoot);
    if (!exists) {
      debug('lockfile.component_dir_missing', { path: componentRoot });
      continue;
    }

    const allFiles = await collectFiles(componentRoot, targetDir, false);

    for (const absolutePath of allFiles) {
      const relativePath = relative(targetDir, absolutePath).replace(/\\/g, '/');

      let hash: string;
      let size: number;

      try {
        hash = await computeFileHash(absolutePath);
        const fileStat = await stat(absolutePath);
        size = fileStat.size;
      } catch (err) {
        warn('lockfile.hash_failed', { path: absolutePath, error: String(err) });
        continue;
      }

      const component = resolveComponent(relativePath);

      files[relativePath] = {
        templateHash: hash,
        size,
        component,
      };

      debug('lockfile.entry_added', { path: relativePath, component });
    }
  }

  return {
    lockfileVersion: LOCKFILE_VERSION,
    generatorVersion,
    generatedAt: new Date().toISOString(),
    templateVersion,
    files,
  };
}

/**
 * Compare two lockfiles and return a categorized diff.
 */
export function diffLockfiles(base: Lockfile, current: Lockfile): LockfileDiff {
  const baseKeys = new Set(Object.keys(base.files));
  const currentKeys = new Set(Object.keys(current.files));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const key of currentKeys) {
    if (!baseKeys.has(key)) {
      added.push(key);
    } else if (base.files[key].templateHash !== current.files[key].templateHash) {
      modified.push(key);
    } else {
      unchanged.push(key);
    }
  }

  for (const key of baseKeys) {
    if (!currentKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, modified, unchanged };
}

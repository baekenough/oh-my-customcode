/**
 * Local project registry for oh-my-customcode
 *
 * Stores registered projects in ~/.oh-my-customcode/projects.json so that
 * project discovery does not rely on directory-scanning heuristics.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

/** Compute the registry directory path at call-time (respects HOME env changes in tests). */
function registryDir(): string {
  return join(homedir(), '.oh-my-customcode');
}

/** Compute the registry file path at call-time. */
function registryPath(): string {
  return join(registryDir(), 'projects.json');
}

/**
 * Per-project entry stored in the registry
 */
export interface RegistryEntry {
  version: string;
  installedAt: string;
  updatedAt: string;
}

/**
 * Full registry schema persisted to disk
 */
export interface Registry {
  projects: Record<string, RegistryEntry>;
}

/** Empty registry sentinel */
const EMPTY_REGISTRY: Registry = { projects: {} };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read the raw registry file from disk.
 * Returns an empty registry if the file does not exist or cannot be parsed.
 */
async function readRegistryRaw(): Promise<Registry> {
  try {
    const content = await readFile(registryPath(), 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'projects' in parsed &&
      typeof (parsed as Registry).projects === 'object' &&
      (parsed as Registry).projects !== null
    ) {
      return parsed as Registry;
    }
    return { ...EMPTY_REGISTRY };
  } catch {
    // File not found or invalid JSON — return empty registry (non-blocking)
    return { ...EMPTY_REGISTRY };
  }
}

/**
 * Persist the registry to disk, creating the directory if necessary.
 */
async function writeRegistry(registry: Registry): Promise<void> {
  const dir = registryDir();
  await mkdir(dir, { recursive: true });
  await writeFile(registryPath(), JSON.stringify(registry, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the current registry.
 * Safe to call at any time — returns an empty registry on any error.
 */
export async function readRegistry(): Promise<Registry> {
  return readRegistryRaw();
}

/**
 * Register or update a project in the registry.
 *
 * @param projectPath - Absolute path to the project root
 * @param version - oh-my-customcode version installed in the project
 */
export async function registerProject(projectPath: string, version: string): Promise<void> {
  const normalizedPath = resolve(projectPath);
  const registry = await readRegistryRaw();
  const existing = registry.projects[normalizedPath];
  const now = new Date().toISOString();

  registry.projects[normalizedPath] = {
    version,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  };

  await writeRegistry(registry);
}

/**
 * Remove a project from the registry.
 * No-op if the project was not registered.
 *
 * @param projectPath - Absolute path to the project root
 */
export async function unregisterProject(projectPath: string): Promise<void> {
  const normalizedPath = resolve(projectPath);
  const registry = await readRegistryRaw();
  if (!(normalizedPath in registry.projects)) return;

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete registry.projects[normalizedPath];
  await writeRegistry(registry);
}

/**
 * Scan one or more directories for existing `.omcustom.lock.json` files and
 * register all discovered projects into the registry.
 *
 * This is the migration path for users who installed oh-my-customcode before
 * the registry was introduced.
 *
 * @param searchDirs - Absolute paths of directories to search (non-recursive depth-3)
 * @returns Number of projects imported
 */
export async function migrateFromLockfiles(searchDirs: string[]): Promise<number> {
  const { readdir } = await import('node:fs/promises');

  const MAX_DEPTH = 3;

  /** Collected lock-file data, keyed by absolute project path */
  const discovered = new Map<string, RegistryEntry>();

  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || discovered.has(dir)) return;

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this directory has a lock file
    const lockPath = join(dir, '.omcustom.lock.json');
    try {
      const content = await readFile(lockPath, 'utf-8');
      const lock = JSON.parse(content) as Record<string, unknown>;
      const version =
        typeof lock['version'] === 'string'
          ? lock['version']
          : typeof lock['templateVersion'] === 'string'
            ? lock['templateVersion']
            : '0.0.0';

      const now = new Date().toISOString();
      discovered.set(resolve(dir), {
        version,
        installedAt: typeof lock['installedAt'] === 'string' ? lock['installedAt'] : now,
        updatedAt: typeof lock['updatedAt'] === 'string' ? lock['updatedAt'] : now,
      });
      // Do not recurse into a project
      return;
    } catch {
      // No lock file — continue scanning subdirectories
    }

    if (depth < MAX_DEPTH) {
      const subdirs = entries.filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          e.name !== 'node_modules' &&
          e.name !== 'dist' &&
          e.name !== 'build' &&
          e.name !== '.git'
      );

      await Promise.all(subdirs.map((sub) => scan(join(dir, sub.name), depth + 1)));
    }
  }

  await Promise.all(searchDirs.map((dir) => scan(dir, 0).catch(() => {})));

  if (discovered.size === 0) return 0;

  // Single read-modify-write to avoid race conditions
  const registry = await readRegistryRaw();
  let imported = 0;

  for (const [projectPath, entry] of discovered) {
    if (!(projectPath in registry.projects)) {
      registry.projects[projectPath] = entry;
      imported++;
    }
  }

  if (imported > 0) {
    await writeRegistry(registry);
  }

  return imported;
}

/**
 * Convert the registry into a flat list suitable for display.
 * Each entry carries the project path and its stored metadata.
 */
export interface RegistryProjectInfo {
  name: string;
  path: string;
  version: string;
  installedAt: string;
  updatedAt: string;
}

export function registryToList(registry: Registry): RegistryProjectInfo[] {
  return Object.entries(registry.projects).map(([path, entry]) => ({
    name: basename(path),
    path,
    version: entry.version,
    installedAt: entry.installedAt,
    updatedAt: entry.updatedAt,
  }));
}

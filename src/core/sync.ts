/**
 * Sync check and snapshot export for team drift detection
 *
 * Compares the current .claude/ state against the installed lockfile to detect
 * configuration drift. Also supports exporting the current state as a reusable
 * snapshot that team members can install with `omcustom init --from-snapshot`.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getPackageRoot, readJsonFile } from '../utils/fs.js';
import {
  diffLockfiles,
  generateLockfile,
  type Lockfile,
  listTemplateFiles,
  readLockfile,
  writeLockfile,
} from './lockfile.js';

export interface SyncCheckResult {
  /** True when no added, removed, or modified files are detected */
  inSync: boolean;
  /** Files present in the current state but absent in the reference lockfile */
  added: string[];
  /** Files recorded in the reference lockfile that no longer exist */
  removed: string[];
  /** Files present in both but with different hashes */
  modified: string[];
  /** Count of files that match exactly */
  unchanged: number;
  /** Version string from the reference lockfile, or null when none exists */
  referenceVersion: string | null;
  /** Version string from the current generated lockfile, or null on failure */
  currentVersion: string | null;
  /** Total number of files tracked in the current state */
  totalTracked: number;
  /**
   * Why the comparison could not be made (never set when it was made): the template directory
   * that defines ownership has no component files, or the current snapshot could not be
   * generated. `inSync` is then `false`.
   */
  error?: string;
}

export interface SyncExportResult {
  success: boolean;
  exportPath: string;
  fileCount: number;
}

/**
 * Load generator and template versions from the package root.
 * Returns fallback strings on failure so callers never throw.
 */
async function loadVersions(): Promise<{ generatorVersion: string; templateVersion: string }> {
  try {
    const packageRoot = getPackageRoot();
    const manifest = await readJsonFile<{ version: string }>(
      join(packageRoot, 'templates', 'manifest.json')
    );
    const pkg = await readJsonFile<{ version: string }>(join(packageRoot, 'package.json'));
    return { generatorVersion: pkg.version, templateVersion: manifest.version };
  } catch {
    return { generatorVersion: '0.0.0', templateVersion: '0.0.0' };
  }
}

/**
 * Generate the current lockfile snapshot for a target directory.
 * Reads package and manifest versions from the installed package root.
 */
async function generateCurrentLockfile(
  targetDir: string,
  templateRoot?: string
): Promise<Lockfile | null> {
  try {
    const { generatorVersion, templateVersion } = await loadVersions();
    return await generateLockfile(
      targetDir,
      generatorVersion,
      templateVersion,
      templateRoot === undefined ? {} : { templateRoot }
    );
  } catch {
    return null;
  }
}

/**
 * Copy of `lockfile` without entries that have no counterpart in `templateFiles` (the files under
 * the template root). Mirrors the filter `generateLockfile` applies to the current snapshot
 * (`templateRoot` option), so entries the updater carried forward for leftovers that are no
 * longer shipped are ignored here as well.
 */
function restrictToTemplateOwned(lockfile: Lockfile, templateFiles: ReadonlySet<string>): Lockfile {
  const files = Object.fromEntries(
    Object.entries(lockfile.files).filter(([path]) => templateFiles.has(path))
  );
  return { ...lockfile, files };
}

/**
 * Compare current .claude/ state against an installed lockfile (or an external
 * reference snapshot).
 *
 * @param targetDir - Project root containing .omcustom.lock.json
 * @param options.reference - Optional path to an external snapshot directory;
 *   when omitted, uses the lockfile found in targetDir
 * @param options.templateRoot - Template directory that defines ownership for the installed
 *   lockfile comparison (default: this package's `templates/`); ignored with `reference`
 *
 * Without `reference`, the installed lockfile records only template-owned files (#1935), so both
 * the lockfile and the current snapshot are restricted to paths that have a template counterpart.
 * Custom files and leftovers (including entries an older, unfiltered lockfile still lists) are
 * therefore neither "added" nor "removed". With `reference` the snapshot is compared unfiltered.
 * A template directory without any component file (missing or empty) is an error, not an empty
 * in-sync comparison: the result is not in sync and `error` says why.
 */
export async function syncCheck(
  targetDir: string,
  options?: { reference?: string; templateRoot?: string }
): Promise<SyncCheckResult> {
  const empty: SyncCheckResult = {
    inSync: false,
    added: [],
    removed: [],
    modified: [],
    unchanged: 0,
    referenceVersion: null,
    currentVersion: null,
    totalTracked: 0,
  };

  const referenceDir = options?.reference ?? targetDir;
  const reference = await readLockfile(referenceDir);

  if (!reference) {
    return empty;
  }

  const templateRoot =
    options?.reference === undefined
      ? (options?.templateRoot ?? join(getPackageRoot(), 'templates'))
      : undefined;

  let templateFiles: Set<string> | null = null;
  if (templateRoot !== undefined) {
    templateFiles = await listTemplateFiles(templateRoot);
    if (templateFiles.size === 0) {
      return {
        ...empty,
        referenceVersion: reference.generatorVersion,
        error: `no template files found under ${templateRoot}`,
      };
    }
  }

  const current = await generateCurrentLockfile(targetDir, templateRoot);
  if (!current) {
    return {
      ...empty,
      referenceVersion: reference.generatorVersion,
      error: 'cannot generate the current lockfile snapshot',
    };
  }

  const base =
    templateFiles === null ? reference : restrictToTemplateOwned(reference, templateFiles);
  const diff = diffLockfiles(base, current);

  return {
    inSync: diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0,
    added: diff.added,
    removed: diff.removed,
    modified: diff.modified,
    unchanged: diff.unchanged.length,
    referenceVersion: reference.generatorVersion,
    currentVersion: current.generatorVersion,
    totalTracked: Object.keys(current.files).length,
  };
}

/**
 * Filter function for `cp` that excludes runtime-local paths from snapshots.
 * Skips agent-memory directories, output archives, and local settings files.
 *
 * The filter receives the source path for both directories and files.
 * We match path segments using a forward-slash boundary check to avoid
 * false positives (e.g. a file whose name merely contains "outputs").
 */
function isExportable(src: string): boolean {
  // Normalize to forward slashes for consistent cross-platform matching
  const normalized = src.replace(/\\/g, '/');

  const excluded = ['/agent-memory', '/agent-memory-local', '/outputs', 'settings.local'];

  return !excluded.some((segment) => {
    // Match as a path component: the segment must appear after a slash
    // (or be the pattern itself for settings.local which is a filename)
    if (segment.startsWith('/')) {
      // Directory component: must appear as /segment at any position
      return normalized.includes(`${segment}/`) || normalized.endsWith(segment);
    }
    // Filename pattern: direct substring match
    return normalized.includes(segment);
  });
}

/**
 * Count all regular files under a directory using async readdir.
 * Returns 0 on any error.
 */
async function countFiles(dir: string): Promise<number> {
  const { readdir, stat } = await import('node:fs/promises');

  async function walk(current: string): Promise<number> {
    let total = 0;
    let entries: string[];

    try {
      entries = await readdir(current);
    } catch {
      return 0;
    }

    for (const entry of entries) {
      const full = join(current, entry);
      try {
        const s = await stat(full);
        if (s.isDirectory()) {
          total += await walk(full);
        } else if (s.isFile()) {
          total += 1;
        }
      } catch {
        // Ignore files that disappear between readdir and stat
      }
    }

    return total;
  }

  return walk(dir);
}

/**
 * Export the current .claude/ state (and guides/) as a reusable snapshot.
 *
 * The snapshot includes a freshly generated lockfile so recipients can run
 * drift checks against it after installation.
 *
 * Excludes: agent-memory, outputs, and settings.local files.
 *
 * @param targetDir - Project root to export from
 * @param outputPath - Destination directory for the snapshot
 */
export async function exportSnapshot(
  targetDir: string,
  outputPath: string
): Promise<SyncExportResult> {
  const claudeDir = join(targetDir, '.claude');
  const guidesDir = join(targetDir, 'guides');

  if (!existsSync(claudeDir)) {
    return { success: false, exportPath: outputPath, fileCount: 0 };
  }

  await mkdir(outputPath, { recursive: true });

  // Copy .claude/ excluding runtime-local directories
  const destClaude = join(outputPath, '.claude');
  await cp(claudeDir, destClaude, {
    recursive: true,
    filter: isExportable,
  });

  // Copy guides/ when present
  if (existsSync(guidesDir)) {
    await cp(guidesDir, join(outputPath, 'guides'), { recursive: true });
  }

  // Embed a fresh lockfile into the snapshot so recipients can check drift
  const lockfile = await generateCurrentLockfile(targetDir);
  if (lockfile) {
    await writeLockfile(outputPath, lockfile);
  }

  const fileCount = await countFiles(outputPath);
  return { success: true, exportPath: outputPath, fileCount };
}

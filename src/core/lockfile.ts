/**
 * Lockfile module for three-way merge support
 *
 * Records SHA-256 checksums of all template files at install time.
 * Enables three-way merge during `omcustom update` by providing
 * the original template state (base) to detect user modifications
 * vs. upstream template changes.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { fileExists, getPackageRoot, readJsonFile, writeJsonFile } from '../utils/fs.js';
import { debug, warn } from '../utils/logger.js';
import { getComponentPath, type InstallComponent } from './layout.js';

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
  /**
   * ISO timestamp (`Date#toISOString()` format) of generation. Only
   * `generateAndWriteLockfileForDir` keeps the previous value when a regeneration changes
   * nothing; it is called by `bun run build` (scripts/sync-source-lockfile.ts), the installer
   * and the updater. `exportSnapshot` embeds a freshly generated lockfile (new timestamp) in
   * the export, and `syncCheck` compares an in-memory snapshot that is never written. It is
   * not part of the content comparison.
   */
  generatedAt: string;
  /** Template manifest version at install time */
  templateVersion: string;
  /**
   * Per-file entries, keyed by relative path from project root. Generated in ascending
   * code-unit (locale-independent) path order so the serialized lockfile does not depend on
   * the filesystem's directory enumeration order.
   *
   * Only the fields declared here are read, compared and written: unknown top-level or
   * per-entry fields found in an existing lockfile are ignored and dropped on regeneration.
   */
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
 * Components tracked by the lockfile.
 * Derived from layout.ts to maintain a single source of truth.
 * Excludes 'entry-md' which is handled separately (project root docs).
 */
const LOCKFILE_COMPONENTS: readonly InstallComponent[] = [
  'rules',
  'agents',
  'skills',
  'hooks',
  'contexts',
  'ontology',
  'guides',
] as const;

/**
 * Component path mapping: directory path prefix -> component name.
 * Computed from layout.ts getComponentPath().
 */
const COMPONENT_PATHS: ReadonlyArray<readonly [string, string]> = LOCKFILE_COMPONENTS.map(
  (component) => [getComponentPath(component), component] as const
);

/**
 * Options for lockfile generation.
 */
export interface LockfileGenerationOptions {
  /**
   * Record only files git would carry into a fresh clone of this working tree: tracked files
   * (including force-added files that match an ignore rule) plus untracked files that are
   * not ignored. Files matched by an ignore rule and not tracked are left out (#1819).
   *
   * Intended for the source repository's own lockfile (`bun run build`), whose tracked copy
   * must be reproducible from a clone. Installed projects (installer/updater) keep the
   * default `false`: there the lockfile describes what was installed, which is deliberately
   * independent of git.
   *
   * A walked file is kept only if `git ls-files --cached --others --exclude-standard` lists it,
   * so git's own structure rules decide: nothing below a symlinked directory, an untracked
   * nested repository (listed as `dir/`) or a gitlink is recorded, while tracked files are kept
   * even if someone ran `git init` inside their directory. When git spells a path differently
   * from the file system, matching falls back from exact bytes to NFC-normalized comparison
   * (NFD names on macOS), then — only when the repository's `core.ignorecase` is true — to a
   * case-insensitive comparison (case-only renames). Invariant: a tracked file present on disk
   * is never dropped over a spelling difference. Caveats: the fallbacks fail toward inclusion,
   * so an ignored spelling twin of a visible path (same name up to NFC or case) is also kept;
   * and keys use the on-disk spelling, which can differ from a clone's (a clone writes git's
   * spelling, e.g. NFC).
   *
   * Requires `targetDir` to be the root of its own git work tree, with a `git` binary on PATH;
   * otherwise generation rejects (never silently falls back to an unfiltered walk, and never
   * filters against a parent repository's rules). Ignore rules come from
   * `git ls-files --exclude-standard`: the repository's `.gitignore` files and
   * `.git/info/exclude`, and per-user excludes (`core.excludesFile`, default
   * `$XDG_CONFIG_HOME/git/ignore`) also apply. That is deliberate: a file this machine's user
   * ignores is never added from this machine, so it is not in a clone either. Defaults to
   * `false`.
   */
  excludeGitIgnored?: boolean;
}

const execFileAsync = promisify(execFile);

/** Environment variables that make git operate on a repository other than `targetDir`'s own. */
const GIT_LOCATION_ENV_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
] as const;

/**
 * Environment variables carrying one-off `git -c` configuration from a parent git process (a
 * hook run under `git -c core.excludesFile=… commit`). Dropped so ignore rules do not depend
 * on how the build was launched. `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`/`GIT_CONFIG_NOSYSTEM`
 * are the user's own environment and are kept.
 */
const GIT_INJECTED_CONFIG_ENV_KEYS = ['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'] as const;
const GIT_INJECTED_CONFIG_ENV_PREFIXES = ['GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_'] as const;

/** Guidance appended to every git failure in `excludeGitIgnored` mode. */
const GIT_REQUIRED_HINT =
  'build from a git checkout: excluding ignored local files from the lockfile requires git (#1819)';

/**
 * Copy of `process.env` without the variables that relocate git or inject configuration, so
 * git resolves the repository and ignore rules from `targetDir` itself.
 */
function gitChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [...GIT_LOCATION_ENV_KEYS, ...GIT_INJECTED_CONFIG_ENV_KEYS]) {
    delete env[key];
  }
  for (const key of Object.keys(env)) {
    if (GIT_INJECTED_CONFIG_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete env[key];
    }
  }
  return env;
}

async function runGit(targetDir: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: targetDir,
      env,
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const detail = err instanceof Error ? err.message.trim() : String(err);
    throw new Error(`git ${args[0]} failed in ${targetDir}: ${detail} — ${GIT_REQUIRED_HINT}`);
  }
}

/**
 * Paths git would carry into a fresh clone, indexed for exact and fallback matching.
 */
interface GitVisiblePaths {
  /** Paths exactly as git printed them. */
  exact: ReadonlySet<string>;
  /** The same paths, NFC-normalized. */
  nfc: ReadonlySet<string>;
  /** NFC-normalized and lower-cased; `null` unless the repository sets `core.ignorecase`. */
  folded: ReadonlySet<string> | null;
}

function foldCase(nfcPath: string): string {
  return nfcPath.toLowerCase();
}

/**
 * Whether a walked path (relative, forward slashes, on-disk spelling) is one git lists:
 * exact bytes first, then NFC-normalized, then case-insensitive when `core.ignorecase` is set.
 */
function isGitVisible(visible: GitVisiblePaths, relativePath: string): boolean {
  if (visible.exact.has(relativePath)) {
    return true;
  }
  const nfc = relativePath.normalize('NFC');
  if (visible.nfc.has(nfc)) {
    return true;
  }
  return visible.folded?.has(foldCase(nfc)) ?? false;
}

/** Remove one trailing newline (git's line terminator); path characters, spaces included, stay. */
function stripFinalNewline(output: string): string {
  return output.endsWith('\n') ? output.slice(0, -1) : output;
}

/**
 * Reject unless `targetDir` is the root of its own work tree (compared by realpath, so `/var`
 * and `/private/var` agree): a subdirectory, or a directory inside another repository
 * (including one that repository ignores), would otherwise be filtered by the wrong rules.
 */
async function assertGitWorkTreeRoot(targetDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const topLevel = stripFinalNewline(
    await runGit(targetDir, ['rev-parse', '--show-toplevel'], env)
  );
  let realTop: string;
  let realTarget: string;
  try {
    [realTop, realTarget] = await Promise.all([realpath(topLevel), realpath(targetDir)]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `cannot resolve the git work tree root of ${targetDir}: ${detail} — ${GIT_REQUIRED_HINT}`
    );
  }
  if (realTop !== realTarget) {
    throw new Error(
      `${targetDir} is not the root of its git work tree (root: ${topLevel}) — ${GIT_REQUIRED_HINT}`
    );
  }
}

/**
 * List the paths under the component roots that git would carry into a fresh clone: tracked
 * entries plus untracked entries not matched by an ignore rule (`ls-files --cached --others
 * --exclude-standard`), relative to `targetDir` with forward slashes. `-z` keeps unusual file
 * names (spaces, non-ASCII, newlines) unquoted.
 *
 * @throws when git fails or `targetDir` is not the root of its own git work tree
 */
async function listGitVisiblePaths(targetDir: string): Promise<GitVisiblePaths> {
  const env = gitChildEnv();
  await assertGitWorkTreeRoot(targetDir, env);

  const pathspecs = COMPONENT_PATHS.map(([prefix]) => prefix);
  const [listing, ignoreCase] = await Promise.all([
    runGit(
      targetDir,
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...pathspecs],
      env
    ),
    runGit(
      targetDir,
      ['config', '--type=bool', '--default=false', '--get', 'core.ignorecase'],
      env
    ),
  ]);

  const exact = new Set(listing.split('\0').filter((entry) => entry.length > 0));
  const nfc = new Set([...exact].map((entry) => entry.normalize('NFC')));
  const folded = stripFinalNewline(ignoreCase) === 'true' ? new Set([...nfc].map(foldCase)) : null;
  return { exact, nfc, folded };
}

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

    const record = data as Record<string, unknown>;
    if (typeof record.files !== 'object' || record.files === null) {
      warn('lockfile.invalid_structure', { path: lockfilePath });
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
 * Return a copy of `files` with keys in ascending UTF-16 code-unit order.
 * Deliberately not `localeCompare`: the order must not vary with the host locale.
 */
function sortFilesByPath(files: Record<string, LockfileEntry>): Record<string, LockfileEntry> {
  const sorted = Object.keys(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(sorted.map((key) => [key, files[key]]));
}

/**
 * Generate a lockfile by walking all installed template files in targetDir.
 * Computes SHA-256 for each file and resolves the component from the path.
 * With `options.excludeGitIgnored`, only files git would carry into a fresh clone are kept.
 */
export async function generateLockfile(
  targetDir: string,
  generatorVersion: string,
  templateVersion: string,
  options: LockfileGenerationOptions = {}
): Promise<Lockfile> {
  const files: Record<string, LockfileEntry> = {};
  const gitVisible = options.excludeGitIgnored ? await listGitVisiblePaths(targetDir) : null;

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

      if (gitVisible !== null && !isGitVisible(gitVisible, relativePath)) {
        debug('lockfile.entry_git_excluded', { path: relativePath });
        continue;
      }

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
    files: sortFilesByPath(files),
  };
}

/**
 * Whether two lockfiles describe the same content: identical format/generator/template
 * versions and identical per-file entries. `generatedAt` is deliberately NOT compared, and
 * key order of `files` is irrelevant (comparison is by key lookup, not by serialization).
 * `previous` may come from disk, so its entries are checked defensively.
 */
function hasSameLockfileContent(next: Lockfile, previous: Lockfile): boolean {
  if (
    next.lockfileVersion !== previous.lockfileVersion ||
    next.generatorVersion !== previous.generatorVersion ||
    next.templateVersion !== previous.templateVersion
  ) {
    return false;
  }

  const nextKeys = Object.keys(next.files);
  if (nextKeys.length !== Object.keys(previous.files).length) {
    return false;
  }

  return nextKeys.every((key) => {
    if (!Object.hasOwn(previous.files, key)) {
      return false;
    }
    const before = previous.files[key];
    const after = next.files[key];
    return (
      typeof before === 'object' &&
      before !== null &&
      before.templateHash === after.templateHash &&
      before.size === after.size &&
      before.component === after.component
    );
  });
}

/**
 * Whether `value` is a timestamp in exactly the format this module writes
 * (`Date#toISOString()`). `Date.parse` alone is too lenient: it accepts `"1"`, `"2026"`
 * or `"March 7, 2020"`, which must not be carried forward as a generation time.
 */
function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

/**
 * Keep the previous `generatedAt` when the regenerated lockfile has the same content,
 * so rebuilding without any change leaves the tracked lockfile byte-identical (#1796).
 *
 * Content = `lockfileVersion`, `generatorVersion`, `templateVersion` and every file entry's
 * `templateHash`/`size`/`component` (strict equality; keys compared as a set, order-free).
 * Returns `next` unchanged (fresh timestamp) when there is no previous lockfile, when the
 * previous `generatedAt` is not in `toISOString()` format, or when any of that differs.
 *
 * The result always has the structure and key order of `next`: unknown top-level fields or
 * per-entry fields in `previous` are ignored (they neither affect the comparison nor are
 * carried over), only the timestamp value is taken from `previous`. Never mutates its
 * arguments.
 */
export function preserveGeneratedAt(next: Lockfile, previous: Lockfile | null): Lockfile {
  if (previous === null || !isIsoTimestamp(previous.generatedAt)) {
    return next;
  }

  if (!hasSameLockfileContent(next, previous)) {
    return next;
  }

  return { ...next, generatedAt: previous.generatedAt };
}

/**
 * Generate and write a lockfile for a target directory.
 * Reads package.json and manifest.json from the package root to determine versions.
 * Keeps the existing lockfile's `generatedAt` when nothing else changed (idempotent rebuild).
 * Non-throwing: on failure (including git failure when `options.excludeGitIgnored` is set)
 * returns `{ fileCount: 0, warning }` and writes nothing.
 */
export async function generateAndWriteLockfileForDir(
  targetDir: string,
  options: LockfileGenerationOptions = {}
): Promise<{ fileCount: number; warning?: string }> {
  try {
    const packageRoot = getPackageRoot();
    const manifest = await readJsonFile<{ version: string }>(
      join(packageRoot, 'templates', 'manifest.json')
    );
    const { version: generatorVersion } = await readJsonFile<{ version: string }>(
      join(packageRoot, 'package.json')
    );
    const generated = await generateLockfile(
      targetDir,
      generatorVersion,
      manifest.version,
      options
    );
    const previous = await readLockfile(targetDir);
    const lockfile = preserveGeneratedAt(generated, previous);
    await writeLockfile(targetDir, lockfile);
    return { fileCount: Object.keys(lockfile.files).length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fileCount: 0, warning: `Lockfile generation failed: ${msg}` };
  }
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

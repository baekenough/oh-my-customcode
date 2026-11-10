/**
 * Self-update check for oh-my-customcode CLI
 * Runs before `omcustom init` in interactive sessions.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import packageJson from '../../package.json';
import { i18n } from '../i18n/index.js';
import { type HomeSources, resolveHomeDir } from '../utils/home.js';

const DEFAULT_PACKAGE_NAME = 'oh-my-customcode';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR_NAME = '.oh-my-customcode';
const CACHE_FILE_NAME = 'self-update-cache.json';

/**
 * Default path of the self-update cache (`<home>/.oh-my-customcode/self-update-cache.json`).
 *
 * The home directory is resolved on EVERY call (never memoised), so a change to
 * `process.env.HOME` is picked up by the next call.
 *
 * Returns `null` when the resolved home is empty or relative: a relative home would
 * make the cache location depend on the current directory, so each directory would
 * read and write its own cache file. Callers treat `null` as "no cache available" and
 * check npm directly (#1820).
 *
 * @param sources - Home-directory sources override (for tests)
 */
export function resolveSelfUpdateCachePath(sources?: HomeSources): string | null {
  const home = resolveHomeDir(sources);
  // An unresolvable home is '' — not absolute either
  if (!isAbsolute(home)) {
    return null;
  }
  return join(home, CACHE_DIR_NAME, CACHE_FILE_NAME);
}

/**
 * Epoch values at or above this are already MILLISECONDS, not seconds
 * (1e12 ms = 2001-09-09; 1e12 s = year 33658 — no real `date +%s` reaches it).
 */
const MS_EPOCH_THRESHOLD = 1e12;

/** Which on-disk key set a cache record was read from. */
export type SelfUpdateCacheSchema = 'cli' | 'hook';

/**
 * Normalized, in-memory cache record.
 *
 * The on-disk file at `~/.oh-my-customcode/self-update-cache.json` has TWO current
 * writers with DIFFERENT key names (measured 2026-08-10 — #1570, #1575):
 *
 *   `.claude/hooks/scripts/omcustom-auto-update.sh` → `{version, timestamp, source}`
 *   `writeCache()` in this module                   → `{checkedAt, latestVersion}`
 *
 * Neither is legacy. `readSelfUpdateCache()` accepts both and normalizes to this shape,
 * so a hook-written cache no longer forces the CLI to re-query npm on every run.
 */
export interface SelfUpdateCache {
  /** ISO-8601 instant of the recorded check. */
  checkedAt: string;
  /** Version string exactly as stored (normalization happens at the call site). */
  latestVersion: string;
  /** On-disk key set this record came from. */
  schema: SelfUpdateCacheSchema;
}

/**
 * On-disk envelope written by {@link writeCache}.
 *
 * It carries BOTH key sets so every current reader gets a hit:
 *   - this module and `session-env-check.sh` read `checkedAt` / `latestVersion`
 *   - `omcustom-auto-update.sh` reads `version` / `timestamp` (epoch SECONDS)
 *
 * Writing only the CLI keys was the other half of #1575: the bash hook found no
 * `"version"` key and re-queried the npm registry on every session start.
 */
interface SelfUpdateCacheFile {
  checkedAt: string;
  latestVersion: string;
  version: string;
  timestamp: number;
  source: string;
}

export interface SelfUpdateCheckResult {
  checked: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  usedCache: boolean;
  reason?: string;
}

/** Result subset of `spawnSync` that the init re-exec reads. */
export interface ReexecSpawnResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  /** Set when the child could not be started at all. */
  error?: Error;
}

/** `spawnSync` signature used by the init re-exec. */
export type ReexecSpawnFn = (
  command: string,
  args: string[],
  options: { stdio: 'inherit'; env: NodeJS.ProcessEnv }
) => ReexecSpawnResult;

/**
 * Injectable side effects of the init re-exec (all default to the real implementations).
 * Tests inject fakes so no real CLI is ever re-executed and the process never exits.
 */
export interface InitReexecDeps {
  spawnFn?: ReexecSpawnFn;
  realpathFn?: (path: string) => string;
  /** Reads a package.json as text; throws when the file is missing. */
  readFileFn?: (path: string) => string;
  exitFn?: (code: number) => void;
}

export interface SelfUpdateOptions {
  currentVersion: string;
  packageName?: string;
  cachePath?: string;
  cacheTtlMs?: number;
  skip?: boolean;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  fetchLatestVersion?: (packageName: string) => string | null;
  now?: number;
  /** Test seam for the re-exec that follows a successful global install on the init path. */
  reexecDeps?: InitReexecDeps;
}

/**
 * Normalize version text into semver-ish `x.y.z` (without `v` prefix/prerelease).
 */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('-')[0] || '';
}

/**
 * Compare two semver-like versions.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const left = normalizeVersion(a)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const right = normalizeVersion(b)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const maxLen = Math.max(left.length, right.length, 3);

  for (let i = 0; i < maxLen; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

export interface VersionPlausibleOptions {
  /**
   * When true, bypass cache-corruption guards (major-bump and large-minor-jump).
   * Use for live npm fetch results — the registry is authoritative, so cross-major
   * updates such as 0.x → 1.x are valid and must not be rejected.
   * Leave false (default) for cached versions, where implausible jumps signal corruption.
   */
  live?: boolean;
}

/**
 * Sanity check: reject cached versions that are implausibly far from current.
 * A major version change or a minor jump of 10+ is almost certainly cache corruption.
 *
 * Pass `{ live: true }` for live npm fetch results to bypass the corruption guards —
 * a real npm registry response is authoritative confirmation, not a stale cache entry.
 */
export function isVersionPlausible(
  currentVersion: string,
  candidateVersion: string,
  options: VersionPlausibleOptions = {}
): boolean {
  // Live npm fetch is authoritative — skip corruption guards entirely.
  if (options.live) {
    return true;
  }

  const current = normalizeVersion(currentVersion)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const candidate = normalizeVersion(candidateVersion)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const majorDiff = (candidate[0] ?? 0) - (current[0] ?? 0);
  const minorDiff = (candidate[1] ?? 0) - (current[1] ?? 0);

  // Cache-only guard: reject if major version changes (0.x → 1.x without live confirmation
  // is suspicious — could be a corrupted or stale cache entry).
  if (majorDiff >= 1) {
    return false;
  }

  // Cache-only guard: reject if minor jumps by 10+ within same major
  // (0.68 → 0.78+ is implausible in one cache TTL).
  if (majorDiff === 0 && minorDiff >= 10) {
    return false;
  }

  return true;
}

/**
 * Interactive session check (prompt-safe).
 */
export function isInteractiveSession(
  stdin: Pick<NodeJS.ReadStream, 'isTTY'> = process.stdin,
  stdout: Pick<NodeJS.WriteStream, 'isTTY'> = process.stdout
): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

/**
 * Detect npx / npm exec style invocation.
 */
export function isNpxInvocation(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const argv1 = argv[1] || '';
  const npmExecPath = env.npm_execpath || '';
  const npmCommand = env.npm_command || '';

  return (
    argv1.includes('/_npx/') ||
    argv1.includes('\\_npx\\') ||
    npmExecPath.includes('npx') ||
    npmCommand === 'exec' ||
    env.npm_lifecycle_event === 'npx'
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return a trimmed non-empty string, or null for any other value. */
function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Convert the hook writer's epoch `timestamp` into an ISO-8601 string.
 *
 * `omcustom-auto-update.sh` writes `date +%s` — epoch SECONDS. Millisecond-scale values
 * are also accepted: reading milliseconds as seconds would place `checkedAt` ~50k years
 * in the future, and a future timestamp makes a TTL check fail OPEN (the cache would look
 * fresh forever). See the future-timestamp guard in {@link isCacheFresh}.
 */
function epochToIsoString(value: unknown): string | null {
  let numeric = Number.NaN;
  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    numeric = Number(value.trim());
  }

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const milliseconds = numeric >= MS_EPOCH_THRESHOLD ? numeric : numeric * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Read the self-update cache, accepting BOTH on-disk schemas (see {@link SelfUpdateCache}).
 *
 * Precedence when a file carries both key sets: the CLI keys (`latestVersion`/`checkedAt`)
 * win — identical to the bash reader in `session-env-check.sh`, which tries `latestVersion`
 * first and falls back to `version` (#1570). Records that satisfy neither key set (missing
 * file, empty file, malformed JSON, non-object JSON, partial keys) are safely invalidated by
 * returning `null`, which makes the caller re-query npm rather than trust a half-read entry.
 */
export function readSelfUpdateCache(cachePath: string): SelfUpdateCache | null {
  if (!existsSync(cachePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }

  if (!isJsonRecord(parsed)) {
    return null;
  }

  const cliVersion = readNonEmptyString(parsed.latestVersion);
  const cliCheckedAt = readNonEmptyString(parsed.checkedAt);
  if (cliVersion && cliCheckedAt) {
    return { checkedAt: cliCheckedAt, latestVersion: cliVersion, schema: 'cli' };
  }

  const hookVersion = readNonEmptyString(parsed.version);
  const hookCheckedAt = epochToIsoString(parsed.timestamp);
  if (hookVersion && hookCheckedAt) {
    return { checkedAt: hookCheckedAt, latestVersion: hookVersion, schema: 'hook' };
  }

  return null;
}

/**
 * Read the cache at `cachePath`; `null` (no resolvable home, #1820) means "no cache".
 *
 * Never throws: {@link readSelfUpdateCache} swallows read and parse errors.
 */
function readCacheAt(cachePath: string | null): SelfUpdateCache | null {
  // Keep this guard: `existsSync(null)` returns false in both Bun and Node, so removing it
  // is invisible to Bun tests. Node, however, also prints a DEP0187 DeprecationWarning
  // ("Passing invalid argument types to fs.existsSync is deprecated") to stderr, once per
  // process (on the first such call; measured with `node -e` on v25.6.1).
  return cachePath === null ? null : readSelfUpdateCache(cachePath);
}

/**
 * True for errors raised by the OS through `node:fs` (ENOTDIR, EACCES, EISDIR, ...): a string
 * `code` AND a numeric `errno`. A string `code` alone is not enough: Node's own argument
 * validation errors (e.g. `ERR_INVALID_ARG_TYPE` from `dirname(null)`) carry one too, but no
 * `errno` (measured on node v25.6.1 and Bun).
 */
function isFileSystemError(error: unknown): boolean {
  // `?? {}` covers a thrown null/undefined; destructuring a primitive is harmless
  const { code, errno } = (error ?? {}) as { code?: unknown; errno?: unknown };
  return typeof code === 'string' && typeof errno === 'number';
}

/**
 * Persist the cache at `cachePath`; `null` (no resolvable home, #1820) skips the write.
 *
 * Never throws because of the filesystem. The cache is only an optimization, so any mkdir/write
 * failure (ENOTDIR, EACCES, EROFS, EISDIR, ...) is swallowed: callers such as `doctor` and
 * `init` must still get the npm result. Programming errors (a TypeError from a bad path, a
 * RangeError from an invalid `now`) are NOT filesystem errors and are re-thrown.
 */
function writeCache(cachePath: string | null, latestVersion: string, now: number): void {
  if (cachePath === null) {
    return;
  }
  try {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const payload: SelfUpdateCacheFile = {
      checkedAt: new Date(now).toISOString(),
      latestVersion,
      // Mirror of the two fields the bash hook readers grep for. `timestamp` MUST stay in
      // epoch seconds — `omcustom-auto-update.sh` compares it against `date +%s`.
      version: latestVersion,
      timestamp: Math.floor(now / 1000),
      source: 'omcustom-cli',
    };
    writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  } catch (error: unknown) {
    // Best-effort cache: a failed write only means the next run queries npm again.
    if (!isFileSystemError(error)) {
      throw error;
    }
  }
}

function isCacheFresh(cache: SelfUpdateCache, now: number, cacheTtlMs: number): boolean {
  const checkedAt = new Date(cache.checkedAt).getTime();
  if (Number.isNaN(checkedAt)) {
    return false;
  }
  const age = now - checkedAt;
  // Corruption guard: without this, a timestamp far in the future yields a negative age,
  // which is always `< cacheTtlMs` — the cache would never expire.
  if (age < -cacheTtlMs) {
    return false;
  }
  return age < cacheTtlMs;
}

/**
 * Fetch latest package version from npm registry via npm CLI.
 */
export function fetchLatestVersionFromNpm(
  packageName: string = DEFAULT_PACKAGE_NAME
): string | null {
  try {
    const output = execSync(`npm view ${packageName} version --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 3000,
    }).trim();

    if (!output) {
      return null;
    }

    let version: string;
    if (output.startsWith('"')) {
      version = JSON.parse(output) as string;
    } else {
      version = output;
    }

    const normalized = normalizeVersion(version);
    return normalized || null;
  } catch {
    return null;
  }
}

function printContinuationSpacing(): void {
  console.log('');
}

function printContinueCurrentVersion(): void {
  console.warn(i18n.t('cli.selfUpdate.continueAfterFailure'));
  printContinuationSpacing();
}

function runNpxRelaunch(
  packageName: string,
  latestVersion: string,
  argv: string[],
  env: NodeJS.ProcessEnv
): void {
  console.log(i18n.t('cli.selfUpdate.updatingNpx', { version: latestVersion }));
  const forwardedArgs = argv.slice(2);
  const child = spawnSync('npx', ['-y', `${packageName}@${latestVersion}`, ...forwardedArgs], {
    stdio: 'inherit',
    env: {
      ...env,
      OMCUSTOM_SKIP_SELF_UPDATE: 'true',
    },
  });

  if ((child.status ?? 1) === 0) {
    process.exit(0);
  }

  const status = child.status ?? -1;
  console.warn(i18n.t('cli.selfUpdate.relaunchFailed', { status }));
  printContinueCurrentVersion();
}

/**
 * Run `npm install -g` for the init self-update.
 * Returns true when the install succeeded; failures are reported and are non-blocking.
 */
function runGlobalUpdate(packageName: string, latestVersion: string): boolean {
  try {
    console.log(i18n.t('cli.selfUpdate.updatingGlobal', { version: latestVersion }));
    execSync(`npm install -g ${packageName}@${latestVersion}`, {
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log(i18n.t('cli.selfUpdate.updated', { version: latestVersion }));
    printContinuationSpacing();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(i18n.t('cli.selfUpdate.failed', { error: errorMessage }));
    printContinueCurrentVersion();
    return false;
  }
}

/**
 * Exit code for a finished child process: 128 + signal number when it was killed by a known
 * signal, otherwise its own status (1 when the status is unavailable).
 */
export function exitCodeForChild(child: {
  status: number | null;
  signal: NodeJS.Signals | null;
}): number {
  if (child.signal) {
    const signalNumber = osConstants.signals[child.signal];
    if (signalNumber !== undefined) {
      return 128 + signalNumber;
    }
    // Unknown signal name — fall through to status-based exit
  }
  return child.status ?? 1;
}

/**
 * `{ version }` when `<dir>/package.json` is the `packageName` package (version is null when it
 * has none), undefined when there is no readable package.json for that package at this level.
 */
function readOwnPackageVersion(
  dir: string,
  packageName: string,
  readText: (path: string) => string
): { version: string | null } | undefined {
  try {
    const parsed: unknown = JSON.parse(readText(join(dir, 'package.json')));
    if (isJsonRecord(parsed) && parsed.name === packageName) {
      return { version: readNonEmptyString(parsed.version) };
    }
  } catch {
    // Missing or invalid package.json at this level
  }
  return undefined;
}

/**
 * Version of the `packageName` package that owns the CLI entry file, or null.
 *
 * Resolves symlinks (a global bin is a symlink into the package), then walks up the
 * directories looking for a package.json whose `name` is `packageName`. Unreadable, invalid or
 * differently named package.json files are skipped (e.g. a `dist/package.json` stub).
 */
export function findInstalledPackageVersion(
  entryPath: string,
  packageName: string,
  deps: Pick<InitReexecDeps, 'realpathFn' | 'readFileFn'> = {}
): string | null {
  const realpath = deps.realpathFn ?? realpathSync;
  const readText = deps.readFileFn ?? ((path: string) => readFileSync(path, 'utf-8'));

  let startDir: string;
  try {
    startDir = dirname(realpath(entryPath));
  } catch {
    return null;
  }

  const search = (dir: string): string | null => {
    const own = readOwnPackageVersion(dir, packageName, readText);
    if (own) {
      return own.version;
    }
    const parent = dirname(dir);
    return parent === dir ? null : search(parent);
  };
  return search(startDir);
}

/**
 * After a successful `npm install -g` on the init path, re-run the CLI so the rest of init uses
 * the NEWLY installed code. Without this, init keeps the old in-memory modules and the old
 * `packageJson.version` and silently installs the old templates.
 *
 * Re-exec only happens when the binary that is running resolves to a package whose version
 * equals the version just installed. npm may have installed into a different prefix than the
 * binary on PATH; in that case (or when the version cannot be determined) a warning naming both
 * versions is printed and init continues with the current version.
 *
 * Returns true when the child was started and the exit function was called, false when init
 * should continue in this process.
 */
function reexecAfterGlobalUpdate(
  packageName: string,
  installedVersion: string,
  currentVersion: string,
  argv: string[],
  env: NodeJS.ProcessEnv,
  deps: InitReexecDeps = {}
): boolean {
  const installed = normalizeVersion(installedVersion);
  const entry = argv[1];
  const binaryVersion = entry ? findInstalledPackageVersion(entry, packageName, deps) : null;
  const warnParams = { installed, current: currentVersion, package: packageName };

  if (!entry || binaryVersion === null) {
    console.warn(i18n.t('cli.selfUpdate.reexecVersionUnknown', warnParams));
    printContinueCurrentVersion();
    return false;
  }

  if (normalizeVersion(binaryVersion) !== installed) {
    console.warn(
      i18n.t('cli.selfUpdate.reexecVersionMismatch', {
        ...warnParams,
        binary: normalizeVersion(binaryVersion),
      })
    );
    printContinueCurrentVersion();
    return false;
  }

  console.log(i18n.t('cli.selfUpdate.reexec', { version: installed }));
  const spawn: ReexecSpawnFn = deps.spawnFn ?? spawnSync;
  const child = spawn(process.execPath, [entry, ...argv.slice(2)], {
    stdio: 'inherit',
    env: { ...env, OMCUSTOM_SKIP_SELF_UPDATE: 'true' },
  });

  if (child.error) {
    console.warn(i18n.t('cli.selfUpdate.reexecSpawnFailed', { error: child.error.message }));
    printContinueCurrentVersion();
    return false;
  }

  const exit = deps.exitFn ?? ((code: number) => process.exit(code));
  exit(exitCodeForChild(child));
  return true;
}

export interface ExecuteSelfUpdateOptions {
  /** Current package version. Defaults to the version in package.json. */
  currentVersion?: string;
  silent?: boolean;
  packageName?: string;
  cachePath?: string;
  cacheTtlMs?: number;
  /** Bypass self-update-cache.json TTL and always query npm view fresh. */
  forceRefresh?: boolean;
  fetchLatestVersion?: (packageName: string) => string | null;
  now?: number;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface ExecuteSelfUpdateResult {
  updated: boolean;
  fromVersion: string;
  toVersion: string;
}

/**
 * Returns true when the environment indicates self-update should be skipped.
 */
function shouldSkipEnvironmentUpdate(argv: string[], env: NodeJS.ProcessEnv): boolean {
  if (isNpxInvocation(argv, env)) return true;
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') return true;
  if (env.OMCUSTOM_SKIP_SELF_UPDATE === 'true') return true;
  return false;
}

/**
 * Run `npm install -g` to install the given package version.
 * Returns true if the installation succeeded.
 */
function installGlobalPackage(packageName: string, version: string, silent: boolean): boolean {
  try {
    execSync(`npm install -g ${packageName}@${version}`, {
      stdio: silent ? 'pipe' : 'inherit',
      timeout: 60000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute self-update for `omcustom update` command.
 *
 * Unlike `maybeHandleSelfUpdateForInit`, this function:
 * - Does NOT prompt the user (always updates if outdated)
 * - Does NOT call process.exit()
 * - Returns a result object so the caller can continue
 * - Skips silently for npx invocations (npx always fetches latest)
 */
export function executeSelfUpdate(options: ExecuteSelfUpdateOptions = {}): ExecuteSelfUpdateResult {
  const packageName = options.packageName || DEFAULT_PACKAGE_NAME;
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const currentVersion = normalizeVersion(
    options.currentVersion || (packageJson.version as string) || ''
  );

  const noUpdate: ExecuteSelfUpdateResult = {
    updated: false,
    fromVersion: currentVersion,
    toVersion: currentVersion,
  };

  if (shouldSkipEnvironmentUpdate(argv, env)) {
    return noUpdate;
  }

  const checkOptions: SelfUpdateOptions = {
    currentVersion,
    packageName,
    cachePath: options.cachePath,
    cacheTtlMs: options.forceRefresh ? 0 : options.cacheTtlMs,
    fetchLatestVersion: options.fetchLatestVersion,
    now: options.now,
    argv,
    env,
  };

  const result = checkSelfUpdate(checkOptions);

  if (!result.checked || !result.updateAvailable || !result.latestVersion) {
    return noUpdate;
  }

  const latestVersion = result.latestVersion;

  if (!options.silent) {
    console.log(i18n.t('cli.selfUpdate.updatingGlobal', { version: latestVersion }));
  }

  const installed = installGlobalPackage(packageName, latestVersion, options.silent ?? false);

  if (installed) {
    if (!options.silent) {
      console.log(i18n.t('cli.selfUpdate.updated', { version: latestVersion }));
      printContinuationSpacing();
    }
    return { updated: true, fromVersion: currentVersion, toVersion: latestVersion };
  }

  if (!options.silent) {
    console.warn(i18n.t('cli.selfUpdate.failed', { error: 'npm install failed' }));
  }
  return noUpdate;
}

/**
 * Core check with cache support.
 *
 * Never throws because of the cache: a missing, unreadable or unwritable cache only means
 * the npm lookup runs. The `cachePath` fallback uses `||` on purpose, so an empty string
 * selects the default path instead of reaching `writeFileSync('')` (ENOENT).
 */
export function checkSelfUpdate(options: SelfUpdateOptions): SelfUpdateCheckResult {
  const packageName = options.packageName || DEFAULT_PACKAGE_NAME;
  // null = no usable home: skip cache reads and writes, the npm lookup still runs (#1820)
  const cachePath = options.cachePath || resolveSelfUpdateCachePath();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const fetchLatestVersion = options.fetchLatestVersion || fetchLatestVersionFromNpm;
  const now = options.now ?? Date.now();
  const currentVersion = normalizeVersion(options.currentVersion);

  if (!currentVersion) {
    return {
      checked: false,
      updateAvailable: false,
      latestVersion: null,
      usedCache: false,
      reason: 'invalid-current-version',
    };
  }

  let latestVersion: string | null = null;
  let usedCache = false;
  const cache = readCacheAt(cachePath);

  if (cache && isCacheFresh(cache, now, cacheTtlMs)) {
    const cachedVersion = normalizeVersion(cache.latestVersion);
    if (isVersionPlausible(currentVersion, cachedVersion)) {
      latestVersion = cachedVersion;
      usedCache = true;
    }
    // Implausible cached version silently ignored — will re-fetch below
  }

  if (!latestVersion) {
    const fetched = fetchLatestVersion(packageName);
    // Live npm fetch is authoritative — bypass cache-corruption guards.
    if (fetched && isVersionPlausible(currentVersion, fetched, { live: true })) {
      latestVersion = fetched;
      writeCache(cachePath, latestVersion, now);
    }
  }

  if (!latestVersion) {
    return {
      checked: false,
      updateAvailable: false,
      latestVersion: null,
      usedCache,
      reason: 'lookup-failed',
    };
  }

  return {
    checked: true,
    updateAvailable: compareSemver(currentVersion, latestVersion) < 0,
    latestVersion,
    usedCache,
  };
}

async function promptForSelfUpdate(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(i18n.t('cli.selfUpdate.prompt'));
    const normalized = answer.trim().toLowerCase();
    return normalized === '' || normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

function shouldSkipSelfUpdate(options: SelfUpdateOptions): boolean {
  const env = options.env || process.env;
  const argv = options.argv || process.argv;

  if (options.skip) {
    return true;
  }
  if (argv.includes('--skip-version-check')) {
    return true;
  }
  if (env.OMCUSTOM_SKIP_SELF_UPDATE === 'true') {
    return true;
  }
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') {
    return true;
  }
  if (!isInteractiveSession()) {
    return true;
  }
  return false;
}

/**
 * Prompt self-update before `init` in interactive local sessions.
 */
export async function maybeHandleSelfUpdateForInit(options: SelfUpdateOptions): Promise<void> {
  if (shouldSkipSelfUpdate(options)) {
    return;
  }

  const packageName = options.packageName || DEFAULT_PACKAGE_NAME;
  const currentVersion = normalizeVersion(options.currentVersion);
  const argv = options.argv || process.argv;
  const env = options.env || process.env;

  if (!currentVersion) {
    return;
  }

  console.log(i18n.t('cli.selfUpdate.checking'));
  const result = checkSelfUpdate(options);

  if (!result.checked || !result.updateAvailable || !result.latestVersion) {
    return;
  }

  const latestVersion = result.latestVersion;
  console.log(
    i18n.t('cli.selfUpdate.available', { current: currentVersion, latest: latestVersion })
  );

  const wantsUpdate = await promptForSelfUpdate();
  if (!wantsUpdate) {
    console.log(i18n.t('cli.selfUpdate.declined'));
    printContinuationSpacing();
    return;
  }

  if (isNpxInvocation(argv, env)) {
    runNpxRelaunch(packageName, latestVersion, argv, env);
    return;
  }

  if (runGlobalUpdate(packageName, latestVersion)) {
    reexecAfterGlobalUpdate(
      packageName,
      latestVersion,
      currentVersion,
      argv,
      env,
      options.reexecDeps
    );
  }
}

/**
 * Self-update for the oh-my-customcode CLI.
 * `omcustom init` and `omcustom update` call {@link autoSelfUpdate} before doing any work.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { i18n } from '../i18n/index.js';
import { isCiEnvironment } from '../utils/ci.js';
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
 * True when `path` is inside `dir` after symlink resolution (a global bin is a symlink into the
 * package under npm's global root). Unresolvable paths are compared as given.
 */
export function isPathInside(
  path: string,
  dir: string,
  realpathFn: (p: string) => string = realpathSync
): boolean {
  if (!path || !dir) return false;
  const real = (p: string): string => {
    try {
      return realpathFn(p);
    } catch {
      return p;
    }
  };
  const root = real(dir);
  return real(path).startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

/**
 * Detect npx / npm exec style invocation.
 *
 * The decision rests on argv[1] (an `_npx` cache path). The `npm_*` environment signals are
 * inherited by every child of `npm exec`/`npm run`, so they only count when argv[1] is not inside
 * npm's global root (`globalRoot`, when known): a global binary started from such a shell is not
 * an npx run.
 */
export function isNpxInvocation(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  globalRoot?: string | null,
  realpathFn?: (p: string) => string
): boolean {
  const argv1 = argv[1] || '';
  if (argv1.includes('/_npx/') || argv1.includes('\\_npx\\')) {
    return true;
  }
  if (globalRoot && isPathInside(argv1, globalRoot, realpathFn)) {
    return false;
  }

  const npmExecPath = env.npm_execpath || '';
  const npmCommand = env.npm_command || '';
  return npmExecPath.includes('npx') || npmCommand === 'exec' || env.npm_lifecycle_event === 'npx';
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
  packageName: string = DEFAULT_PACKAGE_NAME,
  exit: (code: number) => void = defaultExit
): string | null {
  try {
    const output = runChild(
      () =>
        execSync(`npm view ${packageName} version --json`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 3000,
        }),
      exit
    ).trim();

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
  } catch (error) {
    if (error instanceof SelfUpdateInterruptedError) {
      throw error;
    }
    return null;
  }
}

function printContinuationSpacing(): void {
  console.log('');
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

export type AutoSelfUpdateCommand = 'init' | 'update';

/** Runs a command and returns its trimmed stdout, or null when it failed or timed out. */
export type ProbeFn = (command: string, args: string[], env: NodeJS.ProcessEnv) => string | null;

/** Injectable side effects of {@link autoSelfUpdate}; tests replace npm, spawn and exit. */
export interface AutoSelfUpdateDeps extends InitReexecDeps {
  /** Installs `<packageName>@<version>` globally; throws when the install fails. */
  installFn?: (packageName: string, version: string) => void;
  /** `npm root -g`, or null when it cannot be determined. */
  globalRootFn?: () => string | null;
  /** Starts the target with `--version` before the real re-exec. */
  probeFn?: ProbeFn;
}

export interface AutoSelfUpdateOptions extends Omit<SelfUpdateOptions, 'cacheTtlMs'> {
  /** Command being run; named in the restart notice. */
  command: AutoSelfUpdateCommand;
  deps?: AutoSelfUpdateDeps;
}

/**
 * What {@link autoSelfUpdate} did:
 * - `skipped`: a skip condition applied (npm was not queried), or the CLI is not under npm's
 *   global root so nothing was installed (the "Self-update skipped" notice was printed)
 * - `up-to-date`: npm reports no newer version
 * - `failed`: lookup or install failed, or the new CLI could not be verified or started
 * - `relaunched`: the command was re-run on the new CLI and the exit function was called
 * - `interrupted`: Ctrl+C ended a child (npm view/root/install, the `--version` probe); the exit
 *   function was called with 130 (only observable when it is replaced, as in tests)
 */
export type AutoSelfUpdateOutcome =
  | 'skipped'
  | 'up-to-date'
  | 'failed'
  | 'relaunched'
  | 'interrupted';

/**
 * True when no self-update must run: the caller's `skip`, `--skip-version-check`, `--skip-self`,
 * `OMCUSTOM_SKIP_SELF_UPDATE=true`, or a CI environment (see {@link isCiEnvironment}). TTY state
 * does not matter.
 */
export function shouldSkipAutoSelfUpdate(
  options: Pick<SelfUpdateOptions, 'skip' | 'argv' | 'env'>
): boolean {
  const env = options.env || process.env;
  const argv = options.argv || process.argv;
  return (
    Boolean(options.skip) ||
    argv.includes('--skip-version-check') ||
    argv.includes('--skip-self') ||
    env.OMCUSTOM_SKIP_SELF_UPDATE === 'true' ||
    isCiEnvironment(env)
  );
}

// No timeout: npm may be mid-reify when a timer would SIGTERM it, and the user sees its progress.
function installGlobalPackage(
  packageName: string,
  version: string,
  exit: (code: number) => void
): void {
  runChild(() => execSync(`npm install -g ${packageName}@${version}`, { stdio: 'inherit' }), exit);
}

function npmGlobalRoot(exit: (code: number) => void): string | null {
  try {
    const output = runChild(
      () => execSync('npm root -g', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 }),
      exit
    );
    return output.trim() || null;
  } catch (error) {
    if (error instanceof SelfUpdateInterruptedError) {
      throw error;
    }
    return null;
  }
}

function probeVersion(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  exit: (code: number) => void
): string | null {
  // npx may download the package first, a local binary starts at once
  const child = runChild(
    () =>
      spawnSync(command, args, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: command === 'npx' ? 120000 : 30000,
        env,
      }),
    exit
  );
  return child.error || child.status !== 0 ? null : String(child.stdout ?? '').trim();
}

/** First line of an error message, so the failure notice stays on one line. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0]?.trim() || 'unknown error';
}

/** True when `--version` output names exactly `expected`. */
function reportsVersion(output: string | null, expected: string): boolean {
  const wanted = normalizeVersion(expected);
  return output?.split(/\s+/).some((token) => normalizeVersion(token) === wanted) ?? false;
}

/** Prints the one-line failure notice: the reason, the manual command and `--skip-self`. */
function warnAutoFailed(packageName: string, currentVersion: string, reason: string): void {
  console.warn(
    i18n.t('cli.selfUpdate.autoFailed', { package: packageName, current: currentVersion, reason })
  );
}

/** Thrown after the exit function returned (tests only): stops the update flow at once. */
export class SelfUpdateInterruptedError extends Error {
  constructor() {
    super('self-update interrupted by SIGINT');
    this.name = 'SelfUpdateInterruptedError';
  }
}

const SIGINT_EXIT_CODE = 130;
const defaultExit = (code: number): void => process.exit(code);

/**
 * True when a finished child (a `spawnSync` result or the error `execSync` throws) ended because
 * of Ctrl+C: killed by SIGINT, or exited 130 after handling it. Measured on Node 25.6.1 with a
 * group SIGINT: a child without a handler gives `signal: 'SIGINT'`, a child that traps SIGINT and
 * calls `exit 130` gives `status: 130` and no signal.
 */
function endedBySigint(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { status, signal } = value as { status?: unknown; signal?: unknown };
  return signal === 'SIGINT' || status === SIGINT_EXIT_CODE;
}

/** Ctrl+C ended a child: stop with exit code 130 instead of carrying on into project updates. */
function abortOnSigint(exit: (code: number) => void): never {
  exit(SIGINT_EXIT_CODE);
  throw new SelfUpdateInterruptedError();
}

/**
 * Runs a child with SIGINT held by this process (see {@link withSigintIgnored}). If Ctrl+C ended
 * the child, the process exits 130 through `exit` rather than treating it as an ordinary failure.
 * The check happens on the child's result, not in a SIGINT listener: the event loop is blocked
 * while a sync child runs, so no listener ordering is assumed.
 */
function runChild<T>(run: () => T, exit: (code: number) => void): T {
  let result: T;
  try {
    result = withSigintIgnored(run);
  } catch (error) {
    if (endedBySigint(error)) {
      abortOnSigint(exit);
    }
    throw error;
  }
  if (endedBySigint(result)) {
    abortOnSigint(exit);
  }
  return result;
}

/**
 * Runs `run` with SIGINT ignored by this process (#1948). Ctrl+C reaches the whole foreground
 * process group, so the re-run child already receives it; without a handler the parent would die
 * at once and the shell would see the parent's signal death while a child that handles SIGINT
 * keeps running. With the handler installed the signal is held until the child exits, and the
 * child's own exit code (or terminating signal) is what the parent reports.
 */
export function withSigintIgnored<T>(run: () => T): T {
  const ignore = (): void => {};
  process.on('SIGINT', ignore);
  try {
    return run();
  } finally {
    process.off('SIGINT', ignore);
  }
}

interface RelaunchContext {
  packageName: string;
  currentVersion: string;
  /** Version that was just resolved from npm (npx) or installed (global). */
  version: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  deps: AutoSelfUpdateDeps;
}

/**
 * Prove that the target starts (`<target> --version` reports `version`), then run it with the
 * original arguments and exit with its exit code. Returns false (after the one-line notice) when
 * the probe or the start fails, so the caller continues with the current version.
 */
function probeAndRelaunch(
  context: RelaunchContext,
  command: string,
  prefixArgs: string[],
  announce: () => void
): boolean {
  const { packageName, currentVersion, version, argv, deps } = context;
  const env = { ...context.env, OMCUSTOM_SKIP_SELF_UPDATE: 'true' };

  const exit = deps.exitFn ?? defaultExit;
  const probe = deps.probeFn ?? ((cmd, args, probeEnv) => probeVersion(cmd, args, probeEnv, exit));
  if (!reportsVersion(probe(command, [...prefixArgs, '--version'], env), version)) {
    warnAutoFailed(packageName, currentVersion, i18n.t('cli.selfUpdate.reasonProbe', { version }));
    return false;
  }

  announce();
  const spawn: ReexecSpawnFn = deps.spawnFn ?? spawnSync;
  const child = withSigintIgnored(() =>
    spawn(command, [...prefixArgs, ...argv.slice(2)], { stdio: 'inherit', env })
  );
  if (child.error) {
    warnAutoFailed(packageName, currentVersion, child.error.message);
    return false;
  }
  exit(exitCodeForChild(child));
  return true;
}

/**
 * Re-run the command through `npx -y <package>@<version>` (the version npm just reported, so the
 * probe and the real run use the same package).
 */
function relaunchViaNpx(context: RelaunchContext): boolean {
  // Announced before the probe: the first `npx -y` run may download the package for a while
  console.log(i18n.t('cli.selfUpdate.updatingNpx', { version: context.version }));
  return probeAndRelaunch(
    context,
    'npx',
    ['-y', `${context.packageName}@${context.version}`],
    () => {}
  );
}

/**
 * After a successful `npm install -g`, re-run the CLI so the rest of `init`/`update` uses the NEWLY
 * installed code. Without this, the command keeps the old in-memory modules and the old
 * `packageJson.version` and silently installs the old templates.
 *
 * Re-exec only happens when the binary that is running resolves to a package whose version equals
 * the version just installed and that binary answers `--version` with it. Otherwise one notice is
 * printed and the command continues with the current version.
 */
function relaunchAfterGlobalInstall(context: RelaunchContext, command: AutoSelfUpdateCommand) {
  const { packageName, currentVersion, argv, deps } = context;
  const installed = normalizeVersion(context.version);
  const entry = argv[1];
  const binaryVersion = entry ? findInstalledPackageVersion(entry, packageName, deps) : null;
  const warnParams = { installed, current: currentVersion, package: packageName };

  if (!entry || binaryVersion === null) {
    console.warn(i18n.t('cli.selfUpdate.reexecVersionUnknown', warnParams));
    return false;
  }
  if (normalizeVersion(binaryVersion) !== installed) {
    console.warn(
      i18n.t('cli.selfUpdate.reexecVersionMismatch', {
        ...warnParams,
        binary: normalizeVersion(binaryVersion),
      })
    );
    return false;
  }

  return probeAndRelaunch(context, process.execPath, [entry], () =>
    console.log(i18n.t('cli.selfUpdate.reexec', { version: installed, command }))
  );
}

/** `npm install -g` of the resolved version; prints the one-line notice and returns false on failure. */
function installLatest(context: RelaunchContext): boolean {
  const { packageName, currentVersion, version, deps } = context;
  try {
    console.log(i18n.t('cli.selfUpdate.updatingGlobal', { version }));
    const exit = deps.exitFn ?? defaultExit;
    (deps.installFn ?? ((name, ver) => installGlobalPackage(name, ver, exit)))(
      packageName,
      version
    );
  } catch (error) {
    if (error instanceof SelfUpdateInterruptedError) {
      throw error;
    }
    warnAutoFailed(packageName, currentVersion, firstLine(error));
    return false;
  }
  console.log(i18n.t('cli.selfUpdate.updated', { version }));
  printContinuationSpacing();
  return true;
}

/**
 * Route to the right update path for how this CLI was started: npx re-run, a CLI that npm does not
 * manage (left alone), or a global install followed by a verified re-run.
 */
function updateAndRelaunch(
  context: RelaunchContext,
  command: AutoSelfUpdateCommand
): Extract<AutoSelfUpdateOutcome, 'skipped' | 'failed' | 'relaunched'> {
  const { argv, env, deps } = context;
  const outcome = (ok: boolean) => (ok ? 'relaunched' : 'failed');
  // A definite npx run (argv[1] in the _npx cache) needs no `npm root -g`
  if (isNpxInvocation(argv, {})) {
    return outcome(relaunchViaNpx(context));
  }
  const globalRoot = (deps.globalRootFn ?? (() => npmGlobalRoot(deps.exitFn ?? defaultExit)))();
  if (isNpxInvocation(argv, env, globalRoot, deps.realpathFn)) {
    return outcome(relaunchViaNpx(context));
  }
  if (globalRoot && !isPathInside(argv[1] ?? '', globalRoot, deps.realpathFn)) {
    // The notice says "Self-update skipped", so the outcome agrees (#1948)
    console.warn(i18n.t('cli.selfUpdate.notNpmGlobal', { path: argv[1] ?? '', root: globalRoot }));
    return 'skipped';
  }
  return outcome(installLatest(context) && relaunchAfterGlobalInstall(context, command));
}

/**
 * Update the CLI to the latest published version before `init` or `update` does any work.
 *
 * No prompt, in TTY and non-TTY sessions alike; npm is queried fresh on every run (no cache TTL).
 * Under npx the command is re-run through `npx -y <package>@<version>`. Otherwise, when the running
 * CLI lives under npm's global root, the latest version is installed globally and the running
 * binary's version is verified. Either way the target must answer `--version` with the expected
 * version before the command is re-run on it with `OMCUSTOM_SKIP_SELF_UPDATE=true` (the child's
 * exit code becomes this process's exit code). A CLI installed by another package manager is left
 * alone. Every failure prints one notice naming the manual command and lets the command continue.
 * Ctrl+C is not a failure: when it ends any child, the process exits 130 and does not continue.
 */
export function autoSelfUpdate(options: AutoSelfUpdateOptions): AutoSelfUpdateOutcome {
  try {
    return runAutoSelfUpdate(options);
  } catch (error) {
    // The exit function already ran with 130; only reached when it returns (tests)
    if (error instanceof SelfUpdateInterruptedError) {
      return 'interrupted';
    }
    throw error;
  }
}

function runAutoSelfUpdate(options: AutoSelfUpdateOptions): AutoSelfUpdateOutcome {
  if (shouldSkipAutoSelfUpdate(options)) {
    return 'skipped';
  }

  const packageName = options.packageName || DEFAULT_PACKAGE_NAME;
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const deps = options.deps ?? {};
  const currentVersion = normalizeVersion(options.currentVersion);

  const result = checkSelfUpdate({
    ...options,
    cacheTtlMs: 0,
    fetchLatestVersion:
      options.fetchLatestVersion ??
      ((name) => fetchLatestVersionFromNpm(name, deps.exitFn ?? defaultExit)),
  });
  if (!result.checked || !result.latestVersion) {
    warnAutoFailed(packageName, currentVersion, i18n.t('cli.selfUpdate.reasonLookup'));
    return 'failed';
  }
  if (!result.updateAvailable) {
    return 'up-to-date';
  }

  const context: RelaunchContext = {
    packageName,
    currentVersion,
    version: result.latestVersion,
    argv,
    env,
    deps,
  };
  return updateAndRelaunch(context, options.command);
}

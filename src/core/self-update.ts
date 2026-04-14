/**
 * Self-update check for oh-my-customcode CLI
 * Runs before `omcustom init` in interactive sessions.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import packageJson from '../../package.json';
import { i18n } from '../i18n/index.js';

const DEFAULT_PACKAGE_NAME = 'oh-my-customcode';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_PATH = join(homedir(), '.oh-my-customcode', 'self-update-cache.json');

interface SelfUpdateCache {
  checkedAt: string;
  latestVersion: string;
}

export interface SelfUpdateCheckResult {
  checked: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  usedCache: boolean;
  reason?: string;
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

/**
 * Sanity check: reject cached versions that are implausibly far from current.
 * A major version change or a minor jump of 10+ is almost certainly cache corruption.
 */
export function isVersionPlausible(currentVersion: string, candidateVersion: string): boolean {
  const current = normalizeVersion(currentVersion)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const candidate = normalizeVersion(candidateVersion)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const majorDiff = (candidate[0] ?? 0) - (current[0] ?? 0);
  const minorDiff = (candidate[1] ?? 0) - (current[1] ?? 0);

  // Reject if major version changes at all (0.x → 1.x is suspicious without live confirmation)
  if (majorDiff >= 1) {
    return false;
  }

  // Reject if minor jumps by 10+ within same major (0.68 → 0.78+ is implausible in one cache TTL)
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

function readCache(cachePath: string): SelfUpdateCache | null {
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8')) as Partial<SelfUpdateCache>;
    if (!parsed.checkedAt || !parsed.latestVersion) {
      return null;
    }
    return {
      checkedAt: parsed.checkedAt,
      latestVersion: parsed.latestVersion,
    };
  } catch {
    return null;
  }
}

function writeCache(cachePath: string, latestVersion: string, now: number): void {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const payload: SelfUpdateCache = {
    checkedAt: new Date(now).toISOString(),
    latestVersion,
  };
  writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function isCacheFresh(cache: SelfUpdateCache, now: number, cacheTtlMs: number): boolean {
  const checkedAt = new Date(cache.checkedAt).getTime();
  if (Number.isNaN(checkedAt)) {
    return false;
  }
  return now - checkedAt < cacheTtlMs;
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

function runGlobalUpdate(packageName: string, latestVersion: string): void {
  try {
    console.log(i18n.t('cli.selfUpdate.updatingGlobal', { version: latestVersion }));
    execSync(`npm install -g ${packageName}@${latestVersion}`, {
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log(i18n.t('cli.selfUpdate.updated', { version: latestVersion }));
    printContinuationSpacing();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(i18n.t('cli.selfUpdate.failed', { error: errorMessage }));
    printContinueCurrentVersion();
  }
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
 */
export function checkSelfUpdate(options: SelfUpdateOptions): SelfUpdateCheckResult {
  const packageName = options.packageName || DEFAULT_PACKAGE_NAME;
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
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
  const cache = readCache(cachePath);

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
    if (fetched && isVersionPlausible(currentVersion, fetched)) {
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

  runGlobalUpdate(packageName, latestVersion);
}

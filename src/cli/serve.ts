/**
 * Background web server management for omcustom CLI
 * Manages the lifecycle of the packages/serve SvelteKit server process
 *
 * PID protocol — known limits and design decisions (#1825):
 * - A start that ends without running cleanup (e.g. SIGKILL; this module
 *   installs no signal handlers) after the spawn but before the PID file is
 *   replaced leaves a detached server that nothing tracks. Accepted limit.
 * - The protocol is not collapsed into one `wx` lock file that serialises every
 *   operation. That would rewrite a design that has passed two adversarial
 *   reviews (#1822), for a regression risk larger than the gain.
 * - A server record never ages out: when its PID now belongs to another user's
 *   process (EPERM, e.g. after a reboot) it still counts as running. Expiring it
 *   by boot time (`Date.now() - os.uptime()`) was rejected: a clock step after
 *   boot (NTP) could mark a live server's record stale and break the
 *   one-server guarantee. The start message tells the user how to clear it.
 * - Processes in different PID namespaces that share one HOME (e.g. containers
 *   with a mounted home) are unsupported: a PID recorded in one namespace
 *   means nothing in another.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import {
  access,
  link,
  readdir,
  readFile,
  readlink,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { type HomeSources, resolveHomeDir } from '../utils/home.js';

export const DEFAULT_PORT = 4321;

const PID_FILE_NAME = '.omcustom-serve.pid';

/**
 * A start in progress records `starting:<starter pid>:<nonce>` in the PID file
 * until the server's PID replaces it. The nonce makes every claim distinct, so
 * a claim can be told apart from another claim made by the same process.
 */
const STARTING_RECORD = /^starting:(\d+):/;

/** Largest PID `process.kill` accepts (int32). */
const MAX_PID = 2147483647;

/** How often a start re-tries to claim the PID file after removing a stale record. */
const MAX_CLAIM_ATTEMPTS = 3;

/**
 * Age (by mtime) after which a `starting` claim is stale even though its
 * starter PID is alive — that PID may have been reused by an unrelated
 * process after the starter died. Between claim and PID record a start only
 * spawns and renames a file (milliseconds), so a minute is far beyond any
 * real start while bounding how long a leftover claim can block new starts.
 *
 * @internal exported for tests only
 */
export const CLAIM_MAX_AGE_MS = 60_000;

/**
 * Age (by mtime) below which a record that may be partially written (see
 * {@link isPossiblyPartialRecord}) is not reclaimed. Where hard links are
 * unsupported, a record is created with `O_EXCL` and its content written
 * afterwards, so a reader may see it empty or cut short for a moment; ten
 * seconds covers that write with a wide margin.
 *
 * @internal exported for tests only
 */
export const PARTIAL_RECORD_GRACE_MS = 10_000;

/**
 * How long a reader waits before reading an absent PID file once more. A
 * remover takes the PID file away and may put it back a moment later (see
 * {@link removePidFileWhen}), so one absent read is not proof of absence.
 */
const ABSENT_RETRY_DELAY_MS = 10;

/**
 * `link` errors meaning the filesystem does not support hard links (e.g.
 * FAT32/exFAT: `ENOTSUP` on macOS, `EPERM` on Linux), so exclusive creation
 * falls back to an `O_EXCL` write.
 */
const HARD_LINK_UNSUPPORTED = new Set(['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV']);

/**
 * Names of the staged (`.tmp`) and taken (`.taken`) siblings of the PID file,
 * as made by {@link siblingPath}: `<PID file name>.<pid>.<uuid>.<suffix>`.
 */
const SIBLING_REMNANT =
  /^\.omcustom-serve\.pid\.(\d+)\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:tmp|taken)$/;

/**
 * What {@link startServeBackground} did, so a caller never reports a server it
 * did not start:
 * - `started`: this call spawned the server and its PID is recorded
 * - `already-running`: another server is running (the PID file holds its PID;
 *   the port it listens on is not recorded). `notPermitted` is set when that PID
 *   belongs to another user, so the record may be stale

 * - `starting-elsewhere`: another start is in progress, or this call lost the
 *   race for the PID file and stopped the server it had spawned
 * - `build-missing` / `spawn-failed`: nothing was started and nothing runs
 */
export type ServeStartResult =
  | { status: 'started'; pid: number }
  | { status: 'already-running'; pid: number; notPermitted?: true }
  | { status: 'starting-elsewhere' }
  | { status: 'build-missing' }
  | { status: 'spawn-failed' };

/**
 * Why {@link startServeBackground} refused to (keep) a server running:
 * - `home-unresolved`: the home directory is empty or relative, so there is no PID file location
 * - `pid-not-writable`: the PID file (or its directory) cannot be written
 */
export type ServePidFileFailure = 'home-unresolved' | 'pid-not-writable';

/**
 * Thrown by {@link startServeBackground} when the server's PID cannot be recorded.
 * A detached server without a recorded PID could never be found or stopped again.
 */
export class ServePidFileError extends Error {
  readonly reason: ServePidFileFailure;
  /** The PID file path, or `null` when no location could be resolved */
  readonly pidFile: string | null;

  constructor(reason: ServePidFileFailure, pidFile: string | null, options?: ErrorOptions) {
    super(
      reason === 'home-unresolved'
        ? 'Cannot resolve the serve PID file: the home directory is empty or relative'
        : `Cannot write the serve PID file: ${pidFile}`,
      options
    );
    this.name = 'ServePidFileError';
    this.reason = reason;
    this.pidFile = pidFile;
  }
}

/**
 * Thrown by {@link stopServe} when the recorded server process exists but the
 * caller may not signal it (`EPERM`): it belongs to another user, or the PID
 * file is stale and the PID now belongs to an unrelated process. The record is
 * left in place; the process is still reported as running by
 * {@link isServeRunning}.
 */
export class ServeStopPermissionError extends Error {
  readonly pid: number;
  readonly pidFile: string;

  constructor(pid: number, pidFile: string, options?: ErrorOptions) {
    super(`Not permitted to signal the serve process ${pid} recorded in ${pidFile}`, options);
    this.name = 'ServeStopPermissionError';
    this.pid = pid;
    this.pidFile = pidFile;
  }
}

/**
 * Path of the serve PID file (`<home>/.omcustom-serve.pid`).
 *
 * The home directory is resolved on EVERY call (never memoised), so a change
 * to `process.env.HOME` is picked up by the next call.
 *
 * Returns `null` when the resolved home is empty or relative: a relative home
 * would make the PID location depend on the current directory, so `serve` and
 * `serve-stop` run from different directories would disagree about whether a
 * server is running. {@link isServeRunning} and {@link stopServe} treat `null` as
 * "no PID file can exist"; {@link startServeBackground} throws
 * {@link ServePidFileError} `home-unresolved` instead.
 *
 * @param sources - Home-directory sources override (for tests)
 */
export function resolveServePidFile(sources?: HomeSources): string | null {
  const home = resolveHomeDir(sources);
  // An unresolvable home is '' — not absolute either
  if (!isAbsolute(home)) {
    return null;
  }
  return join(home, PID_FILE_NAME);
}

export interface FindServeBuildDirOptions {
  /**
   * When true, skips the npm package fallback path.
   * This is intended for test isolation to prevent real build artifacts
   * from interfering with tests that expect a missing build directory.
   */
  skipNpmFallback?: boolean;
  /**
   * Package root whose `packages/serve/build` is checked by the npm fallback.
   * Defaults to the omcustom package root, resolved two levels above this
   * module (`dist/cli/` when compiled, `src/cli/` from source). Ignored when
   * `skipNpmFallback` is true. Tests inject a temp directory here so they never
   * write into the repository's own `packages/serve`.
   */
  npmPackageRoot?: string;
}

/**
 * Find the built SvelteKit server directory.
 * Checks two locations in order: the local monorepo
 * `<projectRoot>/packages/serve/build`, then the npm fallback
 * `<npmPackageRoot>/packages/serve/build` (the omcustom package root relative
 * to this module unless `options.npmPackageRoot` overrides it). Returns the
 * first directory containing `index.js`, or null when neither does.
 */
export function findServeBuildDir(
  projectRoot: string,
  options?: FindServeBuildDirOptions
): string | null {
  // 1. Monorepo: packages/serve/build (dev / local install)
  const localBuild = join(projectRoot, 'packages', 'serve', 'build');
  if (existsSync(join(localBuild, 'index.js'))) return localBuild;

  // 2. npm global: installed next to dist/ inside the omcustom package
  // __dirname is dist/cli/ when compiled, so go up two levels to package root
  if (options?.skipNpmFallback !== true) {
    const npmPackageRoot = options?.npmPackageRoot ?? join(import.meta.dirname, '..', '..');
    const npmBuild = join(npmPackageRoot, 'packages', 'serve', 'build');
    if (existsSync(join(npmBuild, 'index.js'))) return npmBuild;
  }

  return null;
}

/** A parsed PID file record: a running server, or a start in progress. */
interface PidRecord {
  /** The server's PID, or the starter's PID while `starting` */
  pid: number;
  starting: boolean;
}

/**
 * Parse PID file contents: `<pid>` (a server) or `starting:<pid>:<nonce>`
 * (a start in progress). Returns `null` for anything else.
 */
function parsePidRecord(raw: string): PidRecord | null {
  const text = raw.trim();
  const match = STARTING_RECORD.exec(text);
  const pid = Number(match === null ? text : match[1]);
  // Only a real PID: `process.kill` rejects anything else with a non-errno error
  // that would read as "alive" forever
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > MAX_PID) {
    return null;
  }
  return { pid, starting: match !== null };
}

/** What signal 0 says about a PID: see {@link probeProcess}. */
type ProcessProbe = 'exists' | 'not-permitted' | 'unknown' | 'gone';

/** Probe a PID with signal 0 (existence check only). Only `ESRCH` proves it is gone. */
function probeProcess(pid: number): ProcessProbe {
  try {
    process.kill(pid, 0);
    return 'exists';
  } catch (error: unknown) {
    const code = errorCode(error);
    if (code === 'ESRCH') {
      return 'gone';
    }
    return code === 'EPERM' ? 'not-permitted' : 'unknown';
  }
}

/**
 * Whether a process with this PID may exist.
 *
 * Only `ESRCH` proves a process is gone. `EPERM` means it exists but belongs to
 * another user, and any other errno proves nothing, so both count as alive:
 * wrongly reclaiming a live server's record would let a second server start.
 */
function isProcessAlive(pid: number): boolean {
  return probeProcess(pid) !== 'gone';
}

/** The errno code of a caught error, if any. */
function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/**
 * Whether the file at `path` was last modified at least `ms` ago. A file whose
 * age cannot be read counts as younger: nothing is reclaimed on a guess.
 */
async function isOlderThan(path: string, ms: number): Promise<boolean> {
  try {
    const { mtimeMs } = await stat(path);
    return Date.now() - mtimeMs >= ms;
  } catch {
    return false;
  }
}

/**
 * Whether a parsed record still stands for a live server or start: its
 * process exists and, for a `starting` claim, the claim is younger than
 * {@link CLAIM_MAX_AGE_MS}.
 */
async function isRecordLive(pidFile: string, record: PidRecord): Promise<boolean> {
  if (!isProcessAlive(record.pid)) {
    return false;
  }
  return !record.starting || !(await isOlderThan(pidFile, CLAIM_MAX_AGE_MS));
}

/**
 * Read the PID file for a reader. When it is absent, wait
 * {@link ABSENT_RETRY_DELAY_MS} and read it once more: a remover may have
 * taken it away for a moment and be about to put it back.
 *
 * @throws the second read's error (e.g. `ENOENT` when it is still absent), or
 *   the first read's error when that is not `ENOENT`
 */
async function readPidFileSettled(pidFile: string): Promise<string> {
  try {
    return await readFile(pidFile, 'utf-8');
  } catch (error: unknown) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
  }
  await delay(ABSENT_RETRY_DELAY_MS);
  return readFile(pidFile, 'utf-8');
}

/**
 * Check whether the serve process is currently running.
 *
 * Reads the PID file and sends signal 0 to verify the recorded process exists.
 * A start in progress counts as running while its starter process is alive
 * and its claim is younger than {@link CLAIM_MAX_AGE_MS}.
 * This is a read only: a record that is malformed, or whose process is gone,
 * is reported as not running but never removed — only a start reclaims it
 * (see {@link startServeBackground}). An unreadable PID file (e.g. a
 * directory) is reported as not running; an absent one is read once more
 * before it is (see {@link readPidFileSettled}).
 * Returns `false` when no PID file location can be resolved (see {@link resolveServePidFile}).
 */
export async function isServeRunning(): Promise<boolean> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    return false;
  }
  return isServeRunningAt(pidFile);
}

/**
 * {@link isServeRunning} against an already-resolved PID file path.
 */
async function isServeRunningAt(pidFile: string): Promise<boolean> {
  return (await readLiveRecord(pidFile)) !== null;
}

/** The PID file's record when it stands for a live server or start, else `null`. */
async function readLiveRecord(pidFile: string): Promise<PidRecord | null> {
  let raw: string;
  try {
    raw = await readPidFileSettled(pidFile);
  } catch {
    return null; // absent, or unreadable
  }
  const record = parsePidRecord(raw);
  return record !== null && (await isRecordLive(pidFile, record)) ? record : null;
}

/**
 * The result for a start that found the PID file held by `record` (see
 * {@link claimPidFile}): a running server is `already-running` — flagged
 * `notPermitted` when the PID only proved to exist through `EPERM`, so the
 * caller can say the record may be stale — anything else is `starting-elsewhere`.
 */
function heldResult(record: PidRecord | null): ServeStartResult {
  if (record === null || record.starting) {
    return { status: 'starting-elsewhere' };
  }
  const probe = probeProcess(record.pid);
  if (probe === 'gone') {
    return { status: 'starting-elsewhere' };
  }
  return probe === 'not-permitted'
    ? { status: 'already-running', pid: record.pid, notPermitted: true }
    : { status: 'already-running', pid: record.pid };
}

/** The PID of the live server the PID file records, or `null` (none, or only a start in progress). */
export async function getServerPid(): Promise<number | null> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    return null;
  }
  const record = await readLiveRecord(pidFile);
  return record !== null && !record.starting ? record.pid : null;
}

/**
 * Start the SvelteKit web server as a detached background process.
 *
 * A detached server whose PID is not recorded could never be found or stopped
 * again, so the PID file is claimed before the spawn and replaced after it.
 * Steps, in order:
 * 1. Resolve the PID file location; when none can be resolved (empty or
 *    relative home), throw {@link ServePidFileError} `home-unresolved` — even
 *    when the build is missing, since nothing can be checked without a location.
 * 2. Already running (per the PID file) — return `already-running` with the
 *    server's PID, or `starting-elsewhere` when the record is a start in progress.
 * 3. Build missing — return `build-missing`.
 * 4. PID directory not writable — throw {@link ServePidFileError}
 *    `pid-not-writable` without spawning.
 * 5. Claim the PID file by creating it exclusively with a `starting` record
 *    (see {@link claimPidFile}). When a live record already holds it (another
 *    start won the race), return as in step 2 without spawning. A stale record is
 *    removed and the claim re-tried, up to {@link MAX_CLAIM_ATTEMPTS}
 *    attempts; when they run out, return `starting-elsewhere`. When the
 *    claim cannot be created or the existing file cannot be read, throw
 *    {@link ServePidFileError} `pid-not-writable` without spawning.
 * 6. Spawn. When the spawn itself fails (`child.pid` is `undefined`), remove
 *    the claim and return `spawn-failed`: no process exists.
 * 7. Record the child's PID (see {@link recordServerPid}): where the PID path
 *    is empty — a remover may have taken the claim away for a moment — the
 *    record is created exclusively, so a claim put back later cannot replace
 *    it; where the path still holds this start's claim, the claim is replaced
 *    and `started` is returned.
 *    When the path holds anything else (another start reclaimed the claim,
 *    e.g. after {@link CLAIM_MAX_AGE_MS}), send the child SIGTERM and return
 *    as in step 2 for what took its place, leaving the other record untouched — as in step 5, the PID file
 *    belongs to another start. When the record cannot be written or the PID
 *    file cannot be read, send the child SIGTERM, remove the claim, and throw
 *    {@link ServePidFileError} `pid-not-writable`.
 *
 * Reading the claim and replacing it are two operations: a record written
 * between them is still overwritten.
 *
 * @param projectRoot - Absolute path to the project root (used to find build dir)
 * @param port - TCP port to bind (default: 4321)
 * @param buildDirOpts - Options forwarded to findServeBuildDir (e.g. skipNpmFallback for tests)
 * @returns what the call did; only `started` means it started a server
 * @throws {ServePidFileError} when the server's PID cannot be recorded
 */
export async function startServeBackground(
  projectRoot: string,
  port: number = DEFAULT_PORT,
  buildDirOpts?: FindServeBuildDirOptions
): Promise<ServeStartResult> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    // no stable PID location — do not spawn an untrackable server
    throw new ServePidFileError('home-unresolved', null);
  }

  const running = await readLiveRecord(pidFile);
  if (running !== null) {
    return heldResult(running); // already running or starting — no-op
  }

  const buildDir = findServeBuildDir(projectRoot, buildDirOpts);
  if (buildDir === null) {
    // Build not present (serve package not installed / not yet built)
    return { status: 'build-missing' };
  }

  try {
    await access(dirname(pidFile), constants.W_OK);
  } catch (error: unknown) {
    throw new ServePidFileError('pid-not-writable', pidFile, { cause: error });
  }

  let claimed: ClaimResult;
  try {
    claimed = await claimPidFile(pidFile);
  } catch (error: unknown) {
    throw new ServePidFileError('pid-not-writable', pidFile, { cause: error });
  }
  if ('held' in claimed) {
    return heldResult(claimed.held); // another start holds the PID file — it owns the spawn
  }
  const { claim } = claimed;

  const child = spawn('node', [join(buildDir, 'index.js')], {
    env: {
      ...process.env,
      OMCUSTOM_PORT: String(port),
      OMCUSTOM_HOST: 'localhost',
      OMCUSTOM_ORIGIN: `http://localhost:${port}`,
      OMX_PROJECT_ROOT: projectRoot,
    },
    stdio: 'ignore',
    detached: true,
  });

  // A failed spawn (e.g. `node` not on PATH) reports itself through an
  // asynchronous 'error' event; with no listener that event crashes the CLI
  // with a stack trace. The failure needs no handling here beyond removing the
  // claim below: no process exists, so the caller's running check reports the
  // same "failed to start" outcome as any other start that did not happen.
  // Node may also emit 'error' when a signal cannot be delivered (subprocess.kill()
  // docs), in which case this listener would also swallow a failed SIGTERM from the
  // catch below.
  child.on('error', () => {
    // intentionally ignored — see above
  });
  child.unref();

  if (child.pid === undefined) {
    // spawn failed — no process exists that would need tracking
    await removePidFileIf(pidFile, claim);
    return { status: 'spawn-failed' };
  }

  let outcome: Awaited<ReturnType<typeof recordServerPid>>;
  try {
    outcome = await recordServerPid(pidFile, claim, String(child.pid));
  } catch (error: unknown) {
    // Recording the PID failed (e.g. permissions changed, or the PID file
    // became unreadable): do not leave the spawned server running untracked.
    child.kill('SIGTERM');
    await removePidFileIf(pidFile, claim);
    throw new ServePidFileError('pid-not-writable', pidFile, { cause: error });
  }
  if (!outcome.recorded) {
    // The claim was lost (taken over as stale): the PID file is another
    // start's to record. Do not overwrite it, and do not leave this server
    // running untracked. What took its place decides the result: a running
    // server is `already-running`, a start in progress `starting-elsewhere`.
    child.kill('SIGTERM');
    return heldResult(outcome.lost);
  }
  return { status: 'started', pid: child.pid };
}

/**
 * Record a spawned server's PID in place of this start's claim.
 *
 * An absent PID path does not mean the claim is lost: a remover that judged an
 * older record stale may have taken the claim away and be about to put it
 * back. So the record is first created exclusively (like the claim, see
 * {@link createPidFileExclusive}) — the remover's put-back then finds the path
 * taken and drops the claim. When the path exists, it is read: this start's
 * claim is replaced with the record (see {@link replacePidFile}); an absent
 * path (taken away again) starts the next attempt, up to
 * {@link MAX_CLAIM_ATTEMPTS}; anything else means the claim was lost.
 *
 * @returns `recorded` when the PID was recorded; otherwise `lost` with the
 *   record found in place of the claim (`null` when none could be read)
 * @throws when the record cannot be written or the PID file cannot be read
 */
async function recordServerPid(
  pidFile: string,
  claim: string,
  pid: string
): Promise<{ recorded: true } | { recorded: false; lost: PidRecord | null }> {
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    if (await createPidFileExclusive(pidFile, pid)) {
      return { recorded: true };
    }
    let current: string;
    try {
      current = await readFile(pidFile, 'utf-8');
    } catch (error: unknown) {
      if (errorCode(error) === 'ENOENT') {
        continue; // taken away again since the create failed — try again
      }
      throw error;
    }
    if (current !== claim) {
      return { recorded: false, lost: parsePidRecord(current) };
    }
    await replacePidFile(pidFile, pid);
    return { recorded: true };
  }
  return { recorded: false, lost: null };
}

/**
 * Stop the background serve process.
 *
 * Only a server record is acted on: its process is sent SIGTERM and, when the
 * signal was delivered, the record is removed. Anything else is left in place
 * and `false` is returned — a start in progress (a `starting` record, whose
 * starter is never signalled), a malformed record, or a record whose process
 * is gone. Reclaiming those is left to the next start.
 *
 * A process that exists but may not be signalled (`EPERM`) is not "nothing
 * running": {@link isServeRunning} reports it as running, so reporting "not
 * running" here would contradict it. It throws instead and keeps the record.
 *
 * @returns `true` if a running process was stopped, `false` if nothing was running
 *   (including when no PID file location can be resolved).
 * @throws {ServeStopPermissionError} when the recorded process cannot be signalled (`EPERM`)
 */
export async function stopServe(): Promise<boolean> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    return false;
  }
  let raw: string;
  try {
    raw = await readPidFileSettled(pidFile);
  } catch {
    return false; // absent, or unreadable
  }
  const record = parsePidRecord(raw);
  if (record === null || record.starting) {
    return false;
  }
  try {
    process.kill(record.pid, 'SIGTERM');
  } catch (error: unknown) {
    if (errorCode(error) === 'EPERM') {
      throw new ServeStopPermissionError(record.pid, pidFile, { cause: error });
    }
    return false;
  }
  await removePidFileIf(pidFile, raw);
  return true;
}

/** A unique sibling path of the PID file, for staging and taking records. */
function siblingPath(pidFile: string, suffix: string): string {
  return `${pidFile}.${process.pid}.${randomUUID()}.${suffix}`;
}

/**
 * Claim the PID file for a start: create it exclusively with a fresh
 * `starting` record.
 *
 * Before claiming, staged and taken siblings left by dead processes are
 * removed (see {@link removeDeadSiblings}). When the PID file exists, its
 * record is judged:
 * - live (see {@link isRecordLive}): the claim gives up;
 * - possibly partial (see {@link isPossiblyPartialRecord}) and younger than
 *   {@link PARTIAL_RECORD_GRACE_MS} (a record still being written): the claim
 *   gives up;
 * - otherwise stale: it is removed and the claim re-tried.
 * A PID path that is a dangling symbolic link is removed as stale (the link
 * itself, never its target).
 *
 * @returns the claim's record, or `held` with the live record that holds the PID
 *   file (`null` when that record is only possibly partial, or when the claim
 *   still failed after {@link MAX_CLAIM_ATTEMPTS} attempts)
 * @throws when the claim cannot be created or an existing PID file cannot be read
 */
async function claimPidFile(pidFile: string): Promise<ClaimResult> {
  await removeDeadSiblings(pidFile);
  const claim = `starting:${process.pid}:${randomUUID()}`;
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    if (await createPidFileExclusive(pidFile, claim)) {
      return { claim };
    }
    let raw: string;
    try {
      raw = await readFile(pidFile, 'utf-8');
    } catch (error: unknown) {
      if (errorCode(error) === 'ENOENT') {
        // removed since the claim failed, or a dangling symbolic link
        await removeDanglingLink(pidFile);
        continue;
      }
      throw error;
    }
    if (await isRecordHeld(pidFile, raw)) {
      return { held: parsePidRecord(raw) };
    }
    await removePidFileIf(pidFile, raw);
  }
  return { held: null };
}

/** The outcome of {@link claimPidFile}. */
type ClaimResult = { claim: string } | { held: PidRecord | null };

/** Whether a record read from the PID file must not be reclaimed (see {@link claimPidFile}). */
async function isRecordHeld(pidFile: string, raw: string): Promise<boolean> {
  const record = parsePidRecord(raw);
  if (record === null) {
    return isPossiblyPartialRecord(raw) && !(await isOlderThan(pidFile, PARTIAL_RECORD_GRACE_MS));
  }
  return isRecordLive(pidFile, record);
}

/**
 * Whether unparsable PID file contents may be a record still being written:
 * empty, or a strict prefix of a `starting:<pid>:` claim (a cut-short server
 * PID is itself a parsable number). Anything else can never become a valid
 * record and is reclaimed regardless of its age.
 */
function isPossiblyPartialRecord(raw: string): boolean {
  return 'starting:'.startsWith(raw) || /^starting:\d*$/.test(raw);
}

/**
 * Remove staged and taken siblings of the PID file (named
 * `<PID file name>.<pid>.<uuid>.tmp|.taken`, see {@link siblingPath}) whose
 * embedded process no longer exists (`ESRCH`) — left behind by a crash.
 * Files of a live process (or one that cannot be signalled, `EPERM`) and any
 * file not matching that exact pattern are kept. Best effort: errors are ignored.
 */
async function removeDeadSiblings(pidFile: string): Promise<void> {
  const dir = dirname(pidFile);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const match = SIBLING_REMNANT.exec(name);
    if (match !== null && !isProcessAlive(Number(match[1]))) {
      await unlinkQuietly(join(dir, name));
    }
  }
}

/**
 * Create the PID file with `content` only if it does not exist.
 *
 * The content is staged in a unique file and hard-linked into place: `link`
 * fails when the target exists, and the file appears with its content
 * complete, so no reader ever sees an empty or partial record. Where hard
 * links are unsupported ({@link HARD_LINK_UNSUPPORTED}), the PID file is
 * created with `O_EXCL` instead — still exclusive, but a reader may briefly
 * see it empty or partial (see {@link PARTIAL_RECORD_GRACE_MS}).
 *
 * @returns `false` when the PID file already exists
 */
async function createPidFileExclusive(pidFile: string, content: string): Promise<boolean> {
  const staged = siblingPath(pidFile, 'tmp');
  try {
    await writeFile(staged, content, { encoding: 'utf-8', flag: 'wx' });
    await linkExclusive(staged, pidFile, content);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === 'EEXIST') {
      return false;
    }
    throw error;
  } finally {
    await unlinkQuietly(staged);
  }
}

/**
 * Hard-link `source` to `target`, failing with `EEXIST` when `target` exists.
 * Where hard links are unsupported, write `content` to `target` with `O_EXCL`.
 */
async function linkExclusive(source: string, target: string, content: string): Promise<void> {
  try {
    await link(source, target);
  } catch (error: unknown) {
    if (!HARD_LINK_UNSUPPORTED.has(errorCode(error) ?? '')) {
      throw error;
    }
    await writeFile(target, content, { encoding: 'utf-8', flag: 'wx' });
  }
}

/**
 * Replace the PID file's record with `content` in one step: the content is
 * staged in a unique file and renamed over the PID file, so no reader ever
 * sees an empty or partial record.
 */
async function replacePidFile(pidFile: string, content: string): Promise<void> {
  const staged = siblingPath(pidFile, 'tmp');
  try {
    await writeFile(staged, content, { encoding: 'utf-8', flag: 'wx' });
    await rename(staged, pidFile);
  } catch (error: unknown) {
    await unlinkQuietly(staged);
    throw error;
  }
}

/**
 * Remove the PID file only if it still holds exactly `expected`.
 *
 * Reading the file and then unlinking its path would race with a start that
 * replaced the record in between, deleting that start's fresh claim. Instead
 * the file is taken (see {@link removePidFileWhen}) and the taken file compared:
 * - it holds `expected`: it is deleted;
 * - it holds anything else, or cannot be read: it is put back.
 */
async function removePidFileIf(pidFile: string, expected: string): Promise<void> {
  await removePidFileWhen(pidFile, async (taken) => {
    try {
      return (await readFile(taken, 'utf-8')) === expected;
    } catch {
      return false; // unreadable — not the record that was judged removable
    }
  });
}

/**
 * Remove the PID path when it is a dangling symbolic link: the link itself is
 * removed, never its target. Anything else at the path is left alone.
 */
async function removeDanglingLink(pidFile: string): Promise<void> {
  if (!(await isDanglingLink(pidFile))) {
    return; // gone, or not a dangling symbolic link
  }
  await removePidFileWhen(pidFile, isDanglingLink);
}

/** Whether `path` is a symbolic link whose target does not exist. */
async function isDanglingLink(path: string): Promise<boolean> {
  try {
    await readlink(path);
  } catch {
    return false; // absent, or not a symbolic link
  }
  try {
    await stat(path);
    return false; // the target exists
  } catch {
    return true;
  }
}

/**
 * Remove the PID path only if `isExpected` accepts what was there.
 *
 * The path is first renamed to a unique sibling (one atomic step, so at most
 * one caller takes any given file; a symbolic link is moved as a link) and the
 * taken file is checked:
 * - accepted: it is deleted;
 * - rejected: it is put back. Putting back never overwrites (a hard link, or
 *   an `O_EXCL` write of its content where hard links are unsupported), so
 *   when a newer record has appeared at the path meanwhile, the newer one is
 *   kept and the taken one is deleted (as it is when putting back fails for
 *   any other reason).
 *
 * When the path cannot be taken (already gone, or not movable), nothing happens.
 */
async function removePidFileWhen(
  pidFile: string,
  isExpected: (taken: string) => Promise<boolean>
): Promise<void> {
  const taken = siblingPath(pidFile, 'taken');
  try {
    await rename(pidFile, taken);
  } catch {
    return;
  }
  if (!(await isExpected(taken))) {
    await putBack(taken, pidFile);
  }
  await unlinkQuietly(taken);
}

/** Put a taken file back at the PID path without overwriting; failures are ignored. */
async function putBack(taken: string, pidFile: string): Promise<void> {
  try {
    await link(taken, pidFile);
    return;
  } catch (error: unknown) {
    if (!HARD_LINK_UNSUPPORTED.has(errorCode(error) ?? '')) {
      return; // a newer record holds the path — it wins over the taken one
    }
  }
  try {
    await writeFile(pidFile, await readFile(taken, 'utf-8'), { encoding: 'utf-8', flag: 'wx' });
  } catch {
    // a newer record holds the path, or the taken file is unreadable
  }
}

/**
 * Remove a file, ignoring errors (it may already be absent).
 */
async function unlinkQuietly(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // ignore — file may already be absent
  }
}

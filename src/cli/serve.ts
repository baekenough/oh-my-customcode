/**
 * Background web server management for omcustom CLI
 * Manages the lifecycle of the packages/serve SvelteKit server process
 */

import { spawn } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { type HomeSources, resolveHomeDir } from '../utils/home.js';

export const DEFAULT_PORT = 4321;

const PID_FILE_NAME = '.omcustom-serve.pid';

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
}

/**
 * Find the built SvelteKit server directory.
 * Checks two locations: the local monorepo packages/serve/build,
 * and the npm-installed package path relative to this module.
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
    const npmBuild = join(import.meta.dirname, '..', '..', 'packages', 'serve', 'build');
    if (existsSync(join(npmBuild, 'index.js'))) return npmBuild;
  }

  return null;
}

/**
 * Check whether the serve process is currently running.
 * Reads the PID file and sends signal 0 to verify the process exists.
 * Cleans up a stale PID file if the process is gone.
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
  try {
    const raw = await readFile(pidFile, 'utf-8');
    const pid = Number(raw.trim());
    if (!Number.isFinite(pid) || pid <= 0) {
      await cleanupPidFile(pidFile);
      return false;
    }
    process.kill(pid, 0); // signal 0 = existence check only
    return true;
  } catch {
    await cleanupPidFile(pidFile);
    return false;
  }
}

/**
 * Start the SvelteKit web server as a detached background process.
 *
 * A detached server whose PID is not recorded could never be found or stopped
 * again, so the PID file is guarded on both sides of the spawn. Steps, in order:
 * 1. Resolve the PID file location; when none can be resolved (empty or
 *    relative home), throw {@link ServePidFileError} `home-unresolved` — even
 *    when the build is missing, since nothing can be checked without a location.
 * 2. Already running (per the PID file) — return silently.
 * 3. Build missing — return silently.
 * 4. PID directory not writable — throw {@link ServePidFileError}
 *    `pid-not-writable` without spawning.
 * 5. Spawn. When the spawn itself fails (`child.pid` is `undefined`), return
 *    silently: no process exists, and the caller's {@link isServeRunning}
 *    check reports the failed start. When writing the PID file fails, send the
 *    child SIGTERM and throw {@link ServePidFileError} `pid-not-writable`.
 *
 * @param projectRoot - Absolute path to the project root (used to find build dir)
 * @param port - TCP port to bind (default: 4321)
 * @param buildDirOpts - Options forwarded to findServeBuildDir (e.g. skipNpmFallback for tests)
 * @throws {ServePidFileError} when the server's PID cannot be recorded
 */
export async function startServeBackground(
  projectRoot: string,
  port: number = DEFAULT_PORT,
  buildDirOpts?: FindServeBuildDirOptions
): Promise<void> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    // no stable PID location — do not spawn an untrackable server
    throw new ServePidFileError('home-unresolved', null);
  }

  if (await isServeRunningAt(pidFile)) {
    return; // already running — no-op
  }

  const buildDir = findServeBuildDir(projectRoot, buildDirOpts);
  if (buildDir === null) {
    // Build not present (serve package not installed / not yet built) — silently skip
    return;
  }

  try {
    await access(dirname(pidFile), constants.W_OK);
  } catch (error: unknown) {
    throw new ServePidFileError('pid-not-writable', pidFile, { cause: error });
  }

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
  // with a stack trace. The failure needs no handling here: no process exists
  // and no PID file is written, so the caller's running check reports the same
  // "failed to start" outcome as any other start that did not happen.
  // Node may also emit 'error' when a signal cannot be delivered (subprocess.kill()
  // docs), in which case this listener would also swallow a failed SIGTERM from the
  // catch below.
  child.on('error', () => {
    // intentionally ignored — see above
  });
  child.unref();

  if (child.pid === undefined) {
    return; // spawn failed — no process exists that would need tracking
  }

  try {
    await writeFile(pidFile, String(child.pid), 'utf-8');
  } catch (error: unknown) {
    // The directory check above passed, but the write still failed (e.g. the
    // PID path is a directory, or permissions changed): do not leave the
    // spawned server running untracked.
    child.kill('SIGTERM');
    throw new ServePidFileError('pid-not-writable', pidFile, { cause: error });
  }
}

/**
 * Stop the background serve process.
 *
 * @returns `true` if a running process was stopped, `false` if nothing was running
 *   (including when no PID file location can be resolved).
 */
export async function stopServe(): Promise<boolean> {
  const pidFile = resolveServePidFile();
  if (pidFile === null) {
    return false;
  }
  try {
    const raw = await readFile(pidFile, 'utf-8');
    const pid = Number(raw.trim());
    if (!Number.isFinite(pid) || pid <= 0) {
      await cleanupPidFile(pidFile);
      return false;
    }
    process.kill(pid, 'SIGTERM');
    await cleanupPidFile(pidFile);
    return true;
  } catch {
    await cleanupPidFile(pidFile);
    return false;
  }
}

/**
 * Remove the PID file, ignoring errors if it does not exist.
 */
async function cleanupPidFile(pidFile: string): Promise<void> {
  try {
    await unlink(pidFile);
  } catch {
    // ignore — file may already be absent
  }
}

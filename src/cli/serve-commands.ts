/**
 * CLI command handlers for `omcustom serve` and `omcustom serve-stop`
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { i18n } from '../i18n/index.js';
import {
  DEFAULT_PORT,
  type FindServeBuildDirOptions,
  findServeBuildDir,
  getServerPid,
  resolveServePidFile,
  ServePidFileError,
  type ServeStartResult,
  ServeStopPermissionError,
  startServeBackground,
  stopServe,
} from './serve.js';

export interface ServeCommandOptions {
  port?: string;
  foreground?: boolean;
  /**
   * Override the project root used to find the build directory.
   * Intended for test isolation only — not exposed in the CLI.
   */
  _projectRoot?: string;
}

/**
 * Handler for `omcustom serve [--port 4321] [--foreground]`
 */
export async function serveCommand(options: ServeCommandOptions): Promise<void> {
  const port = options.port !== undefined ? Number(options.port) : DEFAULT_PORT;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${options.port}`);
    process.exit(1);
  }

  const cwd = options._projectRoot ?? process.cwd();
  // When _projectRoot is explicitly set (test isolation), skip the npm fallback
  // so real build artifacts do not interfere with tests expecting a missing build.
  const buildDirOpts: FindServeBuildDirOptions = {
    skipNpmFallback: options._projectRoot !== undefined,
  };

  if (options.foreground === true) {
    runForeground(cwd, port, buildDirOpts);
    return;
  }

  let result: ServeStartResult;
  try {
    result = await startServeBackground(cwd, port, buildDirOpts);
  } catch (error: unknown) {
    if (!(error instanceof ServePidFileError)) {
      throw error;
    }
    console.error(describePidFileError(error));
    process.exit(1);
  }

  // Only a start this call performed may be reported as started on `port`: the
  // port of a server that was already running is not recorded anywhere, so the
  // other outcomes state the situation without naming one (idempotent, exit 0).
  switch (result.status) {
    case 'already-running':
      console.log(
        result.notPermitted === true
          ? i18n.t('cli.web.start.alreadyRunningNotPermitted', {
              pid: result.pid,
              path: String(resolveServePidFile()),
            })
          : i18n.t('cli.web.start.alreadyRunning', { pid: result.pid })
      );
      return;
    case 'starting-elsewhere':
      console.log(i18n.t('cli.web.start.startingElsewhere'));
      return;
    case 'build-missing':
    case 'spawn-failed':
      console.error(i18n.t('cli.web.start.failed'));
      process.exit(1);
  }

  // started: the spawned server may have exited already, and another start may
  // have taken its place in the PID file — only this call's own server counts
  if ((await getServerPid()) === result.pid) {
    console.log(i18n.t('cli.web.start.started', { port }));
  } else {
    console.error(i18n.t('cli.web.start.failed'));
    process.exit(1);
  }
}

/**
 * User-facing explanation of why the server's PID could not be recorded.
 */
function describePidFileError(error: ServePidFileError): string {
  if (error.reason === 'home-unresolved') {
    return i18n.t('cli.web.start.homeUnresolved');
  }
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause);
  return i18n.t('cli.web.start.pidNotWritable', { path: String(error.pidFile), error: cause });
}

/**
 * Handler for `omcustom serve-stop`
 */
export async function serveStopCommand(): Promise<void> {
  let stopped: boolean;
  try {
    stopped = await stopServe();
  } catch (error: unknown) {
    if (!(error instanceof ServeStopPermissionError)) {
      throw error;
    }
    console.error(i18n.t('cli.web.stop.notPermitted', { pid: error.pid, path: error.pidFile }));
    process.exit(1);
  }
  if (stopped) {
    console.log(i18n.t('cli.web.stop.stopped'));
  } else {
    console.log(i18n.t('cli.web.stop.notRunning'));
  }
}

/**
 * Run the SvelteKit server in the foreground (blocking).
 * Exits the current process with an error if the build is missing.
 */
function runForeground(
  projectRoot: string,
  port: number,
  buildDirOpts?: FindServeBuildDirOptions
): void {
  const buildDir = findServeBuildDir(projectRoot, buildDirOpts);
  if (buildDir === null) {
    console.error('Web UI build not found. Run: cd packages/serve && bun run build');
    process.exit(1);
  }

  console.log(`Web UI: http://localhost:${port}`);

  spawnSync('node', [join(buildDir, 'index.js')], {
    env: {
      ...process.env,
      OMCUSTOM_PORT: String(port),
      OMCUSTOM_HOST: 'localhost',
      OMCUSTOM_ORIGIN: `http://localhost:${port}`,
      OMX_PROJECT_ROOT: projectRoot,
    },
    stdio: 'inherit',
  });
}

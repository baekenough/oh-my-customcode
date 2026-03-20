/**
 * CLI command handlers for `omcustom serve` and `omcustom serve-stop`
 */

import { execFile, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { i18n } from '../i18n/index.js';
import {
  DEFAULT_PORT,
  type FindServeBuildDirOptions,
  findServeBuildDir,
  isServeRunning,
  startServeBackground,
  stopServe,
} from './serve.js';

export interface ServeCommandOptions {
  port?: string;
  open?: boolean;
  foreground?: boolean;
  /**
   * Override the project root used to find the build directory.
   * Intended for test isolation only — not exposed in the CLI.
   */
  _projectRoot?: string;
}

/**
 * Handler for `omcustom serve [--port 4321] [--open] [--foreground]`
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

  await startServeBackground(cwd, port, buildDirOpts);

  const running = await isServeRunning();
  if (running) {
    console.log(i18n.t('cli.web.start.started', { port }));
    if (options.open === true) {
      openBrowser(port);
    }
  } else {
    console.error(i18n.t('cli.web.start.failed'));
    process.exit(1);
  }
}

/**
 * Handler for `omcustom serve-stop`
 */
export async function serveStopCommand(): Promise<void> {
  const stopped = await stopServe();
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

/**
 * Open a URL in the default browser using execFile (shell-injection safe).
 * Uses platform-specific openers. Fires and forgets — failures are silently ignored.
 */
export function openBrowser(port: number): void {
  const url = `http://localhost:${port}`;
  const platform = process.platform;

  if (platform === 'darwin') {
    execFile('open', [url], () => {
      // intentionally empty — ignore open failures
    });
  } else if (platform === 'win32') {
    // `start` is a cmd.exe built-in; pass via cmd /c
    execFile('cmd', ['/c', 'start', url], () => {
      // intentionally empty
    });
  } else {
    execFile('xdg-open', [url], () => {
      // intentionally empty
    });
  }
}

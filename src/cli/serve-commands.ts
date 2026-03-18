/**
 * CLI command handlers for `omcustom serve` and `omcustom serve-stop`
 */

import { execFile, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEFAULT_PORT,
  findServeBuildDir,
  isServeRunning,
  startServeBackground,
  stopServe,
} from './serve.js';

export interface ServeCommandOptions {
  port?: string;
  open?: boolean;
  foreground?: boolean;
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

  const cwd = process.cwd();

  if (options.foreground === true) {
    runForeground(cwd, port);
    return;
  }

  await startServeBackground(cwd, port);

  const running = await isServeRunning();
  if (running) {
    console.log(`Web UI started: http://127.0.0.1:${port}`);
    if (options.open === true) {
      openBrowser(port);
    }
  } else {
    console.error('Failed to start Web UI server');
    process.exit(1);
  }
}

/**
 * Handler for `omcustom serve-stop`
 */
export async function serveStopCommand(): Promise<void> {
  const stopped = await stopServe();
  if (stopped) {
    console.log('Web UI server stopped');
  } else {
    console.log('Web UI server is not running');
  }
}

/**
 * Run the SvelteKit server in the foreground (blocking).
 * Exits the current process with an error if the build is missing.
 */
function runForeground(projectRoot: string, port: number): void {
  const buildDir = findServeBuildDir(projectRoot);
  if (buildDir === null) {
    console.error('Web UI build not found. Run: cd packages/serve && bun run build');
    process.exit(1);
  }

  console.log(`Web UI: http://127.0.0.1:${port}`);

  spawnSync('node', [join(buildDir, 'index.js')], {
    env: {
      ...process.env,
      OMCUSTOM_PORT: String(port),
      OMCUSTOM_HOST: 'localhost',
      OMCUSTOM_ORIGIN: `http://localhost:${port}`,
      OMCUSTOM_PROJECT_ROOT: projectRoot,
    },
    stdio: 'inherit',
  });
}

/**
 * Open a URL in the default browser using execFile (shell-injection safe).
 * Uses platform-specific openers. Fires and forgets — failures are silently ignored.
 */
function openBrowser(port: number): void {
  const url = `http://127.0.0.1:${port}`;
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

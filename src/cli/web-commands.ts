/**
 * CLI command handlers for `omcustom web` subcommand group.
 * Delegates to serve-commands.ts for the actual implementation.
 */

import { DEFAULT_PORT, isServeRunning } from './serve.js';
import { openBrowser, serveCommand, serveStopCommand } from './serve-commands.js';

export type { ServeCommandOptions } from './serve-commands.js';

/**
 * Handler for `omcustom web start [--port 4321] [--open] [--foreground]`
 * Delegates to serveCommand.
 */
export async function webStartCommand(options: {
  port?: string;
  open?: boolean;
  foreground?: boolean;
}): Promise<void> {
  await serveCommand(options);
}

/**
 * Handler for `omcustom web stop`
 * Delegates to serveStopCommand.
 */
export async function webStopCommand(): Promise<void> {
  await serveStopCommand();
}

/**
 * Handler for `omcustom web status`
 * Reports whether the Web UI server is currently running.
 */
export async function webStatusCommand(): Promise<void> {
  const running = await isServeRunning();
  if (running) {
    const port = process.env.OMCUSTOM_PORT ?? String(DEFAULT_PORT);
    console.log(`Web UI is running: http://127.0.0.1:${port}`);
  } else {
    console.log('Web UI is not running');
    console.log('  Start with: omcustom web start');
  }
}

/**
 * Handler for `omcustom web open [--port 4321]`
 * Opens the browser to the Web UI URL.
 */
export async function webOpenCommand(options: { port?: string }): Promise<void> {
  const port = options.port !== undefined ? Number(options.port) : DEFAULT_PORT;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${options.port}`);
    process.exit(1);
  }

  const running = await isServeRunning();
  if (!running) {
    console.warn('Web UI does not appear to be running. Start it with: omcustom web start');
  }

  openBrowser(port);
}

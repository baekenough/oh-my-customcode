/**
 * CLI command handlers for `omcustom web` subcommand group.
 * Delegates to serve-commands.ts for the actual implementation.
 */

import { i18n } from '../i18n/index.js';
import { DEFAULT_PORT, isServeRunning } from './serve.js';
import { type ServeCommandOptions, serveCommand, serveStopCommand } from './serve-commands.js';

export type { ServeCommandOptions } from './serve-commands.js';

/**
 * Handler for `omcustom web start [--port 4321] [--foreground]`
 * Delegates to serveCommand.
 */
export async function webStartCommand(options: ServeCommandOptions): Promise<void> {
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
    console.log(i18n.t('cli.web.status.running', { port }));
  } else {
    console.log(i18n.t('cli.web.status.notRunning'));
    console.log(i18n.t('cli.web.status.startHint'));
  }
}

/**
 * Handler for `omcustom web open [--port 4321]`
 * Checks whether the Web UI server is running and warns if not.
 */
export async function webOpenCommand(options: { port?: string }): Promise<void> {
  const port = options.port !== undefined ? Number(options.port) : DEFAULT_PORT;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${options.port}`);
    process.exit(1);
  }

  const running = await isServeRunning();
  if (!running) {
    console.warn(i18n.t('cli.web.open.notRunningWarn'));
  }
}

#!/usr/bin/env node
/**
 * oh-my-customcode CLI entry point
 * Main CLI application using Commander.js
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { formatPreflightWarnings, runPreflightCheck } from '../core/preflight.js';
import { maybeHandleSelfUpdateForInit } from '../core/self-update.js';
import { detectLanguage, i18n, initI18n } from '../i18n/index.js';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { listCommand } from './list.js';
import { projectsCommand } from './projects.js';
import { securityCommand } from './security.js';
import { serveCommand, serveStopCommand } from './serve-commands.js';
import { updateCommand } from './update.js';

// Read version from package.json
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

/**
 * Creates and configures the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('omcustom')
    .description(i18n.t('cli.description'))
    .version(packageJson.version, '-v, --version', i18n.t('cli.versionOption'))
    .option('--skip-version-check', 'Skip CLI version pre-flight check');

  // omcustom init [--lang en|ko] [--domain <domain>] [--yes]
  program
    .command('init')
    .description(i18n.t('cli.init.description'))
    .option('-l, --lang <language>', i18n.t('cli.init.langOption'))
    .option(
      '--domain <domain>',
      'Install only agents/skills for specific domain (backend, frontend, data-engineering, devops)'
    )
    .option('--yes', 'Skip interactive wizard, use defaults')
    .action(async (options) => {
      await initCommand(options);
    });

  // omcustom update
  program
    .command('update')
    .description(i18n.t('cli.update.description'))
    .option('--dry-run', i18n.t('cli.update.dryRunOption'))
    .option('--force', i18n.t('cli.update.forceOption'))
    .option('--force-overwrite-all', i18n.t('cli.update.forceOverwriteAllOption'))
    .option('--backup', i18n.t('cli.update.backupOption'))
    .option('--agents', i18n.t('cli.update.agentsOption'))
    .option('--skills', i18n.t('cli.update.skillsOption'))
    .option('--rules', i18n.t('cli.update.rulesOption'))
    .option('--guides', i18n.t('cli.update.guidesOption'))
    .option('--hooks', i18n.t('cli.update.hooksOption'))
    .option('--contexts', i18n.t('cli.update.contextsOption'))
    .action(async (options) => {
      await updateCommand(options);
    });

  // omcustom list [type] [--format table|json|simple]
  program
    .command('list')
    .description(i18n.t('cli.list.description'))
    .argument('[type]', i18n.t('cli.list.typeArgument'), 'all')
    .option('-f, --format <format>', 'Output format: table, json, or simple', 'table')
    .option('--verbose', 'Show detailed information')
    .action(async (type, options) => {
      await listCommand(type, {
        format: options.format,
        verbose: options.verbose,
      });
    });

  // omcustom doctor
  program
    .command('doctor')
    .description(i18n.t('cli.doctor.description'))
    .option('--fix', i18n.t('cli.doctor.fixOption'))
    .option('--updates', i18n.t('cli.doctor.updatesOption'))
    .action(async (options) => {
      await doctorCommand(options);
    });

  // omcustom security
  program
    .command('security')
    .description(i18n.t('cli.security.description'))
    .option('--verbose', i18n.t('cli.security.verboseOption'))
    .action(async (options) => {
      const result = await securityCommand(options);
      process.exitCode = result.success ? 0 : 1;
    });

  // omcustom serve [--port 4321] [--open] [--foreground]
  program
    .command('serve')
    .description('Start the web UI server')
    .option('-p, --port <port>', 'Port number', '4321')
    .option('--open', 'Open browser automatically')
    .option('--foreground', 'Run in foreground (not detached)')
    .action(async (options) => {
      await serveCommand(options);
    });

  // omcustom serve-stop
  program
    .command('serve-stop')
    .description('Stop the web UI server')
    .action(async () => {
      await serveStopCommand();
    });

  // omcustom projects [--format table|json|simple] [--path <dir>]
  program
    .command('projects')
    .description('List all projects on this machine where oh-my-customcode is installed')
    .option('-f, --format <format>', 'Output format: table, json, or simple', 'table')
    .option(
      '--path <dir>',
      'Additional search directory (can be specified multiple times)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .action(async (options) => {
      await projectsCommand({ format: options.format, paths: options.path });
    });

  // Pre-flight hook: run before any command
  program.hook('preAction', async (thisCommand, actionCommand) => {
    const opts = thisCommand.optsWithGlobals() as { skipVersionCheck?: boolean };
    const skipCheck = opts.skipVersionCheck || false;

    if (actionCommand.name() === 'init') {
      await maybeHandleSelfUpdateForInit({
        currentVersion: packageJson.version,
        skip: skipCheck,
      });
    }

    const result = await runPreflightCheck({ skip: skipCheck });

    if (result.hasUpdates) {
      const warnings = formatPreflightWarnings(result);
      console.warn(warnings);
      console.warn(''); // Empty line for spacing
    }
  });

  return program;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Initialize i18n with detected language
  const lang = detectLanguage();
  await initI18n(lang);

  // Create and run the CLI program
  const program = createProgram();
  await program.parseAsync(process.argv);
}

// Run main if this is the entry point
main().catch((error) => {
  console.error(i18n.t('cli.error.unexpected'), error);
  process.exit(1);
});

export { main };

#!/usr/bin/env node
/**
 * oh-my-customcode CLI entry point
 * Main CLI application using Commander.js
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { detectLanguage, i18n, initI18n } from '../i18n/index.js';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { listCommand } from './list.js';
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
    .name('omcc')
    .description(i18n.t('cli.description'))
    .version(packageJson.version, '-v, --version', i18n.t('cli.versionOption'));

  // omcc init [--lang en|ko]
  program
    .command('init')
    .description(i18n.t('cli.init.description'))
    .option('-l, --lang <language>', i18n.t('cli.init.langOption'), 'en')
    .action(async (options) => {
      await initCommand(options);
    });

  // omcc update
  program
    .command('update')
    .description(i18n.t('cli.update.description'))
    .action(async () => {
      await updateCommand();
    });

  // omcc list [type]
  program
    .command('list')
    .description(i18n.t('cli.list.description'))
    .argument('[type]', i18n.t('cli.list.typeArgument'), 'all')
    .action(async (type) => {
      await listCommand(type);
    });

  // omcc doctor
  program
    .command('doctor')
    .description(i18n.t('cli.doctor.description'))
    .option('--fix', i18n.t('cli.doctor.fixOption'))
    .action(async (options) => {
      await doctorCommand(options);
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

/**
 * omcustom sync — Drift detection and snapshot export
 *
 * Usage:
 *   omcustom sync                   # Compare current state against lockfile
 *   omcustom sync --reference <dir> # Compare against external snapshot
 *   omcustom sync --export <path>   # Export current state as reusable snapshot
 */

import { resolve } from 'node:path';
import type { Command } from 'commander';
import { exportSnapshot, type SyncCheckResult, syncCheck } from '../core/sync.js';
import { i18n } from '../i18n/index.js';

interface SyncOptions {
  check?: boolean;
  reference?: string;
  export?: string;
}

/**
 * Run snapshot export mode and print results.
 * Exits with code 1 on failure.
 */
async function runExport(targetDir: string, outputPath: string): Promise<void> {
  const result = await exportSnapshot(targetDir, resolve(outputPath));

  if (!result.success) {
    console.error('\nExport failed — no .claude/ directory found in current project.');
    process.exit(1);
  }

  console.log(`\nSnapshot exported: ${result.exportPath} (${result.fileCount} files)`);
  console.log(`Team members can install with: omcustom init --from-snapshot ${result.exportPath}`);
}

/**
 * Print the categorized drift entries from a sync check result.
 */
function printDriftDetails(result: SyncCheckResult): void {
  if (result.unchanged > 0) {
    console.log(`  ✓ ${result.unchanged} files in sync`);
  }

  if (result.modified.length > 0) {
    console.log(`  ⚠ ${result.modified.length} files modified since install:`);
    for (const f of result.modified) {
      console.log(`    modified: ${f}`);
    }
  }

  if (result.removed.length > 0) {
    console.log(`  ✗ ${result.removed.length} files removed:`);
    for (const f of result.removed) {
      console.log(`    removed: ${f}`);
    }
  }

  if (result.added.length > 0) {
    console.log(`  + ${result.added.length} files added (not in lockfile):`);
    for (const f of result.added) {
      console.log(`    added: ${f}`);
    }
  }
}

/**
 * Run drift-detection mode and print results.
 * Exits with code 1 when drift is detected (enables CI usage).
 */
async function runCheck(targetDir: string, options: SyncOptions): Promise<void> {
  const result = await syncCheck(targetDir, { reference: options.reference });

  if (!result.referenceVersion) {
    console.error('\nNo lockfile found. Run omcustom init first.');
    process.exit(1);
  }

  const label = options.reference
    ? `external snapshot at ${options.reference}`
    : `lockfile (v${result.referenceVersion})`;

  console.log(`\nSync check — comparing against ${label}\n`);

  if (result.inSync) {
    console.log(`  ✓ ${result.unchanged} files in sync`);
  } else {
    printDriftDetails(result);
  }

  console.log(
    `\nSummary: ${result.unchanged} unchanged, ${result.modified.length} modified, ${result.removed.length} removed, ${result.added.length} added`
  );

  if (!result.inSync) {
    process.exit(1);
  }
}

/**
 * Register the `sync` subcommand on the given Commander program.
 */
export function syncCommand(program: Command): void {
  program
    .command('sync')
    .description(i18n.t('cli.sync.description'))
    .option('--check', 'Compare current state against lockfile (default behavior)')
    .option('--reference <path>', 'Compare against an external snapshot instead of the lockfile')
    .option('--export <path>', 'Export current .claude/ state as a reusable snapshot')
    .action(async (options: SyncOptions) => {
      const targetDir = resolve('.');

      if (options.export) {
        await runExport(targetDir, options.export);
        return;
      }

      await runCheck(targetDir, options);
    });
}

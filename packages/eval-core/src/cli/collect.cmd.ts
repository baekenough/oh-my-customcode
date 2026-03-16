import { Command } from 'commander';
import { collect } from '../collect/index.js';
import { runMigrations } from '../db/migrate.js';
import { getDefaultConfig } from '../types/config.js';

interface CollectCliOptions {
  since?: string;
  ppid?: string;
  omxDir?: string;
  dbPath?: string;
  dryRun?: boolean;
}

export const collectCommand = new Command('collect')
  .description('Collect session and agent data from .omx/ logs')
  .option('--since <date>', 'Collect data since this date (ISO 8601)')
  .option('--ppid <pid>', 'Collect specific PPID outcome file')
  .option('--omx-dir <dir>', 'Path to .omx/logs/ directory')
  .option('--db-path <path>', 'Database file path')
  .option('--dry-run', 'Parse without writing to DB')
  .action(async (options: CollectCliOptions) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    const omxDir = options.omxDir ?? '.omx/logs';

    // Auto-migrate on first run
    if (!options.dryRun) {
      runMigrations(dbPath);
    }

    console.log(`Collecting data from: ${omxDir}`);
    const result = await collect({
      dbPath,
      omxLogsDir: omxDir,
      since: options.since,
      ppid: options.ppid,
      dryRun: options.dryRun,
    });

    console.log(
      `Collected: ${result.sessions} sessions, ${result.turns} turns, ${result.invocations} agent invocations`
    );
  });

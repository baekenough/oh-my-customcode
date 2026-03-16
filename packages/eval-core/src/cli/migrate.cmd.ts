import { Command } from 'commander';
import { runMigrations } from '../db/migrate.js';
import { getDefaultConfig } from '../types/config.js';

export const migrateCommand = new Command('migrate')
  .description('Initialize or migrate the evaluation database')
  .option('--db-path <path>', 'Database file path')
  .action((options: { dbPath?: string }) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    console.log(`Migrating database: ${dbPath}`);
    runMigrations(dbPath);
    console.log('Migration complete.');
  });

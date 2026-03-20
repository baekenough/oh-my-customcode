import { Command } from 'commander';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { getProjectStats, getRecentSessions } from '../query/index.js';
import { getDefaultConfig } from '../types/config.js';

interface ListCliOptions {
  dbPath?: string;
  limit?: string;
  format?: string;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m${secs}s`;
}

function formatCost(usd: number | null): string {
  if (usd === null) return '-';
  return `$${usd.toFixed(4)}`;
}

const listProjectsCommand = new Command('projects')
  .description('List all tracked projects')
  .option('--db-path <path>', 'Database file path')
  .option('--format <format>', 'Output format: table | json', 'table')
  .action((options: ListCliOptions) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    runMigrations(dbPath);
    const db = createDb(dbPath);
    const stats = getProjectStats(db);

    if (options.format === 'json') {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    if (stats.length === 0) {
      console.log('No projects found. Run `eval-core collect` to import session data.');
      return;
    }

    console.log(`\nProjects (${stats.length})\n`);
    console.log(
      'ID'.padEnd(4) +
        'Name'.padEnd(25) +
        'Sessions'.padEnd(10) +
        'Turns'.padEnd(8) +
        'Invocations'.padEnd(13) +
        'Last Seen'
    );
    console.log('-'.repeat(80));

    for (const p of stats) {
      const lastSeen = p.lastSeenAt.split('T')[0];
      console.log(
        String(p.id).padEnd(4) +
          p.name.slice(0, 23).padEnd(25) +
          String(p.sessionCount).padEnd(10) +
          String(p.totalTurns).padEnd(8) +
          String(p.totalInvocations).padEnd(13) +
          lastSeen
      );
    }
    console.log('');
  });

const listSessionsCommand = new Command('sessions')
  .description('List recent sessions')
  .option('--db-path <path>', 'Database file path')
  .option('--limit <n>', 'Number of sessions to show', '20')
  .option('--format <format>', 'Output format: table | json', 'table')
  .action((options: ListCliOptions) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    runMigrations(dbPath);
    const db = createDb(dbPath);
    const limit = parseInt(options.limit ?? '20', 10);
    const sessions = getRecentSessions(db, limit);

    if (options.format === 'json') {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    if (sessions.length === 0) {
      console.log('No sessions found. Run `eval-core collect` to import session data.');
      return;
    }

    console.log(`\nRecent Sessions (${sessions.length})\n`);
    console.log(
      'Session ID'.padEnd(22) +
        'Project'.padEnd(20) +
        'Started'.padEnd(20) +
        'Duration'.padEnd(10) +
        'Turns'.padEnd(7) +
        'Cost'
    );
    console.log('-'.repeat(85));

    for (const s of sessions) {
      const started = s.startedAt.replace('T', ' ').slice(0, 19);
      const project = (s.projectName ?? s.cwd ?? '-').slice(0, 18);
      const sessionShort = s.sessionId.slice(0, 20);
      console.log(
        sessionShort.padEnd(22) +
          project.padEnd(20) +
          started.padEnd(20) +
          formatDuration(s.durationMs).padEnd(10) +
          String(s.turnCount).padEnd(7) +
          formatCost(s.estimatedCostUsd)
      );
    }
    console.log('');
  });

export const listCommand = new Command('list')
  .description('List projects or sessions')
  .addCommand(listProjectsCommand)
  .addCommand(listSessionsCommand);

import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { agentInvocations, sessions, turns } from '../db/schema.js';
import { runMigrations } from '../db/migrate.js';
import { getDefaultConfig } from '../types/config.js';

interface ShowCliOptions {
  dbPath?: string;
  format?: string;
}

export const showCommand = new Command('show')
  .description('Show session detail by session ID (prefix match supported)')
  .argument('<session-id>', 'Session ID or prefix')
  .option('--db-path <path>', 'Database file path')
  .option('--format <format>', 'Output format: text | json', 'text')
  .action((sessionIdArg: string, options: ShowCliOptions) => {
    const config = getDefaultConfig();
    const dbPath = options.dbPath ?? config.sqlitePath;
    runMigrations(dbPath);
    const db = createDb(dbPath);

    // Prefix match: find a session whose ID starts with the provided prefix
    const allSessions = db.select().from(sessions).all();
    const session = allSessions.find(
      (s) => s.sessionId === sessionIdArg || s.sessionId.startsWith(sessionIdArg)
    );

    if (!session) {
      console.error(`Session not found: ${sessionIdArg}`);
      process.exit(1);
    }

    const sessionTurns = db
      .select()
      .from(turns)
      .where(eq(turns.sessionId, session.sessionId))
      .all();

    const sessionInvocations = db
      .select()
      .from(agentInvocations)
      .where(eq(agentInvocations.sessionId, session.sessionId))
      .all();

    const detail = {
      session,
      turns: sessionTurns,
      invocations: sessionInvocations,
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(detail, null, 2));
      return;
    }

    // Text format
    const durationMs = session.durationMs;
    const durationStr = durationMs != null
      ? `${Math.floor(durationMs / 1000)}s`
      : 'ongoing';

    console.log('\n' + '='.repeat(60));
    console.log(`Session: ${session.sessionId}`);
    console.log('='.repeat(60));
    console.log(`Started:   ${session.startedAt}`);
    console.log(`Ended:     ${session.endedAt ?? 'ongoing'}`);
    console.log(`Duration:  ${durationStr}`);
    console.log(`CWD:       ${session.cwd ?? '-'}`);
    console.log(`PID:       ${session.pid ?? '-'}`);
    console.log(`Cost:      ${session.estimatedCostUsd != null ? `$${session.estimatedCostUsd.toFixed(4)}` : '-'}`);
    console.log('');

    console.log(`Turns (${sessionTurns.length})`);
    console.log('-'.repeat(60));
    for (const t of sessionTurns) {
      const ts = t.timestamp.replace('T', ' ').slice(0, 19);
      const input = (t.inputPreview ?? '').slice(0, 60).replace(/\n/g, ' ');
      const output = (t.outputPreview ?? '').slice(0, 60).replace(/\n/g, ' ');
      console.log(`  [${ts}] ${t.turnId.slice(0, 8)}`);
      if (input) console.log(`    Input:  ${input}`);
      if (output) console.log(`    Output: ${output}`);
    }

    if (sessionInvocations.length > 0) {
      console.log('');
      console.log(`Agent Invocations (${sessionInvocations.length})`);
      console.log('-'.repeat(60));
      for (const inv of sessionInvocations) {
        const ts = inv.timestamp.replace('T', ' ').slice(0, 19);
        const status = inv.outcome === 'success' ? '✓' : '✗';
        console.log(`  ${status} [${ts}] ${inv.agentType} (${inv.model})`);
        if (inv.skillName) console.log(`    Skill: ${inv.skillName}`);
        if (inv.errorSummary) console.log(`    Error: ${inv.errorSummary}`);
      }
    }

    console.log('');
  });

import { eq } from 'drizzle-orm';
import { createDb, type EvalDb } from '../db/client.js';
import { agentInvocations, sessions, turns } from '../db/schema.js';
import { parseOutcomeFile } from './outcome-parser.js';
import { parseSessionHistory } from './session-parser.js';
import { estimateTokens } from './token-estimator.js';
import { parseTurnFiles } from './turn-parser.js';

export interface CollectOptions {
  dbPath: string;
  omxLogsDir: string;
  since?: string;
  ppid?: string;
  dryRun?: boolean;
}

export interface CollectResult {
  sessions: number;
  turns: number;
  invocations: number;
}

export async function collect(options: CollectOptions): Promise<CollectResult> {
  const db = createDb(options.dbPath);
  let sessionCount = 0;
  let turnCount = 0;
  let invocationCount = 0;

  sessionCount = await collectSessions(db, options);
  turnCount = await collectTurns(db, options);
  if (options.ppid) {
    invocationCount = collectInvocations(db, options.ppid, options.dryRun);
  }

  return { sessions: sessionCount, turns: turnCount, invocations: invocationCount };
}

async function collectSessions(db: EvalDb, options: CollectOptions): Promise<number> {
  const sessionFile = `${options.omxLogsDir}/session-history.jsonl`;
  const rawSessions = parseSessionHistory(sessionFile);
  let count = 0;

  for (const raw of rawSessions) {
    if (options.since && raw.started_at < options.since) continue;

    const existing = db.select().from(sessions).where(eq(sessions.sessionId, raw.session_id)).get();
    if (existing) continue;

    const durationMs =
      raw.ended_at
        ? new Date(raw.ended_at).getTime() - new Date(raw.started_at).getTime()
        : null;

    if (!options.dryRun) {
      db
        .insert(sessions)
        .values({
          sessionId: raw.session_id,
          startedAt: raw.started_at,
          endedAt: raw.ended_at ?? null,
          cwd: raw.cwd,
          pid: raw.pid,
          durationMs,
          tokenSource: 'estimated',
        })
        .run();
    }
    count++;
  }

  return count;
}

async function collectTurns(db: EvalDb, options: CollectOptions): Promise<number> {
  const sinceDate = options.since?.split('T')[0];
  const rawTurns = parseTurnFiles(options.omxLogsDir, sinceDate);
  let count = 0;

  const allSessions = db.select().from(sessions).all();

  for (const raw of rawTurns) {
    const existing = db.select().from(turns).where(eq(turns.turnId, raw.turn_id)).get();
    if (existing) continue;

    const inputChars = raw.input_preview?.length ?? 0;
    const outputChars = raw.output_preview?.length ?? 0;
    const estInput = estimateTokens(raw.input_preview);
    const estOutput = estimateTokens(raw.output_preview);

    // Match session by time window
    const turnTime = new Date(raw.timestamp).getTime();
    const matchingSession = allSessions.find((s) => {
      const sessionStart = new Date(s.startedAt).getTime();
      const sessionEnd = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      return turnTime >= sessionStart && turnTime <= sessionEnd;
    });

    if (!matchingSession) continue;

    if (!options.dryRun) {
      db
        .insert(turns)
        .values({
          sessionId: matchingSession.sessionId,
          threadId: raw.thread_id,
          turnId: raw.turn_id,
          inputPreview: raw.input_preview,
          outputPreview: raw.output_preview,
          inputChars,
          outputChars,
          estimatedInputTokens: estInput,
          estimatedOutputTokens: estOutput,
          timestamp: raw.timestamp,
        })
        .run();
    }
    count++;
  }

  return count;
}

function collectInvocations(db: EvalDb, ppid: string, dryRun?: boolean): number {
  const rawOutcomes = parseOutcomeFile(ppid);
  let count = 0;

  for (const raw of rawOutcomes) {
    if (!dryRun) {
      db
        .insert(agentInvocations)
        .values({
          sessionPpid: ppid,
          timestamp: raw.timestamp,
          agentType: raw.agent_type,
          model: raw.model,
          outcome: raw.outcome,
          patternUsed: raw.pattern_used ?? null,
          skillName: raw.skill ?? null,
          description: raw.description ?? null,
          errorSummary: raw.error_summary ?? null,
        })
        .run();
    }
    count++;
  }

  return count;
}

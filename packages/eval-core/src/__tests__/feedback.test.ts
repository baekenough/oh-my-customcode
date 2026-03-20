/**
 * Tests for feedback query functions: getAgentFailurePatterns, getSkillEffectiveness,
 * getImprovementSuggestions, and saveImprovementActions.
 * Uses in-memory SQLite for isolation.
 */

import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema.js';
import type { EvalDb } from '../db/client.js';
import {
  getAgentFailurePatterns,
  getImprovementSuggestions,
  getSkillEffectiveness,
  saveImprovementActions,
  type ImprovementSuggestion,
} from '../query/feedback.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): { db: EvalDb; sqlite: Database } {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  // DDL includes improvement_actions table
  const statements = [
    `CREATE TABLE IF NOT EXISTS agent_invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_ppid TEXT NOT NULL,
      session_id TEXT,
      timestamp TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      model TEXT NOT NULL,
      outcome TEXT NOT NULL,
      pattern_used TEXT,
      skill_name TEXT,
      description TEXT,
      error_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS improvement_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_source TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      evidence TEXT,
      applied_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of statements) {
    sqlite.run(sql);
  }

  return { db, sqlite };
}

function seedInvocation(
  db: EvalDb,
  agentType: string,
  outcome: 'success' | 'failure',
  options: { skillName?: string; errorSummary?: string; since?: string } = {}
) {
  db.insert(schema.agentInvocations)
    .values({
      sessionPpid: 'ppid-test',
      sessionId: 'sess-test',
      agentType,
      model: 'claude-sonnet-4-6',
      outcome,
      timestamp: options.since ?? new Date().toISOString(),
      skillName: options.skillName ?? null,
      errorSummary: options.errorSummary ?? null,
    })
    .run();
}

// ---------------------------------------------------------------------------
// getAgentFailurePatterns
// ---------------------------------------------------------------------------

describe('getAgentFailurePatterns', () => {
  it('returns empty array on empty DB', async () => {
    const { db } = makeDb();
    const result = await getAgentFailurePatterns(db);
    expect(result).toEqual([]);
  });

  it('excludes agents below minSessions threshold', async () => {
    const { db } = makeDb();
    // Only 3 invocations — below default minSessions=5
    seedInvocation(db, 'low-data-agent', 'failure');
    seedInvocation(db, 'low-data-agent', 'failure');
    seedInvocation(db, 'low-data-agent', 'success');
    const result = await getAgentFailurePatterns(db, { minSessions: 5 });
    expect(result).toEqual([]);
  });

  it('excludes agents with failure rate at or below threshold', async () => {
    const { db } = makeDb();
    // 5 invocations: 1 failure = 20% failure rate — below default 0.3 threshold
    seedInvocation(db, 'healthy-agent', 'success');
    seedInvocation(db, 'healthy-agent', 'success');
    seedInvocation(db, 'healthy-agent', 'success');
    seedInvocation(db, 'healthy-agent', 'success');
    seedInvocation(db, 'healthy-agent', 'failure');
    const result = await getAgentFailurePatterns(db, { failureRateThreshold: 0.3 });
    expect(result).toEqual([]);
  });

  it('returns agent with failure rate above threshold', async () => {
    const { db } = makeDb();
    // 5 invocations: 4 failures = 80% failure rate
    seedInvocation(db, 'bad-agent', 'failure');
    seedInvocation(db, 'bad-agent', 'failure');
    seedInvocation(db, 'bad-agent', 'failure');
    seedInvocation(db, 'bad-agent', 'failure');
    seedInvocation(db, 'bad-agent', 'success');
    const result = await getAgentFailurePatterns(db, { minSessions: 5 });
    expect(result).toHaveLength(1);
    expect(result[0]?.agentType).toBe('bad-agent');
    expect(result[0]?.totalInvocations).toBe(5);
    expect(result[0]?.failureCount).toBe(4);
    expect(result[0]?.failureRate).toBeCloseTo(0.8);
  });

  it('sorts results by failure rate descending', async () => {
    const { db } = makeDb();
    // Agent A: 6/10 = 60% failure
    for (let i = 0; i < 6; i++) seedInvocation(db, 'agent-a', 'failure');
    for (let i = 0; i < 4; i++) seedInvocation(db, 'agent-a', 'success');
    // Agent B: 9/10 = 90% failure
    for (let i = 0; i < 9; i++) seedInvocation(db, 'agent-b', 'failure');
    for (let i = 0; i < 1; i++) seedInvocation(db, 'agent-b', 'success');

    const result = await getAgentFailurePatterns(db, { minSessions: 5 });
    expect(result[0]?.agentType).toBe('agent-b');
    expect(result[1]?.agentType).toBe('agent-a');
  });

  it('collects commonErrors from errorSummary field', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 5; i++) {
      seedInvocation(db, 'err-agent', 'failure', { errorSummary: `timeout error ${i}` });
    }
    const result = await getAgentFailurePatterns(db, { minSessions: 5 });
    expect(result[0]?.commonErrors).toHaveLength(5);
    expect(result[0]?.commonErrors[0]).toContain('timeout error');
  });

  it('filters by since date', async () => {
    const { db } = makeDb();
    // Old failures (before cutoff)
    const oldDate = '2026-01-01T00:00:00.000Z';
    for (let i = 0; i < 5; i++) {
      seedInvocation(db, 'old-agent', 'failure', { since: oldDate });
    }
    // Query only from recent date — should exclude old data
    const result = await getAgentFailurePatterns(db, {
      since: '2026-06-01T00:00:00.000Z',
      minSessions: 1,
    });
    expect(result).toEqual([]);
  });

  it('respects custom minSessions parameter', async () => {
    const { db } = makeDb();
    // 3 failures — below default 5, but above custom threshold of 2
    seedInvocation(db, 'mid-agent', 'failure');
    seedInvocation(db, 'mid-agent', 'failure');
    seedInvocation(db, 'mid-agent', 'failure');
    const result = await getAgentFailurePatterns(db, {
      minSessions: 3,
      failureRateThreshold: 0.5,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.agentType).toBe('mid-agent');
  });
});

// ---------------------------------------------------------------------------
// getSkillEffectiveness
// ---------------------------------------------------------------------------

describe('getSkillEffectiveness', () => {
  it('returns empty array on empty DB', async () => {
    const { db } = makeDb();
    const result = await getSkillEffectiveness(db);
    expect(result).toEqual([]);
  });

  it('excludes invocations without skillName', async () => {
    const { db } = makeDb();
    // No skill_name set — should be excluded
    for (let i = 0; i < 15; i++) seedInvocation(db, 'some-agent', 'failure');
    const result = await getSkillEffectiveness(db);
    expect(result).toEqual([]);
  });

  it('excludes skills below skillMinInvocations threshold', async () => {
    const { db } = makeDb();
    // Only 5 invocations — below default 10
    for (let i = 0; i < 5; i++) {
      seedInvocation(db, 'agent-x', 'failure', { skillName: 'low-count-skill' });
    }
    const result = await getSkillEffectiveness(db, { skillMinInvocations: 10 });
    expect(result).toEqual([]);
  });

  it('excludes skills with success rate at or above threshold', async () => {
    const { db } = makeDb();
    // 10 invocations: 8 successes = 80% — above default 0.5 threshold
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'agent-y', 'success', { skillName: 'good-skill' });
    }
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'agent-y', 'failure', { skillName: 'good-skill' });
    }
    const result = await getSkillEffectiveness(db, {
      skillMinInvocations: 10,
      skillSuccessRateThreshold: 0.5,
    });
    expect(result).toEqual([]);
  });

  it('returns skill with low success rate', async () => {
    const { db } = makeDb();
    // 10 invocations: 2 successes = 20% — below default 0.5 threshold
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'agent-z', 'success', { skillName: 'bad-skill' });
    }
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'agent-z', 'failure', { skillName: 'bad-skill' });
    }
    const result = await getSkillEffectiveness(db, { skillMinInvocations: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]?.skillName).toBe('bad-skill');
    expect(result[0]?.totalInvocations).toBe(10);
    expect(result[0]?.successCount).toBe(2);
    expect(result[0]?.successRate).toBeCloseTo(0.2);
  });

  it('sorts results by success rate ascending (worst first)', async () => {
    const { db } = makeDb();
    // Skill A: 3/10 = 30% success
    for (let i = 0; i < 3; i++) seedInvocation(db, 'agent', 'success', { skillName: 'skill-a' });
    for (let i = 0; i < 7; i++) seedInvocation(db, 'agent', 'failure', { skillName: 'skill-a' });
    // Skill B: 1/10 = 10% success
    for (let i = 0; i < 1; i++) seedInvocation(db, 'agent', 'success', { skillName: 'skill-b' });
    for (let i = 0; i < 9; i++) seedInvocation(db, 'agent', 'failure', { skillName: 'skill-b' });

    const result = await getSkillEffectiveness(db, { skillMinInvocations: 10 });
    expect(result[0]?.skillName).toBe('skill-b'); // worst first
    expect(result[1]?.skillName).toBe('skill-a');
  });

  it('collects agentTypes that used the skill', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 7; i++) {
      seedInvocation(db, 'agent-alpha', 'failure', { skillName: 'shared-skill' });
    }
    for (let i = 0; i < 3; i++) {
      seedInvocation(db, 'agent-beta', 'failure', { skillName: 'shared-skill' });
    }
    const result = await getSkillEffectiveness(db, { skillMinInvocations: 10 });
    expect(result[0]?.agentTypes).toContain('agent-alpha');
    expect(result[0]?.agentTypes).toContain('agent-beta');
  });
});

// ---------------------------------------------------------------------------
// getImprovementSuggestions
// ---------------------------------------------------------------------------

describe('getImprovementSuggestions', () => {
  it('returns empty array on empty DB', async () => {
    const { db } = makeDb();
    const result = await getImprovementSuggestions(db);
    expect(result).toEqual([]);
  });

  it('returns agent augment suggestion for high failure rate', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 4; i++) seedInvocation(db, 'failing-agent', 'failure');
    seedInvocation(db, 'failing-agent', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 5 });
    const augment = result.find(
      (s) => s.targetType === 'agent' && s.actionType === 'augment'
    );
    expect(augment).toBeDefined();
    expect(augment?.target).toBe('failing-agent');
    // 4/5 = 80% failure rate > 50% → high confidence
    expect(augment?.confidence).toBe('high');
  });

  it('assigns high confidence to agents with >50% failure rate', async () => {
    const { db } = makeDb();
    // 6/10 = 60% failure rate
    for (let i = 0; i < 6; i++) seedInvocation(db, 'high-fail-agent', 'failure');
    for (let i = 0; i < 4; i++) seedInvocation(db, 'high-fail-agent', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 5 });
    const augment = result.find((s) => s.target === 'high-fail-agent' && s.actionType === 'augment');
    expect(augment?.confidence).toBe('high');
  });

  it('includes escalation suggestion for agents >50% failure with >=10 invocations', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 7; i++) seedInvocation(db, 'escalate-agent', 'failure');
    for (let i = 0; i < 3; i++) seedInvocation(db, 'escalate-agent', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 5 });
    const escalate = result.find(
      (s) => s.target === 'escalate-agent' && s.actionType === 'escalate'
    );
    expect(escalate).toBeDefined();
    expect(escalate?.confidence).toBe('medium');
  });

  it('does NOT produce escalation for agents with <10 total invocations', async () => {
    const { db } = makeDb();
    // 4/5 = 80% failure, but only 5 invocations (< 10)
    for (let i = 0; i < 4; i++) seedInvocation(db, 'small-agent', 'failure');
    seedInvocation(db, 'small-agent', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 5 });
    const escalate = result.find(
      (s) => s.target === 'small-agent' && s.actionType === 'escalate'
    );
    expect(escalate).toBeUndefined();
  });

  it('returns skill revise suggestion for low effectiveness', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'agent-x', 'success', { skillName: 'weak-skill' });
    }
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'agent-x', 'failure', { skillName: 'weak-skill' });
    }

    const result = await getImprovementSuggestions(db, {
      minSessions: 1,
      skillMinInvocations: 10,
    });
    const revise = result.find((s) => s.target === 'weak-skill' && s.actionType === 'revise');
    expect(revise).toBeDefined();
    expect(revise?.targetType).toBe('skill');
  });

  it('assigns high confidence to skills with <30% success rate', async () => {
    const { db } = makeDb();
    // 2/10 = 20% success — high confidence
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'agent-q', 'success', { skillName: 'terrible-skill' });
    }
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'agent-q', 'failure', { skillName: 'terrible-skill' });
    }

    const result = await getImprovementSuggestions(db, { skillMinInvocations: 10 });
    const revise = result.find((s) => s.target === 'terrible-skill');
    expect(revise?.confidence).toBe('high');
  });

  it('sorts results with high confidence first', async () => {
    const { db } = makeDb();
    // Agent with medium confidence (40-50% failure)
    for (let i = 0; i < 4; i++) seedInvocation(db, 'medium-agent', 'failure');
    for (let i = 0; i < 6; i++) seedInvocation(db, 'medium-agent', 'success');
    // Skill with high confidence (<30% success)
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'x', 'success', { skillName: 'very-bad-skill' });
    }
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'x', 'failure', { skillName: 'very-bad-skill' });
    }

    const result = await getImprovementSuggestions(db, {
      minSessions: 1,
      failureRateThreshold: 0.3,
      skillMinInvocations: 10,
    });
    // First result should be high confidence
    const highConfidenceFirst = result.findIndex((s) => s.confidence === 'high');
    const mediumConfidenceFirst = result.findIndex((s) => s.confidence === 'medium');
    // High should appear before medium (or there may be no medium in this data set)
    if (mediumConfidenceFirst >= 0) {
      expect(highConfidenceFirst).toBeLessThan(mediumConfidenceFirst);
    }
  });

  it('includes evidence with metric, value, threshold, and sessionCount', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 4; i++) seedInvocation(db, 'ev-agent', 'failure');
    seedInvocation(db, 'ev-agent', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 5 });
    const s = result.find((r) => r.target === 'ev-agent');
    expect(s?.evidence.metric).toBe('failure_rate');
    expect(s?.evidence.value).toBeCloseTo(0.8);
    expect(s?.evidence.threshold).toBe(0.3);
    expect(s?.evidence.sessionCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// saveImprovementActions
// ---------------------------------------------------------------------------

describe('saveImprovementActions', () => {
  it('does nothing when suggestions array is empty', async () => {
    const { db, sqlite } = makeDb();
    await saveImprovementActions(db, []);
    const rows = sqlite
      .prepare<{ count: number }, []>('SELECT count(*) as count FROM improvement_actions')
      .get();
    expect(rows?.count).toBe(0);
  });

  it('persists a single suggestion to improvement_actions', async () => {
    const { db, sqlite } = makeDb();
    const suggestion: ImprovementSuggestion = {
      target: 'test-agent',
      targetType: 'agent',
      actionType: 'augment',
      description: 'Test description',
      confidence: 'medium',
      evidence: { metric: 'failure_rate', value: 0.4, threshold: 0.3, sessionCount: 10 },
    };

    await saveImprovementActions(db, [suggestion]);

    const rows = sqlite
      .prepare<
        { target_name: string; target_type: string; action_type: string; status: string },
        []
      >('SELECT target_name, target_type, action_type, status FROM improvement_actions')
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target_name).toBe('test-agent');
    expect(rows[0]?.target_type).toBe('agent');
    expect(rows[0]?.action_type).toBe('augment');
    expect(rows[0]?.status).toBe('proposed');
  });

  it('persists multiple suggestions and sets status to proposed', async () => {
    const { db, sqlite } = makeDb();
    const suggestions: ImprovementSuggestion[] = [
      {
        target: 'agent-1',
        targetType: 'agent',
        actionType: 'augment',
        description: 'Fix agent 1',
        confidence: 'high',
        evidence: { metric: 'failure_rate', value: 0.6, threshold: 0.3, sessionCount: 20 },
      },
      {
        target: 'skill-1',
        targetType: 'skill',
        actionType: 'revise',
        description: 'Revise skill 1',
        confidence: 'low',
        evidence: { metric: 'success_rate', value: 0.4, threshold: 0.5, sessionCount: 15 },
      },
    ];

    await saveImprovementActions(db, suggestions);

    const rows = sqlite
      .prepare<{ target_name: string }, []>(
        'SELECT target_name FROM improvement_actions ORDER BY id'
      )
      .all();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.target_name).toBe('agent-1');
    expect(rows[1]?.target_name).toBe('skill-1');
  });

  it('serializes evidence as JSON string', async () => {
    const { db, sqlite } = makeDb();
    const evidence = { metric: 'failure_rate', value: 0.5, threshold: 0.3, sessionCount: 8 };
    const suggestion: ImprovementSuggestion = {
      target: 'json-agent',
      targetType: 'agent',
      actionType: 'escalate',
      description: 'Escalate model',
      confidence: 'medium',
      evidence,
    };

    await saveImprovementActions(db, [suggestion]);

    const row = sqlite
      .prepare<{ evidence: string }, []>('SELECT evidence FROM improvement_actions')
      .get();
    expect(row?.evidence).toBeDefined();
    const parsed = JSON.parse(row!.evidence);
    expect(parsed.metric).toBe('failure_rate');
    expect(parsed.value).toBe(0.5);
    expect(parsed.sessionCount).toBe(8);
  });

  it('sets feedbackSource to auto_analysis', async () => {
    const { db, sqlite } = makeDb();
    const suggestion: ImprovementSuggestion = {
      target: 'src-agent',
      targetType: 'agent',
      actionType: 'augment',
      description: 'Augment',
      confidence: 'low',
      evidence: { metric: 'failure_rate', value: 0.35, threshold: 0.3, sessionCount: 6 },
    };

    await saveImprovementActions(db, [suggestion]);

    const row = sqlite
      .prepare<{ feedback_source: string }, []>(
        'SELECT feedback_source FROM improvement_actions'
      )
      .get();
    expect(row?.feedback_source).toBe('auto_analysis');
  });
});

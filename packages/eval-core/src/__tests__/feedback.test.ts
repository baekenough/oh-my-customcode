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
  getRoutingMissPatterns,
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
      priority INTEGER DEFAULT 0,
      cooldown_days INTEGER DEFAULT 7,
      conflict_resolved_by TEXT,
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
  options: { skillName?: string; errorSummary?: string; since?: string; description?: string } = {}
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
      description: options.description ?? null,
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

  it('does not cross-contaminate commonErrors between agent types', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 5; i++) {
      seedInvocation(db, 'agent-A', 'failure', { errorSummary: `alpha-${i}` });
    }
    for (let i = 0; i < 5; i++) {
      seedInvocation(db, 'agent-B', 'failure', { errorSummary: `beta-${i}` });
    }

    const result = await getAgentFailurePatterns(db, {
      minSessions: 5,
      failureRateThreshold: 0,
    });

    expect(result).toHaveLength(2);
    const agentA = result.find((r) => r.agentType === 'agent-A');
    const agentB = result.find((r) => r.agentType === 'agent-B');
    expect(agentA).toBeDefined();
    expect(agentB).toBeDefined();
    for (const err of agentA!.commonErrors) {
      expect(err).toMatch(/^alpha-/);
    }
    for (const err of agentB!.commonErrors) {
      expect(err).toMatch(/^beta-/);
    }
  });

  it('handles error_summary containing special characters', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 5; i++) {
      const err = i === 2 ? 'error\x1Fwith\x1Fdelimiter' : `normal-err-${i}`;
      seedInvocation(db, 'special-agent', 'failure', { errorSummary: err });
    }

    const result = await getAgentFailurePatterns(db, {
      minSessions: 5,
      failureRateThreshold: 0,
    });

    expect(result).toHaveLength(1);
    const agent = result[0];
    // json_group_array preserves entries correctly — exactly 5 entries
    expect(agent.commonErrors).toHaveLength(5);
    expect(agent.commonErrors).toContain('error\x1Fwith\x1Fdelimiter');
  });

  it('returns most recent errors in commonErrors', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 10; i++) {
      seedInvocation(db, 'recency-agent', 'failure', {
        errorSummary: `error-${i}`,
        since: `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }

    const result = await getAgentFailurePatterns(db, {
      minSessions: 5,
      failureRateThreshold: 0,
    });

    expect(result).toHaveLength(1);
    const agent = result[0];
    expect(agent.commonErrors).toHaveLength(5);
    // Most recent first: error-9, error-8, error-7, error-6, error-5
    expect(agent.commonErrors[0]).toBe('error-9');
    expect(agent.commonErrors[4]).toBe('error-5');
  });

  it('applies since filter to errorSummaries subquery', async () => {
    const { db } = makeDb();
    const cutoff = '2026-06-01T00:00:00.000Z';
    const oldDate = '2026-01-01T00:00:00.000Z';
    const newDate = '2026-07-01T00:00:00.000Z';

    // Seed old failures (before cutoff) — errorSummary must NOT appear in result
    for (let i = 0; i < 3; i++) {
      seedInvocation(db, 'filter-agent', 'failure', {
        errorSummary: `old-err-${i}`,
        since: oldDate,
      });
    }

    // Seed new failures (after cutoff) — errorSummary MUST appear in result
    for (let i = 0; i < 3; i++) {
      seedInvocation(db, 'filter-agent', 'failure', {
        errorSummary: `new-err-${i}`,
        since: newDate,
      });
    }

    // Add successes to ensure the agent meets minSessions threshold after since filter
    // The outer query filters by since, so we need enough post-cutoff rows
    for (let i = 0; i < 2; i++) {
      seedInvocation(db, 'filter-agent', 'success', { since: newDate });
    }

    const result = await getAgentFailurePatterns(db, {
      since: cutoff,
      minSessions: 1,
      failureRateThreshold: 0,
    });

    expect(result).toHaveLength(1);
    const agent = result[0];

    // commonErrors must contain only new-err-* entries
    for (const err of agent.commonErrors) {
      expect(err).toMatch(/^new-err-/);
    }

    // old-err-* entries must not appear at all
    for (const err of agent.commonErrors) {
      expect(err).not.toMatch(/^old-err-/);
    }

    // All 3 new errors should be present
    expect(agent.commonErrors).toHaveLength(3);
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
// getRoutingMissPatterns
// ---------------------------------------------------------------------------

describe('getRoutingMissPatterns', () => {
  it('returns zero counts on empty DB', async () => {
    const { db } = makeDb();
    const result = await getRoutingMissPatterns(db);
    expect(result.totalInvocations).toBe(0);
    expect(result.generalPurposeCount).toBe(0);
    expect(result.exploreCount).toBe(0);
    expect(result.missRate).toBe(0);
    expect(result.recentMisses).toEqual([]);
  });

  it('counts general-purpose and Explore invocations correctly', async () => {
    const { db } = makeDb();
    // 6 specialist invocations
    for (let i = 0; i < 6; i++) seedInvocation(db, 'lang-typescript-expert', 'success');
    // 2 general-purpose (routing miss)
    seedInvocation(db, 'general-purpose', 'success', { description: 'help me with code' });
    seedInvocation(db, 'general-purpose', 'success', { description: 'search something' });
    // 2 Explore (routing miss)
    seedInvocation(db, 'Explore', 'success', { description: 'explore codebase' });
    seedInvocation(db, 'Explore', 'success');

    const result = await getRoutingMissPatterns(db);
    expect(result.totalInvocations).toBe(10);
    expect(result.generalPurposeCount).toBe(2);
    expect(result.exploreCount).toBe(2);
    expect(result.missRate).toBeCloseTo(0.4); // 4/10 = 40%
    expect(result.recentMisses).toHaveLength(4);
  });

  it('returns missRate=0 when no routing misses', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 10; i++) seedInvocation(db, 'lang-golang-expert', 'success');

    const result = await getRoutingMissPatterns(db);
    expect(result.totalInvocations).toBe(10);
    expect(result.generalPurposeCount).toBe(0);
    expect(result.exploreCount).toBe(0);
    expect(result.missRate).toBe(0);
    expect(result.recentMisses).toEqual([]);
  });

  it('returns at most 5 recent misses', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 8; i++) {
      seedInvocation(db, 'general-purpose', 'success', {
        description: `task-${i}`,
        since: `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z`,
      });
    }

    const result = await getRoutingMissPatterns(db);
    expect(result.recentMisses).toHaveLength(5);
    // Most recent first (timestamp DESC ordering)
    expect(result.recentMisses[0]?.description).toBe('task-7');
  });

  it('includes description in recentMisses entries', async () => {
    const { db } = makeDb();
    seedInvocation(db, 'general-purpose', 'success', { description: 'analyze this file' });
    seedInvocation(db, 'Explore', 'success', { description: 'find all tests' });

    const result = await getRoutingMissPatterns(db);
    const descriptions = result.recentMisses.map((m) => m.description);
    expect(descriptions).toContain('analyze this file');
    expect(descriptions).toContain('find all tests');
  });
});

// ---------------------------------------------------------------------------
// getImprovementSuggestions — routing miss integration
// ---------------------------------------------------------------------------

describe('getImprovementSuggestions routing miss', () => {
  it('does NOT generate routing_update suggestion below threshold (missRate < 0.15)', async () => {
    const { db } = makeDb();
    // 1 miss out of 10 = 10% miss rate — below 0.15 threshold
    for (let i = 0; i < 9; i++) seedInvocation(db, 'lang-python-expert', 'success');
    seedInvocation(db, 'general-purpose', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 1 });
    const routingUpdate = result.find((s) => s.actionType === 'routing_update');
    expect(routingUpdate).toBeUndefined();
  });

  it('does NOT generate routing_update suggestion when below min sessions (< 10)', async () => {
    const { db } = makeDb();
    // 3 misses out of 4 total = 75% miss rate, but only 4 total (< 10 min sessions)
    for (let i = 0; i < 3; i++) seedInvocation(db, 'general-purpose', 'success');
    seedInvocation(db, 'lang-kotlin-expert', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 1 });
    const routingUpdate = result.find((s) => s.actionType === 'routing_update');
    expect(routingUpdate).toBeUndefined();
  });

  it('generates routing_update suggestion when missRate > 0.15 and >= 10 invocations', async () => {
    const { db } = makeDb();
    // 4 misses out of 20 total = 20% miss rate — above 0.15 threshold
    for (let i = 0; i < 16; i++) seedInvocation(db, 'lang-typescript-expert', 'success');
    for (let i = 0; i < 3; i++) seedInvocation(db, 'general-purpose', 'success');
    seedInvocation(db, 'Explore', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 1 });
    const routingUpdate = result.find((s) => s.actionType === 'routing_update');
    expect(routingUpdate).toBeDefined();
    expect(routingUpdate?.targetType).toBe('routing');
    expect(routingUpdate?.target).toBe('routing');
    expect(routingUpdate?.confidence).toBe('medium');
    expect(routingUpdate?.evidence.metric).toBe('miss_rate');
    expect(routingUpdate?.evidence.threshold).toBe(0.15);
    expect(routingUpdate?.evidence.sessionCount).toBe(20);
    expect(routingUpdate?.evidence.value).toBeCloseTo(0.2);
    expect(routingUpdate?.description).toContain('20.0%');
  });

  it('routing miss suggestion includes miss counts in description', async () => {
    const { db } = makeDb();
    for (let i = 0; i < 10; i++) seedInvocation(db, 'lang-golang-expert', 'success');
    for (let i = 0; i < 3; i++) seedInvocation(db, 'general-purpose', 'success');
    for (let i = 0; i < 2; i++) seedInvocation(db, 'Explore', 'success');

    const result = await getImprovementSuggestions(db, { minSessions: 1 });
    const routingUpdate = result.find((s) => s.actionType === 'routing_update');
    expect(routingUpdate).toBeDefined();
    // Description should mention general-purpose or Explore
    expect(routingUpdate?.description).toContain('general-purpose or Explore');
    // Description should mention 5/15 counts
    expect(routingUpdate?.description).toContain('5/15');
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

  it('replaces existing proposed actions on repeated calls for same target', async () => {
    const { db, sqlite } = makeDb();

    // First call: save an initial suggestion for "agent-1" with actionType "augment"
    const initialSuggestion: ImprovementSuggestion = {
      target: 'agent-1',
      targetType: 'agent',
      actionType: 'augment',
      description: 'Initial augment suggestion',
      confidence: 'medium',
      evidence: { metric: 'failure_rate', value: 0.5, threshold: 0.3, sessionCount: 10 },
    };
    await saveImprovementActions(db, [initialSuggestion]);

    // Verify the initial row was inserted
    const afterFirst = sqlite
      .prepare<{ count: number; action_type: string }, [string]>(
        'SELECT count(*) as count, action_type FROM improvement_actions WHERE target_name = ?'
      )
      .get('agent-1');
    expect(afterFirst?.count).toBe(1);
    expect(afterFirst?.action_type).toBe('augment');

    // Second call: save a different suggestion for the same "agent-1" with actionType "escalate"
    const updatedSuggestion: ImprovementSuggestion = {
      target: 'agent-1',
      targetType: 'agent',
      actionType: 'escalate',
      description: 'Updated escalate suggestion',
      confidence: 'high',
      evidence: { metric: 'failure_rate', value: 0.7, threshold: 0.3, sessionCount: 15 },
    };
    await saveImprovementActions(db, [updatedSuggestion]);

    // Verify only the new suggestion exists — old proposed row was replaced
    const afterSecond = sqlite
      .prepare<
        { count: number; action_type: string; confidence: string },
        [string]
      >(
        'SELECT count(*) as count, action_type, confidence FROM improvement_actions WHERE target_name = ?'
      )
      .get('agent-1');
    expect(afterSecond?.count).toBe(1);
    expect(afterSecond?.action_type).toBe('escalate');
    expect(afterSecond?.confidence).toBe('high');

    // Verify absolute total: only 1 row in the table (no duplicates)
    const total = sqlite
      .prepare<{ count: number }, []>('SELECT count(*) as count FROM improvement_actions')
      .get();
    expect(total?.count).toBe(1);
  });
});

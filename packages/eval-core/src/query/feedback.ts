import { and, eq, gte, sql } from 'drizzle-orm';
import type { EvalDb } from '../db/client.js';
import { agentInvocations, improvementActions } from '../db/schema.js';

export interface FeedbackQueryOptions {
  since?: string; // ISO 8601 date string
  minSessions?: number; // minimum invocation count threshold (not sessions), default 5
  failureRateThreshold?: number; // default 0.3
  skillSuccessRateThreshold?: number; // default 0.5
  skillMinInvocations?: number; // default 10
}

export interface AgentFailurePattern {
  agentType: string;
  totalInvocations: number;
  failureCount: number;
  failureRate: number;
  commonErrors: string[];
  lastFailureAt: string | null;
}

export interface SkillEffectivenessRecord {
  skillName: string;
  totalInvocations: number;
  successCount: number;
  successRate: number;
  agentTypes: string[];
  lastUsedAt: string | null;
}

export interface ImprovementSuggestion {
  target: string;
  targetType: 'agent' | 'skill' | 'rule' | 'routing';
  actionType: 'augment' | 'revise' | 'escalate' | 'routing_update';
  description: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: {
    metric: string;
    value: number;
    threshold: number;
    sessionCount: number;
  };
}

/**
 * Returns agents with failure rate above the given threshold.
 * Only includes agents with enough data (>= minSessions invocations).
 */
export async function getAgentFailurePatterns(
  db: EvalDb,
  options: FeedbackQueryOptions = {}
): Promise<AgentFailurePattern[]> {
  const {
    since,
    minSessions = 5,
    failureRateThreshold = 0.3,
  } = options;

  const conditions = [];
  if (since) {
    conditions.push(gte(agentInvocations.timestamp, since));
  }

  const rows = await db
    .select({
      agentType: agentInvocations.agentType,
      total: sql<number>`count(*)`.as('total'),
      failures: sql<number>`sum(case when ${agentInvocations.outcome} = 'failure' then 1 else 0 end)`.as(
        'failures'
      ),
      errorSummaries: since
        ? sql<string>`(
            SELECT group_concat(sub_es, char(31)) FROM (
              SELECT ai2.error_summary as sub_es
              FROM ${agentInvocations} AS ai2
              WHERE ai2.agent_type = ${agentInvocations}.agent_type
                AND ai2.outcome = 'failure'
                AND ai2.error_summary IS NOT NULL
                AND ai2.timestamp >= ${since}
              ORDER BY ai2.timestamp DESC
              LIMIT 5
            )
          )`.as('error_summaries')
        : sql<string>`(
            SELECT group_concat(sub_es, char(31)) FROM (
              SELECT ai2.error_summary as sub_es
              FROM ${agentInvocations} AS ai2
              WHERE ai2.agent_type = ${agentInvocations}.agent_type
                AND ai2.outcome = 'failure'
                AND ai2.error_summary IS NOT NULL
              ORDER BY ai2.timestamp DESC
              LIMIT 5
            )
          )`.as('error_summaries'),
      lastFailureAt: sql<string | null>`max(case when ${agentInvocations.outcome} = 'failure' then ${agentInvocations.timestamp} end)`.as(
        'last_failure_at'
      ),
    })
    .from(agentInvocations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(agentInvocations.agentType);

  const results: AgentFailurePattern[] = [];
  for (const row of rows) {
    const total = Number(row.total);
    const failures = Number(row.failures ?? 0);
    if (total < minSessions) continue;

    const failureRate = failures / total;
    if (failureRate <= failureRateThreshold) continue;

    const rawErrors = row.errorSummaries ?? '';
    const commonErrors = rawErrors
      .split('\x1F')
      .filter(Boolean)
      .filter((e) => e !== 'null');

    results.push({
      agentType: row.agentType,
      totalInvocations: total,
      failureCount: failures,
      failureRate,
      commonErrors,
      lastFailureAt: row.lastFailureAt ?? null,
    });
  }

  return results.sort((a, b) => b.failureRate - a.failureRate);
}

/**
 * Returns skills sorted by success rate (ascending — worst first).
 * Only includes skills with enough data (>= skillMinInvocations invocations).
 */
export async function getSkillEffectiveness(
  db: EvalDb,
  options: FeedbackQueryOptions = {}
): Promise<SkillEffectivenessRecord[]> {
  const {
    since,
    skillMinInvocations = 10,
    skillSuccessRateThreshold = 0.5,
  } = options;

  const conditions = [sql`${agentInvocations.skillName} is not null`];
  if (since) {
    conditions.push(gte(agentInvocations.timestamp, since));
  }

  const rows = await db
    .select({
      skillName: agentInvocations.skillName,
      total: sql<number>`count(*)`.as('total'),
      successes: sql<number>`sum(case when ${agentInvocations.outcome} = 'success' then 1 else 0 end)`.as(
        'successes'
      ),
      agentTypes: sql<string>`group_concat(distinct ${agentInvocations.agentType})`.as(
        'agent_types'
      ),
      lastUsedAt: sql<string | null>`max(${agentInvocations.timestamp})`.as('last_used_at'),
    })
    .from(agentInvocations)
    .where(and(...conditions))
    .groupBy(agentInvocations.skillName);

  const results: SkillEffectivenessRecord[] = [];
  for (const row of rows) {
    if (!row.skillName) continue;
    const total = Number(row.total);
    const successes = Number(row.successes ?? 0);
    if (total < skillMinInvocations) continue;

    const successRate = successes / total;
    if (successRate >= skillSuccessRateThreshold) continue;

    results.push({
      skillName: row.skillName,
      totalInvocations: total,
      successCount: successes,
      successRate,
      agentTypes: (row.agentTypes ?? '').split(',').filter(Boolean),
      lastUsedAt: row.lastUsedAt ?? null,
    });
  }

  return results.sort((a, b) => a.successRate - b.successRate);
}

/**
 * Combines agent failure patterns and skill effectiveness into actionable suggestions.
 * Each suggestion has target, type, confidence, and evidence.
 */
export async function getImprovementSuggestions(
  db: EvalDb,
  options: FeedbackQueryOptions = {}
): Promise<ImprovementSuggestion[]> {
  const [agentPatterns, skillRecords] = await Promise.all([
    getAgentFailurePatterns(db, options),
    getSkillEffectiveness(db, options),
  ]);

  const suggestions: ImprovementSuggestion[] = [];

  // Agent high failure rate suggestions
  for (const pattern of agentPatterns) {
    const threshold = options.failureRateThreshold ?? 0.3;

    // Suggest skill augmentation
    suggestions.push({
      target: pattern.agentType,
      targetType: 'agent',
      actionType: 'augment',
      description: `Agent "${pattern.agentType}" has ${(pattern.failureRate * 100).toFixed(1)}% failure rate (${pattern.failureCount}/${pattern.totalInvocations}). Add relevant guide references to agent skills.`,
      confidence: pattern.failureRate > 0.5 ? 'high' : 'medium',
      evidence: {
        metric: 'failure_rate',
        value: pattern.failureRate,
        threshold,
        sessionCount: pattern.totalInvocations,
      },
    });

    // Suggest model escalation for consistently failing agents
    if (pattern.failureRate > 0.5 && pattern.totalInvocations >= 10) {
      suggestions.push({
        target: pattern.agentType,
        targetType: 'agent',
        actionType: 'escalate',
        description: `Agent "${pattern.agentType}" failure rate exceeds 50%. Consider upgrading default model (haiku → sonnet, or sonnet → opus).`,
        confidence: 'medium',
        evidence: {
          metric: 'failure_rate',
          value: pattern.failureRate,
          threshold: 0.5,
          sessionCount: pattern.totalInvocations,
        },
      });
    }
  }

  // Skill low effectiveness suggestions
  for (const skill of skillRecords) {
    const threshold = options.skillSuccessRateThreshold ?? 0.5;

    suggestions.push({
      target: skill.skillName,
      targetType: 'skill',
      actionType: 'revise',
      description: `Skill "${skill.skillName}" has ${(skill.successRate * 100).toFixed(1)}% success rate (${skill.successCount}/${skill.totalInvocations}). Review and rewrite skill workflow.`,
      confidence: skill.successRate < 0.3 ? 'high' : 'low',
      evidence: {
        metric: 'success_rate',
        value: skill.successRate,
        threshold,
        sessionCount: skill.totalInvocations,
      },
    });
  }

  // Sort: high confidence first, then medium, then low
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return suggestions.sort(
    (a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2)
  );
}

/**
 * Saves improvement suggestions to the improvement_actions table.
 * Deduplicates by removing existing proposed actions for the same targets
 * before inserting, to prevent duplicates on repeated runs.
 */
export async function saveImprovementActions(
  db: EvalDb,
  suggestions: ImprovementSuggestion[]
): Promise<void> {
  if (suggestions.length === 0) return;

  // Remove existing proposed actions for targets that will be re-analyzed
  const targetNames = [...new Set(suggestions.map((s) => s.target))];
  for (const name of targetNames) {
    await db
      .delete(improvementActions)
      .where(
        and(
          eq(improvementActions.targetName, name),
          eq(improvementActions.status, 'proposed')
        )
      );
  }

  await db.insert(improvementActions).values(
    suggestions.map((s) => ({
      feedbackSource: 'auto_analysis' as const,
      targetType: s.targetType,
      targetName: s.target,
      actionType: s.actionType,
      description: s.description,
      confidence: s.confidence,
      status: 'proposed' as const,
      evidence: JSON.stringify(s.evidence),
    }))
  );
}

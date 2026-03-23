import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { EvalDb } from '../db/client.js';
import { agentInvocations, improvementActions } from '../db/schema.js';
import { fetchUserFeedbackIssues, type UserFeedbackEntry } from './user-feedback.js';

/**
 * Opposing action pairs that conflict when targeting the same entity.
 * e.g., "escalate" and "augment" are complementary (both valid),
 * but "escalate" and "de-escalate" would conflict (if we add de-escalate later).
 * Currently only augment+revise for skills conflicts.
 */
const CONFLICT_PAIRS: [string, string][] = [
  // If a skill needs revision, augmenting it first is wasteful
  ['revise', 'augment'],
];

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

export interface RoutingMissPattern {
  totalInvocations: number;
  generalPurposeCount: number;
  exploreCount: number;
  missRate: number;
  recentMisses: Array<{ agentType: string; description: string; createdAt: string }>;
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
            SELECT json_group_array(sub_es) FROM (
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
            SELECT json_group_array(sub_es) FROM (
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

    const rawErrors = row.errorSummaries ?? '[]';
    let commonErrors: string[];
    try {
      commonErrors = (JSON.parse(rawErrors) as string[]).filter(
        (e) => e != null && e !== 'null'
      );
    } catch {
      commonErrors = [];
    }

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
      agentTypes: sql<string>`(
        SELECT json_group_array(sub_at) FROM (
          SELECT DISTINCT ai3.agent_type as sub_at
          FROM ${agentInvocations} AS ai3
          WHERE ai3.skill_name = ${agentInvocations}.skill_name
        )
      )`.as('agent_types'),
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
      agentTypes: (() => {
        try {
          return (JSON.parse(row.agentTypes ?? '[]') as string[]).filter(Boolean);
        } catch {
          return [];
        }
      })(),
      lastUsedAt: row.lastUsedAt ?? null,
    });
  }

  return results.sort((a, b) => a.successRate - b.successRate);
}

/**
 * Returns routing miss analysis: invocations where general-purpose or Explore agent
 * was used instead of a specialized agent (indicating a routing miss).
 */
export async function getRoutingMissPatterns(
  db: EvalDb,
  options: FeedbackQueryOptions = {}
): Promise<RoutingMissPattern> {
  const { since } = options;

  const baseConditions = since ? [gte(agentInvocations.timestamp, since)] : [];
  const agentTypeFilter = sql`${agentInvocations.agentType} IN ('general-purpose', 'Explore')`;

  // Total invocations across all agents
  const totalResult = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(agentInvocations)
    .where(baseConditions.length > 0 ? and(...baseConditions) : undefined);

  const totalInvocations = Number(totalResult[0]?.count ?? 0);

  // Miss invocations grouped by agent type
  const missWhere =
    baseConditions.length > 0 ? and(...baseConditions, agentTypeFilter) : agentTypeFilter;

  const missCountResult = await db
    .select({
      agentType: agentInvocations.agentType,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(agentInvocations)
    .where(missWhere)
    .groupBy(agentInvocations.agentType);

  let generalPurposeCount = 0;
  let exploreCount = 0;
  for (const row of missCountResult) {
    if (row.agentType === 'general-purpose') generalPurposeCount = Number(row.count);
    if (row.agentType === 'Explore') exploreCount = Number(row.count);
  }

  const missRate =
    totalInvocations > 0 ? (generalPurposeCount + exploreCount) / totalInvocations : 0;

  // 5 most recent misses with description
  const recentMissesResult = await db
    .select({
      agentType: agentInvocations.agentType,
      description: agentInvocations.description,
      createdAt: agentInvocations.createdAt,
    })
    .from(agentInvocations)
    .where(missWhere)
    .orderBy(desc(agentInvocations.timestamp))
    .limit(5);

  const recentMisses = recentMissesResult.map((row) => ({
    agentType: row.agentType,
    description: row.description ?? '',
    createdAt: row.createdAt ?? '',
  }));

  return {
    totalInvocations,
    generalPurposeCount,
    exploreCount,
    missRate,
    recentMisses,
  };
}

/**
 * Combines agent failure patterns and skill effectiveness into actionable suggestions.
 * Each suggestion has target, type, confidence, and evidence.
 */
export async function getImprovementSuggestions(
  db: EvalDb,
  options: FeedbackQueryOptions = {}
): Promise<ImprovementSuggestion[]> {
  const [agentPatterns, skillRecords, routingMiss] = await Promise.all([
    getAgentFailurePatterns(db, options),
    getSkillEffectiveness(db, options),
    getRoutingMissPatterns(db, options),
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

  // Routing miss suggestion (from improvement-rules.yml: routing-miss threshold 0.15, min 10)
  const ROUTING_MISS_THRESHOLD = 0.15;
  const ROUTING_MISS_MIN_SESSIONS = 10;
  if (
    routingMiss.totalInvocations >= ROUTING_MISS_MIN_SESSIONS &&
    routingMiss.missRate > ROUTING_MISS_THRESHOLD
  ) {
    const missCount = routingMiss.generalPurposeCount + routingMiss.exploreCount;
    const recentPatterns = routingMiss.recentMisses
      .map((m) => m.description)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');

    suggestions.push({
      target: 'routing',
      targetType: 'routing',
      actionType: 'routing_update',
      description: `Routing miss rate is ${(routingMiss.missRate * 100).toFixed(1)}% (${missCount}/${routingMiss.totalInvocations} invocations used general-purpose or Explore agent). Add keywords/patterns to routing skill.${recentPatterns ? ` Recent patterns: ${recentPatterns}` : ''}`,
      confidence: 'medium',
      evidence: {
        metric: 'miss_rate',
        value: routingMiss.missRate,
        threshold: ROUTING_MISS_THRESHOLD,
        sessionCount: routingMiss.totalInvocations,
      },
    });
  }

  // Merge user-explicit feedback from GitHub issues
  const userFeedback = fetchUserFeedbackIssues();
  const userSuggestions = userFeedbackToSuggestions(userFeedback);
  suggestions.push(...userSuggestions);

  // Apply conflict resolution
  const resolved = filterConflicts(suggestions);

  // Apply cooldown filtering
  const filtered = await filterCooldowns(db, resolved);

  // Sort: high confidence first, then medium, then low
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return filtered.sort(
    (a, b) => (confidenceOrder[a.confidence] ?? 2) - (confidenceOrder[b.confidence] ?? 2)
  );
}

/**
 * Converts user-explicit feedback entries into ImprovementSuggestion format.
 * Only negative-sentiment entries with a specific target (non-general) are included.
 */
export function userFeedbackToSuggestions(entries: UserFeedbackEntry[]): ImprovementSuggestion[] {
  return entries
    .filter((e) => e.targetType !== 'general' && e.sentiment === 'negative')
    .map((e) => ({
      target: e.target,
      targetType: (e.targetType === 'general' ? 'agent' : e.targetType) as ImprovementSuggestion['targetType'],
      actionType: 'revise' as const,
      description: `User feedback (issue #${e.issueNumber}): "${e.title}"`,
      confidence: 'medium' as const,
      evidence: {
        metric: 'user_feedback',
        value: 1,
        threshold: 0,
        sessionCount: 1,
      },
    }));
}

/**
 * Resolves conflicts between suggestions targeting the same entity.
 * Groups suggestions by target, then checks all pairs for conflicts.
 * When a conflict is found, keeps the higher-confidence entry; on tie, keeps the earlier one.
 */
export function filterConflicts(
  suggestions: ImprovementSuggestion[]
): ImprovementSuggestion[] {
  const confidenceOrder: Record<string, number> = { high: 2, medium: 1, low: 0 };
  const byTarget = new Map<string, ImprovementSuggestion[]>();

  // Group by target
  for (const s of suggestions) {
    const list = byTarget.get(s.target) ?? [];
    list.push(s);
    byTarget.set(s.target, list);
  }

  const result: ImprovementSuggestion[] = [];

  for (const [, group] of byTarget) {
    if (group.length <= 1) {
      result.push(...group);
      continue;
    }

    // Check all pairs for conflicts, keep the higher-confidence one
    const removed = new Set<number>();
    for (let i = 0; i < group.length; i++) {
      if (removed.has(i)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (removed.has(j)) continue;
        const isConflict = CONFLICT_PAIRS.some(
          ([a, b]) =>
            (group[i].actionType === a && group[j].actionType === b) ||
            (group[i].actionType === b && group[j].actionType === a)
        );
        if (isConflict) {
          const scoreI = confidenceOrder[group[i].confidence] ?? 0;
          const scoreJ = confidenceOrder[group[j].confidence] ?? 0;
          // Remove the lower-confidence one; on tie, remove the later one
          if (scoreJ > scoreI) {
            removed.add(i);
          } else {
            removed.add(j);
          }
        }
      }
    }

    for (let i = 0; i < group.length; i++) {
      if (!removed.has(i)) result.push(group[i]);
    }
  }

  return result;
}

/**
 * Filters out suggestions for targets that have been recently actioned
 * (applied or rejected within cooldown period).
 */
export async function filterCooldowns(
  db: EvalDb,
  suggestions: ImprovementSuggestion[],
  defaultCooldownDays = 7
): Promise<ImprovementSuggestion[]> {
  if (suggestions.length === 0) return [];

  const targetNames = [...new Set(suggestions.map((s) => s.target))];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - defaultCooldownDays);
  const cutoffStr = cutoff.toISOString();

  // Find recently actioned targets
  const recentActions = await db
    .select({ targetName: improvementActions.targetName })
    .from(improvementActions)
    .where(
      and(
        sql`${improvementActions.targetName} IN (${sql.join(
          targetNames.map((n) => sql`${n}`),
          sql`, `
        )})`,
        sql`${improvementActions.status} IN ('applied', 'rejected')`,
        gte(improvementActions.createdAt, cutoffStr)
      )
    );

  const cooledDown = new Set(recentActions.map((r) => r.targetName));
  return suggestions.filter((s) => !cooledDown.has(s.target));
}

/**
 * Update the status of an improvement action with state machine enforcement.
 * Valid transitions: proposed→approved, approved→applied, approved→rejected
 */
export function updateImprovementActionStatus(
  db: EvalDb,
  id: number,
  newStatus: 'approved' | 'applied' | 'rejected',
  metadata?: { appliedAt?: string }
): void {
  const existing = db
    .select()
    .from(improvementActions)
    .where(eq(improvementActions.id, id))
    .get();
  if (!existing) {
    throw new Error(`ImprovementAction #${id} not found`);
  }

  // State machine enforcement
  const validTransitions: Record<string, string[]> = {
    proposed: ['approved'],
    approved: ['applied', 'rejected'],
  };

  const allowed = validTransitions[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${existing.status} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'applied') {
    updateData.appliedAt = metadata?.appliedAt ?? new Date().toISOString();
  }

  db.update(improvementActions).set(updateData).where(eq(improvementActions.id, id)).run();
}

/**
 * Get improvement actions filtered by status.
 * Defaults to 'proposed' status if no filter specified.
 */
export function getPendingImprovementActions(
  db: EvalDb,
  statusFilter: 'proposed' | 'approved' = 'proposed'
): Array<typeof improvementActions.$inferSelect> {
  return db
    .select()
    .from(improvementActions)
    .where(eq(improvementActions.status, statusFilter))
    .all();
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

  const targetNames = [...new Set(suggestions.map((s) => s.target))];
  const values = suggestions.map((s) => ({
    feedbackSource: 'auto_analysis' as const,
    targetType: s.targetType,
    targetName: s.target,
    actionType: s.actionType,
    description: s.description,
    confidence: s.confidence,
    status: 'proposed' as const,
    evidence: JSON.stringify(s.evidence),
  }));

  // drizzle-orm/bun-sqlite transaction() only supports synchronous callbacks.
  // Use .run() for synchronous execution inside the transaction.
  db.transaction((tx) => {
    for (const name of targetNames) {
      tx.delete(improvementActions)
        .where(
          and(
            eq(improvementActions.targetName, name),
            eq(improvementActions.status, 'proposed')
          )
        )
        .run();
    }
    tx.insert(improvementActions).values(values).run();
  });
}

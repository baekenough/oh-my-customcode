import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { EvalDb } from '../db/client.js';
import { agentInvocations, projects, sessions, turns } from '../db/schema.js';
import type { AgentStat, DashboardStats, ProjectStats, SessionStats } from './types.js';

export function getProjectStats(db: EvalDb): ProjectStats[] {
  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      cwd: projects.cwd,
      lastSeenAt: projects.lastSeenAt,
      createdAt: projects.createdAt,
      sessionCount: count(sessions.id),
    })
    .from(projects)
    .leftJoin(sessions, eq(sessions.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.lastSeenAt))
    .all();

  return rows.map((row) => {
    const turnCountRow = db
      .select({ total: count(turns.id) })
      .from(turns)
      .innerJoin(sessions, eq(turns.sessionId, sessions.sessionId))
      .where(eq(sessions.projectId, row.id))
      .get();

    const invCountRow = db
      .select({ total: count(agentInvocations.id) })
      .from(agentInvocations)
      .innerJoin(sessions, eq(agentInvocations.sessionId, sessions.sessionId))
      .where(eq(sessions.projectId, row.id))
      .get();

    return {
      id: row.id,
      name: row.name,
      cwd: row.cwd,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      sessionCount: row.sessionCount,
      totalTurns: turnCountRow?.total ?? 0,
      totalInvocations: invCountRow?.total ?? 0,
    };
  });
}

export function getRecentSessions(db: EvalDb, limit = 20): SessionStats[] {
  const rows = db
    .select({
      id: sessions.id,
      sessionId: sessions.sessionId,
      projectId: sessions.projectId,
      projectName: projects.name,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      cwd: sessions.cwd,
      durationMs: sessions.durationMs,
      estimatedCostUsd: sessions.estimatedCostUsd,
    })
    .from(sessions)
    .leftJoin(projects, eq(sessions.projectId, projects.id))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

  return rows.map((row) => {
    const turnCountRow = db
      .select({ total: count(turns.id) })
      .from(turns)
      .where(eq(turns.sessionId, row.sessionId))
      .get();

    const invCountRow = db
      .select({ total: count(agentInvocations.id) })
      .from(agentInvocations)
      .where(eq(agentInvocations.sessionId, row.sessionId))
      .get();

    return {
      id: row.id,
      sessionId: row.sessionId,
      projectId: row.projectId ?? null,
      projectName: row.projectName ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
      cwd: row.cwd ?? null,
      durationMs: row.durationMs ?? null,
      turnCount: turnCountRow?.total ?? 0,
      invocationCount: invCountRow?.total ?? 0,
      estimatedCostUsd: row.estimatedCostUsd ?? null,
    };
  });
}

export function getAgentStats(db: EvalDb): AgentStat[] {
  const rows = db
    .select({
      agentType: agentInvocations.agentType,
      total: count(agentInvocations.id),
      lastUsed: sql<string>`MAX(${agentInvocations.timestamp})`,
    })
    .from(agentInvocations)
    .groupBy(agentInvocations.agentType)
    .orderBy(desc(count(agentInvocations.id)))
    .all();

  return rows.map((row) => {
    const successRow = db
      .select({ total: count(agentInvocations.id) })
      .from(agentInvocations)
      .where(
        and(
          eq(agentInvocations.agentType, row.agentType),
          eq(agentInvocations.outcome, 'success')
        )
      )
      .get();

    const successCount = successRow?.total ?? 0;
    const failureCount = row.total - successCount;

    return {
      agentType: row.agentType,
      totalInvocations: row.total,
      successCount,
      failureCount,
      successRate: row.total > 0 ? successCount / row.total : 0,
      lastUsed: row.lastUsed,
    };
  });
}

export function getDashboardStats(db: EvalDb): DashboardStats {
  const totalSessionsRow = db.select({ total: count(sessions.id) }).from(sessions).get();
  const totalTurnsRow = db.select({ total: count(turns.id) }).from(turns).get();
  const totalInvocationsRow = db
    .select({ total: count(agentInvocations.id) })
    .from(agentInvocations)
    .get();
  const totalProjectsRow = db.select({ total: count(projects.id) }).from(projects).get();

  return {
    totalSessions: totalSessionsRow?.total ?? 0,
    totalTurns: totalTurnsRow?.total ?? 0,
    totalInvocations: totalInvocationsRow?.total ?? 0,
    totalProjects: totalProjectsRow?.total ?? 0,
    recentSessions: getRecentSessions(db, 10),
    topAgents: getAgentStats(db).slice(0, 10),
  };
}

export interface ProjectStats {
  id: number;
  name: string;
  cwd: string;
  lastSeenAt: string;
  createdAt: string;
  sessionCount: number;
  totalTurns: number;
  totalInvocations: number;
}

export interface SessionStats {
  id: number;
  sessionId: string;
  projectId: number | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string | null;
  cwd: string | null;
  durationMs: number | null;
  turnCount: number;
  invocationCount: number;
  estimatedCostUsd: number | null;
}

export interface AgentStat {
  agentType: string;
  totalInvocations: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastUsed: string;
}

export interface DashboardStats {
  totalSessions: number;
  totalTurns: number;
  totalInvocations: number;
  totalProjects: number;
  recentSessions: SessionStats[];
  topAgents: AgentStat[];
}

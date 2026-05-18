import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const improvementActions = sqliteTable('improvement_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedbackSource: text('feedback_source').notNull(), // 'auto_analysis' | 'user_feedback'
  targetType: text('target_type').notNull(), // 'agent' | 'skill' | 'rule' | 'routing'
  targetName: text('target_name').notNull(),
  actionType: text('action_type').notNull(), // 'augment' | 'revise' | 'escalate' | 'routing_update'
  description: text('description').notNull(),
  confidence: text('confidence').notNull(), // 'low' | 'medium' | 'high'
  status: text('status').notNull().default('proposed'), // 'proposed' | 'approved' | 'applied' | 'rejected'
  evidence: text('evidence'), // JSON
  priority: integer('priority').default(0), // higher = more important
  cooldownDays: integer('cooldown_days').default(7), // days before same target can be re-suggested
  conflictResolvedBy: text('conflict_resolved_by'), // which action won conflict resolution
  appliedAt: text('applied_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  cwd: text('cwd').notNull().unique(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().unique(),
  projectId: integer('project_id').references(() => projects.id),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  cwd: text('cwd'),
  pid: integer('pid'),
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  estimatedCostUsd: real('estimated_cost_usd'),
  tokenSource: text('token_source'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const turns = sqliteTable('turns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.sessionId),
  threadId: text('thread_id').notNull(),
  turnId: text('turn_id').notNull().unique(),
  inputPreview: text('input_preview'),
  outputPreview: text('output_preview'),
  inputChars: integer('input_chars'),
  outputChars: integer('output_chars'),
  estimatedInputTokens: integer('estimated_input_tokens'),
  estimatedOutputTokens: integer('estimated_output_tokens'),
  timestamp: text('timestamp').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const agentInvocations = sqliteTable('agent_invocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionPpid: text('session_ppid').notNull(),
  sessionId: text('session_id'),
  timestamp: text('timestamp').notNull(),
  agentType: text('agent_type').notNull(),
  model: text('model').notNull(),
  outcome: text('outcome').notNull(),
  patternUsed: text('pattern_used'),
  skillName: text('skill_name'),
  description: text('description'),
  errorSummary: text('error_summary'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const evaluations = sqliteTable('evaluations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  turnId: text('turn_id').references(() => turns.turnId),
  sessionId: text('session_id').references(() => sessions.sessionId),
  score: integer('score'),              // 1-5
  verdict: text('verdict'),             // pass | fail | needs_refinement
  tags: text('tags'),                   // JSON array string: ["good_prompt", "wrong_routing"]
  comment: text('comment'),
  evaluatedAt: text('evaluated_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const sessionFeedback = sqliteTable('session_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.sessionId),
  rating: integer('rating'),            // 1-5
  tags: text('tags'),                   // JSON array string
  comment: text('comment'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// added v0.118.3, #1047 — unified memory records across all four sources
// updated #1178 — added 5th source 'agentmemory' (STUB, activates in #1169 Phase 1)
export const memoryRecords = sqliteTable('memory_records', {
  id: text('id').primaryKey(), // UUID
  source: text('source').notNull(), // 'native' | 'claude-mem' | 'episodic-memory' | 'llm-memory' | 'agentmemory'
  deviceId: text('device_id').notNull(), // hostname
  project: text('project').notNull(), // workspace path
  agent: text('agent'), // nullable
  timestamp: text('timestamp').notNull(), // ISO8601
  summary: text('summary').notNull(), // 1-2 sentence
  content: text('content').notNull(), // full body
  tags: text('tags').notNull(), // JSON array stringified
  sensitivity: text('sensitivity').notNull(), // 'public' | 'project' | 'sensitive' | 'secret'
  hash: text('hash').notNull().unique(), // SHA-256
  embeddingRef: text('embedding_ref'), // nullable
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// added v0.116.0, #1036 — ideal trajectory annotations (baseline)
export const evalBaselines = sqliteTable('eval_baselines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  capability: text('capability').notNull(), // file_operations | retrieval | tool_use | memory | conversation | summarization
  idealSteps: integer('ideal_steps').notNull(),
  idealToolCalls: integer('ideal_tool_calls').notNull(),
  idealLatencyMs: integer('ideal_latency_ms').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// added v0.116.0, #1036 — observed agent execution trajectories
// Note: name is `agentTrajectories` (NOT agentInvocations — that table exists for a different purpose)
export const agentTrajectories = sqliteTable('agent_trajectories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  baselineId: integer('baseline_id').references(() => evalBaselines.id),
  agentName: text('agent_name').notNull(),
  model: text('model'),
  observedSteps: integer('observed_steps').notNull(),
  observedToolCalls: integer('observed_tool_calls').notNull(),
  observedLatencyMs: integer('observed_latency_ms').notNull(),
  correctness: integer('correctness', { mode: 'boolean' }).notNull(),
  stepRatio: real('step_ratio'),       // observed / ideal
  toolCallRatio: real('tool_call_ratio'),
  latencyRatio: real('latency_ratio'),
  sessionId: text('session_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
});

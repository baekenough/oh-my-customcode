import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

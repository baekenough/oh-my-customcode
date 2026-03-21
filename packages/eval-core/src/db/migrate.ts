import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function runMigrations(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    runMigrationsOnDb(db);
  } catch (err) {
    db.close();
    throw err;
  }
  db.close();
}

function runMigrationsOnDb(db: InstanceType<typeof Database>): void {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');

  // Create tables using bun:sqlite (SQL DDL, not shell)
  const statements = [
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL UNIQUE,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      project_id INTEGER REFERENCES projects(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      cwd TEXT,
      pid INTEGER,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      estimated_cost_usd REAL,
      token_source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      thread_id TEXT NOT NULL,
      turn_id TEXT NOT NULL UNIQUE,
      input_preview TEXT,
      output_preview TEXT,
      input_chars INTEGER,
      output_chars INTEGER,
      estimated_input_tokens INTEGER,
      estimated_output_tokens INTEGER,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
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
    `CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id TEXT REFERENCES turns(turn_id),
      session_id TEXT REFERENCES sessions(session_id),
      score INTEGER,
      verdict TEXT,
      tags TEXT,
      comment TEXT,
      evaluated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS session_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      rating INTEGER,
      tags TEXT,
      comment TEXT,
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
    'CREATE INDEX IF NOT EXISTS idx_projects_cwd ON projects(cwd)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_invocations_ppid ON agent_invocations(session_ppid)',
    'CREATE INDEX IF NOT EXISTS idx_invocations_agent_type ON agent_invocations(agent_type)',
    'CREATE INDEX IF NOT EXISTS idx_invocations_type_outcome_ts ON agent_invocations(agent_type, outcome, timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_evaluations_session_id ON evaluations(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_evaluations_turn_id ON evaluations(turn_id)',
    'CREATE INDEX IF NOT EXISTS idx_feedback_session_id ON session_feedback(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_improvement_actions_target ON improvement_actions(target_name)',
    'CREATE INDEX IF NOT EXISTS idx_improvement_actions_status ON improvement_actions(status)',
  ];

  for (const sql of statements) {
    db.run(sql);
  }

  // Migrations: add project_id column to existing sessions table (idempotent)
  try {
    db.run('ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
      throw err; // Re-throw unexpected errors (e.g., disk I/O)
    }
  }

  // Migration: add conflict resolution columns to improvement_actions (idempotent)
  for (const col of [
    'ALTER TABLE improvement_actions ADD COLUMN priority INTEGER DEFAULT 0',
    'ALTER TABLE improvement_actions ADD COLUMN cooldown_days INTEGER DEFAULT 7',
    'ALTER TABLE improvement_actions ADD COLUMN conflict_resolved_by TEXT',
  ]) {
    try {
      db.run(col);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
        throw err;
      }
    }
  }

  // Add project_id index after the ALTER TABLE migration (column may not exist on legacy DBs)
  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id)');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('already exists') && !msg.includes('no such column')) {
      throw err; // Re-throw unexpected errors
    }
  }
}

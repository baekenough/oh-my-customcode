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
    // v0.118.3, #1047 — unified memory records
    `CREATE TABLE IF NOT EXISTS memory_records (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      device_id TEXT NOT NULL,
      project TEXT NOT NULL,
      agent TEXT,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      embedding_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_memory_records_source ON memory_records(source)',
    'CREATE INDEX IF NOT EXISTS idx_memory_records_device_project ON memory_records(device_id, project)',
    'CREATE INDEX IF NOT EXISTS idx_memory_records_timestamp ON memory_records(timestamp DESC)',
    // idx_memory_records_hash is covered by the UNIQUE constraint on hash column
    // v0.116.0, #1036 — eval baselines and trajectories
    `CREATE TABLE IF NOT EXISTS eval_baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      ideal_steps INTEGER NOT NULL,
      ideal_tool_calls INTEGER NOT NULL,
      ideal_latency_ms INTEGER NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agent_trajectories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      baseline_id INTEGER REFERENCES eval_baselines(id),
      agent_name TEXT NOT NULL,
      model TEXT,
      observed_steps INTEGER NOT NULL,
      observed_tool_calls INTEGER NOT NULL,
      observed_latency_ms INTEGER NOT NULL,
      correctness INTEGER NOT NULL,
      step_ratio REAL,
      tool_call_ratio REAL,
      latency_ratio REAL,
      session_id TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_eval_baselines_task_id ON eval_baselines(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_eval_baselines_capability ON eval_baselines(capability)',
    'CREATE INDEX IF NOT EXISTS idx_agent_trajectories_baseline_id ON agent_trajectories(baseline_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_trajectories_agent_name ON agent_trajectories(agent_name)',
  ];

  db.transaction(() => {
    for (const sql of statements) {
      db.run(sql);
    }
  })();

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

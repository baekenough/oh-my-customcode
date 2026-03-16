import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function runMigrations(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Create tables using bun:sqlite (SQL DDL, not shell)
  const statements = [
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
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
    'CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_invocations_ppid ON agent_invocations(session_ppid)',
    'CREATE INDEX IF NOT EXISTS idx_invocations_agent_type ON agent_invocations(agent_type)',
  ];

  for (const sql of statements) {
    db.run(sql);
  }

  db.close();
}

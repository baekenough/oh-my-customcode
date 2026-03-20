/**
 * Tests for eval-core schema, query functions, and migration.
 * Uses in-memory SQLite for isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { EvalDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  getAgentStats,
  getDashboardStats,
  getProjectStats,
  getRecentSessions,
} from '../query/dashboard.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInMemoryDb(): EvalDb {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

function seedProjects(db: EvalDb) {
  const now = new Date().toISOString();
  db.insert(schema.projects)
    .values([
      { name: 'project-a', cwd: '/home/user/project-a', lastSeenAt: now },
      { name: 'project-b', cwd: '/home/user/project-b', lastSeenAt: now },
    ])
    .run();
}

function seedSession(
  db: EvalDb,
  sessionId: string,
  projectId: number | null,
  cwd: string | null = null,
  startedAt = '2026-01-01T10:00:00.000Z',
  endedAt: string | null = '2026-01-01T10:30:00.000Z'
) {
  db.insert(schema.sessions)
    .values({
      sessionId,
      projectId,
      startedAt,
      endedAt,
      cwd,
      durationMs: endedAt
        ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
        : null,
      tokenSource: 'estimated',
    })
    .run();
}

function seedTurn(db: EvalDb, sessionId: string, turnId: string, timestamp: string) {
  db.insert(schema.turns)
    .values({
      sessionId,
      threadId: 'thread-1',
      turnId,
      timestamp,
    })
    .run();
}

function seedInvocation(
  db: EvalDb,
  sessionId: string,
  ppid: string,
  agentType: string,
  outcome: 'success' | 'failure'
) {
  db.insert(schema.agentInvocations)
    .values({
      sessionPpid: ppid,
      sessionId,
      agentType,
      model: 'claude-sonnet-4-6',
      outcome,
      timestamp: new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// Schema DDL — apply CREATE TABLE to in-memory DB
// ---------------------------------------------------------------------------

function applyDdl(db: EvalDb, sqlite: Database) {
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
  ];
  for (const sql of statements) {
    sqlite.run(sql);
  }
}

// Create an in-memory DB with DDL applied. Returns both the drizzle wrapper
// and the raw sqlite handle so tests can verify via raw SQL if needed.
function makeDb(): { db: EvalDb; sqlite: Database } {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  applyDdl(db, sqlite);
  return { db, sqlite };
}

// ---------------------------------------------------------------------------
// Migration tests
// ---------------------------------------------------------------------------

describe('runMigrations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eval-core-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates all expected tables', () => {
    const dbPath = join(tmpDir, 'test.db');
    runMigrations(dbPath);
    const db = new Database(dbPath);
    const tables = db
      .prepare<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all();
    const names = tables.map((t) => t.name);
    expect(names).toContain('projects');
    expect(names).toContain('sessions');
    expect(names).toContain('turns');
    expect(names).toContain('agent_invocations');
    expect(names).toContain('evaluations');
    expect(names).toContain('session_feedback');
    db.close();
  });

  it('is idempotent — running twice does not throw', () => {
    const dbPath = join(tmpDir, 'idempotent.db');
    expect(() => {
      runMigrations(dbPath);
      runMigrations(dbPath);
    }).not.toThrow();
  });

  it('creates indexes for performance-critical columns', () => {
    const dbPath = join(tmpDir, 'indexes.db');
    runMigrations(dbPath);
    const db = new Database(dbPath);
    const indexes = db
      .prepare<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
      )
      .all();
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_projects_cwd');
    expect(indexNames).toContain('idx_sessions_session_id');
    expect(indexNames).toContain('idx_sessions_project_id');
    expect(indexNames).toContain('idx_turns_session_id');
    expect(indexNames).toContain('idx_invocations_ppid');
    expect(indexNames).toContain('idx_feedback_session_id');
    db.close();
  });

  it('enables WAL journal mode', () => {
    const dbPath = join(tmpDir, 'wal.db');
    runMigrations(dbPath);
    const db = new Database(dbPath);
    const row = db.prepare<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
    expect(row?.journal_mode).toBe('wal');
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Schema: FK constraints
// ---------------------------------------------------------------------------

describe('schema FK constraints', () => {
  it('rejects session referencing non-existent project', () => {
    const { sqlite } = makeDb();
    expect(() => {
      sqlite.run(
        `INSERT INTO sessions (session_id, project_id, started_at) VALUES ('s1', 999, '2026-01-01T00:00:00Z')`
      );
    }).toThrow();
  });

  it('allows session with NULL project_id (project association is optional)', () => {
    const { sqlite } = makeDb();
    expect(() => {
      sqlite.run(
        `INSERT INTO sessions (session_id, project_id, started_at) VALUES ('s1', NULL, '2026-01-01T00:00:00Z')`
      );
    }).not.toThrow();
  });

  it('rejects turn referencing non-existent session', () => {
    const { sqlite } = makeDb();
    expect(() => {
      sqlite.run(
        `INSERT INTO turns (session_id, thread_id, turn_id, timestamp)
         VALUES ('nonexistent', 'th1', 'tr1', '2026-01-01T00:00:00Z')`
      );
    }).toThrow();
  });

  it('rejects session_feedback referencing non-existent session', () => {
    const { sqlite } = makeDb();
    expect(() => {
      sqlite.run(
        `INSERT INTO session_feedback (session_id, rating) VALUES ('ghost-session', 5)`
      );
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Schema: uniqueness constraints
// ---------------------------------------------------------------------------

describe('schema uniqueness constraints', () => {
  it('rejects duplicate project cwd', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    db.insert(schema.projects)
      .values({ name: 'p', cwd: '/home/dup', lastSeenAt: now })
      .run();
    expect(() => {
      db.insert(schema.projects)
        .values({ name: 'p2', cwd: '/home/dup', lastSeenAt: now })
        .run();
    }).toThrow();
  });

  it('allows two projects with different cwd but same name', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    db.insert(schema.projects)
      .values([
        { name: 'same-name', cwd: '/path/one', lastSeenAt: now },
        { name: 'same-name', cwd: '/path/two', lastSeenAt: now },
      ])
      .run();
    const rows = db.select().from(schema.projects).all();
    expect(rows).toHaveLength(2);
  });

  it('rejects duplicate session_id', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-dup', null);
    expect(() => {
      seedSession(db, 'sess-dup', null);
    }).toThrow();
  });

  it('rejects duplicate turn_id', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-1', null, null, '2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z');
    seedTurn(db, 'sess-1', 'turn-dup', '2026-01-01T10:05:00.000Z');
    expect(() => {
      seedTurn(db, 'sess-1', 'turn-dup', '2026-01-01T10:06:00.000Z');
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

describe('project CRUD', () => {
  it('inserts and retrieves a project', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    db.insert(schema.projects)
      .values({ name: 'my-project', cwd: '/workspace/my-project', lastSeenAt: now })
      .run();
    const row = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/workspace/my-project'))
      .get();
    expect(row).toBeDefined();
    expect(row?.name).toBe('my-project');
    expect(row?.cwd).toBe('/workspace/my-project');
  });

  it('updates lastSeenAt on project upsert pattern', () => {
    const { db } = makeDb();
    const first = '2026-01-01T00:00:00.000Z';
    const second = '2026-01-02T00:00:00.000Z';
    db.insert(schema.projects)
      .values({ name: 'p', cwd: '/cwd', lastSeenAt: first })
      .run();
    db.update(schema.projects)
      .set({ lastSeenAt: second })
      .where(eq(schema.projects.cwd, '/cwd'))
      .run();
    const row = db.select().from(schema.projects).where(eq(schema.projects.cwd, '/cwd')).get();
    expect(row?.lastSeenAt).toBe(second);
  });

  it('autoIncrement generates distinct IDs', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    db.insert(schema.projects)
      .values([
        { name: 'a', cwd: '/a', lastSeenAt: now },
        { name: 'b', cwd: '/b', lastSeenAt: now },
        { name: 'c', cwd: '/c', lastSeenAt: now },
      ])
      .run();
    const rows = db.select().from(schema.projects).all();
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Session-project association
// ---------------------------------------------------------------------------

describe('session-project association', () => {
  it('links session to correct project via projectId', () => {
    const { db } = makeDb();
    seedProjects(db);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get();
    expect(project).toBeDefined();
    seedSession(db, 'sess-linked', project!.id);
    const sess = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionId, 'sess-linked'))
      .get();
    expect(sess?.projectId).toBe(project!.id);
  });

  it('allows sessions without project (projectId = null)', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-orphan', null);
    const sess = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionId, 'sess-orphan'))
      .get();
    expect(sess?.projectId).toBeNull();
  });

  it('multiple sessions can belong to the same project', () => {
    const { db } = makeDb();
    seedProjects(db);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get();
    seedSession(db, 'sess-a1', project!.id, null, '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z');
    seedSession(db, 'sess-a2', project!.id, null, '2026-01-02T10:00:00Z', '2026-01-02T10:30:00Z');
    const rows = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.projectId, project!.id))
      .all();
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// session_feedback schema (schema-only — no query helpers yet)
// ---------------------------------------------------------------------------

describe('session_feedback schema', () => {
  it('inserts feedback linked to a valid session', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-fb', null);
    db.insert(schema.sessionFeedback)
      .values({
        sessionId: 'sess-fb',
        rating: 5,
        tags: JSON.stringify(['helpful', 'concise']),
        comment: 'Great session',
      })
      .run();
    const rows = db
      .select()
      .from(schema.sessionFeedback)
      .where(eq(schema.sessionFeedback.sessionId, 'sess-fb'))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(5);
    expect(rows[0]?.comment).toBe('Great session');
  });

  it('allows multiple feedback entries per session', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-multi-fb', null);
    db.insert(schema.sessionFeedback)
      .values([
        { sessionId: 'sess-multi-fb', rating: 4 },
        { sessionId: 'sess-multi-fb', rating: 3, comment: 'Could be better' },
      ])
      .run();
    const rows = db
      .select()
      .from(schema.sessionFeedback)
      .where(eq(schema.sessionFeedback.sessionId, 'sess-multi-fb'))
      .all();
    expect(rows).toHaveLength(2);
  });

  it('allows null rating and comment (optional fields)', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-min-fb', null);
    db.insert(schema.sessionFeedback)
      .values({ sessionId: 'sess-min-fb' })
      .run();
    const row = db
      .select()
      .from(schema.sessionFeedback)
      .where(eq(schema.sessionFeedback.sessionId, 'sess-min-fb'))
      .get();
    expect(row?.rating).toBeNull();
    expect(row?.comment).toBeNull();
  });

  it('rejects feedback with rating out of declared range via app-level validation concern', () => {
    // SQLite does not enforce CHECK constraints unless added to DDL.
    // The current schema does NOT include a CHECK constraint on rating.
    // This test documents the absence and serves as a reminder for future enforcement.
    const { db } = makeDb();
    seedSession(db, 'sess-bad-rating', null);
    // Rating = 99 is stored without error — schema has no CHECK constraint yet
    db.insert(schema.sessionFeedback)
      .values({ sessionId: 'sess-bad-rating', rating: 99 })
      .run();
    const row = db
      .select()
      .from(schema.sessionFeedback)
      .where(eq(schema.sessionFeedback.sessionId, 'sess-bad-rating'))
      .get();
    // Documents current behavior: app must validate 1-5 range
    expect(row?.rating).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Query: getProjectStats
// ---------------------------------------------------------------------------

describe('getProjectStats', () => {
  it('returns empty array when no projects exist', () => {
    const { db } = makeDb();
    const stats = getProjectStats(db);
    expect(stats).toEqual([]);
  });

  it('returns correct sessionCount, totalTurns, totalInvocations', () => {
    const { db } = makeDb();
    seedProjects(db);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get()!;

    seedSession(db, 'sess-pa-1', project.id, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedSession(db, 'sess-pa-2', project.id, null, '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z');
    seedTurn(db, 'sess-pa-1', 'turn-pa-1', '2026-01-01T10:05:00Z');
    seedTurn(db, 'sess-pa-1', 'turn-pa-2', '2026-01-01T10:10:00Z');
    seedInvocation(db, 'sess-pa-1', 'ppid-1', 'lang-typescript-expert', 'success');

    const stats = getProjectStats(db);
    const pa = stats.find((s) => s.cwd === '/home/user/project-a');
    expect(pa).toBeDefined();
    expect(pa?.sessionCount).toBe(2);
    expect(pa?.totalTurns).toBe(2);
    expect(pa?.totalInvocations).toBe(1);
  });

  it('orders projects by lastSeenAt descending', () => {
    const { db } = makeDb();
    db.insert(schema.projects)
      .values([
        { name: 'older', cwd: '/older', lastSeenAt: '2026-01-01T00:00:00Z' },
        { name: 'newer', cwd: '/newer', lastSeenAt: '2026-01-02T00:00:00Z' },
      ])
      .run();
    const stats = getProjectStats(db);
    expect(stats[0]?.name).toBe('newer');
    expect(stats[1]?.name).toBe('older');
  });

  it('returns zero counts for project with no sessions', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    db.insert(schema.projects)
      .values({ name: 'empty-project', cwd: '/empty', lastSeenAt: now })
      .run();
    const stats = getProjectStats(db);
    expect(stats[0]?.sessionCount).toBe(0);
    expect(stats[0]?.totalTurns).toBe(0);
    expect(stats[0]?.totalInvocations).toBe(0);
  });

  it('does not count sessions/turns from other projects', () => {
    const { db } = makeDb();
    seedProjects(db);
    const pa = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get()!;
    const pb = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-b'))
      .get()!;

    seedSession(db, 'sess-a', pa.id, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedSession(db, 'sess-b', pb.id, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedTurn(db, 'sess-a', 'turn-a', '2026-01-01T10:05:00Z');
    seedTurn(db, 'sess-b', 'turn-b', '2026-01-01T10:05:00Z');

    const stats = getProjectStats(db);
    const statsA = stats.find((s) => s.cwd === '/home/user/project-a');
    const statsB = stats.find((s) => s.cwd === '/home/user/project-b');
    expect(statsA?.totalTurns).toBe(1);
    expect(statsB?.totalTurns).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Query: getRecentSessions
// ---------------------------------------------------------------------------

describe('getRecentSessions', () => {
  it('returns empty array when no sessions exist', () => {
    const { db } = makeDb();
    const result = getRecentSessions(db);
    expect(result).toEqual([]);
  });

  it('respects limit parameter', () => {
    const { db } = makeDb();
    for (let i = 0; i < 25; i++) {
      seedSession(
        db,
        `sess-${i.toString().padStart(2, '0')}`,
        null,
        null,
        `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        `2026-01-${String(i + 1).padStart(2, '0')}T11:00:00Z`
      );
    }
    const result = getRecentSessions(db, 5);
    expect(result).toHaveLength(5);
  });

  it('returns sessions ordered by startedAt descending', () => {
    const { db } = makeDb();
    seedSession(db, 'older-sess', null, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedSession(db, 'newer-sess', null, null, '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z');
    const result = getRecentSessions(db, 10);
    expect(result[0]?.sessionId).toBe('newer-sess');
    expect(result[1]?.sessionId).toBe('older-sess');
  });

  it('includes projectName when session has a project', () => {
    const { db } = makeDb();
    seedProjects(db);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get()!;
    seedSession(db, 'sess-with-proj', project.id);
    const result = getRecentSessions(db, 10);
    expect(result[0]?.projectName).toBe('project-a');
    expect(result[0]?.projectId).toBe(project.id);
  });

  it('returns null projectName for sessions without a project', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-no-proj', null);
    const result = getRecentSessions(db, 10);
    expect(result[0]?.projectName).toBeNull();
    expect(result[0]?.projectId).toBeNull();
  });

  it('includes correct turnCount and invocationCount', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-counts', null, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedTurn(db, 'sess-counts', 'turn-c1', '2026-01-01T10:05:00Z');
    seedTurn(db, 'sess-counts', 'turn-c2', '2026-01-01T10:10:00Z');
    seedInvocation(db, 'sess-counts', 'ppid-x', 'lang-python-expert', 'success');
    seedInvocation(db, 'sess-counts', 'ppid-x', 'lang-golang-expert', 'failure');
    const result = getRecentSessions(db, 10);
    const s = result.find((r) => r.sessionId === 'sess-counts');
    expect(s?.turnCount).toBe(2);
    expect(s?.invocationCount).toBe(2);
  });

  it('uses default limit of 20', () => {
    const { db } = makeDb();
    for (let i = 0; i < 22; i++) {
      seedSession(
        db,
        `sess-def-${i}`,
        null,
        null,
        `2026-01-01T${String(i).padStart(2, '0')}:00:00Z`,
        `2026-01-01T${String(i).padStart(2, '0')}:30:00Z`
      );
    }
    const result = getRecentSessions(db);
    expect(result).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// Query: getAgentStats
// ---------------------------------------------------------------------------

describe('getAgentStats', () => {
  it('returns empty array when no invocations exist', () => {
    const { db } = makeDb();
    const stats = getAgentStats(db);
    expect(stats).toEqual([]);
  });

  it('computes successRate correctly', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-ag', null);
    seedInvocation(db, 'sess-ag', 'ppid-1', 'lang-typescript-expert', 'success');
    seedInvocation(db, 'sess-ag', 'ppid-1', 'lang-typescript-expert', 'success');
    seedInvocation(db, 'sess-ag', 'ppid-1', 'lang-typescript-expert', 'failure');
    const stats = getAgentStats(db);
    const ts = stats.find((s) => s.agentType === 'lang-typescript-expert');
    expect(ts?.totalInvocations).toBe(3);
    expect(ts?.successCount).toBe(2);
    expect(ts?.failureCount).toBe(1);
    expect(ts?.successRate).toBeCloseTo(2 / 3);
  });

  it('returns successRate = 0 when all invocations are failures', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-fail', null);
    seedInvocation(db, 'sess-fail', 'ppid-2', 'mgr-gitnerd', 'failure');
    seedInvocation(db, 'sess-fail', 'ppid-2', 'mgr-gitnerd', 'failure');
    const stats = getAgentStats(db);
    const s = stats.find((a) => a.agentType === 'mgr-gitnerd');
    expect(s?.successRate).toBe(0);
    expect(s?.failureCount).toBe(2);
  });

  it('returns successRate = 1 when all invocations succeed', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-win', null);
    seedInvocation(db, 'sess-win', 'ppid-3', 'qa-engineer', 'success');
    seedInvocation(db, 'sess-win', 'ppid-3', 'qa-engineer', 'success');
    const stats = getAgentStats(db);
    const s = stats.find((a) => a.agentType === 'qa-engineer');
    expect(s?.successRate).toBe(1);
  });

  it('orders agents by total invocations descending', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-order', null);
    seedInvocation(db, 'sess-order', 'ppid-4', 'less-used', 'success');
    seedInvocation(db, 'sess-order', 'ppid-4', 'more-used', 'success');
    seedInvocation(db, 'sess-order', 'ppid-4', 'more-used', 'success');
    const stats = getAgentStats(db);
    expect(stats[0]?.agentType).toBe('more-used');
    expect(stats[1]?.agentType).toBe('less-used');
  });

  it('does not count agents across different sessions incorrectly', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-x1', null);
    seedSession(db, 'sess-x2', null);
    seedInvocation(db, 'sess-x1', 'ppid-a', 'agent-x', 'success');
    seedInvocation(db, 'sess-x2', 'ppid-b', 'agent-x', 'failure');
    const stats = getAgentStats(db);
    const s = stats.find((a) => a.agentType === 'agent-x');
    expect(s?.totalInvocations).toBe(2);
    expect(s?.successCount).toBe(1);
    expect(s?.failureCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Query: getDashboardStats
// ---------------------------------------------------------------------------

describe('getDashboardStats', () => {
  it('returns zero counts on empty database', () => {
    const { db } = makeDb();
    const stats = getDashboardStats(db);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalTurns).toBe(0);
    expect(stats.totalInvocations).toBe(0);
    expect(stats.totalProjects).toBe(0);
    expect(stats.recentSessions).toEqual([]);
    expect(stats.topAgents).toEqual([]);
  });

  it('aggregates counts correctly', () => {
    const { db } = makeDb();
    seedProjects(db);
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/home/user/project-a'))
      .get()!;
    seedSession(db, 'sess-d1', project.id, null, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    seedSession(db, 'sess-d2', project.id, null, '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z');
    seedTurn(db, 'sess-d1', 'turn-d1', '2026-01-01T10:05:00Z');
    seedInvocation(db, 'sess-d1', 'ppid-d', 'lang-golang-expert', 'success');

    const stats = getDashboardStats(db);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalTurns).toBe(1);
    expect(stats.totalInvocations).toBe(1);
    expect(stats.totalProjects).toBe(2); // project-a + project-b from seedProjects
  });

  it('recentSessions is capped at 10', () => {
    const { db } = makeDb();
    for (let i = 0; i < 15; i++) {
      seedSession(
        db,
        `sess-dash-${i}`,
        null,
        null,
        `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        `2026-01-${String(i + 1).padStart(2, '0')}T11:00:00Z`
      );
    }
    const stats = getDashboardStats(db);
    expect(stats.recentSessions.length).toBeLessThanOrEqual(10);
  });

  it('topAgents is capped at 10', () => {
    const { db } = makeDb();
    seedSession(db, 'sess-top', null);
    for (let i = 0; i < 15; i++) {
      seedInvocation(db, 'sess-top', 'ppid-top', `agent-type-${i}`, 'success');
    }
    const stats = getDashboardStats(db);
    expect(stats.topAgents.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: collect upsertProject behavior
// ---------------------------------------------------------------------------

describe('upsertProject (via collect logic)', () => {
  it('reuses existing project for same cwd', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    // First insert
    db.insert(schema.projects)
      .values({ name: 'my-proj', cwd: '/workspace/my-proj', lastSeenAt: now })
      .run();
    // Simulate upsert: update if exists (same as collect/index.ts upsertProject logic)
    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/workspace/my-proj'))
      .get();
    expect(existing).toBeDefined();
    const laterTime = new Date(Date.now() + 5000).toISOString();
    db.update(schema.projects)
      .set({ lastSeenAt: laterTime })
      .where(eq(schema.projects.cwd, '/workspace/my-proj'))
      .run();
    const rows = db.select().from(schema.projects).all();
    // Only one project entry — not duplicated
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSeenAt).toBe(laterTime);
  });

  it('creates new project for previously unseen cwd', () => {
    const { db } = makeDb();
    const now = new Date().toISOString();
    const noExisting = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/new/path'))
      .get();
    expect(noExisting).toBeUndefined();
    db.insert(schema.projects)
      .values({ name: 'new', cwd: '/new/path', lastSeenAt: now })
      .run();
    const row = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.cwd, '/new/path'))
      .get();
    expect(row?.name).toBe('new');
  });
});

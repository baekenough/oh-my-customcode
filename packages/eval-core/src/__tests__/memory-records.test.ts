/**
 * Tests for memory_records table (v0.118.3, #1047).
 * Uses in-memory SQLite for isolation.
 */

import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { EvalDb } from '../db/client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): { db: EvalDb; sqlite: Database } {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS memory_records (
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
    )
  `);
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_memory_records_source ON memory_records(source)');
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_memory_records_device_project ON memory_records(device_id, project)');
  sqlite.run("CREATE INDEX IF NOT EXISTS idx_memory_records_timestamp ON memory_records(timestamp DESC)");
  return { db, sqlite };
}

function makeRecord(overrides: Partial<typeof schema.memoryRecords.$inferInsert> = {}) {
  return {
    id: crypto.randomUUID(),
    source: 'native' as const,
    deviceId: 'macbook-sangyi',
    project: '/Users/sangyi/workspace/projects/oh-my-customcode',
    agent: 'sys-memory-keeper',
    timestamp: new Date().toISOString(),
    summary: 'Agent discovered bun lockfile must be committed',
    content: 'Full memory body: bun.lockb must be committed after bun add',
    tags: JSON.stringify(['feedback', 'bun']),
    sensitivity: 'project' as const,
    hash: `sha256-${crypto.randomUUID().replace(/-/g, '')}`,
    embeddingRef: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Insert valid record
// ---------------------------------------------------------------------------

describe('memory_records: insert valid record', () => {
  it('inserts and retrieves a full record via drizzle', () => {
    const { db } = makeDb();
    const record = makeRecord();
    db.insert(schema.memoryRecords).values(record).run();

    const row = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.id, record.id))
      .get();

    expect(row).toBeDefined();
    expect(row?.id).toBe(record.id);
    expect(row?.source).toBe('native');
    expect(row?.deviceId).toBe('macbook-sangyi');
    expect(row?.project).toBe('/Users/sangyi/workspace/projects/oh-my-customcode');
    expect(row?.agent).toBe('sys-memory-keeper');
    expect(row?.summary).toBe('Agent discovered bun lockfile must be committed');
    expect(row?.content).toBe('Full memory body: bun.lockb must be committed after bun add');
    expect(row?.tags).toBe(JSON.stringify(['feedback', 'bun']));
    expect(row?.sensitivity).toBe('project');
    expect(row?.hash).toBe(record.hash);
    expect(row?.embeddingRef).toBeNull();
  });

  it('allows null agent (session-wide memory)', () => {
    const { db } = makeDb();
    const record = makeRecord({ agent: undefined });
    db.insert(schema.memoryRecords).values(record).run();

    const row = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.id, record.id))
      .get();

    expect(row?.agent).toBeNull();
  });

  it('allows null embeddingRef', () => {
    const { db } = makeDb();
    const record = makeRecord({ embeddingRef: null });
    db.insert(schema.memoryRecords).values(record).run();

    const row = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.id, record.id))
      .get();

    expect(row?.embeddingRef).toBeNull();
  });

  it('stores embeddingRef when provided', () => {
    const { db } = makeDb();
    const record = makeRecord({ embeddingRef: 'chroma://collection/doc-id-abc123' });
    db.insert(schema.memoryRecords).values(record).run();

    const row = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.id, record.id))
      .get();

    expect(row?.embeddingRef).toBe('chroma://collection/doc-id-abc123');
  });

  it('uses $defaultFn for createdAt and updatedAt when omitted', () => {
    const { db } = makeDb();
    const record = makeRecord();
    const before = new Date().toISOString();
    db.insert(schema.memoryRecords).values(record).run();

    const row = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.id, record.id))
      .get();

    expect(typeof row?.createdAt).toBe('string');
    expect(typeof row?.updatedAt).toBe('string');
    expect(row!.createdAt >= before.slice(0, 10)).toBe(true); // date part >=
  });

  it('accepts all valid source values', () => {
    const { db } = makeDb();
    const sources = ['native', 'claude-mem', 'episodic-memory', 'llm-memory'] as const;
    for (const source of sources) {
      const record = makeRecord({ source });
      db.insert(schema.memoryRecords).values(record).run();
    }
    const rows = db.select().from(schema.memoryRecords).all();
    expect(rows).toHaveLength(4);
    const storedSources = rows.map((r) => r.source).sort();
    expect(storedSources).toEqual(['claude-mem', 'episodic-memory', 'llm-memory', 'native']);
  });

  it('accepts all valid sensitivity values', () => {
    const { db } = makeDb();
    const sensitivities = ['public', 'project', 'sensitive', 'secret'] as const;
    for (const sensitivity of sensitivities) {
      const record = makeRecord({ sensitivity });
      db.insert(schema.memoryRecords).values(record).run();
    }
    const rows = db.select().from(schema.memoryRecords).all();
    expect(rows).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Reject duplicate hash (UNIQUE constraint)
// ---------------------------------------------------------------------------

describe('memory_records: UNIQUE hash constraint', () => {
  it('rejects duplicate hash via drizzle', () => {
    const { db } = makeDb();
    const sharedHash = 'sha256-deadbeef000000000000000000000000';
    const record1 = makeRecord({ hash: sharedHash });
    const record2 = makeRecord({ hash: sharedHash }); // different id, same hash

    db.insert(schema.memoryRecords).values(record1).run();

    expect(() => {
      db.insert(schema.memoryRecords).values(record2).run();
    }).toThrow();
  });

  it('rejects duplicate hash via raw SQL', () => {
    const { sqlite } = makeDb();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const duplicateHash = 'sha256-aaaa1111bbbb2222cccc3333dddd4444';
    const ts = new Date().toISOString();

    sqlite.run(
      `INSERT INTO memory_records (id, source, device_id, project, timestamp, summary, content, tags, sensitivity, hash)
       VALUES ('${id1}', 'native', 'host1', '/proj', '${ts}', 'summary', 'content', '[]', 'public', '${duplicateHash}')`
    );

    expect(() => {
      sqlite.run(
        `INSERT INTO memory_records (id, source, device_id, project, timestamp, summary, content, tags, sensitivity, hash)
         VALUES ('${id2}', 'native', 'host2', '/proj', '${ts}', 'summary2', 'content2', '[]', 'public', '${duplicateHash}')`
      );
    }).toThrow();
  });

  it('allows two records with different hashes', () => {
    const { db } = makeDb();
    const record1 = makeRecord({ hash: 'sha256-hash1111111111111111111111111111' });
    const record2 = makeRecord({ hash: 'sha256-hash2222222222222222222222222222' });

    db.insert(schema.memoryRecords).values(record1).run();
    db.insert(schema.memoryRecords).values(record2).run();

    const rows = db.select().from(schema.memoryRecords).all();
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Query by source filter
// ---------------------------------------------------------------------------

describe('memory_records: query by source', () => {
  it('returns only records matching a single source', () => {
    const { db } = makeDb();
    db.insert(schema.memoryRecords)
      .values([
        makeRecord({ source: 'native' }),
        makeRecord({ source: 'native' }),
        makeRecord({ source: 'claude-mem' }),
        makeRecord({ source: 'episodic-memory' }),
      ])
      .run();

    const nativeRows = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.source, 'native'))
      .all();

    expect(nativeRows).toHaveLength(2);
    expect(nativeRows.every((r) => r.source === 'native')).toBe(true);
  });

  it('returns empty array when no records match source', () => {
    const { db } = makeDb();
    db.insert(schema.memoryRecords)
      .values([makeRecord({ source: 'native' })])
      .run();

    const rows = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.source, 'llm-memory'))
      .all();

    expect(rows).toHaveLength(0);
  });

  it('filters episodic-memory records from mixed dataset', () => {
    const { db } = makeDb();
    db.insert(schema.memoryRecords)
      .values([
        makeRecord({ source: 'native' }),
        makeRecord({ source: 'episodic-memory' }),
        makeRecord({ source: 'episodic-memory' }),
        makeRecord({ source: 'claude-mem' }),
      ])
      .run();

    const rows = db
      .select()
      .from(schema.memoryRecords)
      .where(eq(schema.memoryRecords.source, 'episodic-memory'))
      .all();

    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Query by device_id + project composite
// ---------------------------------------------------------------------------

describe('memory_records: query by device_id + project composite', () => {
  it('returns only records matching both device_id and project', () => {
    const { db } = makeDb();
    const targetDevice = 'macbook-sangyi';
    const targetProject = '/Users/sangyi/workspace/projects/oh-my-customcode';

    db.insert(schema.memoryRecords)
      .values([
        makeRecord({ deviceId: targetDevice, project: targetProject }),
        makeRecord({ deviceId: targetDevice, project: targetProject }),
        makeRecord({ deviceId: targetDevice, project: '/other/project' }),
        makeRecord({ deviceId: 'other-device', project: targetProject }),
        makeRecord({ deviceId: 'other-device', project: '/other/project' }),
      ])
      .run();

    const rows = db
      .select()
      .from(schema.memoryRecords)
      .where(
        and(
          eq(schema.memoryRecords.deviceId, targetDevice),
          eq(schema.memoryRecords.project, targetProject)
        )
      )
      .all();

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.deviceId === targetDevice && r.project === targetProject)).toBe(true);
  });

  it('returns empty when device_id matches but project does not', () => {
    const { db } = makeDb();
    db.insert(schema.memoryRecords)
      .values([makeRecord({ deviceId: 'device-a', project: '/proj-a' })])
      .run();

    const rows = db
      .select()
      .from(schema.memoryRecords)
      .where(
        and(
          eq(schema.memoryRecords.deviceId, 'device-a'),
          eq(schema.memoryRecords.project, '/proj-b')
        )
      )
      .all();

    expect(rows).toHaveLength(0);
  });

  it('returns empty when project matches but device_id does not', () => {
    const { db } = makeDb();
    db.insert(schema.memoryRecords)
      .values([makeRecord({ deviceId: 'device-x', project: '/shared-proj' })])
      .run();

    const rows = db
      .select()
      .from(schema.memoryRecords)
      .where(
        and(
          eq(schema.memoryRecords.deviceId, 'device-y'),
          eq(schema.memoryRecords.project, '/shared-proj')
        )
      )
      .all();

    expect(rows).toHaveLength(0);
  });

  it('correctly isolates records across multiple device+project combinations', () => {
    const { db } = makeDb();
    const combinations = [
      { deviceId: 'dev-1', project: '/proj-a' },
      { deviceId: 'dev-1', project: '/proj-b' },
      { deviceId: 'dev-2', project: '/proj-a' },
      { deviceId: 'dev-2', project: '/proj-b' },
    ];

    for (const combo of combinations) {
      db.insert(schema.memoryRecords).values(makeRecord(combo)).run();
    }

    for (const combo of combinations) {
      const rows = db
        .select()
        .from(schema.memoryRecords)
        .where(
          and(
            eq(schema.memoryRecords.deviceId, combo.deviceId),
            eq(schema.memoryRecords.project, combo.project)
          )
        )
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deviceId).toBe(combo.deviceId);
      expect(rows[0]?.project).toBe(combo.project);
    }
  });
});

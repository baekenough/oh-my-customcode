/**
 * Tests for MemoryService (#1077 — persistence service).
 *
 * Uses in-memory SQLite + inline DDL to mirror the production migration,
 * keeping tests self-contained and fast.
 *
 * Covers:
 *  - sync() with two adapter arrays overlapping by hash → 1 dedup
 *  - sync() with secret-tier records → rejected, not inserted
 *  - sync() idempotent — second run with same records = all skipped
 *  - query() filters: source, sensitivity, timestamp range, limit
 *  - query() with no filters returns all records
 *  - getById hit and miss
 *  - getByHash hit and miss
 *  - SyncResult counts are accurate
 */

import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema.js';
import type { EvalDb } from '../db/client.js';
import { MemoryService } from '../memory-service.js';
import type { MemoryRecord } from '../memory-aggregator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): EvalDb {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  // Mirror the production DDL for memory_records (from migrate.ts)
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
  sqlite.run(
    'CREATE INDEX IF NOT EXISTS idx_memory_records_source ON memory_records(source)'
  );
  sqlite.run(
    'CREATE INDEX IF NOT EXISTS idx_memory_records_device_project ON memory_records(device_id, project)'
  );
  sqlite.run(
    "CREATE INDEX IF NOT EXISTS idx_memory_records_timestamp ON memory_records(timestamp DESC)"
  );
  return db;
}

let _seq = 0;
function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const n = ++_seq;
  return {
    id: crypto.randomUUID(),
    source: 'native',
    device_id: 'test-host',
    project: '/test/project',
    agent: `agent-${n}`,
    timestamp: `2026-04-01T00:00:${String(n % 60).padStart(2, '0')}.000Z`,
    summary: `Summary ${n}`,
    content: `Content ${n}`,
    tags: [`tag-${n}`],
    sensitivity: 'project',
    hash: `sha256-${n.toString().padStart(64, '0')}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sync() — basic insert
// ---------------------------------------------------------------------------

describe('MemoryService.sync()', () => {
  it('inserts all unique records and returns correct counts', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const a1 = makeRecord({ source: 'native' });
    const a2 = makeRecord({ source: 'claude-mem' });

    const result = await service.sync([[a1], [a2]]);

    expect(result.inserted).toBe(2);
    expect(result.skippedDuplicates).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('deduplicates records sharing the same hash across two adapter arrays', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const sharedHash = `sha256-${'a'.repeat(64)}`;
    const r1 = makeRecord({ hash: sharedHash, source: 'native', timestamp: '2026-04-01T10:00:00.000Z' });
    const r2 = makeRecord({ hash: sharedHash, source: 'claude-mem', timestamp: '2026-04-01T11:00:00.000Z' });
    const r3 = makeRecord(); // unique

    // Aggregator collapses r1+r2 into one (newest wins), so 2 unique records reach DB
    const result = await service.sync([[r1, r3], [r2]]);

    expect(result.inserted).toBe(2);
    expect(result.skippedDuplicates).toBe(0); // duplicates resolved before DB hit
    expect(result.rejected).toBe(0);
  });

  it('does not insert secret-tier records and reports them as rejected', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const secretRecord = makeRecord({ sensitivity: 'secret' });
    const normalRecord = makeRecord();

    const result = await service.sync([[secretRecord, normalRecord]]);

    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.skippedDuplicates).toBe(0);
  });

  it('is idempotent — second sync with same records skips all as DB duplicates', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r1 = makeRecord();
    const r2 = makeRecord();

    const first = await service.sync([[r1, r2]]);
    expect(first.inserted).toBe(2);

    const second = await service.sync([[r1, r2]]);
    expect(second.inserted).toBe(0);
    expect(second.skippedDuplicates).toBe(2);
    expect(second.rejected).toBe(0);
  });

  it('handles empty adapter arrays without error', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const result = await service.sync([[], []]);

    expect(result.inserted).toBe(0);
    expect(result.skippedDuplicates).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles all records being secret-tier', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const s1 = makeRecord({ sensitivity: 'secret' });
    const s2 = makeRecord({ sensitivity: 'secret' });

    const result = await service.sync([[s1, s2]]);

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// query() filters
// ---------------------------------------------------------------------------

describe('MemoryService.query()', () => {
  it('returns all records when called with no filter', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const records = [makeRecord(), makeRecord(), makeRecord()];
    await service.sync([records]);

    const results = await service.query();
    expect(results).toHaveLength(3);
  });

  it('filters by source', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const native = makeRecord({ source: 'native' });
    const claudeMem = makeRecord({ source: 'claude-mem' });
    await service.sync([[native, claudeMem]]);

    const results = await service.query({ source: 'native' });
    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe('native');
  });

  it('filters by sensitivity', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const project = makeRecord({ sensitivity: 'project' });
    const pub = makeRecord({ sensitivity: 'public' });
    await service.sync([[project, pub]]);

    const results = await service.query({ sensitivity: 'public' });
    expect(results).toHaveLength(1);
    expect(results[0]?.sensitivity).toBe('public');
  });

  it('filters by timestamp range (fromTimestamp + toTimestamp)', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const early = makeRecord({ timestamp: '2026-01-01T00:00:00.000Z' });
    const mid   = makeRecord({ timestamp: '2026-04-01T00:00:00.000Z' });
    const late  = makeRecord({ timestamp: '2026-12-31T00:00:00.000Z' });
    await service.sync([[early, mid, late]]);

    const results = await service.query({
      fromTimestamp: '2026-03-01T00:00:00.000Z',
      toTimestamp:   '2026-06-01T00:00:00.000Z',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.timestamp).toBe('2026-04-01T00:00:00.000Z');
  });

  it('respects the limit option', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const records = Array.from({ length: 10 }, () => makeRecord());
    await service.sync([records]);

    const results = await service.query({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('filters by agent', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r1 = makeRecord({ agent: 'sys-memory-keeper' });
    const r2 = makeRecord({ agent: 'lang-typescript-expert' });
    await service.sync([[r1, r2]]);

    const results = await service.query({ agent: 'sys-memory-keeper' });
    expect(results).toHaveLength(1);
    expect(results[0]?.agent).toBe('sys-memory-keeper');
  });

  it('filters by project', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r1 = makeRecord({ project: '/workspace/project-a' });
    const r2 = makeRecord({ project: '/workspace/project-b' });
    await service.sync([[r1, r2]]);

    const results = await service.query({ project: '/workspace/project-a' });
    expect(results).toHaveLength(1);
    expect(results[0]?.project).toBe('/workspace/project-a');
  });

  it('returns records with tags correctly deserialised', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r = makeRecord({ tags: ['feedback', 'bun', 'release'] });
    await service.sync([[r]]);

    const results = await service.query();
    // mergeTags in aggregator sorts the union alphabetically
    expect(results[0]?.tags).toEqual(['bun', 'feedback', 'release']);
  });
});

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

describe('MemoryService.getById()', () => {
  it('returns the record when the id exists', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r = makeRecord();
    await service.sync([[r]]);

    const found = await service.getById(r.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(r.id);
    expect(found?.content).toBe(r.content);
  });

  it('returns null when the id does not exist', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const result = await service.getById('non-existent-id');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getByHash
// ---------------------------------------------------------------------------

describe('MemoryService.getByHash()', () => {
  it('returns the record when the hash exists', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const r = makeRecord({ hash: `sha256-${'b'.repeat(64)}` });
    await service.sync([[r]]);

    const found = await service.getByHash(r.hash);
    expect(found).not.toBeNull();
    expect(found?.hash).toBe(r.hash);
  });

  it('returns null when the hash does not exist', async () => {
    const db = makeDb();
    const service = new MemoryService(db);

    const result = await service.getByHash('sha256-nonexistent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MemoryServiceOptions — conflictPolicy wiring
// ---------------------------------------------------------------------------

describe('MemoryService — conflictPolicy option', () => {
  it('accepts oldest policy and keeps the earliest record on hash collision', async () => {
    const db = makeDb();
    const service = new MemoryService(db, { conflictPolicy: 'oldest' });

    const sharedHash = `sha256-${'c'.repeat(64)}`;
    const older = makeRecord({
      hash: sharedHash,
      source: 'native',
      timestamp: '2026-01-01T00:00:00.000Z',
      content: 'older content',
    });
    const newer = makeRecord({
      hash: sharedHash,
      source: 'claude-mem',
      timestamp: '2026-04-01T00:00:00.000Z',
      content: 'newer content',
    });

    await service.sync([[older, newer]]);

    const found = await service.getByHash(sharedHash);
    expect(found?.content).toBe('older content');
  });
});

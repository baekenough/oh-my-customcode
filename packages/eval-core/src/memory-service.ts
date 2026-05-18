/**
 * Memory persistence service — ties adapters, aggregator, and drizzle table together.
 *
 * sync() accepts pre-fetched MemoryRecord arrays from any combination of adapters,
 * runs aggregation+dedup, then bulk-inserts with onConflictDoNothing on the hash
 * UNIQUE constraint.  query() provides filtered reads over memory_records.
 *
 * Spec: #1047 (Unified Memory System), sub-issue #1077 (persistence service).
 *
 * NOTE: This module performs I/O (DB). Adapter fetching is the caller's
 * responsibility — sync() accepts already-fetched arrays, not adapter instances.
 */

import { and, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { EvalDb } from './db/client.js';
import { memoryRecords } from './db/schema.js';
import { aggregateMemoryRecords, type MemoryRecord } from './memory-aggregator.js';
import type { SensitivityTier } from './adapters/sensitivity.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryServiceOptions {
  /** How to resolve hash collisions during aggregation. Default: 'newest'. */
  conflictPolicy?: 'newest' | 'oldest' | 'priority';
  /**
   * Source preference order for the 'priority' conflict policy.
   * Default: ['native', 'claude-mem', 'episodic-memory', 'llm-memory', 'agentmemory']
   *
   * 'agentmemory' is listed last — STUB until #1169 Phase 1.
   */
  sourcePriority?: ('native' | 'claude-mem' | 'episodic-memory' | 'llm-memory' | 'agentmemory')[];
}

export interface SyncResult {
  /** Number of records inserted into the DB. */
  inserted: number;
  /** Records skipped because the hash already existed (onConflictDoNothing). */
  skippedDuplicates: number;
  /** Records rejected at the aggregation stage (sensitivity === 'secret'). */
  rejected: number;
  /** Non-fatal per-record insert errors (only populated if individual insert mode is used). */
  errors: Array<{ record: MemoryRecord; error: Error }>;
}

export interface MemoryQueryFilter {
  /** 'agentmemory' is a STUB (#1178) — queries will return 0 rows until #1169 Phase 1. */
  source?: 'native' | 'claude-mem' | 'episodic-memory' | 'llm-memory' | 'agentmemory';
  sensitivity?: SensitivityTier;
  agent?: string;
  project?: string;
  deviceId?: string;
  /** ISO 8601 — lower bound (inclusive) on the timestamp field. */
  fromTimestamp?: string;
  /** ISO 8601 — upper bound (inclusive) on the timestamp field. */
  toTimestamp?: string;
  /** Maximum number of results to return. Default: 100. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a MemoryRecord (adapter-schema, snake_case) to a DB insert row
 * (drizzle schema, camelCase + JSON-serialised tags).
 */
function toDbRow(
  record: MemoryRecord
): typeof memoryRecords.$inferInsert {
  return {
    id: record.id,
    source: record.source,
    deviceId: record.device_id,
    project: record.project,
    agent: record.agent ?? null,
    timestamp: record.timestamp,
    summary: record.summary,
    content: record.content,
    tags: JSON.stringify(record.tags),
    sensitivity: record.sensitivity,
    hash: record.hash,
    embeddingRef: record.embedding_ref ?? null,
  };
}

/**
 * Maps a raw DB row (drizzle select output) back to a MemoryRecord.
 * JSON-parses tags; falls back to [] on malformed input.
 */
function fromDbRow(row: typeof memoryRecords.$inferSelect): MemoryRecord {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // leave tags as []
  }

  const record: MemoryRecord = {
    id: row.id,
    source: row.source as MemoryRecord['source'],
    device_id: row.deviceId,
    project: row.project,
    timestamp: row.timestamp,
    summary: row.summary,
    content: row.content,
    tags,
    sensitivity: row.sensitivity as SensitivityTier,
    hash: row.hash,
  };

  if (row.agent != null) {
    record.agent = row.agent;
  }
  if (row.embeddingRef != null) {
    record.embedding_ref = row.embeddingRef;
  }

  return record;
}

// ---------------------------------------------------------------------------
// MemoryService
// ---------------------------------------------------------------------------

export class MemoryService {
  private readonly db: EvalDb;
  private readonly opts: Required<MemoryServiceOptions>;

  constructor(db: EvalDb, opts: MemoryServiceOptions = {}) {
    this.db = db;
    this.opts = {
      conflictPolicy: opts.conflictPolicy ?? 'newest',
      sourcePriority: opts.sourcePriority ?? [
        'native',
        'claude-mem',
        'episodic-memory',
        'llm-memory',
        'agentmemory', // STUB: contributes 0 records until #1169 Phase 1
      ],
    };
  }

  /**
   * Aggregates adapter results, deduplicates by hash, and bulk-inserts into
   * the memory_records table.
   *
   * Secret-tier records are rejected at the aggregation stage and never
   * reach the DB.  Duplicate hashes are silently skipped
   * (onConflictDoNothing on the UNIQUE hash constraint).
   *
   * @param adapterResults - One array per adapter, as returned by each adapter.
   * @returns SyncResult with counts for inserted, skipped, rejected, and errors.
   */
  async sync(adapterResults: MemoryRecord[][]): Promise<SyncResult> {
    const { records, stats } = aggregateMemoryRecords({
      records: adapterResults,
      conflictPolicy: this.opts.conflictPolicy,
      sourcePriority: this.opts.sourcePriority,
    });

    const errors: SyncResult['errors'] = [];
    let inserted = 0;

    if (records.length > 0) {
      // Bulk insert with onConflictDoNothing — the UNIQUE constraint on `hash`
      // silently drops any row whose hash already exists.
      const rows = records.map(toDbRow);
      // drizzle-orm/bun-sqlite: onConflictDoNothing() requires a target column
      // when the conflict arises from a named UNIQUE constraint.
      const result = this.db
        .insert(memoryRecords)
        .values(rows)
        .onConflictDoNothing({ target: memoryRecords.hash })
        .run();

      // SQLite `changes` reflects rows actually inserted (duplicates excluded).
      inserted = result.changes;
    }

    const skippedDuplicates = records.length - inserted;

    return {
      inserted,
      skippedDuplicates,
      rejected: stats.rejected,
      errors,
    };
  }

  /**
   * Queries memory_records with optional filters.
   *
   * All filter fields are AND-combined.  When a field is undefined it is
   * omitted from the WHERE clause (no restriction).
   *
   * @param filter - Optional filter options.
   * @returns Array of MemoryRecord matching the filter, ordered by timestamp DESC.
   */
  async query(filter: MemoryQueryFilter = {}): Promise<MemoryRecord[]> {
    const { source, sensitivity, agent, project, deviceId, fromTimestamp, toTimestamp } = filter;
    const limit = filter.limit ?? 100;

    const conditions: SQL[] = [];

    if (source !== undefined) {
      conditions.push(eq(memoryRecords.source, source));
    }
    if (sensitivity !== undefined) {
      conditions.push(eq(memoryRecords.sensitivity, sensitivity));
    }
    if (agent !== undefined) {
      conditions.push(eq(memoryRecords.agent, agent));
    }
    if (project !== undefined) {
      conditions.push(eq(memoryRecords.project, project));
    }
    if (deviceId !== undefined) {
      conditions.push(eq(memoryRecords.deviceId, deviceId));
    }
    if (fromTimestamp !== undefined) {
      conditions.push(gte(memoryRecords.timestamp, fromTimestamp));
    }
    if (toTimestamp !== undefined) {
      conditions.push(lte(memoryRecords.timestamp, toTimestamp));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = this.db
      .select()
      .from(memoryRecords)
      .where(where)
      .orderBy(memoryRecords.timestamp)
      .limit(limit)
      .all();

    return rows.map(fromDbRow);
  }

  /**
   * Returns the memory record with the given primary key, or null if not found.
   */
  async getById(id: string): Promise<MemoryRecord | null> {
    const row = this.db
      .select()
      .from(memoryRecords)
      .where(eq(memoryRecords.id, id))
      .get();

    return row != null ? fromDbRow(row) : null;
  }

  /**
   * Returns the memory record with the given SHA-256 hash, or null if not found.
   */
  async getByHash(hash: string): Promise<MemoryRecord | null> {
    const row = this.db
      .select()
      .from(memoryRecords)
      .where(eq(memoryRecords.hash, hash))
      .get();

    return row != null ? fromDbRow(row) : null;
  }
}

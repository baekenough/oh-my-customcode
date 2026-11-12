/**
 * Memory persistence service — ties adapters, aggregator, and drizzle table together.
 *
 * sync() accepts pre-fetched MemoryRecord arrays from any combination of adapters,
 * runs aggregation+dedup, then bulk-inserts with onConflictDoNothing (hash UNIQUE
 * and id PRIMARY KEY conflicts); rows not inserted because the hash is stored are
 * duplicates, rows not inserted because only the id is stored are reported in
 * errors.  query() provides filtered reads over memory_records.
 *
 * Spec: #1047 (Unified Memory System), sub-issue #1077 (persistence service).
 *
 * NOTE: This module performs I/O (DB). Adapter fetching is the caller's
 * responsibility — sync() accepts already-fetched arrays, not adapter instances.
 */

import { and, eq, getTableColumns, gte, inArray, lte, type SQL } from 'drizzle-orm';
import type { SensitivityTier } from './adapters/sensitivity.js';
import type { EvalDb } from './db/client.js';
import { memoryRecords } from './db/schema.js';
import { aggregateMemoryRecords, type MemoryRecord } from './memory-aggregator.js';

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
  /** Records skipped because the hash already existed; id-only conflicts are in errors, not counted here. */
  skippedDuplicates: number;
  /** Records rejected at the aggregation stage (sensitivity === 'secret'). */
  rejected: number;
  /** Non-fatal per-record errors: records not inserted because their id already exists under a different hash. */
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
 * Bind-parameter budget per statement. Every measurement below was taken with bun 1.3.14
 * on macOS; other platforms not measured. bun:sqlite throws once a statement binds 65536
 * values (measured: IN list of 65535 ok, 65536 fails). 32766 stays below that ceiling
 * (IN list of 32766 measured ok) and equals SQLite's documented default
 * SQLITE_MAX_VARIABLE_NUMBER since 3.32 (documented, not measured); PRAGMA
 * compile_options reports MAX_VARIABLE_NUMBER=500000 (sqlite 3.51.0). Each inserted row
 * binds one value per table column (measured: 5000 rows -> "received 70000", 14
 * columns), so rows per INSERT = budget / column count.
 */
const MAX_BIND_PARAMS = 32766;
const ROWS_PER_INSERT = Math.floor(
  MAX_BIND_PARAMS / Object.keys(getTableColumns(memoryRecords)).length
);

/**
 * Maps a MemoryRecord (adapter-schema, snake_case) to a DB insert row
 * (drizzle schema, camelCase + JSON-serialised tags).
 */
function toDbRow(record: MemoryRecord): typeof memoryRecords.$inferInsert {
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

type SyncTx = Parameters<Parameters<EvalDb['transaction']>[0]>[0];

/**
 * Inserts one chunk and classifies every row that was not inserted: hash already
 * stored -> skippedDuplicates; otherwise an id conflict -> errors.
 */
function insertChunk(
  tx: SyncTx,
  records: MemoryRecord[],
  rows: (typeof memoryRecords.$inferInsert)[]
): Pick<SyncResult, 'inserted' | 'skippedDuplicates' | 'errors'> {
  // Bulk insert with onConflictDoNothing() and no target — any uniqueness
  // conflict (PRIMARY KEY `id` or UNIQUE `hash`) drops that row; the split
  // below tells the two cases apart.
  const result = tx
    .insert(memoryRecords)
    .values(rows)
    .onConflictDoNothing()
    .returning({ hash: memoryRecords.hash })
    .all();

  // Aggregation dedups by hash, so a record is inserted iff its hash was returned.
  const insertedHashes = new Set(result.map((r) => r.hash));
  const notInserted = records.filter((r) => !insertedHashes.has(r.hash));
  const errors: SyncResult['errors'] = [];
  let skippedDuplicates = 0;
  if (notInserted.length > 0) {
    const storedHashes = new Set(
      tx
        .select({ hash: memoryRecords.hash })
        .from(memoryRecords)
        .where(
          inArray(
            memoryRecords.hash,
            notInserted.map((r) => r.hash)
          )
        )
        .all()
        .map((r) => r.hash)
    );
    for (const record of notInserted) {
      if (storedHashes.has(record.hash)) {
        skippedDuplicates++;
      } else {
        errors.push({
          record,
          error: new Error(`id ${record.id} already exists with a different hash`),
        });
      }
    }
  }
  // RETURNING yields only rows actually inserted (conflicts excluded).
  return { inserted: result.length, skippedDuplicates, errors };
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
   * reach the DB.  Records whose hash is already stored are skipped and counted in
   * skippedDuplicates (duplicate hashes within one batch are collapsed by aggregation);
   * a record whose id is stored under a different hash is not inserted and is
   * reported in errors (no throw, stored row unchanged).
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
    let skippedDuplicates = 0;

    if (records.length > 0) {
      const rows = records.map(toDbRow);
      // One transaction keeps sync() all-or-nothing as the former single INSERT was
      // (measured: 3000 rows, NOT NULL violation in the last row -> throws, 0 rows stored);
      // without it an earlier chunk would stay committed when a later chunk throws.
      this.db.transaction((tx) => {
        for (let start = 0; start < records.length; start += ROWS_PER_INSERT) {
          const chunk = insertChunk(
            tx,
            records.slice(start, start + ROWS_PER_INSERT),
            rows.slice(start, start + ROWS_PER_INSERT)
          );
          inserted += chunk.inserted;
          skippedDuplicates += chunk.skippedDuplicates;
          errors.push(...chunk.errors);
        }
      });
    }

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
    const row = this.db.select().from(memoryRecords).where(eq(memoryRecords.id, id)).get();

    return row != null ? fromDbRow(row) : null;
  }

  /**
   * Returns the memory record with the given SHA-256 hash, or null if not found.
   */
  async getByHash(hash: string): Promise<MemoryRecord | null> {
    const row = this.db.select().from(memoryRecords).where(eq(memoryRecords.hash, hash)).get();

    return row != null ? fromDbRow(row) : null;
  }
}

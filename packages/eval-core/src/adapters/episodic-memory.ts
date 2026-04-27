/**
 * Read-only adapter: episodic-memory MCP → MemoryRecord
 *
 * Converts raw episodic-memory MCP records to the unified MemoryRecord schema
 * defined in docs/memory-unification/schema.md (#1065) and stored in the
 * `memory_records` drizzle table (#1069).
 *
 * This adapter is read-only — it does NOT make MCP calls or write to the DB.
 * The caller is responsible for persistence.
 *
 * Sensitivity policy: docs/memory-unification/sensitivity.md (#1067).
 * Secret content causes normalizeEpisodicMemory() to throw — callers must
 * handle the rejection and NOT persist the record.
 */

import { createHash } from 'crypto';
import { containsSecret, detectSensitivity, type SensitivityTier } from './sensitivity.js';

// ---------------------------------------------------------------------------
// Raw episodic-memory MCP shape (best-guess from the indexer contract)
// ---------------------------------------------------------------------------

/**
 * Raw record as returned by the episodic-memory MCP indexer.
 *
 * Field names follow the MCP convention (camelCase). All fields are optional
 * defensively — the indexer may emit subsets depending on the episode length
 * and the configured chunking strategy.
 */
export interface EpisodicMemoryRecord {
  /** Session identifier assigned by Claude Code (UUID or slug). */
  sessionId?: string;

  /** Zero-based index of this chunk within the session. */
  chunkIndex?: number;

  /**
   * ISO 8601 timestamp when the conversation session ended.
   * Preferred over `startedAt` per schema.md (episodic-memory timestamp = session end).
   */
  endedAt?: string;

  /** ISO 8601 timestamp when the conversation session started. */
  startedAt?: string;

  /**
   * Auto-generated episode title or first-message summary produced by the indexer.
   * Used as the MemoryRecord `summary` field.
   */
  title?: string;

  /**
   * Extracted conversation chunk — the full body of the episode.
   * Used as the MemoryRecord `content` field.
   */
  content?: string;

  /**
   * Topic tags emitted by the indexer. Merged with the mandatory `["episodic"]` tag.
   */
  tags?: string[];

  /**
   * Reference to the episodic index entry (e.g. vector store ID).
   * Stored as `embedding_ref` if provided.
   */
  indexRef?: string;

  /** Name of the agent associated with this episode (optional). */
  agent?: string;
}

// ---------------------------------------------------------------------------
// Normalisation options
// ---------------------------------------------------------------------------

/** Options required by the caller at normalisation time. */
export interface NormalizeOptions {
  /**
   * Absolute project path or logical project slug.
   * Passed by the caller because episodic-memory MCP records do not always
   * embed the project path.
   */
  project: string;

  /**
   * Machine hostname for deduplication.
   * Defaults to process.env.HOSTNAME or 'unknown'.
   */
  deviceId?: string;

  /**
   * Caller-declared sensitivity tier.
   * Ignored if secret content is detected (secret always wins).
   * Defaults to 'project'.
   */
  sensitivity?: SensitivityTier;
}

// ---------------------------------------------------------------------------
// MemoryRecord (canonical schema — schema.md #1065)
// ---------------------------------------------------------------------------

/** Unified memory record ready for insertion into `memory_records`. */
export interface MemoryRecord {
  id: string;
  source: 'episodic-memory';
  deviceId: string;
  project: string;
  agent?: string;
  timestamp: string;
  summary: string;
  content: string;
  tags: string[];
  sensitivity: SensitivityTier;
  hash: string;
  embeddingRef?: string;
}

// ---------------------------------------------------------------------------
// Normalisation errors
// ---------------------------------------------------------------------------

/** Thrown when the raw record contains secret-tier content. */
export class SecretContentError extends Error {
  constructor(public readonly field: string) {
    super(
      `[Memory] REJECTED: secret-tier content detected in field '${field}'. Record not stored.`,
    );
    this.name = 'SecretContentError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncates a string to at most `max` characters, trimming trailing newlines. */
function truncate(value: string, max: number): string {
  const trimmed = value.replace(/[\r\n]+$/, '');
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/**
 * Derives the `id` for an episodic-memory record.
 * Format: `<sessionId>-<chunkIndex>` per schema.md.
 * Falls back to a deterministic UUID v4-style hash when either is absent.
 */
function deriveId(raw: EpisodicMemoryRecord): string {
  if (raw.sessionId !== undefined && raw.chunkIndex !== undefined) {
    return `${raw.sessionId}-${raw.chunkIndex}`;
  }
  // Fallback: stable id from content hash (no randomness — reproducible)
  const seed = `episodic:${raw.sessionId ?? ''}:${raw.content ?? ''}:${raw.endedAt ?? ''}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 36);
}

/**
 * Resolves the `timestamp` field.
 * episodic-memory schema.md: timestamp = session end time.
 * Falls back to startedAt, then ISO-now.
 */
function resolveTimestamp(raw: EpisodicMemoryRecord): string {
  if (raw.endedAt !== undefined && raw.endedAt.trim() !== '') {
    return raw.endedAt;
  }
  if (raw.startedAt !== undefined && raw.startedAt.trim() !== '') {
    return raw.startedAt;
  }
  return new Date().toISOString();
}

/**
 * Derives the `summary` field (≤150 chars, single line).
 * Prefers the indexer-generated `title`. Falls back to the first 150 chars
 * of `content`.
 */
function deriveSummary(raw: EpisodicMemoryRecord): string {
  if (raw.title !== undefined && raw.title.trim() !== '') {
    return truncate(raw.title.replace(/\n/g, ' '), 150);
  }
  const body = raw.content ?? '';
  const firstLine = body.split('\n')[0] ?? '';
  return truncate(firstLine || body, 150);
}

/**
 * Builds the SHA-256 hash for deduplication.
 * Format: sha256("episodic-memory" + content)
 */
function computeHash(content: string): string {
  return createHash('sha256')
    .update('episodic-memory' + content)
    .digest('hex');
}

/**
 * Merges indexer-supplied tags with the mandatory `episodic` base tag.
 * Tags are lowercased and deduplicated.
 */
function mergeTags(rawTags: string[] | undefined): string[] {
  const base = ['episodic'];
  if (rawTags === undefined || rawTags.length === 0) {
    return base;
  }
  const normalised = rawTags.map((t) => t.toLowerCase());
  const merged = new Set([...base, ...normalised]);
  return Array.from(merged);
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Normalises a raw episodic-memory MCP record into a unified MemoryRecord.
 *
 * Sensitivity contract (sensitivity.md #1067):
 * - Scans `summary` and `content` for secret patterns.
 * - Throws `SecretContentError` if any pattern matches → caller must NOT persist.
 * - Defaults to `project` tier; honours caller-supplied `options.sensitivity`
 *   for `sensitive` or `public` overrides.
 *
 * @throws {SecretContentError} if secret-tier content is detected in any field
 */
export function normalizeEpisodicMemory(
  raw: EpisodicMemoryRecord,
  opts: NormalizeOptions,
): MemoryRecord {
  const content = raw.content ?? '';
  const summary = deriveSummary(raw);

  // --- Secret detection (must run before any persistence) ---
  if (containsSecret(content)) {
    throw new SecretContentError('content');
  }
  if (containsSecret(summary)) {
    throw new SecretContentError('summary');
  }

  const sensitivity = detectSensitivity(content) === 'secret'
    ? 'secret' // should have been caught above, but belt-and-suspenders
    : (opts.sensitivity ?? 'project');

  const deviceId = opts.deviceId ?? process.env['HOSTNAME'] ?? 'unknown';

  return {
    id: deriveId(raw),
    source: 'episodic-memory',
    deviceId,
    project: opts.project,
    agent: raw.agent,
    timestamp: resolveTimestamp(raw),
    summary,
    content,
    tags: mergeTags(raw.tags),
    sensitivity,
    hash: computeHash(content),
    embeddingRef: raw.indexRef,
  };
}

/**
 * Read-only adapter: converts claude-mem MCP records to the unified MemoryRecord schema.
 *
 * Spec: docs/memory-unification/schema.md (v0.118.3, #1065)
 * Sensitivity: docs/memory-unification/sensitivity.md (#1067)
 * Epic: #1047 — Unified Memory System
 * Issue: #1070 — claude-mem adapter
 *
 * NOTE: This module is normalize-only. It does NOT make MCP RPC calls.
 * MCP integration is handled separately.
 */

import { createHash } from 'node:crypto';
import { detectSensitivity, type SensitivityTier } from './sensitivity.js';

// ---------------------------------------------------------------------------
// MemoryRecord — unified schema (docs/memory-unification/schema.md)
// ---------------------------------------------------------------------------

/**
 * All recognised memory sources in the unified pipeline.
 *
 * 'agentmemory' was added as the 5th source in #1178.
 * It is a STUB — the adapter returns empty results until #1169 Phase 1 activates it.
 */
export type MemorySource =
  | 'native'
  | 'claude-mem'
  | 'episodic-memory'
  | 'llm-memory'
  | 'agentmemory'; // STUB: full activation in #1169 Phase 1 (COEXIST)

export interface MemoryRecord {
  id: string;
  source: MemorySource;
  device_id: string;
  project: string;
  agent?: string;
  timestamp: string;
  summary: string;
  content: string;
  tags: string[];
  sensitivity: SensitivityTier;
  hash: string;
  embedding_ref?: string;
}

// ---------------------------------------------------------------------------
// ClaudeMemRecord — raw shape from claude-mem MCP responses
// ---------------------------------------------------------------------------

/**
 * Raw record shape returned by claude-mem MCP tools
 * (e.g. `mcp__plugin_claude-mem_mcp-search__search_memory`).
 *
 * Fields are best-effort based on Chroma-backed MCP patterns.
 * All fields are optional to accommodate variations across MCP server versions.
 */
export interface ClaudeMemRecord {
  /** MCP-assigned UUID from save_memory response. */
  id?: string;
  /** Full memory body. */
  content?: string;
  /** Shorthand metadata block attached at save time. */
  metadata?: {
    project?: string;
    agent?: string;
    tags?: string | string[];
    sensitivity?: string;
    created_at?: string;
    /** Chroma vector ID for embedding lookup. */
    vector_id?: string;
    [key: string]: unknown;
  };
  /** ISO 8601 timestamp — sometimes at top level, sometimes inside metadata. */
  created_at?: string;
  /** Tags array — sometimes at top level. */
  tags?: string | string[];
  /** Distance or score returned by vector search (ignored for normalization). */
  distance?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes SHA-256 of (source + content) as a hex string.
 * Matches the hash derivation rule in schema.md: `sha256("claude-mem" + content)`.
 */
function computeHash(source: string, content: string): string {
  return createHash('sha256').update(source + content).digest('hex');
}

/**
 * Normalises a timestamp value to ISO 8601 UTC.
 * Accepts: ISO string, Unix epoch (number), Date object.
 * Falls back to current time if the value cannot be parsed.
 */
function parseTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Normalises a tag value to a string array.
 * claude-mem sometimes returns tags as a JSON-encoded string.
 */
function normaliseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string');
  }
  if (typeof raw === 'string' && raw.length > 0) {
    if (raw.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((t): t is string => typeof t === 'string');
        }
      } catch {
        // fall through to comma-split below
      }
    }
    // comma-separated plain string (e.g. "feedback, release")
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Extracts the first sentence (or first 200 chars) of content for use as a summary.
 * Summary is capped at 150 chars per schema.md constraint.
 */
function extractSummary(content: string): string {
  const firstSentenceMatch = /^(.+?[.!?])\s/.exec(content);
  const candidate = firstSentenceMatch ? firstSentenceMatch[1] : content.slice(0, 200);
  return candidate.slice(0, 150);
}

/**
 * Resolves the sensitivity tier for a claude-mem record.
 *
 * Precedence (per sensitivity.md):
 *   secret (detected) > sensitive (explicit) > project (default) > public (explicit)
 */
function resolveSensitivity(content: string, metadataSensitivity: unknown): SensitivityTier {
  // secret detection always wins
  const detected = detectSensitivity(content);
  if (detected === 'secret') {
    return 'secret';
  }
  // honour explicit caller declaration for sensitive / public
  if (metadataSensitivity === 'sensitive') {
    return 'sensitive';
  }
  if (metadataSensitivity === 'public') {
    return 'public';
  }
  // default for claude-mem is 'project'
  return 'project';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NormalizeOptions {
  /** Machine or environment identifier (e.g. $HOSTNAME). */
  deviceId: string;
  /** Absolute project path or logical project slug. */
  project: string;
}

/**
 * Normalises a raw claude-mem MCP record to a unified MemoryRecord.
 *
 * @param raw  - The raw record from the claude-mem MCP response
 * @param opts - Device and project context supplied by the caller
 * @returns    A fully-populated MemoryRecord
 */
export function normalizeClaudeMem(raw: ClaudeMemRecord, opts: NormalizeOptions): MemoryRecord {
  const content = raw.content ?? '';
  const metadata = raw.metadata ?? {};

  const id = raw.id ?? crypto.randomUUID();
  const agent =
    typeof metadata.agent === 'string' && metadata.agent.length > 0
      ? metadata.agent
      : undefined;

  const rawTimestamp = raw.created_at ?? metadata.created_at;
  const timestamp = parseTimestamp(rawTimestamp);

  const rawTags = raw.tags ?? metadata.tags;
  const tags = normaliseTags(rawTags);

  const sensitivity = resolveSensitivity(content, metadata.sensitivity);

  const hash = computeHash('claude-mem', content);

  const vectorId =
    typeof metadata.vector_id === 'string' && metadata.vector_id.length > 0
      ? metadata.vector_id
      : undefined;
  const embeddingRef = vectorId ? `claude-mem/${vectorId}` : undefined;

  const record: MemoryRecord = {
    id,
    source: 'claude-mem',
    device_id: opts.deviceId,
    project: opts.project,
    timestamp,
    summary: extractSummary(content),
    content,
    tags,
    sensitivity,
    hash,
  };

  if (agent !== undefined) {
    record.agent = agent;
  }
  if (embeddingRef !== undefined) {
    record.embedding_ref = embeddingRef;
  }

  return record;
}

// Re-export for convenience so callers can import both from the same path
export { detectSensitivity } from './sensitivity.js';

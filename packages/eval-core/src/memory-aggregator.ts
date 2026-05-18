/**
 * Memory record aggregation and deduplication across multiple adapters.
 *
 * Aggregates MemoryRecord arrays from any combination of adapters
 * (claude-mem, episodic-memory, native, llm-memory) and deduplicates
 * by the SHA-256 `hash` field. On conflict, the strictest sensitivity
 * tier wins and tags are unioned.
 *
 * Spec: #1047 (Unified Memory System), sub-issue #1073 (aggregation+dedup).
 *
 * NOTE: This module is pure (no I/O, no DB). Persistence is a separate concern.
 */

import type { MemoryRecord, MemorySource } from './adapters/claude-mem.js';
import { type SensitivityTier } from './adapters/sensitivity.js';

// Re-export MemoryRecord and MemorySource so callers can import from one place.
export type { MemoryRecord, MemorySource };

// ---------------------------------------------------------------------------
// Sensitivity tier ordering (lowest → strictest)
// ---------------------------------------------------------------------------

const SENSITIVITY_ORDER: readonly SensitivityTier[] = ['public', 'project', 'sensitive', 'secret'];

/**
 * Returns the stricter of two sensitivity tiers.
 *
 * @example escalateSensitivity(['project', 'sensitive']) → 'sensitive'
 */
export function escalateSensitivity(tiers: SensitivityTier[]): SensitivityTier {
  if (tiers.length === 0) {
    return 'project'; // safe default
  }
  return tiers.reduce((max, tier) => {
    return SENSITIVITY_ORDER.indexOf(tier) > SENSITIVITY_ORDER.indexOf(max) ? tier : max;
  });
}

/**
 * Produces a sorted, deduplicated union of two tag arrays.
 *
 * @example mergeTags(['a', 'b'], ['b', 'c']) → ['a', 'b', 'c']
 */
export function mergeTags(tags1: string[], tags2: string[]): string[] {
  return [...new Set([...tags1, ...tags2])].sort();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AggregateOptions {
  /** One array per adapter — each inner array is the full output of one adapter. */
  records: MemoryRecord[][];
  /**
   * How to resolve hash collisions (which record becomes the canonical one).
   * - 'newest'   (default) — keep the record with the latest `timestamp`
   * - 'oldest'   — keep the record with the earliest `timestamp`
   * - 'priority' — prefer sources earlier in `sourcePriority`
   */
  conflictPolicy?: 'newest' | 'oldest' | 'priority';
  /**
   * Source preference order for the 'priority' conflict policy.
   * Default: ['native', 'claude-mem', 'episodic-memory', 'llm-memory', 'agentmemory']
   *
   * 'agentmemory' is listed last — it is a STUB (see #1178) and contributes
   * 0 records until #1169 Phase 1 activates the full adapter.
   */
  sourcePriority?: MemorySource[];
}

export interface AggregateResult {
  records: MemoryRecord[];
  stats: {
    /** Sum of all input records before any filtering. */
    inputTotal: number;
    /** Number of duplicate hashes that were collapsed. */
    deduped: number;
    /** Records auto-rejected because their sensitivity === 'secret'. */
    rejected: number;
    /** Count of output records broken down by source. */
    bySource: Record<string, number>;
  };
}

/**
 * Aggregates MemoryRecord arrays from multiple adapters.
 *
 * Steps:
 *  1. Flatten all input records.
 *  2. Auto-reject records with sensitivity === 'secret'.
 *  3. Group by `hash`.
 *  4. Resolve conflicts within each group using `conflictPolicy`.
 *  5. Escalate sensitivity to the strictest tier present in the group.
 *  6. Union tags across all group members.
 *  7. Prefer non-null `agent` from any group member.
 *  8. Return aggregated records + stats.
 */
export function aggregateMemoryRecords(opts: AggregateOptions): AggregateResult {
  const {
    records: adapterResults,
    conflictPolicy = 'newest',
    // 'agentmemory' appended last — STUB, contributes 0 records until #1169 Phase 1
    sourcePriority = ['native', 'claude-mem', 'episodic-memory', 'llm-memory', 'agentmemory'],
  } = opts;

  // 1. Flatten
  const flat = adapterResults.flat();
  const inputTotal = flat.length;

  // 2. Reject secret-tier records
  let rejected = 0;
  const allowed: MemoryRecord[] = [];
  for (const record of flat) {
    if (record.sensitivity === 'secret') {
      rejected++;
    } else {
      allowed.push(record);
    }
  }

  // 3. Group by hash
  const groups = new Map<string, MemoryRecord[]>();
  for (const record of allowed) {
    const group = groups.get(record.hash);
    if (group === undefined) {
      groups.set(record.hash, [record]);
    } else {
      group.push(record);
    }
  }

  // 4–7. Resolve each group
  const deduped = allowed.length - groups.size;
  const output: MemoryRecord[] = [];

  for (const group of groups.values()) {
    const winner = resolveConflict(group, conflictPolicy, sourcePriority);

    // 5. Escalate sensitivity across the whole group
    const mergedSensitivity = escalateSensitivity(group.map((r) => r.sensitivity));

    // 6. Union tags
    const mergedTags = group.reduce<string[]>(
      (acc, r) => mergeTags(acc, r.tags),
      []
    );

    // 7. Prefer non-null agent
    const mergedAgent = group.find((r) => r.agent != null)?.agent ?? winner.agent;

    output.push({
      ...winner,
      sensitivity: mergedSensitivity,
      tags: mergedTags,
      agent: mergedAgent,
    });
  }

  // 8. Build bySource stats
  const bySource: Record<string, number> = {};
  for (const record of output) {
    bySource[record.source] = (bySource[record.source] ?? 0) + 1;
  }

  return {
    records: output,
    stats: { inputTotal, deduped, rejected, bySource },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Picks the canonical record from a collision group.
 *
 * The winner provides `id`, `source`, `device_id`, `project`, `timestamp`,
 * `summary`, `content`, `hash`, and `embedding_ref`. Sensitivity and tags
 * are merged separately by the caller.
 */
function resolveConflict(
  group: MemoryRecord[],
  policy: 'newest' | 'oldest' | 'priority',
  sourcePriority: string[]
): MemoryRecord {
  if (group.length === 1) {
    return group[0];
  }

  if (policy === 'newest') {
    return group.reduce((best, r) => (r.timestamp > best.timestamp ? r : best));
  }

  if (policy === 'oldest') {
    return group.reduce((best, r) => (r.timestamp < best.timestamp ? r : best));
  }

  // policy === 'priority'
  return group.reduce((best, r) => {
    const bestIdx = sourcePriority.indexOf(best.source);
    const rIdx = sourcePriority.indexOf(r.source);
    // Lower index = higher priority. Unknown sources get lowest priority.
    const bestPriority = bestIdx === -1 ? sourcePriority.length : bestIdx;
    const rPriority = rIdx === -1 ? sourcePriority.length : rIdx;
    return rPriority < bestPriority ? r : best;
  });
}

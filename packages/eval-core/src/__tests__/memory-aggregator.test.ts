/**
 * Tests for memory-aggregator.ts (#1073 — aggregation+dedup).
 *
 * Covers:
 *  - No overlap: all records pass through
 *  - Hash overlap: newest wins (default policy)
 *  - 'oldest' conflict policy
 *  - 'priority' conflict policy with custom order
 *  - Secret-tier auto-rejection
 *  - Sensitivity escalation on merge
 *  - Tag union
 *  - Empty input arrays
 *  - Stats accuracy
 *  - Agent null-preference: prefer non-null agent on merge
 */

import { describe, expect, it } from 'bun:test';
import {
  aggregateMemoryRecords,
  escalateSensitivity,
  mergeTags,
  type MemoryRecord,
} from '../memory-aggregator.js';
import type { SensitivityTier } from '../adapters/sensitivity.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const n = ++_seq;
  return {
    id: `id-${n}`,
    source: 'native',
    device_id: 'host',
    project: '/proj',
    agent: `agent-${n}`,
    timestamp: `2026-04-01T00:00:0${n % 10}.000Z`,
    summary: `Summary ${n}`,
    content: `Content ${n}`,
    tags: [`tag-${n}`],
    sensitivity: 'project',
    hash: `hash-${n}`,
    embedding_ref: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit: escalateSensitivity
// ---------------------------------------------------------------------------

describe('escalateSensitivity', () => {
  it('returns the single tier when given one element', () => {
    expect(escalateSensitivity(['public'])).toBe('public');
    expect(escalateSensitivity(['sensitive'])).toBe('sensitive');
  });

  it('escalates public + project → project', () => {
    expect(escalateSensitivity(['public', 'project'])).toBe('project');
  });

  it('escalates project + sensitive → sensitive', () => {
    expect(escalateSensitivity(['project', 'sensitive'])).toBe('sensitive');
  });

  it('escalates sensitive + secret → secret', () => {
    expect(escalateSensitivity(['sensitive', 'secret'])).toBe('secret');
  });

  it('escalates mixed list to strictest tier', () => {
    expect(escalateSensitivity(['public', 'project', 'sensitive', 'secret'])).toBe('secret');
  });

  it('returns "project" for an empty array (safe default)', () => {
    expect(escalateSensitivity([])).toBe('project');
  });
});

// ---------------------------------------------------------------------------
// Unit: mergeTags
// ---------------------------------------------------------------------------

describe('mergeTags', () => {
  it('returns union of two disjoint tag arrays, sorted', () => {
    expect(mergeTags(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deduplicates overlapping tags', () => {
    expect(mergeTags(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('handles empty first array', () => {
    expect(mergeTags([], ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('handles empty second array', () => {
    expect(mergeTags(['x', 'y'], [])).toEqual(['x', 'y']);
  });

  it('handles both arrays empty', () => {
    expect(mergeTags([], [])).toEqual([]);
  });

  it('returns sorted output', () => {
    expect(mergeTags(['z', 'a'], ['m', 'b'])).toEqual(['a', 'b', 'm', 'z']);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — no overlap
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: no overlap', () => {
  it('passes all records through when no hashes clash (2 adapters)', () => {
    const r1 = makeRecord({ hash: 'h1' });
    const r2 = makeRecord({ hash: 'h2', source: 'claude-mem' });
    const r3 = makeRecord({ hash: 'h3', source: 'episodic-memory' });

    const result = aggregateMemoryRecords({ records: [[r1, r2], [r3]] });

    expect(result.records).toHaveLength(3);
    expect(result.stats.inputTotal).toBe(3);
    expect(result.stats.deduped).toBe(0);
    expect(result.stats.rejected).toBe(0);
  });

  it('handles single adapter with multiple records', () => {
    const records = [makeRecord({ hash: 'a1' }), makeRecord({ hash: 'a2' })];
    const result = aggregateMemoryRecords({ records: [records] });

    expect(result.records).toHaveLength(2);
    expect(result.stats.deduped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — dedup (newest policy)
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: dedup with "newest" policy', () => {
  it('collapses 1 hash clash across 2 adapters, newest timestamp wins', () => {
    const older = makeRecord({
      hash: 'shared',
      timestamp: '2026-04-01T10:00:00.000Z',
      summary: 'older summary',
    });
    const newer = makeRecord({
      hash: 'shared',
      source: 'claude-mem',
      timestamp: '2026-04-02T10:00:00.000Z',
      summary: 'newer summary',
    });

    const result = aggregateMemoryRecords({ records: [[older], [newer]] });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].summary).toBe('newer summary');
    expect(result.stats.inputTotal).toBe(2);
    expect(result.stats.deduped).toBe(1);
    expect(result.stats.rejected).toBe(0);
  });

  it('newest is the default conflict policy', () => {
    const r1 = makeRecord({ hash: 'x', timestamp: '2026-01-01T00:00:00.000Z', content: 'old' });
    const r2 = makeRecord({ hash: 'x', timestamp: '2026-03-01T00:00:00.000Z', content: 'new' });

    const result = aggregateMemoryRecords({ records: [[r1, r2]] });
    expect(result.records[0].content).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — 'oldest' policy
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: "oldest" conflict policy', () => {
  it('keeps record with earliest timestamp on hash collision', () => {
    const r1 = makeRecord({
      hash: 'dup',
      timestamp: '2026-01-01T00:00:00.000Z',
      content: 'earliest',
    });
    const r2 = makeRecord({
      hash: 'dup',
      source: 'claude-mem',
      timestamp: '2026-06-01T00:00:00.000Z',
      content: 'latest',
    });

    const result = aggregateMemoryRecords({
      records: [[r1], [r2]],
      conflictPolicy: 'oldest',
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].content).toBe('earliest');
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — 'priority' policy
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: "priority" conflict policy', () => {
  it('prefers higher-priority source on hash collision', () => {
    const nativeRecord = makeRecord({
      hash: 'dup',
      source: 'native',
      content: 'from native',
    });
    const claudeMemRecord = makeRecord({
      hash: 'dup',
      source: 'claude-mem',
      content: 'from claude-mem',
    });

    // native has higher priority than claude-mem (default order)
    const result = aggregateMemoryRecords({
      records: [[claudeMemRecord], [nativeRecord]],
      conflictPolicy: 'priority',
    });

    expect(result.records[0].content).toBe('from native');
  });

  it('respects custom sourcePriority order', () => {
    const episodicRecord = makeRecord({
      hash: 'dup',
      source: 'episodic-memory',
      content: 'from episodic',
    });
    const nativeRecord = makeRecord({
      hash: 'dup',
      source: 'native',
      content: 'from native',
    });

    // Flip order: episodic-memory wins
    const result = aggregateMemoryRecords({
      records: [[nativeRecord], [episodicRecord]],
      conflictPolicy: 'priority',
      sourcePriority: ['episodic-memory', 'native', 'claude-mem', 'llm-memory'],
    });

    expect(result.records[0].content).toBe('from episodic');
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — secret-tier rejection
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: secret-tier auto-rejection', () => {
  it('rejects records with sensitivity === "secret"', () => {
    const safe = makeRecord({ hash: 'safe', sensitivity: 'project' });
    const secretRecord = makeRecord({ hash: 'secret-hash', sensitivity: 'secret' });

    const result = aggregateMemoryRecords({ records: [[safe, secretRecord]] });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].hash).toBe('safe');
    expect(result.stats.rejected).toBe(1);
    expect(result.stats.inputTotal).toBe(2);
  });

  it('rejects all secret records leaving empty output', () => {
    const r1 = makeRecord({ hash: 'h1', sensitivity: 'secret' });
    const r2 = makeRecord({ hash: 'h2', sensitivity: 'secret' });

    const result = aggregateMemoryRecords({ records: [[r1], [r2]] });

    expect(result.records).toHaveLength(0);
    expect(result.stats.rejected).toBe(2);
    expect(result.stats.deduped).toBe(0);
  });

  it('does not reject project, sensitive, or public tiers', () => {
    const tiers: SensitivityTier[] = ['public', 'project', 'sensitive'];
    const records = tiers.map((sensitivity, i) =>
      makeRecord({ hash: `h-${i}`, sensitivity })
    );

    const result = aggregateMemoryRecords({ records: [records] });

    expect(result.records).toHaveLength(3);
    expect(result.stats.rejected).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — sensitivity escalation on merge
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: sensitivity escalation', () => {
  it('escalates project + sensitive → sensitive on hash collision', () => {
    const r1 = makeRecord({ hash: 'dup', sensitivity: 'project', source: 'native' });
    const r2 = makeRecord({ hash: 'dup', sensitivity: 'sensitive', source: 'claude-mem' });

    const result = aggregateMemoryRecords({ records: [[r1], [r2]] });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].sensitivity).toBe('sensitive');
  });

  it('escalates public + project → project', () => {
    const r1 = makeRecord({ hash: 'dup', sensitivity: 'public', source: 'native' });
    const r2 = makeRecord({ hash: 'dup', sensitivity: 'project', source: 'claude-mem' });

    const result = aggregateMemoryRecords({ records: [[r1], [r2]] });

    expect(result.records[0].sensitivity).toBe('project');
  });

  it('preserves sensitivity for non-colliding records', () => {
    const r1 = makeRecord({ hash: 'h1', sensitivity: 'public' });
    const r2 = makeRecord({ hash: 'h2', sensitivity: 'sensitive' });

    const result = aggregateMemoryRecords({ records: [[r1, r2]] });

    const sensitivities = result.records.map((r) => r.sensitivity).sort();
    expect(sensitivities).toEqual(['public', 'sensitive']);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — tag union
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: tag union', () => {
  it('unions tags from colliding records', () => {
    const r1 = makeRecord({ hash: 'dup', tags: ['a', 'b'] });
    const r2 = makeRecord({ hash: 'dup', source: 'claude-mem', tags: ['b', 'c'] });

    const result = aggregateMemoryRecords({ records: [[r1], [r2]] });

    expect(result.records[0].tags).toEqual(['a', 'b', 'c']);
  });

  it('preserves tags for non-colliding records independently', () => {
    const r1 = makeRecord({ hash: 'h1', tags: ['x'] });
    const r2 = makeRecord({ hash: 'h2', tags: ['y'] });

    const result = aggregateMemoryRecords({ records: [[r1, r2]] });

    const tagSets = result.records.map((r) => r.tags).sort();
    expect(tagSets).toEqual([['x'], ['y']]);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — agent null-preference
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: agent field handling', () => {
  it('prefers non-null agent over null on merge', () => {
    const withAgent = makeRecord({ hash: 'dup', agent: 'sys-memory-keeper' });
    const withoutAgent = makeRecord({ hash: 'dup', source: 'claude-mem', agent: undefined });

    const result = aggregateMemoryRecords({ records: [[withoutAgent], [withAgent]] });

    expect(result.records[0].agent).toBe('sys-memory-keeper');
  });

  it('keeps null agent when all group members have null agent', () => {
    const r1 = makeRecord({ hash: 'dup', agent: undefined });
    const r2 = makeRecord({ hash: 'dup', source: 'claude-mem', agent: undefined });

    const result = aggregateMemoryRecords({ records: [[r1], [r2]] });

    expect(result.records[0].agent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — empty inputs
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: empty inputs', () => {
  it('returns empty output for empty records array', () => {
    const result = aggregateMemoryRecords({ records: [] });

    expect(result.records).toHaveLength(0);
    expect(result.stats.inputTotal).toBe(0);
    expect(result.stats.deduped).toBe(0);
    expect(result.stats.rejected).toBe(0);
    expect(result.stats.bySource).toEqual({});
  });

  it('returns empty output when all adapter arrays are empty', () => {
    const result = aggregateMemoryRecords({ records: [[], [], []] });

    expect(result.records).toHaveLength(0);
    expect(result.stats.inputTotal).toBe(0);
  });

  it('handles a mix of empty and non-empty adapter arrays', () => {
    const r1 = makeRecord({ hash: 'only' });
    const result = aggregateMemoryRecords({ records: [[], [r1], []] });

    expect(result.records).toHaveLength(1);
    expect(result.stats.inputTotal).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateMemoryRecords — stats accuracy
// ---------------------------------------------------------------------------

describe('aggregateMemoryRecords: stats accuracy', () => {
  it('counts bySource correctly across mixed sources', () => {
    const records = [
      makeRecord({ hash: 'n1', source: 'native' }),
      makeRecord({ hash: 'n2', source: 'native' }),
      makeRecord({ hash: 'c1', source: 'claude-mem' }),
      makeRecord({ hash: 'e1', source: 'episodic-memory' }),
    ];

    const result = aggregateMemoryRecords({ records: [records] });

    expect(result.stats.bySource['native']).toBe(2);
    expect(result.stats.bySource['claude-mem']).toBe(1);
    expect(result.stats.bySource['episodic-memory']).toBe(1);
    expect(result.stats.bySource['llm-memory']).toBeUndefined();
  });

  it('deduped count equals inputTotal minus output count (after rejection excluded)', () => {
    // 3 records total, 1 secret (rejected), 2 surviving but 1 dup pair → 1 output
    const r1 = makeRecord({ hash: 'dup', source: 'native', sensitivity: 'project' });
    const r2 = makeRecord({ hash: 'dup', source: 'claude-mem', sensitivity: 'project' });
    const r3 = makeRecord({ hash: 'unique', sensitivity: 'secret' });

    const result = aggregateMemoryRecords({ records: [[r1, r2, r3]] });

    // r3 rejected. r1+r2 deduped to 1.
    expect(result.stats.inputTotal).toBe(3);
    expect(result.stats.rejected).toBe(1);
    expect(result.stats.deduped).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it('reports zero deduped when all hashes unique', () => {
    const records = [
      makeRecord({ hash: 'u1' }),
      makeRecord({ hash: 'u2' }),
      makeRecord({ hash: 'u3' }),
    ];

    const result = aggregateMemoryRecords({ records: [records] });

    expect(result.stats.deduped).toBe(0);
    expect(result.records).toHaveLength(3);
  });
});

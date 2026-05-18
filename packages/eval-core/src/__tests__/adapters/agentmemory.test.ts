/**
 * Tests for the AgentMemory STUB adapter (#1178).
 *
 * Verifies:
 *   1. fetchAll() and fetchAgentMemoryRecords() return empty arrays (STUB behaviour).
 *   2. AgentMemoryAdapter.normalize() throws AgentMemoryNotActivatedError.
 *   3. AGENTMEMORY_SOURCE constant equals 'agentmemory'.
 *   4. 'agentmemory' is present in the MemorySource union via MemoryRecord typing.
 *   5. The STUB does NOT perform any I/O (deterministic, no side effects).
 *
 * NOTE: These tests intentionally validate stub behaviour.
 * Real behaviour tests will be added in #1169 Phase 1 when the adapter activates.
 *
 * Epic: #1047 (Unified Memory System)
 * Issue: #1178 (this stub)
 */

import { describe, expect, it } from 'bun:test';
import {
  AgentMemoryAdapter,
  AgentMemoryNotActivatedError,
  AGENTMEMORY_SOURCE,
  fetchAgentMemoryRecords,
  type AgentMemoryRecord,
  type NormalizeOptions,
} from '../../adapters/agentmemory.js';
import type { MemorySource } from '../../adapters/claude-mem.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPTS: NormalizeOptions = {
  deviceId: 'macbook-test',
  project: '/Users/sangyi/workspace/projects/oh-my-customcode',
};

function makeRaw(overrides: Partial<AgentMemoryRecord> = {}): AgentMemoryRecord {
  return {
    id: 'agent-mem-uuid-1234',
    content: 'STUB test record: placeholder content for #1178.',
    created_at: '2026-05-18T12:00:00Z',
    agent: 'lang-typescript-expert',
    tags: ['stub', 'agentmemory'],
    sensitivity: 'project',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AGENTMEMORY_SOURCE constant
// ---------------------------------------------------------------------------

describe('AGENTMEMORY_SOURCE', () => {
  it('equals the string literal "agentmemory"', () => {
    expect(AGENTMEMORY_SOURCE).toBe('agentmemory');
  });

  it('is a valid MemorySource (type-level check via assignment)', () => {
    // If this compiles, 'agentmemory' is in the MemorySource union.
    const source: MemorySource = AGENTMEMORY_SOURCE;
    expect(source).toBe('agentmemory');
  });
});

// ---------------------------------------------------------------------------
// fetchAgentMemoryRecords — functional API
// ---------------------------------------------------------------------------

describe('fetchAgentMemoryRecords (functional STUB)', () => {
  it('returns an empty array', async () => {
    const records = await fetchAgentMemoryRecords(OPTS);
    expect(records).toEqual([]);
  });

  it('returns an array (not null or undefined)', async () => {
    const records = await fetchAgentMemoryRecords(OPTS);
    expect(Array.isArray(records)).toBe(true);
  });

  it('returns 0 records — contributes nothing to aggregation', async () => {
    const records = await fetchAgentMemoryRecords(OPTS);
    expect(records.length).toBe(0);
  });

  it('resolves without throwing (STUB is non-destructive)', async () => {
    await expect(fetchAgentMemoryRecords(OPTS)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AgentMemoryAdapter.fetchAll
// ---------------------------------------------------------------------------

describe('AgentMemoryAdapter.fetchAll (STUB)', () => {
  it('returns an empty array', async () => {
    const adapter = new AgentMemoryAdapter();
    const records = await adapter.fetchAll();
    expect(records).toEqual([]);
  });

  it('is idempotent — successive calls return the same empty result', async () => {
    const adapter = new AgentMemoryAdapter();
    const first = await adapter.fetchAll();
    const second = await adapter.fetchAll();
    expect(first).toEqual(second);
    expect(first.length).toBe(0);
  });

  it('does not perform I/O (resolves synchronously)', async () => {
    const adapter = new AgentMemoryAdapter();
    // If this takes longer than 50ms it likely hit real I/O — guard against that.
    const start = Date.now();
    await adapter.fetchAll();
    expect(Date.now() - start).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// AgentMemoryAdapter.normalize — throws until #1169 Phase 1
// ---------------------------------------------------------------------------

describe('AgentMemoryAdapter.normalize (STUB throws)', () => {
  it('throws AgentMemoryNotActivatedError', () => {
    const adapter = new AgentMemoryAdapter();
    const raw = makeRaw();
    expect(() => adapter.normalize(raw, OPTS)).toThrow(AgentMemoryNotActivatedError);
  });

  it('error message mentions #1169 Phase 1', () => {
    const adapter = new AgentMemoryAdapter();
    let caught: unknown;
    try {
      adapter.normalize(makeRaw(), OPTS);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AgentMemoryNotActivatedError);
    if (caught instanceof AgentMemoryNotActivatedError) {
      expect(caught.message).toContain('#1169 Phase 1');
    }
  });

  it('error name is "AgentMemoryNotActivatedError"', () => {
    const adapter = new AgentMemoryAdapter();
    let caught: unknown;
    try {
      adapter.normalize(makeRaw(), OPTS);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AgentMemoryNotActivatedError);
    if (caught instanceof AgentMemoryNotActivatedError) {
      expect(caught.name).toBe('AgentMemoryNotActivatedError');
    }
  });

  it('throws even when raw record is minimal (empty object)', () => {
    const adapter = new AgentMemoryAdapter();
    expect(() => adapter.normalize({}, OPTS)).toThrow(AgentMemoryNotActivatedError);
  });

  it('throws even when raw record has all fields populated', () => {
    const adapter = new AgentMemoryAdapter();
    const raw = makeRaw({
      id: 'full-record',
      content: 'full content',
      created_at: '2026-05-18T12:00:00Z',
      agent: 'lang-typescript-expert',
      tags: ['a', 'b'],
      sensitivity: 'sensitive',
      embedding_ref: 'agent-memory/vec-123',
    });
    expect(() => adapter.normalize(raw, OPTS)).toThrow(AgentMemoryNotActivatedError);
  });
});

// ---------------------------------------------------------------------------
// AgentMemoryNotActivatedError
// ---------------------------------------------------------------------------

describe('AgentMemoryNotActivatedError', () => {
  it('is an instance of Error', () => {
    const err = new AgentMemoryNotActivatedError('testMethod');
    expect(err).toBeInstanceOf(Error);
  });

  it('message includes the method name', () => {
    const err = new AgentMemoryNotActivatedError('normalize');
    expect(err.message).toContain('normalize');
  });

  it('message includes STUB keyword', () => {
    const err = new AgentMemoryNotActivatedError('normalize');
    expect(err.message).toContain('STUB');
  });
});

// ---------------------------------------------------------------------------
// 5-source schema compatibility
// ---------------------------------------------------------------------------

describe('5-source schema — agentmemory in MemorySource union', () => {
  it('the source literal "agentmemory" is assignable to MemorySource', () => {
    const sources: MemorySource[] = [
      'native',
      'claude-mem',
      'episodic-memory',
      'llm-memory',
      'agentmemory',
    ];
    expect(sources).toHaveLength(5);
    expect(sources).toContain('agentmemory');
  });

  it('all 4 original sources are still present (no regression)', () => {
    const sources: MemorySource[] = [
      'native',
      'claude-mem',
      'episodic-memory',
      'llm-memory',
      'agentmemory',
    ];
    expect(sources).toContain('native');
    expect(sources).toContain('claude-mem');
    expect(sources).toContain('episodic-memory');
    expect(sources).toContain('llm-memory');
  });
});

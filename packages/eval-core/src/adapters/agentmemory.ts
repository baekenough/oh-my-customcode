/**
 * STUB adapter: AgentMemory → MemoryRecord
 *
 * Registers `agentmemory` as the 5th MemoryRecord source in the unified schema.
 * All methods return empty results or throw informative errors — no real I/O.
 *
 * STUB: Full implementation pending #1169 Phase 1 (COEXIST)
 *
 * Why a stub now?
 *   #1169 AgentMemory migration requires the `agentmemory` source to be
 *   recognised by the unified pipeline at schema level BEFORE the migration
 *   activates. Without this entry, AgentMemory records would be invisible
 *   to memory-aggregator and memory-service during the COEXIST phase.
 *
 * Activation plan (#1169 Phase 1):
 *   1. Replace STUB_NOT_ACTIVATED guards with real AgentMemory MCP calls.
 *   2. Implement Chroma → SQLite record conversion in normalizeAgentMemory().
 *   3. Remove this header comment block.
 *
 * Related:
 *   - Epic: #1047 (Unified Memory System, closed)
 *   - Issue: #1178 (this stub)
 *   - Issue: #1169 (AgentMemory PRIMARY replacement — activates this adapter)
 *   - Schema: docs/memory-unification/schema.md
 *   - Sensitivity: docs/memory-unification/sensitivity.md
 */

import { type SensitivityTier } from './sensitivity.js';

// ---------------------------------------------------------------------------
// MemoryRecord — 5-source unified schema
// ---------------------------------------------------------------------------

/**
 * Unified memory record — extended to include `agentmemory` as the 5th source.
 *
 * Mirrors the MemoryRecord interface in claude-mem.ts / episodic-memory.ts
 * but re-declared here with the extended source union so that this module
 * is self-contained. memory-aggregator imports from claude-mem.ts which
 * will also be updated to reflect the full 5-source union.
 */
export interface AgentMemoryRecord {
  /** Raw record identifier from the AgentMemory MCP server. */
  id?: string;

  /**
   * Full memory body. AgentMemory stores entries as markdown blocks
   * written by sys-memory-keeper (R011 SHOULD-memory-integration).
   */
  content?: string;

  /** ISO 8601 creation timestamp — from AgentMemory MCP metadata. */
  created_at?: string;

  /** Agent name that owns this memory entry. */
  agent?: string;

  /** Tags associated with this memory entry. */
  tags?: string[];

  /**
   * Caller-declared sensitivity tier.
   * Ignored when content-level secret detection fires (secret always wins).
   */
  sensitivity?: SensitivityTier;

  /** Reference to an embedding vector, if available. */
  embedding_ref?: string;
}

// ---------------------------------------------------------------------------
// Normalisation options
// ---------------------------------------------------------------------------

export interface NormalizeOptions {
  /** Machine hostname for deduplication. */
  deviceId: string;

  /** Absolute project path or logical project slug. */
  project: string;
}

// ---------------------------------------------------------------------------
// STUB error
// ---------------------------------------------------------------------------

/**
 * Thrown by all active normalisation paths until #1169 Phase 1 activates
 * the full implementation.
 *
 * Callers that encounter this error should skip agentmemory source silently
 * or surface it as a warning (not a fatal error) during the COEXIST phase.
 */
export class AgentMemoryNotActivatedError extends Error {
  constructor(method: string) {
    super(
      `[AgentMemory] STUB: ${method} not yet activated — see #1169 Phase 1 (COEXIST). ` +
        'This adapter is registered in the schema but not operationally active.',
    );
    this.name = 'AgentMemoryNotActivatedError';
  }
}

// ---------------------------------------------------------------------------
// AgentMemoryAdapter — STUB class
// ---------------------------------------------------------------------------

/**
 * STUB adapter class for AgentMemory MCP integration.
 *
 * Implements the same structural contract as the other adapters (claude-mem,
 * episodic-memory, native-memory) so that:
 *   (a) TypeScript type-checks pass across the codebase.
 *   (b) memory-aggregator can reference `agentmemory` in sourcePriority.
 *   (c) memory-service can accept `agentmemory` in query filters.
 *
 * STUB: Full implementation pending #1169 Phase 1 (COEXIST)
 */
export class AgentMemoryAdapter {
  /**
   * Returns an empty array — no AgentMemory records are fetched until
   * #1169 Phase 1 activates the MCP integration.
   *
   * This matches the contract: callers pass adapter results as arrays,
   * and an empty array is valid (contributes 0 records to aggregation).
   *
   * @returns Promise<never[]> — always resolves to []
   */
  async fetchAll(): Promise<AgentMemoryRecord[]> {
    // STUB: Full implementation pending #1169 Phase 1 (COEXIST)
    return [];
  }

  /**
   * Normalises a raw AgentMemory MCP record to the unified MemoryRecord shape.
   *
   * STUB: Throws AgentMemoryNotActivatedError until #1169 Phase 1 is active.
   * This method is here to satisfy the interface contract; callers should
   * not reach it until the stub is replaced.
   *
   * @throws {AgentMemoryNotActivatedError} always
   */
  normalize(_raw: AgentMemoryRecord, _opts: NormalizeOptions): never {
    // STUB: Full implementation pending #1169 Phase 1 (COEXIST)
    throw new AgentMemoryNotActivatedError('normalize');
  }
}

// ---------------------------------------------------------------------------
// Convenience function — mirrors pattern from other adapters
// ---------------------------------------------------------------------------

/**
 * Stub normalisation function.
 *
 * Returns an empty array — mirrors `scanNativeMemory()` and the other adapters'
 * functional API so callers can treat all adapters uniformly.
 *
 * STUB: Full implementation pending #1169 Phase 1 (COEXIST)
 *
 * @returns [] always, without reading any AgentMemory MCP endpoint
 */
export function fetchAgentMemoryRecords(
  _opts: NormalizeOptions,
): Promise<AgentMemoryRecord[]> {
  // STUB: Full implementation pending #1169 Phase 1 (COEXIST)
  return Promise.resolve([]);
}

// ---------------------------------------------------------------------------
// Source constant — used by aggregator and service for type-safe references
// ---------------------------------------------------------------------------

/** The source identifier for AgentMemory records in the unified schema. */
export const AGENTMEMORY_SOURCE = 'agentmemory' as const;

export type AgentMemorySource = typeof AGENTMEMORY_SOURCE;

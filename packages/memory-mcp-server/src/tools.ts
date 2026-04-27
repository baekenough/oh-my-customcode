/**
 * MCP tool definitions for memory-mcp-server.
 *
 * Exposes four tools over MemoryService:
 *   memory.query       — filtered multi-record reads
 *   memory.get         — single-record lookup by id or hash
 *   memory.list_sources — distinct sources with counts
 *   memory.stats       — aggregate statistics
 *
 * Secret-tier records are never returned (enforced in MemoryService.query
 * via the sensitivity filter, and in get/stats via explicit filtering here).
 */

import type { MemoryService, MemoryRecord, MemoryQueryFilter } from '@omcustom/eval-core/memory-service';

// ---------------------------------------------------------------------------
// Input schema types (validated at runtime via JSON Schema in MCP server)
// ---------------------------------------------------------------------------

export interface QueryInput {
  source?: 'native' | 'claude-mem' | 'episodic-memory' | 'llm-memory';
  sensitivity?: 'public' | 'project' | 'sensitive';
  agent?: string;
  project?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface GetInput {
  id?: string;
  hash?: string;
}

export interface ListSourcesInput {
  // intentionally empty — no parameters
}

export interface StatsInput {
  // intentionally empty — no parameters
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface SourceCount {
  source: string;
  count: number;
}

export interface MemoryStats {
  total: number;
  bySource: Record<string, number>;
  bySensitivity: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Builds a MemoryQueryFilter from QueryInput, enforcing the secret exclusion.
 */
function buildFilter(input: QueryInput): MemoryQueryFilter {
  return {
    source: input.source,
    // We accept public/project/sensitive — never secret
    sensitivity: input.sensitivity,
    agent: input.agent,
    project: input.project,
    fromTimestamp: input.since,
    toTimestamp: input.until,
    limit: input.limit ?? 100,
  };
}

/**
 * Strips any secret-tier record from an array before returning to the caller.
 * Double-safety guard even if the service layer somehow leaks one.
 */
function excludeSecrets(records: MemoryRecord[]): MemoryRecord[] {
  return records.filter((r) => r.sensitivity !== 'secret');
}

export async function handleQuery(
  service: MemoryService,
  input: QueryInput,
): Promise<MemoryRecord[]> {
  const filter = buildFilter(input);
  const records = await service.query(filter);
  return excludeSecrets(records);
}

export async function handleGet(
  service: MemoryService,
  input: GetInput,
): Promise<MemoryRecord | null> {
  if (input.id === undefined && input.hash === undefined) {
    throw new Error('Either id or hash must be provided');
  }

  let record: MemoryRecord | null = null;

  if (input.id !== undefined) {
    record = await service.getById(input.id);
  } else if (input.hash !== undefined) {
    record = await service.getByHash(input.hash);
  }

  if (record !== null && record.sensitivity === 'secret') {
    return null;
  }

  return record;
}

export async function handleListSources(
  service: MemoryService,
): Promise<SourceCount[]> {
  // Query all non-secret records and aggregate by source
  const records = await service.query({ limit: 10000 });
  const nonSecret = excludeSecrets(records);

  const counts = new Map<string, number>();
  for (const r of nonSecret) {
    counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

export async function handleStats(
  service: MemoryService,
): Promise<MemoryStats> {
  const records = await service.query({ limit: 100000 });
  const nonSecret = excludeSecrets(records);

  const bySource: Record<string, number> = {};
  const bySensitivity: Record<string, number> = {};

  for (const r of nonSecret) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    bySensitivity[r.sensitivity] = (bySensitivity[r.sensitivity] ?? 0) + 1;
  }

  return {
    total: nonSecret.length,
    bySource,
    bySensitivity,
  };
}

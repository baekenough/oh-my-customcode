/**
 * MemoryMcpServer — wraps MemoryService as an MCP server.
 *
 * Reads the SQLite DB path from OMCUSTOM_MEMORY_DB env var or
 * falls back to ~/.omcustom/memory.db.
 *
 * Exposed tools:
 *   memory.query        — filtered reads
 *   memory.get          — by id or hash
 *   memory.list_sources — source roster
 *   memory.stats        — aggregate stats
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createDb } from '@omcustom/eval-core';
import { MemoryService } from '@omcustom/eval-core/memory-service';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  handleGet,
  handleListSources,
  handleQuery,
  handleStats,
  type GetInput,
  type QueryInput,
} from './tools.js';

// ---------------------------------------------------------------------------
// Tool JSON Schemas
// ---------------------------------------------------------------------------

const TOOL_QUERY = {
  name: 'memory.query',
  description: 'Query memory records with optional filters. Secret-tier records are never returned.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        enum: ['native', 'claude-mem', 'episodic-memory', 'llm-memory'],
        description: 'Filter by memory source',
      },
      sensitivity: {
        type: 'string',
        enum: ['public', 'project', 'sensitive'],
        description: 'Filter by sensitivity tier (secret is never exposed)',
      },
      agent: { type: 'string', description: 'Filter by agent name' },
      project: { type: 'string', description: 'Filter by project path' },
      since: {
        type: 'string',
        description: 'ISO 8601 lower bound on timestamp (inclusive)',
      },
      until: {
        type: 'string',
        description: 'ISO 8601 upper bound on timestamp (inclusive)',
      },
      limit: {
        type: 'number',
        description: 'Maximum records to return (default: 100)',
      },
    },
    additionalProperties: false,
  },
};

const TOOL_GET = {
  name: 'memory.get',
  description:
    'Get a single memory record by id or hash. Returns null if not found or secret.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'Record UUID' },
      hash: { type: 'string', description: 'Record SHA-256 hash' },
    },
    additionalProperties: false,
  },
};

const TOOL_LIST_SOURCES = {
  name: 'memory.list_sources',
  description: 'List unique memory sources with record counts.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

const TOOL_STATS = {
  name: 'memory.stats',
  description: 'Get aggregate statistics over all non-secret memory records.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface MemoryMcpServerOptions {
  /** Override DB path (default: OMCUSTOM_MEMORY_DB env or ~/.omcustom/memory.db) */
  dbPath?: string;
}

export function createMemoryMcpServer(opts: MemoryMcpServerOptions = {}): Server {
  const dbPath =
    opts.dbPath ??
    process.env['OMCUSTOM_MEMORY_DB'] ??
    join(homedir(), '.omcustom', 'memory.db');

  const db = createDb(dbPath);
  const service = new MemoryService(db);

  const server = new Server(
    { name: 'memory-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [TOOL_QUERY, TOOL_GET, TOOL_LIST_SOURCES, TOOL_STATS],
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case 'memory.query': {
          const result = await handleQuery(service, input as QueryInput);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'memory.get': {
          const result = await handleGet(service, input as GetInput);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'memory.list_sources': {
          const result = await handleListSources(service);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'memory.stats': {
          const result = await handleStats(service);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

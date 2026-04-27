#!/usr/bin/env node
/**
 * Entry point for memory-mcp-server.
 *
 * Starts the MCP server on stdio transport so Claude Code (or any MCP
 * host) can connect via the standard stdio channel.
 *
 * DB path resolution order:
 *   1. OMCUSTOM_MEMORY_DB environment variable
 *   2. ~/.omcustom/memory.db  (default)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMemoryMcpServer } from './server.js';

const server = createMemoryMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);

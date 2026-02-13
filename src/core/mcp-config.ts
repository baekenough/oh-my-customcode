/**
 * MCP configuration generator for ontology-rag server
 */

import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists } from '../utils/fs.js';
import { getProviderLayout } from './layout.js';

interface MCPServerConfig {
  type: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Generate .mcp.json with ontology-rag server configuration
 * @param targetDir - Project root directory
 */
export async function generateMCPConfig(targetDir: string): Promise<void> {
  const layout = getProviderLayout();
  const mcpConfigPath = join(targetDir, '.mcp.json');
  const ontologyDir = join(layout.rootDir, 'ontology');

  // Only generate if ontology directory was installed
  const ontologyExists = await fileExists(join(targetDir, ontologyDir));
  if (!ontologyExists) {
    return;
  }

  const config: MCPConfig = {
    mcpServers: {
      'ontology-rag': {
        type: 'stdio',
        command: 'python',
        args: ['-m', 'ontology_rag.mcp_server'],
        env: {
          ONTOLOGY_DIR: ontologyDir,
        },
      },
    },
  };

  // If .mcp.json already exists, merge with existing config
  const existingConfigPath = mcpConfigPath;
  if (await fileExists(existingConfigPath)) {
    try {
      const { readFile } = await import('node:fs/promises');
      const existingContent = await readFile(existingConfigPath, 'utf-8');
      const existing = JSON.parse(existingContent) as MCPConfig;
      // Only add ontology-rag if not already configured
      if (!existing.mcpServers?.['ontology-rag']) {
        existing.mcpServers = existing.mcpServers || {};
        existing.mcpServers['ontology-rag'] = config.mcpServers['ontology-rag'];
        await writeFile(mcpConfigPath, `${JSON.stringify(existing, null, 2)}\n`);
      }
    } catch {
      // If existing file is invalid, write new config
      await writeFile(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    }
  } else {
    await writeFile(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  }
}

/**
 * Check if Python is available for MCP server
 * @returns True if Python 3.x is installed and accessible
 */
export async function checkPythonAvailable(): Promise<boolean> {
  try {
    // Note: No user input - safe to use execSync
    execSync('python --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

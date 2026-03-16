/**
 * MCP configuration generator for ontology-rag server
 */

import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileExists } from '../utils/fs.js';
import { info, warn } from '../utils/logger.js';
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

  // Check if uv is available
  // Note: No user input in command - safe to use execSync with fixed string
  try {
    execSync('uv --version', { stdio: 'pipe' });
  } catch {
    warn(
      'uv (Python package manager) not found. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh'
    );
    warn('Skipping ontology-rag MCP configuration. You can set it up manually later.');
    return;
  }

  // Create venv and install ontology-rag
  // Note: No user input in commands - safe to use execSync with fixed strings
  try {
    execSync('uv venv .venv', { cwd: targetDir, stdio: 'pipe' });
    execSync(
      'uv pip install "ontology-rag @ git+https://github.com/baekenough/oh-my-customcode.git#subdirectory=packages/ontology-rag"',
      { cwd: targetDir, stdio: 'pipe' }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warn(`Failed to setup ontology-rag: ${msg}`);
    warn(
      'You can configure the MCP server manually. See: https://github.com/baekenough/oh-my-customcode/tree/develop/packages/ontology-rag'
    );
    return;
  }

  const config: MCPConfig = {
    mcpServers: {
      'ontology-rag': {
        type: 'stdio',
        command: '.venv/bin/python',
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

  info('ontology-rag MCP server configured successfully');
}

/**
 * Check if uv is available for Python environment management
 * @returns True if uv is installed and accessible
 */
export async function checkUvAvailable(): Promise<boolean> {
  try {
    // Note: No user input - safe to use execSync
    execSync('uv --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

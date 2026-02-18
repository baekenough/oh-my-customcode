import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkUvAvailable, generateMCPConfig } from '../../../src/core/mcp-config.js';
import * as fsUtils from '../../../src/utils/fs.js';

const { fileExists } = fsUtils;

describe('mcp-config', () => {
  let tempDir: string;
  let execSyncSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-mcp-test-'));
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    execSyncSpy?.mockRestore();
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('checkUvAvailable', () => {
    it('should return true when uv is available', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      const result = await checkUvAvailable();

      expect(result).toBe(true);
      expect(execSyncSpy).toHaveBeenCalledWith('uv --version', { stdio: 'pipe' });
    });

    it('should return false when uv is not available', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('uv: command not found');
      });

      const result = await checkUvAvailable();

      expect(result).toBe(false);
    });

    it('should return false when execSync throws non-Error', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw 'Command failed';
      });

      const result = await checkUvAvailable();

      expect(result).toBe(false);
    });
  });

  describe('generateMCPConfig', () => {
    it('should skip generation when ontology directory does not exist', async () => {
      // No ontology directory created

      await generateMCPConfig(tempDir);

      // .mcp.json should not be created
      const mcpConfigPath = join(tempDir, '.mcp.json');
      expect(await fileExists(mcpConfigPath)).toBe(false);
    });

    it('should generate .mcp.json when ontology directory exists', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Mock execSync to avoid actual system calls
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Verify .mcp.json was created
      const mcpConfigPath = join(tempDir, '.mcp.json');
      expect(await fileExists(mcpConfigPath)).toBe(true);

      // Verify content
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['ontology-rag']).toBeDefined();
      expect(config.mcpServers['ontology-rag'].type).toBe('stdio');
      expect(config.mcpServers['ontology-rag'].command).toBe('.venv/bin/python');
      expect(config.mcpServers['ontology-rag'].args).toEqual(['-m', 'ontology_rag.mcp_server']);
      expect(config.mcpServers['ontology-rag'].env).toBeDefined();
      expect(config.mcpServers['ontology-rag'].env?.ONTOLOGY_DIR).toBe('.claude/ontology');
    });

    it('should call execSync to create venv and install ontology-rag', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      const execCalls: string[] = [];
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        execCalls.push(String(cmd));
        return Buffer.from('');
      });

      await generateMCPConfig(tempDir);

      expect(execCalls).toContain('uv venv .venv');
      expect(execCalls).toContain(
        'uv pip install "ontology-rag @ git+https://github.com/baekenough/oh-my-customcode.git#subdirectory=packages/ontology-rag"'
      );
    });

    it('should throw error if venv creation fails', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        if (String(cmd).includes('venv')) {
          throw new Error('Failed to create venv');
        }
        return Buffer.from('');
      });

      await expect(generateMCPConfig(tempDir)).rejects.toThrow(
        'Failed to setup Python environment'
      );
    });

    it('should throw error if ontology-rag installation fails', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
        if (String(cmd).includes('pip install')) {
          throw new Error('Failed to install package');
        }
        return Buffer.from('');
      });

      await expect(generateMCPConfig(tempDir)).rejects.toThrow(
        'Failed to setup Python environment'
      );
    });

    it('should handle non-Error exceptions during setup', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw 'Setup failed';
      });

      await expect(generateMCPConfig(tempDir)).rejects.toThrow(
        'Failed to setup Python environment'
      );
    });

    it('should merge with existing .mcp.json', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Create existing .mcp.json with other servers
      const mcpConfigPath = join(tempDir, '.mcp.json');
      const existingConfig = {
        mcpServers: {
          'other-server': {
            type: 'stdio',
            command: 'other-command',
            args: ['--arg'],
          },
        },
      };
      await writeFile(mcpConfigPath, JSON.stringify(existingConfig, null, 2));

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Verify merged content
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers['other-server']).toBeDefined();
      expect(config.mcpServers['ontology-rag']).toBeDefined();
    });

    it('should not overwrite existing ontology-rag configuration', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Create existing .mcp.json with ontology-rag already configured
      const mcpConfigPath = join(tempDir, '.mcp.json');
      const existingConfig = {
        mcpServers: {
          'ontology-rag': {
            type: 'stdio',
            command: 'custom-python',
            args: ['--custom'],
          },
        },
      };
      await writeFile(mcpConfigPath, JSON.stringify(existingConfig, null, 2));

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Verify existing config was preserved
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers['ontology-rag'].command).toBe('custom-python');
      expect(config.mcpServers['ontology-rag'].args).toEqual(['--custom']);
    });

    it('should handle invalid existing .mcp.json', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Create invalid .mcp.json
      const mcpConfigPath = join(tempDir, '.mcp.json');
      await writeFile(mcpConfigPath, '{ invalid json }');

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Should write new config
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers['ontology-rag']).toBeDefined();
    });

    it('should format .mcp.json with proper indentation', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Verify formatting
      const content = await readFile(join(tempDir, '.mcp.json'), 'utf-8');

      // Should be properly formatted with 2 spaces
      expect(content).toContain('  "mcpServers"');
      expect(content).toContain('    "ontology-rag"');
      // Should end with newline
      expect(content.endsWith('\n')).toBe(true);
    });

    it('should use correct ontology directory path in env', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      const content = await readFile(join(tempDir, '.mcp.json'), 'utf-8');
      const config = JSON.parse(content);

      // ONTOLOGY_DIR should be relative to project root
      expect(config.mcpServers['ontology-rag'].env.ONTOLOGY_DIR).toBe('.claude/ontology');
    });
  });

  describe('edge cases', () => {
    it('should handle empty existing mcpServers object', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Create existing .mcp.json with empty mcpServers
      const mcpConfigPath = join(tempDir, '.mcp.json');
      const existingConfig = {
        mcpServers: {},
      };
      await writeFile(mcpConfigPath, JSON.stringify(existingConfig, null, 2));

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Should add ontology-rag
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers['ontology-rag']).toBeDefined();
    });

    it('should handle existing .mcp.json without mcpServers property', async () => {
      // Create ontology directory
      const ontologyDir = join(tempDir, '.claude', 'ontology');
      await mkdir(ontologyDir, { recursive: true });

      // Create existing .mcp.json without mcpServers
      const mcpConfigPath = join(tempDir, '.mcp.json');
      const existingConfig = {
        otherProperty: 'value',
      };
      await writeFile(mcpConfigPath, JSON.stringify(existingConfig, null, 2));

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));

      await generateMCPConfig(tempDir);

      // Should add mcpServers with ontology-rag
      const content = await readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['ontology-rag']).toBeDefined();
    });
  });
});

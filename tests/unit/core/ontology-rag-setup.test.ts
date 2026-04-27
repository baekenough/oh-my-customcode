import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPython3,
  checkUvAvailableForSetup,
  createVenvWithPython3,
  createVenvWithUv,
  installOntologyRagEditable,
  parsePythonVersion,
  setupOntologyRag,
} from '../../../src/core/ontology-rag-setup.js';
import * as fsUtils from '../../../src/utils/fs.js';

describe('ontology-rag-setup', () => {
  let tempDir: string;
  let execSyncSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-ontology-setup-test-'));
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    execSyncSpy?.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // parsePythonVersion
  // ---------------------------------------------------------------------------
  describe('parsePythonVersion', () => {
    it('parses standard Python version output', () => {
      expect(parsePythonVersion('Python 3.12.3')).toEqual([3, 12]);
    });

    it('parses output with only major.minor', () => {
      expect(parsePythonVersion('Python 3.10')).toEqual([3, 10]);
    });

    it('is case-insensitive', () => {
      expect(parsePythonVersion('python 3.11.0')).toEqual([3, 11]);
    });

    it('returns null for unrecognised output', () => {
      expect(parsePythonVersion('not a version string')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parsePythonVersion('')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // checkPython3
  // ---------------------------------------------------------------------------
  describe('checkPython3', () => {
    it('returns available=true and versionOk=true for Python 3.12', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() =>
        Buffer.from('Python 3.12.0')
      );

      const result = checkPython3();

      expect(result.available).toBe(true);
      expect(result.versionOk).toBe(true);
      expect(result.version).toBe('3.12');
    });

    it('returns versionOk=true for Python 3.10 (minimum)', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() =>
        Buffer.from('Python 3.10.1')
      );

      const result = checkPython3();

      expect(result.versionOk).toBe(true);
      expect(result.version).toBe('3.10');
    });

    it('returns versionOk=false for Python 3.9 (below minimum)', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() =>
        Buffer.from('Python 3.9.7')
      );

      const result = checkPython3();

      expect(result.available).toBe(true);
      expect(result.versionOk).toBe(false);
      expect(result.version).toBe('3.9');
    });

    it('returns available=false when python3 command is not found', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('python3: command not found');
      });

      const result = checkPython3();

      expect(result.available).toBe(false);
      expect(result.versionOk).toBe(false);
      expect(result.version).toBe('');
    });

    it('returns versionOk=false when version output cannot be parsed', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() =>
        Buffer.from('something unexpected')
      );

      const result = checkPython3();

      expect(result.available).toBe(true);
      expect(result.versionOk).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // checkUvAvailableForSetup
  // ---------------------------------------------------------------------------
  describe('checkUvAvailableForSetup', () => {
    it('returns true when uv is installed', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      expect(checkUvAvailableForSetup()).toBe(true);
      expect(execSyncSpy).toHaveBeenCalledWith('uv --version', { stdio: 'pipe' });
    });

    it('returns false when uv is not installed', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('uv: command not found');
      });
      expect(checkUvAvailableForSetup()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // createVenvWithUv
  // ---------------------------------------------------------------------------
  describe('createVenvWithUv', () => {
    it('calls uv venv with --python 3.12 in targetDir', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      createVenvWithUv(tempDir);
      expect(execSyncSpy).toHaveBeenCalledWith('uv venv --python 3.12 .venv', {
        cwd: tempDir,
        stdio: 'pipe',
      });
    });

    it('propagates errors thrown by execSync', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('uv failed');
      });
      expect(() => createVenvWithUv(tempDir)).toThrow('uv failed');
    });
  });

  // ---------------------------------------------------------------------------
  // createVenvWithPython3
  // ---------------------------------------------------------------------------
  describe('createVenvWithPython3', () => {
    it('calls python3 -m venv .venv in targetDir', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      createVenvWithPython3(tempDir);
      expect(execSyncSpy).toHaveBeenCalledWith('python3 -m venv .venv', {
        cwd: tempDir,
        stdio: 'pipe',
      });
    });

    it('propagates errors thrown by execSync', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('venv failed');
      });
      expect(() => createVenvWithPython3(tempDir)).toThrow('venv failed');
    });
  });

  // ---------------------------------------------------------------------------
  // installOntologyRagEditable
  // ---------------------------------------------------------------------------
  describe('installOntologyRagEditable', () => {
    it('uses uv pip install when useUv=true', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      installOntologyRagEditable(tempDir, true);
      const call = String(execSyncSpy.mock.calls[0]?.[0] ?? '');
      expect(call).toContain('uv pip install');
      expect(call).toContain('--python .venv/bin/python');
      expect(call).toContain('packages/ontology-rag');
    });

    it('uses .venv/bin/pip when useUv=false', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      installOntologyRagEditable(tempDir, false);
      const call = String(execSyncSpy.mock.calls[0]?.[0] ?? '');
      expect(call).toContain('.venv/bin/pip install');
      expect(call).toContain('packages/ontology-rag');
    });

    it('uses editable install flag -e', () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      installOntologyRagEditable(tempDir, true);
      const call = String(execSyncSpy.mock.calls[0]?.[0] ?? '');
      expect(call).toContain(' -e ');
    });
  });

  // ---------------------------------------------------------------------------
  // setupOntologyRag (integration of all steps with mocked shell)
  // ---------------------------------------------------------------------------
  describe('setupOntologyRag', () => {
    /**
     * Helper: mock execSync to succeed for all calls and create .venv/bin/python.
     */
    async function setupHappyPath(): Promise<void> {
      const venvBin = join(tempDir, '.venv', 'bin');
      await mkdir(venvBin, { recursive: true });
      await writeFile(join(venvBin, 'python'), '#!/usr/bin/env python3\n');

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from(''));
      // Default python version mock: 3.12
      execSyncSpy.mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) return Buffer.from('Python 3.12.0');
        return Buffer.from('');
      });
    }

    it('returns success=true when all steps succeed', async () => {
      await setupHappyPath();

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(true);
      expect(result.statusLine).toBe('ontology-rag MCP: ready');
      expect(result.reason).toBeUndefined();
    });

    it('prints ready summary on success', async () => {
      await setupHappyPath();

      await setupOntologyRag(tempDir);

      expect(consoleLogSpy).toHaveBeenCalledWith('ontology-rag MCP: ready');
    });

    it('returns success=false with clear reason when python3 is not found', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) throw new Error('python3: not found');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('python3 not found');
      expect(result.reason).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('returns success=false with version message when python3 < 3.10', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) return Buffer.from('Python 3.9.0');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('3.9');
      expect(result.statusLine).toContain('3.10');
    });

    it('falls back to python3 -m venv when uv is absent', async () => {
      const venvBin = join(tempDir, '.venv', 'bin');
      await mkdir(venvBin, { recursive: true });
      await writeFile(join(venvBin, 'python'), '#!/usr/bin/env python3\n');

      const execCalls: string[] = [];
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        execCalls.push(cmdStr);
        if (cmdStr.includes('python3 --version')) return Buffer.from('Python 3.12.0');
        if (cmdStr.includes('uv --version')) throw new Error('uv: not found');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(true);
      expect(execCalls.some((c) => c.includes('python3 -m venv'))).toBe(true);
      expect(execCalls.some((c) => c.includes('uv venv'))).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to `python3 -m venv`')
      );
    });

    it('returns success=false when venv creation fails', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('python3 --version')) return Buffer.from('Python 3.12.0');
        if (cmdStr.includes('venv')) throw new Error('disk full');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('venv creation failed');
      expect(result.reason).toContain('disk full');
    });

    it('returns success=false when package install fails', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('python3 --version')) return Buffer.from('Python 3.12.0');
        if (cmdStr.includes('pip install')) throw new Error('package not found');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('install failed');
      expect(result.reason).toContain('package not found');
    });

    it('returns success=false when .venv/bin/python is missing post-install', async () => {
      // Do NOT create .venv/bin/python
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) return Buffer.from('Python 3.12.0');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('venv incomplete');
    });

    it('never throws — non-Error exceptions are handled gracefully', async () => {
      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) return Buffer.from('Python 3.12.0');
        if (String(cmd).includes('venv')) throw 'some string error';
        return Buffer.from('');
      });

      // Must not throw
      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('venv creation failed');
    });

    it('marks .mcp.json entry inactive (returns failure) when .venv/bin/python absent', async () => {
      // Simulates: install succeeded but python binary never appeared
      const fileExistsSpy = spyOn(fsUtils, 'fileExists').mockImplementation(
        async (path: string) => {
          if (path.includes('.venv/bin/python')) return false;
          return true;
        }
      );

      execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation((cmd: unknown) => {
        if (String(cmd).includes('python3 --version')) return Buffer.from('Python 3.12.0');
        return Buffer.from('');
      });

      const result = await setupOntologyRag(tempDir);

      expect(result.success).toBe(false);
      expect(result.statusLine).toContain('skipped');

      fileExistsSpy.mockRestore();
    });
  });
});

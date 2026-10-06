/** Installer Codex/domain/lockfile guarantees after RTK retirement. */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Capture the real modules before any mock.module call. bun's mock.module persists across
// test files (mock.restore() does not undo it), so without the afterAll re-registration
// below the mocks leak into later-ordered files that import these modules (#1772).
const realCodexInstaller = { ...(await import('../../../src/core/codex-installer.js')) };
const realLockfile = { ...(await import('../../../src/core/lockfile.js')) };

afterAll(() => {
  mock.module('../../../src/core/codex-installer.js', () => realCodexInstaller);
  mock.module('../../../src/core/lockfile.js', () => realLockfile);
});

describe('installer Codex paths and RTK retirement', () => {
  let tempDir: string;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-rtk-test-'));
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    mock.restore();
  });

  it('does not execute RTK probes or downloads during init', async () => {
    const installedProbe = mock(() => true);
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: installedProbe,
      installCodex: mock(() => {
        throw new Error('installed Codex must not be installed again');
      }),
      getCodexVersion: () => '1.0.0',
    }));
    const execSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('init must not execute RTK or download commands');
    });
    try {
      // Prove the interception is live without launching a binary, then observe init alone.
      expect(() => childProcess.execSync('rtk --version')).toThrow(
        'init must not execute RTK or download commands'
      );
      expect(execSpy).toHaveBeenCalledTimes(1);
      execSpy.mockClear();
      const { install } = await import('../../../src/core/installer.js');
      const result = await install({ targetDir: tempDir, skipConfirm: true });
      expect(result.success).toBe(true);
      expect(installedProbe).toHaveBeenCalledTimes(1);
      expect(execSpy).not.toHaveBeenCalled();
      expect(result.warnings.filter((warning) => /rtk/i.test(warning))).toEqual([]);
    } finally {
      execSpy.mockRestore();
    }
  });

  it('should add warning when Codex not installed and installCodex fails (lines 398-405)', async () => {
    // Mock codex-installer: Codex not installed, installation fails
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => false,
      installCodex: () => false,
      getCodexVersion: () => null,
    }));

    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes('Codex CLI installation failed'))).toBe(true);
  });

  it('should log success when Codex not installed but installCodex succeeds (lines 398-402)', async () => {
    // Mock codex-installer: Codex not installed, but installation succeeds
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => false,
      installCodex: () => true,
      getCodexVersion: () => null,
    }));

    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    // No Codex warning when install succeeds
    expect(result.warnings.some((w) => w.includes('Codex CLI installation failed'))).toBe(false);
  });

  it('should filter agents by domain when domain option is set (lines 608-613)', async () => {
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => true,
      installCodex: () => true,
      getCodexVersion: () => '1.0.0',
    }));

    const { install } = await import('../../../src/core/installer.js');

    // Install with domain filter — this exercises the agent domain filtering code path
    const result = await install({
      targetDir: tempDir,
      skipConfirm: true,
      components: ['agents'],
      domain: 'backend',
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    const agents = await readdir(join(tempDir, '.claude', 'agents'));
    expect(agents).toContain('be-express-expert.md');
    expect(agents).toContain('qa-planner.md');
    expect(agents).not.toContain('fe-vuejs-agent.md');
  });

  it('should add lockfile warning to result when lockfile generation fails (lines 458-459)', async () => {
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => true,
      installCodex: () => true,
      getCodexVersion: () => '1.0.0',
    }));
    // Mock lockfile module to return a warning, simulating lockfile generation failure
    mock.module('../../../src/core/lockfile.js', () => ({
      generateAndWriteLockfileForDir: async () => ({
        fileCount: 0,
        warning: 'Lockfile generation failed: Manifest read failed',
      }),
      readLockfile: async () => ({
        version: '1',
        generatorVersion: '0.0.0',
        templateVersion: '0.0.0',
        files: {},
      }),
      writeLockfile: async () => {},
      generateLockfile: async () => ({
        version: '1',
        generatorVersion: '0.0.0',
        templateVersion: '0.0.0',
        files: {},
      }),
      computeFileHash: async () => 'abc123',
    }));

    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    // The lockfile warning should be in result.warnings when generation fails
    expect(result.warnings.some((w) => w.includes('Lockfile generation failed'))).toBe(true);
  });
});

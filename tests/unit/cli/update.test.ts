import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initI18n } from '../../../src/i18n/index.js';

describe('update command', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  // Console spies
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = realpathSync(await mkdtemp(join(tmpdir(), 'omcustom-update-test-')));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize i18n for tests that assert on log content
    await initI18n('en');

    // Spy on process.exit
    originalExit = process.exit;
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      // Don't actually exit
    }) as typeof process.exit;

    // Spy on console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });

    // Restore process.exit
    process.exit = originalExit;

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Clear all mocks
    mock.restore();
  });

  describe('updateCommand with default options', () => {
    it('should call update with default parameters and print results', async () => {
      // Mock provider detection
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      // Mock update function
      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules', 'agents'],
        skippedComponents: ['skills'],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      // Import after mocks are set up
      const { updateCommand } = await import('../../../src/cli/update.js');

      // Execute
      await updateCommand({});

      // Verify update was called with correct options
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs).toBeDefined();
      expect(callArgs?.targetDir).toBe(tempDir);
      expect(callArgs?.components).toBeUndefined(); // No specific components = all
      expect(callArgs?.preserveCustomizations).toBe(true);

      // Verify output
      expect(consoleLogSpy).toHaveBeenCalled();

      // Verify no error exit
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand with dryRun option', () => {
    it('should show dry run header and not make changes', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: ['rules', 'agents', 'skills'],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.1.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ dryRun: true });

      // Verify update was called with dryRun
      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.dryRun).toBe(true);

      // Verify dry run header was printed
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('updateCommand with force option', () => {
    it('should pass force flag to update', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules', 'agents', 'skills'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ force: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.force).toBe(true);
    });
  });

  describe('updateCommand with backup option', () => {
    it('should pass backup flag and print backup paths', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: ['/path/to/backup'],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ backup: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.backup).toBe(true);

      // Verify backup path was printed
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('updateCommand with component filtering', () => {
    it('should update only agents when agents flag is set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['agents'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ agents: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toEqual(['agents']);
    });

    it('should update only skills when skills flag is set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['skills'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skills: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toEqual(['skills']);
    });

    it('should update multiple components when multiple flags are set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['agents', 'skills', 'rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ agents: true, skills: true, rules: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect((callArgs?.components as string[]).includes('agents')).toBe(true);
      expect((callArgs?.components as string[]).includes('skills')).toBe(true);
      expect((callArgs?.components as string[]).includes('rules')).toBe(true);
      expect((callArgs?.components as string[]).length).toBe(3);
    });

    it('should update only guides when guides flag is set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['guides'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ guides: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toEqual(['guides']);
    });

    it('should update only hooks when hooks flag is set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['hooks'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ hooks: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toEqual(['hooks']);
    });

    it('should update all components when no flags are set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toBeUndefined();
    });

    it('should update only contexts when contexts flag is set', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['contexts'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ contexts: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.components).toEqual(['contexts']);
    });
  });

  describe('updateCommand output formatting', () => {
    it('should print updated components', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules', 'agents'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // Verify console.log was called (for updated components)
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should print skipped components', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: ['rules', 'agents'],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.1.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should print preserved files count', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: ['/file1.md', '/file2.md'],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should print warnings', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: ['Warning 1', 'Warning 2'],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should print summary on success', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules', 'agents'],
        skippedComponents: ['skills'],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.2.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // Verify summary was printed
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('updateCommand --all flag', () => {
    it('should run batch update for all outdated projects', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
          {
            name: 'project-b',
            path: '/tmp/project-b',
            version: '0.45.0',
            installedAt: null,
            updatedAt: null,
            status: 'latest',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      // Only project-a (outdated) should be updated
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });

    it('should use result.previousVersion and result.newVersion as from/to, not stale project.version', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      // result.previousVersion intentionally differs from project.version to prove we read from result
      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.46.1', // what was actually in .omcustomrc.json
        newVersion: '0.47.0', // what was actually written to .omcustomrc.json
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0', // stale — intentionally differs from result.previousVersion
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(mockUpdate).toHaveBeenCalledTimes(1);

      // The logged "updated" line must contain result.previousVersion (0.46.1) and
      // result.newVersion (0.47.0), not the stale project.version (0.44.0).
      // i18n template: "  ✓ updated ({{from}} → {{to}})"
      const allLogs = consoleLogSpy.mock.calls.flat().join('\n');
      expect(allLogs).toContain('0.46.1');
      expect(allLogs).toContain('0.47.0');
      expect(exitCode).toBeUndefined();
    });

    it('should report no outdated projects when all are latest', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({})),
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.45.0',
            installedAt: null,
            updatedAt: null,
            status: 'latest',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });

    it('should report when no projects found', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({})),
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });

    it('should handle update failure for individual project in --all mode', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: false,
        updatedComponents: [],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.44.0',
        newVersion: '0.44.0',
        warnings: [],
        error: 'Permission denied',
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      // allDone message should still be printed
      expect(consoleLogSpy).toHaveBeenCalled();
      // Should NOT exit with error (batch mode continues)
      expect(exitCode).toBeUndefined();
    });

    it('should handle thrown exception for individual project in --all mode', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => {
          throw new Error('Network error');
        }),
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand interactive mode (TTY, no --all)', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
    });

    afterEach(() => {
      // Restore isTTY
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    it('should fall back to single-project update when only 1 project found', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      // Only 1 project → interactive mode skipped, falls back to single-project
      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'my-project',
            path: tempDir,
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // update called once (single project = cwd)
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });

    it('should not enter interactive mode when not a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // Single project update in non-TTY mode
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });

    it('should not enter interactive mode when dry-run is set', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: ['rules'],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ dryRun: true });

      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.dryRun).toBe(true);
      expect(exitCode).toBeUndefined();
    });

    it('should run interactive checkbox and update selected projects', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.44.0',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
          {
            name: 'project-b',
            path: '/tmp/project-b',
            version: '0.45.0',
            installedAt: null,
            updatedAt: null,
            status: 'latest',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      // Mock @inquirer/prompts checkbox to return project-a path
      mock.module('@inquirer/prompts', () => ({
        checkbox: mock(async () => ['/tmp/project-a']),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });

    it('should exit gracefully when no projects selected in interactive mode', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({})),
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
          {
            name: 'project-b',
            path: '/tmp/project-b',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      // Return empty selection
      mock.module('@inquirer/prompts', () => ({
        checkbox: mock(async () => []),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });

    it('should handle update failure in interactive mode gracefully', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => {
          throw new Error('Disk full');
        }),
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'project-a',
            path: '/tmp/project-a',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
          {
            name: 'project-b',
            path: '/tmp/project-b',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      mock.module('@inquirer/prompts', () => ({
        checkbox: mock(async () => ['/tmp/project-a']),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand CLI self-update notification', () => {
    it('should print info message when a newer CLI version is available', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.60.1',
        newVersion: '0.60.1',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');
      const { checkSelfUpdate: realCheckSelfUpdate } = await import(
        '../../../src/core/self-update.js'
      );

      // Stub: newer version available
      const stubbedCheck: typeof realCheckSelfUpdate = () => ({
        checked: true,
        updateAvailable: true,
        latestVersion: '0.99.0',
        usedCache: false,
      });

      await updateCommand({}, stubbedCheck);

      const allLogs = consoleLogSpy.mock.calls.flat().join('\n');
      expect(allLogs).toContain('0.99.0');
    });

    it('should not print info message when already on latest version', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.60.1',
        newVersion: '0.60.1',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');
      const { checkSelfUpdate: realCheckSelfUpdate } = await import(
        '../../../src/core/self-update.js'
      );

      const logsBeforeUpdate: string[] = [];
      consoleLogSpy.mockImplementation((msg: string) => {
        logsBeforeUpdate.push(msg as string);
      });

      // Stub: already on latest
      const stubbedCheck: typeof realCheckSelfUpdate = () => ({
        checked: true,
        updateAvailable: false,
        latestVersion: '0.60.1',
        usedCache: false,
      });

      await updateCommand({}, stubbedCheck);

      const allLogs = logsBeforeUpdate.join('\n');
      expect(allLogs).not.toContain('npm i -g oh-my-customcode');
    });

    it('should continue update normally when version check throws an error', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: ['rules'],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.60.0',
        newVersion: '0.60.1',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');
      const { checkSelfUpdate: realCheckSelfUpdate } = await import(
        '../../../src/core/self-update.js'
      );

      // Stub: throws (e.g., offline, npm timeout)
      const failingCheck: typeof realCheckSelfUpdate = () => {
        throw new Error('ENOTFOUND registry.npmjs.org');
      };

      // Should not throw — update continues
      await updateCommand({}, failingCheck);

      // The underlying project update still ran
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand error handling', () => {
    it('should exit with code 1 when update fails', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => ({
        success: false,
        updatedComponents: [],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.1.0',
        newVersion: '0.1.0',
        warnings: [],
        error: 'Update failed',
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should catch and handle exceptions', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => {
        throw new Error('Update exception');
      });

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      const mockUpdate = mock(async () => {
        throw 'String error';
      });

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      expect(exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});

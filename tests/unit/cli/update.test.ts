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

    it('should print namespace synced files when namespaceSynced is non-empty', async () => {
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
        namespaceSynced: ['agents/lang-foo.md', 'agents/lang-bar.md'],
        syncedRootFiles: [],
        removedDeprecatedFiles: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // Verify namespace synced output was printed (lines 313-318)
      expect(consoleLogSpy).toHaveBeenCalled();
      const allCalls = (consoleLogSpy.mock.calls as unknown[][]).map((c) => String(c[0]));
      expect(
        allCalls.some(
          (msg) => msg.includes('lang-foo') || msg.includes('lang-bar') || msg.includes('↻')
        )
      ).toBe(true);
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

  describe('updateCommand CLI self-update notification (--skip-self mode)', () => {
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

      // skipSelf=true so the fallback checkCliVersion path is used
      await updateCommand({ skipSelf: true }, stubbedCheck);

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

      await updateCommand({ skipSelf: true }, stubbedCheck);

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

      // Should not throw — update continues (skipSelf=true uses the checkCliVersion path)
      await updateCommand({ skipSelf: true }, failingCheck);

      // The underlying project update still ran
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand self-update integration', () => {
    it('should run self-update step before external updates by default', async () => {
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
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      // Mock executeSelfUpdate to return no-update (avoids actual npm install)
      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: () => ({ updated: false, fromVersion: '0.1.0', toVersion: '0.1.0' }),
        checkSelfUpdate: () => ({
          checked: false,
          updateAvailable: false,
          latestVersion: null,
          usedCache: false,
        }),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({});

      // External update should still run
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });

    it('should skip self-update step when --skip-self is set', async () => {
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
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      let selfUpdateCalled = false;
      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: () => {
          selfUpdateCalled = true;
          return { updated: false, fromVersion: '0.1.0', toVersion: '0.1.0' };
        },
        checkSelfUpdate: () => ({
          checked: false,
          updateAvailable: false,
          latestVersion: null,
          usedCache: false,
        }),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skipSelf: true });

      // executeSelfUpdate must NOT be called when --skip-self is set
      expect(selfUpdateCalled).toBe(false);
      // External update should still run
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });

    it('should not block external update when self-update throws', async () => {
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
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: () => {
          throw new Error('npm registry unavailable');
        },
        checkSelfUpdate: () => ({
          checked: false,
          updateAvailable: false,
          latestVersion: null,
          usedCache: false,
        }),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      // Should NOT throw — self-update failure is non-blocking
      await updateCommand({});

      // External update still ran despite self-update failure
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
      // Warning should be logged
      expect(consoleWarnSpy).toHaveBeenCalled();
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

  describe('updateCommand self-update re-exec (#860)', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let spawnSyncMock: ReturnType<typeof mock>;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Ensure re-exec guard is NOT set by default
      delete process.env.OMCUSTOM_SKIP_SELF_UPDATE;
    });

    afterEach(() => {
      // Restore env
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
    });

    it('should call spawnSync and exit when executeSelfUpdate returns updated=true and guard is not set', async () => {
      spawnSyncMock = mock(() => ({ status: 0, pid: 999 }));

      mock.module('node:child_process', () => ({
        spawnSync: spawnSyncMock,
      }));

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: true,
          fromVersion: '0.87.1',
          toVersion: '0.87.2',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.1',
          newVersion: '0.87.2',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skipSelf: false });

      // spawnSync must have been called with process.execPath and argv re-exec args
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      const callArgs = (spawnSyncMock.mock.calls as unknown[][])[0] as unknown[];
      expect(callArgs[0]).toBe(process.execPath);
      // Third argument is options — env should include the guard
      const spawnOptions = callArgs[2] as { env?: Record<string, string> };
      expect(spawnOptions.env?.OMCUSTOM_SKIP_SELF_UPDATE).toBe('true');

      // process.exit must have been called with child.status (0)
      expect(exitCode).toBe(0);
    });

    it('should NOT call spawnSync when OMCUSTOM_SKIP_SELF_UPDATE=true is set', async () => {
      process.env.OMCUSTOM_SKIP_SELF_UPDATE = 'true';

      spawnSyncMock = mock(() => ({ status: 0, pid: 999 }));

      mock.module('node:child_process', () => ({
        spawnSync: spawnSyncMock,
      }));

      // executeSelfUpdate itself short-circuits internally when the env guard is set,
      // so it returns updated=false — spawnSync must not be called
      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: false,
          fromVersion: '0.87.2',
          toVersion: '0.87.2',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.2',
          newVersion: '0.87.2',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skipSelf: false });

      expect(spawnSyncMock).not.toHaveBeenCalled();
      // Should not call process.exit (no re-exec)
      expect(exitCode).toBeUndefined();
    });

    it('should NOT call spawnSync when executeSelfUpdate returns updated=false', async () => {
      spawnSyncMock = mock(() => ({ status: 0, pid: 999 }));

      mock.module('node:child_process', () => ({
        spawnSync: spawnSyncMock,
      }));

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: false,
          fromVersion: '0.87.2',
          toVersion: '0.87.2',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.2',
          newVersion: '0.87.2',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skipSelf: false });

      expect(spawnSyncMock).not.toHaveBeenCalled();
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand --all calls cleanRegistry before findProjects (#928)', () => {
    it('should call cleanRegistry before scanning for projects', async () => {
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

      let cleanRegistryCalled = false;
      const callOrder: string[] = [];

      mock.module('../../../src/core/registry.js', () => ({
        cleanRegistry: async () => {
          cleanRegistryCalled = true;
          callOrder.push('cleanRegistry');
          return 0;
        },
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => {
          callOrder.push('findProjects');
          return [];
        },
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      expect(cleanRegistryCalled).toBe(true);
      // cleanRegistry must be called before findProjects so stale entries are
      // removed before project discovery builds the update list.
      expect(callOrder.indexOf('cleanRegistry')).toBeLessThan(callOrder.indexOf('findProjects'));
    });

    it('should not process deleted projects after cleanRegistry removes them', async () => {
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

      // Simulate cleanRegistry removing 1 stale entry
      mock.module('../../../src/core/registry.js', () => ({
        cleanRegistry: async () => 1,
      }));

      // findProjects returns only the surviving (non-deleted) project
      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'surviving-project',
            path: '/home/user/surviving-project',
            version: '0.44.0',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'registry',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      // Only the surviving project should be updated, not the deleted one
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(exitCode).toBeUndefined();
    });
  });

  describe('updateCommand --all with skippedSource (#860)', () => {
    it('should print skip message and not increment updatedCount when result.skippedSource is true', async () => {
      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: async () => ({
          provider: 'claude',
          source: 'override',
          confidence: 'high',
          reason: 'test',
        }),
      }));

      // One project returns skippedSource=true (the source project itself)
      const mockUpdate = mock(async () => ({
        success: true,
        skippedSource: true,
        updatedComponents: [],
        skippedComponents: [],
        preservedFiles: [],
        backedUpPaths: [],
        previousVersion: '0.87.1',
        newVersion: '0.87.1',
        warnings: ['Skipped: source project cannot update itself'],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      mock.module('../../../src/cli/projects.js', () => ({
        findProjects: async () => [
          {
            name: 'oh-my-customcode',
            path: '/tmp/oh-my-customcode',
            version: '0.87.1',
            installedAt: null,
            updatedAt: null,
            status: 'outdated',
            detectionMethod: 'lockfile',
          },
        ],
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      // update should have been called once
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      // The final summary must show 0 updated and 0 failed (skipped source doesn't count)
      const allLogs = (consoleLogSpy.mock.calls as unknown[][]).flat().join('\n');
      // "0 updated, 0 failed" in the allDone message
      expect(allLogs).toContain('0 updated');
      expect(allLogs).toContain('0 failed');

      // The skip message should have been printed
      expect(allLogs).toContain('oh-my-customcode');

      expect(exitCode).toBeUndefined();
    });
  });

  describe('exitWithChildStatus signal handling (#867)', () => {
    it('should exit 128+15 (143) when child terminated by SIGTERM (#867)', async () => {
      const spawnSyncMock = mock(() => ({
        status: null,
        signal: 'SIGTERM' as NodeJS.Signals,
        pid: 999,
      }));

      // Capture only the FIRST process.exit call. After exitWithChildStatus calls
      // process.exit(143), the mock returns (doesn't actually exit), and the
      // fallthrough path calls process.exit(null ?? 1). We record only the first.
      let firstExitCode: number | undefined;
      process.exit = ((code?: number) => {
        if (firstExitCode === undefined) firstExitCode = code ?? 0;
        exitCode = code ?? 0;
      }) as typeof process.exit;

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: true,
          fromVersion: '0.87.3',
          toVersion: '0.88.0',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.3',
          newVersion: '0.88.0',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({ skipSelf: false }, undefined, spawnSyncMock as never);

      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      expect(firstExitCode).toBe(143);
    });
  });

  describe('reexecUpdatedCli argv guard (#867)', () => {
    let originalArgv: string[];

    beforeEach(() => {
      originalArgv = process.argv;
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('should warn and skip re-exec when process.argv[1] is empty (#867)', async () => {
      process.argv = ['node'];

      const spawnSyncMock = mock(() => ({ status: 0, pid: 999, signal: null }));

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: true,
          fromVersion: '0.87.3',
          toVersion: '0.88.0',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.3',
          newVersion: '0.88.0',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({ skipSelf: false }, undefined, spawnSyncMock as never);

      expect(spawnSyncMock).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // D2: exit-code propagation and error swallowing (#863)
  //
  // These tests use injectable spawnFn to avoid mock.module('node:child_process')
  // leakage. They are placed LAST in the file so that any mock.module leakage
  // from this describe block does not affect the earlier tests.
  // Bun 1.3.x mock.restore() does not reliably undo module mocks for modules
  // that have already been cached via dynamic import.
  // ---------------------------------------------------------------------------
  // ⚠ DO NOT ADD TESTS BELOW THIS BLOCK ⚠
  // This describe block uses mock.module() patterns that leak across files
  // in Bun 1.3.x. Placing it as the LAST block in this file ensures no
  // downstream tests are affected. New tests in this file MUST be added
  // ABOVE this block, not below.
  // ---------------------------------------------------------------------------
  describe('reexecUpdatedCli exit-code and error swallowing (#863)', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let spawnSyncMock: ReturnType<typeof mock>;

    beforeEach(() => {
      originalEnv = { ...process.env };
      delete process.env.OMCUSTOM_SKIP_SELF_UPDATE;
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
    });

    it('should propagate non-zero child exit code via process.exit (#863)', async () => {
      // Use injectable spawnFn instead of mock.module('node:child_process') to
      // avoid leaking the replacement into other test files. Bun 1.3.x does not
      // reliably restore node: built-in module mocks via mock.restore().
      spawnSyncMock = mock(() => ({ status: 42, pid: 999, signal: null }));

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: true,
          fromVersion: '0.87.2',
          toVersion: '0.87.3',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.2',
          newVersion: '0.87.3',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ skipSelf: false }, undefined, spawnSyncMock as never);

      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      expect(exitCode).toBe(42);
    });

    it('should catch spawnSync thrown errors in outer try/catch and warn (#863)', async () => {
      // Use injectable spawnFn instead of mock.module('node:child_process') to
      // avoid leaking the replacement into other test files. Bun 1.3.x does not
      // reliably restore node: built-in module mocks via mock.restore().
      spawnSyncMock = mock(() => {
        throw new Error('spawn EACCES');
      });

      mock.module('../../../src/core/self-update.js', () => ({
        executeSelfUpdate: mock(() => ({
          updated: true,
          fromVersion: '0.87.2',
          toVersion: '0.87.3',
        })),
        checkSelfUpdate: mock(() => ({ updateAvailable: false })),
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mock(async () => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.87.2',
          newVersion: '0.87.3',
          warnings: [],
        })),
      }));

      const { updateCommand } = await import('../../../src/cli/update.js');

      // Must NOT throw — outer try/catch in handleSelfUpdate must swallow
      await updateCommand({ skipSelf: false }, undefined, spawnSyncMock as never);

      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
// END OF FILE — see warning above. Do not add tests below this point.

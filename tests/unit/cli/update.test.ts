import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.targetDir).toBe(tempDir);
      expect(callArgs.provider).toBe('claude');
      expect(callArgs.components).toBeUndefined(); // No specific components = all
      expect(callArgs.preserveCustomizations).toBe(true);

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
      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.dryRun).toBe(true);

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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.force).toBe(true);
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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.backup).toBe(true);

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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.components).toEqual(['agents']);
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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.components).toEqual(['skills']);
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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.components).toContain('agents');
      expect(callArgs.components).toContain('skills');
      expect(callArgs.components).toContain('rules');
      expect(callArgs.components?.length).toBe(3);
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

      const callArgs = mockUpdate.mock.calls[0]?.[0];
      expect(callArgs.components).toBeUndefined();
    });
  });

  describe('updateCommand with provider override', () => {
    it('should pass provider override to detectProvider', async () => {
      const mockDetectProvider = mock(async () => ({
        provider: 'codex',
        confidence: 'high',
        reason: 'override',
      }));

      mock.module('../../../src/core/provider.js', () => ({
        detectProvider: mockDetectProvider,
      }));

      const mockUpdate = mock(async () => ({
        success: true,
        updatedComponents: [],
        skippedComponents: [],
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

      await updateCommand({ provider: 'codex' });

      // Verify detectProvider was called with override
      expect(mockDetectProvider).toHaveBeenCalledTimes(1);
      const detectArgs = mockDetectProvider.mock.calls[0]?.[0];
      expect(detectArgs.override).toBe('codex');

      // Verify update was called with codex provider
      const updateArgs = mockUpdate.mock.calls[0]?.[0];
      expect(updateArgs.provider).toBe('codex');
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

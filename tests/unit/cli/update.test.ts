import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initI18n } from '../../../src/i18n/index.js';

// 모킹 전에 실제 모듈을 캡처해 둡니다. bun의 mock.module은 파일 경계를 넘어 유지되며
// (mock.restore()로 복원되지 않음) 복원하지 않으면 뒤따르는 테스트 파일(self-update 계열 등)이
// 이 파일의 스텁을 import하게 됩니다. 아래 afterAll에서 원본으로 다시 덮어써 누수를 막습니다 (#1761).
// 이 캡처는 파일 최상단에서 한 번만 수행되므로 각 테스트의 모킹 동작에는 영향을 주지 않습니다.
const realProjects = { ...(await import('../../../src/cli/projects.js')) };
const realProvider = { ...(await import('../../../src/core/provider.js')) };
const realRegistry = { ...(await import('../../../src/core/registry.js')) };
const realSelfUpdate = { ...(await import('../../../src/core/self-update.js')) };
const realUpdater = { ...(await import('../../../src/core/updater.js')) };
const realInquirerPrompts = { ...(await import('@inquirer/prompts')) };

// 이 파일 종료 시 mock.module로 교체한 모든 대상을 원본으로 복원합니다 (#1761).
afterAll(() => {
  mock.module('../../../src/cli/projects.js', () => realProjects);
  mock.module('../../../src/core/provider.js', () => realProvider);
  mock.module('../../../src/core/registry.js', () => realRegistry);
  mock.module('../../../src/core/self-update.js', () => realSelfUpdate);
  mock.module('../../../src/core/updater.js', () => realUpdater);
  mock.module('@inquirer/prompts', () => realInquirerPrompts);
});

describe('update command', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  // Console spies
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  // Saved value for OMCUSTOM_SKIP_SELF_UPDATE so we can restore it in afterEach.
  // Set to 'true' in beforeEach so that tests which call updateCommand({}) without
  // skipSelf do not trigger an actual self-update (which depends on ambient
  // process.env.CI and causes 13-test failures when rtk-installer.test.ts deletes
  // CI from the environment, letting handleSelfUpdate → autoSelfUpdate run and
  // call process.exit on a 1.0.0 major-bump version).
  let savedSkipSelfUpdate: string | undefined;

  // Registry isolation (#1793): updateCommand({ all: true }) runs the real cleanRegistry(),
  // which prunes and rewrites ~/.oh-my-customcode/projects.json. Every test therefore runs
  // with HOME and the registry directory redirected into the per-test temp dir.
  let originalHome: string | undefined;
  let homeDir: string;

  beforeEach(async () => {
    tempDir = realpathSync(await mkdtemp(join(tmpdir(), 'omcustom-update-test-')));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    originalHome = process.env.HOME;
    homeDir = join(tempDir, 'home');
    const isolatedRegistryDir = join(homeDir, '.oh-my-customcode');
    await mkdir(isolatedRegistryDir, { recursive: true });
    await writeFile(join(isolatedRegistryDir, 'projects.json'), '{"projects":{}}', 'utf-8');
    process.env.HOME = homeDir;
    realRegistry._setRegistryDirForTesting(isolatedRegistryDir);

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

    // Ensure self-update is deterministically skipped for tests that call
    // updateCommand({}) without a skipSelf flag or a self-update.js mock.
    // Tests that exercise the self-update path manage this env var themselves
    // via their own beforeEach (which runs after this one and overrides it).
    savedSkipSelfUpdate = process.env.OMCUSTOM_SKIP_SELF_UPDATE;
    process.env.OMCUSTOM_SKIP_SELF_UPDATE = 'true';
  });

  afterEach(async () => {
    // Registry isolation must be undone before anything else can throw (#1793).
    realRegistry._setRegistryDirForTesting(undefined);
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });

    // Restore process.exit
    process.exit = originalExit;

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Restore OMCUSTOM_SKIP_SELF_UPDATE to whatever it was before this test suite
    if (savedSkipSelfUpdate !== undefined) {
      process.env.OMCUSTOM_SKIP_SELF_UPDATE = savedSkipSelfUpdate;
    } else {
      delete process.env.OMCUSTOM_SKIP_SELF_UPDATE;
    }

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

    for (const dryRun of [false, true]) {
      it(`prints each project's orphan retirement with --all${dryRun ? ' --dry-run' : ''} (#1935)`, async () => {
        mock.module('../../../src/core/provider.js', () => ({
          detectProvider: async () => ({
            provider: 'claude',
            source: 'override',
            confidence: 'high',
            reason: 'test',
          }),
        }));
        const mockUpdate = mock(async (options: { targetDir: string; dryRun?: boolean }) => ({
          success: true,
          updatedComponents: [],
          skippedComponents: [],
          preservedFiles: [],
          backedUpPaths: [],
          previousVersion: '0.46.1',
          newVersion: '0.47.0',
          warnings: ['not printed in batch mode'],
          orphanRetirement: {
            removed: options.dryRun ? [] : [`${options.targetDir}/removed.md`],
            wouldRemove: options.dryRun ? [`${options.targetDir}/removed.md`] : [],
            preserved: [{ path: `${options.targetDir}/kept.md`, reason: 'user-modified file' }],
            ...(options.dryRun
              ? {}
              : { backupDir: `${options.targetDir}/.omcustom-backup-t/retired` }),
          },
        }));
        mock.module('../../../src/core/updater.js', () => ({ update: mockUpdate }));
        const project = (name: string) => ({
          name,
          path: name,
          version: '0.44.0',
          installedAt: null,
          updatedAt: null,
          status: 'outdated',
          detectionMethod: 'lockfile',
        });
        mock.module('../../../src/cli/projects.js', () => ({
          findProjects: async () => [project('a'), project('b')],
        }));

        const { updateCommand } = await import('../../../src/cli/update.js');
        await updateCommand({ all: true, dryRun });

        const logs = consoleLogSpy.mock.calls.map((call: unknown[]) => String(call[0]));
        const heading = (name: string): string =>
          dryRun
            ? 'Would move 1 file(s) that oh-my-customcode no longer ships to a backup (.omcustom-backup-<timestamp>/retired):'
            : `Moved 1 file(s) that oh-my-customcode no longer ships to a backup: ${name}/.omcustom-backup-t/retired`;
        for (const name of ['a', 'b']) {
          expect(logs).toContain(heading(name));
          expect(logs).toContain(`  - ${name}/removed.md`);
          expect(logs).toContain(`  - ${name}/kept.md (user-modified file)`);
        }
        expect(exitCode).toBeUndefined();
      });
    }

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

    describe('current directory already at the latest version (#1939)', () => {
      function setupInteractive(
        statusOfCwd: 'latest' | 'outdated',
        selected: string[],
        updateImpl?: (opts: { targetDir: string }) => Promise<unknown>
      ) {
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
        const mockUpdate = mock(
          updateImpl ??
            (async (_opts: { targetDir: string }) => ({
              success: true,
              updatedComponents: [],
              skippedComponents: [],
              preservedFiles: [],
              backedUpPaths: [],
              previousVersion: '0.45.0',
              newVersion: '0.45.0',
              warnings: [],
            }))
        );
        mock.module('../../../src/core/updater.js', () => ({ update: mockUpdate }));
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
              name: 'cwd-project',
              path: tempDir,
              version: '0.45.0',
              installedAt: null,
              updatedAt: null,
              status: statusOfCwd,
              detectionMethod: 'lockfile',
            },
          ],
        }));
        mock.module('@inquirer/prompts', () => ({ checkbox: mock(async () => selected) }));
        return mockUpdate;
      }

      const targets = (m: { mock: { calls: unknown[][] } }): string[] =>
        m.mock.calls.map((call) => (call[0] as { targetDir: string }).targetDir);

      it('also updates the current directory after the selected projects', async () => {
        const mockUpdate = setupInteractive('latest', ['/tmp/project-a']);

        const { updateCommand } = await import('../../../src/cli/update.js');
        await updateCommand({});

        expect(targets(mockUpdate)).toEqual(['/tmp/project-a', tempDir]);
      });

      it('updates the current directory even when nothing is selected', async () => {
        const mockUpdate = setupInteractive('latest', []);

        const { updateCommand } = await import('../../../src/cli/update.js');
        await updateCommand({});

        expect(targets(mockUpdate)).toEqual([tempDir]);
      });

      it('negative: leaves an outdated current directory alone unless it is selected', async () => {
        const mockUpdate = setupInteractive('outdated', ['/tmp/project-a']);

        const { updateCommand } = await import('../../../src/cli/update.js');
        await updateCommand({});

        expect(targets(mockUpdate)).toEqual(['/tmp/project-a']);
      });

      it('negative: does not touch the current directory when it is not a registered project', async () => {
        const mockUpdate = setupInteractive('latest', ['/tmp/project-a']);
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
        await updateCommand({});

        expect(targets(mockUpdate)).toEqual(['/tmp/project-a']);
      });

      it('reports a failing current-directory update without aborting', async () => {
        setupInteractive('latest', [], async () => {
          throw new Error('Disk full');
        });

        const { updateCommand } = await import('../../../src/cli/update.js');
        await updateCommand({});

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(exitCode).toBeUndefined();
      });
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

      // Mock autoSelfUpdate to return up-to-date (avoids actual npm install)
      mock.module('../../../src/core/self-update.js', () => ({
        autoSelfUpdate: () => 'up-to-date',
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
        autoSelfUpdate: () => {
          selfUpdateCalled = true;
          return 'up-to-date';
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

      // autoSelfUpdate must NOT be called when --skip-self is set
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
        autoSelfUpdate: () => {
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

  /**
   * Self-update seams for updateCommand's third argument (#1946): the real autoSelfUpdate runs with
   * injected npm lookup, install, spawn and exit, so no CLI is installed or re-executed.
   */
  function selfUpdateSeams(
    options: {
      latest?: string;
      binaryVersion?: string | null;
      extra?: Record<string, unknown>;
    } = {}
  ) {
    const entry = '/fake/lib/node_modules/oh-my-customcode/dist/cli/index.js';
    const exits: number[] = [];
    const fetchLatest = mock(() => options.latest ?? '1.5.0');
    const install = mock((_name: string, _version: string) => {});
    const spawn = mock((_cmd: string, _args: string[], _opts: unknown) => ({
      status: 0 as number | null,
      signal: null as NodeJS.Signals | null,
    }));
    const binaryVersion = options.binaryVersion === undefined ? '1.5.0' : options.binaryVersion;
    return {
      entry,
      exits,
      fetchLatest,
      install,
      spawn,
      overrides: {
        currentVersion: '1.0.0',
        cachePath: join(tempDir, 'self-update-cache.json'),
        argv: ['node', entry, 'update'],
        env: {} as NodeJS.ProcessEnv,
        fetchLatestVersion: fetchLatest,
        deps: {
          installFn: install,
          spawnFn: spawn,
          exitFn: (code: number) => {
            exits.push(code);
          },
          realpathFn: (path: string) => path,
          globalRootFn: () => '/fake/lib/node_modules',
          probeFn: () => options.latest ?? '1.5.0',
          readFileFn: () => {
            if (binaryVersion === null) throw new Error('ENOENT');
            return JSON.stringify({ name: 'oh-my-customcode', version: binaryVersion });
          },
        },
        ...options.extra,
      },
    };
  }

  function mockOkUpdater() {
    const mockUpdate = mock(async () => ({
      success: true,
      updatedComponents: [],
      skippedComponents: [],
      preservedFiles: [],
      backedUpPaths: [],
      previousVersion: '1.0.0',
      newVersion: '1.5.0',
      warnings: [],
    }));
    mock.module('../../../src/core/updater.js', () => ({ update: mockUpdate }));
    return mockUpdate;
  }

  describe('updateCommand self-update re-exec (#860, #1946)', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // The real autoSelfUpdate runs here; the earlier tests in this file replace the module
      mock.module('../../../src/core/self-update.js', () => realSelfUpdate);
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, originalEnv);
    });

    it('installs the latest CLI, verifies the binary and re-runs update on it', async () => {
      const seams = selfUpdateSeams();
      mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.install).toHaveBeenCalledWith('oh-my-customcode', '1.5.0');
      expect(seams.spawn).toHaveBeenCalledTimes(1);
      const [command, args, spawnOptions] = seams.spawn.mock.calls[0] as [
        string,
        string[],
        { env: Record<string, string> },
      ];
      expect(command).toBe(process.execPath);
      expect(args).toEqual([seams.entry, 'update']);
      expect(spawnOptions.env.OMCUSTOM_SKIP_SELF_UPDATE).toBe('true');
      expect(seams.exits).toEqual([0]);
    });

    it('skips self-update entirely under --dry-run and says so', async () => {
      const seams = selfUpdateSeams();
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({ dryRun: true }, undefined, seams.overrides);

      expect(seams.fetchLatest).not.toHaveBeenCalled();
      expect(seams.install).not.toHaveBeenCalled();
      expect(seams.spawn).not.toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('--dry-run');
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('negative: a normal run (no --dry-run) queries npm', async () => {
      const seams = selfUpdateSeams();
      mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.fetchLatest).toHaveBeenCalledTimes(1);
    });

    it('exits with a non-zero child exit code', async () => {
      const seams = selfUpdateSeams();
      seams.spawn.mockImplementation(() => ({ status: 42, signal: null }));
      mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.exits).toEqual([42]);
    });

    it('does not query npm or re-run when OMCUSTOM_SKIP_SELF_UPDATE=true', async () => {
      const seams = selfUpdateSeams({ extra: { env: { OMCUSTOM_SKIP_SELF_UPDATE: 'true' } } });
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.fetchLatest).not.toHaveBeenCalled();
      expect(seams.spawn).not.toHaveBeenCalled();
      expect(seams.exits).toEqual([]);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not install or re-run when npm reports the current version', async () => {
      const seams = selfUpdateSeams({ latest: '1.0.0' });
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.fetchLatest).toHaveBeenCalledTimes(1);
      expect(seams.install).not.toHaveBeenCalled();
      expect(seams.spawn).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('continues with the current version when the binary cannot be verified', async () => {
      const seams = selfUpdateSeams({ binaryVersion: '1.0.0' });
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.install).toHaveBeenCalledTimes(1);
      expect(seams.spawn).not.toHaveBeenCalled();
      expect(seams.exits).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('continues with the update when the install fails', async () => {
      const seams = selfUpdateSeams();
      seams.install.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.spawn).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('catches a spawn that throws and still runs the update (#863)', async () => {
      const seams = selfUpdateSeams();
      seams.spawn.mockImplementation(() => {
        throw new Error('spawn EACCES');
      });
      const mockUpdate = mockOkUpdater();

      const { updateCommand } = await import('../../../src/cli/update.js');
      await updateCommand({}, undefined, seams.overrides);

      expect(seams.spawn).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
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

  describe('updateCommand --all registry isolation (#1793)', () => {
    it('should prune only the registry in the isolated dir and never touch the HOME registry', async () => {
      // Earlier tests in this file leave cleanRegistry/findProjects stubs installed
      // (mock.module persists), so re-install the real modules with literal specs first.
      mock.module('../../../src/core/registry.js', () => realRegistry);
      mock.module('../../../src/cli/projects.js', () => realProjects);

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
        previousVersion: '0.0.1',
        newVersion: '0.45.0',
        warnings: [],
      }));

      mock.module('../../../src/core/updater.js', () => ({
        update: mockUpdate,
      }));

      const livePath = join(homeDir, 'live-project');
      const stalePath = join(homeDir, 'stale-project-never-created');
      await mkdir(livePath, { recursive: true });

      const entry = {
        version: '0.0.1',
        installedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      // Isolated registry: one live entry and one stale entry (path never created).
      const isolatedDir = join(tempDir, 'isolated-registry');
      const isolatedFile = join(isolatedDir, 'projects.json');
      await mkdir(isolatedDir, { recursive: true });
      await writeFile(
        isolatedFile,
        JSON.stringify({ projects: { [livePath]: entry, [stalePath]: entry } }),
        'utf-8'
      );
      realRegistry._setRegistryDirForTesting(isolatedDir);

      // Decoy: the HOME-derived registry with its own stale entry. It must survive untouched.
      const decoyFile = join(homeDir, '.oh-my-customcode', 'projects.json');
      await writeFile(
        decoyFile,
        JSON.stringify({ projects: { [join(homeDir, 'decoy-stale-project')]: entry } }),
        'utf-8'
      );
      const decoyBefore = await readFile(decoyFile);

      const { updateCommand } = await import('../../../src/cli/update.js');

      await updateCommand({ all: true });

      const isolatedAfter = JSON.parse(await readFile(isolatedFile, 'utf-8')) as {
        projects: Record<string, unknown>;
      };
      expect(Object.keys(isolatedAfter.projects)).toEqual([livePath]);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const callArgs = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(callArgs?.targetDir).toBe(livePath);

      const decoyAfter = await readFile(decoyFile);
      expect(decoyAfter.equals(decoyBefore)).toBe(true);
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
});

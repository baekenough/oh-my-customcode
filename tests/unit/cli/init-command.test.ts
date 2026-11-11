/**
 * Unit tests for initCommand: the Agent Teams option passed to the installer (#1934) and the
 * CLI version in the init banner. The installer and the project registry are replaced so no
 * template copy, Codex install or HOME registry write happens; the originals are re-registered
 * in afterAll so the mocks do not leak into other test files (#1772).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../../../package.json';
import type { InstallOptions, InstallResult } from '../../../src/core/installer.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

const realInstaller = { ...(await import('../../../src/core/installer.js')) };
const realRegistry = { ...(await import('../../../src/core/registry.js')) };
const realClack = { ...(await import('@clack/prompts')) };

const installMock = mock(
  async (options: InstallOptions): Promise<InstallResult> => ({
    success: true,
    installedPath: options.targetDir,
    installedComponents: [],
    skippedComponents: [],
    backedUpPaths: [],
    warnings: [],
  })
);

const registerProjectMock = mock(async (_path: string, _version: string): Promise<void> => {});

// The wizard prompts read the real TTY; replace them with scripted answers.
const CANCEL = Symbol('test-cancel');
let selectAnswers: unknown[] = [];
let confirmAnswers: unknown[] = [];
const selectMock = mock(async (_opts: unknown) => selectAnswers.shift());
const confirmMock = mock(async (_opts: unknown) => confirmAnswers.shift());

mock.module('../../../src/core/installer.js', () => ({ ...realInstaller, install: installMock }));
mock.module('../../../src/core/registry.js', () => ({
  ...realRegistry,
  registerProject: registerProjectMock,
}));
mock.module('@clack/prompts', () => ({
  ...realClack,
  intro: mock(() => {}),
  outro: mock(() => {}),
  select: selectMock,
  confirm: confirmMock,
  isCancel: (value: unknown) => value === CANCEL,
}));

afterAll(() => {
  mock.module('../../../src/core/installer.js', () => realInstaller);
  mock.module('../../../src/core/registry.js', () => realRegistry);
  mock.module('@clack/prompts', () => realClack);
});

const { checkExistingInstallation, initCommand, initFromSnapshot } = await import(
  '../../../src/cli/init.js'
);

describe('initCommand', () => {
  let tempDir: string;
  let cwdSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-init-command-test-'));
    cwdSpy = spyOn(process, 'cwd').mockReturnValue(tempDir);
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    installMock.mockClear();
    registerProjectMock.mockClear();
    selectMock.mockClear();
    confirmMock.mockClear();
    selectAnswers = [];
    confirmAnswers = [];
    await initI18n('en');
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    await i18n.changeLanguage('en');
    await rm(tempDir, { recursive: true, force: true });
  });

  function logged(): string[] {
    return logSpy.mock.calls.map((call: unknown[]) => String(call[0]));
  }

  function installArg(): InstallOptions {
    expect(installMock).toHaveBeenCalledTimes(1);
    return installMock.mock.calls[0]?.[0] as InstallOptions;
  }

  describe('Agent Teams option (#1934)', () => {
    it('enables agentTeams when the option is omitted', async () => {
      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(true);
      expect(installArg().agentTeams).toBe(true);
    });

    it('enables agentTeams when the option is true (commander default)', async () => {
      await initCommand({ yes: true, lang: 'en', agentTeams: true });

      expect(installArg().agentTeams).toBe(true);
    });

    it('passes agentTeams: false for --no-agent-teams', async () => {
      await initCommand({ yes: true, lang: 'en', agentTeams: false });

      expect(installArg().agentTeams).toBe(false);
    });

    it('does not use the installer for --from-snapshot', async () => {
      const result = await initCommand({
        yes: true,
        fromSnapshot: join(tempDir, 'missing-snapshot'),
      });

      expect(result.success).toBe(false);
      expect(installMock).not.toHaveBeenCalled();
    });
  });

  describe('init banner version (A3)', () => {
    it('shows the CLI version in English', async () => {
      await initCommand({ yes: true, lang: 'en' });

      expect(logged()).toContain(`Initializing oh-my-customcode v${packageJson.version}...`);
    });

    it('shows the CLI version in Korean', async () => {
      await i18n.changeLanguage('ko');

      await initCommand({ yes: true, lang: 'ko' });

      expect(logged()).toContain(`oh-my-customcode v${packageJson.version} 초기화 중...`);
    });
  });
  describe('install result handling', () => {
    it('reports the installed and skipped components', async () => {
      installMock.mockImplementationOnce(async (options: InstallOptions) => ({
        success: true,
        installedPath: options.targetDir,
        installedComponents: ['entry-md', 'rules', 'guides'],
        skippedComponents: ['agents'],
        backedUpPaths: [],
        warnings: ['something to look at'],
      }));

      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(true);
      expect(result.installedPaths).toEqual([
        join(tempDir, 'CLAUDE.md'),
        join(tempDir, '.claude', 'rules'),
        join(tempDir, 'guides'),
      ]);
      expect(logged()).toContain('  - agents');
      expect(warnSpy.mock.calls.map((c: unknown[]) => String(c[0]))).toContain(
        'Warning: something to look at'
      );
    });

    it('lists the paths that were backed up', async () => {
      installMock.mockImplementationOnce(async (options: InstallOptions) => ({
        success: true,
        installedPath: options.targetDir,
        installedComponents: [],
        skippedComponents: [],
        backedUpPaths: ['/backups/claude-1', '/backups/claude-2'],
        warnings: [],
      }));

      await initCommand({ yes: true, lang: 'en' });

      expect(logged()).toContain('Backed up existing installation to: /backups/claude-1');
      expect(logged()).toContain('Backed up existing installation to: /backups/claude-2');
    });

    it('announces the backup when a .claude directory already exists', async () => {
      await mkdir(join(tempDir, '.claude'));

      await initCommand({ yes: true, lang: 'en' });

      expect(logged()).toContain('Creating backup...');
      expect(installArg().backup).toBe(true);
    });

    it('returns a failure result when the installer reports failure', async () => {
      installMock.mockImplementationOnce(async (options: InstallOptions) => ({
        success: false,
        installedPath: options.targetDir,
        installedComponents: [],
        skippedComponents: [],
        backedUpPaths: [],
        warnings: [],
        error: 'disk full',
      }));

      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['disk full']);
    });

    it('returns a failure result when the installer throws', async () => {
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      installMock.mockImplementationOnce(async () => {
        throw new Error('boom');
      });

      const result = await initCommand({ yes: true, lang: 'en' });
      errorSpy.mockRestore();

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['boom']);
    });
  });

  describe('interactive wizard', () => {
    const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    let originalCI: string | undefined;
    let originalGithubActions: string | undefined;

    beforeEach(() => {
      originalCI = process.env.CI;
      originalGithubActions = process.env.GITHUB_ACTIONS;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
      if (originalGithubActions === undefined) {
        delete process.env.GITHUB_ACTIONS;
      } else {
        process.env.GITHUB_ACTIONS = originalGithubActions;
      }
      if (originalIsTTY) {
        Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
      } else {
        delete (process.stdout as { isTTY?: boolean }).isTTY;
      }
    });

    it('installs with the language and domain chosen in the wizard', async () => {
      selectAnswers = ['ko', 'backend'];
      confirmAnswers = [false];

      const result = await initCommand({});

      expect(result.success).toBe(true);
      expect(installArg().language).toBe('ko');
      expect(installArg().domain).toBe('backend');
    });

    it('installs every domain when the wizard answer is "all"', async () => {
      selectAnswers = ['en', 'all'];
      confirmAnswers = [false];

      await initCommand({});

      expect(installArg().language).toBe('en');
      expect(installArg().domain).toBeUndefined();
    });

    it('returns a failure result and installs nothing when the wizard is cancelled', async () => {
      selectAnswers = [CANCEL];

      const result = await initCommand({});

      expect(result).toEqual({ success: false, message: 'Setup cancelled.' });
      expect(installMock).not.toHaveBeenCalled();
      expect(logged()).not.toContain(`Initializing oh-my-customcode v${packageJson.version}...`);
    });

    it('does not prompt when --yes is given', async () => {
      await initCommand({ yes: true, lang: 'ko', domain: 'frontend' });

      expect(selectMock).not.toHaveBeenCalled();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(installArg().language).toBe('ko');
      expect(installArg().domain).toBe('frontend');
    });

    it('does not prompt when stdout is not a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
        writable: true,
      });

      await initCommand({ domain: 'devops' });

      expect(selectMock).not.toHaveBeenCalled();
      expect(installArg().language).toBe('en');
      expect(installArg().domain).toBe('devops');
    });
  });

  describe('no ontology-rag setup (removed in v2.0.24, #1960)', () => {
    // The installer is mocked here; installer.test.ts checks that it creates no .claude/ontology.
    it('writes no .mcp.json', async () => {
      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(true);
      await expect(stat(join(tempDir, '.mcp.json'))).rejects.toThrow();
    });

    it('does not print an ontology-rag status line', async () => {
      await initCommand({ yes: true, lang: 'en' });

      expect(logged().some((line) => line.includes('ontology-rag'))).toBe(false);
    });
  });

  describe('non-blocking bookkeeping', () => {
    it('registers the project with the CLI version', async () => {
      await initCommand({ yes: true, lang: 'en' });

      expect(registerProjectMock).toHaveBeenCalledWith(tempDir, packageJson.version);
    });

    it('still succeeds when the project registry write fails', async () => {
      registerProjectMock.mockImplementationOnce(async () => {
        throw new Error('registry unavailable');
      });

      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(true);
    });

    it('records the CLI version in the lock file and keeps existing fields', async () => {
      await writeFile(
        join(tempDir, '.omcustom.lock.json'),
        JSON.stringify({ version: '0.0.1', installedAt: '2020-01-01T00:00:00.000Z', extra: 'kept' })
      );

      await initCommand({ yes: true, lang: 'en' });

      const lock = JSON.parse(await readFile(join(tempDir, '.omcustom.lock.json'), 'utf-8'));
      expect(lock.version).toBe(packageJson.version);
      expect(lock.installedAt).toBe('2020-01-01T00:00:00.000Z');
      expect(lock.extra).toBe('kept');
    });

    it('still succeeds when the lock file cannot be written', async () => {
      // A directory at the lock file path makes the lock file write fail.
      await mkdir(join(tempDir, '.omcustom.lock.json'));

      const result = await initCommand({ yes: true, lang: 'en' });

      expect(result.success).toBe(true);
    });
  });

  describe('checkExistingInstallation', () => {
    it('is false for an empty directory', async () => {
      expect(await checkExistingInstallation(tempDir)).toBe(false);
    });

    it('is true when the provider root directory exists', async () => {
      await mkdir(join(tempDir, '.claude'));

      expect(await checkExistingInstallation(tempDir)).toBe(true);
    });
  });

  describe('initFromSnapshot (deprecated wrapper)', () => {
    it('delegates to the snapshot installer and reports a missing snapshot', async () => {
      const result = await initFromSnapshot(tempDir, join(tempDir, 'missing-snapshot'), {});

      expect(result.success).toBe(false);
      expect(installMock).not.toHaveBeenCalled();
    });
  });
});

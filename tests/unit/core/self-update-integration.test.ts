/**
 * Integration tests for self-update module (TTY-dependent code paths)
 *
 * These tests cover execution paths that require:
 * - Interactive session (TTY override)
 * - Child process execution (mocked execSync/spawnSync)
 * - User input via readline (mocked)
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { i18n, initI18n } from '../../../src/i18n/index.js';

// ============================================================================
// MOCK SETUP (before importing self-update)
// ============================================================================

// Mock child_process functions
const mockExecSync = mock((cmd: string) => {
  if (cmd.includes('npm view')) {
    return '"1.5.0"\n';
  }
  if (cmd.includes('npm install -g')) {
    return '';
  }
  throw new Error(`Unexpected execSync call: ${cmd}`);
});

const mockSpawnSync = mock(() => ({
  status: 0,
  stdout: Buffer.from(''),
  stderr: Buffer.from(''),
  pid: 12345,
  output: [],
  signal: null,
}));

// 모킹 전에 실제 모듈을 캡처해 둔다. bun의 mock.module은 파일 경계를 넘어 유지되므로
// (mock.restore()로 복원되지 않음) afterAll에서 이 원본으로 다시 덮어써 누수를 막는다 (#1760).
const realChildProcess = { ...(await import('node:child_process')) };

mock.module('node:child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

// 이 파일 종료 시 node:child_process를 원본으로 복원 (다른 테스트 파일의 spawnSync 등을 보호)
afterAll(() => {
  mock.module('node:child_process', () => realChildProcess);
  // node:readline/promises도 동일하게 원본으로 복원합니다 (#1761)
  mock.module('node:readline/promises', () => realReadlinePromises);
});

// Mock readline/promises (모킹 전에 원본을 캡처해 afterAll에서 복원합니다, #1761)
const realReadlinePromises = { ...(await import('node:readline/promises')) };
let mockQuestionAnswer = 'y';
const mockClose = mock(() => {});

mock.module('node:readline/promises', () => ({
  createInterface: () => ({
    question: mock(async () => mockQuestionAnswer),
    close: mockClose,
  }),
}));

// Now import self-update (will use mocked modules)
import type { ReexecSpawnFn, SelfUpdateOptions } from '../../../src/core/self-update.js';
import {
  exitCodeForChild,
  fetchLatestVersionFromNpm,
  findInstalledPackageVersion,
  maybeHandleSelfUpdateForInit,
} from '../../../src/core/self-update.js';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('self-update integration tests', () => {
  let tempDir: string;
  let originalStdinTTY: boolean | undefined;
  let originalStdoutTTY: boolean | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create temp directory for cache
    tempDir = mkdtempSync(join(tmpdir(), 'omcustom-test-integration-'));

    // Save original TTY values
    originalStdinTTY = process.stdin.isTTY;
    originalStdoutTTY = process.stdout.isTTY;

    // Override TTY to simulate interactive session
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Spy on console methods to prevent noise
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    // Spy on process.exit to prevent actual exit
    processExitSpy = spyOn(process, 'exit').mockImplementation(
      (code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${code}) called`);
      }
    );

    // Reset mock counters
    mockExecSync.mockClear();
    mockSpawnSync.mockClear();
    mockClose.mockClear();

    // Reset readline answer
    mockQuestionAnswer = 'y';
  });

  afterEach(() => {
    // Restore TTY values
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinTTY,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutTTY,
      writable: true,
      configurable: true,
    });

    // Restore spies
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // fetchLatestVersionFromNpm tests (exported function)
  // ==========================================================================

  describe('fetchLatestVersionFromNpm', () => {
    it('should parse version from JSON output (quoted)', () => {
      mockExecSync.mockImplementationOnce(() => '"1.5.0"\n');

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe('1.5.0');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm view test-package version --json'),
        expect.objectContaining({
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 3000,
        })
      );
    });

    it('should parse version from non-JSON output', () => {
      mockExecSync.mockImplementationOnce(() => '2.3.4\n');

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe('2.3.4');
    });

    it('should return null when output is empty', () => {
      mockExecSync.mockImplementationOnce(() => '   \n');

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe(null);
    });

    it('should return null when execSync throws', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe(null);
    });

    it('should normalize version with v prefix', () => {
      mockExecSync.mockImplementationOnce(() => 'v3.1.0\n');

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe('3.1.0');
    });

    it('should normalize version with prerelease', () => {
      mockExecSync.mockImplementationOnce(() => '"1.2.3-beta.1"\n');

      const version = fetchLatestVersionFromNpm('test-package');

      expect(version).toBe('1.2.3');
    });
  });

  // ==========================================================================
  // maybeHandleSelfUpdateForInit integration tests
  // ==========================================================================

  describe('maybeHandleSelfUpdateForInit with interactive session', () => {
    it('should update global installation when user accepts (non-npx)', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called npm install -g
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g test-package@1.5.0',
        expect.objectContaining({
          stdio: 'inherit',
          timeout: 60000,
        })
      );

      // Should have printed messages
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should relaunch with npx when user accepts (npx invocation)', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockSpawnSync.mockImplementationOnce(() => ({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        pid: 12345,
        output: [],
        signal: null,
      }));

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/home/user/.npm/_npx/12345/node_modules/.bin/omcustom', 'init'],
        env: {},
      };

      await expect(maybeHandleSelfUpdateForInit(options)).rejects.toThrow('process.exit(0) called');

      // Should have called spawnSync with npx
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'npx',
        ['-y', 'test-package@1.5.0', 'init'],
        expect.objectContaining({
          stdio: 'inherit',
          env: expect.objectContaining({
            OMCUSTOM_SKIP_SELF_UPDATE: 'true',
          }),
        })
      );
    });

    it('should print declined message when user declines', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockQuestionAnswer = 'n';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have printed declined message
      expect(consoleLogSpy).toHaveBeenCalled();

      // Should NOT have called npm install or npx
      expect(mockExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining('npm install -g'),
        expect.anything()
      );
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should return early when no update available', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.0.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have checked version
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm view'),
        expect.anything()
      );

      // Should NOT have prompted or installed
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should return early when current version is invalid', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should NOT have called anything
      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should return early when fetch fails', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have attempted to fetch
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm view'),
        expect.anything()
      );

      // Should NOT have prompted or installed
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('should handle failed npx relaunch and print warning', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockSpawnSync.mockImplementationOnce(() => ({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('error output'),
        pid: 12345,
        output: [],
        signal: null,
      }));

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/home/user/.npm/_npx/12345/node_modules/.bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called spawnSync
      expect(mockSpawnSync).toHaveBeenCalled();

      // Should have printed warning (not exited)
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle failed global update and print warning', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) {
          throw new Error('Permission denied');
        }
        throw new Error(`Unexpected: ${cmd}`);
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have attempted npm install -g
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g test-package@1.5.0',
        expect.anything()
      );

      // Should have printed warning
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle npx relaunch with null status', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockSpawnSync.mockImplementationOnce(() => ({
        status: null,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        pid: 12345,
        output: [],
        signal: 'SIGTERM',
      }));

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/home/user/.npm/_npx/12345/node_modules/.bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have printed warning about failed relaunch
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should print continuation spacing after warnings', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) {
          throw new Error('Failed');
        }
        throw new Error(`Unexpected: ${cmd}`);
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called console.log('') for spacing
      expect(consoleLogSpy).toHaveBeenCalledWith('');
    });

    it('should accept empty answer as yes', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockQuestionAnswer = '';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called npm install -g
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g test-package@1.5.0',
        expect.anything()
      );
    });

    it('should accept "yes" as affirmative', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockQuestionAnswer = 'yes';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called npm install -g
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g test-package@1.5.0',
        expect.anything()
      );
    });

    it('should handle mixed-case answer', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });

      mockQuestionAnswer = 'Y';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have called npm install -g
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g test-package@1.5.0',
        expect.anything()
      );
    });

    it('should close readline interface after prompting', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/usr/local/bin/omcustom', 'init'],
        env: {},
      };

      await maybeHandleSelfUpdateForInit(options);

      // Should have closed readline
      expect(mockClose).toHaveBeenCalled();
    });
  });
  // ==========================================================================
  // Re-exec after a successful global install on the init path (A2)
  // ==========================================================================

  describe('maybeHandleSelfUpdateForInit — re-exec after global install', () => {
    const PKG_DIR = join('/fake', 'prefix', 'lib', 'node_modules', 'test-package');
    const ENTRY = join(PKG_DIR, 'dist', 'cli', 'index.js');

    function mockNpm(installBehavior: 'ok' | 'fail'): void {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        if (cmd.includes('npm install -g')) {
          if (installBehavior === 'fail') throw new Error('EACCES: permission denied');
          return '';
        }
        throw new Error(`Unexpected: ${cmd}`);
      });
    }

    /** Fake file system: paths resolve to themselves, only the listed files can be read. */
    function fakeFs(files: Record<string, string>) {
      return {
        realpathFn: (path: string) => path,
        readFileFn: (path: string) => {
          const content = files[path];
          if (content === undefined) throw new Error(`ENOENT: ${path}`);
          return content;
        },
      };
    }

    function pkgJson(version: string | undefined, name = 'test-package'): string {
      return JSON.stringify(version === undefined ? { name } : { name, version });
    }

    function okSpawn(status: number | null = 0, signal: NodeJS.Signals | null = null) {
      return mock<ReexecSpawnFn>(() => ({ status, signal }));
    }

    function makeOptions(overrides: Partial<SelfUpdateOptions> = {}): SelfUpdateOptions {
      return {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', ENTRY, 'init', '--lang', 'ko'],
        env: { FOO: 'bar' },
        ...overrides,
      };
    }

    function warnings(): string[] {
      return consoleWarnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    beforeEach(async () => {
      await initI18n('en');
    });

    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    it('re-execs the new CLI with the skip env and the exact original args', async () => {
      mockNpm('ok');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.5.0') }),
            spawnFn,
            exitFn,
          },
        })
      );

      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(spawnFn).toHaveBeenCalledWith(process.execPath, [ENTRY, 'init', '--lang', 'ko'], {
        stdio: 'inherit',
        env: { FOO: 'bar', OMCUSTOM_SKIP_SELF_UPDATE: 'true' },
      });
      expect(exitFn).toHaveBeenCalledTimes(1);
      expect(exitFn).toHaveBeenCalledWith(0);
      expect(mockSpawnSync).not.toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]))).toContain(
        '↻ Restarting init with the updated CLI (v1.5.0)...'
      );
    });

    it('propagates the child exit status', async () => {
      mockNpm('ok');
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.5.0') }),
            spawnFn: okSpawn(3),
            exitFn,
          },
        })
      );

      expect(exitFn).toHaveBeenCalledWith(3);
    });

    it.each([
      ['SIGTERM', 143],
      ['SIGINT', 130],
      ['SIGKILL', 137],
    ] as const)('maps a child killed by %s to exit code %d', async (signal, expected) => {
      mockNpm('ok');
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.5.0') }),
            spawnFn: okSpawn(null, signal),
            exitFn,
          },
        })
      );

      expect(exitFn).toHaveBeenCalledWith(expected);
    });

    it('uses the real spawnSync and process.exit when no deps are injected', async () => {
      mockNpm('ok');
      mockSpawnSync.mockImplementationOnce(() => ({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        pid: 1,
        output: [],
        signal: null,
      }));
      // Real realpath/readFile against a real symlinked global-install layout
      const prefix = join(tempDir, 'prefix');
      const realPkgDir = join(prefix, 'lib', 'node_modules', 'test-package');
      mkdirSync(join(realPkgDir, 'dist', 'cli'), { recursive: true });
      mkdirSync(join(prefix, 'bin'), { recursive: true });
      writeFileSync(join(realPkgDir, 'package.json'), pkgJson('1.5.0'));
      writeFileSync(join(realPkgDir, 'dist', 'cli', 'index.js'), '// entry');
      // A nameless nested package.json (like dist/package.json) must be walked past
      writeFileSync(join(realPkgDir, 'dist', 'package.json'), '{"type":"module"}');
      const binLink = join(prefix, 'bin', 'omcustom');
      symlinkSync(join(realPkgDir, 'dist', 'cli', 'index.js'), binLink);

      await expect(
        maybeHandleSelfUpdateForInit(makeOptions({ argv: ['node', binLink, 'init'] }))
      ).rejects.toThrow('process.exit(0) called');

      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      const call = mockSpawnSync.mock.calls[0] as unknown as [string, string[], unknown];
      expect(call[0]).toBe(process.execPath);
      expect(call[1]).toEqual([binLink, 'init']);
    });

    it('does not re-exec and warns with both versions when the binary is a different version', async () => {
      mockNpm('ok');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.0.0') }),
            spawnFn,
            exitFn,
          },
        })
      );

      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
      const text = warnings().join('\n');
      expect(text).toContain('Installed v1.5.0');
      expect(text).toContain('is v1.0.0');
      expect(text).toContain('npm install -g test-package@latest');
      expect(text).toContain('Continuing init with current version.');
    });

    it('does not re-exec and warns when the binary version cannot be resolved', async () => {
      mockNpm('ok');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            realpathFn: () => {
              throw new Error('ENOENT');
            },
            readFileFn: () => {
              throw new Error('unreachable');
            },
            spawnFn,
            exitFn,
          },
        })
      );

      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
      const text = warnings().join('\n');
      expect(text).toContain('Installed v1.5.0');
      expect(text).toContain('this process loaded v1.0.0');
      expect(text).toContain('npm install -g test-package@latest');
      expect(text).toContain('Continuing init with current version.');
    });

    it('does not re-exec when argv has no entry path', async () => {
      mockNpm('ok');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({ argv: ['node'], reexecDeps: { spawnFn, exitFn } })
      );

      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
      expect(warnings().join('\n')).toContain('could not determine the version');
    });

    it('does not re-exec when the owning package.json has no version', async () => {
      mockNpm('ok');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson(undefined) }),
            spawnFn,
            exitFn,
          },
        })
      );

      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
      expect(warnings().join('\n')).toContain('could not determine the version');
    });

    it('prints the warnings in Korean when the language is ko', async () => {
      mockNpm('ok');
      await i18n.changeLanguage('ko');

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.0.0') }),
            spawnFn: okSpawn(0),
            exitFn: mock((_code: number) => {}),
          },
        })
      );

      const text = warnings().join('\n');
      expect(text).toContain('v1.5.0를 설치했지만');
      expect(text).toContain('v1.0.0');
      expect(text).toContain('npm install -g test-package@latest');
    });

    it('continues with the current version when the re-exec child cannot be started', async () => {
      mockNpm('ok');
      const spawnFn = mock<ReexecSpawnFn>(() => ({
        status: null,
        signal: null,
        error: new Error('spawn ENOENT'),
      }));
      const exitFn = mock((_code: number) => {});

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: {
            ...fakeFs({ [join(PKG_DIR, 'package.json')]: pkgJson('1.5.0') }),
            spawnFn,
            exitFn,
          },
        })
      );

      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(exitFn).not.toHaveBeenCalled();
      const text = warnings().join('\n');
      expect(text).toContain('Could not restart with the updated CLI: spawn ENOENT');
      expect(text).toContain('Continuing init with current version.');
    });

    it('keeps the existing failure behaviour when the install fails (no re-exec)', async () => {
      mockNpm('fail');
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});
      const readFileFn = mock((_path: string) => pkgJson('1.5.0'));

      await maybeHandleSelfUpdateForInit(
        makeOptions({
          reexecDeps: { realpathFn: (p: string) => p, readFileFn, spawnFn, exitFn },
        })
      );

      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
      expect(readFileFn).not.toHaveBeenCalled();
      const text = warnings().join('\n');
      expect(text).toContain('Self-update failed: EACCES: permission denied');
      expect(text).toContain('Continuing init with current version.');
    });

    it('keeps the npx path unchanged (npx relaunch, no global re-exec)', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('npm view')) return '"1.5.0"\n';
        throw new Error(`Unexpected: ${cmd}`);
      });
      const spawnFn = okSpawn(0);
      const exitFn = mock((_code: number) => {});

      await expect(
        maybeHandleSelfUpdateForInit(
          makeOptions({
            argv: ['node', '/home/user/.npm/_npx/12345/node_modules/.bin/omcustom', 'init'],
            env: {},
            reexecDeps: { spawnFn, exitFn },
          })
        )
      ).rejects.toThrow('process.exit(0) called');

      expect(mockSpawnSync).toHaveBeenCalledWith('npx', ['-y', 'test-package@1.5.0', 'init'], {
        stdio: 'inherit',
        env: { OMCUSTOM_SKIP_SELF_UPDATE: 'true' },
      });
      expect(spawnFn).not.toHaveBeenCalled();
      expect(exitFn).not.toHaveBeenCalled();
    });

    it('does not re-exec when the user declines the update', async () => {
      mockNpm('ok');
      mockQuestionAnswer = 'n';
      const spawnFn = okSpawn(0);

      await maybeHandleSelfUpdateForInit(makeOptions({ reexecDeps: { spawnFn } }));

      expect(spawnFn).not.toHaveBeenCalled();
    });
  });

  describe('exitCodeForChild', () => {
    it('returns the child status when it exited normally', () => {
      expect(exitCodeForChild({ status: 0, signal: null })).toBe(0);
      expect(exitCodeForChild({ status: 7, signal: null })).toBe(7);
    });

    it('maps a known signal to 128 + signal number', () => {
      expect(exitCodeForChild({ status: null, signal: 'SIGTERM' })).toBe(143);
    });

    it('falls back to the status for an unknown signal name', () => {
      expect(exitCodeForChild({ status: 9, signal: 'SIGNOPE' as NodeJS.Signals })).toBe(9);
    });

    it('returns 1 when neither status nor a known signal is available', () => {
      expect(exitCodeForChild({ status: null, signal: null })).toBe(1);
      expect(exitCodeForChild({ status: null, signal: 'SIGNOPE' as NodeJS.Signals })).toBe(1);
    });
  });

  describe('findInstalledPackageVersion', () => {
    function reader(files: Record<string, string>) {
      return (path: string): string => {
        const content = files[path];
        if (content === undefined) throw new Error(`ENOENT: ${path}`);
        return content;
      };
    }

    it('walks up past a nameless, an invalid and a differently named package.json', () => {
      const root = join('/fake', 'root', 'node_modules', 'test-package');
      const entry = join(root, 'a', 'b', 'c', 'index.js');
      const version = findInstalledPackageVersion(entry, 'test-package', {
        realpathFn: (p) => p,
        readFileFn: reader({
          [join(root, 'a', 'b', 'c', 'package.json')]: '{"type":"module"}',
          [join(root, 'a', 'b', 'package.json')]: '{ invalid',
          [join(root, 'a', 'package.json')]: '{"name":"someone-else","version":"9.9.9"}',
          [join(root, 'package.json')]: '{"name":"test-package","version":"v2.3.4-beta"}',
        }),
      });

      // The package.json `version` is returned as stored; normalization is the caller's job
      expect(version).toBe('v2.3.4-beta');
    });

    it('returns null for a non-object package.json and reaches the filesystem root', () => {
      const version = findInstalledPackageVersion(join('/fake', 'x', 'index.js'), 'test-package', {
        realpathFn: (p) => p,
        readFileFn: () => '[1,2,3]',
      });

      expect(version).toBeNull();
    });

    it('returns null when the matching package.json has an empty version', () => {
      const dir = join('/fake', 'pkg');
      const version = findInstalledPackageVersion(join(dir, 'index.js'), 'test-package', {
        realpathFn: (p) => p,
        readFileFn: reader({ [join(dir, 'package.json')]: '{"name":"test-package","version":""}' }),
      });

      expect(version).toBeNull();
    });

    it('returns null when the entry path cannot be resolved', () => {
      const version = findInstalledPackageVersion('/does/not/exist', 'test-package', {
        realpathFn: () => {
          throw new Error('ENOENT');
        },
      });

      expect(version).toBeNull();
    });

    it('uses the real filesystem by default and returns null for a missing entry', () => {
      expect(findInstalledPackageVersion(join(tempDir, 'missing', 'index.js'), 'x')).toBeNull();
    });
  });
});

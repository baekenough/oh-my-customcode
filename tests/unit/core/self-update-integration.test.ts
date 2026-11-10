/**
 * Integration tests for self-update module (npm lookup, child exit codes, installed-version probe)
 *
 * The auto-update flow itself is covered in auto-self-update.test.ts.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ============================================================================
// MOCK SETUP (before importing self-update)
// ============================================================================

// Mock child_process functions
const mockExecSync = mock((cmd: string) => {
  if (cmd.includes('npm view')) {
    return '"1.5.0"\n';
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
});

// Now import self-update (will use mocked modules)
import {
  autoSelfUpdate,
  exitCodeForChild,
  fetchLatestVersionFromNpm,
  findInstalledPackageVersion,
} from '../../../src/core/self-update.js';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('self-update integration tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omcustom-test-integration-'));
    mockExecSync.mockClear();
    mockSpawnSync.mockClear();
  });

  afterEach(() => {
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

  describe('autoSelfUpdate default side effects (#1946)', () => {
    const entry = '/fake/prefix/lib/node_modules/test-package/dist/cli/index.js';
    let exitSpy: ReturnType<typeof spyOn>;
    let logSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      exitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      logSpy = spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      logSpy.mockRestore();
    });

    const base = {
      currentVersion: '1.0.0',
      command: 'init' as const,
      packageName: 'test-package',
      env: {},
      fetchLatestVersion: () => '1.5.0',
    };

    const probeOk = (_cmd: string, args: string[]) => ({
      status: 0,
      signal: null,
      stdout: args.includes('--version') ? '1.5.0\n' : '',
    });

    function mockNpm(root: string | Error): void {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'npm root -g') {
          if (root instanceof Error) throw root;
          return `${root}\n`;
        }
        if (cmd.includes('npm install -g')) return '';
        throw new Error(`Unexpected: ${cmd}`);
      });
    }

    it('installs without a timeout, probes and re-runs with spawnSync and process.exit', () => {
      mockNpm('/fake/prefix/lib/node_modules');
      mockSpawnSync.mockImplementation(probeOk as never);

      const outcome = autoSelfUpdate({
        ...base,
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', entry, 'init'],
        deps: {
          realpathFn: (p) => p,
          readFileFn: () => '{"name":"test-package","version":"1.5.0"}',
        },
      });

      expect(outcome).toBe('relaunched');
      expect(mockExecSync).toHaveBeenCalledWith('npm install -g test-package@1.5.0', {
        stdio: 'inherit',
      });
      expect(mockExecSync).toHaveBeenCalledWith(
        'npm root -g',
        expect.objectContaining({ timeout: 5000 })
      );
      // probe (--version) first, then the real run
      expect(mockSpawnSync).toHaveBeenCalledTimes(2);
      const probeCall = mockSpawnSync.mock.calls[0] as unknown as [string, string[]];
      expect(probeCall[1]).toEqual([entry, '--version']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('continues when the default probe fails to start the new CLI', () => {
      mockNpm('/fake/prefix/lib/node_modules');
      mockSpawnSync.mockImplementation((() => ({ status: 1, signal: null, stdout: '' })) as never);

      const outcome = autoSelfUpdate({
        ...base,
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', entry, 'init'],
        deps: {
          realpathFn: (p) => p,
          readFileFn: () => '{"name":"test-package","version":"1.5.0"}',
        },
      });

      expect(outcome).toBe('failed');
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('treats a probe spawn error or missing stdout as a failed probe', () => {
      mockNpm('/fake/prefix/lib/node_modules');
      mockSpawnSync.mockImplementation((() => ({
        status: 0,
        signal: null,
        stdout: null,
        error: new Error('ETIMEDOUT'),
      })) as never);

      expect(
        autoSelfUpdate({
          ...base,
          cachePath: join(tempDir, 'cache.json'),
          argv: ['node', entry, 'init'],
          deps: {
            realpathFn: (p) => p,
            readFileFn: () => '{"name":"test-package","version":"1.5.0"}',
          },
        })
      ).toBe('failed');
    });

    it('still installs when the default npm root -g lookup fails', () => {
      mockNpm(new Error('npm root failed'));
      mockSpawnSync.mockImplementation(probeOk as never);

      const outcome = autoSelfUpdate({
        ...base,
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', entry, 'init'],
        deps: {
          realpathFn: (p) => p,
          readFileFn: () => '{"name":"test-package","version":"1.5.0"}',
        },
      });

      expect(outcome).toBe('relaunched');
      expect(mockExecSync).toHaveBeenCalledWith('npm install -g test-package@1.5.0', {
        stdio: 'inherit',
      });
    });

    it('treats an empty npm root -g output as unknown', () => {
      mockNpm('');
      mockSpawnSync.mockImplementation(probeOk as never);

      expect(
        autoSelfUpdate({
          ...base,
          cachePath: join(tempDir, 'cache.json'),
          argv: ['node', entry, 'init'],
          deps: {
            realpathFn: (p) => p,
            readFileFn: () => '{"name":"test-package","version":"1.5.0"}',
          },
        })
      ).toBe('relaunched');
    });

    it('re-runs through npx after a default npx probe', () => {
      mockNpm('/unused');
      mockSpawnSync.mockImplementation(probeOk as never);

      const outcome = autoSelfUpdate({
        ...base,
        cachePath: join(tempDir, 'cache.json'),
        argv: ['node', '/home/u/.npm/_npx/abc/node_modules/.bin/omcustom', 'init'],
      });

      expect(outcome).toBe('relaunched');
      const probeCall = mockSpawnSync.mock.calls[0] as unknown as [string, string[]];
      expect(probeCall[0]).toBe('npx');
      expect(probeCall[1]).toEqual(['-y', 'test-package@1.5.0', '--version']);
      const runCall = mockSpawnSync.mock.calls[1] as unknown as [string, string[]];
      expect(runCall[1]).toEqual(['-y', 'test-package@1.5.0', 'init']);
      expect(exitSpy).toHaveBeenCalledWith(0);
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

    it('reads the real package.json by default when the entry exists', () => {
      const entry = join(import.meta.dir, '..', '..', '..', 'src', 'core', 'self-update.ts');

      expect(findInstalledPackageVersion(entry, 'oh-my-customcode')).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('uses the real filesystem by default and returns null for a missing entry', () => {
      expect(findInstalledPackageVersion(join(tempDir, 'missing', 'index.js'), 'x')).toBeNull();
    });
  });
});

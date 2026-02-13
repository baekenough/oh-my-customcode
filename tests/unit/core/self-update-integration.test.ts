/**
 * Integration tests for self-update module (TTY-dependent code paths)
 *
 * These tests cover execution paths that require:
 * - Interactive session (TTY override)
 * - Child process execution (mocked execSync/spawnSync)
 * - User input via readline (mocked)
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
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

mock.module('node:child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

// Mock readline/promises
let mockQuestionAnswer = 'y';
const mockClose = mock(() => {});

mock.module('node:readline/promises', () => ({
  createInterface: () => ({
    question: mock(async () => mockQuestionAnswer),
    close: mockClose,
  }),
}));

// Now import self-update (will use mocked modules)
import type { SelfUpdateOptions } from '../../../src/core/self-update.js';
import {
  fetchLatestVersionFromNpm,
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
});

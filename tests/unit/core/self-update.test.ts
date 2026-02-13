/**
 * Unit tests for self-update module
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SelfUpdateOptions } from '../../../src/core/self-update.js';
import {
  checkSelfUpdate,
  compareSemver,
  isInteractiveSession,
  isNpxInvocation,
  maybeHandleSelfUpdateForInit,
  normalizeVersion,
} from '../../../src/core/self-update.js';

describe('self-update module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omcustom-test-'));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('normalizeVersion', () => {
    it('should strip v prefix from version', () => {
      expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
      expect(normalizeVersion('V1.2.3')).toBe('1.2.3');
    });

    it('should strip prerelease suffix', () => {
      expect(normalizeVersion('1.2.3-beta')).toBe('1.2.3');
      expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3');
      expect(normalizeVersion('v1.2.3-alpha')).toBe('1.2.3');
    });

    it('should handle empty string', () => {
      expect(normalizeVersion('')).toBe('');
    });

    it('should handle v only', () => {
      expect(normalizeVersion('v')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(normalizeVersion('  1.2.3  ')).toBe('1.2.3');
      expect(normalizeVersion(' v1.2.3 ')).toBe('1.2.3');
    });

    it('should handle version without prerelease', () => {
      expect(normalizeVersion('1.2.3')).toBe('1.2.3');
      expect(normalizeVersion('0.0.1')).toBe('0.0.1');
    });
  });

  describe('compareSemver', () => {
    it('should return 0 for equal versions', () => {
      expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
      expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
      expect(compareSemver('1.0.0', 'v1.0.0')).toBe(0);
    });

    it('should return -1 when first version is less than second', () => {
      expect(compareSemver('1.2.2', '1.2.3')).toBe(-1);
      expect(compareSemver('1.1.9', '1.2.0')).toBe(-1);
      expect(compareSemver('0.9.9', '1.0.0')).toBe(-1);
    });

    it('should return 1 when first version is greater than second', () => {
      expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
      expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
      expect(compareSemver('1.3.0', '1.2.9')).toBe(1);
    });

    it('should handle different version lengths', () => {
      expect(compareSemver('1.2', '1.2.0')).toBe(0);
      expect(compareSemver('1.2.3', '1.2')).toBe(1);
      expect(compareSemver('1.2', '1.2.1')).toBe(-1);
    });

    it('should ignore prerelease when comparing', () => {
      expect(compareSemver('1.2.3-beta', '1.2.3-alpha')).toBe(0);
      expect(compareSemver('1.2.3-rc.1', '1.2.3')).toBe(0);
    });

    it('should handle v prefix correctly', () => {
      expect(compareSemver('v1.2.3', 'v1.2.4')).toBe(-1);
      expect(compareSemver('v2.0.0', 'v1.9.9')).toBe(1);
      expect(compareSemver('V1.0.0', 'v1.0.0')).toBe(0);
    });

    it('should pad missing parts with zeros', () => {
      expect(compareSemver('1', '1.0.0')).toBe(0);
      expect(compareSemver('1.0', '1.0.0')).toBe(0);
      expect(compareSemver('1', '1.0.1')).toBe(-1);
    });
  });

  describe('isInteractiveSession', () => {
    it('should return true when both stdin and stdout are TTY', () => {
      const mockStdin = { isTTY: true };
      const mockStdout = { isTTY: true };
      expect(isInteractiveSession(mockStdin, mockStdout)).toBe(true);
    });

    it('should return false when stdin is not TTY', () => {
      const mockStdin = { isTTY: false };
      const mockStdout = { isTTY: true };
      expect(isInteractiveSession(mockStdin, mockStdout)).toBe(false);
    });

    it('should return false when stdout is not TTY', () => {
      const mockStdin = { isTTY: true };
      const mockStdout = { isTTY: false };
      expect(isInteractiveSession(mockStdin, mockStdout)).toBe(false);
    });

    it('should return false when neither is TTY', () => {
      const mockStdin = { isTTY: false };
      const mockStdout = { isTTY: false };
      expect(isInteractiveSession(mockStdin, mockStdout)).toBe(false);
    });

    it('should return false when isTTY is undefined', () => {
      const mockStdin = { isTTY: undefined };
      const mockStdout = { isTTY: undefined };
      expect(isInteractiveSession(mockStdin, mockStdout)).toBe(false);
    });
  });

  describe('isNpxInvocation', () => {
    it('should detect _npx in argv[1] path (unix)', () => {
      const argv = ['node', '/path/to/_npx/12345/node_modules/.bin/omcustom'];
      expect(isNpxInvocation(argv, {})).toBe(true);
    });

    it('should detect _npx in argv[1] path (windows)', () => {
      const argv = ['node', 'C:\\path\\to\\_npx\\12345\\node_modules\\.bin\\omcustom.cmd'];
      expect(isNpxInvocation(argv, {})).toBe(true);
    });

    it('should detect npm_execpath containing npx', () => {
      const argv = ['node', '/some/path'];
      const env = { npm_execpath: '/usr/local/bin/npx' };
      expect(isNpxInvocation(argv, env)).toBe(true);
    });

    it('should detect npm_command=exec', () => {
      const argv = ['node', '/some/path'];
      const env = { npm_command: 'exec' };
      expect(isNpxInvocation(argv, env)).toBe(true);
    });

    it('should detect npm_lifecycle_event=npx', () => {
      const argv = ['node', '/some/path'];
      const env = { npm_lifecycle_event: 'npx' };
      expect(isNpxInvocation(argv, env)).toBe(true);
    });

    it('should return false for normal invocation', () => {
      const argv = ['node', '/usr/local/bin/omcustom'];
      const env = {};
      expect(isNpxInvocation(argv, env)).toBe(false);
    });

    it('should return false when npm_command is not exec', () => {
      const argv = ['node', '/some/path'];
      const env = { npm_command: 'install' };
      expect(isNpxInvocation(argv, env)).toBe(false);
    });

    it('should handle empty argv', () => {
      expect(isNpxInvocation([], {})).toBe(false);
    });

    it('should handle missing argv[1]', () => {
      const argv = ['node'];
      expect(isNpxInvocation(argv, {})).toBe(false);
    });
  });

  describe('checkSelfUpdate', () => {
    const createCachePath = (name: string): string => join(tempDir, name);

    it('should return update available when latest > current', () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'test-package',
        cachePath: createCachePath('cache-1.json'),
        fetchLatestVersion: () => '1.1.0',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe('1.1.0');
      expect(result.usedCache).toBe(false);
    });

    it('should return no update when versions match', () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.2.3',
        cachePath: createCachePath('cache-2.json'),
        fetchLatestVersion: () => '1.2.3',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe('1.2.3');
    });

    it('should return no update when current > latest', () => {
      const options: SelfUpdateOptions = {
        currentVersion: '2.0.0',
        cachePath: createCachePath('cache-3.json'),
        fetchLatestVersion: () => '1.9.9',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe('1.9.9');
    });

    it('should use cache when fresh', () => {
      const cachePath = createCachePath('cache-4.json');
      const now = Date.now();
      const cacheTtlMs = 24 * 60 * 60 * 1000;

      // Write fresh cache
      writeFileSync(
        cachePath,
        JSON.stringify({
          checkedAt: new Date(now - 1000).toISOString(),
          latestVersion: '1.5.0',
        })
      );

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        cacheTtlMs,
        fetchLatestVersion: () => {
          throw new Error('Should not fetch when cache is fresh');
        },
        now,
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('1.5.0');
      expect(result.usedCache).toBe(true);
    });

    it('should fetch and write cache when cache is stale', () => {
      const cachePath = createCachePath('cache-5.json');
      const now = Date.now();
      const cacheTtlMs = 24 * 60 * 60 * 1000;

      // Write stale cache
      writeFileSync(
        cachePath,
        JSON.stringify({
          checkedAt: new Date(now - cacheTtlMs - 1000).toISOString(),
          latestVersion: '1.0.0',
        })
      );

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        cacheTtlMs,
        fetchLatestVersion: () => '1.6.0',
        now,
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('1.6.0');
      expect(result.usedCache).toBe(false);
    });

    it('should fetch and write cache when cache does not exist', () => {
      const cachePath = createCachePath('cache-6.json');

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        fetchLatestVersion: () => '1.7.0',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('1.7.0');
      expect(result.usedCache).toBe(false);
    });

    it('should handle invalid current version', () => {
      const options: SelfUpdateOptions = {
        currentVersion: '',
        cachePath: createCachePath('cache-7.json'),
        fetchLatestVersion: () => '1.0.0',
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(false);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe(null);
      expect(result.reason).toBe('invalid-current-version');
    });

    it('should handle failed lookup', () => {
      const cachePath = createCachePath('cache-8.json');

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        fetchLatestVersion: () => null,
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(false);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe(null);
      expect(result.reason).toBe('lookup-failed');
    });

    it('should create cache directory if it does not exist', () => {
      const cachePath = join(tempDir, 'nested', 'dir', 'cache.json');

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        fetchLatestVersion: () => '1.8.0',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('1.8.0');
    });

    it('should normalize version from cache', () => {
      const cachePath = createCachePath('cache-9.json');
      const now = Date.now();

      writeFileSync(
        cachePath,
        JSON.stringify({
          checkedAt: new Date(now - 1000).toISOString(),
          latestVersion: 'v1.9.0-beta',
        })
      );

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        cacheTtlMs: 24 * 60 * 60 * 1000,
        fetchLatestVersion: () => {
          throw new Error('Should not fetch');
        },
        now,
      };

      const result = checkSelfUpdate(options);

      expect(result.latestVersion).toBe('1.9.0');
    });

    it('should handle corrupted cache', () => {
      const cachePath = createCachePath('cache-10.json');

      writeFileSync(cachePath, 'invalid json{{{');

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        fetchLatestVersion: () => '2.0.0',
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
      expect(result.usedCache).toBe(false);
    });

    it('should handle cache with missing fields', () => {
      const cachePath = createCachePath('cache-11.json');

      writeFileSync(cachePath, JSON.stringify({ checkedAt: new Date().toISOString() }));

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        fetchLatestVersion: () => '2.1.0',
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.latestVersion).toBe('2.1.0');
      expect(result.usedCache).toBe(false);
    });

    it('should handle cache with invalid timestamp', () => {
      const cachePath = createCachePath('cache-12.json');

      writeFileSync(
        cachePath,
        JSON.stringify({
          checkedAt: 'invalid-date',
          latestVersion: '1.0.0',
        })
      );

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath,
        cacheTtlMs: 1000,
        fetchLatestVersion: () => '2.2.0',
        now: Date.now(),
      };

      const result = checkSelfUpdate(options);

      expect(result.latestVersion).toBe('2.2.0');
      expect(result.usedCache).toBe(false);
    });

    it('should normalize current version with v prefix', () => {
      const options: SelfUpdateOptions = {
        currentVersion: 'v1.0.0',
        cachePath: createCachePath('cache-13.json'),
        fetchLatestVersion: () => '1.1.0',
      };

      const result = checkSelfUpdate(options);

      expect(result.checked).toBe(true);
      expect(result.updateAvailable).toBe(true);
    });

    it('should use default package name when not provided', () => {
      let capturedPackageName = '';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        cachePath: createCachePath('cache-14.json'),
        fetchLatestVersion: (packageName: string) => {
          capturedPackageName = packageName;
          return '1.0.0';
        },
      };

      checkSelfUpdate(options);

      expect(capturedPackageName).toBe('oh-my-customcode');
    });

    it('should use custom package name when provided', () => {
      let capturedPackageName = '';

      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        packageName: 'custom-package',
        cachePath: createCachePath('cache-15.json'),
        fetchLatestVersion: (packageName: string) => {
          capturedPackageName = packageName;
          return '1.0.0';
        },
      };

      checkSelfUpdate(options);

      expect(capturedPackageName).toBe('custom-package');
    });
  });

  describe('maybeHandleSelfUpdateForInit', () => {
    it('should return immediately when skip=true', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        skip: true,
        fetchLatestVersion: () => {
          throw new Error('Should not fetch when skip=true');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });

    it('should return immediately when CI=true', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        env: { CI: 'true' },
        fetchLatestVersion: () => {
          throw new Error('Should not fetch in CI');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });

    it('should return immediately when GITHUB_ACTIONS=true', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        env: { GITHUB_ACTIONS: 'true' },
        fetchLatestVersion: () => {
          throw new Error('Should not fetch in GitHub Actions');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });

    it('should return immediately when OMCUSTOM_SKIP_SELF_UPDATE=true', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        env: { OMCUSTOM_SKIP_SELF_UPDATE: 'true' },
        fetchLatestVersion: () => {
          throw new Error('Should not fetch when skip env var is set');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });

    it('should return immediately when --skip-version-check flag is present', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '1.0.0',
        argv: ['node', 'omcustom', 'init', '--skip-version-check'],
        fetchLatestVersion: () => {
          throw new Error('Should not fetch with --skip-version-check');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });

    it('should return immediately when current version is invalid', async () => {
      const options: SelfUpdateOptions = {
        currentVersion: '',
        fetchLatestVersion: () => {
          throw new Error('Should not fetch with invalid version');
        },
      };

      await maybeHandleSelfUpdateForInit(options);
      // Test passes if no error thrown
    });
  });
});

import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkSelfUpdate,
  compareSemver,
  isNpxInvocation,
  normalizeVersion,
} from '../../../src/core/self-update.js';

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `omcustom-self-update-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('self-update core', () => {
  it('normalizeVersion should strip prefix and prerelease', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3');
    expect(normalizeVersion('  2.0.0  ')).toBe('2.0.0');
  });

  it('compareSemver should compare semantic versions', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
  });

  it('checkSelfUpdate should report update available when fetched version is newer', () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const cachePath = join(dir, 'self-update-cache.json');

    const result = checkSelfUpdate({
      currentVersion: '1.0.0',
      cachePath,
      now: 1_700_000_000_000,
      fetchLatestVersion: () => '1.1.0',
    });

    expect(result.checked).toBe(true);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.1.0');
    expect(result.usedCache).toBe(false);
    expect(existsSync(cachePath)).toBe(true);
  });

  it('checkSelfUpdate should use fresh cache and avoid fetch', () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const cachePath = join(dir, 'self-update-cache.json');

    const firstNow = 1_700_000_000_000;
    checkSelfUpdate({
      currentVersion: '1.0.0',
      cachePath,
      now: firstNow,
      fetchLatestVersion: () => '1.1.0',
    });

    let fetchCalled = false;
    const second = checkSelfUpdate({
      currentVersion: '1.0.0',
      cachePath,
      now: firstNow + 60 * 60 * 1000, // +1h
      cacheTtlMs: 24 * 60 * 60 * 1000,
      fetchLatestVersion: () => {
        fetchCalled = true;
        return '9.9.9';
      },
    });

    expect(second.checked).toBe(true);
    expect(second.usedCache).toBe(true);
    expect(second.latestVersion).toBe('1.1.0');
    expect(fetchCalled).toBe(false);
  });

  it('checkSelfUpdate should refresh stale cache', () => {
    const dir = createTempDir();
    tempDirs.push(dir);
    const cachePath = join(dir, 'self-update-cache.json');

    writeFileSync(
      cachePath,
      JSON.stringify(
        {
          checkedAt: '2020-01-01T00:00:00.000Z',
          latestVersion: '1.0.1',
        },
        null,
        2
      )
    );

    let fetchCalls = 0;
    const result = checkSelfUpdate({
      currentVersion: '1.0.0',
      cachePath,
      now: 1_900_000_000_000,
      cacheTtlMs: 24 * 60 * 60 * 1000,
      fetchLatestVersion: () => {
        fetchCalls += 1;
        return '1.2.0';
      },
    });

    expect(fetchCalls).toBe(1);
    expect(result.checked).toBe(true);
    expect(result.usedCache).toBe(false);
    expect(result.latestVersion).toBe('1.2.0');
  });

  it('checkSelfUpdate should return unchecked result when current version is invalid', () => {
    const result = checkSelfUpdate({
      currentVersion: '   ',
      fetchLatestVersion: () => '1.0.0',
    });

    expect(result.checked).toBe(false);
    expect(result.updateAvailable).toBe(false);
    expect(result.reason).toBe('invalid-current-version');
  });

  it('isNpxInvocation should detect npx/npm exec context', () => {
    expect(
      isNpxInvocation(['/usr/bin/node', '/tmp/_npx/abc/node_modules/.bin/omcustom'], process.env)
    ).toBe(true);
    expect(
      isNpxInvocation(['/usr/bin/node', '/workspace/dist/cli/index.js'], { npm_command: 'exec' })
    ).toBe(true);
    expect(
      isNpxInvocation(['/usr/bin/node', '/workspace/dist/cli/index.js'], { npm_execpath: 'npx' })
    ).toBe(true);
    expect(isNpxInvocation(['/usr/bin/node', '/workspace/dist/cli/index.js'], {})).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  calculateVersionsBehind,
  checkFrameworkVersion,
  getInstalledVersion,
} from '../../../src/core/doctor-framework.js';

describe('doctor-framework', () => {
  describe('calculateVersionsBehind', () => {
    it('returns 0 when versions match', () => {
      expect(calculateVersionsBehind('0.32.0', '0.32.0')).toBe(0);
    });

    it('returns correct diff when behind', () => {
      expect(calculateVersionsBehind('0.28.0', '0.32.0')).toBe(4);
    });

    it('returns 0 when ahead', () => {
      expect(calculateVersionsBehind('0.35.0', '0.32.0')).toBe(0);
    });

    it('handles single version behind', () => {
      expect(calculateVersionsBehind('0.31.0', '0.32.0')).toBe(1);
    });

    it('handles major version drift — installed behind by a full major', () => {
      // installed=0.1.0, latest=1.5.0 → latestMajor (1) > installedMajor (0)
      // returns (1 - 0) * 100 + 5 = 105
      expect(calculateVersionsBehind('0.1.0', '1.5.0')).toBe(105);
    });

    it('cross-major: installed ahead of latest by a major — returns 0', () => {
      // installed=1.0.0, latest=0.32.0 → installedMajor (1) > latestMajor (0) → return 0
      // Installed is ahead, so there are 0 versions behind
      expect(calculateVersionsBehind('1.0.0', '0.32.0')).toBe(0);
    });

    it('handles patch-only difference — returns 0 because patch is ignored', () => {
      // calculateVersionsBehind only looks at minor; both have minor=32 → returns 0
      expect(calculateVersionsBehind('0.32.1', '0.32.0')).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateVersionsBehind boundary values (v0.33.0)
  // ---------------------------------------------------------------------------

  describe('calculateVersionsBehind boundary values', () => {
    it('0.0.0 vs 0.0.0 returns 0', () => {
      // Both versions are identical with all zeroes — minor diff is 0
      expect(calculateVersionsBehind('0.0.0', '0.0.0')).toBe(0);
    });

    it('large minor: 0.99.0 vs 0.100.0 returns 1', () => {
      // Crossing a 3-digit minor boundary — the diff is exactly 1
      expect(calculateVersionsBehind('0.99.0', '0.100.0')).toBe(1);
    });

    it('version with leading zeros: 0.032.0 vs 0.33.0 — Number("032") === 32', () => {
      // JavaScript's Number('032') === 32 (no octal in Number()), so minor diff = 1
      expect(calculateVersionsBehind('0.032.0', '0.33.0')).toBe(1);
    });

    it('large minor: 0.1.0 vs 0.100.0 returns 99', () => {
      // Boundary: large accumulation without major version jump
      expect(calculateVersionsBehind('0.1.0', '0.100.0')).toBe(99);
    });
  });

  describe('getInstalledVersion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'omcustom-fw-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns null when .omcustomrc.json does not exist', async () => {
      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    it('returns version from .omcustomrc.json', async () => {
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ version: '0.30.0', configVersion: 1 })
      );

      const result = await getInstalledVersion(tempDir);
      expect(result).toBe('0.30.0');
    });

    it('returns null when version field is missing', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), JSON.stringify({ configVersion: 1 }));

      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    // -------------------------------------------------------------------------
    // getInstalledVersion boundary values (v0.33.0)
    // -------------------------------------------------------------------------

    it('returns null for truly empty file (zero bytes)', async () => {
      // Empty string is not valid JSON — JSON.parse('') throws SyntaxError → catch returns null
      await writeFile(join(tempDir, '.omcustomrc.json'), '');

      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    it('returns top-level version when nested config object also has a version field', async () => {
      // Top-level version: "0.31.0" wins over nested config.version: "0.30.0"
      // content.version accesses the top-level key only
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ config: { version: '0.30.0' }, version: '0.31.0' })
      );

      const result = await getInstalledVersion(tempDir);
      expect(result).toBe('0.31.0');
    });

    it('returns null when file contains invalid JSON', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), 'not-valid-json');

      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    it('returns null for empty JSON file', async () => {
      // JSON.parse('') throws a SyntaxError; the catch block returns null
      await writeFile(join(tempDir, '.omcustomrc.json'), '');

      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    it('returns the value as-is when version field is a number (not a string)', async () => {
      // content.version ?? null only replaces null/undefined; a numeric value passes through.
      // This test documents that the function does NOT enforce string type on the version field.
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ version: 32, configVersion: 1 })
      );

      const result = await getInstalledVersion(tempDir);
      // The numeric 32 is returned as-is (not null), since ?? only guards against null/undefined
      expect(result).toBe(32 as unknown as string);
    });
  });

  describe('checkFrameworkVersion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'omcustom-fw-check-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns null when no .omcustomrc.json exists', async () => {
      const result = await checkFrameworkVersion(tempDir, '0.32.0');
      expect(result).toBeNull();
    });

    it('returns isOutdated: true when installed version is behind', async () => {
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ version: '0.28.0', configVersion: 1 })
      );

      const result = await checkFrameworkVersion(tempDir, '0.32.0');
      expect(result).not.toBeNull();
      expect(result?.installed).toBe('0.28.0');
      expect(result?.latest).toBe('0.32.0');
      expect(result?.isOutdated).toBe(true);
      expect(result?.versionsBehind).toBe(4);
    });

    it('returns isOutdated: false when installed version matches', async () => {
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ version: '0.32.0', configVersion: 1 })
      );

      const result = await checkFrameworkVersion(tempDir, '0.32.0');
      expect(result).not.toBeNull();
      expect(result?.isOutdated).toBe(false);
      expect(result?.versionsBehind).toBe(0);
    });

    it('returns isOutdated: true for patch-only difference, versionsBehind: 0', async () => {
      // installed=0.32.0, latest=0.32.1 → installed !== latest → isOutdated: true
      // but calculateVersionsBehind only looks at minor (both 32) → versionsBehind: 0
      await writeFile(
        join(tempDir, '.omcustomrc.json'),
        JSON.stringify({ version: '0.32.0', configVersion: 1 })
      );

      const result = await checkFrameworkVersion(tempDir, '0.32.1');
      expect(result).not.toBeNull();
      expect(result?.installed).toBe('0.32.0');
      expect(result?.latest).toBe('0.32.1');
      expect(result?.isOutdated).toBe(true);
      expect(result?.versionsBehind).toBe(0);
    });
  });
});

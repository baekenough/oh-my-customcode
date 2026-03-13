import { beforeEach, describe, expect, it } from 'bun:test';
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
  });

  describe('getInstalledVersion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'omcustom-fw-test-'));
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

    it('returns null when file contains invalid JSON', async () => {
      await writeFile(join(tempDir, '.omcustomrc.json'), 'not-valid-json');

      const result = await getInstalledVersion(tempDir);
      expect(result).toBeNull();
    });

    // cleanup
    it('cleans up', async () => {
      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('checkFrameworkVersion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'omcustom-fw-check-test-'));
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

    // cleanup
    it('cleans up', async () => {
      await rm(tempDir, { recursive: true, force: true });
    });
  });
});

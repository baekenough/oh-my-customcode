import { beforeEach, describe, expect, it } from 'bun:test';
import {
  formatPreflightWarnings,
  isCI,
  type PreflightResult,
  runPreflightCheck,
} from '../../../src/core/preflight.js';

describe('preflight', () => {
  // Save original environment
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.OMCUSTOM_SKIP_PREFLIGHT;
  });

  describe('isCI', () => {
    it('should return true when CI env var is set', () => {
      process.env.CI = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when GITHUB_ACTIONS env var is set', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return true when OMCUSTOM_SKIP_PREFLIGHT env var is set', () => {
      process.env.OMCUSTOM_SKIP_PREFLIGHT = 'true';
      expect(isCI()).toBe(true);
    });

    it('should return false when no CI env vars are set', () => {
      expect(isCI()).toBe(false);
    });

    it('should return false when CI env vars are not "true"', () => {
      process.env.CI = 'false';
      process.env.GITHUB_ACTIONS = '0';
      expect(isCI()).toBe(false);
    });
  });

  describe('runPreflightCheck', () => {
    it('should return skipped result when skip option is true', async () => {
      const result = await runPreflightCheck({ skip: true });

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Skipped by --skip-version-check flag');
      expect(result.hasUpdates).toBe(false);
      expect(result.tools.length).toBe(0);
    });

    it('should return skipped result in CI environment', async () => {
      process.env.CI = 'true';

      const result = await runPreflightCheck();

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('CI environment detected');
      expect(result.hasUpdates).toBe(false);
    });

    // Note: Additional tests for Homebrew integration would require mocking execSync
    // which is complex in Bun's test environment without a mocking framework.
    // The core logic (CI detection, skip flags, formatting) is tested above.
    // Homebrew-specific behavior can be validated through manual testing or E2E tests.
  });

  describe('formatPreflightWarnings', () => {
    it('should return empty string when no updates available', () => {
      const result: PreflightResult = {
        tools: [
          {
            name: 'claude-code',
            installed: true,
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
            updateAvailable: false,
            installMethod: 'homebrew',
          },
        ],
        hasUpdates: false,
        warnings: [],
        skipped: false,
      };

      const formatted = formatPreflightWarnings(result);
      expect(formatted).toBe('');
    });

    it('should format single tool update correctly', () => {
      const result: PreflightResult = {
        tools: [
          {
            name: 'claude-code',
            installed: true,
            currentVersion: '1.0.0',
            latestVersion: '2.0.0',
            updateAvailable: true,
            installMethod: 'homebrew',
          },
        ],
        hasUpdates: true,
        warnings: [],
        skipped: false,
      };

      const formatted = formatPreflightWarnings(result);

      expect(formatted).toContain('claude-code');
      expect(formatted).toContain('2.0.0');
      expect(formatted).toContain('current: 1.0.0');
      expect(formatted).toContain('brew upgrade claude-code');
      expect(formatted).toContain('--skip-version-check');
    });

    it('should format multiple tool updates correctly', () => {
      const result: PreflightResult = {
        tools: [
          {
            name: 'claude-code',
            installed: true,
            currentVersion: '1.0.0',
            latestVersion: '2.0.0',
            updateAvailable: true,
            installMethod: 'homebrew',
          },
          {
            name: 'some-tool',
            installed: true,
            currentVersion: '0.5.0',
            latestVersion: '1.0.0',
            updateAvailable: true,
            installMethod: 'homebrew',
          },
        ],
        hasUpdates: true,
        warnings: [],
        skipped: false,
      };

      const formatted = formatPreflightWarnings(result);

      expect(formatted).toContain('Run the following to upgrade:');
      expect(formatted).toContain('brew upgrade claude-code');
      expect(formatted).toContain('brew upgrade some-tool');
      expect(formatted).toContain('2.0.0');
      expect(formatted).toContain('1.0.0');
      expect(formatted).toContain('--skip-version-check');
    });

    it('should only show tools with updates available', () => {
      const result: PreflightResult = {
        tools: [
          {
            name: 'claude-code',
            installed: true,
            currentVersion: '1.0.0',
            latestVersion: '2.0.0',
            updateAvailable: true,
            installMethod: 'homebrew',
          },
          {
            name: 'some-tool',
            installed: true,
            currentVersion: '1.0.0',
            latestVersion: '1.0.0',
            updateAvailable: false,
            installMethod: 'homebrew',
          },
        ],
        hasUpdates: true,
        warnings: [],
        skipped: false,
      };

      const formatted = formatPreflightWarnings(result);

      expect(formatted).toContain('claude-code');
      expect(formatted).not.toContain('some-tool');
      // Should use single-tool format
      expect(formatted).toContain('⚠ claude-code 2.0.0 is available');
    });
  });
});

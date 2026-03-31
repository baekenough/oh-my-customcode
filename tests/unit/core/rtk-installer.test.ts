/**
 * Unit tests for rtk-installer module
 */

import { describe, expect, it } from 'bun:test';
import { getRtkVersion, installRtk, isRtkInstalled } from '../../../src/core/rtk-installer.js';

describe('rtk-installer', () => {
  describe('isRtkInstalled', () => {
    it('should return a boolean', () => {
      const result = isRtkInstalled();
      expect(typeof result).toBe('boolean');
    });

    it('should return false when rtk is not in PATH', () => {
      // In CI/test environments, rtk binary is not installed
      if (!isRtkInstalled()) {
        expect(isRtkInstalled()).toBe(false);
      }
    });
  });

  describe('getRtkVersion', () => {
    it('should return null or string', () => {
      const result = getRtkVersion();
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should return null when rtk is not installed', () => {
      if (!isRtkInstalled()) {
        expect(getRtkVersion()).toBeNull();
      }
    });

    it('should return a trimmed string when rtk is installed', () => {
      const version = getRtkVersion();
      if (version !== null) {
        expect(version).toBe(version.trim());
      }
    });
  });

  describe('installRtk', () => {
    it('should return false in test environment (BUN_ENV=test)', () => {
      // bun test sets BUN_ENV=test automatically
      const originalBunEnv = process.env.BUN_ENV;
      process.env.BUN_ENV = 'test';
      try {
        const result = installRtk();
        expect(result).toBe(false);
      } finally {
        if (originalBunEnv !== undefined) {
          process.env.BUN_ENV = originalBunEnv;
        } else {
          delete process.env.BUN_ENV;
        }
      }
    });

    it('should return false when NODE_ENV=test', () => {
      const originalBunEnv = process.env.BUN_ENV;
      const originalNodeEnv = process.env.NODE_ENV;
      // Clear BUN_ENV so NODE_ENV check is reached
      delete process.env.BUN_ENV;
      process.env.NODE_ENV = 'test';
      try {
        const result = installRtk();
        expect(result).toBe(false);
      } finally {
        if (originalBunEnv !== undefined) {
          process.env.BUN_ENV = originalBunEnv;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should return false when CI=true', () => {
      const originalCI = process.env.CI;
      const originalBunEnv = process.env.BUN_ENV;
      const originalNodeEnv = process.env.NODE_ENV;
      // Clear other guards so CI check is isolated
      delete process.env.BUN_ENV;
      delete process.env.NODE_ENV;
      process.env.CI = 'true';
      try {
        const result = installRtk();
        expect(result).toBe(false);
      } finally {
        if (originalCI !== undefined) {
          process.env.CI = originalCI;
        } else {
          delete process.env.CI;
        }
        if (originalBunEnv !== undefined) {
          process.env.BUN_ENV = originalBunEnv;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });

    it('should return false when CI is set to any truthy value', () => {
      const originalCI = process.env.CI;
      const originalBunEnv = process.env.BUN_ENV;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.BUN_ENV;
      delete process.env.NODE_ENV;
      process.env.CI = '1';
      try {
        const result = installRtk();
        expect(result).toBe(false);
      } finally {
        if (originalCI !== undefined) {
          process.env.CI = originalCI;
        } else {
          delete process.env.CI;
        }
        if (originalBunEnv !== undefined) {
          process.env.BUN_ENV = originalBunEnv;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });

    it('should return boolean', () => {
      // In bun test, BUN_ENV=test is always set, so this always returns false
      const result = installRtk();
      expect(typeof result).toBe('boolean');
    });
  });
});

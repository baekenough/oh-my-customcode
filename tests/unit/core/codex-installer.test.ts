/**
 * Unit tests for codex-installer module
 */

import { describe, expect, it } from 'bun:test';
import {
  getCodexVersion,
  type InstallerDeps,
  installCodex,
  isCodexInstalled,
} from '../../../src/core/codex-installer.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<InstallerDeps> = {}): InstallerDeps {
  return {
    exec: () => Buffer.from(''),
    getPlatform: () => 'darwin',
    ...overrides,
  };
}

/**
 * Clear all three env-guard variables and return a restore function.
 * Always call restore() in a finally block.
 */
function clearEnvGuards(): () => void {
  const savedCI = process.env.CI;
  const savedNodeEnv = process.env.NODE_ENV;
  const savedBunEnv = process.env.BUN_ENV;

  delete process.env.CI;
  delete process.env.NODE_ENV;
  delete process.env.BUN_ENV;

  return () => {
    if (savedCI !== undefined) {
      process.env.CI = savedCI;
    } else {
      delete process.env.CI;
    }
    if (savedNodeEnv !== undefined) {
      process.env.NODE_ENV = savedNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (savedBunEnv !== undefined) {
      process.env.BUN_ENV = savedBunEnv;
    } else {
      delete process.env.BUN_ENV;
    }
  };
}

// ---------------------------------------------------------------------------
// isCodexInstalled
// ---------------------------------------------------------------------------

describe('codex-installer', () => {
  describe('isCodexInstalled', () => {
    it('should return a boolean (real env)', () => {
      const result = isCodexInstalled();
      expect(typeof result).toBe('boolean');
    });

    it('should return false when codex is not in PATH (real env)', () => {
      if (!isCodexInstalled()) {
        expect(isCodexInstalled()).toBe(false);
      }
    });

    it('should return true when exec succeeds', () => {
      const deps = createMockDeps({
        exec: () => Buffer.from('/usr/local/bin/codex'),
      });
      expect(isCodexInstalled(deps)).toBe(true);
    });

    it('should return false when exec throws', () => {
      const deps = createMockDeps({
        exec: () => {
          throw new Error('not found');
        },
      });
      expect(isCodexInstalled(deps)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getCodexVersion
  // ---------------------------------------------------------------------------

  describe('getCodexVersion', () => {
    it('should return null or string (real env)', () => {
      const result = getCodexVersion();
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should return null when codex is not installed (real env)', () => {
      if (!isCodexInstalled()) {
        expect(getCodexVersion()).toBeNull();
      }
    });

    it('should return a trimmed string when codex is installed (real env)', () => {
      const version = getCodexVersion();
      if (version !== null) {
        expect(version).toBe(version.trim());
      }
    });

    it('should return trimmed version string when exec succeeds', () => {
      const deps = createMockDeps({
        exec: () => '0.117.0\n' as unknown as Buffer,
      });
      expect(getCodexVersion(deps)).toBe('0.117.0');
    });

    it('should return null when exec throws', () => {
      const deps = createMockDeps({
        exec: () => {
          throw new Error('command not found');
        },
      });
      expect(getCodexVersion(deps)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // installCodex — env-guard branches
  // ---------------------------------------------------------------------------

  describe('installCodex — env guards', () => {
    it('should return false in test environment (BUN_ENV=test)', () => {
      const originalBunEnv = process.env.BUN_ENV;
      process.env.BUN_ENV = 'test';
      try {
        expect(installCodex()).toBe(false);
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
      delete process.env.BUN_ENV;
      process.env.NODE_ENV = 'test';
      try {
        expect(installCodex()).toBe(false);
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
      delete process.env.BUN_ENV;
      delete process.env.NODE_ENV;
      process.env.CI = 'true';
      try {
        expect(installCodex()).toBe(false);
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
        expect(installCodex()).toBe(false);
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

    it('should return boolean (bun always sets BUN_ENV=test)', () => {
      expect(typeof installCodex()).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // installCodex — mock-based install branches
  // ---------------------------------------------------------------------------

  describe('installCodex — install branches (mock deps)', () => {
    it('should return true immediately when codex is already installed', () => {
      const restore = clearEnvGuards();
      try {
        let callCount = 0;
        const deps = createMockDeps({
          // First call = isCodexInstalled check → succeeds
          exec: () => {
            callCount++;
            return Buffer.from('/usr/local/bin/codex');
          },
          getPlatform: () => 'darwin',
        });
        const result = installCodex(deps);
        expect(result).toBe(true);
        // exec called exactly once (for which codex)
        expect(callCount).toBe(1);
      } finally {
        restore();
      }
    });

    it('should install via brew on darwin and return true', () => {
      const restore = clearEnvGuards();
      try {
        const commands: string[] = [];
        // Call sequence:
        //   1. isCodexInstalled() before install → throws (not installed)
        //   2. brew install → succeeds
        //   3. isCodexInstalled() after brew → succeeds
        let call = 0;
        const deps = createMockDeps({
          exec: (cmd) => {
            call++;
            commands.push(cmd);
            if (call === 1) {
              throw new Error('not found');
            }
            return Buffer.from('ok');
          },
          getPlatform: () => 'darwin',
        });
        expect(installCodex(deps)).toBe(true);
        expect(commands[1]).toBe('brew install openai-codex');
      } finally {
        restore();
      }
    });

    it('should fall back to npm on darwin when brew fails, and return true', () => {
      const restore = clearEnvGuards();
      try {
        const commands: string[] = [];
        // Call sequence:
        //   1. isCodexInstalled() before → throws
        //   2. brew install → throws
        //   3. npm install → succeeds
        //   4. isCodexInstalled() after npm → succeeds
        let call = 0;
        const deps = createMockDeps({
          exec: (cmd) => {
            call++;
            commands.push(cmd);
            if (call === 1) {
              throw new Error('not found');
            }
            if (cmd.startsWith('brew')) {
              throw new Error('brew failed');
            }
            return Buffer.from('ok');
          },
          getPlatform: () => 'darwin',
        });
        expect(installCodex(deps)).toBe(true);
        expect(commands).toContain('brew install openai-codex');
        expect(commands).toContain('npm install -g @openai/codex');
      } finally {
        restore();
      }
    });

    it('should install via npm on linux and return true', () => {
      const restore = clearEnvGuards();
      try {
        const commands: string[] = [];
        let call = 0;
        const deps = createMockDeps({
          exec: (cmd) => {
            call++;
            commands.push(cmd);
            if (call === 1) {
              throw new Error('not found');
            }
            return Buffer.from('ok');
          },
          getPlatform: () => 'linux',
        });
        expect(installCodex(deps)).toBe(true);
        expect(commands).toContain('npm install -g @openai/codex');
      } finally {
        restore();
      }
    });

    it('should return false for unsupported OS', () => {
      const restore = clearEnvGuards();
      try {
        const deps = createMockDeps({
          exec: () => {
            throw new Error('not found');
          },
          getPlatform: () => 'win32',
        });
        expect(installCodex(deps)).toBe(false);
      } finally {
        restore();
      }
    });

    it('should return false when all install methods fail (outer catch)', () => {
      const restore = clearEnvGuards();
      try {
        // On linux, npm throws → outer catch returns false
        let call = 0;
        const deps = createMockDeps({
          exec: (_cmd) => {
            call++;
            if (call === 1) {
              // isCodexInstalled check → not installed
              throw new Error('not found');
            }
            // npm install fails
            throw new Error('install failed');
          },
          getPlatform: () => 'linux',
        });
        expect(installCodex(deps)).toBe(false);
      } finally {
        restore();
      }
    });

    it('should return false when darwin brew AND npm both fail (outer catch)', () => {
      const restore = clearEnvGuards();
      try {
        const deps = createMockDeps({
          exec: (cmd) => {
            if (cmd === 'which codex') {
              throw new Error('not found');
            }
            // both brew and npm throw
            throw new Error('install failed');
          },
          getPlatform: () => 'darwin',
        });
        expect(installCodex(deps)).toBe(false);
      } finally {
        restore();
      }
    });
  });
});

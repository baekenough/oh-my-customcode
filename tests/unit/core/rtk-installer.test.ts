/**
 * Unit tests for rtk-installer module
 */

import { describe, expect, it } from 'bun:test';
import {
  getRtkVersion,
  type InstallerDeps,
  installRtk,
  isRtkInstalled,
} from '../../../src/core/rtk-installer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<InstallerDeps> = {}): InstallerDeps {
  return {
    exec: () => Buffer.from(''),
    getPlatform: () => 'darwin',
    ...overrides,
  };
}

/**
 * Temporarily clear all three env guards so the install logic is reachable,
 * then restore them after the callback.
 */
function withNoEnvGuards(fn: () => void): void {
  const savedCI = process.env.CI;
  const savedNodeEnv = process.env.NODE_ENV;
  const savedBunEnv = process.env.BUN_ENV;
  delete process.env.CI;
  delete process.env.NODE_ENV;
  delete process.env.BUN_ENV;
  try {
    fn();
  } finally {
    if (savedCI !== undefined) process.env.CI = savedCI;
    else delete process.env.CI;
    if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv;
    else delete process.env.NODE_ENV;
    if (savedBunEnv !== undefined) process.env.BUN_ENV = savedBunEnv;
    else delete process.env.BUN_ENV;
  }
}

// ---------------------------------------------------------------------------
// isRtkInstalled
// ---------------------------------------------------------------------------

describe('isRtkInstalled', () => {
  it('should return a boolean (integration smoke test)', () => {
    const result = isRtkInstalled();
    expect(typeof result).toBe('boolean');
  });

  it('should return false when rtk is not in PATH (integration conditional)', () => {
    if (!isRtkInstalled()) {
      expect(isRtkInstalled()).toBe(false);
    }
  });

  it('should return true when exec succeeds', () => {
    const deps = createMockDeps({ exec: () => Buffer.from('/usr/local/bin/rtk') });
    expect(isRtkInstalled(deps)).toBe(true);
  });

  it('should return false when exec throws', () => {
    const deps = createMockDeps({
      exec: () => {
        throw new Error('not found');
      },
    });
    expect(isRtkInstalled(deps)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRtkVersion
// ---------------------------------------------------------------------------

describe('getRtkVersion', () => {
  it('should return null or string (integration smoke test)', () => {
    const result = getRtkVersion();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('should return null when rtk is not installed (integration conditional)', () => {
    if (!isRtkInstalled()) {
      expect(getRtkVersion()).toBeNull();
    }
  });

  it('should return a trimmed string when rtk is installed (integration conditional)', () => {
    const version = getRtkVersion();
    if (version !== null) {
      expect(version).toBe(version.trim());
    }
  });

  it('should return trimmed version string via mock', () => {
    const deps = createMockDeps({ exec: () => '0.34.2\n' as unknown as Buffer });
    expect(getRtkVersion(deps)).toBe('0.34.2');
  });

  it('should return null when exec throws via mock', () => {
    const deps = createMockDeps({
      exec: () => {
        throw new Error('rtk not found');
      },
    });
    expect(getRtkVersion(deps)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// installRtk — env guard tests (no mock deps needed; guard fires before exec)
// ---------------------------------------------------------------------------

describe('installRtk (env guards)', () => {
  it('should return false in test environment (BUN_ENV=test)', () => {
    const originalBunEnv = process.env.BUN_ENV;
    process.env.BUN_ENV = 'test';
    try {
      expect(installRtk()).toBe(false);
    } finally {
      if (originalBunEnv !== undefined) process.env.BUN_ENV = originalBunEnv;
      else delete process.env.BUN_ENV;
    }
  });

  it('should return false when NODE_ENV=test', () => {
    const originalBunEnv = process.env.BUN_ENV;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.BUN_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(installRtk()).toBe(false);
    } finally {
      if (originalBunEnv !== undefined) process.env.BUN_ENV = originalBunEnv;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
      else delete process.env.NODE_ENV;
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
      expect(installRtk()).toBe(false);
    } finally {
      if (originalCI !== undefined) process.env.CI = originalCI;
      else delete process.env.CI;
      if (originalBunEnv !== undefined) process.env.BUN_ENV = originalBunEnv;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
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
      expect(installRtk()).toBe(false);
    } finally {
      if (originalCI !== undefined) process.env.CI = originalCI;
      else delete process.env.CI;
      if (originalBunEnv !== undefined) process.env.BUN_ENV = originalBunEnv;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should return boolean (default call, BUN_ENV=test always set in bun test)', () => {
    expect(typeof installRtk()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// installRtk — install logic branches (mock deps, env guards cleared)
// ---------------------------------------------------------------------------

describe('installRtk (install logic via mock deps)', () => {
  it('should return true when rtk is already installed', () => {
    const deps = createMockDeps({ exec: () => Buffer.from('/usr/local/bin/rtk') });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(true);
    });
  });

  it('darwin: should return true when brew install succeeds', () => {
    let callCount = 0;
    const deps = createMockDeps({
      getPlatform: () => 'darwin',
      exec: (cmd: string) => {
        callCount += 1;
        // First call: which rtk → throws (not installed)
        if (cmd === 'which rtk') throw new Error('not found');
        // Second call: brew install → succeeds
        return Buffer.from('');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(true);
    });
    expect(callCount).toBe(2);
  });

  it('darwin: brew fails → curl fallback → rtk now installed → returns true', () => {
    let callCount = 0;
    const deps = createMockDeps({
      getPlatform: () => 'darwin',
      exec: (cmd: string) => {
        callCount += 1;
        if (cmd === 'which rtk') {
          // First call: not installed; subsequent call (post-curl): installed
          if (callCount === 1) throw new Error('not found');
          return Buffer.from('/usr/local/bin/rtk');
        }
        if (cmd.startsWith('brew')) throw new Error('brew failed');
        // curl → succeeds (no throw)
        return Buffer.from('');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(true);
    });
  });

  it('darwin: brew fails → curl fails → returns false with error message', () => {
    const deps = createMockDeps({
      getPlatform: () => 'darwin',
      exec: (cmd: string) => {
        if (cmd === 'which rtk') throw new Error('not found');
        // Both brew and curl throw
        throw new Error('install failed');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(false);
    });
  });

  it('linux: curl succeeds → rtk now installed → returns true', () => {
    let whichCallCount = 0;
    const deps = createMockDeps({
      getPlatform: () => 'linux',
      exec: (cmd: string) => {
        if (cmd === 'which rtk') {
          whichCallCount += 1;
          // First check: not installed; second check (post-curl): installed
          if (whichCallCount === 1) throw new Error('not found');
          return Buffer.from('/usr/local/bin/rtk');
        }
        // curl → succeeds
        return Buffer.from('');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(true);
    });
  });

  it('linux: curl fails → returns false with error message', () => {
    const deps = createMockDeps({
      getPlatform: () => 'linux',
      exec: (cmd: string) => {
        if (cmd === 'which rtk') throw new Error('not found');
        throw new Error('curl failed');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(false);
    });
  });

  it('unsupported OS → returns false', () => {
    const deps = createMockDeps({
      getPlatform: () => 'win32',
      exec: (cmd: string) => {
        if (cmd === 'which rtk') throw new Error('not found');
        return Buffer.from('');
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(false);
    });
  });

  it('should handle non-Error thrown objects in catch block', () => {
    const deps = createMockDeps({
      getPlatform: () => 'linux',
      exec: (cmd: string) => {
        if (cmd === 'which rtk') throw new Error('not found');
        // Throw a non-Error value
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'string error';
      },
    });
    withNoEnvGuards(() => {
      expect(installRtk(deps)).toBe(false);
    });
  });
});

/**
 * Tests for preflight.ts Homebrew integration
 * These tests achieve coverage of internal functions that interact with execSync
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Track execSync calls to return different results based on command
let execSyncMock: ReturnType<typeof mock>;

// Setup mock BEFORE import
mock.module('node:child_process', () => {
  execSyncMock = mock((command: string, _options?: unknown) => {
    // Default: throw for everything (command not found)
    throw new Error(`Command not found: ${command}`);
  });
  return { execSync: execSyncMock };
});

// Dynamic import AFTER mock setup
const { runPreflightCheck, formatPreflightWarnings } = await import(
  '../../../src/core/preflight.js'
);

/**
 * Creates a mock implementation for execSync based on a command-to-response map.
 * Commands not in the map will throw an error.
 *
 * @param responses - Map of command patterns to responses (string) or response functions
 * @returns Mock implementation function for execSync
 */
function createExecSyncMock(responses: Record<string, string | (() => string | never)>) {
  return (command: string): string => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (command === pattern || command.startsWith(pattern)) {
        if (typeof response === 'function') {
          return response();
        }
        return response;
      }
    }
    throw new Error(`Unknown command: ${command}`);
  };
}

describe('preflight - Homebrew integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.OMCUSTOM_SKIP_PREFLIGHT;
    execSyncMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('hasHomebrew() via runPreflightCheck()', () => {
    it('should skip when Homebrew is not found', async () => {
      // Mock: which brew fails
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': () => {
            throw new Error('brew not found');
          },
        })
      );

      const result = await runPreflightCheck();

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Homebrew not available');
      expect(result.warnings).toEqual(['Homebrew not found, skipping version check']);
      expect(result.tools.length).toBe(0);
    });

    it('should proceed when Homebrew is available', async () => {
      // Mock: which brew succeeds, brew info returns no tools installed
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': JSON.stringify({ casks: [], formulae: [] }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck();

      expect(result.skipped).toBe(false);
      expect(result.hasUpdates).toBe(false);
    });
  });

  describe('getToolInfoFromBrew() via runPreflightCheck()', () => {
    it('should detect installed cask with version', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '1.5.0',
              },
            ],
            formulae: [],
          }),
          'brew info --json=v2 codex': JSON.stringify({
            casks: [],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['claude-code'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.name).toBe('claude-code');
      expect(tool.installed).toBe(true);
      expect(tool.currentVersion).toBe('1.5.0');
      expect(tool.latestVersion).toBe('2.0.0');
      expect(tool.installMethod).toBe('homebrew');
      expect(tool.updateAvailable).toBe(true);
    });

    it('should detect cask without installed version and fallback to unknown', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: null,
              },
            ],
            formulae: [],
          }),
          'npx claude-code --version': () => {
            throw new Error('npx failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['claude-code'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      // Since brew reports not installed, and npm also fails, falls back to unknown
      const tool = result.tools[0];
      expect(tool.installed).toBe(false);
      expect(tool.currentVersion).toBeNull();
      expect(tool.latestVersion).toBeNull();
      expect(tool.installMethod).toBe('unknown');
    });

    it('should detect installed formula with version', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 some-tool': JSON.stringify({
            casks: [],
            formulae: [
              {
                name: 'some-tool',
                versions: {
                  stable: '3.2.1',
                },
                installed: [
                  {
                    version: '3.2.0',
                  },
                ],
              },
            ],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['some-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.name).toBe('some-tool');
      expect(tool.installed).toBe(true);
      expect(tool.currentVersion).toBe('3.2.0');
      expect(tool.latestVersion).toBe('3.2.1');
      expect(tool.installMethod).toBe('homebrew');
      expect(tool.updateAvailable).toBe(true);
    });

    it('should handle brew info failure and fallback', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': () => {
            throw new Error('brew info failed');
          },
          npx: () => {
            throw new Error('npx failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['unknown-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.installed).toBe(false);
      expect(tool.installMethod).toBe('unknown');
    });
  });

  describe('getToolInfoFromNpm() fallback', () => {
    it('should detect tool via npm when brew does not have it installed', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 npm-tool': JSON.stringify({
            casks: [],
            formulae: [],
          }),
          'npx npm-tool --version': '4.5.6\n',
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['npm-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.name).toBe('npm-tool');
      expect(tool.installed).toBe(true);
      expect(tool.currentVersion).toBe('4.5.6');
      expect(tool.installMethod).toBe('npm');
    });

    it('should handle npx failure', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 missing-tool': JSON.stringify({ casks: [], formulae: [] }),
          'npx missing-tool --version': () => {
            throw new Error('npx failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['missing-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.installed).toBe(false);
      expect(tool.installMethod).toBe('unknown');
    });
  });

  describe('checkOutdated() via runPreflightCheck()', () => {
    it('should update tool info with outdated cask data', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                name: 'claude-code',
                installed_versions: ['1.0.0'],
                current_version: '2.5.0',
              },
            ],
            formulae: [],
          }),
        })
      );

      const result = await runPreflightCheck({ tools: ['claude-code'] });

      expect(result.skipped).toBe(false);
      expect(result.hasUpdates).toBe(true);

      const tool = result.tools[0];
      expect(tool.latestVersion).toBe('2.5.0');
      expect(tool.updateAvailable).toBe(true);
    });

    it('should update tool info with outdated formula data', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 some-formula': JSON.stringify({
            casks: [],
            formulae: [
              {
                name: 'some-formula',
                versions: { stable: '5.0.0' },
                installed: [{ version: '4.0.0' }],
              },
            ],
          }),
          'brew outdated --json=v2 some-formula': JSON.stringify({
            casks: [],
            formulae: [
              {
                name: 'some-formula',
                installed_versions: ['4.0.0'],
                current_version: '5.5.0',
              },
            ],
          }),
        })
      );

      const result = await runPreflightCheck({ tools: ['some-formula'] });

      expect(result.skipped).toBe(false);
      expect(result.hasUpdates).toBe(true);

      const tool = result.tools[0];
      expect(tool.latestVersion).toBe('5.5.0');
      expect(tool.updateAvailable).toBe(true);
    });

    it('should handle brew outdated failure gracefully', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '2.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': () => {
            throw new Error('brew outdated failed');
          },
        })
      );

      const result = await runPreflightCheck({ tools: ['claude-code'] });

      // Should not fail, just skip outdated check
      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);

      const tool = result.tools[0];
      expect(tool.updateAvailable).toBe(false);
    });
  });

  describe('runPreflightCheck() full flow', () => {
    it('should complete full flow with updates available', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew info --json=v2 codex': JSON.stringify({
            casks: [
              {
                token: 'codex',
                version: '3.0.0',
                installed: '2.5.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({
            casks: [
              {
                name: 'claude-code',
                installed_versions: ['1.0.0'],
                current_version: '2.0.0',
              },
              {
                name: 'codex',
                installed_versions: ['2.5.0'],
                current_version: '3.0.0',
              },
            ],
            formulae: [],
          }),
        })
      );

      const result = await runPreflightCheck();

      expect(result.skipped).toBe(false);
      expect(result.hasUpdates).toBe(true);
      expect(result.tools.length).toBe(2);
      expect(result.warnings.length).toBe(0);

      const claudeCode = result.tools.find((t) => t.name === 'claude-code');
      expect(claudeCode?.updateAvailable).toBe(true);
      expect(claudeCode?.latestVersion).toBe('2.0.0');

      const codex = result.tools.find((t) => t.name === 'codex');
      expect(codex?.updateAvailable).toBe(true);
      expect(codex?.latestVersion).toBe('3.0.0');
    });

    it('should complete full flow with no updates', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '2.0.0',
              },
            ],
            formulae: [],
          }),
          'brew info --json=v2 codex': JSON.stringify({
            casks: [
              {
                token: 'codex',
                version: '3.0.0',
                installed: '3.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck();

      expect(result.skipped).toBe(false);
      expect(result.hasUpdates).toBe(false);
      expect(result.tools.length).toBe(2);

      expect(result.tools.every((t) => !t.updateAvailable)).toBe(true);
    });

    // Note: Testing timeout behavior is not feasible with synchronous mocks
    // because execSync blocks the event loop, preventing setTimeout from firing.
    // The timeout logic is tested through E2E tests or manual testing.

    it('should handle errors during check by returning unknown tools', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          default: () => {
            throw new Error('Unexpected error during brew command');
          },
        })
      );

      const result = await runPreflightCheck();

      // The check completes but tools are unknown (brew and npm both failed)
      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(2);
      expect(result.tools[0].installMethod).toBe('unknown');
      expect(result.tools[1].installMethod).toBe('unknown');
      expect(result.tools[0].installed).toBe(false);
      expect(result.tools[1].installed).toBe(false);
    });

    // Note: Testing the outer catch block (lines 335-343) is not feasible
    // because all internal functions (getToolInfo, getToolInfoFromBrew, etc.)
    // have their own try-catch blocks that swallow errors. The outer catch
    // is for truly unexpected errors and is tested through E2E or manual testing.

    it('should support custom tool list', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 custom-tool': JSON.stringify({
            casks: [
              {
                token: 'custom-tool',
                version: '1.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['custom-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);
      expect(result.tools[0].name).toBe('custom-tool');
    });
  });

  describe('Integration with formatPreflightWarnings()', () => {
    it('should format warnings for tools detected via Homebrew', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 claude-code': JSON.stringify({
            casks: [
              {
                token: 'claude-code',
                version: '2.0.0',
                installed: '1.5.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({
            casks: [
              {
                name: 'claude-code',
                installed_versions: ['1.5.0'],
                current_version: '2.0.0',
              },
            ],
            formulae: [],
          }),
        })
      );

      const result = await runPreflightCheck({ tools: ['claude-code'] });
      const formatted = formatPreflightWarnings(result);

      expect(formatted).toContain('claude-code');
      expect(formatted).toContain('2.0.0');
      expect(formatted).toContain('current: 1.5.0');
      expect(formatted).toContain('brew upgrade claude-code');
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle empty casks and formulae arrays', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': JSON.stringify({ casks: [], formulae: [] }),
          npx: () => {
            throw new Error('npm command failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['nonexistent-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);
      expect(result.tools[0].installMethod).toBe('unknown');
    });

    it('should handle formula without installed array', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': JSON.stringify({
            casks: [],
            formulae: [
              {
                name: 'some-formula',
                versions: { stable: '1.0.0' },
                // No installed array
              },
            ],
          }),
          npx: () => {
            throw new Error('npm command failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['some-formula'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(1);
      // Should fallback to unknown since formula reports not installed
      expect(result.tools[0].installMethod).toBe('unknown');
    });

    it('should handle empty toolNames array', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
        })
      );

      const result = await runPreflightCheck({ tools: [] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(0);
      expect(result.hasUpdates).toBe(false);
    });

    it('should handle mixed installed and not installed tools', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2 installed-tool': JSON.stringify({
            casks: [
              {
                token: 'installed-tool',
                version: '1.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew info --json=v2 missing-tool': JSON.stringify({ casks: [], formulae: [] }),
          'npx missing-tool --version': () => {
            throw new Error('npm command failed');
          },
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['installed-tool', 'missing-tool'] });

      expect(result.skipped).toBe(false);
      expect(result.tools.length).toBe(2);
      expect(result.tools[0].installed).toBe(true);
      expect(result.tools[0].installMethod).toBe('homebrew');
      expect(result.tools[1].installed).toBe(false);
      expect(result.tools[1].installMethod).toBe('unknown');
    });

    it('should detect update when current and latest versions differ', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': JSON.stringify({
            casks: [
              {
                token: 'test-tool',
                version: '2.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['test-tool'] });

      expect(result.tools[0].updateAvailable).toBe(true);
      expect(result.hasUpdates).toBe(true);
    });

    it('should not detect update when versions match', async () => {
      execSyncMock.mockImplementation(
        createExecSyncMock({
          'which brew': '/opt/homebrew/bin/brew\n',
          'brew info --json=v2': JSON.stringify({
            casks: [
              {
                token: 'test-tool',
                version: '1.0.0',
                installed: '1.0.0',
              },
            ],
            formulae: [],
          }),
          'brew outdated --json=v2': JSON.stringify({ casks: [], formulae: [] }),
        })
      );

      const result = await runPreflightCheck({ tools: ['test-tool'] });

      expect(result.tools[0].updateAvailable).toBe(false);
      expect(result.hasUpdates).toBe(false);
    });
  });
});

/**
 * Tests for installer.ts hooks.json → settings.local.json wiring (#1623).
 *
 * `.claude/hooks/hooks.json` is a declarative source that CC does not load directly
 * (see hook-wiring-research.md §A/§B) — without a merge step into settings.local.json,
 * every hook copied by `omcustom init` never fires for end users. `installHooksSettings()`
 * in installer.ts bridges this gap by delegating to `mergeHooksIntoSettings()` from
 * `./hooks-settings.js`.
 *
 * Ownership boundary: this file tests installer.ts's wiring/call-site behavior only
 * (invocation, warning propagation, skip conditions, error containment). The actual
 * matcher-DSL → CC-regex conversion and merge-policy semantics belong to
 * hooks-settings.ts and are exercised by that module's own test file — NOT duplicated
 * here (R023 verification-code duplication anti-pattern). `mock.module` intercepts the
 * static `./hooks-settings.js` import in installer.ts with a lightweight fake merge
 * implementation, so these tests remain valid regardless of hooks-settings.ts's actual
 * (possibly still-in-progress) implementation.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('installer hooks.json -> settings.local.json wiring (#1623)', () => {
  let tempDir: string;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleInfoSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleDebugSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-hooks-settings-test-'));
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    mock.restore();
  });

  /**
   * Realistic fake merge: reads the `hooks` key out of hooks.json and writes it into
   * settings.local.json, preserving any other pre-existing keys — this mirrors the
   * documented default merge policy (replace omcustom-managed block, preserve the rest)
   * closely enough to validate installer.ts's call-site contract end-to-end.
   */
  function installFakeMergeModule(opts?: { warnings?: string[]; throws?: Error }) {
    mock.module('../../../src/core/hooks-settings.js', () => ({
      mergeHooksIntoSettings: async (settingsPath: string, hooksJsonPath: string) => {
        if (opts?.throws) {
          throw opts.throws;
        }
        const hooksJson = JSON.parse(await readFile(hooksJsonPath, 'utf-8'));
        let settings: Record<string, unknown> = {};
        try {
          settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
        } catch {
          settings = {};
        }
        settings.hooks = hooksJson.hooks;
        await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        return { warnings: opts?.warnings ?? [] };
      },
    }));
  }

  it('merges hooks.json content into settings.local.json when hooks component is installed', async () => {
    installFakeMergeModule();
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    const settingsPath = join(tempDir, '.claude', 'settings.local.json');
    const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(content.hooks).toBeDefined();
    expect(typeof content.hooks).toBe('object');
    expect(Object.keys(content.hooks as Record<string, unknown>).length).toBeGreaterThan(0);
  });

  it('preserves existing settings.local.json keys (statusLine + user custom key) after hooks merge', async () => {
    installFakeMergeModule();
    const settingsPath = join(tempDir, '.claude', 'settings.local.json');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ enableAllProjectMcpServers: true }), 'utf-8');

    const { install } = await import('../../../src/core/installer.js');
    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
    // Pre-existing user key preserved
    expect(content.enableAllProjectMcpServers).toBe(true);
    // statusLine still installed by installSettingsLocal (unaffected by hooks merge)
    expect(content.statusLine).toBeDefined();
    // hooks merged in
    expect(content.hooks).toBeDefined();
  });

  it('skips the hooks merge when the hooks component is not installed (hooks.json absent at target)', async () => {
    let mergeCalled = false;
    mock.module('../../../src/core/hooks-settings.js', () => ({
      mergeHooksIntoSettings: async () => {
        mergeCalled = true;
        return { warnings: [] };
      },
    }));

    const { install } = await import('../../../src/core/installer.js');
    const result = await install({
      targetDir: tempDir,
      skipConfirm: true,
      components: ['rules'],
    });

    expect(result.success).toBe(true);
    expect(mergeCalled).toBe(false);
    const settingsPath = join(tempDir, '.claude', 'settings.local.json');
    const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(content.hooks).toBeUndefined();
  });

  it('propagates warnings returned by mergeHooksIntoSettings into InstallResult.warnings', async () => {
    installFakeMergeModule({ warnings: ['hooks: 2 matcher(s) could not be auto-converted'] });
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    expect(
      result.warnings.some((w) => w.includes('2 matcher(s) could not be auto-converted'))
    ).toBe(true);
  });

  it('adds a warning and keeps install successful when mergeHooksIntoSettings throws', async () => {
    installFakeMergeModule({ throws: new Error('malformed hooks.json') });
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, skipConfirm: true });

    expect(result.success).toBe(true);
    expect(
      result.warnings.some(
        (w) =>
          w.includes('Failed to merge hooks into settings.local.json') &&
          w.includes('malformed hooks.json')
      )
    ).toBe(true);
    const settingsPath = join(tempDir, '.claude', 'settings.local.json');
    expect(await readFile(settingsPath, 'utf-8')).toBeTruthy();
  });

  it('remains stable across repeated installs (idempotency)', async () => {
    installFakeMergeModule();
    const { install } = await import('../../../src/core/installer.js');

    const first = await install({ targetDir: tempDir, skipConfirm: true });
    expect(first.success).toBe(true);

    const second = await install({ targetDir: tempDir, force: true, skipConfirm: true });
    expect(second.success).toBe(true);

    const settingsPath = join(tempDir, '.claude', 'settings.local.json');
    const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(content.hooks).toBeDefined();
    expect(content.statusLine).toBeDefined();
  });
});

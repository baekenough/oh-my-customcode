/**
 * End-to-end tests for the installer's hooks -> settings.local.json step opting into
 * `preserveUserHooks` (#1768).
 *
 * Runs install() for real against a temp project with the REAL mergeHooksIntoSettings (it is
 * never mocked here). Only the RTK/Codex installers are replaced, since they would shell out to
 * package managers; the originals are re-registered in afterAll so the mocks do not leak into
 * other test files (#1772).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_OMCUSTOM_DESCRIPTIONS } from '../../../src/core/hook-group-merge.js';

// Capture the real modules before any mock.module call (bun's mock.module persists across files).
const realRtkInstaller = { ...(await import('../../../src/core/rtk-installer.js')) };
const realCodexInstaller = { ...(await import('../../../src/core/codex-installer.js')) };

afterAll(() => {
  mock.module('../../../src/core/rtk-installer.js', () => realRtkInstaller);
  mock.module('../../../src/core/codex-installer.js', () => realCodexInstaller);
});

interface HookEntry {
  type?: string;
  command?: string;
}

interface HookGroup {
  matcher?: string;
  description?: string;
  hooks?: HookEntry[];
}

type HookBlocks = Record<string, HookGroup[]>;

const BOM = '﻿';
const USER_COMMAND = 'bash ~/my-team/audit.sh --strict';
const USER_ONLY_EVENT_COMMAND = 'bash ~/my-team/notify.sh';
const STALE_COMMAND = 'echo stale-omcustom-group';

function commandsOf(hooks: HookBlocks | undefined, event: string): string[] {
  return (hooks?.[event] ?? []).flatMap((group) => (group.hooks ?? []).map((h) => h.command ?? ''));
}

describe('installer hooks step preserves user hooks (#1768)', () => {
  let tempDir: string;
  let settingsPath: string;
  let consoleSpies: Array<ReturnType<typeof spyOn>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-hooks-preserve-test-'));
    settingsPath = join(tempDir, '.claude', 'settings.local.json');
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {})
    );
    mock.module('../../../src/core/rtk-installer.js', () => ({
      isRtkInstalled: () => true,
      installRtk: () => true,
      getRtkVersion: () => '1.0.0',
    }));
    mock.module('../../../src/core/codex-installer.js', () => ({
      isCodexInstalled: () => true,
      installCodex: () => true,
      getCodexVersion: () => '1.0.0',
    }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    mock.restore();
  });

  async function runInstall() {
    const { install } = await import('../../../src/core/installer.js');
    return install({ targetDir: tempDir, skipConfirm: true });
  }

  async function readSettings(): Promise<Record<string, unknown> & { hooks?: HookBlocks }> {
    return JSON.parse((await readFile(settingsPath, 'utf-8')).replace(BOM, ''));
  }

  async function seedSettings(text: string): Promise<void> {
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(settingsPath, text, 'utf-8');
  }

  async function generatedHooks(): Promise<HookBlocks> {
    // A clean install writes only generated hooks (settings.local.json did not exist before).
    const result = await runInstall();
    expect(result.success).toBe(true);
    const hooks = (await readSettings()).hooks as HookBlocks;
    await rm(settingsPath, { force: true });
    return hooks;
  }

  it('keeps a user hook group (same event + user-only event) and other keys across install', async () => {
    const baseline = await generatedHooks();
    const event = Object.keys(baseline)[0] as string;
    await seedSettings(
      JSON.stringify({
        mySetting: 'keep-me',
        hooks: {
          [event]: [{ matcher: '*', hooks: [{ type: 'command', command: USER_COMMAND }] }],
          MyCustomEvent: [{ hooks: [{ type: 'command', command: USER_ONLY_EVENT_COMMAND }] }],
        },
      })
    );

    const result = await runInstall();

    expect(result.success).toBe(true);
    const settings = await readSettings();
    expect(settings.mySetting).toBe('keep-me');
    expect(commandsOf(settings.hooks, event)).toContain(USER_COMMAND);
    expect(commandsOf(settings.hooks, 'MyCustomEvent')).toEqual([USER_ONLY_EVENT_COMMAND]);
    // Every generated omcustom group is still present exactly once.
    for (const [name, groups] of Object.entries(baseline)) {
      for (const group of groups) {
        const matches = (settings.hooks?.[name] ?? []).filter(
          (g) => JSON.stringify(g) === JSON.stringify(group)
        );
        expect(matches).toHaveLength(1);
      }
    }
  });

  it('replaces a stale omcustom group instead of keeping it as a user hook', async () => {
    const baseline = await generatedHooks();
    await seedSettings(
      JSON.stringify({
        hooks: {
          SubagentStop: [
            {
              description: LEGACY_OMCUSTOM_DESCRIPTIONS[0],
              hooks: [{ type: 'command', command: STALE_COMMAND }],
            },
          ],
        },
      })
    );

    const result = await runInstall();

    expect(result.success).toBe(true);
    const settings = await readSettings();
    expect(JSON.stringify(settings.hooks)).not.toContain(STALE_COMMAND);
    expect(settings.hooks).toEqual(baseline);
  });

  it('is idempotent: a second install leaves settings.local.json byte-identical', async () => {
    await seedSettings(
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command: USER_COMMAND }] }] },
      })
    );

    await runInstall();
    const first = await readFile(settingsPath, 'utf-8');
    const result = await runInstall();
    const second = await readFile(settingsPath, 'utf-8');

    expect(result.success).toBe(true);
    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(commandsOf((await readSettings()).hooks, 'Stop')).toContain(USER_COMMAND);
  });

  it('preserves the BOM and user keys of a BOM-prefixed settings.local.json', async () => {
    await seedSettings(
      `${BOM}${JSON.stringify({ mySetting: 'keep-me', hooks: { Stop: [{ hooks: [{ type: 'command', command: USER_COMMAND }] }] } })}\n`
    );

    const result = await runInstall();

    expect(result.success).toBe(true);
    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.startsWith(BOM)).toBe(true);
    const settings = await readSettings();
    expect(settings.mySetting).toBe('keep-me');
    expect(commandsOf(settings.hooks, 'Stop')).toContain(USER_COMMAND);
    expect(Object.keys(settings.hooks ?? {}).length).toBeGreaterThan(1);
  });

  it('leaves an unparsable settings.local.json byte-identical and surfaces the warning', async () => {
    const broken = '{ "mySetting": "keep-me", // not json\n  "hooks": ';
    await seedSettings(broken);

    const result = await runInstall();

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(broken);
    const warning = result.warnings.find((w) => w.includes('hooks were NOT installed'));
    expect(warning).toBeDefined();
    expect(warning).toContain('omcustom init');
  });
});

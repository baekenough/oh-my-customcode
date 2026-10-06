/**
 * Integration tests for the hook-command migration wired into `update()` (#1767).
 *
 * Old settings.local.json files carry cwd-relative omcustom hook commands
 * (`bash .claude/hooks/scripts/x.sh`). `update()` must rewrite them to the
 * CLAUDE_PROJECT_DIR-anchored form without touching anything else.
 *
 * No module mocks are used, so there is nothing to restore (see
 * tests/unit/scripts/child-process-mock-hygiene.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { getProviderLayout } from '../../../src/core/layout.js';
import { update } from '../../../src/core/updater.js';

// biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell variable, not a template
const ANCHOR = '${CLAUDE_PROJECT_DIR:-.}';

const OLD_SCRIPT = 'bash .claude/hooks/scripts/a.sh';
const OLD_SCRIPT_NEW_FORM = `bash "${ANCHOR}/.claude/hooks/scripts/a.sh"`;
const OLD_BARE = '.claude/hooks/scripts/omcustom-auto-update.sh';
const OLD_BARE_NEW_FORM = `"${ANCHOR}/.claude/hooks/scripts/omcustom-auto-update.sh"`;
const OLD_TOP_LEVEL = 'bash .claude/hooks/skill-count-reminder.sh';
const OLD_TOP_LEVEL_NEW_FORM = `bash "${ANCHOR}/.claude/hooks/skill-count-reminder.sh"`;
const CUSTOM = 'sh .claude/hooks/x.sh';
const OLD_STATUSLINE = '.claude/statusline.sh';
const OLD_STATUSLINE_NEW_FORM = `bash "${ANCHOR}/.claude/statusline.sh"`;
const CUSTOM_STATUSLINE = '.claude/custom-statusline.sh';

interface HookEntry {
  type: string;
  command: string;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}
interface Settings {
  hooks: Record<string, HookGroup[]>;
  statusLine: { type: string; command: string; refreshInterval: number };
  customKey: { keep: string[] };
}

function buildOldSettings(statusLineCommand: string = OLD_STATUSLINE): Settings {
  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: OLD_BARE }] }],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: OLD_SCRIPT },
            { type: 'command', command: CUSTOM },
          ],
        },
      ],
      PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: OLD_TOP_LEVEL }] }],
    },
    statusLine: { type: 'command', command: statusLineCommand, refreshInterval: 10 },
    customKey: { keep: ['a', 'b'] },
  };
}

describe('update() hook-command migration (#1767)', () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-updater-hooks-migration-'));
    const layout = getProviderLayout();
    await mkdir(join(tempDir, layout.rootDir), { recursive: true });
    settingsPath = join(tempDir, layout.rootDir, 'settings.local.json');

    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    await saveConfig(tempDir, config);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeSettings(raw: string): Promise<void> {
    await writeFile(settingsPath, raw, 'utf-8');
  }

  async function readSettings(): Promise<Settings> {
    return JSON.parse(await readFile(settingsPath, 'utf-8')) as Settings;
  }

  function expectMigrated(settings: Settings): void {
    expect(settings.hooks.SessionStart?.[0]?.hooks[0]?.command).toBe(OLD_BARE_NEW_FORM);
    expect(settings.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe(OLD_SCRIPT_NEW_FORM);
    expect(settings.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe(OLD_TOP_LEVEL_NEW_FORM);
    // Custom hook and unrelated keys are untouched.
    expect(settings.hooks.PreToolUse?.[0]?.hooks[1]?.command).toBe(CUSTOM);
    expect(settings.hooks.PreToolUse?.[0]?.matcher).toBe('Bash');
    // Exact-default statusLine command is anchored; type/refreshInterval are preserved (#1769).
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: OLD_STATUSLINE_NEW_FORM,
      refreshInterval: 10,
    });
    expect(settings.customKey).toEqual({ keep: ['a', 'b'] });
  }

  it('rewrites old relative commands on a hooks-component update and preserves everything else', async () => {
    await writeSettings(`${JSON.stringify(buildOldSettings(), null, 2)}\n`);

    const result = await update({ targetDir: tempDir, components: ['hooks'] });

    expect(result.success).toBe(true);
    expectMigrated(await readSettings());
    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });

  it('rewrites old relative commands on a full update', async () => {
    await writeSettings(`${JSON.stringify(buildOldSettings(), null, 2)}\n`);

    const result = await update({ targetDir: tempDir });

    expect(result.success).toBe(true);
    expectMigrated(await readSettings());
  });

  it('keeps a missing trailing newline missing (formatting convention preserved)', async () => {
    await writeSettings(JSON.stringify(buildOldSettings(), null, 2));

    await update({ targetDir: tempDir, components: ['hooks'] });

    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(false);
    expectMigrated(await readSettings());
  });

  it('migrates a file that starts with a UTF-8 BOM and preserves the BOM', async () => {
    const bom = '﻿';
    await writeSettings(`${bom}${JSON.stringify(buildOldSettings(), null, 2)}\n`);

    const result = await update({ targetDir: tempDir, components: ['hooks'] });

    expect(result.success).toBe(true);
    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.startsWith(bom)).toBe(true);
    expect(raw.endsWith('\n')).toBe(true);
    expectMigrated(JSON.parse(raw.slice(bom.length)) as Settings);
  });

  it('leaves a custom statusLine command untouched while still migrating hook commands (#1769)', async () => {
    await writeSettings(`${JSON.stringify(buildOldSettings(CUSTOM_STATUSLINE), null, 2)}\n`);

    const result = await update({ targetDir: tempDir, components: ['hooks'] });

    expect(result.success).toBe(true);
    const settings = await readSettings();
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: CUSTOM_STATUSLINE,
      refreshInterval: 10,
    });
    expect(settings.hooks.SessionStart?.[0]?.hooks[0]?.command).toBe(OLD_BARE_NEW_FORM);
    expect(settings.hooks.PreToolUse?.[0]?.hooks[0]?.command).toBe(OLD_SCRIPT_NEW_FORM);
    expect(settings.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe(OLD_TOP_LEVEL_NEW_FORM);
  });

  it('does not write again when nothing is left to migrate (second update is a no-op)', async () => {
    await writeSettings(`${JSON.stringify(buildOldSettings(), null, 2)}\n`);
    await update({ targetDir: tempDir, components: ['hooks'] });

    const before = await readFile(settingsPath, 'utf-8');
    const past = new Date('2020-01-01T00:00:00Z');
    await utimes(settingsPath, past, past);

    const result = await update({ targetDir: tempDir, components: ['hooks'], force: true });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(before);
    expect((await stat(settingsPath)).mtimeMs).toBe(past.getTime());
  });

  it('leaves the file untouched on a dry run', async () => {
    const original = `${JSON.stringify(buildOldSettings(), null, 2)}\n`;
    await writeSettings(original);

    const result = await update({ targetDir: tempDir, dryRun: true });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it('leaves the file untouched when the update does not include the hooks component', async () => {
    const original = `${JSON.stringify(buildOldSettings(), null, 2)}\n`;
    await writeSettings(original);

    const result = await update({ targetDir: tempDir, components: ['rules'] });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(original);
  });

  it('does not throw and does not modify a malformed settings.local.json', async () => {
    const malformed = '{ "hooks": { not valid json';
    await writeSettings(malformed);

    const result = await update({ targetDir: tempDir, components: ['hooks'] });

    expect(result.success).toBe(true);
    expect(await readFile(settingsPath, 'utf-8')).toBe(malformed);
  });

  it('does not create settings.local.json when it does not exist', async () => {
    const result = await update({ targetDir: tempDir, components: ['hooks'] });

    expect(result.success).toBe(true);
    await expect(stat(settingsPath)).rejects.toThrow();
  });
});

// Every updater invocation uses a local spy; no external CLI or installer is launched.
let codexCheckSpy: ReturnType<typeof spyOn>;
let codexInstallSpy: ReturnType<typeof spyOn>;
let networkSpy: ReturnType<typeof spyOn>;
let syncCommandSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  networkSpy = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('network forbidden in updater fixture')
  );
  syncCommandSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
    throw new Error('external synchronous command forbidden');
  });
  codexCheckSpy = spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true);
  codexInstallSpy = spyOn(codexInstaller, 'installCodex').mockReturnValue(false);
});
afterEach(() => {
  const networkCalls = networkSpy.mock.calls.length;
  const syncCommandCalls = syncCommandSpy.mock.calls.length;
  networkSpy.mockRestore();
  syncCommandSpy.mockRestore();
  codexCheckSpy.mockRestore();
  codexInstallSpy.mockRestore();
  expect(networkCalls).toBe(0);
  expect(syncCommandCalls).toBe(0);
});

describe('update exact RTK settings retirement', () => {
  let project: string;
  const retired = 'bash .claude/hooks/scripts/rtk-intercept.sh';
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'omcustom-update-rtk-settings-'));
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    await mkdir(join(project, '.claude'), { recursive: true });
  });
  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  for (const filename of ['settings.json', 'settings.local.json']) {
    it(`retires exact RTK command in ${filename} and preserves BOM/newline/user sibling/legacy groups`, async () => {
      const path = join(project, '.claude', filename);
      const sibling = { type: 'command', command: 'printf user-sibling', timeout: 17 };
      const legacy = {
        description: 'Omcustom session context re-inject',
        hooks: [{ type: 'prompt', prompt: 'user legacy text' }],
      };
      const original = {
        customKey: ['keep'],
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              description: 'RTK command interception',
              extra: 1,
              hooks: [{ type: 'command', command: retired }, sibling],
            },
          ],
          SessionStart: [legacy],
        },
      };
      await writeFile(path, `\uFEFF${JSON.stringify(original)}\n`);
      const result = await update({ targetDir: project, components: ['hooks'] });
      expect(result.success).toBe(true);
      expect(result.rtkRetirement?.settingsChanged).toContain(`.claude/${filename}`);
      const raw = await readFile(path, 'utf8');
      expect(raw.startsWith('\uFEFF')).toBe(true);
      expect(raw.endsWith('\n')).toBe(true);
      const next = JSON.parse(raw.slice(1));
      expect(next.hooks.PreToolUse).toEqual([
        { ...original.hooks.PreToolUse[0], hooks: [sibling] },
      ]);
      expect(next.hooks.SessionStart).toEqual([legacy]);
      expect(next.customKey).toEqual(['keep']);
      const repeat = await update({ targetDir: project, components: ['hooks'], force: true });
      expect(repeat.success).toBe(true);
      expect(await readFile(path, 'utf8')).toBe(raw);
      expect(repeat.rtkRetirement?.settingsChanged).toEqual([]);
    });
  }

  it('preserves different matcher/event, user arguments, absolute command and unknown shapes as reported conflicts', async () => {
    const path = join(project, '.claude/settings.json');
    const group = (matcher: string, command: string) => ({
      matcher,
      hooks: [{ type: 'command', command }],
    });
    const original = {
      hooks: {
        PreToolUse: [
          group('Write', retired),
          group('Bash', `${retired} --user`),
          group('Bash', '/owned/user/rtk-intercept.sh'),
          group('Bash', `${retired} | user-filter`),
          { matcher: 'Bash', hooks: { user: 'rtk-intercept.sh' } },
        ],
        PostToolUse: [group('Bash', retired)],
      },
      unrelated: { preserve: true },
    };
    const raw = JSON.stringify(original);
    await writeFile(path, raw);
    const result = await update({ targetDir: project, components: ['hooks'] });
    expect(result.success).toBe(true);
    expect(await readFile(path, 'utf8')).toBe(raw);
    expect(result.rtkRetirement?.settingsConflicts).toContain('.claude/settings.json');
    expect(result.rtkRetirement?.settingsChanged).toEqual([]);
    expect(
      result.warnings.some((warning) => warning.includes('retained user or unknown wiring'))
    ).toBe(true);
  });

  it('reports malformed settings as conflict, preserves bytes and does not remove a hash-owned RTK file', async () => {
    const settings = join(project, '.claude/settings.local.json');
    const hook = '.claude/hooks/scripts/rtk-intercept.sh';
    await mkdir(join(project, hook, '..'), { recursive: true });
    const content = 'owned hook';
    await writeFile(join(project, hook), content);
    const { createHash } = await import('node:crypto');
    await writeFile(
      join(project, '.omcustom.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        generatorVersion: '0.1.0',
        templateVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00Z',
        files: {
          [hook]: {
            templateHash: createHash('sha256').update(content).digest('hex'),
            size: content.length,
            component: 'hooks',
          },
        },
      })
    );
    await writeFile(settings, '{ bad json');
    const result = await update({ targetDir: project, components: ['hooks'] });
    expect(result.success).toBe(true);
    expect(await readFile(settings, 'utf8')).toBe('{ bad json');
    expect(await readFile(join(project, hook), 'utf8')).toBe(content);
    expect(result.rtkRetirement?.settingsConflicts).toContain('.claude/settings.local.json');
    expect(result.rtkRetirement?.preserved).toContainEqual({
      path: hook,
      reason: 'settings retirement conflict',
    });
  });
});

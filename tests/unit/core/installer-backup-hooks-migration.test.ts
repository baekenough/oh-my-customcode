/**
 * Tests for the hook-command migration on the `omcustom init --backup` restore path (#1767).
 *
 * With `--backup`, install() writes fresh anchored hook commands into settings.local.json and
 * then restores the user's OLD settings.local.json over it via deepMerge (preserved values win,
 * arrays are replaced). Per-event hook arrays from the old file therefore bring back the old
 * cwd-relative commands. install() must migrate them again after the restore step.
 *
 * Runs install() for real against a temp project. Only the RTK/Codex installers are replaced
 * (they would shell out to package managers); the originals are re-registered in afterAll so
 * the mocks do not leak into other test files (#1760/#1761).
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertHooksJson, type RawHooksJson } from '../../../src/core/hooks-settings.js';
import type { InstallResult } from '../../../src/core/installer.js';

const RTK_MODULE = '../../../src/core/rtk-installer.js';
const CODEX_MODULE = '../../../src/core/codex-installer.js';

const ANCHORED_SESSION_START = `bash "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/session-start.sh"`;
// The old Stop command had no `bash ` prefix; the migration preserves that shape.
const ANCHORED_STOP = `"\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/stop-hook.sh"`;
const CUSTOM_COMMAND = 'bash ~/my-team/custom-audit.sh --strict';

interface HookEntry {
  type?: string;
  command?: string;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

function commandsOf(hooks: Record<string, HookGroup[]> | undefined, event: string): string[] {
  const groups = hooks?.[event] ?? [];
  return groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? ''));
}

const TEMPLATE_HOOKS_JSON = join(import.meta.dir, '../../../templates/.claude/hooks/hooks.json');

/**
 * The matcher an installed settings file really contains for the stage-blocker group: the
 * converted CC form (e.g. `Write|Edit`), derived from the template hooks.json via the same
 * converter the installer uses. Installed settings never hold the raw hooks.json DSL form.
 */
async function convertedStageBlockerMatcher(): Promise<string> {
  const raw = JSON.parse(await readFile(TEMPLATE_HOOKS_JSON, 'utf-8')) as RawHooksJson;
  const { hooks } = convertHooksJson(raw);
  const group = (hooks.PreToolUse ?? []).find((g) =>
    g.hooks.some((h) => h.command?.includes('stage-blocker.sh'))
  );
  if (group?.matcher === undefined) {
    throw new Error('stage-blocker group with a matcher not found in converted template hooks');
  }
  return group.matcher;
}

describe('installer --backup restore: hook command migration (#1767)', () => {
  let realRtk: Record<string, unknown>;
  let realCodex: Record<string, unknown>;
  let tempDir: string;
  let consoleSpies: Array<ReturnType<typeof spyOn>>;

  beforeAll(async () => {
    realRtk = { ...(await import(RTK_MODULE)) };
    realCodex = { ...(await import(CODEX_MODULE)) };
    mock.module(RTK_MODULE, () => ({
      ...realRtk,
      isRtkInstalled: () => true,
      installRtk: () => true,
    }));
    mock.module(CODEX_MODULE, () => ({
      ...realCodex,
      isCodexInstalled: () => true,
      installCodex: () => true,
    }));
  });

  afterAll(() => {
    mock.module(RTK_MODULE, () => realRtk);
    mock.module(CODEX_MODULE, () => realCodex);
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-installer-backup-hooks-migration-'));
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {})
    );
  });

  afterEach(async () => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  async function seedOldSettings(
    options: { trailingNewline?: boolean; bom?: boolean } = {}
  ): Promise<string> {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const oldSettings = {
      enableAllProjectMcpServers: true,
      hooks: {
        SessionStart: [
          {
            matcher: '*',
            hooks: [
              { type: 'command', command: 'bash .claude/hooks/scripts/session-start.sh' },
              { type: 'command', command: CUSTOM_COMMAND },
            ],
          },
        ],
        Stop: [{ hooks: [{ type: 'command', command: '.claude/hooks/stop-hook.sh' }] }],
      },
    };
    const body = `${JSON.stringify(oldSettings, null, 2)}${options.trailingNewline ? '\n' : ''}`;
    await writeFile(settingsPath, `${options.bom ? '﻿' : ''}${body}`, 'utf-8');
    return settingsPath;
  }

  it('anchors old relative omcustom hook commands restored by --backup and keeps everything else', async () => {
    const settingsPath = await seedOldSettings();
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, backup: true, skipConfirm: true });

    expect(result.success).toBe(true);
    const raw = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw) as {
      enableAllProjectMcpServers?: boolean;
      statusLine?: unknown;
      hooks?: Record<string, HookGroup[]>;
    };

    // Old relative commands were migrated to the anchored form.
    const sessionStart = commandsOf(settings.hooks, 'SessionStart');
    expect(sessionStart).toContain(ANCHORED_SESSION_START);
    expect(sessionStart).not.toContain('bash .claude/hooks/scripts/session-start.sh');
    expect(commandsOf(settings.hooks, 'Stop')).toContain(ANCHORED_STOP);

    // User-authored custom hook and unrelated key are untouched.
    expect(sessionStart).toContain(CUSTOM_COMMAND);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.statusLine).toBeDefined();

    // No bare-relative omcustom command remains anywhere in the hooks block.
    expect(raw).not.toMatch(/"command":\s*"(?:bash )?(?:\.\/)?\.claude\/hooks\//);

    // Installer JSON convention: 2-space indent.
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2));
  });

  // The restore step (mergeJsonFile) keeps the old file's newline/BOM convention (#1776), so the
  // end-to-end cases below observe those bytes through install(). The cases after them call the
  // migration directly on a seeded file to isolate its own byte-convention behaviour.
  it('keeps the old trailing newline through install({ backup: true }) (#1776)', async () => {
    const settingsPath = await seedOldSettings({ trailingNewline: true });
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, backup: true, skipConfirm: true });

    expect(result.success).toBe(true);
    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.endsWith('\n\n')).toBe(false);
    const settings = JSON.parse(raw) as {
      enableAllProjectMcpServers?: boolean;
      hooks?: Record<string, HookGroup[]>;
    };
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(commandsOf(settings.hooks, 'SessionStart')).toContain(ANCHORED_SESSION_START);
  });

  it('restores a BOM-prefixed old settings.local.json and keeps the BOM and newline (#1776)', async () => {
    const settingsPath = await seedOldSettings({ bom: true, trailingNewline: true });
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, backup: true, skipConfirm: true });

    expect(result.success).toBe(true);
    expect(result.warnings.filter((w) => w.includes('Failed to restore'))).toEqual([]);
    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.startsWith('﻿')).toBe(true);
    expect(raw.startsWith('﻿﻿')).toBe(false);
    expect(raw.endsWith('\n')).toBe(true);
    const settings = JSON.parse(raw.slice(1)) as {
      enableAllProjectMcpServers?: boolean;
      statusLine?: unknown;
      hooks?: Record<string, HookGroup[]>;
    };
    // Old keys survived the restore, template keys are still merged in.
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.statusLine).toBeDefined();
    const sessionStart = commandsOf(settings.hooks, 'SessionStart');
    expect(sessionStart).toContain(CUSTOM_COMMAND);
    expect(sessionStart).toContain(ANCHORED_SESSION_START);
  });

  it('keeps fresh omcustom groups and user hooks through install({ backup: true }) (#1768 D1)', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const userPreToolUse = {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'bash ~/team/audit.sh' }],
    };
    const userElicitation = {
      hooks: [{ type: 'command', command: 'bash ~/team/notify.sh' }],
    };
    // Old omcustom group: relative command form of a shipped script, no description, but the
    // matcher is the converted CC form a real old install contains (not the raw hooks.json DSL).
    const oldOmcustomPreToolUse = {
      matcher: await convertedStageBlockerMatcher(),
      hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/stage-blocker.sh' }],
    };
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          mySetting: 'keep-me',
          hooks: {
            PreToolUse: [oldOmcustomPreToolUse, userPreToolUse],
            Elicitation: [userElicitation],
          },
        },
        null,
        2
      ),
      'utf-8'
    );
    const generatedRaw = JSON.parse(
      await readFile(join(import.meta.dir, '../../../templates/.claude/hooks/hooks.json'), 'utf-8')
    ) as { hooks?: Record<string, unknown[]> } & Record<string, unknown[]>;
    const generated = generatedRaw.hooks ?? generatedRaw;
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, backup: true, skipConfirm: true });

    expect(result.success).toBe(true);
    const settings = JSON.parse(await readFile(settingsPath, 'utf-8')) as {
      mySetting?: string;
      hooks?: Record<string, HookGroup[]>;
    };
    expect(settings.mySetting).toBe('keep-me');
    // User hooks survive: same event and an event the templates do not generate.
    expect(commandsOf(settings.hooks, 'PreToolUse')).toContain('bash ~/team/audit.sh');
    expect(commandsOf(settings.hooks, 'Elicitation')).toEqual(['bash ~/team/notify.sh']);
    // The old omcustom group was replaced, not pinned next to the generated one: every
    // generated group is present exactly once and only the one user group is added.
    for (const [event, groups] of Object.entries(generated)) {
      const expected = groups.length + (event === 'PreToolUse' ? 1 : 0);
      expect(settings.hooks?.[event]?.length).toBe(expected);
    }
    expect(
      commandsOf(settings.hooks, 'PreToolUse').filter((c) => c.includes('stage-blocker.sh'))
    ).toHaveLength(1);
  });

  it('keeps a user group with a different matcher running a shipped script path (#1768 D1)', async () => {
    const claudeDir = join(tempDir, '.claude');
    await mkdir(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.local.json');
    const userGroup = {
      matcher: 'MyTool',
      hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/stage-blocker.sh' }],
    };
    await writeFile(
      settingsPath,
      JSON.stringify({ hooks: { PreToolUse: [userGroup] } }, null, 2),
      'utf-8'
    );
    const generatedMatcher = await convertedStageBlockerMatcher();
    expect(generatedMatcher).not.toBe('MyTool');
    const { install } = await import('../../../src/core/installer.js');

    const result = await install({ targetDir: tempDir, backup: true, skipConfirm: true });

    expect(result.success).toBe(true);
    const settings = JSON.parse(await readFile(settingsPath, 'utf-8')) as {
      hooks?: Record<string, HookGroup[]>;
    };
    const preToolUse = settings.hooks?.PreToolUse ?? [];
    // Same event, different matcher: the user group is user-owned and survives (not deduped).
    const userGroups = preToolUse.filter((g) => g.matcher === 'MyTool');
    expect(userGroups).toHaveLength(1);
    // The post-restore command migration still anchors the relative script path of any group.
    expect(commandsOf({ PreToolUse: userGroups }, 'PreToolUse')).toEqual([
      `bash "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/scripts/stage-blocker.sh"`,
    ]);
    // The generated stage-blocker group (converted matcher) appears exactly once.
    const generatedGroups = preToolUse.filter(
      (g) =>
        g.matcher === generatedMatcher &&
        (g.hooks ?? []).some((h) => h.command?.includes('stage-blocker.sh'))
    );
    expect(generatedGroups).toHaveLength(1);
  });

  function newInstallResult(): InstallResult {
    return {
      success: false,
      installedPath: tempDir,
      installedComponents: [],
      skippedComponents: [],
      backedUpPaths: [],
      warnings: [],
    };
  }

  it('keeps the trailing newline of settings.local.json when it rewrites the file', async () => {
    const settingsPath = await seedOldSettings({ trailingNewline: true });
    const { migrateRestoredHookCommands } = await import('../../../src/core/installer.js');
    const result = newInstallResult();

    await migrateRestoredHookCommands(tempDir, result);

    const raw = await readFile(settingsPath, 'utf-8');
    expect(result.warnings).toEqual([]);
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.endsWith('\n\n')).toBe(false);
    expect(commandsOf(JSON.parse(raw).hooks, 'SessionStart')).toContain(ANCHORED_SESSION_START);
  });

  it('does not add a trailing newline when the original had none', async () => {
    const settingsPath = await seedOldSettings();
    const { migrateRestoredHookCommands } = await import('../../../src/core/installer.js');

    await migrateRestoredHookCommands(tempDir, newInstallResult());

    const raw = await readFile(settingsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(false);
    expect(commandsOf(JSON.parse(raw).hooks, 'Stop')).toContain(ANCHORED_STOP);
  });

  it('migrates a settings.local.json that starts with a UTF-8 BOM and preserves the BOM', async () => {
    const settingsPath = await seedOldSettings({ bom: true });
    const { migrateRestoredHookCommands } = await import('../../../src/core/installer.js');
    const result = newInstallResult();

    await migrateRestoredHookCommands(tempDir, result);

    const raw = await readFile(settingsPath, 'utf-8');
    expect(result.warnings).toEqual([]);
    expect(raw.startsWith('\uFEFF')).toBe(true);
    const settings = JSON.parse(raw.slice(1)) as {
      enableAllProjectMcpServers?: boolean;
      hooks?: Record<string, HookGroup[]>;
    };
    expect(commandsOf(settings.hooks, 'SessionStart')).toContain(ANCHORED_SESSION_START);
    expect(commandsOf(settings.hooks, 'SessionStart')).toContain(CUSTOM_COMMAND);
    expect(commandsOf(settings.hooks, 'Stop')).toContain(ANCHORED_STOP);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(raw).not.toMatch(/"command":\s*"(?:bash )?(?:\.\/)?\.claude\/hooks\//);
  });

  it('does not rewrite the file when nothing needs migrating (idempotent second backup init)', async () => {
    const settingsPath = await seedOldSettings();
    const { install } = await import('../../../src/core/installer.js');

    await install({ targetDir: tempDir, backup: true, skipConfirm: true });
    const first = await readFile(settingsPath, 'utf-8');
    const second = await (async () => {
      await install({ targetDir: tempDir, backup: true, skipConfirm: true });
      return readFile(settingsPath, 'utf-8');
    })();

    expect(JSON.parse(second)).toEqual(JSON.parse(first));
  });
});

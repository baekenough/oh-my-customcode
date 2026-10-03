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

  // The two cases below call the migration directly on a file in the state the restore step
  // leaves it in: the merge step (writeJsonFile) normalises bytes, so the byte-convention
  // behaviour of the migration itself is only observable with a directly seeded file.
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

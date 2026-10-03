/**
 * Tests for the cwd-relative -> CLAUDE_PROJECT_DIR-anchored hook command migration (#1767).
 *
 * Ownership boundary: pure rewrite logic only. Wiring into updater/installer is covered
 * elsewhere.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  migrateHookCommands,
  rewriteRelativeHookCommand,
} from '../../../src/core/hook-command-migration.js';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const ANCHOR = `\${CLAUDE_PROJECT_DIR:-.}`;

type Json = Record<string, unknown>;

/** Collects every hook `command` string from a settings `hooks` block, in document order. */
function collectCommands(settings: Json): string[] {
  const out: string[] = [];
  const walkEntry = (key: string, value: unknown): void => {
    if (key === 'command' && typeof value === 'string') {
      out.push(value);
    } else {
      walk(value);
    }
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Json)) walkEntry(key, value);
    }
  };
  walk(settings.hooks);
  return out;
}

/**
 * Turns an anchored (new-form) command back into the old cwd-relative form, so the
 * fixture stays "old-form" whether or not the tracked settings.json has already been
 * regenerated.
 */
function toOldForm(command: string): string {
  return command.replace(/^(bash )?"\$\{CLAUDE_PROJECT_DIR:-\.\}\/(\.claude\/hooks\/.+)"$/, '$1$2');
}

async function loadOldFormSettings(): Promise<Json> {
  const raw = await readFile(join(REPO_ROOT, '.claude/settings.json'), 'utf-8');
  const settings = JSON.parse(raw) as Json;
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Json).map(([k, v]) =>
          k === 'command' && typeof v === 'string' ? [k, toOldForm(v)] : [k, rewrite(v)]
        )
      );
    }
    return node;
  };
  const statusLine = settings.statusLine as Json | undefined;
  return {
    ...settings,
    hooks: rewrite(settings.hooks),
    // Keep the fixture old-form regardless of whether settings.json is already migrated (#1769).
    ...(statusLine ? { statusLine: { ...statusLine, command: '.claude/statusline.sh' } } : {}),
  } as Json;
}

describe('rewriteRelativeHookCommand', () => {
  it('rewrites `bash .claude/hooks/...` to the anchored form', () => {
    expect(rewriteRelativeHookCommand('bash .claude/hooks/scripts/schema-validator.sh')).toBe(
      `bash "${ANCHOR}/.claude/hooks/scripts/schema-validator.sh"`
    );
  });

  it('rewrites `bash ./.claude/hooks/...` (leading ./) to the anchored form', () => {
    expect(rewriteRelativeHookCommand('bash ./.claude/hooks/scripts/x.sh')).toBe(
      `bash "${ANCHOR}/.claude/hooks/scripts/x.sh"`
    );
  });

  it('rewrites a script directly under hooks/ (no scripts/ segment)', () => {
    expect(rewriteRelativeHookCommand('bash .claude/hooks/my.sh')).toBe(
      `bash "${ANCHOR}/.claude/hooks/my.sh"`
    );
  });

  it('rewrites the no-bash auto-update form without adding bash', () => {
    expect(rewriteRelativeHookCommand('.claude/hooks/scripts/omcustom-auto-update.sh')).toBe(
      `"${ANCHOR}/.claude/hooks/scripts/omcustom-auto-update.sh"`
    );
  });

  it('returns null for an already-migrated command (idempotent building block)', () => {
    expect(
      rewriteRelativeHookCommand(`bash "${ANCHOR}/.claude/hooks/scripts/schema-validator.sh"`)
    ).toBeNull();
    expect(
      rewriteRelativeHookCommand(`"${ANCHOR}/.claude/hooks/scripts/omcustom-auto-update.sh"`)
    ).toBeNull();
  });
});

describe('migrateHookCommands — tracked settings fixture', () => {
  it('rewrites every old-form command of the tracked settings.json and is idempotent', async () => {
    const oldSettings = await loadOldFormSettings();
    const before = collectCommands(oldSettings);
    const expected = before.filter((c) => /\.claude\/hooks\//.test(c)).length;
    expect(expected).toBeGreaterThan(0);
    const statusLineRewrites = oldSettings.statusLine ? 1 : 0;

    const first = migrateHookCommands(oldSettings);
    expect(first.rewritten).toBe(expected + statusLineRewrites);
    for (const command of collectCommands(first.settings)) {
      expect(command).not.toMatch(/^(bash )?(\.\/)?\.claude\/hooks\//);
    }
    expect(collectCommands(first.settings).filter((c) => c.includes(ANCHOR)).length).toBe(expected);

    const second = migrateHookCommands(first.settings);
    expect(second.rewritten).toBe(0);
    expect(second.settings).toEqual(first.settings);
  });

  it('does not mutate its input and preserves all non-hook keys', async () => {
    const oldSettings = await loadOldFormSettings();
    const snapshot = structuredClone(oldSettings);
    const { settings } = migrateHookCommands(oldSettings);
    expect(oldSettings).toEqual(snapshot);
    const { hooks: _a, statusLine: slBefore, ...restBefore } = oldSettings;
    const { hooks: _b, statusLine: slAfter, ...restAfter } = settings;
    expect(restAfter).toEqual(restBefore);
    // Only statusLine.command may change; every other statusLine field is preserved.
    expect({ ...(slAfter as Json), command: undefined }).toEqual({
      ...(slBefore as Json),
      command: undefined,
    });
    expect(Object.keys(settings)).toEqual(Object.keys(oldSettings));
  });

  it('returns 0 and the same content for settings without a hooks block', () => {
    const input = { permissions: { defaultMode: 'default' } };
    const result = migrateHookCommands(input);
    expect(result.rewritten).toBe(0);
    expect(result.settings).toEqual(input);
  });
});

describe('migrateHookCommands — custom / non-matching commands', () => {
  const wrap = (command: string): Json => ({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] },
  });

  // [input command, expected output command (null = unchanged), why]
  const cases: Array<[string, string | null, string]> = [
    ['sh .claude/hooks/x.sh', null, 'only `bash ` / no-prefix forms are migrated; `sh` untouched'],
    [
      'echo "see .claude/hooks docs" | tee -a log.txt',
      null,
      'pipeline with .claude/hooks inside an echo string is not a full-string match',
    ],
    ['bash ./scripts/foo.sh', null, 'script outside .claude/hooks untouched'],
    ['bash .claude/hooks/scripts/x.sh --flag', null, 'trailing arguments: not full-string match'],
    ['bash .claude/hooks/scripts/x.sh | tee -a log', null, 'pipeline: not full-string match'],
    ['bash .claude/hooks/scripts/sub/x.sh', null, 'nested subdirectory under scripts/ untouched'],
    ['bash .claude/hooks/my scripts/x.sh', null, 'space inside the relative path: untouched'],
    ['bash .claude/hooks/scripts/my script.sh', null, 'space in the script name: untouched'],
    ['/abs/proj/.claude/hooks/scripts/x.sh', null, 'absolute path is already anchored'],
    ['cd .claude/hooks && bash scripts/x.sh', null, 'compound command untouched'],
    [
      `bash "${ANCHOR}/.claude/hooks/scripts/x.sh"`,
      null,
      'already-migrated command is left unchanged',
    ],
    [
      'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/scripts/x.sh',
      null,
      'hand-written anchored form is left unchanged',
    ],
    [
      'bash .claude/hooks/my-custom.sh',
      `bash "${ANCHOR}/.claude/hooks/my-custom.sh"`,
      'INTENDED: a user hook in the exact omcustom form is rewritten (same file, now anchored)',
    ],
    [
      'bash ./.claude/hooks/scripts/x.sh',
      `bash "${ANCHOR}/.claude/hooks/scripts/x.sh"`,
      'leading ./ variant is rewritten',
    ],
  ];

  for (const [input, expected, why] of cases) {
    const verb = expected === null ? 'leaves unchanged' : 'rewrites';
    it(`${verb}: ${JSON.stringify(input)} (${why})`, () => {
      const result = migrateHookCommands(wrap(input));
      expect(collectCommands(result.settings)).toEqual([expected ?? input]);
      expect(result.rewritten).toBe(expected === null ? 0 : 1);
    });
  }

  it('rewriting a user hook in the exact omcustom shape is behavior-preserving (same target file)', () => {
    const result = migrateHookCommands(wrap('bash .claude/hooks/my-custom.sh'));
    expect(collectCommands(result.settings)).toEqual([
      `bash "${ANCHOR}/.claude/hooks/my-custom.sh"`,
    ]);
    // Only the command string changes; matcher / type are preserved.
    expect(result.settings).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: `bash "${ANCHOR}/.claude/hooks/my-custom.sh"` }],
          },
        ],
      },
    });
  });

  it('ignores non-command hook entries and non-string `command` values', () => {
    const input = {
      hooks: {
        Stop: [
          { hooks: [{ type: 'prompt', prompt: 'bash .claude/hooks/x.sh' }] },
          { hooks: [{ type: 'command', command: 42 }] },
        ],
      },
    };
    const result = migrateHookCommands(input);
    expect(result.rewritten).toBe(0);
    expect(result.settings).toEqual(input);
  });
});

describe('migrateHookCommands — runtime behavior from a subdirectory (spaces in project path)', () => {
  let projectRoot: string;
  let workDir: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), 'omcustom-hookmig-'));
    projectRoot = join(base, 'my proj');
    workDir = join(projectRoot, 'sub dir');
    await mkdir(join(projectRoot, '.claude/hooks/scripts'), { recursive: true });
    await mkdir(workDir, { recursive: true });
    await writeFile(
      join(projectRoot, '.claude/hooks/scripts/probe.sh'),
      '#!/bin/bash\necho probe-ok\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await rm(resolve(projectRoot, '..'), { recursive: true, force: true });
  });

  function run(command: string): { code: number; stdout: string } {
    const proc = Bun.spawnSync(['bash', '-c', command], {
      cwd: workDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    });
    return { code: proc.exitCode, stdout: proc.stdout.toString() };
  }

  it('old relative form fails from a subdirectory (negative control)', () => {
    const result = run('bash .claude/hooks/scripts/probe.sh');
    expect(result.code).toBe(127);
  });

  it('migrated form resolves from a subdirectory even when the project path contains spaces', () => {
    const migrated = rewriteRelativeHookCommand('bash .claude/hooks/scripts/probe.sh');
    expect(migrated).not.toBeNull();
    const result = run(migrated as string);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('probe-ok');
  });

  it('migrated no-bash form is executed directly (requires the exec bit)', async () => {
    const { chmod } = await import('node:fs/promises');
    await chmod(join(projectRoot, '.claude/hooks/scripts/probe.sh'), 0o755);
    const migrated = rewriteRelativeHookCommand('.claude/hooks/scripts/probe.sh');
    expect(migrated).not.toBeNull();
    const result = run(migrated as string);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('probe-ok');
  });

  it('falls back to "." when CLAUDE_PROJECT_DIR is unset (resolves from the project root)', () => {
    const migrated = rewriteRelativeHookCommand('bash .claude/hooks/scripts/probe.sh') as string;
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const proc = Bun.spawnSync(['bash', '-c', migrated], { cwd: projectRoot, env });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString().trim()).toBe('probe-ok');
  });
});

describe('migrateHookCommands — statusLine exact-default migration (#1769, R3)', () => {
  const OLD_DEFAULT = '.claude/statusline.sh';
  const NEW_DEFAULT = `bash "${ANCHOR}/.claude/statusline.sh"`;
  const oldHookCommand = 'bash .claude/hooks/scripts/x.sh';
  const newHookCommand = `bash "${ANCHOR}/.claude/hooks/scripts/x.sh"`;

  it('rewrites the exact old default statusLine command and counts it', () => {
    const input = { statusLine: { type: 'command', command: OLD_DEFAULT, refreshInterval: 5 } };
    const result = migrateHookCommands(input);
    expect(result.rewritten).toBe(1);
    expect(result.settings).toEqual({
      statusLine: { type: 'command', command: NEW_DEFAULT, refreshInterval: 5 },
    });
  });

  it('rewrites the statusLine even when the settings have no hooks block', () => {
    const input = { permissions: { defaultMode: 'default' }, statusLine: { command: OLD_DEFAULT } };
    const result = migrateHookCommands(input);
    expect(result.rewritten).toBe(1);
    expect(result.settings.permissions).toBe(input.permissions);
    expect(result.settings.statusLine).toEqual({ command: NEW_DEFAULT });
  });

  it('counts hook and statusLine rewrites together', () => {
    const input = {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: oldHookCommand }] }] },
      statusLine: { type: 'command', command: OLD_DEFAULT },
    };
    const result = migrateHookCommands(input);
    expect(result.rewritten).toBe(2);
    expect(collectCommands(result.settings)).toEqual([newHookCommand]);
    expect(result.settings.statusLine).toEqual({ type: 'command', command: NEW_DEFAULT });
  });

  it('rewrites only the statusLine when hooks has nothing to migrate', () => {
    const hooks = { Stop: [{ hooks: [{ type: 'command', command: newHookCommand }] }] };
    const result = migrateHookCommands({ hooks, statusLine: { command: OLD_DEFAULT } });
    expect(result.rewritten).toBe(1);
    expect(result.settings.hooks).toBe(hooks);
  });

  it('does not mutate its input', () => {
    const input = { statusLine: { type: 'command', command: OLD_DEFAULT } };
    const snapshot = structuredClone(input);
    migrateHookCommands(input);
    expect(input).toEqual(snapshot);
  });

  it('is idempotent', () => {
    const first = migrateHookCommands({ statusLine: { command: OLD_DEFAULT } });
    const second = migrateHookCommands(first.settings);
    expect(second.rewritten).toBe(0);
    expect(second.settings).toEqual(first.settings);
  });

  // Negative fixtures: anything other than the exact old default is left untouched.
  const untouched: Array<[string, Json]> = [
    [
      'custom command',
      { statusLine: { type: 'command', command: '.claude/custom-statusline.sh' } },
    ],
    ['leading ./ variant', { statusLine: { command: './.claude/statusline.sh' } }],
    ['bash-prefixed variant', { statusLine: { command: 'bash .claude/statusline.sh' } }],
    ['trailing argument', { statusLine: { command: '.claude/statusline.sh --verbose' } }],
    ['already anchored', { statusLine: { command: NEW_DEFAULT } }],
    ['absolute path', { statusLine: { command: '/abs/proj/.claude/statusline.sh' } }],
    ['missing statusLine', { permissions: {} }],
    ['statusLine without command', { statusLine: { type: 'command' } }],
    ['non-string command', { statusLine: { command: 42 } }],
    ['string statusLine', { statusLine: OLD_DEFAULT }],
    ['null statusLine', { statusLine: null }],
    ['array statusLine', { statusLine: [OLD_DEFAULT] }],
  ];

  for (const [label, input] of untouched) {
    it(`leaves unchanged: ${label}`, () => {
      const result = migrateHookCommands(input);
      expect(result.rewritten).toBe(0);
      expect(result.settings).toBe(input);
    });
  }
});

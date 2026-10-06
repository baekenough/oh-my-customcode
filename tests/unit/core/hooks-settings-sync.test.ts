/**
 * Tests for the hooks.json -> settings.json sync generator (#1767).
 *
 * Fixtures are copies of the tracked files placed in a temp project root; the real repo
 * files are only ever read (the drift guard at the bottom runs in check mode).
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { syncHooksSettings } from '../../../src/core/hooks-settings-sync.js';

const REPO_ROOT = resolve(import.meta.dir, '../../..');

const TRACKED_FILES = [
  '.claude/hooks/hooks.json',
  '.claude/settings.json',
  'templates/.claude/hooks/hooks.json',
  'templates/.claude/settings.json',
] as const;

const ROOT_SETTINGS = '.claude/settings.json';
const TEMPLATE_SETTINGS = 'templates/.claude/settings.json';
const LOCAL_SETTINGS = '.claude/settings.local.json';

type Json = Record<string, unknown>;

let root: string;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(rel: string): Promise<string> {
  return readFile(join(root, rel), 'utf-8');
}

async function readJson(rel: string): Promise<Json> {
  return JSON.parse(await readText(rel)) as Json;
}

async function writeJson(rel: string, data: unknown): Promise<void> {
  await writeFile(join(root, rel), `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'omcustom-hookssync-'));
  for (const rel of TRACKED_FILES) {
    const dest = join(root, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(join(REPO_ROOT, rel), 'utf-8'), 'utf-8');
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('syncHooksSettings — no-op on in-sync fixtures', () => {
  it('leaves both settings files byte-identical and reports unchanged', async () => {
    const before = await Promise.all([readText(ROOT_SETTINGS), readText(TEMPLATE_SETTINGS)]);
    const result = await syncHooksSettings({ rootDir: root });
    expect(result.warnings).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.files).toEqual([
      { file: ROOT_SETTINGS, status: 'unchanged' },
      { file: TEMPLATE_SETTINGS, status: 'unchanged' },
    ]);
    expect(await readText(ROOT_SETTINGS)).toBe(before[0]);
    expect(await readText(TEMPLATE_SETTINGS)).toBe(before[1]);
  });

  it('does not touch the file (mtime unchanged) when nothing drifted', async () => {
    const before = (await stat(join(root, ROOT_SETTINGS))).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    await syncHooksSettings({ rootDir: root });
    expect((await stat(join(root, ROOT_SETTINGS))).mtimeMs).toBe(before);
  });
});

describe('syncHooksSettings — drift detection and repair', () => {
  it('check mode reports drift without writing', async () => {
    const original = await readJson(ROOT_SETTINGS);
    await writeJson(ROOT_SETTINGS, { ...original, hooks: {} });
    const tampered = await readText(ROOT_SETTINGS);

    const result = await syncHooksSettings({ rootDir: root, check: true });
    expect(result.drifted).toEqual([ROOT_SETTINGS]);
    expect(result.files.find((f) => f.file === TEMPLATE_SETTINGS)?.status).toBe('unchanged');
    expect(await readText(ROOT_SETTINGS)).toBe(tampered);
  });

  it('write mode repairs the drift to the original bytes', async () => {
    const originalText = await readText(ROOT_SETTINGS);
    const original = JSON.parse(originalText) as Json;
    await writeJson(ROOT_SETTINGS, { ...original, hooks: {} });

    const result = await syncHooksSettings({ rootDir: root });
    expect(result.files.find((f) => f.file === ROOT_SETTINGS)?.status).toBe('updated');
    expect(result.drifted).toEqual([]);
    expect(await readText(ROOT_SETTINGS)).toBe(originalText);
  });

  it('preserves every non-hook key and key order when regenerating', async () => {
    const original = await readJson(ROOT_SETTINGS);
    const tampered = { ...original, hooks: {}, customKey: { nested: [1, 2, 3] } };
    await writeJson(ROOT_SETTINGS, tampered);

    await syncHooksSettings({ rootDir: root });
    const after = await readJson(ROOT_SETTINGS);
    expect(Object.keys(after)).toEqual(Object.keys(tampered));
    expect(after.customKey).toEqual({ nested: [1, 2, 3] });
    expect(after.permissions).toEqual(original.permissions);
    expect(after.statusLine).toEqual(original.statusLine);
    expect(after.hooks).toEqual(original.hooks);
  });
});

describe('syncHooksSettings — missing / invalid inputs', () => {
  it('rejects with an explicit message when hooks.json is missing', async () => {
    await rm(join(root, '.claude/hooks/hooks.json'));
    await expect(syncHooksSettings({ rootDir: root })).rejects.toThrow(
      /hooks\.json.*not found|not found.*hooks\.json/
    );
  });

  it('rejects with an explicit message when a target settings file is missing, creating nothing', async () => {
    await rm(join(root, TEMPLATE_SETTINGS));
    await expect(syncHooksSettings({ rootDir: root })).rejects.toThrow(
      /settings\.json.*not found|not found.*settings\.json/
    );
    expect(await exists(join(root, TEMPLATE_SETTINGS))).toBe(false);
  });

  it('writes nothing when a later target fails validation (inputs are validated first)', async () => {
    const original = await readJson(ROOT_SETTINGS);
    await writeJson(ROOT_SETTINGS, { ...original, hooks: {} });
    const tampered = await readText(ROOT_SETTINGS);
    await rm(join(root, TEMPLATE_SETTINGS));

    await expect(syncHooksSettings({ rootDir: root })).rejects.toThrow();
    expect(await readText(ROOT_SETTINGS)).toBe(tampered);
  });

  it('rejects invalid JSON in a settings file instead of clobbering it', async () => {
    await writeFile(join(root, ROOT_SETTINGS), '{ not json', 'utf-8');
    await expect(syncHooksSettings({ rootDir: root })).rejects.toThrow(/invalid JSON/);
    expect(await readText(ROOT_SETTINGS)).toBe('{ not json');
  });
});

describe('syncHooksSettings — local option', () => {
  const localFixture = (): Json => ({
    statusLine: { type: 'command', command: '.claude/statusline.sh' },
    permissions: { defaultMode: 'bypassPermissions' },
    hooks: { Stop: [] },
    userKey: 'keep-me',
  });

  it('never creates settings.local.json when it is absent', async () => {
    const result = await syncHooksSettings({ rootDir: root, local: true });
    expect(await exists(join(root, LOCAL_SETTINGS))).toBe(false);
    expect(result.files.map((f) => f.file)).toEqual([ROOT_SETTINGS, TEMPLATE_SETTINGS]);
  });

  it('regenerates only the hooks block of an existing settings.local.json', async () => {
    await writeJson(LOCAL_SETTINGS, localFixture());
    const result = await syncHooksSettings({ rootDir: root, local: true });

    expect(result.files.find((f) => f.file === LOCAL_SETTINGS)?.status).toBe('updated');
    const local = await readJson(LOCAL_SETTINGS);
    const root_ = await readJson(ROOT_SETTINGS);
    expect(local.hooks).toEqual(root_.hooks);
    expect(local.userKey).toBe('keep-me');
    expect(local.permissions).toEqual({ defaultMode: 'bypassPermissions' });
    expect(local.statusLine).toEqual({ type: 'command', command: '.claude/statusline.sh' });
  });

  it('leaves settings.local.json alone when the local option is off', async () => {
    await writeJson(LOCAL_SETTINGS, localFixture());
    const before = await readText(LOCAL_SETTINGS);
    await syncHooksSettings({ rootDir: root });
    expect(await readText(LOCAL_SETTINGS)).toBe(before);
  });

  it('check + local reports a stale local file as drifted without writing', async () => {
    await writeJson(LOCAL_SETTINGS, localFixture());
    const before = await readText(LOCAL_SETTINGS);
    const result = await syncHooksSettings({ rootDir: root, local: true, check: true });
    expect(result.drifted).toEqual([LOCAL_SETTINGS]);
    expect(await readText(LOCAL_SETTINGS)).toBe(before);
  });
});

describe('tracked files drift guard (read-only, real repo)', () => {
  it('reports no drift between hooks.json and settings.json (root and templates)', async () => {
    const result = await syncHooksSettings({ rootDir: REPO_ROOT, check: true });
    expect(result.warnings).toEqual([]);
    expect(result.drifted).toEqual([]);
  });
});

describe('syncHooksSettings — local preservation and exact retirement', () => {
  const retiredDescription =
    'RTK auto-intercept — transparently rewrites CLI commands through RTK proxy when available (R013 advisory)';
  const generatedGroup = {
    matcher: 'Bash',
    description: 'Fixture generated audit',
    hooks: [{ type: 'command', command: 'bash .claude/hooks/scripts/fixture-audit.sh' }],
  };
  const rtkCommand = 'bash .claude/hooks/scripts/rtk-intercept.sh';
  const sibling = { type: 'command', command: 'bash ~/team/user-audit.sh --strict' };

  async function seed() {
    const hooksSource = { hooks: { PreToolUse: [generatedGroup] } };
    await writeJson('.claude/hooks/hooks.json', hooksSource);
    await writeJson('templates/.claude/hooks/hooks.json', hooksSource);
    const local = {
      customKey: { preserved: true },
      permissions: { defaultMode: 'default' },
      statusLine: { type: 'command', command: 'user-statusline' },
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            description: retiredDescription,
            hooks: [{ type: 'command', command: rtkCommand }, sibling],
          },
          { matcher: 'UserTool', hooks: [{ type: 'command', command: rtkCommand }] },
          { matcher: 'Bash', hooks: 'unknown-shape' },
          null,
        ],
        UserEvent: [{ hooks: [sibling] }],
      },
    };
    await writeJson(LOCAL_SETTINGS, local);
    return local;
  }

  it('preserves local user siblings/other matcher/unknown shape/keys while replacing both tracked targets', async () => {
    const localBefore = await seed();
    const sourceBefore = await Promise.all([
      readText('.claude/hooks/hooks.json'),
      readText('templates/.claude/hooks/hooks.json'),
    ]);
    const result = await syncHooksSettings({ rootDir: root, local: true });
    expect(result.warnings).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.files).toEqual(
      [ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS].map((file) => ({
        file,
        status: 'updated',
      }))
    );
    for (const target of [ROOT_SETTINGS, TEMPLATE_SETTINGS]) {
      expect((await readJson(target)).hooks).toEqual({ PreToolUse: [generatedGroup] });
    }
    const local = await readJson(LOCAL_SETTINGS);
    expect(local.customKey).toEqual(localBefore.customKey);
    expect(local.permissions).toEqual(localBefore.permissions);
    expect(local.statusLine).toEqual(localBefore.statusLine);
    expect(local.hooks).toEqual({
      PreToolUse: [
        generatedGroup,
        { matcher: 'Bash', description: retiredDescription, hooks: [sibling] },
        ...localBefore.hooks.PreToolUse.slice(1),
      ],
      UserEvent: localBefore.hooks.UserEvent,
    });
    expect(
      await Promise.all([
        readText('.claude/hooks/hooks.json'),
        readText('templates/.claude/hooks/hooks.json'),
      ])
    ).toEqual(sourceBefore);
    const bytes = await Promise.all(
      [ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS].map(readText)
    );
    const second = await syncHooksSettings({ rootDir: root, local: true });
    expect(second.files.every((file) => file.status === 'unchanged')).toBe(true);
    expect(second.warnings).toEqual([]);
    expect(
      await Promise.all([ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS].map(readText))
    ).toEqual(bytes);
  });

  it('check reports all three drifted targets and writes none', async () => {
    await seed();
    const targets = [ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS];
    const before = await Promise.all(targets.map(readText));
    const result = await syncHooksSettings({ rootDir: root, local: true, check: true });
    expect(result.drifted).toEqual(targets);
    expect(result.warnings).toEqual([]);
    expect(await Promise.all(targets.map(readText))).toEqual(before);
  });

  it('converter warnings prevent every target write rather than partially updating', async () => {
    await seed();
    await writeJson('templates/.claude/hooks/hooks.json', {
      hooks: {
        PreToolUse: [{ matcher: '&& (', hooks: [{ type: 'command', command: 'echo fixture' }] }],
      },
    });
    const targets = [ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS];
    const before = await Promise.all(targets.map(readText));
    const result = await syncHooksSettings({ rootDir: root, local: true });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes(TEMPLATE_SETTINGS))).toBe(true);
    expect(result.files.every((file) => file.status === 'drifted')).toBe(true);
    expect(await Promise.all(targets.map(readText))).toEqual(before);
  });

  it.each([
    '{ not json',
    '[]',
    'null',
    '\uFEFF{"user":true}',
  ])('malformed local %j cannot cause tracked half-writes', async (text) => {
    await seed();
    await writeFile(join(root, LOCAL_SETTINGS), text, 'utf8');
    const targets = [ROOT_SETTINGS, TEMPLATE_SETTINGS, LOCAL_SETTINGS];
    const before = await Promise.all(targets.map(readText));
    if (text.startsWith('{') || text.startsWith('\uFEFF')) {
      await expect(syncHooksSettings({ rootDir: root, local: true })).rejects.toThrow(
        'invalid JSON'
      );
    } else {
      const result = await syncHooksSettings({ rootDir: root, local: true });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.files.every((file) => file.status !== 'updated')).toBe(true);
    }
    expect(await Promise.all(targets.map(readText))).toEqual(before);
  });
});

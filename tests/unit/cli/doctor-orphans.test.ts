/**
 * Orphans doctor check (#1935 proposal 3): leftovers from retired templates.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkOrphans, doctorCommand } from '../../../src/cli/doctor.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { RETIRED_RTK_PATHS } from '../../../src/core/lockfile.js';
import { initI18n } from '../../../src/i18n/index.js';

const SKILL = '.claude/skills/memory-save/SKILL.md';
const SHIPPED_CONTENT = '# memory-save (shipped v0.148.0)\n';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('checkOrphans', () => {
  let tempDir: string;
  let listFile: string;

  async function writeLockfileFor(
    dir: string,
    files: Record<string, { templateHash: string }> = {}
  ): Promise<void> {
    const entries = Object.fromEntries(
      Object.entries(files).map(([filePath, entry]) => [
        filePath,
        { ...entry, size: 1, component: 'skills' },
      ])
    );
    await writeFile(
      join(dir, '.omcustom.lock.json'),
      JSON.stringify({ lockfileVersion: 1, files: entries })
    );
  }

  async function writeConfig(preserveFiles: string[]): Promise<void> {
    await writeFile(
      join(tempDir, '.omcustomrc.json'),
      JSON.stringify({ configVersion: 1, version: '2.0.19', preserveFiles })
    );
  }

  async function writeRetiredList(
    entries: Array<{ path: string; sha256: string[] }>
  ): Promise<void> {
    await writeFile(
      listFile,
      JSON.stringify({ description: 'test', schemaVersion: 1, paths: entries })
    );
  }

  async function writeProjectFile(relativePath: string, content: string): Promise<void> {
    const absolutePath = join(tempDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  beforeEach(async () => {
    await initI18n('en');
    tempDir = await mkdtemp(join(tmpdir(), 'omcustom-doctor-orphans-'));
    listFile = join(tempDir, 'retired-test-list.json');
    await writeLockfileFor(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when no lockfile exists (not an omcustom project)', async () => {
    await rm(join(tempDir, '.omcustom.lock.json'));
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    expect(await checkOrphans(tempDir, listFile)).toBeNull();
  });

  it('says update moves an owned unmodified leftover to a backup, in English and Korean (#1938)', async () => {
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const english = (await checkOrphans(tempDir, listFile))?.details?.[0] ?? '';
    let korean = '';
    try {
      await initI18n('ko');
      korean = (await checkOrphans(tempDir, listFile))?.details?.[0] ?? '';
    } finally {
      await initI18n('en');
    }

    expect(english).toContain('.omcustom-backup-<timestamp>/retired/');
    expect(english).not.toMatch(/removes it|deletes it/);
    expect(korean).toContain(SKILL);
    expect(korean).toContain('백업(.omcustom-backup-<timestamp>/retired/)으로 옮깁니다');
    expect(korean).not.toMatch(/제거합니다|삭제합니다/);
  });

  it('warns and says update moves to a backup a leftover the lock owns with a matching hash', async () => {
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.fixable).toBe(false);
    expect(result?.message).toContain('1 leftover');
    expect(result?.details).toHaveLength(1);
    expect(result?.details?.[0]).toContain(SKILL);
    expect(result?.details?.[0]).toContain('unmodified leftover');
    expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
    expect(result?.details?.[0]).not.toContain('delete it manually');
  });

  it('says delete manually, not "update moves it to a backup", when a template-owned lock omits the file', async () => {
    // lock is empty: v2.0.20+ locks do not record leftovers
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.fixable).toBe(false);
    expect(result?.details).toHaveLength(1);
    expect(result?.details?.[0]).toContain(SKILL);
    expect(result?.details?.[0]).toContain("'omcustom update' keeps it");
    expect(result?.details?.[0]).toContain('delete it manually');
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('says delete manually when the lock hash differs from the shipped-version disk hash', async () => {
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256('another version\n') } });
    await writeRetiredList([
      { path: SKILL, sha256: [sha256('another version\n'), sha256(SHIPPED_CONTENT)] },
    ]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.details?.[0]).toContain("'omcustom update' keeps it");
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('says delete manually when the lock hash is not a valid sha256', async () => {
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: 'not-a-hash' } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain("'omcustom update' keeps it");
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('reports a leftover preserved via config.preserveFiles as kept by preserve settings', async () => {
    await writeConfig([SKILL]);
    // Lock and hash match, so without the preserve setting update would remove it
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.fixable).toBe(false);
    expect(result?.details?.[0]).toContain(SKILL);
    expect(result?.details?.[0]).toContain('kept by your preserve settings');
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('treats a directory prefix in config.preserveFiles as preserving the leftover', async () => {
    await writeConfig(['.claude/skills/memory-save']);
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain('kept by your preserve settings');
  });

  it('reports a leftover preserved via the customization manifest as preserved', async () => {
    await writeFile(
      join(tempDir, '.omcustom-customizations.json'),
      JSON.stringify({
        modifiedFiles: [],
        preserveFiles: [SKILL],
        customComponents: [],
        lastUpdated: '2026-11-10T00:00:00.000Z',
      })
    );
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain('kept by your preserve settings');
  });

  it('classifies normally, like update, when the manifest has no preserveFiles array (review P2)', async () => {
    await writeFile(
      join(tempDir, '.omcustom-customizations.json'),
      JSON.stringify({ lastUpdated: '2026-11-10T00:00:00.000Z' })
    );
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.message).not.toContain('could not run');
    expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
  });

  it('honors manifest preserveFiles and modifiedFiles while another list is missing', async () => {
    await writeFile(
      join(tempDir, '.omcustom-customizations.json'),
      JSON.stringify({ modifiedFiles: ['.claude/skills/memory-save/'] })
    );
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain('kept by your preserve settings');
  });

  it('treats config and manifest entries with a trailing slash or ./ prefix as preserving', async () => {
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    await writeConfig(['./.claude/skills/memory-save/']);
    expect((await checkOrphans(tempDir, listFile))?.details?.[0]).toContain(
      'kept by your preserve settings'
    );

    await writeConfig([]);
    await writeFile(
      join(tempDir, '.omcustom-customizations.json'),
      JSON.stringify({ preserveFiles: ['.claude/skills/memory-save/'] })
    );
    expect((await checkOrphans(tempDir, listFile))?.details?.[0]).toContain(
      'kept by your preserve settings'
    );
  });

  it('does not treat bare-slash or empty entries as preserving everything', async () => {
    await writeConfig(['/', './']);
    await writeFile(
      join(tempDir, '.omcustom-customizations.json'),
      JSON.stringify({ preserveFiles: ['', '/'], modifiedFiles: ['./'] })
    );
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
  });

  it('does not report as preserved when the preserve setting names another path', async () => {
    await writeConfig(['.claude/skills/other-skill']);
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
    expect(result?.details?.[0]).not.toContain('preserve settings');
  });

  it('warns and asks for manual review of a modified leftover', async () => {
    const edited = `${SHIPPED_CONTENT}my own edit\n`;
    // Even when the lock matches the disk, content that is no shipped version is modified
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(edited) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile(SKILL, edited);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.fixable).toBe(false);
    expect(result?.details).toHaveLength(1);
    expect(result?.details?.[0]).toContain(SKILL);
    expect(result?.details?.[0]).toContain('modified leftover');
    expect(result?.details?.[0]).toContain('review it and delete it manually');
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('classifies several leftovers independently and keeps the list order', async () => {
    const other = '.claude/skills/jinja2-prompts/SKILL.md';
    const emptyHashes = '.claude/skills/peer-messaging/SKILL.md';
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([
      { path: SKILL, sha256: [sha256('older version\n'), sha256(SHIPPED_CONTENT)] },
      { path: other, sha256: [sha256('x')] },
      { path: emptyHashes, sha256: [] },
    ]);
    await writeProjectFile(SKILL, SHIPPED_CONTENT);
    await writeProjectFile(other, 'x');
    await writeProjectFile(emptyHashes, 'anything');

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.message).toContain('3 leftover');
    expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
    expect(result?.details?.[1]).toContain("'omcustom update' keeps it");
    expect(result?.details?.[2]).toContain('review it and delete it manually');
  });

  it('does not flag a retired-list path that the package still ships (stale list)', async () => {
    const shipped = '.claude/rules/MUST-safety.md';
    await writeRetiredList([{ path: shipped, sha256: [sha256('old\n')] }]);
    await writeProjectFile(shipped, 'old\n');

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('pass');
  });

  it('warns with the reason, without throwing, when the customization manifest is invalid', async () => {
    await writeFile(join(tempDir, '.omcustom-customizations.json'), '{ not json');
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.message).toContain('Orphan check could not run');
    expect(result?.message).toContain('customization manifest unreadable');
  });

  it('does not flag user custom files that are not in the retired list', async () => {
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
    await writeProjectFile('.claude/skills/my-custom-skill/SKILL.md', '# mine\n');
    await writeProjectFile('guides/my-notes/index.md', '# notes\n');

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('pass');
    expect(result?.fixable).toBe(false);
    expect(result?.details).toBeUndefined();
  });

  it('passes on a clean project and reports how many retired paths were checked', async () => {
    await writeRetiredList([
      { path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] },
      { path: '.claude/skills/codex-exec/SKILL.md', sha256: [sha256('c')] },
    ]);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('2 retired paths checked');
  });

  it('passes when the retired list file is absent (loader returns an empty list)', async () => {
    const result = await checkOrphans(tempDir, join(tempDir, 'does-not-exist.json'));

    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('0 retired paths checked');
  });

  it('warns with the reason, without throwing, when the list is invalid JSON', async () => {
    await writeFile(listFile, '{ not json');

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.fixable).toBe(false);
    expect(result?.message).toContain('Orphan check could not run');
    expect(result?.details).toBeUndefined();
  });

  it('warns with the validation reason when the list fails schema validation', async () => {
    await writeFile(
      listFile,
      JSON.stringify({
        description: 'test',
        schemaVersion: 1,
        paths: [{ path: '../x', sha256: [] }],
      })
    );

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.message).toContain('canonical path');
  });

  it('warns with a stringified reason when a non-Error is thrown', async () => {
    // The loader only throws Error instances, so reach the non-Error branch with a spy.
    const loader = await import('../../../src/core/retired-template-paths.js');
    const spy = spyOn(loader, 'loadRetiredTemplatePaths').mockRejectedValue('plain string failure');
    try {
      const result = await checkOrphans(tempDir);
      expect(result?.status).toBe('warn');
      expect(result?.message).toContain('plain string failure');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not follow a symlinked leftover to a file outside the project', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'omcustom-doctor-orphans-outside-'));
    try {
      const outsideFile = join(outsideDir, 'SKILL.md');
      await writeFile(outsideFile, SHIPPED_CONTENT);
      await mkdir(join(tempDir, '.claude/skills/memory-save'), { recursive: true });
      await symlink(outsideFile, join(tempDir, SKILL));
      await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);

      const result = await checkOrphans(tempDir, listFile);

      expect(result?.status).toBe('pass');
      expect(result?.details).toBeUndefined();
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('does not read through a symlinked directory that resolves outside the project', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'omcustom-doctor-orphans-outside-'));
    try {
      await writeFile(join(outsideDir, 'SKILL.md'), SHIPPED_CONTENT);
      await mkdir(join(tempDir, '.claude/skills'), { recursive: true });
      await symlink(outsideDir, join(tempDir, '.claude/skills/memory-save'));
      await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);

      const result = await checkOrphans(tempDir, listFile);

      expect(result?.status).toBe('pass');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('reports a leftover behind a symlinked directory inside the project as kept by update', async () => {
    await writeProjectFile('real-skills/memory-save/SKILL.md', SHIPPED_CONTENT);
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await symlink(join(tempDir, 'real-skills'), join(tempDir, '.claude/skills'));
    // Lock and hash match, but update requires the exact location (no symlinked directory)
    await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
    await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('warn');
    expect(result?.details?.[0]).toContain("'omcustom update' keeps it");
    expect(result?.details?.[0]).not.toContain('moves it to a backup');
  });

  it('ignores a directory at a retired file path and a file where a parent directory is expected', async () => {
    await mkdir(join(tempDir, SKILL), { recursive: true });
    await writeProjectFile('.claude/skills/jinja2-prompts', 'a file, not a directory');
    await writeRetiredList([
      { path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] },
      { path: '.claude/skills/jinja2-prompts/SKILL.md', sha256: [sha256('x')] },
    ]);

    const result = await checkOrphans(tempDir, listFile);

    expect(result?.status).toBe('pass');
  });

  it('falls back to the resolved path when the project root cannot be realpath-ed', async () => {
    // A root that does not exist has no lockfile, so stub readLockfile to reach the fallback.
    const lockfileModule = await import('../../../src/core/lockfile.js');
    const missingRoot = join(tempDir, 'gone');
    const spy = spyOn(lockfileModule, 'readLockfile').mockResolvedValue({
      lockfileVersion: 1,
      files: {},
    } as never);
    try {
      await writeRetiredList([{ path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);

      const result = await checkOrphans(missingRoot, listFile);

      expect(result?.status).toBe('pass');
    } finally {
      spy.mockRestore();
    }
  });

  describe('retired RTK paths', () => {
    const RTK_SKILL = '.claude/skills/rtk-exec/SKILL.md';
    const RTK_WRAPPER = '.claude/skills/rtk-exec/scripts/rtk-wrapper.cjs';
    const RTK_HOOK = '.claude/hooks/scripts/rtk-intercept.sh';

    it('uses the same three paths as the lockfile retirement set', () => {
      expect([...RETIRED_RTK_PATHS].sort()).toEqual([RTK_SKILL, RTK_WRAPPER, RTK_HOOK].sort());
    });

    it('does not call a lock-matching non-shipped RTK file "modified"', async () => {
      const content = '# rtk-exec, an older unshipped revision\n';
      await writeLockfileFor(tempDir, { [RTK_SKILL]: { templateHash: sha256(content) } });
      await writeRetiredList([{ path: RTK_SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
      await writeProjectFile(RTK_SKILL, content);

      const result = await checkOrphans(tempDir, listFile);

      expect(result?.status).toBe('warn');
      expect(result?.details).toHaveLength(1);
      const detail = result?.details?.[0] ?? '';
      expect(detail).toContain(RTK_SKILL);
      expect(detail).toContain('retired RTK file');
      expect(detail).toContain("'omcustom update' — it deletes RTK leftovers");
      expect(detail).not.toContain('modified leftover');
      expect(detail).not.toContain('delete it manually');
    });

    it('makes no removal promise when a settings conflict can keep the file', async () => {
      await writeLockfileFor(tempDir, { [RTK_HOOK]: { templateHash: sha256('#!/bin/sh\n') } });
      await writeRetiredList([{ path: RTK_HOOK, sha256: [sha256('#!/bin/sh\n')] }]);
      await writeProjectFile(RTK_HOOK, '#!/bin/sh\n');
      await writeProjectFile(
        '.claude/settings.json',
        JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: `bash ${RTK_HOOK}` }] }] },
        })
      );

      const result = await checkOrphans(tempDir, listFile);

      const detail = result?.details?.[0] ?? '';
      expect(detail).toContain(RTK_HOOK);
      expect(detail).toContain('rtk-intercept.sh');
      expect(detail).not.toContain("'omcustom update' moves it to a backup");
      expect(detail).not.toContain('unmodified leftover');
    });

    it('reports a lock-owned shipped-content RTK file and a preserved RTK file the same way', async () => {
      const content = '// wrapper\n';
      await writeLockfileFor(tempDir, { [RTK_WRAPPER]: { templateHash: sha256(content) } });
      await writeConfig([RTK_WRAPPER]);
      await writeRetiredList([
        { path: RTK_WRAPPER, sha256: [sha256(content)] },
        { path: RTK_SKILL, sha256: [sha256(SHIPPED_CONTENT)] },
      ]);
      await writeProjectFile(RTK_WRAPPER, content);
      await writeProjectFile(RTK_SKILL, SHIPPED_CONTENT);

      const result = await checkOrphans(tempDir, listFile);

      expect(result?.details).toHaveLength(2);
      for (const detail of result?.details ?? []) {
        expect(detail).toContain('retired RTK file');
        expect(detail).not.toContain('kept by your preserve settings');
        expect(detail).not.toContain('keeps it (');
      }
    });

    it('does not flag an absent RTK file and leaves non-RTK classification unchanged', async () => {
      await writeLockfileFor(tempDir, { [SKILL]: { templateHash: sha256(SHIPPED_CONTENT) } });
      await writeRetiredList([
        { path: RTK_SKILL, sha256: [sha256(SHIPPED_CONTENT)] },
        { path: SKILL, sha256: [sha256(SHIPPED_CONTENT)] },
      ]);
      await writeProjectFile(SKILL, SHIPPED_CONTENT);

      const result = await checkOrphans(tempDir, listFile);

      expect(result?.details).toHaveLength(1);
      expect(result?.details?.[0]).toContain(SKILL);
      expect(result?.details?.[0]).toContain("'omcustom update' moves it to a backup");
    });

    it('has Korean text for the RTK class that says update deletes it', async () => {
      await initI18n('ko');
      try {
        await writeRetiredList([{ path: RTK_SKILL, sha256: [sha256(SHIPPED_CONTENT)] }]);
        await writeProjectFile(RTK_SKILL, '# anything\n');

        const result = await checkOrphans(tempDir, listFile);

        const detail = result?.details?.[0] ?? '';
        expect(detail).toContain(RTK_SKILL);
        expect(detail).toContain('RTK');
        expect(detail).toContain('삭제');
        expect(detail).not.toContain('{{');
      } finally {
        await initI18n('en');
      }
    });
  });

  it('detects leftovers from the packaged retired list (real list, modified content)', async () => {
    await writeProjectFile('.claude/skills/memory-save/SKILL.md', '# locally rewritten\n');

    const result = await checkOrphans(tempDir);

    expect(result?.name).toBe('Orphans');
    expect(result?.status).toBe('warn');
    expect(result?.details?.some((d) => d.includes('.claude/skills/memory-save/SKILL.md'))).toBe(
      true
    );
  });

  it('passes on a clean project with the packaged retired list', async () => {
    await writeProjectFile('.claude/skills/my-custom-skill/SKILL.md', '# mine\n');

    const result = await checkOrphans(tempDir);

    expect(result?.status).toBe('pass');
  });

  describe('doctorCommand wiring', () => {
    let originalCwd: typeof process.cwd;
    let consoleSpy: ReturnType<typeof spyOn>;
    let codexSpies: Array<{ mockRestore: () => void }>;

    beforeEach(() => {
      originalCwd = process.cwd;
      consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
      codexSpies = [
        spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(false),
        spyOn(codexInstaller, 'getCodexVersion').mockReturnValue(null),
        spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
      ];
    });

    afterEach(() => {
      process.cwd = originalCwd;
      consoleSpy.mockRestore();
      for (const codexSpy of codexSpies) {
        codexSpy.mockRestore();
      }
    });

    it('includes an Orphans check next to the Lockfile check when a lockfile exists', async () => {
      process.cwd = () => tempDir;
      await writeProjectFile('.claude/skills/memory-save/SKILL.md', '# locally rewritten\n');

      const result = await doctorCommand({ quiet: true });
      const names = result.checks.map((c) => c.name);
      const orphans = result.checks.find((c) => c.name === 'Orphans');

      expect(names).toContain('Lockfile');
      expect(names.indexOf('Orphans')).toBe(names.indexOf('Lockfile') + 1);
      expect(orphans?.status).toBe('warn');
      expect(orphans?.fixable).toBe(false);
    });

    it('omits the Orphans check when no lockfile exists', async () => {
      process.cwd = () => tempDir;
      await rm(join(tempDir, '.omcustom.lock.json'));
      await writeProjectFile('.claude/skills/memory-save/SKILL.md', '# locally rewritten\n');

      const result = await doctorCommand({ quiet: true });

      expect(result.checks.some((c) => c.name === 'Orphans')).toBe(false);
    });
  });
});

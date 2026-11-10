/**
 * Orphan retirement during `omcustom update` (#1935 items 1-2).
 *
 * Each test seeds a temp project as an "old install": leftovers that oh-my-customcode no longer
 * ships, a user custom skill, and user-modified leftovers, with an old lock that (like a legacy
 * disk-walking lock) records all of them. Only provably unmodified shipped copies are removed.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import * as lockfileModule from '../../../src/core/lockfile.js';
import type { RetiredTemplatePathEntry } from '../../../src/core/retired-template-paths.js';
import * as retiredModule from '../../../src/core/retired-template-paths.js';
import {
  isPathPreserved,
  retiredBackupPath,
  type UpdateOptions,
  update,
} from '../../../src/core/updater.js';
import * as logger from '../../../src/utils/logger.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const SHIPPED = 'shipped content of an old release\n';
const SHIPPED_OTHER = 'another shipped version\n';

const UNMODIFIED_SKILL = '.claude/skills/old-skill/SKILL.md';
const UNMODIFIED_SCRIPT = '.claude/skills/old-skill/scripts/run.cjs';
const UNMODIFIED_GUIDE = 'guides/old-guide/intro.md';
const MODIFIED = '.claude/skills/old-modified/SKILL.md';
const PRESERVED = '.claude/skills/old-preserved/SKILL.md';
const UNSHIPPED_CONTENT = '.claude/skills/old-unshipped/SKILL.md';
const NOT_IN_LOCK = '.claude/skills/old-unowned/SKILL.md';
const BAD_LOCK_HASH = '.claude/skills/old-badhash/SKILL.md';
const SYMLINK_FILE = '.claude/skills/old-symlink/SKILL.md';
const THROUGH_LINK = '.claude/skills/old-linked/SKILL.md';
const STILL_SHIPPED = '.claude/rules/MUST-safety.md';
const RTK_PATH = '.claude/skills/rtk-exec/SKILL.md';
const RTK_HOOK = '.claude/hooks/scripts/rtk-intercept.sh';
const ABSENT = '.claude/skills/old-absent/SKILL.md';
const CUSTOM = '.claude/skills/my-custom/SKILL.md';

const RETIRED: RetiredTemplatePathEntry[] = [
  ...[
    UNMODIFIED_SKILL,
    UNMODIFIED_SCRIPT,
    UNMODIFIED_GUIDE,
    MODIFIED,
    PRESERVED,
    NOT_IN_LOCK,
    BAD_LOCK_HASH,
    SYMLINK_FILE,
    THROUGH_LINK,
    STILL_SHIPPED,
    RTK_PATH,
    RTK_HOOK,
    ABSENT,
  ].map((path) => ({ path, sha256: [sha256(SHIPPED_OTHER), sha256(SHIPPED)].sort() })),
  { path: UNSHIPPED_CONTENT, sha256: [sha256(SHIPPED_OTHER)] },
];

let project: string;
let loaderSpy: ReturnType<typeof spyOn>;
let codexCheckSpy: ReturnType<typeof spyOn>;
let codexInstallSpy: ReturnType<typeof spyOn>;
let networkSpy: ReturnType<typeof spyOn>;
let syncCommandSpy: ReturnType<typeof spyOn>;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(project, path)), { recursive: true });
  await writeFile(join(project, path), content);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(join(project, path));
    return true;
  } catch {
    return false;
  }
}

async function readLock(): Promise<{ files: Record<string, unknown> }> {
  return JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8'));
}

/** Old install: leftovers, a custom skill, modified leftovers; the old lock records them all. */
async function seedOldInstall(): Promise<void> {
  const config = getDefaultConfig();
  config.version = '0.1.0';
  config.preserveFiles = [PRESERVED];
  await saveConfig(project, config);

  const files: Record<string, string> = {
    [UNMODIFIED_SKILL]: SHIPPED,
    [UNMODIFIED_SCRIPT]: SHIPPED_OTHER,
    [UNMODIFIED_GUIDE]: SHIPPED,
    [MODIFIED]: 'user edits\n',
    [PRESERVED]: SHIPPED,
    [UNSHIPPED_CONTENT]: SHIPPED,
    [NOT_IN_LOCK]: SHIPPED,
    [BAD_LOCK_HASH]: SHIPPED,
    [CUSTOM]: 'my own skill\n',
    '.claude/skills-real/old-linked/SKILL.md': SHIPPED,
    'outside.md': SHIPPED,
  };
  for (const [path, content] of Object.entries(files)) await put(path, content);
  await mkdir(join(project, '.claude/skills/old-symlink'), { recursive: true });
  await symlink(join(project, 'outside.md'), join(project, SYMLINK_FILE));
  await symlink(
    join(project, '.claude/skills-real/old-linked'),
    join(project, '.claude/skills/old-linked')
  );

  const entry = (hash: string, component = 'skills') => ({
    templateHash: hash,
    size: 1,
    component,
  });
  const lockFiles: Record<string, unknown> = {
    [UNMODIFIED_SKILL]: entry(sha256(SHIPPED)),
    [UNMODIFIED_SCRIPT]: entry(sha256(SHIPPED_OTHER)),
    [UNMODIFIED_GUIDE]: entry(sha256(SHIPPED), 'guides'),
    // Legacy locks record whatever was on disk; here the leftover was edited after that.
    [MODIFIED]: entry(sha256(SHIPPED)),
    [PRESERVED]: entry(sha256(SHIPPED)),
    [UNSHIPPED_CONTENT]: entry(sha256(SHIPPED)),
    [BAD_LOCK_HASH]: entry('not-a-sha256'),
    [SYMLINK_FILE]: entry(sha256(SHIPPED)),
    [THROUGH_LINK]: entry(sha256(SHIPPED)),
    [CUSTOM]: entry(sha256('my own skill\n')),
  };
  await writeFile(
    join(project, '.omcustom.lock.json'),
    JSON.stringify({
      lockfileVersion: 1,
      generatorVersion: '0.1.0',
      templateVersion: '0.1.0',
      generatedAt: '2025-01-01T00:00:00.000Z',
      files: lockFiles,
    })
  );
}

function reasonOf(result: Awaited<ReturnType<typeof update>>, path: string): string | undefined {
  return result.orphanRetirement?.preserved.find((entry) => entry.path === path)?.reason;
}

function keptByOf(result: Awaited<ReturnType<typeof update>>, path: string): string | undefined {
  return result.orphanRetirement?.preserved.find((entry) => entry.path === path)?.keptBy;
}

/** The `.omcustom-backup-*` directories at the project root, sorted. */
async function backupDirs(): Promise<string[]> {
  return (await readdir(project)).filter((name) => name.startsWith('.omcustom-backup-')).sort();
}

beforeEach(async () => {
  project = await realpath(await mkdtemp(join(tmpdir(), 'omcustom-orphan-update-')));
  loaderSpy = spyOn(retiredModule, 'loadRetiredTemplatePaths').mockResolvedValue(
    RETIRED.map((entry) => ({ ...entry, sha256: [...entry.sha256] }))
  );
  networkSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
  syncCommandSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
    throw new Error('external synchronous command forbidden');
  });
  codexCheckSpy = spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true);
  codexInstallSpy = spyOn(codexInstaller, 'installCodex').mockReturnValue(false);
});

afterEach(async () => {
  loaderSpy.mockRestore();
  networkSpy.mockRestore();
  syncCommandSpy.mockRestore();
  codexCheckSpy.mockRestore();
  codexInstallSpy.mockRestore();
  await rm(project, { recursive: true, force: true });
});

describe('update orphan retirement (#1935)', () => {
  it('removes unmodified leftovers, keeps custom/modified/unverifiable files, and the new lock carries only the owned kept one', async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    expect(result.orphanRetirement?.wouldRemove).toEqual([]);
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT, UNMODIFIED_GUIDE]) {
      expect(await exists(path)).toBe(false);
      expect(result.removedDeprecatedFiles).toContain(path);
    }
    // Directories that became empty are removed, up to but not including the component root.
    expect(await exists('.claude/skills/old-skill')).toBe(false);
    expect(await exists('guides/old-guide')).toBe(false);
    expect(await exists('.claude/skills')).toBe(true);
    expect(await exists('guides')).toBe(true);

    expect(reasonOf(result, MODIFIED)).toBe('user-modified file');
    expect(reasonOf(result, PRESERVED)).toBe('explicitly preserved');
    expect(reasonOf(result, UNSHIPPED_CONTENT)).toBe('content does not match any shipped version');
    expect(reasonOf(result, NOT_IN_LOCK)).toBe('missing or invalid old ownership');
    expect(reasonOf(result, BAD_LOCK_HASH)).toBe('missing or invalid old ownership');
    expect(reasonOf(result, SYMLINK_FILE)).toBe('not a regular owned file');
    expect(reasonOf(result, THROUGH_LINK)).toBe('path goes through a symlinked directory');
    const kept = [
      MODIFIED,
      PRESERVED,
      UNSHIPPED_CONTENT,
      NOT_IN_LOCK,
      BAD_LOCK_HASH,
      SYMLINK_FILE,
      THROUGH_LINK,
    ];
    expect(result.orphanRetirement?.preserved.map((entry) => entry.path).sort()).toEqual(
      [...kept].sort()
    );
    for (const path of kept) {
      expect(await exists(path)).toBe(true);
    }
    // Actionable keeps get a warning and count as preserved files (#1938-1) ...
    for (const path of kept.filter((keptPath) => keptPath !== PRESERVED)) {
      expect(result.preservedFiles).toContain(path);
      expect(result.warnings).toContainEqual(
        expect.stringContaining(`Orphan retirement preserved ${path}:`)
      );
    }
    // ... a leftover the preserve settings cover is a deliberate keep: no warning, and orphan
    // retirement does not count it again (the skills update already lists the preserve entry).
    expect(result.orphanRetirement?.preserved).toContainEqual({
      path: PRESERVED,
      reason: 'explicitly preserved',
      keptBy: 'preserve-settings',
    });
    expect(result.preservedFiles.filter((path) => path === PRESERVED)).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes(PRESERVED))).toBe(false);
    expect(await readFile(join(project, MODIFIED), 'utf8')).toBe('user edits\n');
    expect(await readFile(join(project, 'outside.md'), 'utf8')).toBe(SHIPPED);
    expect(await readFile(join(project, '.claude/skills-real/old-linked/SKILL.md'), 'utf8')).toBe(
      SHIPPED
    );

    // A custom skill is not in the retired list: kept silently.
    expect(await readFile(join(project, CUSTOM), 'utf8')).toBe('my own skill\n');
    expect(result.warnings.some((warning) => warning.includes(CUSTOM))).toBe(false);
    // A still-shipped template path and the RTK paths are not handled by this flow.
    expect(await exists(STILL_SHIPPED)).toBe(true);
    expect(reasonOf(result, STILL_SHIPPED)).toBeUndefined();
    expect(reasonOf(result, RTK_PATH)).toBeUndefined();
    expect(reasonOf(result, ABSENT)).toBeUndefined();

    const lock = await readLock();
    const notCarried = kept.filter((path) => path !== PRESERVED);
    for (const path of [
      ...notCarried,
      CUSTOM,
      UNMODIFIED_SKILL,
      UNMODIFIED_SCRIPT,
      UNMODIFIED_GUIDE,
    ]) {
      expect(lock.files[path]).toBeUndefined();
    }
    // Explicit preservation only blocks deletion; the unmodified shipped copy stays owned.
    expect(lock.files[PRESERVED]).toEqual({
      templateHash: sha256(SHIPPED),
      size: Buffer.byteLength(SHIPPED),
      component: 'skills',
    });
    expect(lock.files[STILL_SHIPPED]).toBeDefined();
  });

  it('dry-run deletes nothing and lists the would-remove candidates', async () => {
    await seedOldInstall();
    const lockBefore = await readFile(join(project, '.omcustom.lock.json'), 'utf8');

    const result = await update({ targetDir: project, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.wouldRemove.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(reasonOf(result, MODIFIED)).toBe('user-modified file');
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT, UNMODIFIED_GUIDE, MODIFIED, CUSTOM]) {
      expect(await exists(path)).toBe(true);
    }
    expect(await readFile(join(project, '.omcustom.lock.json'), 'utf8')).toBe(lockBefore);
  });

  it('a component-scoped update only retires leftovers of the selected components', async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_GUIDE]);
    expect(result.orphanRetirement?.preserved).toEqual([]);
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect(await exists(UNMODIFIED_GUIDE)).toBe(false);
  });

  it('keeps a directory that still holds other files after a removal', async () => {
    await seedOldInstall();
    await put('.claude/skills/old-skill/notes.md', 'user notes\n');

    const result = await update({ targetDir: project, components: ['skills'] });

    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
    expect(await exists(UNMODIFIED_SCRIPT)).toBe(false);
    expect(await exists('.claude/skills/old-skill/scripts')).toBe(false);
    expect(await readFile(join(project, '.claude/skills/old-skill/notes.md'), 'utf8')).toBe(
      'user notes\n'
    );
  });

  it('skips the step with a warning when the retired list cannot be read', async () => {
    await seedOldInstall();
    loaderSpy.mockRejectedValue(new Error('corrupt list'));

    const result = await update({ targetDir: project, components: ['skills'] });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement).toBeUndefined();
    expect(result.warnings).toContainEqual(expect.stringContaining('corrupt list'));
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
  });

  it('leaves RTK paths to the RTK flow, so a settings conflict still keeps an owned RTK hook', async () => {
    await seedOldInstall();
    await put(RTK_HOOK, SHIPPED);
    const lock = await readLock();
    lock.files[RTK_HOOK] = { templateHash: sha256(SHIPPED), size: 1, component: 'hooks' };
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(lock));
    await put('.claude/settings.local.json', '{ bad json');

    const result = await update({ targetDir: project, components: ['hooks'] });

    expect(result.success).toBe(true);
    expect(await readFile(join(project, RTK_HOOK), 'utf8')).toBe(SHIPPED);
    expect(result.rtkRetirement?.preserved).toContainEqual({
      path: RTK_HOOK,
      reason: 'settings retirement conflict',
    });
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(reasonOf(result, RTK_HOOK)).toBeUndefined();
  });

  it('records a non-Error failure reason generically', async () => {
    await seedOldInstall();
    loaderSpy.mockRejectedValue('plain string failure');

    const result = await update({ targetDir: project, components: ['skills'] });

    expect(result.warnings).toContainEqual(expect.stringContaining('plain string failure'));
  });

  it('uses the shipped list by default: #1935 leftovers that do not match a shipped version stay', async () => {
    loaderSpy.mockRestore();
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    const leftover = '.claude/skills/memory-save/SKILL.md';
    await put(leftover, 'not a shipped version\n');
    await writeFile(
      join(project, '.omcustom.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        generatorVersion: '0.148.0',
        templateVersion: '0.148.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        files: {
          [leftover]: {
            templateHash: sha256('not a shipped version\n'),
            size: 1,
            component: 'skills',
          },
        },
      })
    );

    const options: UpdateOptions = { targetDir: project, components: ['skills'] };
    const result = await update(options);

    expect(result.success).toBe(true);
    expect(reasonOf(result, leftover)).toBe('content does not match any shipped version');
    expect(await readFile(join(project, leftover), 'utf8')).toBe('not a shipped version\n');
    expect((await readLock()).files[leftover]).toBeUndefined();
    // Only template-owned files are recorded.
    for (const key of Object.keys((await readLock()).files)) {
      await access(join(import.meta.dir, '../../../templates', key));
    }
    expect((await readdir(join(project, '.claude/skills'))).length).toBeGreaterThan(1);
  });
});

describe('orphan ownership carried forward (#1935 follow-up)', () => {
  const lockBytes = (): Promise<string> => readFile(join(project, '.omcustom.lock.json'), 'utf8');

  it('reviewer scenario: a partial update keeps ownership, so a later forced update removes the leftover', async () => {
    await seedOldInstall();

    const partial = await update({ targetDir: project, components: ['guides'] });
    expect(partial.success).toBe(true);
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect((await readLock()).files[UNMODIFIED_SKILL]).toEqual({
      templateHash: sha256(SHIPPED),
      size: Buffer.byteLength(SHIPPED),
      component: 'skills',
    });

    const forced = await update({ targetDir: project, force: true });
    expect(forced.success).toBe(true);
    expect(forced.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
    expect((await readLock()).files[UNMODIFIED_SKILL]).toBeUndefined();
  });

  it('a plain update after a partial update removes the leftover', async () => {
    await seedOldInstall();
    await update({ targetDir: project, components: ['guides'] });

    const plain = await update({ targetDir: project });

    expect(plain.success).toBe(true);
    expect(plain.orphanRetirement?.removed.sort()).toEqual(
      [UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
  });

  it('a carried entry survives two consecutive partial updates', async () => {
    await seedOldInstall();

    await update({ targetDir: project, components: ['guides'] });
    await update({ targetDir: project, components: ['rules'] });

    const lock = await readLock();
    expect(lock.files[UNMODIFIED_SKILL]).toBeDefined();
    expect(lock.files[UNMODIFIED_SCRIPT]).toBeDefined();
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    const full = await update({ targetDir: project });
    expect(full.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
  });

  it('never-owned and modified leftovers are not carried and stay on disk', async () => {
    await seedOldInstall();

    await update({ targetDir: project, components: ['guides'] });
    await update({ targetDir: project, components: ['guides'] });

    const lock = await readLock();
    for (const path of [NOT_IN_LOCK, MODIFIED, UNSHIPPED_CONTENT, BAD_LOCK_HASH, CUSTOM]) {
      expect(lock.files[path]).toBeUndefined();
      expect(await exists(path)).toBe(true);
    }
    expect(await readFile(join(project, MODIFIED), 'utf8')).toBe('user edits\n');
    // A full update still keeps them: ownership cannot be proven.
    const full = await update({ targetDir: project });
    expect(reasonOf(full, NOT_IN_LOCK)).toBe('missing or invalid old ownership');
    expect(reasonOf(full, MODIFIED)).toBe('missing or invalid old ownership');
    expect(await exists(MODIFIED)).toBe(true);
  });

  it('a carried leftover the user edits later loses ownership and is kept', async () => {
    await seedOldInstall();
    await update({ targetDir: project, components: ['guides'] });
    await writeFile(join(project, UNMODIFIED_SKILL), 'edited after the partial update\n');

    await update({ targetDir: project, components: ['guides'] });

    expect((await readLock()).files[UNMODIFIED_SKILL]).toBeUndefined();
    const full = await update({ targetDir: project });
    expect(reasonOf(full, UNMODIFIED_SKILL)).toBe('missing or invalid old ownership');
    expect(await readFile(join(project, UNMODIFIED_SKILL), 'utf8')).toBe(
      'edited after the partial update\n'
    );
  });

  it('a dry-run partial update carries nothing and writes nothing', async () => {
    await seedOldInstall();
    const before = await lockBytes();

    const result = await update({ targetDir: project, components: ['guides'], dryRun: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.wouldRemove).toEqual([UNMODIFIED_GUIDE]);
    expect(await lockBytes()).toBe(before);
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
  });

  it('an unreadable list skips removal but carries owned entries with a warning; the list removes them later', async () => {
    await seedOldInstall();
    loaderSpy.mockRejectedValue(new Error('corrupt list'));

    const failed = await update({ targetDir: project, components: ['guides'] });

    expect(failed.success).toBe(true);
    expect(failed.orphanRetirement).toBeUndefined();
    expect(failed.warnings).toContainEqual(expect.stringContaining('corrupt list'));
    expect(failed.warnings).toContainEqual(
      expect.stringContaining('was carried forward without the retired template list')
    );
    const lock = await readLock();
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT, UNMODIFIED_GUIDE, PRESERVED, CUSTOM]) {
      expect(lock.files[path]).toBeDefined();
      expect(await exists(path)).toBe(true);
    }
    for (const path of [MODIFIED, NOT_IN_LOCK, BAD_LOCK_HASH, SYMLINK_FILE, THROUGH_LINK]) {
      expect(lock.files[path]).toBeUndefined();
    }

    loaderSpy.mockResolvedValue(RETIRED.map((entry) => ({ ...entry, sha256: [...entry.sha256] })));
    const recovered = await update({ targetDir: project });

    expect(recovered.orphanRetirement?.removed.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    // The custom skill was only carried by the fallback; it is never removed and drops out.
    expect(await readFile(join(project, CUSTOM), 'utf8')).toBe('my own skill\n');
    expect((await readLock()).files[CUSTOM]).toBeUndefined();
  });

  it('an empty list (missing list file) also carries owned entries without removing anything', async () => {
    await seedOldInstall();
    loaderSpy.mockResolvedValue([]);

    const result = await update({ targetDir: project });

    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect((await readLock()).files[UNMODIFIED_SKILL]).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.stringContaining('was carried forward without the retired template list')
    );
  });

  it('carries nothing without an old lock', async () => {
    await seedOldInstall();
    await rm(join(project, '.omcustom.lock.json'));

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.success).toBe(true);
    expect((await readLock()).files[UNMODIFIED_SKILL]).toBeUndefined();
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
  });
});

describe('orphan retirement when there are no component updates (#1935 follow-up)', () => {
  const TEMPLATE_RULE = '.claude/rules/MUST-safety.md';
  const userRule = 'user-modified rule\n';

  async function latestVersion(): Promise<string> {
    const manifest = JSON.parse(
      await readFile(join(import.meta.dir, '../../../templates/manifest.json'), 'utf8')
    ) as { version: string };
    return manifest.version;
  }

  /** Up-to-date install: same version everywhere, an owned leftover, a user-modified rule. */
  async function seedUpToDate(): Promise<void> {
    await seedOldInstall();
    const version = await latestVersion();
    const config = getDefaultConfig();
    config.version = version;
    config.preserveFiles = [PRESERVED];
    config.componentVersions = Object.fromEntries(
      ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'].map((c) => [
        c,
        version,
      ])
    );
    await saveConfig(project, config);
    await put(TEMPLATE_RULE, userRule);
    const lock = await readLock();
    lock.files[TEMPLATE_RULE] = {
      templateHash: sha256('older rule\n'),
      size: 1,
      component: 'rules',
    };
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(lock));
  }

  it('removes an owned leftover and drops only no-longer-owned leftover entries from the lock', async () => {
    await seedUpToDate();
    const configBefore = await readFile(join(project, '.omcustomrc.json'), 'utf8');

    const result = await update({ targetDir: project });

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toEqual([]);
    expect(result.skippedComponents).toHaveLength(7);
    expect(result.orphanRetirement?.removed.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
    expect(reasonOf(result, MODIFIED)).toBe('user-modified file');

    const lock = await readLock();
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT, UNMODIFIED_GUIDE, MODIFIED]) {
      expect(lock.files[path]).toBeUndefined();
    }
    // Still owned leftovers keep their entry; nothing else is regenerated, so the user-modified
    // template rule keeps its old hash (it is not recorded as unmodified) and custom entries stay.
    expect(lock.files[PRESERVED]).toBeDefined();
    expect(lock.files[TEMPLATE_RULE]).toEqual({
      templateHash: sha256('older rule\n'),
      size: 1,
      component: 'rules',
    });
    expect(lock.files[CUSTOM]).toBeDefined();
    expect(await readFile(join(project, TEMPLATE_RULE), 'utf8')).toBe(userRule);
    expect(await readFile(join(project, '.omcustomrc.json'), 'utf8')).toBe(configBefore);
  });

  it('dry-run lists candidates and changes nothing', async () => {
    await seedUpToDate();
    const before = await readFile(join(project, '.omcustom.lock.json'), 'utf8');

    const result = await update({ targetDir: project, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.wouldRemove.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort()
    );
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect(await readFile(join(project, '.omcustom.lock.json'), 'utf8')).toBe(before);
  });

  it('leaves the lock bytes alone when nothing is removed or dropped', async () => {
    await seedUpToDate();
    const lock = await readLock();
    // Keep only entries that are still owned (PRESERVED) or not leftover candidates.
    for (const path of [
      UNMODIFIED_SKILL,
      UNMODIFIED_SCRIPT,
      UNMODIFIED_GUIDE,
      MODIFIED,
      UNSHIPPED_CONTENT,
      SYMLINK_FILE,
      THROUGH_LINK,
    ]) {
      delete lock.files[path];
    }
    await writeFile(join(project, '.omcustom.lock.json'), JSON.stringify(lock));
    const before = await readFile(join(project, '.omcustom.lock.json'), 'utf8');

    const result = await update({ targetDir: project, components: ['skills'] });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(await readFile(join(project, '.omcustom.lock.json'), 'utf8')).toBe(before);
  });

  it('an unreadable list or a missing lock changes nothing', async () => {
    await seedUpToDate();
    const before = await readFile(join(project, '.omcustom.lock.json'), 'utf8');
    loaderSpy.mockRejectedValue(new Error('corrupt list'));

    const failed = await update({ targetDir: project });

    expect(failed.success).toBe(true);
    expect(failed.warnings).toContainEqual(expect.stringContaining('corrupt list'));
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect(await readFile(join(project, '.omcustom.lock.json'), 'utf8')).toBe(before);

    loaderSpy.mockResolvedValue(RETIRED.map((entry) => ({ ...entry, sha256: [...entry.sha256] })));
    await rm(join(project, '.omcustom.lock.json'));
    const unowned = await update({ targetDir: project });

    expect(reasonOf(unowned, UNMODIFIED_SKILL)).toBe('missing or invalid old ownership');
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
    expect(await exists('.omcustom.lock.json')).toBe(false);
  });

  it('reports a lock write failure as a warning', async () => {
    await seedUpToDate();
    const writeSpy = spyOn(lockfileModule, 'writeLockfile').mockRejectedValue(
      new Error('disk full')
    );
    try {
      const result = await update({ targetDir: project });

      expect(result.success).toBe(true);
      expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
      expect(result.warnings).toContain('Lockfile update failed: disk full');
    } finally {
      writeSpy.mockRestore();
    }
  });
});

describe('orphan deletion honours every preservation source (#1935 follow-up, L3)', () => {
  async function saveManifest(manifest: Record<string, unknown>): Promise<void> {
    await writeFile(join(project, '.omcustom-customizations.json'), JSON.stringify(manifest));
  }

  it('with forceOverwriteAll, manifest preserveFiles, modifiedFiles and customComponents still block deletion', async () => {
    await seedOldInstall();
    await saveManifest({
      preserveFiles: [UNMODIFIED_SKILL],
      modifiedFiles: [UNMODIFIED_GUIDE],
      customComponents: ['.claude/skills/old-skill/scripts'],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual([]);
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, PRESERVED]) {
      expect(reasonOf(result, path)).toBe('explicitly preserved');
      expect(await exists(path)).toBe(true);
    }
  });

  it('forceOverwriteAll still overwrites a manifest-preserved template file (overwrite semantics unchanged)', async () => {
    await seedOldInstall();
    const rule = '.claude/rules/MUST-safety.md';
    await put(rule, 'user rule\n');
    await saveManifest({
      preserveFiles: [rule],
      modifiedFiles: [],
      customComponents: [],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    expect(await readFile(join(project, rule), 'utf8')).toBe(
      await readFile(join(import.meta.dir, '../../../templates', rule), 'utf8')
    );
  });

  it('an unreadable manifest keeps every candidate', async () => {
    await seedOldInstall();
    await writeFile(join(project, '.omcustom-customizations.json'), '{ not json');

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(reasonOf(result, UNMODIFIED_SKILL)).toBe('customization manifest unreadable');
    expect(await exists(UNMODIFIED_SKILL)).toBe(true);
  });

  it('preserveCustomizations: false (API opt-out) ignores the manifest, as RTK retirement does', async () => {
    await seedOldInstall();
    await saveManifest({
      preserveFiles: [UNMODIFIED_SKILL],
      modifiedFiles: [],
      customComponents: [],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = await update({ targetDir: project, preserveCustomizations: false });

    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
    // Config preservation is still honoured.
    expect(reasonOf(result, PRESERVED)).toBe('explicitly preserved');
  });

  it('ignores non-string manifest entries', async () => {
    await seedOldInstall();
    await saveManifest({
      preserveFiles: [42, null],
      modifiedFiles: 'not a list',
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
  });
});

describe('preserve entry forms in deletion decisions (review P1)', () => {
  async function saveManifest(manifest: Record<string, unknown>): Promise<void> {
    await writeFile(join(project, '.omcustom-customizations.json'), JSON.stringify(manifest));
  }

  async function setConfigPreserve(preserveFiles: string[]): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.preserveFiles = preserveFiles;
    await saveConfig(project, config);
  }

  function manifestOf(fields: Record<string, unknown>): Record<string, unknown> {
    return { modifiedFiles: [], preserveFiles: [], customComponents: [], ...fields };
  }

  it('config entry with a trailing slash keeps the files below it', async () => {
    await seedOldInstall();
    await setConfigPreserve(['.claude/skills/old-skill/']);

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT]) {
      expect(reasonOf(result, path)).toBe('explicitly preserved');
      expect(await exists(path)).toBe(true);
    }
    expect(result.orphanRetirement?.removed).not.toContain(UNMODIFIED_SKILL);
  });

  it('manifest preserveFiles entry with a trailing slash keeps the files below it', async () => {
    await seedOldInstall();
    await saveManifest(manifestOf({ preserveFiles: ['.claude/skills/old-skill/'] }));

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    for (const path of [UNMODIFIED_SKILL, UNMODIFIED_SCRIPT]) {
      expect(reasonOf(result, path)).toBe('explicitly preserved');
      expect(await exists(path)).toBe(true);
    }
  });

  it('manifest customComponents and modifiedFiles entries with a trailing slash keep files', async () => {
    await seedOldInstall();
    await saveManifest(
      manifestOf({
        customComponents: ['.claude/skills/old-skill/scripts/'],
        modifiedFiles: ['guides/old-guide//'],
      })
    );

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(reasonOf(result, UNMODIFIED_SCRIPT)).toBe('explicitly preserved');
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBe('explicitly preserved');
    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
  });

  it('entries with a ./ prefix (single and repeated) keep the file', async () => {
    await seedOldInstall();
    await setConfigPreserve([`./${UNMODIFIED_SKILL}`]);
    await saveManifest(manifestOf({ preserveFiles: [`././${UNMODIFIED_GUIDE}`] }));

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(reasonOf(result, UNMODIFIED_SKILL)).toBe('explicitly preserved');
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBe('explicitly preserved');
    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SCRIPT);
  });

  it('bare-slash, ./ and empty entries are ignored and do not preserve everything', async () => {
    await seedOldInstall();
    await setConfigPreserve(['/', './', './/']);
    await saveManifest(
      manifestOf({ preserveFiles: ['/', ''], modifiedFiles: ['./'], customComponents: ['//'] })
    );

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual(
      expect.arrayContaining([UNMODIFIED_SKILL, UNMODIFIED_SCRIPT, UNMODIFIED_GUIDE])
    );
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
  });

  it('a sibling that merely shares a prefix does not preserve the file', async () => {
    await seedOldInstall();
    await setConfigPreserve(['.claude/skills/old', '.claude/skills/old/']);

    const result = await update({ targetDir: project, forceOverwriteAll: true });

    expect(result.orphanRetirement?.removed).toContain(UNMODIFIED_SKILL);
    expect(await exists(UNMODIFIED_SKILL)).toBe(false);
  });

  describe('isPathPreserved', () => {
    const base = (): ReturnType<typeof getDefaultConfig> => getDefaultConfig();
    const SKILL_FILE = '.claude/skills/old-skill/SKILL.md';

    it('normalizes every source', () => {
      const withConfigPreserve = { ...base(), preserveFiles: ['.claude/skills/old-skill/'] };
      expect(isPathPreserved(SKILL_FILE, withConfigPreserve, null)).toBe(true);

      const withConfigComponent = {
        ...base(),
        preserveFiles: [],
        customComponents: [
          {
            type: 'skill' as const,
            name: 'x',
            path: './.claude/skills/old-skill/',
            managed: false,
          },
        ],
      };
      expect(isPathPreserved(SKILL_FILE, withConfigComponent, null)).toBe(true);

      const manifest = (fields: Record<string, unknown>) =>
        ({
          modifiedFiles: [],
          preserveFiles: [],
          customComponents: [],
          lastUpdated: '',
          ...fields,
        }) as Parameters<typeof isPathPreserved>[2];
      const config = { ...base(), preserveFiles: [] };
      expect(
        isPathPreserved(SKILL_FILE, config, manifest({ preserveFiles: [`./${SKILL_FILE}`] }))
      ).toBe(true);
      expect(
        isPathPreserved(SKILL_FILE, config, manifest({ modifiedFiles: ['.claude/skills/'] }))
      ).toBe(true);
      expect(
        isPathPreserved(
          SKILL_FILE,
          config,
          manifest({ customComponents: ['.claude/skills/old-skill//'] })
        )
      ).toBe(true);
    });

    it('ignores empty, slash-only, ./-only and non-string entries', () => {
      const config = { ...base(), preserveFiles: ['', '/', './', './/', '///'] };
      const manifest = {
        modifiedFiles: [42, null, '/'],
        preserveFiles: [{}, '', './'],
        customComponents: 'not a list',
        lastUpdated: '',
      } as unknown as Parameters<typeof isPathPreserved>[2];
      expect(isPathPreserved(SKILL_FILE, config, manifest)).toBe(false);
      expect(isPathPreserved('x', config, null)).toBe(false);
    });

    it('does not match a sibling that shares a prefix, and still matches the path itself', () => {
      const config = { ...base(), preserveFiles: ['.claude/skills/old/'] };
      expect(isPathPreserved(SKILL_FILE, config, null)).toBe(false);
      expect(isPathPreserved('.claude/skills/old', config, null)).toBe(true);
      expect(isPathPreserved('.claude/skills/old/SKILL.md', config, null)).toBe(true);
    });

    it('tolerates a config without preserveFiles or customComponents', () => {
      const config = { ...base(), preserveFiles: undefined, customComponents: undefined };
      expect(isPathPreserved(SKILL_FILE, config, null)).toBe(false);
    });
  });
});

describe('confirmation before orphan removal (#1941)', () => {
  const CANDIDATES = [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort();

  /** A confirmation that records every call and answers `answer`. */
  function recorder(answer: boolean | Error) {
    const calls: string[][] = [];
    const confirm = async (paths: readonly string[]): Promise<boolean> => {
      calls.push([...paths]);
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return { calls, confirm };
  }

  /**
   * Every candidate was kept with `reason`. A decline is a deliberate keep (#1938-1): `keptBy`
   * set, no per-file warning, not in `preservedFiles`; a failed confirmation is actionable.
   */
  async function expectKept(
    result: Awaited<ReturnType<typeof update>>,
    reason: string
  ): Promise<void> {
    const declined = reason === 'declined by user';
    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(result.orphanRetirement?.wouldRemove).toEqual([]);
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
    for (const path of CANDIDATES) {
      expect(reasonOf(result, path)).toBe(reason);
      expect(keptByOf(result, path)).toBe(declined ? 'declined' : undefined);
      expect(await exists(path)).toBe(true);
      expect(result.preservedFiles.includes(path)).toBe(!declined);
      expect(result.removedDeprecatedFiles).not.toContain(path);
      expect(result.warnings.includes(`Orphan retirement preserved ${path}: ${reason}`)).toBe(
        !declined
      );
    }
    expect(await backupDirs()).toEqual([]);
  }

  it('asks once with the sorted candidates and removes them on true', async () => {
    await seedOldInstall();
    const { calls, confirm } = recorder(true);

    const result = await update({ targetDir: project, confirmOrphanRemoval: confirm });

    expect(calls).toEqual([CANDIDATES]);
    expect(result.orphanRetirement?.removed.sort()).toEqual(CANDIDATES);
    for (const path of CANDIDATES) expect(await exists(path)).toBe(false);
    // Files that failed a condition are kept before asking and are not part of the question.
    expect(reasonOf(result, MODIFIED)).toBe('user-modified file');
  });

  it('false keeps every candidate, carries ownership, and the next update asks again', async () => {
    await seedOldInstall();
    const declined = recorder(false);

    const result = await update({ targetDir: project, confirmOrphanRemoval: declined.confirm });

    expect(declined.calls).toEqual([CANDIDATES]);
    await expectKept(result, 'declined by user');
    const lock = await readLock();
    for (const path of CANDIDATES) expect(lock.files[path]).toBeDefined();

    // The next update asks again and removes on true.
    const accepted = recorder(true);
    const next = await update({ targetDir: project, confirmOrphanRemoval: accepted.confirm });

    expect(accepted.calls).toEqual([CANDIDATES]);
    expect(next.orphanRetirement?.removed.sort()).toEqual(CANDIDATES);
    for (const path of CANDIDATES) {
      expect(await exists(path)).toBe(false);
      expect((await readLock()).files[path]).toBeUndefined();
    }
  });

  it('a throwing or rejecting confirmation keeps every candidate with the failure reason', async () => {
    await seedOldInstall();
    const failing = recorder(new Error('stdin closed'));

    const result = await update({ targetDir: project, confirmOrphanRemoval: failing.confirm });

    expect(failing.calls).toHaveLength(1);
    await expectKept(result, 'confirmation failed: stdin closed');
    for (const path of CANDIDATES) expect((await readLock()).files[path]).toBeDefined();

    const nonError = await update({
      targetDir: project,
      confirmOrphanRemoval: () => Promise.reject('plain rejection'),
    });
    await expectKept(nonError, 'confirmation failed: plain rejection');
  });

  it('without a confirmation the candidates are removed as in v2.0.20', async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project });

    expect(result.orphanRetirement?.removed.sort()).toEqual(CANDIDATES);
    expect(result.warnings.some((warning) => warning.includes('declined by user'))).toBe(false);
  });

  it('dry-run never asks', async () => {
    await seedOldInstall();
    const { calls, confirm } = recorder(true);

    const result = await update({
      targetDir: project,
      dryRun: true,
      confirmOrphanRemoval: confirm,
    });

    expect(calls).toEqual([]);
    expect(result.orphanRetirement?.wouldRemove.sort()).toEqual(CANDIDATES);
    for (const path of CANDIDATES) expect(await exists(path)).toBe(true);
  });

  it('does not ask when no file passes every condition', async () => {
    await seedOldInstall();
    const { calls, confirm } = recorder(true);

    // Only the rules component is in scope, and it has no leftovers.
    const result = await update({
      targetDir: project,
      components: ['rules'],
      confirmOrphanRemoval: confirm,
    });

    expect(result.success).toBe(true);
    expect(calls).toEqual([]);
    expect(result.orphanRetirement?.removed).toEqual([]);
  });

  it('keeps a candidate that changed or vanished while the question was open', async () => {
    await seedOldInstall();

    const result = await update({
      targetDir: project,
      confirmOrphanRemoval: async () => {
        await writeFile(join(project, UNMODIFIED_SKILL), 'edited while asked\n');
        await rm(join(project, UNMODIFIED_GUIDE));
        return true;
      },
    });

    expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_SCRIPT]);
    expect(reasonOf(result, UNMODIFIED_SKILL)).toBe('user-modified file');
    expect(await readFile(join(project, UNMODIFIED_SKILL), 'utf8')).toBe('edited while asked\n');
    // A file that disappeared is neither removed nor kept.
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBeUndefined();
    expect(result.orphanRetirement?.removed).not.toContain(UNMODIFIED_GUIDE);
  });

  describe('when there are no component updates', () => {
    /** Mark every component current, so update() takes the no-updates path. */
    async function markUpToDate(): Promise<void> {
      const manifest = JSON.parse(
        await readFile(join(import.meta.dir, '../../../templates/manifest.json'), 'utf8')
      ) as { version: string };
      const config = getDefaultConfig();
      config.version = manifest.version;
      config.preserveFiles = [PRESERVED];
      config.componentVersions = Object.fromEntries(
        ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts', 'ontology'].map((c) => [
          c,
          manifest.version,
        ])
      );
      await saveConfig(project, config);
    }

    it('asks, and a decline keeps the lock entries', async () => {
      await seedOldInstall();
      await markUpToDate();
      const before = await readFile(join(project, '.omcustom.lock.json'), 'utf8');
      const { calls, confirm } = recorder(false);

      const result = await update({ targetDir: project, confirmOrphanRemoval: confirm });

      expect(result.updatedComponents).toEqual([]);
      expect(calls).toEqual([CANDIDATES]);
      await expectKept(result, 'declined by user');
      const lock = await readLock();
      for (const path of CANDIDATES) expect(lock.files[path]).toBeDefined();
      // Only the no-longer-owned modified leftover is dropped from the old lock.
      expect(lock.files[MODIFIED]).toBeUndefined();
      expect(before).toContain(MODIFIED);
    });

    it('dry-run does not ask', async () => {
      await seedOldInstall();
      await markUpToDate();
      const { calls, confirm } = recorder(true);

      const result = await update({
        targetDir: project,
        dryRun: true,
        confirmOrphanRemoval: confirm,
      });

      expect(calls).toEqual([]);
      expect(result.orphanRetirement?.wouldRemove.sort()).toEqual(CANDIDATES);
    });
  });

  describe('log messages', () => {
    const DEPRECATED = '.claude/rules/SHOULD-agent-teams.md';
    let infoSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      infoSpy = spyOn(logger, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
      infoSpy.mockRestore();
    });

    const callsFor = (key: string): unknown[] =>
      infoSpy.mock.calls.filter((call: unknown[]) => call[0] === key).map((call) => call[1]);

    it('orphans use update.retired_file_moved_to_backup; deprecated-files.json keeps its key', async () => {
      await seedOldInstall();
      await put(DEPRECATED, 'old rule\n');

      const result = await update({ targetDir: project });

      expect(result.success).toBe(true);
      expect(await exists(DEPRECATED)).toBe(false);
      const backupDir = result.orphanRetirement?.backupDir ?? '';
      expect(callsFor('update.retired_file_moved_to_backup')).toEqual(
        expect.arrayContaining(
          CANDIDATES.map((path) => ({
            path,
            backup: join(backupDir, path.replace(/^\.claude\//, 'claude/')),
          }))
        )
      );
      expect(callsFor('update.retired_file_moved_to_backup')).toHaveLength(CANDIDATES.length);
      expect(callsFor('update.retired_file_removed')).toEqual([]);
      expect(callsFor('update.deprecated_file_removed')).toEqual([
        { path: DEPRECATED, reason: 'Renamed to MUST-agent-teams.md' },
      ]);
    });

    it('the two keys have distinct English and Korean messages', () => {
      const saved = logger.getLoggerOptions();
      const messages: string[] = [];
      const sink = spyOn(console, 'error').mockImplementation((line: unknown) => {
        messages.push(String(line));
      });
      try {
        for (const locale of ['en', 'ko'] as const) {
          logger.createLogger({
            locale,
            level: 'error',
            colors: false,
            timestamps: false,
            prefix: undefined,
          });
          logger.error('update.retired_file_moved_to_backup', { path: 'a.md', backup: 'b/a.md' });
          logger.error('update.deprecated_file_removed', { path: 'b.md', reason: 'r' });
        }
      } finally {
        sink.mockRestore();
        logger.createLogger({ ...saved, prefix: saved.prefix, timestamps: saved.timestamps });
      }
      const joined = messages.join('\n');
      expect(joined).toContain(
        'Moved retired template file (identical to a shipped version) to the backup: a.md -> b/a.md'
      );
      expect(joined).toContain('Removed deprecated file: b.md (r)');
      expect(joined).toContain(
        '더 이상 배포하지 않는 템플릿 파일(배포본과 동일)을 백업으로 옮겼습니다: a.md -> b/a.md'
      );
      expect(joined).toContain('지원 중단 파일을 삭제했습니다: b.md (r)');
      expect(joined).not.toContain('update.retired_file_moved_to_backup');
    });
  });
});

describe('retired leftovers are moved to a backup, not deleted (#1938)', () => {
  const MOVED = [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT, UNMODIFIED_SKILL].sort();
  const CONTENT: Record<string, string> = {
    [UNMODIFIED_SKILL]: SHIPPED,
    [UNMODIFIED_SCRIPT]: SHIPPED_OTHER,
    [UNMODIFIED_GUIDE]: SHIPPED,
  };
  const BACKUP_DIR = /\/\.omcustom-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\/retired$/;
  const realRename = fsPromises.rename;
  const realCopyFile = fsPromises.copyFile;
  const realUnlink = fsPromises.unlink;
  const realMkdir = fsPromises.mkdir;
  const spies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  const errno = (code: string): NodeJS.ErrnoException =>
    Object.assign(new Error(`${code}: simulated`), { code });
  const inBackup = (path: unknown): boolean => String(path).includes('/retired/');
  /** The backup location of a project path (leading `.claude/` -> `claude/`). */
  const backupPathOf = (backupDir: string, path: string): string =>
    join(backupDir, path.replace(/^\.claude\//, 'claude/'));

  /** Every entry name below `dir`, at any depth. */
  async function namesBelow(dir: string): Promise<string[]> {
    const names: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      names.push(entry.name);
      if (entry.isDirectory()) names.push(...(await namesBelow(join(dir, entry.name))));
    }
    return names;
  }

  /** rename() fails with `code` for moves into the backup; other renames are real. */
  function failRenameIntoBackup(code: string): void {
    spies.push(
      spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
        if (inBackup(to)) throw errno(code);
        return realRename(from, to);
      }) as typeof fsPromises.rename)
    );
  }

  async function expectKeptForBackupFailure(
    result: Awaited<ReturnType<typeof update>>,
    paths: readonly string[],
    reason: string
  ): Promise<void> {
    for (const path of paths) {
      expect(await readFile(join(project, path), 'utf8')).toBe(CONTENT[path] ?? '');
      expect(reasonOf(result, path)).toBe(`not moved to the backup: ${reason}`);
      expect(keptByOf(result, path)).toBeUndefined();
      expect(result.preservedFiles).toContain(path);
      expect(result.warnings).toContain(
        `Orphan retirement preserved ${path}: not moved to the backup: ${reason}`
      );
      expect(result.orphanRetirement?.removed).not.toContain(path);
    }
  }

  it('moves each leftover into one backup per run, with identical bytes and no .claude directory', async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project });

    expect(result.success).toBe(true);
    expect(result.orphanRetirement?.removed.sort()).toEqual(MOVED);
    const backupDir = result.orphanRetirement?.backupDir ?? '';
    expect(backupDir).toMatch(BACKUP_DIR);
    expect(backupDir.startsWith(`${project}/`)).toBe(true);
    expect(await backupDirs()).toHaveLength(1);
    for (const path of MOVED) {
      expect(await exists(path)).toBe(false);
      expect(await readFile(backupPathOf(backupDir, path), 'utf8')).toBe(CONTENT[path] ?? '');
    }
    expect(await readFile(join(backupDir, 'claude/skills/old-skill/SKILL.md'), 'utf8')).toBe(
      SHIPPED
    );
    expect(await readFile(join(backupDir, 'guides/old-guide/intro.md'), 'utf8')).toBe(SHIPPED);
    const names = await namesBelow(dirname(backupDir));
    expect(names).toContain('claude');
    expect(names).not.toContain('.claude');
    // Moved files are no longer owned; the backup is not in the lock.
    const lock = await readLock();
    for (const path of MOVED) expect(lock.files[path]).toBeUndefined();
    expect(Object.keys(lock.files).some((key) => key.includes('omcustom-backup'))).toBe(false);
    expect(result.backedUpPaths).toEqual([]);
  });

  it('works when the project is reached through a symlinked path', async () => {
    await seedOldInstall();
    const linked = `${project}-link`;
    await symlink(project, linked);
    try {
      const result = await update({ targetDir: linked, components: ['guides'] });

      expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_GUIDE]);
      const backupDir = result.orphanRetirement?.backupDir ?? '';
      expect(backupDir.startsWith(`${linked}/.omcustom-backup-`)).toBe(true);
      expect(await readFile(backupPathOf(backupDir, UNMODIFIED_GUIDE), 'utf8')).toBe(SHIPPED);
    } finally {
      await rm(linked, { force: true });
    }
  });

  it('dry-run lists the files and creates no backup directory', async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project, dryRun: true });

    expect(result.orphanRetirement?.wouldRemove.sort()).toEqual(MOVED);
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
    expect(await backupDirs()).toEqual([]);
    for (const path of MOVED) expect(await exists(path)).toBe(true);
  });

  it("uses this run's --backup directory, whose verbatim .claude copy is left as it is", async () => {
    await seedOldInstall();

    const result = await update({ targetDir: project, backup: true });

    expect(result.backedUpPaths).toHaveLength(1);
    const root = result.backedUpPaths[0] ?? '';
    expect(result.orphanRetirement?.backupDir).toBe(join(root, 'retired'));
    expect(await backupDirs()).toHaveLength(1);
    expect(await readFile(join(root, 'retired/claude/skills/old-skill/SKILL.md'), 'utf8')).toBe(
      SHIPPED
    );
    // The --backup copy keeps `.claude/` verbatim (reported, not changed, by #1938).
    expect((await lstat(join(root, '.claude/skills/old-skill/SKILL.md'))).isFile()).toBe(true);
  });

  it('tells the confirmation the backup directory before creating it', async () => {
    await seedOldInstall();
    const contexts: Array<{ backupDir: string; existed: boolean }> = [];

    const result = await update({
      targetDir: project,
      confirmOrphanRemoval: async (_paths, context) => {
        contexts.push({
          backupDir: context.backupDir,
          existed: (await backupDirs()).length > 0,
        });
        return true;
      },
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.backupDir).toMatch(BACKUP_DIR);
    expect(contexts[0]?.existed).toBe(false);
    expect(result.orphanRetirement?.backupDir).toBe(contexts[0]?.backupDir);
  });

  it('falls back to copy, hash check and unlink when rename crosses file systems (EXDEV)', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    const copySpy = spyOn(fsPromises, 'copyFile');
    spies.push(copySpy);

    const result = await update({ targetDir: project });

    expect(result.orphanRetirement?.removed.sort()).toEqual(MOVED);
    const backupDir = result.orphanRetirement?.backupDir ?? '';
    for (const path of MOVED) {
      expect(await exists(path)).toBe(false);
      expect(await readFile(backupPathOf(backupDir, path), 'utf8')).toBe(CONTENT[path] ?? '');
    }
    const backupCopies = copySpy.mock.calls.filter((call: unknown[]) => inBackup(call[1]));
    expect(backupCopies).toHaveLength(MOVED.length);
    expect(result.warnings.some((warning) => warning.includes('not moved'))).toBe(false);
  });

  it('a copy that does not verify keeps the original with a warning and ownership; the next update moves it', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    spies.push(
      spyOn(fsPromises, 'copyFile').mockImplementation((async (from: string, to: string) => {
        if (!inBackup(to)) return realCopyFile(from, to);
        await writeFile(to, 'corrupted copy\n');
      }) as typeof fsPromises.copyFile)
    );

    const result = await update({ targetDir: project });

    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
    await expectKeptForBackupFailure(result, MOVED, 'the backup copy does not match the original');
    // Nothing is left in the backup: the bad copies and the empty directories are removed.
    expect(await backupDirs()).toEqual([]);
    const lock = await readLock();
    for (const path of MOVED) expect(lock.files[path]).toBeDefined();

    for (const spy of spies.splice(0)) spy.mockRestore();
    const next = await update({ targetDir: project, force: true });
    expect(next.orphanRetirement?.removed.sort()).toEqual(MOVED);
  });

  it('a rename failure other than EXDEV keeps the original and leaves no backup directory', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EACCES');

    const result = await update({ targetDir: project });

    await expectKeptForBackupFailure(result, MOVED, 'EACCES: simulated');
    expect(await backupDirs()).toEqual([]);
  });

  it('never overwrites a file that already exists in the backup', async () => {
    await seedOldInstall();
    let occupied = '';
    let backupDirAsked = '';

    const result = await update({
      targetDir: project,
      confirmOrphanRemoval: async (_paths, { backupDir }) => {
        backupDirAsked = backupDir;
        occupied = backupPathOf(backupDir, UNMODIFIED_SKILL);
        await mkdir(dirname(occupied), { recursive: true });
        await writeFile(occupied, 'already in the backup\n');
        return true;
      },
    });

    expect(await readFile(occupied, 'utf8')).toBe('already in the backup\n');
    await expectKeptForBackupFailure(
      result,
      [UNMODIFIED_SKILL],
      'a file already exists at the backup location'
    );
    expect(result.orphanRetirement?.removed.sort()).toEqual(
      [UNMODIFIED_GUIDE, UNMODIFIED_SCRIPT].sort()
    );
    expect(result.orphanRetirement?.backupDir).toBe(backupDirAsked);
  });

  it('a copy that meets an existing file (EEXIST) leaves that file alone', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    spies.push(
      spyOn(fsPromises, 'copyFile').mockImplementation((async (from: string, to: string) => {
        if (!inBackup(to)) return realCopyFile(from, to);
        await writeFile(to, 'appeared meanwhile\n');
        throw errno('EEXIST');
      }) as typeof fsPromises.copyFile)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    await expectKeptForBackupFailure(result, [UNMODIFIED_GUIDE], 'EEXIST: simulated');
    const [root = ''] = await backupDirs();
    expect(await readFile(join(project, root, 'retired/guides/old-guide/intro.md'), 'utf8')).toBe(
      'appeared meanwhile\n'
    );
  });

  it('a copy that fails part-way is removed again', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    spies.push(
      spyOn(fsPromises, 'copyFile').mockImplementation((async (from: string, to: string) => {
        if (!inBackup(to)) return realCopyFile(from, to);
        await writeFile(to, 'partial');
        throw errno('ENOSPC');
      }) as typeof fsPromises.copyFile)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    await expectKeptForBackupFailure(result, [UNMODIFIED_GUIDE], 'ENOSPC: simulated');
    expect(await backupDirs()).toEqual([]);
  });

  it('when the original cannot be unlinked after a verified copy, the copy is removed and the original kept', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    const source = join(project, UNMODIFIED_GUIDE);
    spies.push(
      spyOn(fsPromises, 'unlink').mockImplementation((async (path: string) => {
        if (String(path) === source) throw errno('EPERM');
        return realUnlink(path);
      }) as typeof fsPromises.unlink)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    await expectKeptForBackupFailure(result, [UNMODIFIED_GUIDE], 'EPERM: simulated');
    expect(await backupDirs()).toEqual([]);
    expect((await readLock()).files[UNMODIFIED_GUIDE]).toBeDefined();
  });

  it('a copy that cannot be removed again stays in the backup; the original is still kept', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    const source = join(project, UNMODIFIED_GUIDE);
    spies.push(
      spyOn(fsPromises, 'unlink').mockImplementation((async (path: string) => {
        if (String(path) === source || inBackup(path)) throw errno('EPERM');
        return realUnlink(path);
      }) as typeof fsPromises.unlink)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    await expectKeptForBackupFailure(result, [UNMODIFIED_GUIDE], 'EPERM: simulated');
    const [root = ''] = await backupDirs();
    expect(await readFile(join(project, root, 'retired/guides/old-guide/intro.md'), 'utf8')).toBe(
      SHIPPED
    );
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
  });

  it('an original that disappears after its copy was verified counts as moved', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    const source = join(project, UNMODIFIED_GUIDE);
    spies.push(
      spyOn(fsPromises, 'unlink').mockImplementation((async (path: string) => {
        if (String(path) !== source) return realUnlink(path);
        await realUnlink(path);
        throw errno('ENOENT');
      }) as typeof fsPromises.unlink)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_GUIDE]);
    const backupDir = result.orphanRetirement?.backupDir ?? '';
    expect(await readFile(backupPathOf(backupDir, UNMODIFIED_GUIDE), 'utf8')).toBe(SHIPPED);
    expect(await exists(UNMODIFIED_GUIDE)).toBe(false);
  });

  it('a file that disappears during the move is neither moved nor kept', async () => {
    await seedOldInstall();
    spies.push(
      spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
        if (!inBackup(to)) return realRename(from, to);
        await realUnlink(from);
        throw errno('ENOENT');
      }) as typeof fsPromises.rename)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes(UNMODIFIED_GUIDE))).toBe(false);
    expect(await backupDirs()).toEqual([]);
  });

  it('refuses a backup location that goes through a symlink', async () => {
    await seedOldInstall();
    const elsewhere = join(project, 'elsewhere');

    const result = await update({
      targetDir: project,
      confirmOrphanRemoval: async (_paths, { backupDir }) => {
        await mkdir(elsewhere);
        await mkdir(dirname(backupDir));
        await symlink(elsewhere, backupDir);
        return true;
      },
    });

    await expectKeptForBackupFailure(result, MOVED, 'backup location goes through a symlink');
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it('only leftovers covered by preserve settings are deliberate keeps; an unreadable manifest stays actionable', async () => {
    await seedOldInstall();
    const covered = await update({ targetDir: project, dryRun: true });
    expect(keptByOf(covered, PRESERVED)).toBe('preserve-settings');
    expect(covered.preservedFiles).not.toContain(PRESERVED);
    expect(covered.warnings.some((warning) => warning.includes(PRESERVED))).toBe(false);

    await writeFile(join(project, '.omcustom-customizations.json'), '{ not json');
    const unreadable = await update({ targetDir: project, dryRun: true, forceOverwriteAll: true });
    expect(reasonOf(unreadable, PRESERVED)).toBe('customization manifest unreadable');
    expect(keptByOf(unreadable, PRESERVED)).toBeUndefined();
    expect(unreadable.preservedFiles).toContain(PRESERVED);
    expect(unreadable.warnings).toContain(
      `Orphan retirement preserved ${PRESERVED}: customization manifest unreadable`
    );
  });

  it('L1: a non-ENOENT unlink error after a verified copy counts as moved when the original is gone; the copy is kept', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    const source = join(project, UNMODIFIED_GUIDE);
    spies.push(
      spyOn(fsPromises, 'unlink').mockImplementation((async (path: string) => {
        if (String(path) !== source) return realUnlink(path);
        await realUnlink(path);
        throw errno('EIO');
      }) as typeof fsPromises.unlink)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_GUIDE]);
    const backupDir = result.orphanRetirement?.backupDir ?? '';
    expect(await readFile(backupPathOf(backupDir, UNMODIFIED_GUIDE), 'utf8')).toBe(SHIPPED);
    expect(await exists(UNMODIFIED_GUIDE)).toBe(false);
    expect(result.preservedFiles).not.toContain(UNMODIFIED_GUIDE);
    expect(result.warnings.some((warning) => warning.includes(UNMODIFIED_GUIDE))).toBe(false);
  });

  it('L2: a rename that reports an error after moving the file is recorded as moved', async () => {
    await seedOldInstall();
    spies.push(
      spyOn(fsPromises, 'rename').mockImplementation((async (from: string, to: string) => {
        await realRename(from, to);
        if (inBackup(to)) throw errno('EIO');
      }) as typeof fsPromises.rename)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(result.orphanRetirement?.removed).toEqual([UNMODIFIED_GUIDE]);
    expect(result.removedDeprecatedFiles).toContain(UNMODIFIED_GUIDE);
    const backupDir = result.orphanRetirement?.backupDir ?? '';
    expect(backupDir).toMatch(BACKUP_DIR);
    expect(await readFile(backupPathOf(backupDir, UNMODIFIED_GUIDE), 'utf8')).toBe(SHIPPED);
    expect(await exists(UNMODIFIED_GUIDE)).toBe(false);
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes(UNMODIFIED_GUIDE))).toBe(false);
  });

  it('L3: an original edited between the copy and the unlink is kept as user-modified; the copy is removed', async () => {
    await seedOldInstall();
    failRenameIntoBackup('EXDEV');
    spies.push(
      spyOn(fsPromises, 'copyFile').mockImplementation((async (from: string, to: string) => {
        await realCopyFile(from, to);
        if (inBackup(to)) await writeFile(from, 'edited meanwhile\n');
      }) as typeof fsPromises.copyFile)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    expect(await readFile(join(project, UNMODIFIED_GUIDE), 'utf8')).toBe('edited meanwhile\n');
    expect(reasonOf(result, UNMODIFIED_GUIDE)).toBe('user-modified file');
    expect(keptByOf(result, UNMODIFIED_GUIDE)).toBeUndefined();
    expect(result.preservedFiles).toContain(UNMODIFIED_GUIDE);
    expect(result.warnings).toContain(
      `Orphan retirement preserved ${UNMODIFIED_GUIDE}: user-modified file`
    );
    expect(result.orphanRetirement?.removed).toEqual([]);
    expect(result.orphanRetirement?.backupDir).toBeUndefined();
    expect(await backupDirs()).toEqual([]);
    // The edited file is no longer the owned copy, so its ownership is not carried.
    expect((await readLock()).files[UNMODIFIED_GUIDE]).toBeUndefined();
  });

  it('L4: never creates a directory through a symlinked backup component and leaves a pre-existing empty directory there alone', async () => {
    await seedOldInstall();
    const elsewhere = join(project, 'elsewhere');

    const result = await update({
      targetDir: project,
      components: ['skills'],
      confirmOrphanRemoval: async (_paths, { backupDir }) => {
        await mkdir(join(elsewhere, 'skills'), { recursive: true });
        await mkdir(backupDir, { recursive: true });
        await symlink(elsewhere, join(backupDir, 'claude'));
        return true;
      },
    });

    await expectKeptForBackupFailure(
      result,
      [UNMODIFIED_SCRIPT, UNMODIFIED_SKILL],
      'backup location goes through a symlink'
    );
    expect(await readdir(elsewhere)).toEqual(['skills']);
    expect(await readdir(join(elsewhere, 'skills'))).toEqual([]);
    // The backup root and retired/ existed before this run touched them, so they stay.
    const [root = ''] = await backupDirs();
    expect((await lstat(join(project, root, 'retired'))).isDirectory()).toBe(true);
  });

  it('L4: refuses a regular file in the backup path', async () => {
    await seedOldInstall();

    const result = await update({
      targetDir: project,
      components: ['guides'],
      confirmOrphanRemoval: async (_paths, { backupDir }) => {
        await mkdir(backupDir, { recursive: true });
        await writeFile(join(backupDir, 'guides'), 'not a directory\n');
        return true;
      },
    });

    await expectKeptForBackupFailure(
      result,
      [UNMODIFIED_GUIDE],
      'backup location is not a directory'
    );
    const [root = ''] = await backupDirs();
    expect(await readFile(join(project, root, 'retired/guides'), 'utf8')).toBe('not a directory\n');
  });

  it('L4: a backup directory that cannot be created keeps the file and leaves no backup', async () => {
    await seedOldInstall();
    spies.push(
      spyOn(fsPromises, 'mkdir').mockImplementation((async (
        path: string,
        mkdirOptions?: Parameters<typeof fsPromises.mkdir>[1]
      ) => {
        if (String(path).includes('/retired')) throw errno('EACCES');
        return realMkdir(path, mkdirOptions);
      }) as typeof fsPromises.mkdir)
    );

    const result = await update({ targetDir: project, components: ['guides'] });

    await expectKeptForBackupFailure(result, [UNMODIFIED_GUIDE], 'EACCES: simulated');
    expect(await backupDirs()).toEqual([]);
  });

  it('L5: a preserved retired path that is or sits under a symlink is a quiet keep and is never moved', async () => {
    await seedOldInstall();
    const linked = [SYMLINK_FILE, THROUGH_LINK];
    // Not preserved: these are actionable keeps with a warning.
    const before = await update({ targetDir: project, dryRun: true });
    for (const path of linked) {
      expect(keptByOf(before, path)).toBeUndefined();
      expect(before.preservedFiles).toContain(path);
    }

    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.preserveFiles = [PRESERVED, ...linked, ABSENT];
    await saveConfig(project, config);
    // A dry run isolates the orphan step's preservedFiles (component updates add their own).
    const dryRun = await update({ targetDir: project, dryRun: true });
    for (const path of linked) {
      expect(keptByOf(dryRun, path)).toBe('preserve-settings');
      expect(dryRun.preservedFiles).not.toContain(path);
      expect(dryRun.orphanRetirement?.wouldRemove).not.toContain(path);
    }
    const result = await update({ targetDir: project });

    for (const path of linked) {
      expect(keptByOf(result, path)).toBe('preserve-settings');
      expect(result.warnings.some((warning) => warning.includes(path))).toBe(false);
      expect(result.orphanRetirement?.removed).not.toContain(path);
    }
    expect((await lstat(join(project, SYMLINK_FILE))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(project, THROUGH_LINK), 'utf8')).toBe(SHIPPED);
    expect(await readFile(join(project, 'outside.md'), 'utf8')).toBe(SHIPPED);
    // A preserved path that does not exist is not recorded at all.
    expect(result.orphanRetirement?.preserved.some((entry) => entry.path === ABSENT)).toBe(false);
  });

  describe('retiredBackupPath', () => {
    it('drops the dot of a leading dot folder only', () => {
      expect(retiredBackupPath('.claude/skills/x/SKILL.md')).toBe('claude/skills/x/SKILL.md');
      expect(retiredBackupPath('.codex/agents/a.md')).toBe('codex/agents/a.md');
      expect(retiredBackupPath('guides/a/b.md')).toBe('guides/a/b.md');
      expect(retiredBackupPath('.claude/skills/.hidden/x')).toBe('claude/skills/.hidden/x');
    });
  });
});

/**
 * The rules index across `update()` (#1992): plan before the rules copy, commit (one rename)
 * before the lockfile is regenerated. Covers the keep/replace decisions, the backup trigger, the
 * failure points before the commit (F1-F5a), the post-commit ones (F3, F5b) and the commit steps
 * with injected filesystem failures.
 *
 * Every test runs in its own mkdtemp project; network, execSync and the Codex install are stubbed,
 * and no test may reach the Codex installer.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, parse as parseYaml } from 'yaml';
import { checkLockfileDrift } from '../../../src/cli/doctor.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { LOCKFILE_VERSION } from '../../../src/core/lockfile.js';
import * as ontologyRetirement from '../../../src/core/ontology-rag-retirement.js';
import { _setRegistryDirForTesting } from '../../../src/core/registry.js';
import * as retiredPaths from '../../../src/core/retired-template-paths.js';
import { loadRetiredTemplatePaths } from '../../../src/core/retired-template-paths.js';
import {
  commitRulesIndexPlan,
  planRulesIndexUpdate,
  type RulesIndexCommitFs,
  type RulesIndexPlan,
} from '../../../src/core/rules-index-merge.js';
import { type UpdateOptions, update } from '../../../src/core/updater.js';
import * as fsUtils from '../../../src/utils/fs.js';
import { resolveTemplatePath } from '../../../src/utils/fs.js';
import * as logger from '../../../src/utils/logger.js';

const LABEL = '.claude/rules/index.yaml';
const IS_ROOT = process.getuid?.() === 0;

interface IndexEntry {
  id?: unknown;
  title?: unknown;
  path?: unknown;
  scope?: unknown;
}

function entriesOf(content: string): IndexEntry[] {
  const parsed = parseYaml(content) as { rules?: IndexEntry[] };
  return parsed.rules ?? [];
}

const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

const USER_ENTRY = `
  # Project rule
  - id: R024
    name: learning-tutor
    title: Learning Tutor
    path: ./MUST-learning-tutor.md
    priority: MUST
    scope: all
`;

const MISSING_ENTRY = `
  - id: R025
    name: gone
    title: Gone Rule
    path: ./SHOULD-gone.md
    priority: SHOULD
    scope: all
`;

const VALID = '\n  - id: R024\n    name: learning-tutor\n    path: ./MUST-learning-tutor.md\n';

const EDITED_REASON = 'because it was edited since the last update.';
const LOSSY_REASON = 'because some of its content could not be kept.';

let tempDir: string;
let rulesDir: string;
let indexPath: string;
let templateIndex: string;
const spies: Array<{ mockRestore(): void }> = [];
let codexInstallSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'omcustom-rules-index-update-'));
  _setRegistryDirForTesting(join(tempDir, '.registry'));
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    spies.push(spyOn(console, method).mockImplementation(() => {}));
  }
  spies.push(spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden')));
  spies.push(
    spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('external synchronous command forbidden');
    })
  );
  spies.push(spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true));
  codexInstallSpy = spyOn(codexInstaller, 'installCodex').mockReturnValue(false);
  spies.push(codexInstallSpy);
  rulesDir = join(tempDir, '.claude', 'rules');
  indexPath = join(rulesDir, 'index.yaml');
  await mkdir(rulesDir, { recursive: true });
  templateIndex = await readFile(resolveTemplatePath(LABEL), 'utf-8');
});

afterEach(async () => {
  expect(codexInstallSpy).not.toHaveBeenCalled();
  for (const spy of spies.splice(0)) spy.mockRestore();
  _setRegistryDirForTesting(undefined);
  await chmod(rulesDir, 0o755).catch(() => undefined);
  await rm(tempDir, { recursive: true, force: true });
});

async function createConfig(overrides?: Record<string, unknown>): Promise<void> {
  const config = getDefaultConfig();
  config.version = '0.1.0';
  config.installedAt = '2025-01-01T00:00:00Z';
  Object.assign(config, overrides ?? {});
  await saveConfig(tempDir, config);
}

/** A lockfile whose only entry records `content` as the index bytes of the last update */
async function writeLock(content: string | Buffer, key = LABEL): Promise<void> {
  const bytes = Buffer.from(content);
  await writeFile(
    join(tempDir, '.omcustom.lock.json'),
    JSON.stringify({
      lockfileVersion: LOCKFILE_VERSION,
      generatorVersion: '0.1.0',
      generatedAt: '2025-01-01T00:00:00.000Z',
      templateVersion: '0.1.0',
      files: { [key]: { templateHash: sha256(bytes), size: bytes.length, component: 'rules' } },
    })
  );
}

async function writeExistingIndex(): Promise<string> {
  const templateR000Title = 'title: Language & Delegation Policy';
  expect(templateIndex).toContain(templateR000Title);
  const existing = `${templateIndex.replace(templateR000Title, 'title: Stale R000 Title')}${USER_ENTRY}${MISSING_ENTRY}`;
  await writeFile(indexPath, existing);
  await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
  return existing;
}

/**
 * The template index with a stale template entry title plus the R024 project entry: its merge
 * differs from it (the title is refreshed) without dropping anything (not lossy)
 */
function staleIndexWithProjectEntry(): string {
  const title = 'title: Language & Delegation Policy';
  expect(templateIndex).toContain(title);
  return `${templateIndex.replace(title, 'title: Stale R000 Title')}${VALID}`;
}

async function namesIn(dir: string, part: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.includes(part));
}

const backups = (): Promise<string[]> => namesIn(rulesDir, '.backup-');
const temporaries = (): Promise<string[]> => namesIn(rulesDir, '.omcustom-');
const indexWarnings = (warnings: readonly string[]): string[] =>
  warnings.filter((w) => w.includes('index.yaml'));

/** The backup named by the "was saved to" warning, which must give `reason` */
async function readNamedBackup(warnings: readonly string[], reason: string): Promise<Buffer> {
  const prefix = `The previous ${LABEL} was saved to `;
  const warning = warnings.find((w) => w.startsWith(prefix)) ?? '';
  expect(warning).toContain(` ${reason} To restore it, copy it back with cp`);
  const backupPath = warning.slice(prefix.length, warning.indexOf(' because '));
  expect(backupPath.startsWith(`${indexPath}.backup-`)).toBe(true);
  return readFile(backupPath);
}

/** The index bytes, mode and file type are as before, and no temporary file is left */
async function expectUntouched(before: string | Buffer, mode = 0o644): Promise<void> {
  expect((await readFile(indexPath)).equals(Buffer.from(before))).toBe(true);
  const stats = await lstat(indexPath);
  expect(stats.isFile()).toBe(true);
  expect(stats.mode & 0o777).toBe(mode);
  expect(await temporaries()).toEqual([]);
}

/** Whether a file can be created in `dir` (false under 0555 unless root or an odd filesystem) */
async function canCreateIn(dir: string): Promise<boolean> {
  const probe = join(dir, 'probe-write');
  try {
    await writeFile(probe, '');
    await rm(probe);
    return true;
  } catch {
    return false;
  }
}

/** Fill the project's rules directory with the shipped rule files, so the copy creates none */
async function seedShippedRuleFiles(): Promise<void> {
  await cp(resolveTemplatePath('.claude/rules'), rulesDir, { recursive: true });
}

function rulesUpdate(extra?: Partial<UpdateOptions>): ReturnType<typeof update> {
  return update({ targetDir: tempDir, components: ['rules'], ...extra });
}

describe('rules index.yaml across update() (#1992)', () => {
  it('carries the project rule entry, drops the orphan in one warning and refreshes template entries', async () => {
    await createConfig();
    const existing = await writeExistingIndex();

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toContain('rules');
    const written = await readFile(indexPath, 'utf-8');
    expect(written.startsWith(templateIndex)).toBe(true);
    const ids = entriesOf(written).map((e) => e.id);
    expect(ids.filter((id) => id === 'R024')).toHaveLength(1);
    expect(ids).not.toContain('R025');
    expect(new Set(ids).size).toBe(ids.length);
    expect(entriesOf(written).find((e) => e.id === 'R000')?.title).toBe(
      'Language & Delegation Policy'
    );
    expect(written).not.toContain('Stale R000 Title');
    expect(result.warnings).toContain(
      `Dropped the ${LABEL} entries for SHOULD-gone.md: no file with exactly this name (case included) is in .claude/rules/.`
    );
    // No lockfile: the index counts as hand-edited, so the original is backed up
    expect((await readNamedBackup(result.warnings, EDITED_REASON)).toString()).toBe(existing);
    expect(await readFile(join(rulesDir, 'MUST-learning-tutor.md'), 'utf-8')).toBe(
      '# Learning Tutor\n'
    );
    expect(await temporaries()).toEqual([]);
  });

  it('keeps an index that cannot be parsed, while the other rules files update (D-10)', async () => {
    await createConfig();
    await writeFile(indexPath, 'rules:\n  - id: [\n');

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toContain('rules');
    await expectUntouched('rules:\n  - id: [\n');
    const warnings = indexWarnings(result.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toStartWith(`Kept ${LABEL} unchanged: it cannot be parsed as YAML (`);
    expect(warnings[0]).toEndWith(
      'Fix the file, or delete it from your own terminal and run the update again to get the template version.'
    );
    expect(await backups()).toEqual([]);
    expect(await readFile(join(rulesDir, 'SHOULD-ecomode.md'), 'utf-8')).toBe(
      await readFile(resolveTemplatePath('.claude/rules/SHOULD-ecomode.md'), 'utf-8')
    );
  });

  it('writes the template bytes and backs up when the merged index cannot be serialized', async () => {
    await createConfig();
    const existing = await writeExistingIndex();
    await writeLock(existing);
    const toStringSpy = spyOn(Document.prototype, 'toString').mockImplementation(() => {
      throw new Error('serialize boom');
    });

    let result: Awaited<ReturnType<typeof update>>;
    try {
      result = await rulesUpdate();
    } finally {
      toStringSpy.mockRestore();
    }

    expect(result.success).toBe(true);
    expect(await readFile(indexPath, 'utf-8')).toBe(templateIndex);
    expect(result.warnings).toContain(
      'Dropped the .claude/rules/index.yaml entry for MUST-learning-tutor.md: it cannot be written (serialize boom).'
    );
    expect((await readNamedBackup(result.warnings, LOSSY_REASON)).toString()).toBe(existing);
  });

  it('carries a project entry whose alias points at an anchor on a template entry', async () => {
    await createConfig();
    const anchored = templateIndex.replace(
      '    path: ./MUST-language-policy.md\n    priority: MUST\n    scope: all\n',
      '    path: ./MUST-language-policy.md\n    priority: MUST\n    scope: &all all\n'
    );
    expect(anchored).not.toBe(templateIndex);
    const existing = `${anchored}\n  - id: R024\n    path: ./MUST-learning-tutor.md\n    scope: *all\n`;
    await writeFile(indexPath, existing);
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    await writeLock(existing);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    const written = await readFile(indexPath, 'utf-8');
    expect(written.startsWith(templateIndex)).toBe(true);
    expect(entriesOf(written).find((e) => e.id === 'R024')).toEqual({
      id: 'R024',
      path: './MUST-learning-tutor.md',
      scope: 'all',
    } as IndexEntry);
    expect(result.warnings).toContain(
      'Kept the .claude/rules/index.yaml entry for MUST-learning-tutor.md with its aliases resolved; its comments were not kept.'
    );
    expect((await readNamedBackup(result.warnings, LOSSY_REASON)).toString()).toBe(existing);
  });

  it('leaves a preserveFiles-protected index byte-identical (no merge)', async () => {
    await createConfig({ preserveFiles: [LABEL] });
    const existing = await writeExistingIndex();

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    await expectUntouched(existing);
    expect(indexWarnings(result.warnings)).toEqual([]);
  });

  it('leaves the index of a customComponents rules path byte-identical, also with forceOverwriteAll', async () => {
    for (const forceOverwriteAll of [false, true]) {
      await createConfig({
        customComponents: [{ name: 'my-rules', type: 'rule', path: LABEL, managed: false }],
      });
      const existing = await writeExistingIndex();

      const result = await rulesUpdate({ forceOverwriteAll });

      expect(result.success).toBe(true);
      await expectUntouched(existing);
      expect(indexWarnings(result.warnings)).toEqual([]);
    }
  });

  it('carries project entries with forceOverwriteAll even when preserveFiles names the index (D-2)', async () => {
    await createConfig({ preserveFiles: [LABEL] });
    const existing = staleIndexWithProjectEntry();
    await writeFile(indexPath, existing);
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    await writeLock(existing);

    const result = await rulesUpdate({ forceOverwriteAll: true });

    expect(result.success).toBe(true);
    const written = await readFile(indexPath, 'utf-8');
    expect(written).not.toBe(existing);
    expect(written.startsWith(templateIndex)).toBe(true);
    expect(entriesOf(written).map((e) => e.id)).toContain('R024');
    expect(indexWarnings(result.warnings)).toEqual([]);
    expect(await backups()).toEqual([]);
  });

  it('keeps an index whose rules is not a list (D-10)', async () => {
    await createConfig();
    await writeFile(indexPath, 'rules:\n  a: 1\n');

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    await expectUntouched('rules:\n  a: 1\n');
    expect(indexWarnings(result.warnings)).toEqual([
      `Kept ${LABEL} unchanged: its top-level rules is not a list. Fix the file, or delete it from your own terminal and run the update again to get the template version.`,
    ]);
    expect(await backups()).toEqual([]);
  });

  it('writes the template bytes verbatim with the template mode and no warning when no index existed', async () => {
    await createConfig();

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(await readFile(indexPath, 'utf-8')).toBe(templateIndex);
    expect((await stat(indexPath)).mode & 0o777).toBe(
      (await stat(resolveTemplatePath(LABEL))).mode & 0o777
    );
    expect(indexWarnings(result.warnings)).toEqual([]);
    expect(await temporaries()).toEqual([]);
  });

  it('does not carry the entry of a retired template rule that is still on disk', async () => {
    await createConfig();
    // .claude/rules/SHOULD-agent-teams.md is listed in templates/retired-template-paths.json
    const retired = (await loadRetiredTemplatePaths()).map((entry) => entry.path);
    expect(retired).toContain('.claude/rules/SHOULD-agent-teams.md');
    await writeFile(join(rulesDir, 'SHOULD-agent-teams.md'), '# old, modified\n');
    const existing = `${templateIndex}\n  - id: R099\n    title: Old Agent Teams\n    path: ./SHOULD-agent-teams.md\n`;
    await writeFile(indexPath, existing);
    await writeLock(existing);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(await readFile(indexPath, 'utf-8')).toBe(templateIndex);
    expect(indexWarnings(result.warnings)).toEqual([]);
  });

  it('still carries project entries when the retired list cannot be read', async () => {
    await createConfig();
    await writeExistingIndex();
    const retiredSpy = spyOn(retiredPaths, 'loadRetiredTemplatePaths').mockRejectedValue(
      new Error('unreadable retired list')
    );

    try {
      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id)).toContain('R024');
    } finally {
      retiredSpy.mockRestore();
    }
  });

  it('carries a symlinked rule file and treats a dangling symlink as an orphan', async () => {
    await createConfig();
    await writeFile(join(tempDir, 'shared-rule.md'), '# Shared\n');
    await symlink(join(tempDir, 'shared-rule.md'), join(rulesDir, 'MUST-linked.md'));
    await symlink(join(tempDir, 'missing-target.md'), join(rulesDir, 'MUST-dangling.md'));
    await writeFile(
      indexPath,
      `${templateIndex}\n  - id: R030\n    path: ./MUST-linked.md\n\n  - id: R031\n    path: ./MUST-dangling.md\n`
    );

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    const ids = entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id);
    expect(ids).toContain('R030');
    expect(ids).not.toContain('R031');
    expect(result.warnings).toContain(
      `Dropped the ${LABEL} entries for MUST-dangling.md: no file with exactly this name (case included) is in .claude/rules/.`
    );
  });

  it('turns a failed write of the new index into a keep warning, not a failed update (real 0555 dir)', async () => {
    await createConfig();
    await seedShippedRuleFiles();
    const existing = staleIndexWithProjectEntry();
    await writeFile(indexPath, existing);
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    await writeLock(existing);
    await chmod(rulesDir, 0o555);
    // chmod has no effect for root and on some filesystems: nothing to test there
    if (await canCreateIn(rulesDir)) return;

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toContain('rules');
    expect(result.skippedComponents).not.toContain('rules');
    await expectUntouched(existing);
    const warnings = indexWarnings(result.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toStartWith(
      `Kept ${LABEL} unchanged: the new index could not be written (`
    );
    expect(await backups()).toEqual([]);
  });

  for (const forceOverwriteAll of [false, true]) {
    it(`keeps the index unchanged when the needed backup cannot be written (real 0555 dir, force ${forceOverwriteAll})`, async () => {
      await createConfig();
      await seedShippedRuleFiles();
      const before = await writeExistingIndex();
      await chmod(rulesDir, 0o555);
      if (await canCreateIn(rulesDir)) return;

      const result = await rulesUpdate({ forceOverwriteAll });

      expect(result.success).toBe(true);
      await expectUntouched(before);
      const warnings = indexWarnings(result.warnings);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toStartWith(`Kept ${LABEL} unchanged: the backup ${indexPath}.backup-`);
      expect(warnings[0]).toContain('and the index is not replaced without one.');
      expect(await backups()).toEqual([]);
    });
  }

  it('keeps an index with invalid UTF-8 bytes byte for byte (D-10)', async () => {
    await createConfig();
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    const raw = Buffer.concat([
      Buffer.from(`${templateIndex}${USER_ENTRY}${MISSING_ENTRY}  # `),
      Buffer.from([0xff, 0xfe, 0x41]),
      Buffer.from('\n'),
    ]);
    await writeFile(indexPath, raw);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    await expectUntouched(raw);
    expect(indexWarnings(result.warnings)).toEqual([
      `Kept ${LABEL} unchanged: it is not valid UTF-8. Fix the file, or delete it from your own terminal and run the update again to get the template version.`,
    ]);
    expect(await backups()).toEqual([]);
  });

  it('leaves an unreadable index unchanged and warns', async () => {
    await createConfig();
    const before = await writeExistingIndex();
    await chmod(indexPath, 0o200);
    let readable = true;
    try {
      await readFile(indexPath);
    } catch {
      readable = false;
    }
    try {
      // chmod has no effect for root and on some filesystems: nothing to test there
      if (readable) return;

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      const warnings = indexWarnings(result.warnings);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toStartWith(`Kept ${LABEL} unchanged: it cannot be read (`);
      // Kept by the plan (remedy of D-10), not only by the re-read at commit time
      expect(warnings[0]).toEndWith(
        'Fix the file, or delete it from your own terminal and run the update again to get the template version.'
      );
    } finally {
      await chmod(indexPath, 0o644);
    }
    await expectUntouched(before);
  });

  it('does not touch the index in a dry run (G7)', async () => {
    await createConfig();
    const existing = await writeExistingIndex();

    const result = await rulesUpdate({ dryRun: true });

    expect(result.success).toBe(true);
    await expectUntouched(existing);
    expect(indexWarnings(result.warnings)).toEqual([]);
    expect(await backups()).toEqual([]);
  });

  it('writes nothing to the index on the no-updates path and for --components without rules (G7)', async () => {
    await createConfig();
    const first = await rulesUpdate();
    expect(first.success).toBe(true);
    const edited = staleIndexWithProjectEntry();
    await writeFile(indexPath, edited);
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    // Installed version and every component version equal to the templates: nothing to update
    const latest = first.newVersion;
    const components = ['rules', 'agents', 'skills', 'guides', 'hooks', 'contexts'];
    await createConfig({
      version: latest,
      componentVersions: Object.fromEntries(components.map((name) => [name, latest])),
    });

    const noUpdates = await rulesUpdate();
    expect(noUpdates.success).toBe(true);
    expect(noUpdates.updatedComponents).toEqual([]);
    await expectUntouched(edited);

    await createConfig();
    const otherComponent = await update({ targetDir: tempDir, components: ['agents'] });
    expect(otherComponent.success).toBe(true);
    await expectUntouched(edited);
    for (const result of [noUpdates, otherComponent]) {
      expect(indexWarnings(result.warnings)).toEqual([]);
    }
    expect(await backups()).toEqual([]);
  });

  it('keeps a read-only (0444) index while the other rules files update (D-7)', async () => {
    await createConfig();
    const before = await writeExistingIndex();
    await writeFile(join(rulesDir, 'SHOULD-ecomode.md'), '# old ecomode\n');
    await chmod(indexPath, 0o444);
    try {
      if (IS_ROOT) return;

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(result.updatedComponents).toContain('rules');
      await expectUntouched(before, 0o444);
      const warnings = indexWarnings(result.warnings);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toStartWith(`Kept ${LABEL} unchanged: it is read-only (`);
      expect(warnings[0]).toEndWith(
        'To get the new index, make it writable (chmod u+w) and run the update again.'
      );
      expect(await backups()).toEqual([]);
      expect(await readFile(join(rulesDir, 'SHOULD-ecomode.md'), 'utf-8')).toBe(
        await readFile(resolveTemplatePath('.claude/rules/SHOULD-ecomode.md'), 'utf-8')
      );
    } finally {
      await chmod(indexPath, 0o644);
    }
  });

  it('keeps a symlinked index as the link and leaves its target unchanged (D-8)', async () => {
    await createConfig();
    const outside = join(tempDir, 'shared-index.yaml');
    const content = `${templateIndex}${VALID}`;
    await writeFile(outside, content);
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    await symlink(outside, indexPath);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect((await lstat(indexPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, 'utf-8')).toBe(content);
    expect(indexWarnings(result.warnings)).toEqual([
      `Kept ${LABEL} unchanged: it is a symbolic link, not a regular file, so the update does not replace it. To get the new index, replace it with a regular file and run the update again.`,
    ]);
    expect(await temporaries()).toEqual([]);
  });

  it('keeps a directory at the index path without failing the rules component', async () => {
    await createConfig();
    await mkdir(indexPath);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(result.updatedComponents).toContain('rules');
    expect((await lstat(indexPath)).isDirectory()).toBe(true);
    expect(indexWarnings(result.warnings)).toEqual([
      `Kept ${LABEL} unchanged: it is a directory, not a regular file, so the update does not replace it. To get the new index, replace it with a regular file and run the update again.`,
    ]);
  });

  it('gives the replaced index the permission bits of the original (D-9)', async () => {
    await createConfig();
    await writeExistingIndex();
    // 0666 is wider than the usual umask 022, so only the chmod after the create gives it
    await chmod(indexPath, 0o666);

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    expect(entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id)).toContain('R024');
    expect((await stat(indexPath)).mode & 0o777).toBe(0o666);
  });

  it('leaves an index equal to its merge untouched: no backup, no warning, no rename', async () => {
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    // No lockfile, so a replace would back up: only the no-op keeps both cases clean
    for (const existing of [templateIndex, `${templateIndex}${VALID}`]) {
      await createConfig();
      await writeFile(indexPath, existing);
      const inodeBefore = (await stat(indexPath)).ino;

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      await expectUntouched(existing);
      expect((await stat(indexPath)).ino).toBe(inodeBefore);
      expect(indexWarnings(result.warnings)).toEqual([]);
      expect(await backups()).toEqual([]);
      await rm(join(tempDir, '.omcustom.lock.json'), { force: true });
    }
  });

  it('replaces an empty or comment-only index with the template (no entries to keep)', async () => {
    for (const existing of ['', '# only a comment\n']) {
      await createConfig();
      await writeFile(indexPath, existing);
      await writeLock(existing);

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(await readFile(indexPath, 'utf-8')).toBe(templateIndex);
      expect(indexWarnings(result.warnings)).toEqual([]);
      expect(await backups()).toEqual([]);
    }
  });

  it('records the index bytes left on disk in the regenerated lockfile, so doctor sees no drift (G5)', async () => {
    await createConfig();
    await writeExistingIndex();

    const result = await rulesUpdate();

    expect(result.success).toBe(true);
    const onDisk = await readFile(indexPath);
    expect(entriesOf(onDisk.toString()).map((e) => e.id)).toContain('R024');
    const lock = JSON.parse(await readFile(join(tempDir, '.omcustom.lock.json'), 'utf-8')) as {
      files: Record<string, { templateHash: string }>;
    };
    expect(lock.files[LABEL]?.templateHash).toBe(sha256(onDisk));
    expect((await checkLockfileDrift(tempDir))?.status).toBe('pass');
  });

  it('logs the carried files once the index was replaced', async () => {
    await createConfig();
    await writeExistingIndex();
    const infoSpy = spyOn(logger, 'info');
    try {
      await rulesUpdate();
      expect(infoSpy).toHaveBeenCalledWith('update.rules_index_entries_carried', {
        path: LABEL,
        files: 'MUST-learning-tutor.md',
      });
    } finally {
      infoSpy.mockRestore();
    }
  });

  describe('backup trigger (G6)', () => {
    const R000_SCOPE = '    path: ./MUST-language-policy.md\n    priority: MUST\n    scope: all\n';
    const anchorOnR000 = (t: string): string =>
      t.replace(R000_SCOPE, R000_SCOPE.replace('scope: all', 'scope: &all all'));
    const manyAliases = Array.from({ length: 101 }, () => '*all').join(', ');
    interface LossRow {
      name: string;
      content: (template: string) => string;
      files?: string[];
    }
    const lossyRows: LossRow[] = [
      {
        name: 'template id clash',
        content: (t) =>
          `${t}${VALID}\n  - id: R000\n    title: My Clash\n    path: ./MUST-clash.md\n`,
        files: ['MUST-clash.md'],
      },
      {
        name: 'unsupported subdirectory path',
        content: (t) => `${t}${VALID}\n  - id: R030\n    path: ./sub/MUST-x.md\n`,
      },
      { name: 'no path', content: (t) => `${t}${VALID}\n  - id: R031\n    title: No Path\n` },
      { name: 'number path', content: (t) => `${t}${VALID}\n  - id: R032\n    path: 5\n` },
      {
        name: 'repeated entry',
        content: (t) => `${t}${VALID}\n  - id: R033\n    path: ./MUST-learning-tutor.md\n`,
      },
      { name: 'non-map item', content: (t) => `${t}${VALID}\n  - just a string\n` },
      {
        name: 'alias resolved',
        content: (t) =>
          `${anchorOnR000(t)}${VALID}\n  - id: R035\n    path: ./MUST-alias.md\n    scope: *all\n`,
        files: ['MUST-alias.md'],
      },
      {
        name: 'alias count overflow',
        content: (t) =>
          `${anchorOnR000(t)}${VALID}\n  - id: R036\n    path: ./MUST-many.md\n    scopes: [${manyAliases}]\n`,
        files: ['MUST-many.md'],
      },
      {
        name: 'YAML 1.1 date',
        content: (t) =>
          `%YAML 1.1\n---\n${t}${VALID}\n  - id: R037\n    path: ./MUST-dated.md\n    added: 2026-11-24\n`,
        files: ['MUST-dated.md'],
      },
      { name: 'top-level key', content: (t) => `custom: 1\n${t}${VALID}` },
    ];

    async function seed(content: string, files: readonly string[] = []): Promise<void> {
      await createConfig();
      await writeFile(indexPath, content);
      for (const file of ['MUST-learning-tutor.md', ...files]) {
        await writeFile(join(rulesDir, file), `# ${file}\n`);
      }
    }

    for (const row of lossyRows) {
      it(`backs up a lossy merge even when the lock matches: ${row.name}`, async () => {
        const before = row.content(templateIndex);
        await seed(before, row.files);
        await writeLock(before);

        const result = await rulesUpdate();

        expect(result.success).toBe(true);
        expect(await backups()).toHaveLength(1);
        expect((await readNamedBackup(result.warnings, LOSSY_REASON)).toString()).toBe(before);
        const live = entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id);
        expect(live).toContain('R024');
      });
    }

    it('backs up a non-lossy merge when the lockfile has no entry for the index', async () => {
      const before = staleIndexWithProjectEntry();
      await seed(before);
      await writeLock('unrelated', '.claude/rules/MUST-safety.md');

      const result = await rulesUpdate();

      expect((await readNamedBackup(result.warnings, EDITED_REASON)).toString()).toBe(before);
    });

    it('backs up a non-lossy merge when the index differs from the lockfile hash', async () => {
      const before = staleIndexWithProjectEntry();
      await seed(before);
      await writeLock(templateIndex);

      const result = await rulesUpdate();

      expect((await readNamedBackup(result.warnings, EDITED_REASON)).toString()).toBe(before);
    });

    it('does not back up a non-lossy merge whose index matches the lockfile', async () => {
      const before = `${templateIndex}${VALID}\n  - id: R040\n    path: ./MUST-orphan.md\n`;
      await seed(before);
      await writeLock(before);

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(await backups()).toEqual([]);
      // An orphan is reported but is not a lossy drop
      expect(indexWarnings(result.warnings)).toEqual([
        `Dropped the ${LABEL} entries for MUST-orphan.md: no file with exactly this name (case included) is in .claude/rules/.`,
      ]);
      expect(entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id)).toContain('R024');
    });

    it('clean case: no backup and no warning, and a second run writes the same index', async () => {
      const before = staleIndexWithProjectEntry();
      await seed(before);
      await writeLock(before);

      const first = await rulesUpdate();
      const afterFirst = await readFile(indexPath, 'utf-8');
      await createConfig();
      const second = await rulesUpdate();

      for (const result of [first, second]) {
        expect(result.success).toBe(true);
        expect(indexWarnings(result.warnings)).toEqual([]);
      }
      expect(await backups()).toEqual([]);
      expect(afterFirst).not.toBe(before);
      expect(entriesOf(afterFirst).map((e) => e.id)).toContain('R024');
      expect(await readFile(indexPath, 'utf-8')).toBe(afterFirst);
    });
  });

  describe('failure points before and after the commit', () => {
    it('F1: a failed rules copy leaves the index byte-identical and reports no index warning', async () => {
      await createConfig();
      const before = await writeExistingIndex();
      // A directory where a shipped (not protected) rule file goes makes copyFile throw
      await mkdir(join(rulesDir, 'SHOULD-ecomode.md'));

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(result.skippedComponents).toContain('rules');
      expect(result.warnings[0]).toContain('Failed to update rules');
      expect(indexWarnings(result.warnings)).toEqual([]);
      await expectUntouched(before);
      expect(await backups()).toEqual([]);
    });

    it('F2: a failed --hard namespace sync leaves the index byte-identical (injected read failure)', async () => {
      await createConfig();
      expect((await rulesUpdate()).success).toBe(true);
      // An index this update would replace (stale title, orphan) and warn about
      const before = await writeExistingIndex();
      await createConfig();
      const realReadTextFile = fsUtils.readTextFile;
      const readSpy = spyOn(fsUtils, 'readTextFile').mockImplementation(async (path: string) => {
        if (path.startsWith(rulesDir) && path.endsWith('.md')) throw new Error('namespace boom');
        return realReadTextFile(path);
      });

      let result: Awaited<ReturnType<typeof update>>;
      try {
        result = await rulesUpdate({ hard: true });
      } finally {
        readSpy.mockRestore();
      }

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Failed to update rules: namespace boom');
      expect(indexWarnings(result.warnings)).toEqual([]);
      await expectUntouched(before);
      expect(await backups()).toEqual([]);
    });

    it('F3: another component failing does not stop the index commit', async () => {
      await createConfig();
      await writeExistingIndex();
      await writeFile(join(tempDir, '.claude', 'hooks'), 'not a directory');

      const result = await update({ targetDir: tempDir, components: ['rules', 'hooks'] });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.startsWith('Failed to update hooks'))).toBe(true);
      expect(entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id)).toContain('R024');
    });

    it('F4: a throw in the full-update post-processing leaves the index byte-identical', async () => {
      await createConfig();
      const before = await writeExistingIndex();
      // The entry document is read as a file: a directory there throws EISDIR in updateEntryDoc
      await mkdir(join(tempDir, 'CLAUDE.md'));

      const result = await update({ targetDir: tempDir });

      expect(result.success).toBe(false);
      expect(result.error).toContain('EISDIR');
      expect(result.updatedComponents).toContain('rules');
      await expectUntouched(before);
      expect(await backups()).toEqual([]);
    });

    it('F5a: a throw in the retirement steps before the commit leaves the index byte-identical (injected)', async () => {
      await createConfig();
      const before = await writeExistingIndex();
      const retireSpy = spyOn(ontologyRetirement, 'retireOntologyRagMcpServer').mockRejectedValue(
        new Error('retire boom')
      );

      let result: Awaited<ReturnType<typeof update>>;
      try {
        result = await update({ targetDir: tempDir });
      } finally {
        retireSpy.mockRestore();
      }

      expect(result.error).toBe('retire boom');
      await expectUntouched(before);
      expect(await backups()).toEqual([]);
    });

    it('F5b: a failed lockfile write after the commit leaves the merged index in place', async () => {
      await createConfig();
      await writeExistingIndex();
      await mkdir(join(tempDir, '.omcustom.lock.json'));

      const result = await rulesUpdate();

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.startsWith('Lockfile generation failed'))).toBe(true);
      expect(entriesOf(await readFile(indexPath, 'utf-8')).map((e) => e.id)).toContain('R024');
    });
  });
});

describe('planRulesIndexUpdate', () => {
  let templateDir: string;

  beforeEach(async () => {
    templateDir = join(tempDir, 'template-rules');
    await mkdir(templateDir);
  });

  function plan(): Promise<RulesIndexPlan> {
    return planRulesIndexUpdate({
      rulesDir,
      templateRulesDir: templateDir,
      componentPath: '.claude/rules',
      lockfile: null,
    });
  }

  it('keeps a present index when the template index is malformed or missing (D-11)', async () => {
    await writeFile(indexPath, templateIndex);
    await writeFile(join(templateDir, 'index.yaml'), 'rules:\n  - id: [\n');
    const malformed = await plan();
    expect(malformed).toMatchObject({
      action: 'keep',
      warning: `Kept ${LABEL} unchanged: the template index has no readable rules list. Reinstall oh-my-customcode and run the update again.`,
    });

    await rm(join(templateDir, 'index.yaml'));
    const missing = await plan();
    expect(missing.action).toBe('keep');
    expect(missing.action === 'keep' ? missing.warning : '').toStartWith(
      `Kept ${LABEL} unchanged: the template index cannot be read (`
    );
  });

  it('writes a malformed template verbatim when there is no index, and leaves a missing one to the copy', async () => {
    const malformed = Buffer.from('rules:\n  - id: [\n');
    await writeFile(join(templateDir, 'index.yaml'), malformed);
    const replace = await plan();
    expect(replace.action).toBe('replace');
    if (replace.action === 'replace') {
      expect(replace.original).toBeNull();
      expect(replace.content.equals(malformed)).toBe(true);
      expect(replace.backupReason).toBeNull();
    }

    await rm(join(templateDir, 'index.yaml'));
    expect((await plan()).action).toBe('copy');
  });

  it('treats a file where the rules directory should be as no index (ENOTDIR is absent)', async () => {
    await writeFile(join(templateDir, 'index.yaml'), templateIndex);
    const rulesFile = join(tempDir, 'rules-is-a-file');
    await writeFile(rulesFile, 'not a directory');

    const planned = await planRulesIndexUpdate({
      rulesDir: rulesFile,
      templateRulesDir: templateDir,
      componentPath: '.claude/rules',
      lockfile: null,
    });

    expect(planned.action).toBe('replace');
    if (planned.action === 'replace') {
      expect(planned.original).toBeNull();
      expect(planned.content.toString('utf-8')).toBe(templateIndex);
    }
  });

  it('writes nothing while planning (G8)', async () => {
    await writeFile(join(templateDir, 'index.yaml'), templateIndex);
    await writeFile(indexPath, staleIndexWithProjectEntry());
    await writeFile(join(rulesDir, 'MUST-learning-tutor.md'), '# Learning Tutor\n');
    const before = (await readdir(rulesDir)).sort();

    const planned = await plan();

    expect(planned.action).toBe('replace');
    expect((await readdir(rulesDir)).sort()).toEqual(before);
    expect(await readFile(indexPath, 'utf-8')).toBe(staleIndexWithProjectEntry());
  });

  it('keeps an index it cannot read (D-10)', async () => {
    await writeFile(join(templateDir, 'index.yaml'), templateIndex);
    await writeFile(indexPath, staleIndexWithProjectEntry());
    await chmod(indexPath, 0o200);
    try {
      if (IS_ROOT) return;
      const planned = await plan();
      expect(planned.action).toBe('keep');
      expect(planned.action === 'keep' ? planned.warning : '').toStartWith(
        `Kept ${LABEL} unchanged: it cannot be read (`
      );
    } finally {
      await chmod(indexPath, 0o644);
    }
  });

  it('keeps the index when the rules directory cannot be searched (unexpected error)', async () => {
    await writeFile(join(templateDir, 'index.yaml'), templateIndex);
    await writeFile(indexPath, templateIndex);
    await chmod(rulesDir, 0o600);
    try {
      if (IS_ROOT) return;
      const planned = await plan();
      expect(planned.action).toBe('keep');
      expect(planned.action === 'keep' ? planned.warning : '').toStartWith(
        `Kept ${LABEL} unchanged: it cannot be read (`
      );
    } finally {
      await chmod(rulesDir, 0o755);
    }
  });
});

describe('commitRulesIndexPlan (injected filesystem failures)', () => {
  const ORIGINAL = Buffer.from('rules:\n  - id: R000\n    path: ./MUST-a.md\n');
  const NEW = Buffer.from('rules:\n  - id: R000\n    path: ./MUST-a.md\n  - id: R024\n');
  const NOW = new Date('2026-01-02T03:04:05.678Z');
  const BACKUP_SUFFIX = '.backup-2026-01-02T03-04-05-678Z';

  const realFs: RulesIndexCommitFs = {
    lstat: (path) => nodeFs.lstat(path),
    readFile: (path) => nodeFs.readFile(path),
    access: (path, mode) => nodeFs.access(path, mode),
    writeFile: (path, data, options) => nodeFs.writeFile(path, data, options),
    chmod: (path, mode) => nodeFs.chmod(path, mode),
    rename: (from, to) => nodeFs.rename(from, to),
    unlink: (path) => nodeFs.unlink(path),
  };

  const errno = (code: string): NodeJS.ErrnoException =>
    Object.assign(new Error(`${code} fake`), { code });

  function replacePlan(
    overrides: Partial<Extract<RulesIndexPlan, { action: 'replace' }>> = {}
  ): RulesIndexPlan {
    return {
      action: 'replace',
      indexPath,
      label: LABEL,
      original: ORIGINAL,
      content: NEW,
      mode: 0o644,
      backupReason: null,
      carried: ['MUST-b.md'],
      warnings: ['merge warning'],
      ...overrides,
    };
  }

  function commit(
    plan: RulesIndexPlan,
    overrides: Partial<RulesIndexCommitFs> = {}
  ): Promise<{ outcome: string; warnings: string[] }> {
    const warnings: string[] = [];
    return commitRulesIndexPlan(plan, warnings, { ...realFs, ...overrides }, () => NOW).then(
      (outcome) => ({ outcome, warnings })
    );
  }

  beforeEach(async () => {
    await writeFile(indexPath, ORIGINAL);
  });

  it('replaces the index and pushes the planned warnings, then the backup note', async () => {
    const { outcome, warnings } = await commit(replacePlan({ backupReason: 'it was edited' }));

    expect(outcome).toBe('replaced');
    expect((await readFile(indexPath)).equals(NEW)).toBe(true);
    expect((await readFile(`${indexPath}${BACKUP_SUFFIX}`)).equals(ORIGINAL)).toBe(true);
    expect(warnings).toEqual([
      'merge warning',
      `The previous ${LABEL} was saved to ${indexPath}${BACKUP_SUFFIX} because it was edited. To restore it, copy it back with cp from your own terminal (not mv); delete the backup from your own terminal when you no longer need it.`,
    ]);
    expect(await temporaries()).toEqual([]);
  });

  it('pushes a keep plan warning and does nothing for unchanged and copy plans', async () => {
    const keep = await commit({ action: 'keep', indexPath, label: LABEL, warning: 'kept it' });
    expect(keep).toEqual({ outcome: 'kept', warnings: ['kept it'] });
    for (const action of ['unchanged', 'copy'] as const) {
      expect(await commit({ action, indexPath, label: LABEL })).toEqual({
        outcome: 'unchanged',
        warnings: [],
      });
    }
    await expectUntouched(ORIGINAL);
  });

  it('keeps the index when its bytes changed after planning (D-12)', async () => {
    await writeFile(indexPath, 'rules: []\n# edited during the update\n');

    const { outcome, warnings } = await commit(replacePlan());

    expect(outcome).toBe('kept');
    expect(warnings).toEqual([
      `Kept ${LABEL} unchanged: it changed while the update was running. Run the update again.`,
    ]);
    expect(await readFile(indexPath, 'utf-8')).toBe('rules: []\n# edited during the update\n');
  });

  it('keeps the index when one appeared after planning found none, or it vanished', async () => {
    const appeared = await commit(replacePlan({ original: null }));
    expect(appeared.outcome).toBe('kept');
    await expectUntouched(ORIGINAL);

    await rm(indexPath);
    const vanished = await commit(replacePlan());
    expect(vanished.warnings).toEqual([
      `Kept ${LABEL} unchanged: it changed while the update was running. Run the update again.`,
    ]);
    expect(await namesIn(rulesDir, 'index.yaml')).toEqual([]);
  });

  it('keeps a symlink that replaced the index after planning (D-8 at commit)', async () => {
    const target = join(tempDir, 'elsewhere.yaml');
    await writeFile(target, ORIGINAL);
    await rm(indexPath);
    await symlink(target, indexPath);

    const { outcome, warnings } = await commit(replacePlan());

    expect(outcome).toBe('kept');
    expect(warnings[0]).toStartWith(`Kept ${LABEL} unchanged: it is a symbolic link`);
    expect((await lstat(indexPath)).isSymbolicLink()).toBe(true);
  });

  it('keeps the index when it cannot be read again at commit time', async () => {
    const { outcome, warnings } = await commit(replacePlan(), {
      lstat: () => Promise.reject(errno('EACCES')),
    });

    expect(outcome).toBe('kept');
    expect(warnings).toEqual([
      `Kept ${LABEL} unchanged: it cannot be read (EACCES fake). Run the update again.`,
    ]);
    await expectUntouched(ORIGINAL);
  });

  it('keeps a read-only index (access W_OK fails, D-7) and writes nothing', async () => {
    const writes: string[] = [];
    const { outcome, warnings } = await commit(replacePlan({ backupReason: 'x' }), {
      access: () => Promise.reject(errno('EACCES')),
      writeFile: (path, data, options) => {
        writes.push(path);
        return realFs.writeFile(path, data, options);
      },
    });

    expect(outcome).toBe('kept');
    expect(warnings).toEqual([
      `Kept ${LABEL} unchanged: it is read-only (EACCES fake). To get the new index, make it writable (chmod u+w) and run the update again.`,
    ]);
    expect(writes).toEqual([]);
    await expectUntouched(ORIGINAL);
  });

  it('keeps the index and removes a partly written backup when the backup fails (G6)', async () => {
    const { outcome, warnings } = await commit(replacePlan({ backupReason: 'x' }), {
      writeFile: async (path, data, options) => {
        if (!path.includes('.backup-')) return realFs.writeFile(path, data, options);
        await realFs.writeFile(path, data.subarray(0, 3), options);
        throw errno('ENOSPC');
      },
    });

    expect(outcome).toBe('kept');
    expect(warnings).toEqual([
      `Kept ${LABEL} unchanged: the backup ${indexPath}${BACKUP_SUFFIX} could not be written (ENOSPC fake), and the index is not replaced without one. Free disk space or fix the permissions and run the update again.`,
    ]);
    expect(await backups()).toEqual([]);
    await expectUntouched(ORIGINAL);
  });

  it('does not remove a file that already existed at the backup path', async () => {
    await writeFile(`${indexPath}${BACKUP_SUFFIX}`, 'someone else');

    const { outcome, warnings } = await commit(replacePlan({ backupReason: 'x' }));

    expect(outcome).toBe('kept');
    expect(warnings[0]).toContain('could not be written (EEXIST');
    expect(await readFile(`${indexPath}${BACKUP_SUFFIX}`, 'utf-8')).toBe('someone else');
    await expectUntouched(ORIGINAL);
  });

  for (const step of ['writeFile', 'chmod', 'rename'] as const) {
    it(`keeps the index and removes the temporary file when the ${step} of it fails (G1, G2)`, async () => {
      const overrides: Partial<RulesIndexCommitFs> =
        step === 'writeFile'
          ? {
              writeFile: async (path, data, options) => {
                await realFs.writeFile(path, data.subarray(0, 4), options);
                throw errno('ENOSPC');
              },
            }
          : { [step]: () => Promise.reject(errno('EIO')) };

      const { outcome, warnings } = await commit(replacePlan(), overrides);

      expect(outcome).toBe('kept');
      const code = step === 'writeFile' ? 'ENOSPC' : 'EIO';
      expect(warnings).toEqual([
        `Kept ${LABEL} unchanged: the new index could not be written (${code} fake).`,
      ]);
      await expectUntouched(ORIGINAL);
    });
  }

  it('does not remove a temporary path that already belonged to someone else (EEXIST)', async () => {
    const unlinked: string[] = [];
    const { outcome } = await commit(replacePlan(), {
      writeFile: () => Promise.reject(errno('EEXIST')),
      unlink: (path) => {
        unlinked.push(path);
        return realFs.unlink(path);
      },
    });

    expect(outcome).toBe('kept');
    expect(unlinked).toEqual([]);
  });

  it('names the temporary file when it cannot be removed, after the keep warning (G2)', async () => {
    const { outcome, warnings } = await commit(replacePlan(), {
      rename: () => Promise.reject(errno('EIO')),
      unlink: () => Promise.reject(errno('EPERM')),
    });

    expect(outcome).toBe('kept');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toBe(
      `Kept ${LABEL} unchanged: the new index could not be written (EIO fake).`
    );
    const [temporary] = await temporaries();
    expect(temporary).toMatch(/^index\.yaml\.omcustom-\d+-[0-9a-f]{12}\.tmp$/);
    expect(warnings[1]).toBe(
      `Could not remove the temporary file ${join(rulesDir, temporary ?? '')} (EPERM fake); delete it from your own terminal.`
    );
    expect((await readFile(indexPath)).equals(ORIGINAL)).toBe(true);
  });

  it('names the backup copy in the keep warning when the rename fails after the backup', async () => {
    const { outcome, warnings } = await commit(replacePlan({ backupReason: 'x' }), {
      rename: () => Promise.reject(errno('EIO')),
    });

    expect(outcome).toBe('kept');
    expect(warnings).toEqual([
      `Kept ${LABEL} unchanged: the new index could not be written (EIO fake). A copy of it is at ${indexPath}${BACKUP_SUFFIX}; delete that copy from your own terminal if you do not need it.`,
    ]);
    expect((await readFile(`${indexPath}${BACKUP_SUFFIX}`)).equals(ORIGINAL)).toBe(true);
    await expectUntouched(ORIGINAL);
  });

  it('creates a missing index through the temporary file with the planned mode', async () => {
    await rm(indexPath);

    const { outcome, warnings } = await commit(
      replacePlan({ original: null, mode: 0o666, warnings: [], carried: [] })
    );

    expect(outcome).toBe('replaced');
    expect(warnings).toEqual([]);
    expect((await readFile(indexPath)).equals(NEW)).toBe(true);
    expect((await stat(indexPath)).mode & 0o777).toBe(0o666);
  });
});

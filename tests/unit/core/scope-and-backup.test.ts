import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupEntryName,
  backupRestoreRenames,
  ensureBackupGitignore,
} from '../../../src/core/backup-layout.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { install } from '../../../src/core/installer.js';
import {
  countSkillDirectories,
  listSkippedPackageSkills,
  withDeployedSkillCount,
} from '../../../src/core/scope-filter.js';
import { update } from '../../../src/core/updater.js';

const SKILL_PACKAGE = '---\nname: x\nscope: package\n---\nbody\n';
const SKILL_CORE = '---\nname: y\nscope: core\n---\nbody\n';

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
}

describe('backup layout (#1943)', () => {
  it('stores .claude without its dot and instruction files with a .backup suffix', () => {
    expect(backupEntryName('.claude')).toBe('claude');
    expect(backupEntryName('CLAUDE.md')).toBe('CLAUDE.md.backup');
    expect(backupEntryName('CLAUDE.local.md')).toBe('CLAUDE.local.md.backup');
    expect(backupEntryName('AGENTS.md')).toBe('AGENTS.md.backup');
    expect(backupEntryName('guides')).toBe('guides');
  });

  it('lists only the renames a restore needs', () => {
    expect(backupRestoreRenames(['.claude', 'guides', 'CLAUDE.md'])).toEqual([
      { stored: 'claude', original: '.claude' },
      { stored: 'CLAUDE.md.backup', original: 'CLAUDE.md' },
    ]);
    expect(backupRestoreRenames(['guides'])).toEqual([]);
  });
});

describe('ensureBackupGitignore (#1943)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-gitignore-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('does nothing without a backup directory', async () => {
    gitInit(dir);
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('does nothing outside a git work tree', async () => {
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('creates .gitignore when absent, with the comment and the pattern', async () => {
    gitInit(dir);
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(
      '# oh-my-customcode backups\n.omcustom-backup-*/\n'
    );
  });

  it('appends after existing content, also without a trailing newline, and is idempotent', async () => {
    gitInit(dir);
    await writeFile(join(dir, '.gitignore'), 'node_modules');
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(true);
    const first = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(first).toBe('node_modules\n\n# oh-my-customcode backups\n.omcustom-backup-*/\n');
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(first);
  });

  it('keeps a trailing newline as is when appending', async () => {
    gitInit(dir);
    await writeFile(join(dir, '.gitignore'), 'dist/\n');
    await mkdir(join(dir, '.omcustom-backup-1'));
    await ensureBackupGitignore(dir);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(
      'dist/\n\n# oh-my-customcode backups\n.omcustom-backup-*/\n'
    );
  });

  it('skips when git already ignores the backup directory', async () => {
    gitInit(dir);
    await writeFile(join(dir, '.gitignore'), '.omcustom-backup-1/\n');
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe('.omcustom-backup-1/\n');
  });

  it('skips when the exact line exists', async () => {
    gitInit(dir);
    await writeFile(join(dir, '.gitignore'), '.omcustom-backup-*/\n!.omcustom-backup-1/\n');
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(false);
  });

  it('writes nothing in a dry run', async () => {
    gitInit(dir);
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir, { dryRun: true })).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('covers the init backup prefix as well', async () => {
    gitInit(dir);
    await mkdir(join(dir, '.claude-backup-1'));
    await mkdir(join(dir, '.omcustom-backup-1'));
    expect(await ensureBackupGitignore(dir)).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(
      '# oh-my-customcode backups\n.omcustom-backup-*/\n.claude-backup-*/\n'
    );
  });

  it('is never fatal', async () => {
    expect(await ensureBackupGitignore(join(dir, 'does-not-exist'))).toBe(false);
  });
});

describe('skill scope helpers (#1937)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-scope-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists package-scope skills the project lacks, not installed ones or core ones', async () => {
    await writeTree(join(dir, 'src'), {
      'pkg-new/SKILL.md': SKILL_PACKAGE,
      'pkg-installed/SKILL.md': SKILL_PACKAGE,
      'core-one/SKILL.md': SKILL_CORE,
      'no-skill-md/readme.txt': 'x',
      'stray-file.txt': 'x',
    });
    await writeTree(join(dir, 'dest'), { 'pkg-installed/SKILL.md': 'old' });
    expect(await listSkippedPackageSkills(join(dir, 'src'), join(dir, 'dest'))).toEqual([
      'pkg-new',
    ]);
  });

  it('counts skill directories, 0 when the folder is missing', async () => {
    await writeTree(dir, { 'a/SKILL.md': 'x', 'b/SKILL.md': 'x', 'file.txt': 'x' });
    expect(await countSkillDirectories(dir)).toBe(2);
    expect(await countSkillDirectories(join(dir, 'missing'))).toBe(0);
  });

  it('rewrites the count in both languages and leaves other text alone', () => {
    expect(
      withDeployedSkillCount('|   +-- skills/                  # 스킬 (114 디렉토리)', 108)
    ).toBe('|   +-- skills/                  # 스킬 (108 디렉토리)');
    expect(
      withDeployedSkillCount('|   +-- skills/                  # Skills (114 directories)', 3)
    ).toBe('|   +-- skills/                  # Skills (3 directories)');
    expect(withDeployedSkillCount('no count here (114 디렉토리)', 1)).toBe(
      'no count here (114 디렉토리)'
    );
  });
});

describe('update applies the init skill scope and backup layout', () => {
  let dir: string;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-update-scope-'));
    spies = [
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
      spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
    ];
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    await saveConfig(dir, config);
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('does not install an absent package-scope skill but updates an installed one', async () => {
    await writeTree(dir, { '.claude/skills/npm-publish/SKILL.md': 'stale local copy' });
    const result = await update({ targetDir: dir, components: ['skills'] });
    expect(result.success).toBe(true);
    const skills = await readdir(join(dir, '.claude/skills'));
    expect(skills).toContain('secretary-routing');
    for (const name of ['diagram-design', 'monitoring-setup', 'npm-audit', 'npm-version']) {
      expect(skills).not.toContain(name);
    }
    expect(await readFile(join(dir, '.claude/skills/npm-publish/SKILL.md'), 'utf-8')).toContain(
      'scope: package'
    );
  });

  it('states the deployed skill count in the entry doc', async () => {
    const result = await update({ targetDir: dir });
    expect(result.success).toBe(true);
    const deployed = await countSkillDirectories(join(dir, '.claude/skills'));
    const entry = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(entry).toMatch(new RegExp(`skills/[^\\n(]*\\(${deployed} (디렉토리|directories)\\)`));
    expect(existsSync(join(dir, '.claude/skills/npm-publish'))).toBe(false);
  });

  it('--backup stores claude/ and CLAUDE.md.backup, gitignores the backup, and keeps guides', async () => {
    gitInit(dir);
    await writeTree(dir, {
      '.claude/rules/test.md': 'existing rule',
      '.claude/skills/mine/SKILL.md': 'mine',
      'CLAUDE.md': '# Existing',
      'guides/x.md': 'guide',
    });
    const result = await update({ targetDir: dir, components: ['rules'], backup: true });
    expect(result.success).toBe(true);
    const backup = result.backedUpPaths[0] as string;
    expect(existsSync(join(backup, '.claude'))).toBe(false);
    expect(await readFile(join(backup, 'claude/skills/mine/SKILL.md'), 'utf-8')).toBe('mine');
    expect(existsSync(join(backup, 'CLAUDE.md'))).toBe(false);
    expect(await readFile(join(backup, 'CLAUDE.md.backup'), 'utf-8')).toBe('# Existing');
    expect(await readFile(join(backup, 'guides/x.md'), 'utf-8')).toBe('guide');
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toContain('.omcustom-backup-*/');
  });

  it('does not touch .gitignore in a dry run with --backup', async () => {
    gitInit(dir);
    await writeTree(dir, { '.claude/rules/test.md': 'existing rule' });
    await mkdir(join(dir, '.omcustom-backup-old'));
    await update({ targetDir: dir, components: ['rules'], backup: true, dryRun: true });
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });
});

describe('init --backup layout and entry doc count', () => {
  let dir: string;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-init-backup-'));
    spies = [
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
      spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
    ];
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('renames the backed-up .claude and CLAUDE.md and ignores the backup directory', async () => {
    gitInit(dir);
    await writeTree(dir, { '.claude/rules/old.md': 'old', 'CLAUDE.md': '# Old' });
    const result = await install({ targetDir: dir, language: 'ko', backup: true });
    expect(result.success).toBe(true);
    const backup = result.backedUpPaths[0] as string;
    expect(await readFile(join(backup, 'claude/rules/old.md'), 'utf-8')).toBe('old');
    expect(await readFile(join(backup, 'CLAUDE.md.backup'), 'utf-8')).toBe('# Old');
    expect(existsSync(join(backup, '.claude'))).toBe(false);
    expect(existsSync(join(backup, 'CLAUDE.md'))).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toContain('.claude-backup-*/');
  });

  it('installs a CLAUDE.md whose skill count matches the installed skills', async () => {
    const result = await install({ targetDir: dir, language: 'ko' });
    expect(result.success).toBe(true);
    const deployed = await countSkillDirectories(join(dir, '.claude/skills'));
    const entry = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(entry).toContain(`# 스킬 (${deployed} 디렉토리)`);
  });
});

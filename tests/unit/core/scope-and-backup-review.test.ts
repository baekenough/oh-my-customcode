import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureBackupGitignore,
  isInstructionFileName,
  renameNestedInstructionFiles,
} from '../../../src/core/backup-layout.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import { install } from '../../../src/core/installer.js';
import { countSkillDirectories } from '../../../src/core/scope-filter.js';
import { update } from '../../../src/core/updater.js';

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

describe('review fixes: gitignore negation and line endings', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-review-gi-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    await mkdir(join(dir, '.omcustom-backup-keep'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('leaves .gitignore alone when a line un-ignores a backup directory', async () => {
    const original = 'node_modules/\r\n!.omcustom-backup-keep/';
    await writeFile(join(dir, '.gitignore'), original);
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(original);
  });

  it('also treats a root-anchored negation as a deliberate un-ignore', async () => {
    const original = '/!x\n!/.omcustom-backup-keep\n';
    await writeFile(join(dir, '.gitignore'), original);
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(original);
  });

  it('keeps CRLF and adds the missing final newline in CRLF', async () => {
    await writeFile(join(dir, '.gitignore'), 'dist/\r\nbuild/');
    expect(await ensureBackupGitignore(dir)).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(
      'dist/\r\nbuild/\r\n\r\n# oh-my-customcode backups\r\n.omcustom-backup-*/\r\n'
    );
  });

  it('keeps CRLF when the file already ends with a newline', async () => {
    await writeFile(join(dir, '.gitignore'), 'dist/\r\n');
    expect(await ensureBackupGitignore(dir)).toBe(true);
    expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe(
      'dist/\r\n\r\n# oh-my-customcode backups\r\n.omcustom-backup-*/\r\n'
    );
  });
});

describe('review fixes: skill count', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-review-count-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('skips hidden entries, follows symlinked skill directories, ignores other links', async () => {
    await writeTree(dir, {
      'skills/a/SKILL.md': 'x',
      'skills/.git/HEAD': 'x',
      'outside/b/SKILL.md': 'x',
      'outside/file.txt': 'x',
    });
    await symlink(join(dir, 'outside/b'), join(dir, 'skills/b'));
    await symlink(join(dir, 'outside/file.txt'), join(dir, 'skills/file-link'));
    await symlink(join(dir, 'outside/missing'), join(dir, 'skills/dangling'));
    expect(await countSkillDirectories(join(dir, 'skills'))).toBe(2);
  });
});

describe('review fixes: nested instruction files in backups', () => {
  let dir: string;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-review-nested-'));
    spies = [
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
      spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
    ];
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('names the three instruction files', () => {
    expect(isInstructionFileName('AGENTS.md')).toBe(true);
    expect(isInstructionFileName('CLAUDE.local.md')).toBe(true);
    expect(isInstructionFileName('README.md')).toBe(false);
  });

  it('renames instruction files at any depth and does not follow symlinked directories', async () => {
    await writeTree(dir, {
      'root/CLAUDE.md': 'a',
      'root/x/y/AGENTS.md': 'b',
      'root/x/CLAUDE.local.md': 'c',
      'root/x/README.md': 'd',
      'outside/CLAUDE.md': 'e',
    });
    await symlink(join(dir, 'outside'), join(dir, 'root/link'));
    expect(await renameNestedInstructionFiles(join(dir, 'root'))).toBe(3);
    expect(existsSync(join(dir, 'root/CLAUDE.md.backup'))).toBe(true);
    expect(existsSync(join(dir, 'root/x/y/AGENTS.md.backup'))).toBe(true);
    expect(existsSync(join(dir, 'root/x/CLAUDE.local.md.backup'))).toBe(true);
    expect(existsSync(join(dir, 'root/x/README.md'))).toBe(true);
    expect(existsSync(join(dir, 'outside/CLAUDE.md'))).toBe(true);
  });

  it('returns 0 for a missing directory', async () => {
    expect(await renameNestedInstructionFiles(join(dir, 'missing'))).toBe(0);
  });

  it('update --backup suffixes nested instruction files in the copied trees', async () => {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    config.installedAt = '2025-01-01T00:00:00Z';
    await saveConfig(dir, config);
    await writeTree(dir, {
      '.claude/rules/r.md': 'rule',
      '.claude/skills/mine/CLAUDE.md': 'nested skill doc',
      'guides/g/AGENTS.md': 'nested guide agents',
      'CLAUDE.md': '# Top',
    });
    const result = await update({ targetDir: dir, components: ['rules'], backup: true });
    const backup = result.backedUpPaths[0] as string;
    expect(await readFile(join(backup, 'claude/skills/mine/CLAUDE.md.backup'), 'utf-8')).toBe(
      'nested skill doc'
    );
    expect(await readFile(join(backup, 'guides/g/AGENTS.md.backup'), 'utf-8')).toBe(
      'nested guide agents'
    );
    expect(existsSync(join(backup, 'claude/skills/mine/CLAUDE.md'))).toBe(false);
    expect(existsSync(join(backup, 'guides/g/AGENTS.md'))).toBe(false);
    expect(existsSync(join(backup, 'CLAUDE.md.backup'))).toBe(true);
  });

  it('init --backup suffixes nested instruction files in the moved trees', async () => {
    await writeTree(dir, {
      '.claude/skills/mine/AGENTS.md': 'nested',
      'guides/g/CLAUDE.local.md': 'nested guide',
    });
    const result = await install({ targetDir: dir, language: 'en', backup: true });
    const backup = result.backedUpPaths[0] as string;
    expect(await readFile(join(backup, 'claude/skills/mine/AGENTS.md.backup'), 'utf-8')).toBe(
      'nested'
    );
    expect(await readFile(join(backup, 'guides/g/CLAUDE.local.md.backup'), 'utf-8')).toBe(
      'nested guide'
    );
    expect(existsSync(join(backup, 'claude/skills/mine/AGENTS.md'))).toBe(false);
  });
});

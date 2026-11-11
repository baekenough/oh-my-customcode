import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupEntryName,
  ensureBackupGitignore,
  isInstructionFileName,
  renameNestedInstructionFiles,
} from '../../../src/core/backup-layout.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { install } from '../../../src/core/installer.js';
import * as logger from '../../../src/utils/logger.js';

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

describe('nested instruction file rename never overwrites', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-r1-rename-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps a hand-made CLAUDE.md.backup and stores the file as .backup-1', async () => {
    await writeTree(dir, {
      'skills/mine/CLAUDE.md': 'CURRENT',
      'skills/mine/CLAUDE.md.backup': 'MY HAND-MADE BACKUP',
    });
    expect(await renameNestedInstructionFiles(dir)).toBe(1);
    expect(await readFile(join(dir, 'skills/mine/CLAUDE.md.backup'), 'utf-8')).toBe(
      'MY HAND-MADE BACKUP'
    );
    expect(await readFile(join(dir, 'skills/mine/CLAUDE.md.backup-1'), 'utf-8')).toBe('CURRENT');
    expect(existsSync(join(dir, 'skills/mine/CLAUDE.md'))).toBe(false);
  });

  it('a second collision gets -2', async () => {
    await writeTree(dir, {
      'AGENTS.md': 'CURRENT',
      'AGENTS.md.backup': 'one',
      'AGENTS.md.backup-1': 'two',
    });
    expect(await renameNestedInstructionFiles(dir)).toBe(1);
    expect(await readFile(join(dir, 'AGENTS.md.backup'), 'utf-8')).toBe('one');
    expect(await readFile(join(dir, 'AGENTS.md.backup-1'), 'utf-8')).toBe('two');
    expect(await readFile(join(dir, 'AGENTS.md.backup-2'), 'utf-8')).toBe('CURRENT');
  });

  it('moves a symlinked instruction file as a link, also on collision', async () => {
    await writeTree(dir, { 'real.txt': 'real', 'sub/CLAUDE.md.backup': 'taken' });
    await symlink(join(dir, 'real.txt'), join(dir, 'sub/CLAUDE.md'));
    expect(await renameNestedInstructionFiles(dir)).toBe(1);
    expect(await readFile(join(dir, 'sub/CLAUDE.md.backup'), 'utf-8')).toBe('taken');
    expect(await readFile(join(dir, 'sub/CLAUDE.md.backup-1'), 'utf-8')).toBe('real');
    expect(existsSync(join(dir, 'sub/CLAUDE.md'))).toBe(false);
  });

  it('matches the instruction file names case-insensitively', async () => {
    expect(isInstructionFileName('claude.md')).toBe(true);
    expect(isInstructionFileName('Agents.MD')).toBe(true);
    expect(backupEntryName('claude.md')).toBe('claude.md.backup');
    await writeTree(dir, { 'a/claude.md': 'x', 'b/Claude.Local.md': 'y' });
    expect(await renameNestedInstructionFiles(dir)).toBe(2);
    expect(existsSync(join(dir, 'a/claude.md.backup'))).toBe(true);
    expect(existsSync(join(dir, 'b/Claude.Local.md.backup'))).toBe(true);
  });
});

describe('ensureBackupGitignore asks git per prefix', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-r1-gi-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('respects a negation that lives in .git/info/exclude', async () => {
    await mkdir(join(dir, '.omcustom-backup-1'));
    await writeFile(join(dir, '.git/info/exclude'), '!.omcustom-backup-1/\n');
    expect(await ensureBackupGitignore(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('names the file that holds the negation, not always .gitignore (#1949)', async () => {
    await mkdir(join(dir, '.omcustom-backup-1'));
    await writeFile(join(dir, '.git/info/exclude'), '!.omcustom-backup-1/\n');
    const infoSpy = spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      expect(await ensureBackupGitignore(dir)).toBe(false);
      const call = infoSpy.mock.calls.find((c: unknown[]) => c[0] === 'backup.gitignore_negated');
      const params = call?.[1] as { path: string; target: string };
      expect(params.path).toBe('.git/info/exclude');
      expect(params.target).toBe(join(dir, '.gitignore'));
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('mixed run: the notice names the negated pattern and stays true next to "Added" (#1949)', async () => {
    await mkdir(join(dir, '.omcustom-backup-1'));
    await mkdir(join(dir, '.claude-backup-1'));
    await writeFile(join(dir, '.git/info/exclude'), '!.omcustom-backup-1/\n');
    const infoSpy = spyOn(console, 'info').mockImplementation(() => undefined);
    const previous = logger.getLoggerOptions();
    logger.setLocale('en');
    logger.setLogLevel('info');
    try {
      expect(await ensureBackupGitignore(dir)).toBe(true);
      const lines = infoSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      const negated = lines.find((l) => l.includes('un-ignores')) ?? '';
      const added = lines.find((l) => l.includes('Added')) ?? '';
      expect(negated).toContain('.git/info/exclude');
      expect(negated).toContain('not adding .omcustom-backup-*/');
      expect(negated).not.toContain('left unchanged');
      expect(added).toContain('.claude-backup-*/');
      expect(added).not.toContain('.omcustom-backup-*/');
      const text = await readFile(join(dir, '.gitignore'), 'utf-8');
      expect(text).toContain('.claude-backup-*/');
      expect(text).not.toContain('.omcustom-backup-*/');
    } finally {
      logger.setLocale(previous.locale);
      logger.setLogLevel(previous.level);
      infoSpy.mockRestore();
    }
  });

  it('decides per prefix: a claude-backup negation does not block the omcustom pattern', async () => {
    await mkdir(join(dir, '.claude-backup-keep'));
    await mkdir(join(dir, '.omcustom-backup-1'));
    await writeFile(join(dir, '.gitignore'), '!/.claude-backup-keep/\n');
    expect(await ensureBackupGitignore(dir)).toBe(true);
    const text = await readFile(join(dir, '.gitignore'), 'utf-8');
    expect(text).toContain('.omcustom-backup-*/');
    expect(text).not.toContain('.claude-backup-*/');
  });

  describe('when git cannot answer', () => {
    beforeEach(() => {
      // A directory as the global exclude file makes check-ignore fail (exit 128), rev-parse not
      execFileSync('git', ['config', 'core.excludesFile', dir], { cwd: dir });
    });

    it('falls back to scanning .gitignore for a negation of the prefix', async () => {
      await mkdir(join(dir, '.omcustom-backup-1'));
      await writeFile(join(dir, '.gitignore'), '!.omcustom-backup-keep/\n');
      expect(await ensureBackupGitignore(dir)).toBe(false);
      expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toBe('!.omcustom-backup-keep/\n');
    });

    it('appends the pattern when there is no negation', async () => {
      await mkdir(join(dir, '.omcustom-backup-1'));
      expect(await ensureBackupGitignore(dir)).toBe(true);
      expect(await readFile(join(dir, '.gitignore'), 'utf-8')).toContain('.omcustom-backup-*/');
    });
  });
});

describe('entry doc skill count refresh failure is not fatal', () => {
  let dir: string;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-r1-refresh-'));
    spies = [
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
      spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
    ];
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('warns and still succeeds when re-reading the entry doc fails', async () => {
    await writeTree(dir, { '.claude/rules/old.md': 'old', 'CLAUDE.md': '# Old' });
    const original = fsPromises.readFile;
    const entryPath = join(dir, 'CLAUDE.md');
    const readSpy = spyOn(fsPromises, 'readFile').mockImplementation(((
      path: Parameters<typeof original>[0],
      ...rest: unknown[]
    ) => {
      if (path === entryPath) return Promise.reject(new Error('injected read failure'));
      return (original as (...args: unknown[]) => Promise<unknown>)(path, ...rest);
    }) as typeof original);
    spies.push(readSpy);

    const result = await install({ targetDir: dir, language: 'en', backup: true });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes('injected read failure'))).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  logBackupRestoreHint,
  renameNestedInstructionFilesDetailed,
} from '../../../src/core/backup-layout.js';
import * as logger from '../../../src/utils/logger.js';

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

describe('restore hint after a name collision', () => {
  let dir: string;
  let infoSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-r2-hint-'));
    infoSpy = spyOn(logger, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  function hintText(): string {
    const call = infoSpy.mock.calls.find((c: unknown[]) => c[0] === 'backup.restore_hint');
    return String((call?.[1] as { renames: string }).renames);
  }

  it('reports collided renames explicitly (probe5 scenario) and keeps the user file out of the generic rule', async () => {
    await writeTree(dir, {
      'skills/mine/CLAUDE.md': 'CURRENT',
      'skills/mine/CLAUDE.md.backup': 'MY HAND-MADE BACKUP',
      'other/AGENTS.md': 'plain',
    });
    const result = await renameNestedInstructionFilesDetailed(dir);
    expect(result.renamed).toBe(2);
    expect(result.collided).toEqual([
      { stored: 'skills/mine/CLAUDE.md.backup-1', original: 'skills/mine/CLAUDE.md' },
    ]);

    logBackupRestoreHint(dir, [], result.renamed, result.collided);
    const text = hintText();
    expect(text).toContain('skills/mine/CLAUDE.md.backup-1 -> skills/mine/CLAUDE.md');
    expect(text).toContain('the existing .backup file next to it stays');
    expect(text).toContain('nested *.md.backup (1) -> drop the .backup suffix');
    expect(text).toContain('except the files named in this hint');
  });

  it('keeps the generic sentence alone when nothing collided', () => {
    logBackupRestoreHint(dir, [], 3, []);
    const text = hintText();
    expect(text).toBe('nested *.md.backup (3) -> drop the .backup suffix');
  });

  it('prints one rename per line and says it covers only files this run changed (#1949)', () => {
    logBackupRestoreHint(dir, ['.claude', 'CLAUDE.md'], 2, []);
    expect(hintText().split('\n')).toEqual([
      'claude -> .claude',
      '  CLAUDE.md.backup -> CLAUDE.md',
      '  nested *.md.backup (2) -> drop the .backup suffix',
    ]);
  });

  it('the rendered hint states its scope (#1949)', () => {
    infoSpy.mockRestore();
    const logSpy = spyOn(console, 'info').mockImplementation(() => undefined);
    const previous = logger.getLoggerOptions();
    logger.setLocale('en');
    logger.setLogLevel('info');
    try {
      logBackupRestoreHint(dir, ['.claude'], 0, []);
      const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(printed).toContain('only files this run changed');
      expect(printed).toContain('\n  claude -> .claude');
    } finally {
      logger.setLocale(previous.locale);
      logger.setLogLevel(previous.level);
      logSpy.mockRestore();
      infoSpy = spyOn(logger, 'info').mockImplementation(() => undefined);
    }
  });

  it('prints only the collided entries when every rename collided', () => {
    logBackupRestoreHint(dir, [], 1, [{ stored: 'a/AGENTS.md.backup-1', original: 'a/AGENTS.md' }]);
    expect(hintText()).not.toContain('nested *.md.backup');
  });
});

describe('moveWithoutOverwrite failure handling', () => {
  let dir: string;
  let warnSpy: ReturnType<typeof spyOn>;
  const spies: Array<{ mockRestore: () => void }> = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'omcustom-r2-fail-'));
    warnSpy = spyOn(logger, 'warn').mockImplementation(() => undefined);
    spies.push(warnSpy);
  });

  afterEach(async () => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  });

  it('takes the new name back and warns when unlinking the original fails', async () => {
    await writeTree(dir, { 'sub/CLAUDE.md': 'CURRENT' });
    const original = fsPromises.unlink;
    const from = join(dir, 'sub/CLAUDE.md');
    spies.push(
      spyOn(fsPromises, 'unlink').mockImplementation((async (path: string) => {
        if (path === from)
          throw Object.assign(new Error('injected unlink failure'), { code: 'EPERM' });
        return original(path);
      }) as typeof original)
    );

    const result = await renameNestedInstructionFilesDetailed(dir);

    expect(result.renamed).toBe(0);
    expect(await readFile(from, 'utf-8')).toBe('CURRENT');
    expect(existsSync(join(dir, 'sub/CLAUDE.md.backup'))).toBe(false);
    const call = warnSpy.mock.calls.find(
      (c: unknown[]) => c[0] === 'backup.instruction_rename_failed'
    );
    expect((call?.[1] as { error: string }).error).toContain('injected unlink failure');
  });

  it('removes a partial copy when the exclusive copy fails', async () => {
    await writeTree(dir, { 'sub/AGENTS.md': 'CURRENT' });
    const target = join(dir, 'sub/AGENTS.md.backup');
    spies.push(
      spyOn(fsPromises, 'link').mockRejectedValue(
        Object.assign(new Error('links unsupported'), { code: 'EPERM' })
      ),
      spyOn(fsPromises, 'copyFile').mockImplementation((async () => {
        await writeFile(target, 'PART');
        throw Object.assign(new Error('injected copy failure'), { code: 'ENOSPC' });
      }) as typeof fsPromises.copyFile)
    );

    const result = await renameNestedInstructionFilesDetailed(dir);

    expect(result.renamed).toBe(0);
    expect(existsSync(target)).toBe(false);
    expect(await readFile(join(dir, 'sub/AGENTS.md'), 'utf-8')).toBe('CURRENT');
  });

  it('falls back to an exclusive copy when links are unsupported', async () => {
    await writeTree(dir, { 'sub/CLAUDE.local.md': 'CURRENT' });
    spies.push(
      spyOn(fsPromises, 'link').mockRejectedValue(
        Object.assign(new Error('links unsupported'), { code: 'EPERM' })
      )
    );

    const result = await renameNestedInstructionFilesDetailed(dir);

    expect(result.renamed).toBe(1);
    expect(await readFile(join(dir, 'sub/CLAUDE.local.md.backup'), 'utf-8')).toBe('CURRENT');
    expect(existsSync(join(dir, 'sub/CLAUDE.local.md'))).toBe(false);
  });
});

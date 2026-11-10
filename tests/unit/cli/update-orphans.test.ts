/**
 * `omcustom update` output for leftovers that oh-my-customcode no longer ships (#1935), moved to
 * a backup instead of deleted (#1938-2), with deliberate keeps reported once (#1938-1).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { printUpdateResults, reportProjectUpdateResult } from '../../../src/cli/update.js';
import type { UpdateResult } from '../../../src/core/updater.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

const BACKUP = '/work/project/.omcustom-backup-2026-11-10T00-00-00-000Z/retired';
const PATTERN = '.omcustom-backup-<timestamp>/retired';

function makeResult(overrides: Partial<UpdateResult> = {}): UpdateResult {
  return {
    success: true,
    updatedComponents: [],
    skippedComponents: [],
    preservedFiles: [],
    backedUpPaths: [],
    previousVersion: '0.148.0',
    newVersion: '2.0.20',
    warnings: [],
    syncedRootFiles: [],
    removedDeprecatedFiles: [],
    namespaceSynced: [],
    ...overrides,
  };
}

/** One leftover of each kind of keep: actionable, preserve settings, declined. */
const MIXED_KEEPS: NonNullable<UpdateResult['orphanRetirement']>['preserved'] = [
  { path: '.claude/skills/sdd-development/SKILL.md', reason: 'user-modified file' },
  {
    path: '.claude/skills/kept-on-purpose/SKILL.md',
    reason: 'explicitly preserved',
    keptBy: 'preserve-settings',
  },
  {
    path: '.claude/skills/kept-too/SKILL.md',
    reason: 'explicitly preserved',
    keptBy: 'preserve-settings',
  },
  { path: 'guides/declined/intro.md', reason: 'declined by user', keptBy: 'declined' },
];

describe('printUpdateResults orphan retirement output', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await initI18n('en');
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    await initI18n('en');
  });

  const lines = (): string[] => logSpy.mock.calls.map((call: unknown[]) => String(call[0]));

  it('lists moved files with the backup and how to restore, and kept files', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: {
          removed: ['.claude/skills/memory-save/SKILL.md', 'guides/profiles/manifest-install.md'],
          wouldRemove: [],
          preserved: [
            { path: '.claude/skills/sdd-development/SKILL.md', reason: 'user-modified file' },
          ],
          backupDir: BACKUP,
        },
        warnings: [
          'Orphan retirement preserved .claude/skills/sdd-development/SKILL.md: user-modified file',
        ],
      })
    );

    const output = lines();
    expect(output).toContain(i18n.t('cli.update.orphansMoved', { count: '2', path: BACKUP }));
    expect(output).toContain('  - .claude/skills/memory-save/SKILL.md');
    expect(output).toContain('  - guides/profiles/manifest-install.md');
    expect(output).toContain(i18n.t('cli.update.orphansRestoreHint'));
    expect(output).toContain(i18n.t('cli.update.orphansPreserved', { count: '1' }));
    expect(output).toContain('  - .claude/skills/sdd-development/SKILL.md');
    expect(output.some((line) => line.startsWith('Would '))).toBe(false);
    expect(output.join('\n')).toContain(
      `Moved 2 file(s) that oh-my-customcode no longer ships to a backup: ${BACKUP}`
    );
    expect(output.join('\n')).not.toMatch(/Removed \d+ file/);
    expect(warnSpy).toHaveBeenCalledWith(
      'Orphan retirement preserved .claude/skills/sdd-development/SKILL.md: user-modified file'
    );
  });

  it('prints the backup pattern when a result has moved files but no backupDir', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: { removed: ['guides/old/x.md'], wouldRemove: [], preserved: [] },
      })
    );

    expect(lines()).toContain(i18n.t('cli.update.orphansMoved', { count: '1', path: PATTERN }));
  });

  it('lists would-move candidates on a dry run, with the backup pattern', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: {
          removed: [],
          wouldRemove: ['.claude/skills/codex-exec/SKILL.md'],
          preserved: [],
        },
      })
    );

    const output = lines();
    expect(output).toContain(
      `Would move 1 file(s) that oh-my-customcode no longer ships to a backup (${PATTERN}):`
    );
    expect(output).toContain('  - .claude/skills/codex-exec/SKILL.md');
    expect(output.some((line) => line.startsWith('Moved '))).toBe(false);
    expect(output.some((line) => line.startsWith('Kept '))).toBe(false);
    expect(output).not.toContain(i18n.t('cli.update.orphansRestoreHint'));
  });

  it('prints nothing about orphans when the step did not run or found nothing', () => {
    printUpdateResults(makeResult());
    printUpdateResults(
      makeResult({ orphanRetirement: { removed: [], wouldRemove: [], preserved: [] } })
    );

    expect(lines().some((line) => line.includes('no longer ships'))).toBe(false);
    expect(lines().some((line) => line.includes('preserve settings'))).toBe(false);
  });

  it('reports preserve-settings keeps in one line and leaves declined keeps out of the delete list (#1938-1)', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: { removed: [], wouldRemove: [], preserved: MIXED_KEEPS },
        warnings: [
          'Orphan retirement preserved .claude/skills/sdd-development/SKILL.md: user-modified file',
        ],
      })
    );

    const output = lines();
    expect(output).toContain(i18n.t('cli.update.orphansKeptByPreserveSettings', { count: '2' }));
    expect(output).toContain('2 retired file(s) kept by your preserve settings');
    // Only the actionable keep is in the "delete them yourself" list.
    expect(output).toContain(i18n.t('cli.update.orphansPreserved', { count: '1' }));
    expect(output).toContain('  - .claude/skills/sdd-development/SKILL.md');
    for (const deliberate of [
      '.claude/skills/kept-on-purpose/SKILL.md',
      '.claude/skills/kept-too/SKILL.md',
      'guides/declined/intro.md',
    ]) {
      expect(output.some((line) => line.includes(deliberate))).toBe(false);
    }
  });

  it('prints neither list when every kept file was kept on purpose', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: {
          removed: [],
          wouldRemove: [],
          preserved: MIXED_KEEPS.filter((entry) => entry.keptBy === 'declined'),
        },
      })
    );

    expect(lines()).toEqual([i18n.t('cli.update.summary', { updated: '0', skipped: '0' })]);
  });

  it('words the kept-files message so it holds for every keep reason (review P3)', async () => {
    const keys = ['cli.update.orphansPreserved', 'cli.update.orphansPreservedWithReasons'];
    for (const key of keys) {
      const english = i18n.t(key, { count: '2' });
      expect(english).not.toContain('not verified');
      expect(english).not.toContain('unmodified');
      expect(english).toContain('Delete them yourself if you no longer need them');
    }
    await initI18n('ko');
    for (const key of keys) {
      const korean = i18n.t(key, { count: '2' });
      expect(korean).not.toContain('수정되지 않은 사본');
      expect(korean).toContain('직접 삭제하세요');
    }
  });

  it('has Korean translations for every orphan message', async () => {
    const keys = [
      'cli.update.orphansMoved',
      'cli.update.orphansWouldMove',
      'cli.update.orphansPreserved',
      'cli.update.orphansPreservedWithReasons',
      'cli.update.orphansKeptByPreserveSettings',
    ];
    const english = keys.map((key) => i18n.t(key, { count: '3', path: PATTERN }));
    await initI18n('ko');
    for (const [index, key] of keys.entries()) {
      const text = i18n.t(key, { count: '3', path: PATTERN });
      expect(text).not.toBe(key);
      expect(text).not.toBe(english[index]);
      expect(text).toContain('3');
    }
    expect(i18n.t('cli.update.orphansMoved', { count: '3', path: PATTERN })).toContain(PATTERN);
    expect(i18n.t('cli.update.orphansWouldMove', { count: '3', path: PATTERN })).toContain(PATTERN);
    expect(i18n.t('cli.update.orphansRestoreHint')).toContain("'.claude/'");
    expect(i18n.t('cli.update.orphansRestoreHint')).toContain("'.backup'");
    expect(i18n.t('cli.update.orphansRestoreHint')).toContain('CLAUDE.md');
    expect(i18n.t('cli.update.orphansRestoreHint')).not.toBe('cli.update.orphansRestoreHint');
  });

  it('no longer says "remove" or "delete" for files that are moved (#1938-2)', async () => {
    for (const locale of ['en', 'ko'] as const) {
      await initI18n(locale);
      const moved = i18n.t('cli.update.orphansMoved', { count: '1', path: BACKUP });
      const wouldMove = i18n.t('cli.update.orphansWouldMove', { count: '1', path: PATTERN });
      for (const text of [moved, wouldMove]) {
        expect(text).not.toMatch(/remov|delet|삭제|제거/i);
        expect(text).toMatch(/backup|백업/);
      }
    }
  });

  it('the restore hint tells how to keep a restored file: preserveFiles in .omcustomrc.json (#1938 L6)', async () => {
    for (const locale of ['en', 'ko'] as const) {
      await initI18n(locale);
      const hint = i18n.t('cli.update.orphansRestoreHint');
      expect(hint).toContain("'preserveFiles'");
      expect(hint).toContain('.backup');
      expect(hint).toContain('AGENTS.md');
      expect(hint).toContain('.omcustomrc.json');
      expect(hint).toContain("'.claude/'");
      expect(hint).not.toMatch(/delet|삭제/i);
    }
  });
});

describe('reportProjectUpdateResult (--all) orphan retirement output', () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await initI18n('en');
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const lines = (): string[] => logSpy.mock.calls.map((call: unknown[]) => String(call[0]));
  const project = { name: 'demo', version: '0.148.0' };

  it('prints moved files with the backup and kept files with reasons after the project line', () => {
    const outcome = reportProjectUpdateResult(
      project,
      makeResult({
        orphanRetirement: {
          removed: ['.claude/skills/memory-save/SKILL.md'],
          wouldRemove: [],
          preserved: [{ path: '.claude/skills/old/SKILL.md', reason: 'user-modified file' }],
          backupDir: BACKUP,
        },
      }),
      '2.0.20'
    );

    expect(outcome).toBe('updated');
    expect(lines()).toEqual([
      i18n.t('cli.update.allProjectUpdated', { from: '0.148.0', to: '2.0.20' }),
      i18n.t('cli.update.orphansMoved', { count: '1', path: BACKUP }),
      '  - .claude/skills/memory-save/SKILL.md',
      i18n.t('cli.update.orphansRestoreHint'),
      i18n.t('cli.update.orphansPreservedWithReasons', { count: '1' }),
      '  - .claude/skills/old/SKILL.md (user-modified file)',
    ]);
  });

  it('reports preserve-settings keeps in one line, with reasons only for actionable keeps', () => {
    reportProjectUpdateResult(
      project,
      makeResult({ orphanRetirement: { removed: [], wouldRemove: [], preserved: MIXED_KEEPS } }),
      '2.0.20'
    );

    expect(lines()).toEqual([
      i18n.t('cli.update.allProjectUpdated', { from: '0.148.0', to: '2.0.20' }),
      i18n.t('cli.update.orphansKeptByPreserveSettings', { count: '2' }),
      i18n.t('cli.update.orphansPreservedWithReasons', { count: '1' }),
      '  - .claude/skills/sdd-development/SKILL.md (user-modified file)',
    ]);
  });

  it('prints dry-run candidates', () => {
    reportProjectUpdateResult(
      project,
      makeResult({
        orphanRetirement: {
          removed: [],
          wouldRemove: ['.claude/skills/codex-exec/SKILL.md'],
          preserved: [],
        },
      }),
      '2.0.20'
    );

    expect(lines()).toContain(i18n.t('cli.update.orphansWouldMove', { count: '1', path: PATTERN }));
    expect(lines()).toContain('  - .claude/skills/codex-exec/SKILL.md');
    expect(lines().some((line) => line.startsWith('Moved '))).toBe(false);
  });

  it('still reports moves done before a failure, and nothing for a skipped source project', () => {
    const failed = reportProjectUpdateResult(
      project,
      makeResult({
        success: false,
        error: 'boom',
        orphanRetirement: {
          removed: ['guides/old/x.md'],
          wouldRemove: [],
          preserved: [],
          backupDir: BACKUP,
        },
      }),
      '2.0.20'
    );
    expect(failed).toBe('failed');
    expect(lines()).toContain('  - guides/old/x.md');
    expect(lines()).toContain(i18n.t('cli.update.orphansMoved', { count: '1', path: BACKUP }));

    logSpy.mockClear();
    expect(reportProjectUpdateResult(project, makeResult({ skippedSource: true }), '2.0.20')).toBe(
      'skipped'
    );
    expect(lines()).toHaveLength(1);
  });
});

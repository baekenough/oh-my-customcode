/**
 * `omcustom update` output for leftovers that oh-my-customcode no longer ships (#1935).
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { printUpdateResults, reportProjectUpdateResult } from '../../../src/cli/update.js';
import type { UpdateResult } from '../../../src/core/updater.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';

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

describe('printUpdateResults orphan retirement output', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await initI18n('en');
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const lines = (): string[] => logSpy.mock.calls.map((call: unknown[]) => String(call[0]));

  it('lists removed files and kept files on a normal update', () => {
    printUpdateResults(
      makeResult({
        orphanRetirement: {
          removed: ['.claude/skills/memory-save/SKILL.md', 'guides/profiles/manifest-install.md'],
          wouldRemove: [],
          preserved: [
            { path: '.claude/skills/sdd-development/SKILL.md', reason: 'user-modified file' },
          ],
        },
        warnings: [
          'Orphan retirement preserved .claude/skills/sdd-development/SKILL.md: user-modified file',
        ],
      })
    );

    const output = lines();
    expect(output).toContain(i18n.t('cli.update.orphansRemoved', { count: '2' }));
    expect(output).toContain('  - .claude/skills/memory-save/SKILL.md');
    expect(output).toContain('  - guides/profiles/manifest-install.md');
    expect(output).toContain(i18n.t('cli.update.orphansPreserved', { count: '1' }));
    expect(output).toContain('  - .claude/skills/sdd-development/SKILL.md');
    expect(output.some((line) => line.startsWith('Would remove'))).toBe(false);
    expect(output.join('\n')).toContain('Removed 2 file(s) that oh-my-customcode no longer ships:');
    expect(warnSpy).toHaveBeenCalledWith(
      'Orphan retirement preserved .claude/skills/sdd-development/SKILL.md: user-modified file'
    );
  });

  it('lists would-remove candidates on a dry run', () => {
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
    expect(output).toContain('Would remove 1 file(s) that oh-my-customcode no longer ships:');
    expect(output).toContain('  - .claude/skills/codex-exec/SKILL.md');
    expect(output.some((line) => line.startsWith('Removed '))).toBe(false);
    expect(output.some((line) => line.startsWith('Kept '))).toBe(false);
  });

  it('prints nothing about orphans when the step did not run or found nothing', () => {
    printUpdateResults(makeResult());
    printUpdateResults(
      makeResult({ orphanRetirement: { removed: [], wouldRemove: [], preserved: [] } })
    );

    expect(lines().some((line) => line.includes('no longer ships'))).toBe(false);
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
    await initI18n('en');
  });

  it('has Korean translations for every orphan message', async () => {
    await initI18n('ko');
    for (const key of [
      'cli.update.orphansRemoved',
      'cli.update.orphansWouldRemove',
      'cli.update.orphansPreserved',
      'cli.update.orphansPreservedWithReasons',
    ]) {
      const text = i18n.t(key, { count: '3' });
      expect(text).not.toBe(key);
      expect(text).toContain('3');
      expect(text).toContain('oh-my-customcode');
    }
    await initI18n('en');
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

  it('prints removed and kept files with reasons after the project line', () => {
    const outcome = reportProjectUpdateResult(
      project,
      makeResult({
        orphanRetirement: {
          removed: ['.claude/skills/memory-save/SKILL.md'],
          wouldRemove: [],
          preserved: [{ path: '.claude/skills/old/SKILL.md', reason: 'user-modified file' }],
        },
      }),
      '2.0.20'
    );

    expect(outcome).toBe('updated');
    expect(lines()).toEqual([
      i18n.t('cli.update.allProjectUpdated', { from: '0.148.0', to: '2.0.20' }),
      i18n.t('cli.update.orphansRemoved', { count: '1' }),
      '  - .claude/skills/memory-save/SKILL.md',
      i18n.t('cli.update.orphansPreservedWithReasons', { count: '1' }),
      '  - .claude/skills/old/SKILL.md (user-modified file)',
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

    expect(lines()).toContain(i18n.t('cli.update.orphansWouldRemove', { count: '1' }));
    expect(lines()).toContain('  - .claude/skills/codex-exec/SKILL.md');
    expect(lines().some((line) => line.startsWith('Removed '))).toBe(false);
  });

  it('still reports removals done before a failure, and nothing for a skipped source project', () => {
    const failed = reportProjectUpdateResult(
      project,
      makeResult({
        success: false,
        error: 'boom',
        orphanRetirement: { removed: ['guides/old/x.md'], wouldRemove: [], preserved: [] },
      }),
      '2.0.20'
    );
    expect(failed).toBe('failed');
    expect(lines()).toContain('  - guides/old/x.md');

    logSpy.mockClear();
    expect(reportProjectUpdateResult(project, makeResult({ skippedSource: true }), '2.0.20')).toBe(
      'skipped'
    );
    expect(lines()).toHaveLength(1);
  });
});

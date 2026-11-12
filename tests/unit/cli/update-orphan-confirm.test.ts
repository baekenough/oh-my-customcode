/**
 * `omcustom update` asks before moving retired template files to a backup (#1941, #1938).
 *
 * The question is asked only on a terminal (stdin and stdout), outside CI, and not for `--all`,
 * `--dry-run` or `--yes`. Each case runs the real update on a temp project whose old lock owns one
 * unmodified retired guide, so "moved" and "kept" are checked on disk.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as readline from 'node:readline/promises';
import { PassThrough } from 'node:stream';
import * as inquirer from '@inquirer/prompts';
import * as projectsModule from '../../../src/cli/projects.js';
import {
  askLine,
  createOrphanRemovalPrompt,
  InputInterruptedError,
  shouldConfirmOrphanRemoval,
  type UpdateCommandOptions,
  updateCommand,
} from '../../../src/cli/update.js';
import * as codexInstaller from '../../../src/core/codex-installer.js';
import { getDefaultConfig, saveConfig } from '../../../src/core/config.js';
import * as registry from '../../../src/core/registry.js';
import * as retiredModule from '../../../src/core/retired-template-paths.js';
import type { checkSelfUpdate } from '../../../src/core/self-update.js';
import { i18n, initI18n } from '../../../src/i18n/index.js';
import type { OrphanRemovalConfirmation as PublicConfirmation } from '../../../src/index.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const SHIPPED = 'shipped content of an old release\n';
const LEFTOVER = 'guides/old-guide/intro.md';
const BACKUP = '/work/project/.omcustom-backup-2026-11-10T00-00-00-000Z/retired';

const noVersionCheck = (() => ({
  checked: false,
  updateAvailable: false,
})) as unknown as typeof checkSelfUpdate;

type TtyStream = { isTTY?: boolean };
const ttyDescriptors = {
  stdin: Object.getOwnPropertyDescriptor(process.stdin, 'isTTY'),
  stdout: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
};

function setTty(stream: TtyStream, value: boolean): void {
  Object.defineProperty(stream, 'isTTY', { value, configurable: true, writable: true });
}

function restoreTty(stream: TtyStream, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(stream, 'isTTY', descriptor);
  } else {
    delete stream.isTTY;
  }
}

let savedEnv: { CI?: string; GITHUB_ACTIONS?: string };

function restoreEnv(name: 'CI' | 'GITHUB_ACTIONS'): void {
  const value = savedEnv[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

beforeEach(async () => {
  await initI18n('en');
  savedEnv = { CI: process.env.CI, GITHUB_ACTIONS: process.env.GITHUB_ACTIONS };
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  setTty(process.stdin, true);
  setTty(process.stdout, true);
});

afterEach(() => {
  restoreTty(process.stdin, ttyDescriptors.stdin);
  restoreTty(process.stdout, ttyDescriptors.stdout);
  restoreEnv('CI');
  restoreEnv('GITHUB_ACTIONS');
});

describe('shouldConfirmOrphanRemoval', () => {
  it('asks on a terminal outside CI for a plain single-project update', () => {
    expect(shouldConfirmOrphanRemoval({})).toBe(true);
    expect(shouldConfirmOrphanRemoval({ guides: true, force: true })).toBe(true);
  });

  it('does not ask without a terminal on stdin or stdout', () => {
    setTty(process.stdin, false);
    expect(shouldConfirmOrphanRemoval({})).toBe(false);
    setTty(process.stdin, true);
    setTty(process.stdout, false);
    expect(shouldConfirmOrphanRemoval({})).toBe(false);
  });

  it('does not ask in CI', () => {
    expect(shouldConfirmOrphanRemoval({}, { CI: 'true' })).toBe(false);
    expect(shouldConfirmOrphanRemoval({}, { GITHUB_ACTIONS: 'true' })).toBe(false);
    expect(shouldConfirmOrphanRemoval({}, { CI: '1' })).toBe(false);
    expect(shouldConfirmOrphanRemoval({}, { CI: 'yes' })).toBe(false);
    expect(shouldConfirmOrphanRemoval({}, {})).toBe(true);
  });

  it('treats CI or GITHUB_ACTIONS set to false, 0 or empty as not CI (review L3)', () => {
    for (const value of ['false', 'FALSE', 'False', '0', '', ' 0 ']) {
      expect(shouldConfirmOrphanRemoval({}, { CI: value })).toBe(true);
      expect(shouldConfirmOrphanRemoval({}, { GITHUB_ACTIONS: value })).toBe(true);
    }
    expect(shouldConfirmOrphanRemoval({}, { CI: 'false', GITHUB_ACTIONS: 'true' })).toBe(false);
  });

  it('does not ask for --all, --dry-run or --yes', () => {
    for (const options of [{ all: true }, { dryRun: true }, { yes: true }]) {
      expect(shouldConfirmOrphanRemoval(options)).toBe(false);
    }
  });
});

describe('askLine', () => {
  const streams = () => {
    const output = new PassThrough();
    const written: string[] = [];
    output.on('data', (chunk: Buffer) => written.push(chunk.toString()));
    return { input: new PassThrough(), output, written: () => written.join('') };
  };

  it('returns the typed answer and adds no newline of its own', async () => {
    const { input, output, written } = streams();
    const answer = askLine('Move? ', input, output);
    input.write('yes\n');
    expect(await answer).toBe('yes');
    expect(written()).toBe('Move? ');
  });

  it('returns the default (empty) answer at the end of input, after a newline (review L2)', async () => {
    const { input, output, written } = streams();
    const answer = askLine('Move? ', input, output);
    input.end();
    expect(await answer).toBe('');
    expect(written()).toBe('Move? \n');
  });

  it('rejects with InputInterruptedError on Ctrl+C at a terminal, after a newline (review L2)', async () => {
    const { input, output, written } = streams();
    Object.assign(output, { isTTY: true, columns: 80 });
    const answer = askLine('Move? ', input, output);
    input.write('\x03');
    const error = await answer.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(InputInterruptedError);
    expect((error as Error).message).toBe('interrupted');
    expect(written().endsWith('\n')).toBe(true);
    expect(
      written()
        .split('\n')
        .filter((line) => line.length > 0)
    ).toHaveLength(1);
  });
});

describe('createOrphanRemovalPrompt', () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const printed = (): string[] => logSpy.mock.calls.map((call: unknown[]) => String(call[0]));

  it('lists the project and the files, and only y or yes accepts', async () => {
    const answers: Array<[string, boolean]> = [
      ['y', true],
      [' YES ', true],
      ['', false],
      ['n', false],
      ['no', false],
      ['maybe', false],
    ];
    for (const [answer, expected] of answers) {
      logSpy.mockClear();
      const questions: string[] = [];
      const confirm = createOrphanRemovalPrompt('/work/project', async (question) => {
        questions.push(question);
        return answer;
      });

      expect(await confirm(['a.md', 'b.md'], { backupDir: BACKUP })).toBe(expected);
      expect(questions).toEqual([i18n.t('cli.update.orphanConfirmPrompt')]);
      const lines = printed();
      expect(lines[0]).toBe(
        i18n.t('cli.update.orphanConfirmHeader', {
          count: '2',
          path: '/work/project',
          backup: BACKUP,
        })
      );
      expect(lines[0]).toContain(BACKUP);
      expect(lines).toContain('  - a.md');
      expect(lines).toContain('  - b.md');
      expect(lines.includes(i18n.t('cli.update.orphanConfirmDeclined'))).toBe(!expected);
    }
  });

  it('Ctrl+C keeps the files and says the input was interrupted (review L1)', async () => {
    const confirm = createOrphanRemovalPrompt('/work/project', async () => {
      throw new InputInterruptedError();
    });

    expect(await confirm(['a.md'], { backupDir: BACKUP })).toBe(false);
    const lines = printed();
    expect(lines).toContain(i18n.t('cli.update.orphanConfirmInterrupted'));
    expect(lines).not.toContain(i18n.t('cli.update.orphanConfirmDeclined'));
    expect(i18n.t('cli.update.orphanConfirmInterrupted')).toContain('interrupted');
  });

  it('passes on any other failure of the question', async () => {
    const confirm = createOrphanRemovalPrompt('/work/project', async () => {
      throw new Error('stdin broke');
    });

    await expect(confirm(['a.md'], { backupDir: BACKUP })).rejects.toThrow('stdin broke');
    expect(printed()).not.toContain(i18n.t('cli.update.orphanConfirmInterrupted'));
  });

  it('has English and Korean texts that say "move to a backup", never "delete"; the prompt defaults to N', async () => {
    const keys = [
      'cli.update.orphanConfirmHeader',
      'cli.update.orphanConfirmPrompt',
      'cli.update.orphanConfirmDeclined',
      'cli.update.orphanConfirmInterrupted',
      'cli.update.yesOption',
    ];
    const params = { count: '1', path: '/p', backup: BACKUP };
    const english = keys.map((key) => i18n.t(key, params));
    let korean: string[] = [];
    try {
      await initI18n('ko');
      korean = keys.map((key) => i18n.t(key, params));
    } finally {
      await initI18n('en');
    }
    expect(english[0]).toContain('/p');
    expect(english[0]).toContain(BACKUP);
    expect(english[1]).toContain('[y/N]');
    expect(english[2]).toContain('--yes');
    expect(english[3]).toContain('--yes');
    expect(korean[0]).toContain(BACKUP);
    // The backup is inside the project root, not outside it.
    expect(english[0]).toContain('a backup folder at the project root');
    expect(english[0]).not.toMatch(/out of the project|outside the project/i);
    expect(korean[0]).toContain('프로젝트 루트의 백업 폴더');
    expect(korean[0]).not.toMatch(/프로젝트 밖|프로젝트 외부/);
    expect(korean[1]).toContain('[y/N]');
    expect(korean[1]).toContain('하세요');
    expect(korean[2]).toContain('--yes');
    expect(korean[3]).toContain('--yes');
    // #1938 L7: how to keep the files and stop being asked.
    for (const text of [english[2], english[3], korean[2], korean[3]]) {
      expect(text).toContain("'preserveFiles'");
      expect(text).toContain('.omcustomrc.json');
    }
    for (const [index, key] of keys.entries()) {
      expect(korean[index]).not.toBe(key);
      expect(korean[index]).not.toBe(english[index]);
      expect(english[index]).not.toMatch(/remov|delet/i);
      expect(english[index]).toMatch(/backup/);
      expect(korean[index]).not.toMatch(/삭제|제거/);
      expect(korean[index]).toContain('백업');
    }
  });
});

describe('updateCommand orphan confirmation (real update)', () => {
  let project: string;
  let registryDir: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let answer: string;
  let interrupt: boolean;
  const spies: Array<ReturnType<typeof spyOn>> = [];
  let questionSpy: ReturnType<typeof spyOn>;
  let checkboxSpy: ReturnType<typeof spyOn>;
  let findProjectsSpy: ReturnType<typeof spyOn>;

  async function exists(path: string): Promise<boolean> {
    try {
      await lstat(join(project, path));
      return true;
    } catch {
      return false;
    }
  }

  /** The leftover's copy in the run's backup, or null when there is no backup. */
  async function backedUpLeftover(): Promise<string | null> {
    const roots = (await readdir(project)).filter((name) => name.startsWith('.omcustom-backup-'));
    if (roots.length === 0) return null;
    expect(roots).toHaveLength(1);
    return readFile(join(project, roots[0] ?? '', 'retired', LEFTOVER), 'utf8');
  }

  const logged = (): string[] =>
    (console.log as unknown as ReturnType<typeof spyOn>).mock.calls.map((call: unknown[]) =>
      String(call[0])
    );

  async function lockOwnsLeftover(): Promise<boolean> {
    const lock = JSON.parse(await readFile(join(project, '.omcustom.lock.json'), 'utf8')) as {
      files: Record<string, unknown>;
    };
    return Object.hasOwn(lock.files, LEFTOVER);
  }

  /** Old install whose lock owns one unmodified retired guide. */
  async function seed(): Promise<void> {
    const config = getDefaultConfig();
    config.version = '0.1.0';
    await saveConfig(project, config);
    await mkdir(dirname(join(project, LEFTOVER)), { recursive: true });
    await writeFile(join(project, LEFTOVER), SHIPPED);
    await writeFile(
      join(project, '.omcustom.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        generatorVersion: '0.1.0',
        templateVersion: '0.1.0',
        generatedAt: '2025-01-01T00:00:00.000Z',
        files: {
          [LEFTOVER]: { templateHash: sha256(SHIPPED), size: 1, component: 'guides' },
        },
      })
    );
  }

  const run = (options: UpdateCommandOptions): Promise<void> =>
    updateCommand({ skipSelf: true, guides: true, ...options }, noVersionCheck);

  beforeEach(async () => {
    project = await realpath(await mkdtemp(join(tmpdir(), 'omcustom-orphan-confirm-')));
    registryDir = join(project, '.registry');
    await mkdir(registryDir, { recursive: true });
    await writeFile(join(registryDir, 'projects.json'), '{"projects":{}}');
    registry._setRegistryDirForTesting(registryDir);
    await seed();

    originalCwd = process.cwd();
    process.chdir(project);
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as typeof process.exit;

    answer = 'y';
    interrupt = false;
    // A terminal interface: answers `answer`, or emits SIGINT (Ctrl+C) when `interrupt` is set.
    questionSpy = spyOn(readline, 'createInterface').mockImplementation((() => {
      const listeners: Record<string, () => void> = {};
      return {
        question: () => {
          if (!interrupt) return Promise.resolve(answer);
          listeners.SIGINT?.();
          return new Promise<string>(() => {});
        },
        once: (event: string, listener: () => void) => {
          listeners[event] = listener;
        },
        close: () => {
          listeners.close?.();
        },
      };
    }) as unknown as typeof readline.createInterface);
    findProjectsSpy = spyOn(projectsModule, 'findProjects').mockResolvedValue([]);
    checkboxSpy = spyOn(inquirer, 'checkbox').mockResolvedValue([] as never);
    spies.push(
      questionSpy,
      findProjectsSpy,
      checkboxSpy,
      spyOn(retiredModule, 'loadRetiredTemplatePaths').mockResolvedValue([
        { path: LEFTOVER, sha256: [sha256(SHIPPED)] },
      ]),
      spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden')),
      spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('external synchronous command forbidden');
      }),
      spyOn(codexInstaller, 'isCodexInstalled').mockReturnValue(true),
      spyOn(codexInstaller, 'installCodex').mockReturnValue(false),
      spyOn(console, 'log').mockImplementation(() => {}),
      spyOn(console, 'info').mockImplementation(() => {}),
      spyOn(console, 'warn').mockImplementation(() => {}),
      spyOn(console, 'error').mockImplementation(() => {}),
      spyOn(console, 'debug').mockImplementation(() => {})
    );
  });

  afterEach(async () => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    registry._setRegistryDirForTesting(undefined);
    process.exit = originalExit;
    process.chdir(originalCwd);
    await rm(project, { recursive: true, force: true });
  });

  it("asks on a terminal; 'y' moves the leftover to the backup and says how to restore", async () => {
    answer = 'y';
    await run({});

    expect(questionSpy).toHaveBeenCalledTimes(1);
    expect(await exists(LEFTOVER)).toBe(false);
    expect(await backedUpLeftover()).toBe(SHIPPED);
    expect(await lockOwnsLeftover()).toBe(false);
    const header = logged().find((line) => line.startsWith(`${project}: 1 file(s)`)) ?? '';
    expect(header).toMatch(/\.omcustom-backup-[^/]+\/retired\)/);
    expect(logged()).toContain(i18n.t('cli.update.orphansRestoreHint'));
    expect(logged().some((line) => line.startsWith('Moved 1 file(s)'))).toBe(true);
  });

  for (const declined of ['', 'n']) {
    it(`asks on a terminal; ${JSON.stringify(declined)} keeps the leftover and its ownership, said once`, async () => {
      answer = declined;
      await run({});

      expect(questionSpy).toHaveBeenCalledTimes(1);
      expect(await readFile(join(project, LEFTOVER), 'utf8')).toBe(SHIPPED);
      expect(await backedUpLeftover()).toBeNull();
      expect(await lockOwnsLeftover()).toBe(true);
      // One consolidated message (#1938-1): no per-file warning, not in the "delete" list.
      const declinedLines = logged().filter(
        (line) => line === i18n.t('cli.update.orphanConfirmDeclined')
      );
      expect(declinedLines).toHaveLength(1);
      const warned: string[] = (console.warn as unknown as ReturnType<typeof spyOn>).mock.calls.map(
        (call: unknown[]) => String(call[0])
      );
      expect(warned.some((line) => line.includes(LEFTOVER))).toBe(false);
      expect(logged().some((line) => line.startsWith('Kept 1 file(s)'))).toBe(false);
      expect(logged().filter((line) => line === `  - ${LEFTOVER}`)).toHaveLength(1);
    });
  }

  it('Ctrl+C keeps the leftover, says so, ends the prompt line, and the update goes on (review L1/L2)', async () => {
    interrupt = true;
    const written: string[] = [];
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    spies.push(writeSpy);
    await run({});

    expect(questionSpy).toHaveBeenCalledTimes(1);
    expect(written).toContain('\n');
    expect(await readFile(join(project, LEFTOVER), 'utf8')).toBe(SHIPPED);
    expect(await backedUpLeftover()).toBeNull();
    expect(await lockOwnsLeftover()).toBe(true);
    expect(logged()).toContain(i18n.t('cli.update.orphanConfirmInterrupted'));
    expect(logged()).not.toContain(i18n.t('cli.update.orphanConfirmDeclined'));
    expect(logged()).toContain(i18n.t('cli.update.summary', { updated: '1', skipped: '0' }));
    const warned: string[] = (console.warn as unknown as ReturnType<typeof spyOn>).mock.calls.map(
      (call: unknown[]) => String(call[0])
    );
    expect(warned.some((line) => line.includes(LEFTOVER))).toBe(false);
  });

  it('--yes moves without asking', async () => {
    answer = 'n';
    await run({ yes: true });

    expect(questionSpy).not.toHaveBeenCalled();
    expect(await exists(LEFTOVER)).toBe(false);
  });

  it('without a terminal moves without asking', async () => {
    answer = 'n';
    setTty(process.stdin, false);
    await run({});

    expect(questionSpy).not.toHaveBeenCalled();
    expect(await exists(LEFTOVER)).toBe(false);
  });

  it('in CI moves without asking', async () => {
    answer = 'n';
    process.env.CI = 'true';
    await run({});

    expect(questionSpy).not.toHaveBeenCalled();
    expect(await exists(LEFTOVER)).toBe(false);
  });

  it('--dry-run does not ask, keeps the leftover and creates no backup', async () => {
    answer = 'y';
    await run({ dryRun: true });

    expect(questionSpy).not.toHaveBeenCalled();
    expect(await exists(LEFTOVER)).toBe(true);
    expect(await backedUpLeftover()).toBeNull();
    expect(console.log).toHaveBeenCalledWith(
      i18n.t('cli.update.orphansWouldMove', {
        count: '1',
        path: '.omcustom-backup-<timestamp>/retired',
      })
    );
  });

  it('--all moves without asking, and prints the backup', async () => {
    answer = 'n';
    findProjectsSpy.mockResolvedValue([
      {
        name: 'project',
        path: project,
        version: '0.1.0',
        installedAt: null,
        updatedAt: null,
        status: 'outdated',
        detectionMethod: 'registry',
      },
    ]);
    await run({ all: true });

    expect(questionSpy).not.toHaveBeenCalled();
    expect(await exists(LEFTOVER)).toBe(false);
    expect(await backedUpLeftover()).toBe(SHIPPED);
    const roots = (await readdir(project)).filter((name) => name.startsWith('.omcustom-backup-'));
    expect(console.log).toHaveBeenCalledWith(
      i18n.t('cli.update.orphansMoved', {
        count: '1',
        path: join(project, roots[0] ?? '', 'retired'),
      })
    );
    expect(console.log).toHaveBeenCalledWith(i18n.t('cli.update.orphansRestoreHint'));
  });

  it('interactive mode asks for each selected project', async () => {
    answer = 'n';
    const other = { name: 'other', path: join(project, 'missing'), version: '0.1.0' };
    findProjectsSpy.mockResolvedValue(
      [{ name: 'project', path: project, version: '0.1.0' }, other].map((entry) => ({
        ...entry,
        installedAt: null,
        updatedAt: null,
        status: 'outdated' as const,
        detectionMethod: 'registry' as const,
      }))
    );
    checkboxSpy.mockResolvedValue([project] as never);
    await run({});

    expect(checkboxSpy).toHaveBeenCalledTimes(1);
    expect(questionSpy).toHaveBeenCalledTimes(1);
    expect(await exists(LEFTOVER)).toBe(true);
    expect(await lockOwnsLeftover()).toBe(true);
  });
});

describe('package entry', () => {
  it('re-exports the OrphanRemovalConfirmation type next to UpdateOptions', async () => {
    const confirm: PublicConfirmation = createOrphanRemovalPrompt('/p', async () => 'n');
    expect(typeof confirm).toBe('function');
    const source = await readFile(join(import.meta.dir, '../../../src/index.ts'), 'utf8');
    const end = source.indexOf("} from './core/updater.js';");
    const block = source.slice(source.lastIndexOf('export {', end), end);
    expect(block).toMatch(/\btype OrphanRemovalConfirmation,/);
    expect(block).toMatch(/\btype OrphanRemovalContext,/);
    expect(block).toMatch(/\btype UpdateOptions,/);
  });
});

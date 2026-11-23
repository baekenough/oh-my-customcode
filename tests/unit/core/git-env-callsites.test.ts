import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ensureBackupGitignore } from '../../../src/core/backup-layout.js';
import {
  detectGitWorkflow,
  type GitWorkflowResult,
  isGitRepo,
} from '../../../src/core/git-workflow.js';

/**
 * #1983: every production git call site that inspects a target directory ignores the git
 * location variables a parent git process (a hook, or `git -c k=v …`) exports. The call sites in
 * this file keep env-injected configuration (strip set: location only), so an env-supplied
 * `safe.directory` still opens a foreign-owned repository; lockfile drops it too.
 *
 * Each test plants a decoy in process.env and checks two things. First, the same git command,
 * run without sanitizing, gives a different answer under that decoy (so the decoy really works).
 * Second, the production function's result does not change.
 *
 * Variables are covered per call site only where they were measured to change that git command
 * (git 2.52.0, macOS). Measured to have no effect, and so not covered:
 * - `rev-parse --is-inside-work-tree`: GIT_INDEX_FILE, GIT_COMMON_DIR, GIT_PREFIX, and
 *   core.bare=true / core.worktree=<dir> injected through GIT_CONFIG_PARAMETERS or
 *   GIT_CONFIG_COUNT. GIT_WORK_TREE=<elsewhere> makes it print `false`, but it still exits 0, and
 *   backup-layout's gate checks only the exit status, so the gate's result does not change.
 * - `check-ignore -v --no-index`: GIT_INDEX_FILE, GIT_PREFIX, GIT_WORK_TREE.
 * - execGit's commands (`rev-parse`, `symbolic-ref`, `branch [-r] --format`): GIT_INDEX_FILE,
 *   GIT_PREFIX, GIT_COMMON_DIR (also with remote refs and origin/HEAD in the decoy), and injected
 *   core.bare / core.worktree.
 *
 * The fixtures' own git calls drop every GIT_* variable, and HOME and XDG_CONFIG_HOME point at an
 * empty directory, so the user's ~/.config/git/ignore cannot change a result. GIT_CONFIG_GLOBAL is
 * set to /dev/null and GIT_CONFIG_NOSYSTEM to 1 for the same reason.
 */

const GIT_WORKFLOW_MODULE = resolve(import.meta.dir, '../../../src/core/git-workflow.ts');

let savedEnv: Record<string, string | undefined>;
let scratch: string;

beforeEach(() => {
  savedEnv = { ...process.env };
  scratch = mkdtempSync(join(tmpdir(), 'omcustom-git-env-callsites-'));
  const home = join(scratch, 'home');
  mkdirSync(home);
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('GIT_')) {
      delete process.env[key];
    }
  }
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = home;
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
});

/** process.env without any GIT_* variable, plus a fixed empty global/system config. */
function fixtureEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) {
      env[key] = value;
    }
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
}

/** Build fixtures: never affected by the decoys planted in process.env. */
function fixtureGit(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env: fixtureEnv(), encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

/**
 * The same git command a call site runs, but with the current process.env passed as is (the
 * explicit copy makes Bun's synchronous spawn see runtime changes): the effect check for a decoy.
 */
function unsanitizedGit(cwd: string, ...args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      env: { ...process.env },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: stdout.trim() };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string };
    return { status: e.status ?? -1, stdout: (e.stdout ?? '').trim() };
  }
}

function makeDir(...parts: string[]): string {
  const dir = join(scratch, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A repository with one commit on `main`. */
function makeRepo(name: string): string {
  const dir = makeDir(name);
  fixtureGit(dir, 'init', '-q', '-b', 'main');
  fixtureGit(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

/** Another repository whose info/exclude un-ignores `.omcustom-backup-1/`, on branch `decoymain`. */
function makeDecoyRepo(): string {
  const dir = makeDir('decoy');
  fixtureGit(dir, 'init', '-q', '-b', 'decoymain');
  fixtureGit(dir, 'commit', '-q', '--allow-empty', '-m', 'decoy');
  writeFileSync(join(dir, '.git', 'info', 'exclude'), '!.omcustom-backup-1/\n');
  return dir;
}

/** An excludes file that un-ignores `.omcustom-backup-1/`. */
function makeNegatingExcludes(): string {
  const path = join(scratch, 'negating-excludes');
  writeFileSync(path, '!.omcustom-backup-1/\n');
  return path;
}

function plant(bait: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(bait)) {
    process.env[key] = value;
  }
}

describe('backup-layout git() rev-parse gate ignores inherited git variables (#1983)', () => {
  it('ignores an inherited GIT_DIR: a directory outside any repository gets no .gitignore', async () => {
    const target = makeDir('plain');
    mkdirSync(join(target, '.omcustom-backup-1'));
    const decoy = makeDecoyRepo();
    expect(unsanitizedGit(target, 'rev-parse', '--is-inside-work-tree').status).not.toBe(0);

    plant({ GIT_DIR: join(decoy, '.git') });
    expect(unsanitizedGit(target, 'rev-parse', '--is-inside-work-tree')).toEqual({
      status: 0,
      stdout: 'true',
    });

    expect(await ensureBackupGitignore(target)).toBe(false);
    expect(existsSync(join(target, '.gitignore'))).toBe(false);
  });
});

describe('backup-layout ignoreStatus check-ignore ignores inherited git variables (#1983)', () => {
  type Bait = (decoy: string, excludes: string) => Record<string, string>;
  const locationBaits: ReadonlyArray<{ name: string; bait: Bait }> = [
    { name: 'GIT_DIR', bait: (decoy) => ({ GIT_DIR: join(decoy, '.git') }) },
    { name: 'GIT_COMMON_DIR', bait: (decoy) => ({ GIT_COMMON_DIR: join(decoy, '.git') }) },
  ];
  const configBaits: ReadonlyArray<{ name: string; bait: Bait }> = [
    {
      name: 'GIT_CONFIG_PARAMETERS',
      bait: (_decoy, excludes) => ({ GIT_CONFIG_PARAMETERS: `'core.excludesfile'='${excludes}'` }),
    },
    {
      name: 'GIT_CONFIG_COUNT/KEY_0/VALUE_0',
      bait: (_decoy, excludes) => ({
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.excludesFile',
        GIT_CONFIG_VALUE_0: excludes,
      }),
    },
  ];

  /** Plant the bait and check that it really brings in the negation for plain git. */
  function plantNegation(target: string, bait: Bait): void {
    const checkIgnore = ['check-ignore', '-v', '--no-index', '--', '.omcustom-backup-1'];
    expect(unsanitizedGit(target, ...checkIgnore).status).toBe(1);

    plant(bait(makeDecoyRepo(), makeNegatingExcludes()));
    const baited = unsanitizedGit(target, ...checkIgnore);
    expect(baited.status).toBe(0);
    expect(baited.stdout).toContain('!.omcustom-backup-1/');
  }

  for (const { name, bait } of locationBaits) {
    it(`ignores a negation that only an inherited ${name} brings in`, async () => {
      const target = makeRepo('target');
      mkdirSync(join(target, '.omcustom-backup-1'));
      plantNegation(target, bait);

      expect(await ensureBackupGitignore(target)).toBe(true);
      expect(readFileSync(join(target, '.gitignore'), 'utf-8')).toContain('.omcustom-backup-*/');
    });
  }

  // Kept on purpose, as at a5018576: dropping injected config also drops an env-supplied
  // safe.directory (see the foreign-owner tests below).
  for (const { name, bait } of configBaits) {
    it(`keeps a negation that core.excludesFile injected through ${name} brings in`, async () => {
      const target = makeRepo('target');
      mkdirSync(join(target, '.omcustom-backup-1'));
      plantNegation(target, bait);

      expect(await ensureBackupGitignore(target)).toBe(false);
      expect(existsSync(join(target, '.gitignore'))).toBe(false);
    });
  }

  it('still honours a negation in the global excludes named by GIT_CONFIG_GLOBAL (kept)', async () => {
    const target = makeRepo('target');
    mkdirSync(join(target, '.omcustom-backup-1'));
    const globalConfig = join(scratch, 'global-gitconfig');
    writeFileSync(globalConfig, `[core]\n\texcludesFile = ${makeNegatingExcludes()}\n`);

    process.env.GIT_CONFIG_GLOBAL = globalConfig;

    expect(await ensureBackupGitignore(target)).toBe(false);
    expect(existsSync(join(target, '.gitignore'))).toBe(false);
  });

  it('negative pair: with an empty GIT_CONFIG_GLOBAL the same layout gets the pattern', async () => {
    const target = makeRepo('target');
    mkdirSync(join(target, '.omcustom-backup-1'));

    expect(await ensureBackupGitignore(target)).toBe(true);
    expect(readFileSync(join(target, '.gitignore'), 'utf-8')).toContain('.omcustom-backup-*/');
  });
});

describe('git-workflow execGit ignores inherited git variables (#1983)', () => {
  const expected: GitWorkflowResult = {
    type: 'git-flow',
    defaultBranch: 'main',
    hasDevelop: true,
    branchPatterns: ['feature/*'],
  };
  const sanitizedBranches = 'develop\nfeature/a\nmain';

  function makeFlowRepo(): string {
    const repo = makeRepo('flow');
    fixtureGit(repo, 'branch', 'develop');
    fixtureGit(repo, 'branch', 'feature/a');
    return repo;
  }

  it('detects the fixture without any decoy', () => {
    expect(detectGitWorkflow(makeFlowRepo())).toEqual(expected);
  });

  const columnBaits: ReadonlyArray<{ name: string; bait: Record<string, string> }> = [
    { name: 'GIT_CONFIG_PARAMETERS', bait: { GIT_CONFIG_PARAMETERS: "'column.ui'='always'" } },
    {
      name: 'GIT_CONFIG_COUNT/KEY_0/VALUE_0',
      bait: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'column.ui', GIT_CONFIG_VALUE_0: 'always' },
    },
  ];

  // Injected config reaches execGit (strip set: location only); `--no-column` on both branch
  // listings is what keeps one branch per line here.
  for (const { name, bait } of columnBaits) {
    it(`ignores column.ui=always injected through ${name}`, () => {
      const repo = makeFlowRepo();
      const listBranches = ['branch', '--format=%(refname:short)'];
      expect(unsanitizedGit(repo, ...listBranches).stdout).toBe(sanitizedBranches);

      plant(bait);
      // One line instead of one branch per line: develop is no longer found
      expect(unsanitizedGit(repo, ...listBranches).stdout).not.toBe(sanitizedBranches);

      expect(detectGitWorkflow(repo)).toEqual(expected);
    });
  }

  function writeColumnAlwaysGlobal(): string {
    const path = join(scratch, 'column-gitconfig');
    writeFileSync(path, '[column]\n\tui = always\n');
    return path;
  }

  it('ignores column.ui=always from the global config (local branch listing)', () => {
    const repo = makeFlowRepo();
    const listBranches = ['branch', '--format=%(refname:short)'];

    process.env.GIT_CONFIG_GLOBAL = writeColumnAlwaysGlobal();
    expect(unsanitizedGit(repo, ...listBranches).stdout).not.toBe(sanitizedBranches);

    expect(detectGitWorkflow(repo)).toEqual(expected);
  });

  it('ignores column.ui=always from the global config (remote branch listing)', () => {
    const upstream = makeFlowRepo();
    const clone = join(scratch, 'clone');
    fixtureGit(scratch, 'clone', '-q', upstream, clone);
    // develop and feature/a exist only as origin/* in the clone
    expect(fixtureGit(clone, 'branch', '--format=%(refname:short)').trim()).toBe('main');
    const listRemote = ['branch', '-r', '--format=%(refname:short)'];
    const sanitizedRemote = unsanitizedGit(clone, ...listRemote).stdout;
    expect(sanitizedRemote.split('\n')).toContain('origin/develop');

    process.env.GIT_CONFIG_GLOBAL = writeColumnAlwaysGlobal();
    expect(unsanitizedGit(clone, ...listRemote).stdout).not.toBe(sanitizedRemote);

    expect(detectGitWorkflow(clone)).toEqual(expected);
  });

  it('ignores an inherited GIT_DIR that points at another repository', () => {
    const repo = makeFlowRepo();
    const decoy = makeDecoyRepo();

    plant({ GIT_DIR: join(decoy, '.git') });
    expect(unsanitizedGit(repo, 'symbolic-ref', '--short', 'HEAD').stdout).toBe('decoymain');

    expect(detectGitWorkflow(repo)).toEqual(expected);
  });

  it('ignores an inherited GIT_WORK_TREE outside the repository', () => {
    const repo = makeFlowRepo();

    plant({ GIT_WORK_TREE: makeDir('elsewhere') });
    expect(unsanitizedGit(repo, 'rev-parse', '--is-inside-work-tree').stdout).toBe('false');

    expect(isGitRepo(repo)).toBe(true);
    expect(detectGitWorkflow(repo)).toEqual(expected);
  });

  it('ignores decoys present when the process starts (as under a git hook)', () => {
    const repo = makeFlowRepo();
    const decoy = makeDecoyRepo();
    // Bun's synchronous spawn without an `env` option passes the start-up environment, not runtime
    // changes to process.env, so this case needs a fresh process that starts with the decoys.
    const startupEnv: NodeJS.ProcessEnv = {
      ...fixtureEnv(),
      GIT_DIR: join(decoy, '.git'),
      GIT_CONFIG_PARAMETERS: "'column.ui'='always'",
      OMCUSTOM_TEST_MODULE: GIT_WORKFLOW_MODULE,
      OMCUSTOM_TEST_REPO: repo,
    };
    const baited = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: repo,
      env: startupEnv,
      encoding: 'utf-8',
    });
    expect(baited.trim()).toBe('decoymain');

    const output = execFileSync(
      process.execPath,
      [
        '-e',
        'const m = await import(process.env.OMCUSTOM_TEST_MODULE); ' +
          'console.log(JSON.stringify(m.detectGitWorkflow(process.env.OMCUSTOM_TEST_REPO)));',
      ],
      { cwd: scratch, env: startupEnv, encoding: 'utf-8' }
    );

    expect(JSON.parse(output.trim())).toEqual(expected);
  });
});

describe('env-supplied safe.directory still opens a foreign-owned repository (#1983)', () => {
  // GIT_TEST_ASSUME_DIFFERENT_OWNER=1 makes git treat every repository as foreign-owned.
  const safeDirectoryBaits: ReadonlyArray<{ name: string; bait: Record<string, string> }> = [
    { name: 'GIT_CONFIG_PARAMETERS', bait: { GIT_CONFIG_PARAMETERS: "'safe.directory'='*'" } },
    {
      name: 'GIT_CONFIG_COUNT/KEY_0/VALUE_0',
      bait: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' },
    },
  ];

  /** Simulate foreign ownership, check it really blocks git, then plant safe.directory. */
  function plantForeignOwnerWithSafeDirectory(repo: string, bait: Record<string, string>): void {
    plant({ GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' });
    expect(unsanitizedGit(repo, 'rev-parse', '--is-inside-work-tree').status).toBe(128);
    plant(bait);
    expect(unsanitizedGit(repo, 'rev-parse', '--is-inside-work-tree')).toEqual({
      status: 0,
      stdout: 'true',
    });
  }

  for (const { name, bait } of safeDirectoryBaits) {
    it(`detectGitWorkflow and isGitRepo see the repository (${name})`, () => {
      const repo = makeRepo('flow');
      fixtureGit(repo, 'branch', 'develop');
      fixtureGit(repo, 'branch', 'feature/a');
      plantForeignOwnerWithSafeDirectory(repo, bait);

      expect(isGitRepo(repo)).toBe(true);
      expect(detectGitWorkflow(repo)).toEqual({
        type: 'git-flow',
        defaultBranch: 'main',
        hasDevelop: true,
        branchPatterns: ['feature/*'],
      });
    });

    it(`ensureBackupGitignore passes the gate and adds the pattern (${name})`, async () => {
      const target = makeRepo('target');
      mkdirSync(join(target, '.omcustom-backup-1'));
      plantForeignOwnerWithSafeDirectory(target, bait);

      expect(await ensureBackupGitignore(target)).toBe(true);
      expect(readFileSync(join(target, '.gitignore'), 'utf-8')).toContain('.omcustom-backup-*/');
    });

    it(`ensureBackupGitignore still honours a .git/info/exclude negation (${name})`, async () => {
      const target = makeRepo('target');
      mkdirSync(join(target, '.omcustom-backup-1'));
      writeFileSync(join(target, '.git', 'info', 'exclude'), '!.omcustom-backup-1/\n');
      plantForeignOwnerWithSafeDirectory(target, bait);

      expect(await ensureBackupGitignore(target)).toBe(false);
      expect(existsSync(join(target, '.gitignore'))).toBe(false);
    });
  }
});

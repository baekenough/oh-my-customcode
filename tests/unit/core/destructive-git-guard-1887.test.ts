/**
 * #1887 A2: destructive-git-guard.sh left boundary, git global options and the fail-closed tier.
 *
 * Safety: the guard and the frozen oracle only ever receive command STRINGS (the guard through the
 * hook's stdin JSON, the oracle as lines of a text file). No git command is executed.
 *
 * State: the guard hardcodes /tmp/.claude-destructive-git-guard-$PPID and the threshold marker dir
 * /tmp/.claude-destructive-git-threshold-$PPID. $PPID is this bun process, so a file-level
 * beforeEach/afterEach removes exactly those two paths for process.pid around EVERY test in this
 * file (per-test reset; never a glob over other sessions' files), and afterAll removes them once more.
 *
 * Test seam: DESTRUCTIVE_GIT_GUARD_UNDER_TEST points the suite at a scratch mutant copy of the
 * script (mutation proof); it is unset in normal runs.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SOURCE_SCRIPT = join(REPO_ROOT, '.claude/hooks/scripts/destructive-git-guard.sh');
const MIRROR_SCRIPT = join(REPO_ROOT, 'templates/.claude/hooks/scripts/destructive-git-guard.sh');
const GUARD = process.env.DESTRUCTIVE_GIT_GUARD_UNDER_TEST ?? SOURCE_SCRIPT;

const STATE_PATHS = [
  `/tmp/.claude-destructive-git-guard-${process.pid}`,
  `/tmp/.claude-destructive-git-threshold-${process.pid}`,
];

const WORK_DIR = mkdtempSync(join(tmpdir(), 'omcc-dgg-1887-'));

function removeOwnState(): void {
  for (const path of STATE_PATHS) {
    rmSync(path, { recursive: true, force: true });
  }
}

// #1917 F10: per-test reset at file level. Every suite (1-7) shares this pid's two state paths, so
// without it a count or threshold marker written by one test leaks into the next.
beforeEach(() => {
  removeOwnState();
});

afterEach(() => {
  removeOwnState();
});

afterAll(() => {
  removeOwnState();
  rmSync(WORK_DIR, { recursive: true, force: true });
});

interface GuardResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly warned: boolean;
  /** The label inside "detected '<label>' in Bash command", or '' when silent. */
  readonly label: string;
  readonly context: string;
}

/**
 * ignoreSigpipe: start the guard through `sh -c 'trap "" PIPE; exec bash <guard>'`, so bash inherits
 * SIGPIPE as ignored (the launch condition under which `grep -q` made printf write to stderr).
 */
function runGuard(command: string, ignoreSigpipe = false): Promise<GuardResult> {
  return new Promise((resolvePromise) => {
    const [file, args] = ignoreSigpipe
      ? ['sh', ['-c', 'trap "" PIPE; exec bash "$0"', GUARD]]
      : ['bash', [GUARD]];
    const child = spawn(file as string, args as string[], {
      env: { ...process.env, HOME: WORK_DIR },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      let context = '';
      if (stdout.trim() !== '') {
        const parsed = JSON.parse(stdout) as {
          hookSpecificOutput?: { additionalContext?: string };
        };
        context = parsed.hookSpecificOutput?.additionalContext ?? '';
      }
      const labelMatch = /detected '([^']*)' in Bash command/.exec(context);
      resolvePromise({
        stdout,
        stderr,
        exitCode: code ?? -1,
        warned: stdout.trim() !== '',
        label: labelMatch?.[1] ?? '',
        context,
      });
    });
    child.stdin.end(JSON.stringify({ tool: 'Bash', tool_input: { command } }));
  });
}

async function runMany(commands: readonly string[], concurrency = 8): Promise<GuardResult[]> {
  const results: GuardResult[] = new Array(commands.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < commands.length) {
      const index = next++;
      results[index] = await runGuard(commands[index] as string);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, commands.length) }, worker));
  return results;
}

const RESET = 'git reset --hard';
const CLEAN = 'git clean';
const RESTORE = 'git restore';
const CHECKOUT = 'git checkout -- .';
const BRANCH = 'git branch -D';

type Fixture = readonly [command: string, label: string];

async function expectWarns(fixtures: readonly Fixture[]): Promise<void> {
  const results = await runMany(fixtures.map(([command]) => command));
  const bad = fixtures
    .map(([command, label], index) => ({ command, label, got: results[index] as GuardResult }))
    .filter(({ label, got }) => !got.warned || got.label !== label || got.exitCode !== 0);
  expect(bad.map((b) => `${b.command} => expected '${b.label}', got '${b.got.label}'`)).toEqual([]);
  for (const result of results) {
    expect(result.stderr).toBe('');
  }
}

async function expectSilent(commands: readonly string[]): Promise<void> {
  const results = await runMany(commands);
  const bad = commands
    .map((command, index) => ({ command, got: results[index] as GuardResult }))
    .filter(({ got }) => got.warned || got.exitCode !== 0 || got.stderr !== '');
  expect(bad.map((b) => `${b.command} => '${b.got.label}'`)).toEqual([]);
}

// -------------------------------------------------------------------
// Frozen oracle: the five branch regexes of destructive-git-guard.sh as of b20c66d4, copied
// verbatim from `git show b20c66d4:.claude/hooks/scripts/destructive-git-guard.sh` (bash
// expansion of GIT_PFX and each double-quoted branch pattern, written out here as the strings
// grep -E receives). Do NOT edit: the differential test below is only meaningful while frozen.
// -------------------------------------------------------------------

const OLD_GIT_PFX = `(^|[;&|[:space:]])git([[:space:]]+(-C[[:space:]]+("[^"]*"|'[^']*'|[^[:space:]]+)|-c[[:space:]]+[^[:space:]]+))*[[:space:]]+`;

const OLD_BRANCHES: ReadonlyArray<{ readonly label: string; readonly regex: string }> = [
  { label: RESET, regex: `${OLD_GIT_PFX}reset[[:space:]]+--hard([[:space:]]|$)` },
  {
    label: CLEAN,
    regex: `${OLD_GIT_PFX}clean[[:space:]]+([^;&|]*[[:space:]])?(-[A-Za-z]*f[A-Za-z]*|--force)([[:space:]]|$)`,
  },
  {
    label: RESTORE,
    regex: `${OLD_GIT_PFX}${String.raw`restore([[:space:]]+--[^;&|[:space:]]+)*([[:space:]]+(\.|\*|/|--worktree|--staged))*([[:space:]]|$)`}`,
  },
  {
    label: CHECKOUT,
    regex: `${OLD_GIT_PFX}${String.raw`checkout[[:space:]]+--[[:space:]]+(\.|\*|/)([[:space:]]|$)`}`,
  },
  { label: BRANCH, regex: `${OLD_GIT_PFX}branch[[:space:]]+-D([[:space:]]|$)` },
];

/**
 * Old behaviour on one command STRING: the label of the first branch (in script order) whose regex
 * matches any line, or '' for silent. The script pipes `printf '%s\n' "$command_text"` to grep, so
 * a command containing newlines matches when any one of its lines does; the oracle works on the
 * flattened lines of all items in one grep run per branch.
 */
function oldOracle(commands: readonly string[]): string[] {
  const owner: number[] = [];
  const lines: string[] = [];
  commands.forEach((command, index) => {
    for (const line of command.split('\n')) {
      lines.push(line);
      owner.push(index);
    }
  });
  const file = join(WORK_DIR, 'oracle-lines.txt');
  writeFileSync(file, `${lines.join('\n')}\n`);
  const labels: string[] = new Array(commands.length).fill('');
  for (const { label, regex } of OLD_BRANCHES) {
    const run = spawnSync('grep', ['-En', '-e', regex, file], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      maxBuffer: 64 * 1024 * 1024,
    });
    // grep exits 1 for "no match" and 2 for an error (e.g. a regex it rejects).
    expect([0, 1]).toContain(run.status as number);
    for (const hit of run.stdout.split('\n')) {
      const separator = hit.indexOf(':');
      if (separator < 0) continue;
      const item = owner[Number(hit.slice(0, separator)) - 1] as number;
      if (labels[item] === '') labels[item] = label;
    }
  }
  return labels;
}

// -------------------------------------------------------------------
// 1. Differential corpus: every command the OLD guard warned on, the NEW guard warns on.
// -------------------------------------------------------------------

/** Intentionally empty: any entry needs a one-line justification of why old=warn may become silent. */
const DIFFERENTIAL_EXCEPTIONS: ReadonlyArray<{
  readonly command: string;
  readonly reason: string;
}> = [];

const BOUNDARIES: ReadonlyArray<readonly [string, string]> = [
  ['^', ''],
  [';', 'true; '],
  [';nospace', 'true;'],
  ['&&', 'true && '],
  ['&&nospace', 'true&&'],
  ['|', 'cat x | '],
  ['|nospace', 'cat x|'],
  ['space', 'echo '],
  ['tab', 'echo\t'],
  ['newline', 'echo\n'],
];

const OPTION_SETS: readonly string[] = [
  '',
  '-C /p ',
  '-C "/a b" ',
  "-C '/a b' ",
  '-c k=v ',
  '-C /p -c k=v ',
  '-c k=v -C "/a b" ',
  '-c a=b -c c=d ',
  "-C '/a b' -C /q ",
  '-C\t/p\t',
  '-c\tk=v\t-C\t"/a b"\t',
];

const VARIANTS: readonly string[] = [
  'reset --hard',
  'reset --hard HEAD~1',
  'reset --hard;',
  'reset --soft',
  'clean -f',
  'clean -df',
  'clean -xdf',
  'clean -fdX',
  'clean --force',
  'clean -ffdx',
  'clean -nf',
  'clean -n',
  'clean --dry-run',
  'restore .',
  'restore --staged f',
  'restore file.txt',
  'restore --source=HEAD f',
  'restore --worktree --staged .',
  'checkout -- .',
  'checkout -- *',
  'checkout -- /',
  'checkout -- ./',
  'checkout -- file.txt',
  'branch -D x',
  'branch -D',
  'branch -d x',
];

function buildCorpus(): string[] {
  const corpus: string[] = [];
  for (const [, prefix] of BOUNDARIES) {
    for (const options of OPTION_SETS) {
      for (const variant of VARIANTS) {
        corpus.push(`${prefix}git ${options}${variant}`);
      }
    }
  }
  return corpus;
}

describe('1. differential corpus: old=warn implies new=warn (frozen b20c66d4 oracle)', () => {
  const corpus = buildCorpus();
  const oldLabels = oldOracle(corpus);
  const matchedIndexes = corpus.flatMap((_, index) => (oldLabels[index] === '' ? [] : [index]));

  it('builds a non-trivial corpus and the oracle matches a large part of it', () => {
    console.log(
      `[#1887 A2] corpus size=${corpus.length} old-matched=${matchedIndexes.length} exceptions=${DIFFERENTIAL_EXCEPTIONS.length}`
    );
    expect(new Set(corpus).size).toBe(corpus.length);
    expect(corpus.length).toBeGreaterThanOrEqual(2000);
    expect(matchedIndexes.length).toBeGreaterThanOrEqual(1500);
    expect(DIFFERENTIAL_EXCEPTIONS).toEqual([]);
  });

  it('oracle sanity: known old verdicts (including the old gaps)', () => {
    const [warnReset, noPath, noPager, subshell, soft] = oldOracle([
      'git reset --hard',
      '/usr/bin/git reset --hard',
      'git --no-pager reset --hard',
      '(git reset --hard)',
      'git reset --soft',
    ]);
    expect([warnReset, noPath, noPager, subshell, soft]).toEqual([RESET, '', '', '', '']);
  });

  it('every old-matched command warns in the new guard with the same label, exit 0, no stderr', async () => {
    const exceptions = new Set(DIFFERENTIAL_EXCEPTIONS.map((e) => e.command));
    const targets = matchedIndexes.filter((index) => !exceptions.has(corpus[index] as string));
    const results = await runMany(targets.map((index) => corpus[index] as string));
    const failures = targets.flatMap((index, position) => {
      const got = results[position] as GuardResult;
      const want = oldLabels[index] as string;
      const problems: string[] = [];
      if (!got.warned) problems.push('silent');
      else if (got.label !== want) problems.push(`label '${got.label}' != old '${want}'`);
      if (got.exitCode !== 0) problems.push(`exit ${got.exitCode}`);
      if (got.stderr !== '') problems.push('stderr non-empty');
      return problems.length === 0
        ? []
        : [`${JSON.stringify(corpus[index])}: ${problems.join(', ')}`];
    });
    expect(failures).toEqual([]);
  }, 240_000);
});

// -------------------------------------------------------------------
// 2. Formerly silent forms now warn (left boundary + global options)
// -------------------------------------------------------------------

describe('2. formerly silent forms now warn', () => {
  it('the three forms from the defect report', async () => {
    await expectWarns([
      ['/usr/bin/git reset --hard', RESET],
      ['git --no-pager reset --hard', RESET],
      ['(git reset --hard)', RESET],
    ]);
  });

  // #1917 F10: placed right after a test that fires the guard (and so writes the state file). The
  // file-level beforeEach must have removed that state; the positive control proves the guard writes
  // exactly these paths, so "absent at test start" cannot pass through a path typo.
  it('state paths are absent at test start (per-test reset), and a firing recreates them', async () => {
    for (const path of STATE_PATHS) {
      expect(existsSync(path)).toBe(false);
    }
    const fired = await runGuard('git reset --hard');
    expect(fired.label).toBe(RESET);
    expect(existsSync(STATE_PATHS[0] as string)).toBe(true);
  });

  // The test above cannot tell the file-level beforeEach from the file-level afterEach (either one
  // alone leaves the paths absent at the next test start). Here state is seeded by a beforeAll that
  // runs BEFORE this suite's first beforeEach, so only the file-level beforeEach can remove it.
  describe('a state seed present before the first test of a suite', () => {
    beforeAll(() => {
      writeFileSync(STATE_PATHS[0] as string, '2026-01-01T00:00:00Z git clean tier=1\n');
      mkdirSync(STATE_PATHS[1] as string, { recursive: true });
    });

    it('is removed by the file-level beforeEach before the test body runs', () => {
      for (const path of STATE_PATHS) {
        expect(existsSync(path)).toBe(false);
      }
    });
  });

  it('left boundary "/" (path-qualified binary)', async () => {
    await expectWarns([
      ['/usr/bin/git reset --hard', RESET],
      ['/opt/homebrew/bin/git clean -fd', CLEAN],
      ['true && /usr/bin/git branch -D x', BRANCH],
      ['./git checkout -- .', CHECKOUT],
    ]);
  });

  it('left boundary "(" (subshell and command substitution)', async () => {
    await expectWarns([
      ['(git reset --hard)', RESET],
      ['echo $(git clean -fd)', CLEAN],
      ['x=$(git branch -D old)', BRANCH],
      ['(cd /repo && git checkout -- .)', CHECKOUT],
    ]);
  });

  it('left boundary backtick (legacy command substitution)', async () => {
    await expectWarns([
      ['echo `git reset --hard`', RESET],
      ['`git clean -fd`', CLEAN],
      ['x=`git branch -D old`', BRANCH],
    ]);
  });

  it('left boundary quotes (sh -c "git ..." / ssh host \'git ...\') with a closing-quote right edge', async () => {
    await expectWarns([
      ['sh -c "git reset --hard"', RESET],
      ["sh -c 'git clean -fd'", CLEAN],
      ["ssh host 'git branch -D x'", BRANCH],
      ['bash -c "git checkout -- ."', CHECKOUT],
    ]);
  });

  it('right edge: ) backtick ; & | end the last token', async () => {
    await expectWarns([
      ['git reset --hard;echo done', RESET],
      ['git clean -fd&&true', CLEAN],
      ['git branch -D x|cat', BRANCH],
      ['(git restore .)', RESTORE],
    ]);
  });

  it('global option group: flags without a value', async () => {
    await expectWarns([
      ['git --no-pager reset --hard', RESET],
      ['git --paginate clean -fd', CLEAN],
      ['git -p restore .', RESTORE],
      ['git -P checkout -- .', CHECKOUT],
      ['git --bare branch -D x', BRANCH],
      ['git --no-replace-objects reset --hard', RESET],
      ['git --literal-pathspecs clean -f', CLEAN],
      ['git --no-optional-locks --no-pager reset --hard', RESET],
      ['git -P -p --paginate reset --hard', RESET],
    ]);
  });

  it('global option group: =value and space-separated value forms', async () => {
    await expectWarns([
      ['git --git-dir=/x/.git reset --hard', RESET],
      ['git --work-tree=/y clean -fd', CLEAN],
      ['git --namespace=ns branch -D x', BRANCH],
      ['git --git-dir /x/.git --work-tree /y reset --hard', RESET],
      ['git --namespace ns restore .', RESTORE],
      ['git --git-dir=/x --work-tree=/y -C /z -c k=v --no-pager reset --hard', RESET],
    ]);
  });

  // The next three fixtures put ; & | inside an option value. Tier 2 stops scanning at ; & |, so
  // only the modelled (tier 1) option group can see them: they pin that group on its own.
  it('tier 1 option group alone: flags before a quoted ;/&/| value', async () => {
    await expectWarns([
      ['git --no-pager -C "/a;b" reset --hard', RESET],
      ['git -p -C "/a;b" reset --hard', RESET],
      ['git -P -c "k=a;b" clean -fd', CLEAN],
      ['git --bare -C "/a&b" branch -D x', BRANCH],
    ]);
  });

  it('tier 1 option group alone: --git-dir/--work-tree values containing ;/&/|', async () => {
    await expectWarns([
      ['git --git-dir="/a;b" reset --hard', RESET],
      ['git --git-dir "/a;b" reset --hard', RESET],
      ['git --work-tree "/p&q" clean -fd', CLEAN],
      ["git --namespace '/n|m' branch -D x", BRANCH],
    ]);
  });

  it('quoted -c value with spaces', async () => {
    await expectWarns([
      ['git -c "user.name=A B" reset --hard', RESET],
      ["git -c 'user.name=A B' clean -fd", CLEAN],
      // ; inside the quoted value: tier 2 cannot see past it, so this pins the quoted -c form itself.
      ['git -c "k=a; b" reset --hard', RESET],
      ["git -c 'k=a | b' clean -fd", CLEAN],
    ]);
  });
});

// -------------------------------------------------------------------
// 3. Fail-closed tier 2 (forms the option grammar cannot model)
// -------------------------------------------------------------------

describe('3. fail-closed tier 2', () => {
  it('git reset --hard: variable, quoted subcommand, unknown flag with a bare value, reordered flag', async () => {
    await expectWarns([
      ['git $OPT reset --hard', RESET],
      ['git "reset" --hard', RESET],
      ["git 'reset' --hard", RESET],
      ['git -x reset --hard', RESET],
      ['git --unknown-flag reset --hard', RESET],
      ['git --unknown-flag value reset --hard', RESET],
      ['git reset HEAD~1 --hard', RESET],
      ['git "reset" HEAD~1 --hard', RESET],
    ]);
  });

  it('git clean with force: variable, quoted subcommand, unknown flag with a bare value', async () => {
    await expectWarns([
      ['git $OPT clean -fd', CLEAN],
      ['git "clean" -fd', CLEAN],
      ['git --unknown-flag value clean --force', CLEAN],
      ['git "clean" -n -f', CLEAN],
    ]);
  });

  it('git restore: variable, quoted subcommand, option-like or quoted prefix tokens', async () => {
    await expectWarns([
      ['git $OPT restore .', RESTORE],
      ['git "restore" .', RESTORE],
      ["git 'restore' file.txt", RESTORE],
      ['git -x restore file.txt', RESTORE],
      ['git "$A" -z restore .', RESTORE],
    ]);
  });

  it('git checkout -- .: variable, quoted subcommand, revision before the --', async () => {
    await expectWarns([
      ['git $OPT checkout -- .', CHECKOUT],
      ['git "checkout" -- .', CHECKOUT],
      ['git --unknown-flag value checkout -- *', CHECKOUT],
      ['git checkout HEAD -- .', CHECKOUT],
    ]);
  });

  it('git branch -D: variable, quoted subcommand, unknown flag with a bare value', async () => {
    await expectWarns([
      ['git $OPT branch -D x', BRANCH],
      ['git "branch" -D x', BRANCH],
      ['git --unknown-flag value branch -D x', BRANCH],
    ]);
  });

  it('tier 2 keeps the branch deletion note, the advisory text and the exit-0 / no-stderr contract', async () => {
    for (const command of ['git "branch" -D x', '/usr/bin/git branch -D x', '(git branch -D x)']) {
      const result = await runGuard(command);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.context).toContain('DESTRUCTIVE GIT WARNING');
      expect(result.context).toContain('Advisory only (R021)');
      expect(result.context).toContain("Branch deletion note: prefer 'git branch -d' first");
    }
    const reset = await runGuard('git "reset" --hard');
    expect(reset.context).toContain('DESTRUCTIVE GIT WARNING');
    expect(reset.context).not.toContain('Branch deletion note');
    const parsed = JSON.parse(reset.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  });
});

// -------------------------------------------------------------------
// 4. Negatives stay silent
// -------------------------------------------------------------------

describe('4. negatives stay silent', () => {
  it('the required negatives', async () => {
    await expectSilent([
      'xgit reset --hard',
      'legit reset --hard',
      'git status --no-pager',
      'git reset --soft',
      'git branch -d x',
      'git checkout -- file.txt',
      'git clean -n',
      'git clean --dry-run',
      'git clean -nd',
      'echo "(git status)"',
    ]);
  });

  it('letters before git never count as a boundary (also with the new "/" "(" backtick edges)', async () => {
    await expectSilent([
      'xgit clean -fd',
      'legit branch -D x',
      'mygit checkout -- .',
      '/usr/bin/xgit reset --hard',
      '(legit reset --hard)',
      '`xgit reset --hard`',
    ]);
  });

  it('non-destructive git commands with global options stay silent', async () => {
    await expectSilent([
      'git --no-pager log --oneline',
      'git -C /repo status',
      'git --git-dir=/x/.git --work-tree=/y status',
      '/usr/bin/git status',
      '(git status)',
      'git -p diff',
      'git --no-pager branch -d old',
      'git --no-pager reset --soft HEAD~1',
      'git --no-pager clean -n',
      'git --no-pager checkout -- file.txt',
    ]);
  });

  it('tier 2 does not fire across ; & | or without the destructive flag', async () => {
    await expectSilent([
      'git status; echo reset --hard',
      'git status && echo clean -fd',
      'git log | grep branch -D',
      'git reset --soft; echo --hard',
      'git clean -n && echo -f',
      'git branch -d x; echo -D',
      'git checkout -- file.txt; echo -- .',
      'git "reset" --soft',
      'git "clean" -n',
      'git "branch" -d x',
      'git "checkout" -- file.txt',
      'git $OPT reset --mixed',
      'git $OPT clean --dry-run',
    ]);
  });

  it('git commit with a message mentioning restore stays silent (restricted restore tier 2)', async () => {
    await expectSilent(['git commit -m "restore x"', 'git log --grep restore']);
  });
});

// -------------------------------------------------------------------
// 5. Mirror parity
// -------------------------------------------------------------------

describe('5. source and template mirror are byte-identical', () => {
  it('md5 matches', () => {
    const md5 = (path: string) => createHash('md5').update(readFileSync(path)).digest('hex');
    expect(md5(MIRROR_SCRIPT)).toBe(md5(SOURCE_SCRIPT));
  });
});

// -------------------------------------------------------------------
// 6. SIGPIPE ignored at launch: an early match must not write to stderr
// -------------------------------------------------------------------

describe('6. SIGPIPE ignored: early match plus a >64 KB tail keeps stderr empty', () => {
  // Measured on the pre-fix script (bash 3.2.57, `grep -Eq` in has()): both commands below printed
  // "printf: write error: Broken pipe" to stderr under this launch; 300000 bytes exceeds the 64 KB pipe buffer.
  const TAIL = 'x'.repeat(300_000);

  it('tier 1 (modelled form) warns with the same label and empty stderr', async () => {
    const result = await runGuard(`git reset --hard\n${TAIL}`, true);
    expect(result.label).toBe(RESET);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('tier 2 (quoted subcommand) warns with the same label and empty stderr', async () => {
    const result = await runGuard(`git "reset" --hard\n${TAIL}`, true);
    expect(result.label).toBe(RESET);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });
});

// -------------------------------------------------------------------
// 7. Hostile environment: RLIMIT_FSIZE 0 (#1914 item 3)
// -------------------------------------------------------------------

describe('7. hostile environment: ulimit -f 0 keeps the guard fail-open and silent', () => {
  // Under `ulimit -f 0` the state write (`printf >> state file`) fails with EFBIG. With SIGXFSZ
  // ignored the shell survives, and a leaked unflushed printf buffer used to reach the count
  // substitution, so `[` printed "integer expression expected" on stderr. With SIGXFSZ left at its
  // default the kernel killed the shell (exit 153, advisory lost). Pipes are not limited by
  // RLIMIT_FSIZE, so stdout/stderr below are still captured. The only files written under the
  // limit are this pid's two exact state paths (STATE_PATHS), reset around every test by the
  // file-level beforeEach/afterEach.
  const HOSTILE_PRELUDES: ReadonlyArray<readonly [name: string, prelude: string]> = [
    ['SIGXFSZ ignored and ulimit -f 0', 'trap "" XFSZ; ulimit -f 0'],
    ['SIGXFSZ at its default and ulimit -f 0', 'ulimit -f 0'],
  ];
  const SEED_LINES =
    '2026-01-01T00:00:00Z git clean tier=1\n2026-01-01T00:00:01Z git restore tier=1\n';
  const THREE_TIER1_SEED_LINES = `${SEED_LINES}2026-01-01T00:00:02Z git branch -D tier=1\n`;

  function runHostile(
    prelude: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolvePromise) => {
      const child = spawn('sh', ['-c', `${prelude}; exec bash "$0"`, GUARD], {
        env: { ...process.env, HOME: WORK_DIR },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
      });
      child.stdin.end(JSON.stringify({ tool: 'Bash', tool_input: { command } }));
    });
  }

  /** The whole stdout must be one JSON document: a state line leaked into stdout would break the parse. */
  function expectCleanWarning(result: { stdout: string; stderr: string; exitCode: number }): void {
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('DESTRUCTIVE GIT WARNING');
  }

  for (const [name, prelude] of HOSTILE_PRELUDES) {
    it(`${name}, fresh state: exit 0, one JSON warning, empty stderr`, async () => {
      expectCleanWarning(await runHostile(prelude, 'git reset --hard HEAD~1'));
    });

    it(`${name}, pre-seeded state (2 lines): exit 0, one JSON warning, empty stderr`, async () => {
      writeFileSync(STATE_PATHS[0] as string, SEED_LINES);
      expectCleanWarning(await runHostile(prelude, 'git reset --hard HEAD~1'));
    });

    it(`${name}, tier-2 form: exit 0, one JSON warning, empty stderr`, async () => {
      expectCleanWarning(await runHostile(prelude, 'git "reset" --hard'));
    });

    // R0-1 L1: 3 tier-1 lines are pre-seeded, the 4th write fails. The count line must still say 3
    // (the count is the FIRST line of the substitution output; the sanitize step keeps it).
    it(`${name}, pre-seeded state (3 tier-1 lines): the count line still says 3`, async () => {
      writeFileSync(STATE_PATHS[0] as string, THREE_TIER1_SEED_LINES);
      const result = await runHostile(prelude, 'git reset --hard HEAD~1');
      expectCleanWarning(result);
      const context = (
        JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } }
      ).hookSpecificOutput.additionalContext;
      expect(context).toContain('3 this session');
    });
  }
});

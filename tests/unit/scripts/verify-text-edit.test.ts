/**
 * Tests for scripts/verify-text-edit.sh (#1911 P2).
 *
 * The script runs the three Korean 합쇼체 checks (family, line-final auxiliary, noun-ending, each
 * cross-checked by python3) and quote-verify in one command. The canonical specification stays in
 * auto-dev.yaml (implement step fixed constraint (a) and (c)); this file pins script == yaml:
 * the yaml's own grep patterns, python3 command and `# BEGIN quote-verify` block are extracted from
 * the runtime copy and must give the same verdicts as the script on the same inputs, and the
 * parity check is shown to fail on a mutated copy.
 *
 * External processes use Bun.spawnSync so a leaked mock.module('node:child_process') cannot
 * replace them. Temp paths come from mkdtempSync(join(tmpdir(), ...)).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-text-edit.sh');
const SCRIPT_TEXT = readFileSync(SCRIPT, 'utf8');

const AUTO_DEV_COPIES = [
  '.claude/skills/pipeline/workflows/auto-dev.yaml',
  'templates/.claude/skills/pipeline/workflows/auto-dev.yaml',
  'workflows/auto-dev.yaml',
  'templates/workflows/auto-dev.yaml',
] as const;
const AD = AUTO_DEV_COPIES[0];

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(
  cmd: string[],
  stdin = '',
  env: Record<string, string> = {},
  cwd: string = REPO_ROOT
): RunResult {
  // Strip every inherited GIT_* so child processes do not resolve from the parent's repo state.
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && value !== undefined) {
      inherited[key] = value;
    }
  }
  const proc = Bun.spawnSync(cmd, {
    cwd,
    stdin: Buffer.from(stdin),
    env: { ...inherited, ...env },
  });
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

interface Runner {
  name: string;
  argv: (script: string, args: string[]) => string[];
}

const RUNNERS: Runner[] = [
  { name: 'bash', argv: (s, a) => ['bash', s, ...a] },
  ...(existsSync('/bin/bash')
    ? [{ name: '/bin/bash', argv: (s: string, a: string[]) => ['/bin/bash', s, ...a] }]
    : []),
  ...(Bun.which('zsh')
    ? [
        {
          name: 'zsh -f -c "bash ..."',
          argv: (s: string, a: string[]) => ['zsh', '-f', '-c', 'bash "$@"', 'zsh-wrap', s, ...a],
        },
      ]
    : []),
];

function script(args: string[], stdin = '', env: Record<string, string> = {}, runner = RUNNERS[0]) {
  return run(runner.argv(SCRIPT, args), stdin, env);
}

// ---------------------------------------------------------------------------
// Fixtures. The original "6/6/4/4" sample sets documented in auto-dev.yaml are not in the repo
// (research D 1.2); these are the reconstructed sets with the documented counts.
// ---------------------------------------------------------------------------

const POS_PLAIN = ['확인한다.', '정정했다.', '이상하다', '없다', '로직을 따른다.', '있다'];
const NEG_HAP = [
  '확인했습니다.',
  '정정하겠습니다.',
  '이상합니다',
  '없습니다.',
  '따릅니다.',
  '있습니다',
];
const POS_NOUN = ['확인함', '정정 필요', '완료됨.', '검토 필요'];
const NEG_NOUN_HAP = ['확인했습니다.', '필요합니다.', '완료되었습니다.', '검토하겠습니다'];
// 3 family hits (따른다 / 했다 / 있다, each followed by a space) on ONE line; the line ends in a
// 합쇼체 verb, so the line-final and noun-ending counters stay 0.
const MULTI_HIT = '규칙을 따른다 그리고 했다 그리고 있다 라고 적었습니다';

interface Counts {
  fam: number;
  lf: number;
  noun: number;
}

function linesOf(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function parseGrep(stdout: string): Counts {
  const m = stdout.match(/\[korean\] family=(\d+) line-final=(\d+) noun-ending=(\d+) \(grep\)/);
  expect(m).not.toBeNull();
  return { fam: Number(m?.[1]), lf: Number(m?.[2]), noun: Number(m?.[3]) };
}

function parsePython(stdout: string): Counts {
  const m = stdout.match(/= (\d+) (\d+) (\d+) \(python3\)/);
  expect(m).not.toBeNull();
  return { fam: Number(m?.[1]), lf: Number(m?.[2]), noun: Number(m?.[3]) };
}

let dir = '';
let target = '';
const REAL1 = 'alpha real line';
const REAL2 = 'beta real line';
const FAKE = 'zzz fabricated quotation';

function tmpFile(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'verify-text-edit-'));
  target = join(dir, 'target.txt');
  writeFileSync(target, `${REAL1}\n${REAL2}\nother content\n`);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('script file', () => {
  test('is executable (owner bit) and has a bash shebang', () => {
    expect(statSync(SCRIPT).mode & 0o100).toBe(0o100);
    expect(SCRIPT_TEXT.startsWith('#!/usr/bin/env bash\n')).toBe(true);
  });

  test('header documents the four exit codes', () => {
    const header = SCRIPT_TEXT.split('\n').filter((l) => l.startsWith('#'));
    const joined = header.join('\n');
    expect(joined).toContain('# Exit codes:');
    for (const code of ['0 ', '1 ', '2 ', '3 ']) {
      expect(joined).toContain(`#   ${code}`);
    }
  });

  test('uses no bash-4-only constructs (code lines only)', () => {
    const code = SCRIPT_TEXT.split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/mapfile|readarray|declare -A|local -A/);
    expect(code).not.toMatch(/\$\{[A-Za-z_]+(,,|\^\^)\}/);
    expect(code).not.toContain('=~');
    expect(code).not.toMatch(/^\s*set -e/m);
    // POSIX grep only: no \s \d \b in any grep pattern (R005 #1760)
    expect(code).not.toMatch(/grep[^\n]*\\[sdb]/);
  });

  test('uses the -vcE form of the second line-final grep (BRE "?" is a literal)', () => {
    expect(SCRIPT_TEXT).toContain('grep -vcE');
    expect(SCRIPT_TEXT).not.toMatch(/grep -vc '/);
  });
});

// ---------------------------------------------------------------------------
describe('Korean checks via --stdin', () => {
  for (const runner of RUNNERS) {
    describe(runner.name, () => {
      test('6 반말/평서형 positive -> family 3, line-final 6, noun 0, rc 1', () => {
        const r = script(['--stdin'], linesOf(POS_PLAIN), {}, runner);
        expect(parseGrep(r.stdout)).toEqual({ fam: 3, lf: 6, noun: 0 });
        expect(parsePython(r.stdout)).toEqual({ fam: 3, lf: 6, noun: 0 });
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('[korean] FAIL');
      });

      test('6 합쇼체 negative -> 0/0/0, rc 0 (12/12 with the 6 positives)', () => {
        const r = script(['--stdin'], linesOf(NEG_HAP), {}, runner);
        expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
        expect(parsePython(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
        expect(r.code).toBe(0);
        expect(r.stderr).toBe('');
      });

      test('4 명사 종결 positive -> noun 4, rc 1', () => {
        const r = script(['--stdin'], linesOf(POS_NOUN), {}, runner);
        expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 4 });
        expect(parsePython(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 4 });
        expect(r.code).toBe(1);
      });

      test('4 합쇼체 negative -> 0/0/0, rc 0 (8/8 with the 4 positives)', () => {
        const r = script(['--stdin'], linesOf(NEG_NOUN_HAP), {}, runner);
        expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
        expect(r.code).toBe(0);
      });
    });
  }

  test('each check alone: family / line-final / noun-ending positives isolate their own counter', () => {
    const family = script(['--stdin'], linesOf(['규칙을 따른다 라고 적었습니다']));
    expect(parseGrep(family.stdout)).toEqual({ fam: 1, lf: 0, noun: 0 });
    expect(family.code).toBe(1);
    const lineFinal = script(['--stdin'], linesOf(['없다']));
    expect(parseGrep(lineFinal.stdout)).toEqual({ fam: 0, lf: 1, noun: 0 });
    expect(lineFinal.code).toBe(1);
    const noun = script(['--stdin'], linesOf(['확인함']));
    expect(parseGrep(noun.stdout)).toEqual({ fam: 0, lf: 0, noun: 1 });
    expect(noun.code).toBe(1);
  });

  // Counting unit: grep -c counts matching LINES, so python3 must count matching lines as well.
  // len(re.findall(...)) counted every hit and gave DISAGREE (rc 3) on a line with 2+ family hits.
  describe('counting unit: matching lines, not hits', () => {
    test('a line with 3 family hits -> grep 1, python3 1, rc 1 (FAIL), no DISAGREE', () => {
      const r = script(['--stdin'], linesOf([MULTI_HIT]));
      expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 0, noun: 0 });
      expect(parsePython(r.stdout)).toEqual({ fam: 1, lf: 0, noun: 0 });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('[korean] FAIL');
      expect(r.stderr).not.toContain('DISAGREE');
    });

    test('multi-hit and single-hit lines together: both count LINES (2), not hits (4)', () => {
      const r = script(['--stdin'], linesOf([MULTI_HIT, '확인한다 라고 적었습니다']));
      expect(parseGrep(r.stdout)).toEqual({ fam: 2, lf: 0, noun: 0 });
      expect(parsePython(r.stdout)).toEqual({ fam: 2, lf: 0, noun: 0 });
      expect(r.code).toBe(1);
      expect(r.stderr).not.toContain('DISAGREE');
    });

    test('a 합쇼체 line stays 0 for family (no hit, no DISAGREE, rc 0)', () => {
      const r = script(['--stdin'], linesOf(['확인했습니다 그리고 정정하겠습니다']));
      expect(parsePython(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
      expect(r.code).toBe(0);
    });

    // line-final / noun-ending end in a `$` anchor: at most one match per line, so a line with two
    // 다-endings or two 함-endings counts once in both tools (the [가설] of the defect report).
    test('line-final and noun-ending count a repeated ending once per line in both tools', () => {
      const lf = script(['--stdin'], linesOf(['정정했다 그리고 정정했다']));
      expect(parseGrep(lf.stdout).lf).toBe(1);
      expect(parsePython(lf.stdout).lf).toBe(1);
      expect(lf.stderr).not.toContain('DISAGREE');
      const noun = script(['--stdin'], linesOf(['확인함 그리고 확인함']));
      expect(parseGrep(noun.stdout)).toEqual({ fam: 0, lf: 0, noun: 1 });
      expect(parsePython(noun.stdout)).toEqual({ fam: 0, lf: 0, noun: 1 });
      expect(noun.stderr).not.toContain('DISAGREE');
    });

    // Existence counterpart: DISAGREE still fires when python3 really gives another value, so the
    // fixed unit does not turn the cross-check into a no-op (see also the shim tests below).
    test('a python3 that reports 3 hits for the multi-hit line still gives DISAGREE and rc 3', () => {
      const shim = join(dir, 'shim-hits');
      mkdirSync(shim, { recursive: true });
      const py = join(shim, 'python3');
      writeFileSync(py, '#!/bin/sh\ncat >/dev/null\necho "3 0 0"\n');
      chmodSync(py, 0o755);
      const r = script(['--stdin'], linesOf([MULTI_HIT]), {
        PATH: `${shim}:${process.env.PATH ?? ''}`,
      });
      expect(r.code).toBe(3);
      expect(r.stderr).toContain("[korean] DISAGREE: grep '1 0 0' vs python3 '3 0 0'");
    });
  });

  test('grep and python3 agree on all four sets, also under LC_ALL=C', () => {
    for (const set of [POS_PLAIN, NEG_HAP, POS_NOUN, NEG_NOUN_HAP]) {
      const envs: Record<string, string>[] = [{}, { LC_ALL: 'C' }];
      for (const env of envs) {
        const r = script(['--stdin'], linesOf(set), env);
        expect(parseGrep(r.stdout)).toEqual(parsePython(r.stdout));
        expect(r.code).not.toBe(3);
      }
    }
  });

  test('a leading "+" (diff added-line stream) gives the same counts as plain lines', () => {
    const plus = POS_PLAIN.map((l) => `+${l}`);
    const r = script(['--stdin'], linesOf(plus));
    expect(parseGrep(r.stdout)).toEqual({ fam: 3, lf: 6, noun: 0 });
  });

  test('BRE regression: the old BRE second grep flags all 6 합쇼체 negatives, the script gives 0', () => {
    const bre = run(
      ['bash', '-c', `command grep -E '다[.。"]?$' | command grep -vc '니다[.。"]?$'`],
      linesOf(NEG_HAP)
    );
    expect(bre.stdout.trim()).toBe('6');
    const ere = run(
      ['bash', '-c', `command grep -E '다[.。"]?$' | command grep -vcE '니다[.。"]?$'`],
      linesOf(NEG_HAP)
    );
    expect(ere.stdout.trim()).toBe('0');
    expect(parseGrep(script(['--stdin'], linesOf(NEG_HAP)).stdout).lf).toBe(0);
  });

  test('empty stdin -> rc 0 with a visible warning (no added lines)', () => {
    const r = script(['--stdin'], '');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[korean] added-lines=0');
    expect(r.stderr).toContain('no added lines');
  });

  test('a python3 that disagrees with grep -> rc 3 and DISAGREE message', () => {
    const shim = join(dir, 'shim');
    mkdirSync(shim, { recursive: true });
    const py = join(shim, 'python3');
    writeFileSync(py, '#!/bin/sh\ncat >/dev/null\necho "9 9 9"\n');
    chmodSync(py, 0o755);
    const r = script(['--stdin'], linesOf(NEG_HAP), { PATH: `${shim}:${process.env.PATH ?? ''}` });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('[korean] DISAGREE');
  });

  /** A python3 shim directory placed first on PATH; `body` is the shim's /bin/sh body. */
  function pythonShimEnv(name: string, body: string): Record<string, string> {
    const shim = join(dir, name);
    mkdirSync(shim, { recursive: true });
    const py = join(shim, 'python3');
    writeFileSync(py, `#!/bin/sh\ncat >/dev/null\n${body}\n`);
    chmodSync(py, 0o755);
    return { PATH: `${shim}:${process.env.PATH ?? ''}` };
  }

  // R0-1 L6: the disagreement case above uses a clean input, so it cannot see the precedence.
  test('disagreement AND a violation -> rc 3 (3 takes precedence over 1)', () => {
    const env = pythonShimEnv('shim-prec', 'echo "9 9 9"');
    const r = script(['--stdin'], linesOf(POS_PLAIN), env);
    expect(r.stderr).toContain('[korean] DISAGREE');
    expect(r.stderr).toContain('[korean] FAIL');
    expect(r.code).toBe(3);
  });

  // R0-1 L5: a python3 that is present but fails gives no check result -> rc 2, not 3.
  test('a python3 that exits 1 on a clean input -> rc 2 and a python3-failed message, not rc 3', () => {
    const env = pythonShimEnv('shim-fail', 'exit 1');
    const r = script(['--stdin'], linesOf(NEG_HAP), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('python3 failed');
    expect(r.stderr).not.toContain('DISAGREE');
  });

  test('a python3 that exits 0 but prints nothing -> rc 2 as well', () => {
    const env = pythonShimEnv('shim-empty', 'exit 0');
    const r = script(['--stdin'], linesOf(NEG_HAP), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('python3 failed');
  });

  // R1-a A-1: both shims above print nothing, so the exit-status half of the check was unpinned.
  test('a python3 that prints "0 0 0" but exits 1 -> rc 2 and the python3-failed message', () => {
    const env = pythonShimEnv('shim-rc1', 'echo "0 0 0"\nexit 1');
    const r = script(['--stdin'], linesOf(NEG_HAP), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('python3 failed (exit 1)');
    expect(r.stderr).not.toContain('DISAGREE');
  });

  // R0-1 L5: the python3-missing check was not pinned (deleting it still passed every test).
  test('python3 not on PATH -> rc 2 and "python3 not found"', () => {
    const bin = join(dir, 'nopy-bin');
    mkdirSync(bin, { recursive: true });
    for (const tool of ['dirname', 'grep', 'cat', 'mktemp', 'rm', 'awk', 'git']) {
      const real = Bun.which(tool);
      if (real) {
        symlinkSync(real, join(bin, tool));
      }
    }
    expect(existsSync(join(bin, 'python3'))).toBe(false);
    const bash = Bun.which('bash') as string;
    const r = run([bash, SCRIPT, '--stdin'], linesOf(NEG_HAP), { PATH: bin });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('python3 not found');
  });
});

// ---------------------------------------------------------------------------
describe('quote mode', () => {
  for (const runner of RUNNERS) {
    describe(runner.name, () => {
      const q = (qf: string) => ['--quotes', qf, '--target', target];

      test('1. genuine quotations only -> rc 0, no Korean output', () => {
        const qf = tmpFile('q1.txt', `${REAL1}\n${REAL2}\n`);
        const r = script(q(qf), '', {}, runner);
        expect(r.code).toBe(0);
        expect(r.stdout).toBe(`1\t${REAL1}\n1\t${REAL2}\n`);
        expect(r.stderr).toBe('');
      });

      test('2. genuine + fabricated -> rc 1 with count 0 and FAIL', () => {
        const qf = tmpFile('q2.txt', `${REAL1}\n${FAKE}\n`);
        const r = script(q(qf), '', {}, runner);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain(`0\t${FAKE}`);
        expect(r.stderr).toContain('[quote-verify] FAIL');
      });

      test('3. fabricated + trailing blank line -> rc 1', () => {
        const qf = tmpFile('q3.txt', `${REAL1}\n${FAKE}\n\n`);
        const r = script(q(qf), '', {}, runner);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain(`0\t${FAKE}`);
      });

      test('4. empty quotation file -> rc 1 with HALT', () => {
        const qf = tmpFile('q4.txt', '');
        const r = script(q(qf), '', {}, runner);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('[quote-verify] HALT');
      });

      test('5. fabricated last line without trailing newline -> rc 1', () => {
        const qf = tmpFile('q5.txt', `${REAL1}\n${FAKE}`);
        const r = script(q(qf), '', {}, runner);
        expect(r.code).toBe(1);
        expect(r.stdout).toContain(`0\t${FAKE}`);
      });

      test('6. the caller continues after a failing run (echo after still runs)', () => {
        const qf = tmpFile('q6.txt', `${REAL1}\n${FAKE}\n`);
        const argv = runner.argv(SCRIPT, q(qf));
        const r = run(['bash', '-c', '"$@"; echo after', 'caller', ...argv]);
        expect(r.stderr).toContain('[quote-verify] FAIL');
        expect(r.stdout).toContain('after');
      });
    });
  }

  test('a quotation starting with "-" is searched as a fixed string, not as an option', () => {
    const t = tmpFile('dash-target.txt', '-x dashed line\n');
    const qf = tmpFile('dash-q.txt', '-x dashed line\n');
    const r = script(['--quotes', qf, '--target', t]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('1\t-x dashed line\n');
  });

  test('each quotation is checked separately: a combined grep -F -f would pass case 2', () => {
    const qf = tmpFile('q2c.txt', `${REAL1}\n${FAKE}\n`);
    expect(run(['grep', '-F', '-f', qf, target]).code).toBe(0);
    expect(script(['--quotes', qf, '--target', target]).code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('combined modes', () => {
  test('--stdin + --quotes: Korean violation fails even when quotations match', () => {
    const qf = tmpFile('c1.txt', `${REAL1}\n`);
    const r = script(['--stdin', '--quotes', qf, '--target', target], linesOf(POS_PLAIN));
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(`1\t${REAL1}`);
    expect(r.stdout).toContain('[korean] family=3');
  });

  test('--stdin + --quotes: failing quotation fails even when the Korean checks pass', () => {
    const qf = tmpFile('c2.txt', `${FAKE}\n`);
    const r = script(['--stdin', '--quotes', qf, '--target', target], linesOf(NEG_HAP));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('[quote-verify] FAIL');
    expect(r.stderr).not.toContain('[korean] FAIL');
  });

  test('--stdin + --quotes: both clean -> rc 0', () => {
    const qf = tmpFile('c3.txt', `${REAL2}\n`);
    const r = script(['--stdin', '--quotes', qf, '--target', target], linesOf(NEG_HAP));
    expect(r.code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('usage errors (rc 2)', () => {
  const qf = () => tmpFile('u-q.txt', `${REAL1}\n`);
  const cases: Array<[string, () => string[]]> = [
    ['no arguments', () => []],
    ['unknown flag', () => ['--bogus']],
    ['--quotes without --target', () => ['--quotes', qf()]],
    ['--target without --quotes', () => ['--target', target]],
    ['--stdin and --files together', () => ['--stdin', '--files', 'x']],
    ['--files without a file', () => ['--files']],
    ['--quotes without a value', () => ['--quotes']],
    ['missing quotation file', () => ['--quotes', join(dir, 'nope.txt'), '--target', target]],
    ['missing target file', () => ['--quotes', qf(), '--target', join(dir, 'nope.txt')]],
    ['missing --files path', () => ['--files', 'definitely/not/here.md']],
  ];
  for (const [name, args] of cases) {
    test(name, () => {
      const r = script(args());
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('verify-text-edit:');
    });
  }

  test('--help prints the usage text on stdout, rc 0', () => {
    const r = script(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage: verify-text-edit.sh');
    expect(r.stdout).toContain('Exit: 0 ok');
  });

  // R1-a A-2: the usage Exit line names the python3 case of exit 2 (the header is the full contract).
  test('--help names python3 missing or failing under exit 2', () => {
    const r = script(['--help']);
    expect(r.stdout).toMatch(/2 usage, missing file, or python3 missing or failing/);
  });

  // R-1 L-2: the usage line states what is compared (HEAD vs working tree), not "staged included".
  test('--help states HEAD vs working tree for --files and no longer claims "staged edits included"', () => {
    const r = script(['--help']);
    expect(r.stdout).toContain('HEAD vs working tree');
    expect(r.stdout).not.toContain('staged edits included');
  });
});

// ---------------------------------------------------------------------------
describe('--files on a temp git repository', () => {
  let repo = '';
  let repoHome = '';
  let repoScript = '';
  let seq = 0;

  const gitEnv = (): Record<string, string> => ({
    HOME: repoHome,
    XDG_CONFIG_HOME: join(repoHome, 'xdg'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  });

  function git(args: string[]): RunResult {
    return run(
      [
        'git',
        '-c',
        'user.name=Test User',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-C',
        repo,
        ...args,
      ],
      '',
      gitEnv()
    );
  }

  /** Commit `base` as docs/<name>, return the repo-relative path. */
  function commitFile(name: string, base: string): string {
    const rel = `docs/${name}`;
    writeFileSync(join(repo, rel), base);
    expect(git(['add', '--', rel]).code).toBe(0);
    expect(git(['commit', '-q', '-m', `add ${name}`]).code).toBe(0);
    return rel;
  }

  function verify(args: string[], cwd: string = tmpdir()): RunResult {
    return run(['bash', repoScript, ...args], '', gitEnv(), cwd);
  }

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'verify-text-edit-repo-'));
    repoHome = mkdtempSync(join(tmpdir(), 'verify-text-edit-home-'));
    mkdirSync(join(repoHome, 'xdg'), { recursive: true });
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(join(repo, 'docs'), { recursive: true });
    repoScript = join(repo, 'scripts', 'verify-text-edit.sh');
    copyFileSync(SCRIPT, repoScript);
    chmodSync(repoScript, 0o755);
    expect(git(['init', '-q']).code).toBe(0);
    // Korean paths appear raw (not octal-quoted) in diff headers, as on many Korean setups.
    expect(git(['config', 'core.quotepath', 'false']).code).toBe(0);
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(repoHome, { recursive: true, force: true });
  });

  function next(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}.md`;
  }

  test('added 합쇼체 line -> rc 0; the pre-existing 반말 line is not an added line', () => {
    const rel = commitFile(next('neg'), '기존 문장이다.\n');
    writeFileSync(join(repo, rel), '기존 문장이다.\n새 문장입니다.\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[korean] added-lines=1');
    expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
  });

  test('added 반말 line -> non-zero with family and line-final counted', () => {
    const rel = commitFile(next('pos'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장이다.\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(1);
    expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
    expect(r.stderr).toContain('[korean] FAIL');
  });

  test('added 명사 종결 line -> noun-ending counted', () => {
    const rel = commitFile(next('noun'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n정정 필요\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(1);
    expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 1 });
  });

  test('absolute and repo-relative paths give the same verdict, from any cwd', () => {
    const rel = commitFile(next('abs'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장이다.\n');
    const a = verify(['--files', rel], tmpdir());
    const b = verify(['--files', join(repo, rel)], tmpdir());
    const c = verify(['--files', rel], repo);
    expect(a.code).toBe(1);
    expect(b.stdout).toBe(a.stdout);
    expect(c.stdout).toBe(a.stdout);
  });

  test('several files are aggregated', () => {
    const r1 = commitFile(next('multi-a'), '기존입니다.\n');
    const r2 = commitFile(next('multi-b'), '기존입니다.\n');
    writeFileSync(join(repo, r1), '기존입니다.\n문장입니다.\n');
    writeFileSync(join(repo, r2), '기존입니다.\n문장이다.\n');
    const r = verify(['--files', r1, r2]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[korean] added-lines=2');
    expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
  });

  test('+++ header decision: a path ending in 필요 is not counted, the yaml (a) grep counts it', () => {
    const rel = commitFile('확인-필요', '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장입니다.\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(0);
    expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
    // The documented canonical command keeps `+++ b/docs/확인-필요` and counts it as a noun ending.
    const canonical = run(
      [
        'bash',
        '-c',
        `git -C "$1" diff -U0 -- "$2" | command grep '^+' | command grep -cE '(함|됨|필요)[.。"]?$'`,
        'canonical',
        repo,
        rel,
      ],
      '',
      gitEnv()
    );
    expect(canonical.stdout.trim()).toBe('1');
  });

  test('+++ header decision: an added content line that starts with "++ " is still checked', () => {
    const rel = commitFile(next('plusplus'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n++ 확인한다.\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(1);
    expect(parseGrep(r.stdout).fam).toBe(1);
  });

  test('untracked file is checked as fully added, with a warning', () => {
    const neg = `docs/${next('untracked-neg')}`;
    const pos = `docs/${next('untracked-pos')}`;
    writeFileSync(join(repo, neg), '새 문장입니다.\n');
    writeFileSync(join(repo, pos), '새 문장이다.\n');
    const rn = verify(['--files', neg]);
    expect(rn.code).toBe(0);
    expect(rn.stdout).toContain('[korean] added-lines=1');
    expect(rn.stderr).toContain('is untracked');
    const rp = verify(['--files', pos]);
    expect(rp.code).toBe(1);
    expect(parseGrep(rp.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
  });

  test('unchanged tracked file -> rc 0 with a no-added-lines warning', () => {
    const rel = commitFile(next('unchanged'), '기존 문장이다.\n');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[korean] added-lines=0');
    expect(r.stderr).toContain('no added lines');
  });

  // R0-1 L3: pathspec glob magic. `docs/[xy].md` is a file name here, not the glob x|y.
  /** Commit `base` as `rel` using literal pathspecs, so a `[..]` name cannot stage a sibling. */
  function commitLiteral(rel: string, base: string): void {
    writeFileSync(join(repo, rel), base);
    expect(git(['--literal-pathspecs', 'add', '--', rel]).code).toBe(0);
    expect(git(['commit', '-q', '-m', `add ${rel}`]).code).toBe(0);
  }

  test('an untracked "[xy].md" is not masked by a tracked, unchanged "x.md"', () => {
    commitLiteral('docs/x.md', '기존 문장입니다.\n');
    writeFileSync(join(repo, 'docs/[xy].md'), '정정했다.\n');
    const r = verify(['--files', 'docs/[xy].md']);
    expect(r.stderr).toContain('is untracked');
    expect(r.stdout).toContain('[korean] added-lines=1');
    expect(r.code).toBe(1);
    expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
  });

  test('a tracked, unchanged "[ab].md" does not take over the added lines of "a.md"', () => {
    commitLiteral('docs/a.md', '기존 문장입니다.\n');
    commitLiteral('docs/[ab].md', '기존 문장입니다.\n');
    writeFileSync(join(repo, 'docs/a.md'), '기존 문장입니다.\n새 문장이다.\n');
    const r = verify(['--files', 'docs/[ab].md']);
    expect(r.stdout).toContain('[korean] added-lines=0');
    expect(r.code).toBe(0);
  });

  // R0-1 L4: tracked files are compared against HEAD, so a staged-only edit is seen.
  test('a staged-only 반말 line (git add, no worktree change) -> rc 1', () => {
    const rel = commitFile(next('staged-pos'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장이다.\n');
    expect(git(['add', '--', rel]).code).toBe(0);
    expect(git(['diff', '--quiet', '--', rel]).code).toBe(0); // index == worktree: nothing unstaged
    const r = verify(['--files', rel]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[korean] added-lines=1');
    expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
    expect(r.stderr).not.toContain('no added lines');
  });

  test('a staged-only 합쇼체 line (git add) -> rc 0 with the line counted as added', () => {
    const rel = commitFile(next('staged-neg'), '기존 문장이다.\n');
    writeFileSync(join(repo, rel), '기존 문장이다.\n새 문장입니다.\n');
    expect(git(['add', '--', rel]).code).toBe(0);
    const r = verify(['--files', rel]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[korean] added-lines=1');
    expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
  });

  test('a staged line plus a further unstaged line are both checked', () => {
    const rel = commitFile(next('staged-mixed'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n첫 문장입니다.\n');
    expect(git(['add', '--', rel]).code).toBe(0);
    writeFileSync(join(repo, rel), '기존 문장입니다.\n첫 문장입니다.\n둘째 문장이다.\n');
    const r = verify(['--files', rel]);
    expect(r.stdout).toContain('[korean] added-lines=2');
    expect(r.code).toBe(1);
  });

  // R-1 L-2: the comparison is HEAD against the WORKING TREE, not against the index. A staged
  // version that the working tree later overwrote is not checked (documented in the script header).
  test('a staged 반말 line overwritten in the working tree is not checked (HEAD vs working tree)', () => {
    const rel = commitFile(next('staged-overwritten'), '기존 문장입니다.\n');
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장이다.\n');
    expect(git(['add', '--', rel]).code).toBe(0);
    writeFileSync(join(repo, rel), '기존 문장입니다.\n새 문장입니다.\n');
    // the index still holds the 반말 line that a plain `git commit` would record
    expect(git(['show', `:${rel}`]).stdout).toContain('새 문장이다.');
    const r = verify(['--files', rel]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[korean] added-lines=1');
    expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
  });

  // R-1 L-1: a `git mv`'d file is paired with its source, so the old content is not "added".
  describe('git mv', () => {
    const OLD_BODY = '기존 문장이다.\n둘째 기존이다.\n셋째 기존이다.\n넷째 기존이다.\n';

    function moved(prefix: string, body: string): string {
      const from = commitFile(next(prefix), OLD_BODY);
      const to = `docs/${next(`${prefix}-to`)}`;
      expect(git(['mv', '--', from, to]).code).toBe(0);
      writeFileSync(join(repo, to), body);
      return to;
    }

    test('rename only (content unchanged) -> added-lines=0, rc 0', () => {
      const to = moved('mv-same', OLD_BODY);
      const r = verify(['--files', to]);
      expect(r.stdout).toContain('[korean] added-lines=0');
      expect(r.code).toBe(0);
      expect(r.stderr).not.toContain('is untracked');
    });

    test('rename + one added 합쇼체 line -> only that line counts, rc 0', () => {
      const to = moved('mv-neg', `${OLD_BODY}새 문장입니다.\n`);
      const r = verify(['--files', to]);
      expect(r.stdout).toContain('[korean] added-lines=1');
      expect(r.code).toBe(0);
      expect(parseGrep(r.stdout)).toEqual({ fam: 0, lf: 0, noun: 0 });
    });

    test('rename + one added 반말 line -> exactly that line is flagged, rc 1', () => {
      const to = moved('mv-pos', `${OLD_BODY}새 문장이다.\n`);
      const r = verify(['--files', to]);
      expect(r.stdout).toContain('[korean] added-lines=1');
      expect(r.code).toBe(1);
      expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
    });

    test('the repo-relative and the absolute path give the same verdict', () => {
      const to = moved('mv-abs', `${OLD_BODY}새 문장입니다.\n`);
      const a = verify(['--files', to]);
      const b = verify(['--files', join(repo, to)]);
      expect(a.stdout).toContain('[korean] added-lines=1');
      expect(b.stdout).toBe(a.stdout);
    });

    test('a plain mv (not a rename for git) counts the new path as untracked, whole content', () => {
      const from = commitFile(next('mv-plain'), OLD_BODY);
      const to = `docs/${next('mv-plain-to')}`;
      renameSync(join(repo, from), join(repo, to));
      const r = verify(['--files', to]);
      expect(r.stderr).toContain('is untracked');
      expect(r.stdout).toContain('[korean] added-lines=4');
      expect(r.code).toBe(1);
    });

    // $ROOT (the script's parent) is a subdirectory of the repository here: --relative keeps the
    // rename source relative to $ROOT, like the given paths.
    test('works when the script lives in a subdirectory of the repository', () => {
      const sub = join(repo, 'pkg');
      mkdirSync(join(sub, 'scripts'), { recursive: true });
      mkdirSync(join(sub, 'docs'), { recursive: true });
      copyFileSync(SCRIPT, join(sub, 'scripts', 'verify-text-edit.sh'));
      writeFileSync(join(sub, 'docs', 'from.md'), OLD_BODY);
      expect(git(['add', '--', 'pkg']).code).toBe(0);
      expect(git(['commit', '-q', '-m', 'add pkg']).code).toBe(0);
      expect(git(['mv', '--', 'pkg/docs/from.md', 'pkg/docs/to.md']).code).toBe(0);
      const r = run(
        ['bash', join(sub, 'scripts', 'verify-text-edit.sh'), '--files', 'docs/to.md'],
        '',
        gitEnv(),
        tmpdir()
      );
      expect(r.stdout).toContain('[korean] added-lines=0');
      expect(r.code).toBe(0);
    });
  });

  // #1929 R-1 L-3 / R-1 L-4 / RR-1 Low-1 / RR-1 Low-2. Each case uses its own repository so that
  // corrupting an object or setting diff.renames=false cannot leak into the shared one above.
  describe('fail-closed git steps, inherited GIT_*, rename pairing (#1929)', () => {
    const OLD4 = '기존 첫째입니다.\n기존 둘째입니다.\n기존 셋째입니다.\n기존 넷째입니다.\n';
    const made: string[] = [];

    function gitIn(d: string, args: string[]): RunResult {
      return run(
        [
          'git',
          '-c',
          'user.name=Test User',
          '-c',
          'user.email=test@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-C',
          d,
          ...args,
        ],
        '',
        gitEnv()
      );
    }

    /** A fresh repository holding a copy of the tracked script (so ROOT is that repository). */
    function mkRepo(config: Record<string, string> = {}): string {
      const d = mkdtempSync(join(tmpdir(), 'verify-text-edit-iso-'));
      made.push(d);
      mkdirSync(join(d, 'scripts'), { recursive: true });
      mkdirSync(join(d, 'docs'), { recursive: true });
      copyFileSync(SCRIPT, join(d, 'scripts', 'verify-text-edit.sh'));
      expect(gitIn(d, ['init', '-q']).code).toBe(0);
      for (const [k, v] of Object.entries(config)) {
        expect(gitIn(d, ['config', k, v]).code).toBe(0);
      }
      return d;
    }

    function commitIn(d: string, rel: string, body: string): void {
      writeFileSync(join(d, rel), body);
      expect(gitIn(d, ['add', '--', rel]).code).toBe(0);
      expect(gitIn(d, ['commit', '-q', '-m', `add ${rel}`]).code).toBe(0);
    }

    /** A copy of the script inside the repository (ROOT stays that repository), mutated by `mutate`. */
    function mutatedIn(d: string, name: string, mutate: (text: string) => string): string {
      const mutated = mutate(SCRIPT_TEXT);
      expect(mutated).not.toBe(SCRIPT_TEXT);
      const p = join(d, 'scripts', `mut-${name}.sh`);
      writeFileSync(p, mutated);
      chmodSync(p, 0o755);
      return p;
    }

    function verifyIn(
      d: string,
      args: string[],
      env: Record<string, string> = {},
      scriptPath = join(d, 'scripts', 'verify-text-edit.sh')
    ): RunResult {
      return run(['bash', scriptPath, ...args], '', { ...gitEnv(), ...env }, tmpdir());
    }

    let shimSeq = 0;
    /** PATH prefix whose `git` fails (exit 128) for the step named by $VTE_FAIL, else runs the real git. */
    function gitShimPath(): string {
      const real = Bun.which('git');
      expect(real).not.toBeNull();
      shimSeq += 1;
      const d = join(dir, `git-shim-${shimSeq}`);
      mkdirSync(d, { recursive: true });
      const body = [
        '#!/bin/sh',
        'case "$*" in',
        '  *--no-index*) kind=noindex ;;',
        '  *--name-status*) kind=discovery ;;',
        '  *ls-files*" -z "*) kind=lsfiles ;;',
        '  *" -U0 "*) kind=main ;;',
        '  *) kind=other ;;',
        'esac',
        '[ "$kind" = "$VTE_FAIL" ] && exit 128',
        `exec ${real} "$@"`,
        '',
      ].join('\n');
      writeFileSync(join(d, 'git'), body);
      chmodSync(join(d, 'git'), 0o755);
      return `${d}:${process.env.PATH ?? ''}`;
    }

    afterAll(() => {
      for (const d of made) {
        rmSync(d, { recursive: true, force: true });
      }
    });

    // --- R-1 L-3: fail closed ---------------------------------------------------------------
    test('a HEAD blob that git cannot read -> rc 2 "no check result", not a pass (the same repo gives rc 1 before)', () => {
      const d = mkRepo();
      commitIn(d, 'docs/x.md', OLD4);
      writeFileSync(join(d, 'docs/x.md'), `${OLD4}새로 확인한다.\n`);
      const before = verifyIn(d, ['--files', 'docs/x.md']);
      expect(before.code).toBe(1);
      const blob = gitIn(d, ['rev-parse', 'HEAD:docs/x.md']).stdout.trim();
      const obj = join(d, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
      chmodSync(obj, 0o644);
      writeFileSync(obj, 'garbage');
      const after = verifyIn(d, ['--files', 'docs/x.md']);
      expect(after.code).toBe(2);
      expect(after.stderr).toContain('no check result');
      expect(after.stdout).not.toContain('[korean] added-lines=0');
    });

    const STEPS: Array<[string, string, string]> = [
      ['lsfiles', 'git ls-files failed', 'tracked'],
      ['discovery', 'git diff (rename discovery) failed', 'tracked'],
      ['main', 'git diff failed', 'tracked'],
      ['noindex', 'git diff --no-index failed', 'untracked'],
    ];
    for (const [kind, message, which] of STEPS) {
      test(`${kind}: a failing git step -> rc 2 with "${message}"; without the failure the same input gives rc 1`, () => {
        const d = mkRepo();
        commitIn(d, 'docs/t.md', OLD4);
        writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
        writeFileSync(join(d, 'docs/u.md'), '새 파일이다.\n');
        const file = which === 'tracked' ? 'docs/t.md' : 'docs/u.md';
        expect(verifyIn(d, ['--files', file]).code).toBe(1);
        const r = verifyIn(d, ['--files', file], { PATH: gitShimPath(), VTE_FAIL: kind });
        expect(r.code).toBe(2);
        expect(r.stderr).toContain(message);
        expect(r.stderr).toContain('no check result');
      });
    }

    test('an awk that fails -> rc 2 "awk failed"', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
      const shim = join(dir, 'awk-shim');
      mkdirSync(shim, { recursive: true });
      writeFileSync(join(shim, 'awk'), '#!/bin/sh\nexit 3\n');
      chmodSync(join(shim, 'awk'), 0o755);
      const r = verifyIn(d, ['--files', 'docs/t.md'], {
        PATH: `${shim}:${process.env.PATH ?? ''}`,
      });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('awk failed');
    });

    test('the one deliberate open path stays documented: an unchanged tracked file is rc 0 with a WARN', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      const r = verifyIn(d, ['--files', 'docs/t.md']);
      expect(r.code).toBe(0);
      expect(r.stderr).toContain('no added lines were checked');
      expect(SCRIPT_TEXT).toContain('Fail-closed policy');
    });

    test('mutation: dropping the "exit 2" of any git/awk step turns its fail-closed case red', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
      writeFileSync(join(d, 'docs/u.md'), '새 파일이다.\n');
      const cases: Array<[string, RegExp, string]> = [
        ['lsfiles', /(git ls-files failed - no check result" >&2;) exit 2;()/, 'docs/t.md'],
        ['discovery', /(rename discovery\) failed - no check result" >&2;) exit 2;()/, 'docs/t.md'],
        ['main', /(git diff failed - no check result" >&2;) exit 2;()/, 'docs/t.md'],
        ['noindex', /(- no check result" >&2;) exit 2;( \}\n {2}done)/, 'docs/u.md'],
      ];
      for (const [kind, re, file] of cases) {
        const p = mutatedIn(d, `exit2-${kind}`, (t) =>
          t.replace(re, (_m: string, a: string, b: string) => `${a}${b}`)
        );
        const r = verifyIn(d, ['--files', file], { PATH: gitShimPath(), VTE_FAIL: kind }, p);
        expect([kind, r.code, r.stderr]).not.toEqual([kind, 2, r.stderr]);
      }
    });

    // --- R-1 L-4: inherited GIT_* -----------------------------------------------------------
    test('an inherited GIT_INDEX_FILE (empty index) does not change the verdict: added-lines=1, rc 1, no untracked WARN', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
      const plain = verifyIn(d, ['--files', 'docs/t.md']);
      const hooked = verifyIn(d, ['--files', 'docs/t.md'], {
        GIT_INDEX_FILE: join(dir, 'no-such-index'),
      });
      expect(plain.stdout).toContain('[korean] added-lines=1');
      expect(hooked.stdout).toBe(plain.stdout);
      expect(hooked.code).toBe(1);
      expect(hooked.stderr).not.toContain('is untracked');
    });

    test('an inherited GIT_DIR of another repository does not redirect the git calls', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
      const decoy = mkRepo();
      commitIn(decoy, 'docs/other.md', '다른 저장소입니다.\n');
      const plain = verifyIn(d, ['--files', 'docs/t.md']);
      const hooked = verifyIn(d, ['--files', 'docs/t.md'], { GIT_DIR: join(decoy, '.git') });
      expect(hooked.stdout).toBe(plain.stdout);
      expect(hooked.code).toBe(plain.code);
      expect(plain.stdout).toContain('[korean] added-lines=1');
    });

    test('mutation: without the GIT_* unset loop both inherited-variable cases turn red', () => {
      const d = mkRepo();
      commitIn(d, 'docs/t.md', OLD4);
      writeFileSync(join(d, 'docs/t.md'), `${OLD4}새로 확인한다.\n`);
      const p = mutatedIn(d, 'noenvclear', (t) => t.replace('unset "$_v"', 'true'));
      const idx = verifyIn(
        d,
        ['--files', 'docs/t.md'],
        { GIT_INDEX_FILE: join(dir, 'no-such-index') },
        p
      );
      expect(idx.stdout).not.toContain('[korean] added-lines=1');
      const decoy = mkRepo();
      commitIn(decoy, 'docs/other.md', '다른 저장소입니다.\n');
      const gd = verifyIn(d, ['--files', 'docs/t.md'], { GIT_DIR: join(decoy, '.git') }, p);
      expect(gd.stdout).not.toContain('[korean] added-lines=1');
    });

    // --- RR-1 Low-2: the two -M flags -------------------------------------------------------
    // With git's default diff.renames=true the flags are redundant; only diff.renames=false makes
    // them load-bearing, so the rename cases run in a repository configured that way.
    describe('diff.renames=false (the -M flags are load-bearing)', () => {
      function renamed(d: string, body: string): string {
        commitIn(d, 'docs/from.md', OLD4);
        expect(gitIn(d, ['mv', '--', 'docs/from.md', 'docs/to.md']).code).toBe(0);
        writeFileSync(join(d, 'docs/to.md'), body);
        return 'docs/to.md';
      }

      test('rename + one added 합쇼체 line -> added-lines=1, rc 0, with the rename NOTE', () => {
        const d = mkRepo({ 'diff.renames': 'false' });
        const to = renamed(d, `${OLD4}새 문장입니다.\n`);
        const r = verifyIn(d, ['--files', to]);
        expect(r.stdout).toContain('[korean] added-lines=1');
        expect(r.code).toBe(0);
        expect(r.stderr).toContain('is compared against its rename source docs/from.md');
      });

      test('rename + one added 반말 line -> exactly that line is flagged, rc 1', () => {
        const d = mkRepo({ 'diff.renames': 'false' });
        const to = renamed(d, `${OLD4}새 문장이다.\n`);
        const r = verifyIn(d, ['--files', to]);
        expect(r.stdout).toContain('[korean] added-lines=1');
        expect(r.code).toBe(1);
      });

      test('M3 (main diff without -M) and M4 (discovery without -M) both turn it red: whole file counted', () => {
        const d = mkRepo({ 'diff.renames': 'false' });
        const to = renamed(d, `${OLD4}새 문장입니다.\n`);
        const m3 = mutatedIn(d, 'm3', (t) =>
          t.replace('--no-ext-diff -M -U0 "$base"', '--no-ext-diff -U0 "$base"')
        );
        const m4 = mutatedIn(d, 'm4', (t) =>
          t.replace('--no-ext-diff -M --relative', '--no-ext-diff --relative')
        );
        for (const p of [m3, m4]) {
          const r = verifyIn(d, ['--files', to], {}, p);
          expect(r.stdout).not.toContain('[korean] added-lines=1');
          expect(r.stdout).toContain('[korean] added-lines=5');
        }
      });
    });

    // --- RR-1 Low-1: rename partner ----------------------------------------------------------
    test('KNOWN LIMIT: a more similar deleted file becomes the partner; its lines are not checked, and the NOTE names it', () => {
      const d = mkRepo();
      commitIn(
        d,
        'docs/old.md',
        '원본 첫째입니다.\n원본 둘째입니다.\n원본 셋째입니다.\n원본 넷째입니다.\n'
      );
      commitIn(
        d,
        'docs/other.md',
        '남의 첫째입니다.\n남의 둘째입니다.\n복사된 반말이다.\n남의 넷째입니다.\n남의 다섯째입니다.\n남의 여섯째입니다.\n'
      );
      expect(gitIn(d, ['mv', '--', 'docs/old.md', 'docs/new.md']).code).toBe(0);
      expect(gitIn(d, ['rm', '-q', '--', 'docs/other.md']).code).toBe(0);
      writeFileSync(
        join(d, 'docs/new.md'),
        '남의 첫째입니다.\n남의 둘째입니다.\n복사된 반말이다.\n남의 넷째입니다.\n남의 다섯째입니다.\n원본 첫째입니다.\n'
      );
      const r = verifyIn(d, ['--files', 'docs/new.md']);
      expect(r.stderr).toContain('is compared against its rename source docs/other.md');
      expect(r.stdout).toContain('[korean] added-lines=1');
      expect(r.code).toBe(0); // the 반말 line "복사된 반말이다." is not checked: the documented limit
      expect(SCRIPT_TEXT).toContain('KNOWN LIMIT');
    });
  });

  // R0-1 L4: HEAD is unborn in a fresh repository -> the empty tree is the comparison base.
  describe('a repository with no commit yet', () => {
    let fresh = '';
    const freshGit = (args: string[]): RunResult =>
      run(['git', '-C', fresh, ...args], '', gitEnv(), fresh);
    const freshVerify = (args: string[]): RunResult =>
      run(['bash', join(fresh, 'scripts', 'verify-text-edit.sh'), ...args], '', gitEnv(), fresh);

    beforeAll(() => {
      fresh = mkdtempSync(join(tmpdir(), 'verify-text-edit-nocommit-'));
      mkdirSync(join(fresh, 'scripts'), { recursive: true });
      copyFileSync(SCRIPT, join(fresh, 'scripts', 'verify-text-edit.sh'));
      expect(freshGit(['init', '-q']).code).toBe(0);
      expect(freshGit(['rev-parse', '--verify', '-q', 'HEAD']).code).not.toBe(0); // unborn HEAD
    });

    afterAll(() => {
      rmSync(fresh, { recursive: true, force: true });
    });

    test('a staged 반말 file (not committed) -> rc 1, the whole content is added', () => {
      writeFileSync(join(fresh, 'nc-pos.md'), '첫 문장입니다.\n새 문장이다.\n');
      expect(freshGit(['add', '--', 'nc-pos.md']).code).toBe(0);
      const r = freshVerify(['--files', 'nc-pos.md']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('[korean] added-lines=2');
      expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
      expect(r.stderr).not.toContain('fatal');
    });

    test('a staged 합쇼체 file (not committed) -> rc 0, the whole content is added', () => {
      writeFileSync(join(fresh, 'nc-neg.md'), '첫 문장입니다.\n둘째 문장입니다.\n');
      expect(freshGit(['add', '--', 'nc-neg.md']).code).toBe(0);
      const r = freshVerify(['--files', 'nc-neg.md']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[korean] added-lines=2');
      expect(r.stderr).not.toContain('fatal');
    });

    test('an untracked file still works (whole content, with the warning)', () => {
      writeFileSync(join(fresh, 'nc-untracked.md'), '새 문장이다.\n');
      const r = freshVerify(['--files', 'nc-untracked.md']);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('is untracked');
    });
  });

  // R-1 L-5: the empty tree is derived with `git hash-object -t tree /dev/null`, so it follows the
  // repository's own object format. A hardcoded sha1 empty tree makes `git diff` fail here.
  describe('an unborn-HEAD repository with --object-format=sha256', () => {
    let sha = '';
    let initRc: number | null = null;
    let initErr = '';
    const shaGit = (args: string[]): RunResult =>
      run(['git', '-C', sha, ...args], '', gitEnv(), sha);

    beforeAll(() => {
      sha = mkdtempSync(join(tmpdir(), 'verify-text-edit-sha256-'));
      mkdirSync(join(sha, 'scripts'), { recursive: true });
      copyFileSync(SCRIPT, join(sha, 'scripts', 'verify-text-edit.sh'));
      const init = shaGit(['init', '-q', '--object-format=sha256']);
      initRc = init.code;
      initErr = init.stderr;
    });

    afterAll(() => {
      rmSync(sha, { recursive: true, force: true });
    });

    test('a staged 반말 file -> rc 1, added-lines=2 (the sha256 empty tree is the base)', () => {
      if (initRc !== 0) {
        // Reported skip: this git refuses sha256 repositories (needs git >= 2.29).
        console.log(
          `SKIPPED sha256 empty-tree test: git init --object-format=sha256 rc=${initRc}: ${initErr.trim()}`
        );
        return;
      }
      expect(shaGit(['rev-parse', '--verify', '-q', 'HEAD']).code).not.toBe(0); // unborn HEAD
      // precondition: this repository really hashes with sha256 (64 hex digits, not 40)
      expect(shaGit(['hash-object', '-t', 'tree', '/dev/null']).stdout.trim()).toMatch(
        /^[0-9a-f]{64}$/
      );
      writeFileSync(join(sha, 'nc-sha.md'), '첫 문장입니다.\n새 문장이다.\n');
      expect(shaGit(['add', '--', 'nc-sha.md']).code).toBe(0);
      const r = run(
        ['bash', join(sha, 'scripts', 'verify-text-edit.sh'), '--files', 'nc-sha.md'],
        '',
        gitEnv(),
        sha
      );
      expect(r.stderr).not.toContain('fatal');
      expect(r.stdout).toContain('[korean] added-lines=2');
      expect(parseGrep(r.stdout)).toEqual({ fam: 1, lf: 1, noun: 0 });
      expect(r.code).toBe(1);
    });
  });

  test('--files together with --quotes runs both halves', () => {
    const rel = commitFile(next('both'), '기존입니다.\n');
    writeFileSync(join(repo, rel), '기존입니다.\n문장입니다.\n');
    const t = tmpFile('both-target.txt', 'quoted line\n');
    const qf = tmpFile('both-q.txt', 'quoted line\n');
    const r = verify(['--files', rel, '--quotes', qf, '--target', t]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('1\tquoted line');
  });
});

// ---------------------------------------------------------------------------
// Script == yaml parity. The yaml fixed constraint (a) and the `# BEGIN quote-verify` block are
// the canonical specification; they are extracted as written and run on the same inputs.
// ---------------------------------------------------------------------------
function readText(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function extractBlock(text: string): string {
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.includes('# BEGIN quote-verify (ONE Bash call)'));
  const end = lines.findIndex((l) => l.includes('# END quote-verify'));
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const body = lines.slice(begin + 1, end);
  const indent = Math.min(
    ...body.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)?.[0].length ?? 0)
  );
  return body.map((l) => l.slice(indent)).join('\n');
}

const CONSTRAINT_ANCHOR =
  'Every rule/skill/guide TEXT-editing delegation prompt MUST include this fixed constraint';

interface YamlKoreanSpec {
  famPattern: string;
  lfFirstPattern: string;
  lfSecondFlags: string;
  lfSecondPattern: string;
  nounPattern: string;
  pythonCode: string;
}

/** Pull the three grep commands and the python3 command out of the fixed-constraint text. */
function extractYamlKorean(text: string): YamlKoreanSpec {
  const start = text.indexOf(CONSTRAINT_ANCHOR);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('(b) locate by anchor', start);
  expect(end).toBeGreaterThan(start);
  const region = text.slice(start, end);
  const fam = region.match(/family check `grep -cE '([^']+)'`/);
  const lf = region.match(/`grep -E '([^']+)' \| grep (-vc[A-Za-z]*) '([^']+)'`/);
  const noun = region.match(/noun-ending check\s+`grep -E '([^']+)'`/);
  const py = region.match(/python3 -c "([\s\S]*?print\(fam, lf, noun\))"/);
  expect(fam).not.toBeNull();
  expect(lf).not.toBeNull();
  expect(noun).not.toBeNull();
  expect(py).not.toBeNull();
  return {
    famPattern: fam?.[1] ?? '',
    lfFirstPattern: lf?.[1] ?? '',
    lfSecondFlags: lf?.[2] ?? '',
    lfSecondPattern: lf?.[3] ?? '',
    nounPattern: noun?.[1] ?? '',
    // yaml wraps the one-liner over several indented lines and escapes `"` for the shell
    pythonCode: (py?.[1] ?? '').replace(/\n\s+/g, ' ').replaceAll('\\"', '"'),
  };
}

function grepCount(args: string[], stdin: string): string {
  return run(['grep', ...args], stdin).stdout.trim();
}

/** The counts the yaml commands give on `input`: [grep triple, python3 triple]. */
function yamlCounts(spec: YamlKoreanSpec, input: string): { grep: Counts; python: Counts } {
  const fam = Number(grepCount(['-cE', spec.famPattern], input));
  const first = run(['grep', '-E', spec.lfFirstPattern], input).stdout;
  const lf = Number(grepCount([spec.lfSecondFlags, spec.lfSecondPattern], first));
  const noun = Number(
    run(['grep', '-cE', spec.nounPattern], input).stdout.trim() // `grep -E ... = 0` read as a count
  );
  const py = run(['python3', '-I', '-c', spec.pythonCode], input).stdout.trim().split(' ');
  return {
    grep: { fam, lf, noun },
    python: { fam: Number(py[0]), lf: Number(py[1]), noun: Number(py[2]) },
  };
}

const KOREAN_SETS: Array<[string, string[]]> = [
  ['6 반말/평서형 positive', POS_PLAIN],
  ['6 합쇼체 negative', NEG_HAP],
  ['4 명사 종결 positive', POS_NOUN],
  ['4 합쇼체 negative', NEG_NOUN_HAP],
];

/** True when the script gives the yaml spec's verdicts on every Korean fixture set. */
function koreanParityHolds(spec: YamlKoreanSpec): boolean {
  for (const [, set] of KOREAN_SETS) {
    const input = linesOf(set);
    const y = yamlCounts(spec, input);
    const s = script(['--stdin'], input);
    const sg = parseGrep(s.stdout);
    const sp = parsePython(s.stdout);
    const same = (a: Counts, b: Counts) => a.fam === b.fam && a.lf === b.lf && a.noun === b.noun;
    if (!(same(y.grep, sg) && same(y.python, sp))) {
      return false;
    }
    const yamlViolation = y.grep.fam + y.grep.lf + y.grep.noun > 0;
    if (yamlViolation !== (s.code !== 0)) {
      return false;
    }
  }
  return true;
}

describe('script == yaml (Korean checks)', () => {
  const spec = extractYamlKorean(readText(AD));

  test('the extracted yaml commands are the documented ones', () => {
    expect(spec.famPattern).toBe('(한다|된다|않는다|따른다|했다|있다|없다|넣는다|이다)[.。 "(]');
    expect(spec.lfFirstPattern).toBe('다[.。"]?$');
    expect(spec.lfSecondFlags).toBe('-vcE');
    expect(spec.lfSecondPattern).toBe('니다[.。"]?$');
    expect(spec.nounPattern).toBe('(함|됨|필요)[.。"]?$');
    expect(spec.pythonCode.startsWith('import re,sys; text=sys.stdin.read();')).toBe(true);
  });

  test('yaml grep and yaml python3 give the documented counts on the four sets', () => {
    expect(yamlCounts(spec, linesOf(POS_PLAIN))).toEqual({
      grep: { fam: 3, lf: 6, noun: 0 },
      python: { fam: 3, lf: 6, noun: 0 },
    });
    expect(yamlCounts(spec, linesOf(NEG_HAP)).grep).toEqual({ fam: 0, lf: 0, noun: 0 });
    expect(yamlCounts(spec, linesOf(POS_NOUN)).grep).toEqual({ fam: 0, lf: 0, noun: 4 });
    expect(yamlCounts(spec, linesOf(NEG_NOUN_HAP)).grep).toEqual({ fam: 0, lf: 0, noun: 0 });
  });

  test('the script gives the same counts and verdicts as the yaml commands', () => {
    expect(koreanParityHolds(spec)).toBe(true);
  });

  // The yaml python3 snippet counts LINES like `grep -c` (the script's unit); on a line with 3
  // family hits grep and the yaml python3 both give 1.
  test('yaml grep and yaml python3 both count the multi-hit line once (counting unit)', () => {
    const y = yamlCounts(spec, linesOf([MULTI_HIT]));
    expect(y.grep).toEqual({ fam: 1, lf: 0, noun: 0 });
    expect(y.python).toEqual({ fam: 1, lf: 0, noun: 0 });
    const s = script(['--stdin'], linesOf([MULTI_HIT]));
    expect(parsePython(s.stdout)).toEqual(y.python);
  });

  test('a yaml python3 that counts hits (findall) disagrees with grep on the multi-hit line', () => {
    const yaml = readText(AD);
    const mutated = yaml.replace(
      /fam=sum\(1 for l in text\.split\(chr\(10\)\) if re\.search\((r'[^\n]*?'), l\)\)/,
      'fam=len(re.findall($1, text))'
    );
    expect(mutated).not.toBe(yaml);
    const y = yamlCounts(extractYamlKorean(mutated), linesOf([MULTI_HIT]));
    expect(y.grep.fam).toBe(1);
    expect(y.python.fam).toBe(3);
  });

  test('every script pattern literal appears in all 4 auto-dev.yaml copies', () => {
    const literals = [
      '(한다|된다|않는다|따른다|했다|있다|없다|넣는다|이다)[.。 "(]',
      "'다[.。\"]?$'",
      "'니다[.。\"]?$'",
      '(함|됨|필요)[.。"]?$',
    ];
    for (const lit of literals) {
      expect(SCRIPT_TEXT).toContain(lit);
    }
    for (const rel of AUTO_DEV_COPIES) {
      const text = readText(rel);
      for (const lit of literals) {
        expect(text).toContain(lit);
      }
    }
  });

  test('mutated yaml copies break the parity (negative control)', () => {
    const yaml = readText(AD);
    const mutations: Array<[string, (t: string) => string]> = [
      ['BRE second grep (-vcE -> -vc)', (t) => t.replace("grep -vcE '니다", "grep -vc '니다")],
      ['family list loses 했다', (t) => t.replace('따른다|했다|있다', '따른다|있다')],
      ['noun pattern loses 필요', (t) => t.replace("grep -E '(함|됨|필요)", "grep -E '(함|됨)")],
    ];
    for (const [label, mutate] of mutations) {
      const mutated = mutate(yaml);
      expect(mutated, label).not.toBe(yaml);
      expect(koreanParityHolds(extractYamlKorean(mutated)), label).toBe(false);
    }
  });
});

describe('script == yaml (quote-verify block)', () => {
  const BLOCK = extractBlock(readText(AD));

  function assemble(block: string, qf: string, tail = ''): string {
    return `${block.replace('<quotation-file>', qf).replace('<target-file>', target)}\n${tail}`;
  }

  const QUOTE_CASES: Array<[string, string]> = [
    ['genuine only', `${REAL1}\n${REAL2}\n`],
    ['genuine + fabricated', `${REAL1}\n${FAKE}\n`],
    ['fabricated + trailing blank', `${REAL1}\n${FAKE}\n\n`],
    ['empty file', ''],
    ['fabricated last line without newline', `${REAL1}\n${FAKE}`],
    ['only blank lines', '\n\n'],
  ];

  function sameAsBlock(scriptPath: string, name: string, content: string): boolean {
    const qf = tmpFile(`parity-${name.replace(/\W+/g, '-')}.txt`, content);
    const b = run(['bash', '-s'], assemble(BLOCK, qf));
    const s = run(['bash', scriptPath, '--quotes', qf, '--target', target]);
    return (
      b.stdout === s.stdout &&
      b.stderr === s.stderr &&
      (b.code === 0) === (s.code === 0) &&
      s.stdout.length + s.stderr.length > 0
    );
  }

  test('the block still has both placeholders exactly once', () => {
    expect(BLOCK.split('<quotation-file>').length - 1).toBe(1);
    expect(BLOCK.split('<target-file>').length - 1).toBe(1);
  });

  for (const [name, content] of QUOTE_CASES) {
    test(`identical stdout, stderr and zero/non-zero: ${name}`, () => {
      expect(sameAsBlock(SCRIPT, name, content)).toBe(true);
    });
  }

  test('block and script both stay silent on stderr and exit 0 for the genuine set', () => {
    const qf = tmpFile('parity-ok.txt', `${REAL1}\n${REAL2}\n`);
    const b = run(['bash', '-s'], assemble(BLOCK, qf));
    const s = run(['bash', SCRIPT, '--quotes', qf, '--target', target]);
    expect([b.code, b.stderr]).toEqual([0, '']);
    expect([s.code, s.stderr]).toEqual([0, '']);
  });
});

// ---------------------------------------------------------------------------
// Mutation proofs on scratch copies of the script (the tracked script is never touched).
// ---------------------------------------------------------------------------
describe('mutation proofs', () => {
  function mutatedCopy(name: string, mutate: (text: string) => string): string {
    const mutated = mutate(SCRIPT_TEXT);
    expect(mutated).not.toBe(SCRIPT_TEXT);
    const p = join(dir, `mut-${name}.sh`);
    writeFileSync(p, mutated);
    chmodSync(p, 0o755);
    return p;
  }

  test('-vcE -> -vc turns the 합쇼체 negative set red (line-final 6, rc != 0)', () => {
    const p = mutatedCopy('bre', (t) => t.replace("grep -vcE '니다", "grep -vc '니다"));
    const r = run(['bash', p, '--stdin'], linesOf(NEG_HAP));
    expect(r.code).not.toBe(0);
    expect(parseGrep(r.stdout).lf).toBe(6);
  });

  test('removing the HALT branch turns the empty-set case red (rc 0 instead of 1)', () => {
    const p = mutatedCopy('halt', (t) =>
      t
        .split('\n')
        .filter((l) => !l.includes('[quote-verify] HALT'))
        .join('\n')
    );
    const qf = tmpFile('mut-empty.txt', '');
    const r = run(['bash', p, '--quotes', qf, '--target', target]);
    expect(r.code).toBe(0);
    expect(run(['bash', SCRIPT, '--quotes', qf, '--target', target]).code).toBe(1);
  });

  test("changing the TAB separator turns the block parity red (stdout differs from the block's)", () => {
    const sepLiteral = 'printf \'%s\\t%s\\n\' "$c" "$q"';
    expect(SCRIPT_TEXT).toContain(sepLiteral);
    const p = mutatedCopy('sep', (t) => t.replace(sepLiteral, 'printf \'%s|%s\\n\' "$c" "$q"'));
    const BLOCK = extractBlock(readText(AD));
    const qf = tmpFile('mut-sep.txt', `${REAL1}\n`);
    const b = run(
      ['bash', '-s'],
      `${BLOCK.replace('<quotation-file>', qf).replace('<target-file>', target)}\n`
    );
    const s = run(['bash', p, '--quotes', qf, '--target', target]);
    expect(s.stdout).not.toBe(b.stdout);
  });

  test('findall (hit count) instead of per-line search turns the multi-hit line into DISAGREE rc 3', () => {
    const lineUnit = 'fam=sum(1 for l in text.split(chr(10)) if re.search(';
    expect(SCRIPT_TEXT).toContain(lineUnit);
    const p = mutatedCopy('findall', (t) =>
      t.replace(
        /fam=sum\(1 for l in text\.split\(chr\(10\)\) if re\.search\((r'[^\n]*?'), l\)\)/,
        'fam=len(re.findall($1, text))'
      )
    );
    expect(readFileSync(p, 'utf8')).toContain('fam=len(re.findall(');
    const mutated = run(['bash', p, '--stdin'], linesOf([MULTI_HIT]));
    expect(parseGrep(mutated.stdout).fam).toBe(1);
    expect(parsePython(mutated.stdout).fam).toBe(3);
    expect(mutated.code).toBe(3);
    expect(mutated.stderr).toContain('[korean] DISAGREE');
    // the tracked script gives rc 1 and no DISAGREE on the same input
    const real = run(['bash', SCRIPT, '--stdin'], linesOf([MULTI_HIT]));
    expect(real.code).toBe(1);
    expect(real.stderr).not.toContain('DISAGREE');
  });

  test('removing the python3 cross-check comparison turns the disagreement case red', () => {
    const shim = join(dir, 'shim2');
    mkdirSync(shim, { recursive: true });
    const py = join(shim, 'python3');
    writeFileSync(py, '#!/bin/sh\ncat >/dev/null\necho "9 9 9"\n');
    chmodSync(py, 0o755);
    const env = { PATH: `${shim}:${process.env.PATH ?? ''}` };
    expect(script(['--stdin'], linesOf(NEG_HAP), env).code).toBe(3);
    const p = mutatedCopy('dis', (t) => t.replace('rc=3', 'rc=0'));
    expect(run(['bash', p, '--stdin'], linesOf(NEG_HAP), env).code).toBe(0);
  });
});

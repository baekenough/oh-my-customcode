import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Tier-1 checks for the canonical quote-verify block in auto-dev.yaml (#1831 F1, F7).
// The block is extracted as written, de-indented, and run in bash and `zsh -f` with
// positive/negative fixtures. External processes use Bun.spawnSync so a leaked
// mock.module('node:child_process') cannot replace them.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '../../..');

const AUTO_DEV_COPIES = [
  '.claude/skills/pipeline/workflows/auto-dev.yaml',
  'templates/.claude/skills/pipeline/workflows/auto-dev.yaml',
  'workflows/auto-dev.yaml',
  'templates/workflows/auto-dev.yaml',
] as const;

const AD = AUTO_DEV_COPIES[0];
const MUTATED_LINE = '[ "$c" -gt 0 ] || miss=1';

function readText(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function run(cmd: string[], stdin: string, env: Record<string, string> = {}, cwd = REPO_ROOT) {
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

const BLOCK = extractBlock(readText(AD));

let dir = '';
let target = '';

const REAL1 = 'alpha real line';
const REAL2 = 'beta real line';
const FAKE = 'zzz fabricated quotation';

function quoteFile(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}

function assemble(block: string, qf: string, tail = ''): string {
  return `${block.replace('<quotation-file>', qf).replace('<target-file>', target)}\n${tail}`;
}

type Shell = { name: string; argv: string[] };
const SHELLS: Shell[] = [
  { name: 'bash', argv: ['bash', '-s'] },
  { name: 'zsh -f', argv: ['zsh', '-f', '-s'] },
];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'quote-verify-'));
  target = join(dir, 'target.txt');
  writeFileSync(target, `${REAL1}\n${REAL2}\nother content\n`);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('quote-verify block (#1831 F1)', () => {
  test('block is extracted with both placeholders exactly once', () => {
    expect(BLOCK.split('<quotation-file>').length - 1).toBe(1);
    expect(BLOCK.split('<target-file>').length - 1).toBe(1);
    expect(BLOCK).toContain(MUTATED_LINE);
  });

  for (const sh of SHELLS) {
    describe(sh.name, () => {
      test('1. genuine quotations only -> rc 0', () => {
        const qf = quoteFile('q1.txt', `${REAL1}\n${REAL2}\n`);
        const r = run(sh.argv, assemble(BLOCK, qf));
        expect(r.code).toBe(0);
        expect(r.stdout).toContain(`1\t${REAL1}`);
        expect(r.stderr).not.toContain('[quote-verify]');
      });

      test('2. genuine + fabricated -> rc != 0 with count 0 and FAIL', () => {
        const qf = quoteFile('q2.txt', `${REAL1}\n${FAKE}\n`);
        const r = run(sh.argv, assemble(BLOCK, qf));
        expect(r.code).not.toBe(0);
        expect(r.stdout).toContain(`0\t${FAKE}`);
        expect(r.stderr).toContain('[quote-verify] FAIL');
      });

      test('3. fabricated + trailing blank line -> rc != 0', () => {
        const qf = quoteFile('q3.txt', `${REAL1}\n${FAKE}\n\n`);
        const r = run(sh.argv, assemble(BLOCK, qf));
        expect(r.code).not.toBe(0);
        expect(r.stdout).toContain(`0\t${FAKE}`);
      });

      test('4. empty quotation file -> rc != 0 with HALT', () => {
        const qf = quoteFile('q4.txt', '');
        const r = run(sh.argv, assemble(BLOCK, qf));
        expect(r.code).not.toBe(0);
        expect(r.stderr).toContain('[quote-verify] HALT');
      });

      test('5. fabricated last line without trailing newline -> rc != 0', () => {
        const qf = quoteFile('q5.txt', `${REAL1}\n${FAKE}`);
        const r = run(sh.argv, assemble(BLOCK, qf));
        expect(r.code).not.toBe(0);
        expect(r.stdout).toContain(`0\t${FAKE}`);
      });

      test('calling shell is not ended on FAIL (echo after still runs)', () => {
        const qf = quoteFile('q6.txt', `${REAL1}\n${FAKE}\n`);
        const r = run(sh.argv, assemble(BLOCK, qf, 'echo after'));
        expect(r.stderr).toContain('[quote-verify] FAIL');
        expect(r.stdout).toContain('after');
      });
    });
  }

  test('control: single grep -F -f on the case-2 input returns rc 0 (any-match misses the fake)', () => {
    const qf = quoteFile('q2c.txt', `${REAL1}\n${FAKE}\n`);
    const r = run(['grep', '-F', '-f', qf, target], '');
    expect(r.code).toBe(0);
  });

  test('mutation: removing the per-quotation count check makes case 2 pass (rc 0)', () => {
    expect(BLOCK).toContain(MUTATED_LINE);
    const mutated = BLOCK.split('\n')
      .filter((l) => l.trim() !== MUTATED_LINE)
      .join('\n');
    expect(mutated).not.toBe(BLOCK);
    const qf = quoteFile('q2m.txt', `${REAL1}\n${FAKE}\n`);
    for (const sh of SHELLS) {
      const r = run(sh.argv, assemble(mutated, qf));
      expect(r.code).toBe(0);
    }
  });
});

describe('quote-verify wording (#1831 F7)', () => {
  for (const rel of AUTO_DEV_COPIES) {
    test(`${rel} does not contain the stale shell-rule phrase`, () => {
      expect(readText(rel)).not.toContain('which the shell rule above forbids');
    });
  }
});

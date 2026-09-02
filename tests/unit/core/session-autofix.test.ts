import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// -------------------------------------------------------------------
// Regression note (#1640): tests spawn the TEMPLATES mirror, not the
// source script. If only .claude/hooks/scripts/session-autofix.sh is
// fixed and the templates/ mirror is not synced, this test suite would
// silently validate the STALE (pre-fix) behavior — a false-green.
// -------------------------------------------------------------------
const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const SESSION_AUTOFIX_SCRIPT = resolve(SCRIPTS_DIR, 'session-autofix.sh');

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runSessionAutofix(cwd: string): Promise<ScriptResult> {
  return new Promise((res) => {
    const child = spawn('bash', [SESSION_AUTOFIX_SCRIPT], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('close', (code: number | null) => res({ stdout, stderr, exitCode: code ?? -1 }));
    child.stdin.write('{}');
    child.stdin.end();
  });
}

/** Extract the broken-refs count from the stderr report line, or 0 if absent. */
function brokenRefCount(stderr: string): number {
  const m = stderr.match(/\[broken-refs\] (\d+) broken skill reference/);
  return m ? Number(m[1]) : 0;
}

let dir: string;

function agent(name: string, frontmatter: string): void {
  writeFileSync(
    join(dir, '.claude/agents', `${name}.md`),
    `---\n${frontmatter}\n---\n\nBody text.\n`
  );
}
function skill(name: string): void {
  mkdirSync(join(dir, '.claude/skills', name), { recursive: true });
  writeFileSync(join(dir, '.claude/skills', name, 'SKILL.md'), '---\nname: x\n---\n');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'session-autofix-'));
  mkdirSync(join(dir, '.claude/agents'), { recursive: true });
  mkdirSync(join(dir, '.claude/skills'), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('session-autofix broken skill reference parsing (#1640)', () => {
  it('1. inline skills array with all skills present -> 0 broken refs', async () => {
    skill('alpha');
    skill('beta');
    agent('a1', 'name: a1\nskills: [alpha, beta]');

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(0);
  });

  it('2. block list skills with all skills present -> 0 broken refs (#1640 regression)', async () => {
    skill('alpha');
    skill('beta');
    agent('a1', 'name: a1\nskills:\n  - alpha\n  - beta');

    const result = await runSessionAutofix(dir);

    // The pre-#1640 code treated the literal "skills:" line itself as an
    // unresolved reference for every block-list agent, returning 1 here.
    expect(brokenRefCount(result.stderr)).toBe(0);
  });

  it('3. inline skills array with one missing skill -> exactly 1 broken ref', async () => {
    skill('alpha');
    agent('a1', 'name: a1\nskills: [alpha, ghost]');

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(1);
  });

  it('4. block list skills with one missing skill -> exactly 1 broken ref', async () => {
    skill('alpha');
    agent('a1', 'name: a1\nskills:\n  - alpha\n  - ghost');

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(1);
  });

  it('5. skills field absent entirely -> 0 broken refs', async () => {
    agent('a1', 'name: a1\ndescription: no skills field here');

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(0);
  });

  it('6. "skills:" string appearing in the body (outside frontmatter) -> 0 broken refs', async () => {
    writeFileSync(
      join(dir, '.claude/agents', 'a1.md'),
      '---\nname: a1\ndescription: no skills field\n---\n\nSome body text mentioning skills: ghost as prose, not YAML.\n'
    );

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(0);
  });

  it('7. mixed: block list agent (1/2 broken) + inline agent (1/2 broken) -> exactly 2 broken refs', async () => {
    skill('alpha');
    skill('gamma');
    agent('a1', 'name: a1\nskills:\n  - alpha\n  - ghost1');
    agent('a2', 'name: a2\nskills: [gamma, ghost2]');

    const result = await runSessionAutofix(dir);

    expect(brokenRefCount(result.stderr)).toBe(2);
  });
});

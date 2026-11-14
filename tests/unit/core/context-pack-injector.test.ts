/**
 * Fixtures for .claude/hooks/scripts/context-pack-injector.sh (#1970, v2.0.26):
 * event-driven one-shot context pack injection (L2) — PreToolUse(Agent|Task|SendMessage → delegation,
 * Bash → commit-release) and SessionStart(compact) → --reset.
 *
 * Test seam: CONTEXT_PACK_INJECTOR_UNDER_TEST points the suite at a scratch mutant copy of the script
 * (same pattern as destructive-git-guard-1887.test.ts) so mutation proofs run without touching the
 * source. Every run gets its own TMPDIR + project dir; inherited GIT_* variables are stripped.
 */
import { afterAll, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SOURCE_SCRIPT = resolve(
  import.meta.dir,
  '../../../.claude/hooks/scripts/context-pack-injector.sh'
);
const SCRIPT = process.env.CONTEXT_PACK_INJECTOR_UNDER_TEST ?? SOURCE_SCRIPT;
const BASH = Bun.which('bash') ?? '/bin/bash';
const SENTINEL = 'PACK-SENTINEL-7f3a';
// Script cap on the injection text (preamble + blank line + comment-stripped body), in characters.
// 9,153 is the largest injection MEASURED as delivered whole to the model on CC 2.1.325 (live probe:
// 9,153 inline in full; 10,653 was replaced by an "Output too large (10.4KB)" preview of ~2KB). The
// boundary in between is unmeasured, so the script cap (MAX_INJECT_CHARS) is that measured value and
// every test below uses this one constant. Raise both together only with a new delivery measurement.
const INJECT_CAP = 9153;

const cleanup: string[] = [];
afterAll(() => {
  for (const dir of cleanup) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith('GIT_')) continue;
    if (key === 'OMCUSTOM_CONTEXT_PACKS' || key === 'CLAUDE_PROJECT_DIR') continue;
    env[key] = value;
  }
  return env;
}

interface Sandbox {
  tmp: string;
  project: string;
}

function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'ctxpack-test-'));
  cleanup.push(root);
  const tmp = join(root, 'tmp');
  const project = join(root, 'project');
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(project, '.claude', 'contexts'), { recursive: true });
  return { tmp, project };
}

function writePack(box: Sandbox, pack: string, content: string): void {
  writeFileSync(join(box.project, '.claude', 'contexts', `${pack}.md`), content);
}

const DEFAULT_BODY = `<!-- hidden header comment -->\n${SENTINEL} line one\n<!--\nmulti-line\nhidden\n-->\nline two\n`;

function seeded(packs: string[] = ['delegation', 'commit-release']): Sandbox {
  const box = sandbox();
  for (const pack of packs) writePack(box, pack, DEFAULT_BODY);
  return box;
}

interface RunResult {
  rc: number;
  out: string;
  err: string;
}

function run(
  box: Sandbox,
  args: string[],
  stdin: unknown,
  extraEnv: Record<string, string> = {}
): RunResult {
  const payload = typeof stdin === 'string' ? stdin : JSON.stringify(stdin);
  const r = Bun.spawnSync([BASH, SCRIPT, ...args], {
    stdin: new TextEncoder().encode(payload),
    env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project, ...extraEnv },
  });
  return { rc: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

const bashCall = (sid: string, command: string, agent?: string) => ({
  session_id: sid,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_id: agent }),
});

const delegationCall = (sid: string, agent?: string) => ({
  session_id: sid,
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: { subagent_type: 'general-purpose', prompt: 'x' },
  ...(agent === undefined ? {} : { agent_id: agent }),
});

const resetCall = (sid: string) => ({
  session_id: sid,
  hook_event_name: 'SessionStart',
  source: 'compact',
});

function context(out: string): string {
  const parsed = JSON.parse(out) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  return parsed.hookSpecificOutput.additionalContext;
}

// The marker base is per user (`omcustom-ctxpack-<uid>`); markers are directories (mkdir claim).
function baseDir(box: Sandbox): string {
  return join(box.tmp, `omcustom-ctxpack-${process.getuid?.() ?? 0}`);
}

function markerDir(box: Sandbox, sid: string): string {
  return join(baseDir(box), sid);
}

describe('context-pack-injector: one-shot injection', () => {
  it('injects on the first call with valid PreToolUse additionalContext JSON', () => {
    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.rc).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(Object.keys(parsed)).toEqual(['hookSpecificOutput']);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(Object.keys(parsed.hookSpecificOutput).sort()).toEqual([
      'additionalContext',
      'hookEventName',
    ]);
    const ctx = context(r.out);
    expect(ctx).toContain(SENTINEL);
    expect(ctx).toContain('line two');
    expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(true);
  });

  it('prefixes a 합쇼체 preamble saying the convention also applies to the call just sent', () => {
    const box = seeded();
    const ctx = context(run(box, ['delegation'], delegationCall('sess1')).out);
    const firstLine = ctx.split('\n')[0] ?? '';
    expect(firstLine).toContain('[Context Pack: delegation]');
    expect(firstLine).toContain('방금 보낸 호출에도 적용됩니다');
    expect(firstLine).toContain('후속 메시지로 보완하십시오');
  });

  it('strips HTML comments (single and multi-line) from the injected body', () => {
    const box = seeded();
    const ctx = context(run(box, ['delegation'], delegationCall('sess1')).out);
    expect(ctx).not.toContain('<!--');
    expect(ctx).not.toContain('-->');
    expect(ctx).not.toContain('hidden');
    expect(ctx).not.toContain('multi-line');
  });

  it('drops the remainder after an unterminated <!-- instead of leaking it', () => {
    const box = sandbox();
    writePack(box, 'delegation', `${SENTINEL}\n<!-- never closed\nleaky text\n`);
    const ctx = context(run(box, ['delegation'], delegationCall('sess1')).out);
    expect(ctx).toContain(SENTINEL);
    expect(ctx).not.toContain('leaky');
    expect(ctx).not.toContain('<!--');
  });

  it('is silent on the second call with the same session and agent key', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sess1')).out).not.toBe('');
    const second = run(box, ['delegation'], delegationCall('sess1'));
    expect(second.rc).toBe(0);
    expect(second.out).toBe('');
  });

  it('injects separately for a different agent_id, then is silent for each repeat', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sess1')).out).not.toBe('');
    const sub = run(box, ['delegation'], delegationCall('sess1', 'agent-abc123'));
    expect(sub.out).not.toBe('');
    expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-agent-abc123'))).toBe(true);
    expect(run(box, ['delegation'], delegationCall('sess1', 'agent-abc123')).out).toBe('');
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toBe('');
  });

  it('keeps sessions independent', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sessA')).out).not.toBe('');
    expect(run(box, ['delegation'], delegationCall('sessB')).out).not.toBe('');
  });

  it('keeps packs independent (delegation marker does not suppress commit-release)', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sess1')).out).not.toBe('');
    expect(run(box, ['commit-release'], bashCall('sess1', 'git commit -m x')).out).not.toBe('');
  });

  it('lets exactly one of several concurrent calls with the same key inject', async () => {
    const box = seeded();
    const payload = JSON.stringify(delegationCall('sess-race'));
    const procs = Array.from({ length: 6 }, () =>
      Bun.spawn([BASH, SCRIPT, 'delegation'], {
        stdin: new TextEncoder().encode(payload),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project },
      })
    );
    const outs = await Promise.all(procs.map((p) => new Response(p.stdout).text()));
    await Promise.all(procs.map((p) => p.exited));
    expect(outs.filter((o) => o.trim() !== '').length).toBe(1);
  });

  it('never emits a permission decision (2.1.323: a hook "allow" must not be returned)', () => {
    const box = seeded();
    const out = run(box, ['delegation'], delegationCall('sess1')).out;
    expect(out).not.toContain('permissionDecision');
    expect(out).not.toContain('"decision"');
    expect(out).not.toContain('updatedInput');
  });
});

describe('context-pack-injector: --reset', () => {
  it('re-enables injection after a reset for that session', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sess1')).out).not.toBe('');
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toBe('');
    const reset = run(box, ['--reset'], resetCall('sess1'));
    expect(reset.rc).toBe(0);
    expect(reset.out).toBe('');
    expect(run(box, ['delegation'], delegationCall('sess1')).out).not.toBe('');
  });

  it('clears markers of every agent in the session but leaves other sessions alone', () => {
    const box = seeded();
    run(box, ['delegation'], delegationCall('sess1'));
    run(box, ['delegation'], delegationCall('sess1', 'sub1'));
    run(box, ['commit-release'], bashCall('sess1', 'git push', 'sub1'));
    run(box, ['delegation'], delegationCall('sess2'));
    run(box, ['--reset'], resetCall('sess1'));
    expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
    expect(existsSync(join(markerDir(box, 'sess2'), 'delegation-main'))).toBe(true);
  });

  it('deletes only exact marker names: unrelated and oddly named files survive', () => {
    const box = seeded();
    run(box, ['delegation'], delegationCall('sess1'));
    const dir = markerDir(box, 'sess1');
    writeFileSync(join(dir, 'notes.txt'), 'keep');
    writeFileSync(join(dir, 'delegation-x.bak'), 'keep');
    writeFileSync(join(dir, 'other-main'), 'keep');
    run(box, ['--reset'], resetCall('sess1'));
    expect(readdirSync(dir).sort()).toEqual(['delegation-x.bak', 'notes.txt', 'other-main']);
  });

  it('does not follow a symlinked marker', () => {
    const box = seeded();
    run(box, ['delegation'], delegationCall('sess1'));
    const dir = markerDir(box, 'sess1');
    const target = join(box.tmp, 'precious.txt');
    writeFileSync(target, 'precious');
    symlinkSync(target, join(dir, 'commit-release-main'));
    run(box, ['--reset'], resetCall('sess1'));
    expect(existsSync(target)).toBe(true);
    // a non-regular marker is left untouched (the link itself is not removed either)
    expect(lstatSync(join(dir, 'commit-release-main')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(dir, 'delegation-main'))).toBe(false);
  });

  it('is a silent no-op for an unknown session and for an invalid session_id', () => {
    const box = seeded();
    expect(run(box, ['--reset'], resetCall('never-seen'))).toEqual({ rc: 0, out: '', err: '' });
    expect(run(box, ['--reset'], resetCall('../escape'))).toEqual({ rc: 0, out: '', err: '' });
  });
});

describe('context-pack-injector: commit-release command detection', () => {
  const POSITIVE = [
    'git commit -m x',
    'git commit --allow-empty -m probe',
    'git push',
    'git push origin develop',
    'git -C /some/dir commit -m x',
    'git -c user.name=x push',
    'git --no-pager -C "/path with space" push',
    'cd sub && git commit -m x',
    'git add -A; git commit -m x',
    'git status | cat; git push',
    'FOO=1 git push',
    'env GIT_X=1 git push',
    'if true; then git push; fi',
    '( git commit -m x )',
    '/usr/bin/git commit -m x',
    'echo hi &&\ngit commit -m x',
    'git commit -m "$(cat <<\'EOF\'\ntitle\n\nbody\nEOF\n)"',
    'gh pr create --title t --body b',
    'gh pr merge 12 --merge',
    'gh release create v1',
    'gh release view v1',
    'npm publish',
    'npm publish --tag next',
    'cat <<EOF > n.txt\nnote\nEOF\ngit commit -m x',
    'ls 2>&1 | wc -l && git push',
    // F6: prefix words with options, leading redirections, gh flags before the subcommand, more publishers
    'timeout 60 git push',
    'timeout -k 5 60 git push',
    'timeout -s KILL 30s git commit -m x',
    'timeout --signal=KILL 30 git push',
    'cd x && timeout 10 gh pr merge 3',
    'time -p git push',
    'sudo -u bot git push',
    'sudo -E -H git push',
    'sudo -u bot -H git commit -m x',
    'command -p git push',
    'env -i PATH=/usr/bin git push',
    '2>/dev/null git push',
    '2>&1 git commit -m x',
    '>log git push',
    'gh pr --repo o/r merge 3',
    'gh pr -R o/r create --title t',
    'gh --repo o/r release create v1',
    'bun publish',
    'pnpm publish',
    'pnpm publish --no-git-checks',
    'yarn npm publish',
  ];

  const NEGATIVE = [
    'echo "git commit"',
    "echo 'git push origin'",
    // separators inside quotes do not open a new command position
    'echo "a; git commit -m x"',
    "echo 'x && git push'",
    'echo "say \\"hi\\"; git push"',
    'echo "run gh pr merge later"',
    'git status',
    'git log --oneline -5',
    'git diff --stat',
    'git commitment',
    'git -C /dir status',
    'git config alias.push x',
    'gh pr view 3',
    'gh pr list',
    'gh issue create --title t',
    'npm install',
    'npm run publish-docs',
    'npm view pkg version',
    'cat <<EOF > f.sh\ngit commit -m x\nEOF',
    'ls # git push',
    'echo hi > git commit',
    'bash -c "git commit -m x"',
    'grep -rn "gh release" docs',
    // F6 negatives: the same forms with a non-release command
    'timeout 60 ls',
    'timeout -k 5 60 echo git push',
    'time -p ls',
    'sudo -u bot ls',
    'sudo -u git ls -la',
    'command -v git',
    'env -i PATH=/usr/bin ls',
    '2>/dev/null git status',
    '>log echo git push',
    'gh pr --repo o/r view 3',
    'gh pr -R o/r list',
    'gh --repo o/r issue create --title t',
    'bun install',
    'bun run publish',
    'pnpm install',
    'pnpm run publish-docs',
    'yarn add left-pad',
    'yarn npm info pkg',
    'yarn publish-docs',
  ];

  for (const command of POSITIVE) {
    it(`injects for: ${JSON.stringify(command)}`, () => {
      const box = seeded();
      const r = run(box, ['commit-release'], bashCall('sess1', command));
      expect(r.rc).toBe(0);
      expect(context(r.out)).toContain(SENTINEL);
    });
  }

  for (const command of NEGATIVE) {
    it(`stays silent for: ${JSON.stringify(command)}`, () => {
      const box = seeded();
      const r = run(box, ['commit-release'], bashCall('sess1', command));
      expect(r.rc).toBe(0);
      expect(r.out).toBe('');
      expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
    });
  }

  it('a non-matching command does not consume the one-shot marker', () => {
    const box = seeded();
    expect(run(box, ['commit-release'], bashCall('sess1', 'git status')).out).toBe('');
    expect(run(box, ['commit-release'], bashCall('sess1', 'git commit -m x')).out).not.toBe('');
    expect(run(box, ['commit-release'], bashCall('sess1', 'git push')).out).toBe('');
  });

  it('is silent when tool_input.command is missing or not a string', () => {
    const box = seeded();
    expect(run(box, ['commit-release'], { session_id: 'sess1', tool_input: {} }).out).toBe('');
    expect(
      run(box, ['commit-release'], { session_id: 'sess1', tool_input: { command: 42 } }).out
    ).toBe('');
  });
});

describe('context-pack-injector: silent exit 0 paths', () => {
  function expectSilent(r: RunResult): void {
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.err).toBe('');
  }

  it('pack file absent', () => {
    expectSilent(run(sandbox(), ['delegation'], delegationCall('sess1')));
  });

  it('empty body and comment-only body', () => {
    const box = sandbox();
    writePack(box, 'delegation', '');
    expectSilent(run(box, ['delegation'], delegationCall('sess1')));
    writePack(box, 'delegation', '<!-- only a comment -->\n\n  \n');
    expectSilent(run(box, ['delegation'], delegationCall('sess2')));
    expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
  });

  // The cap is measured on the whole injection text (preamble + blank line + body).
  const CAP = INJECT_CAP;
  function overhead(): number {
    const box = sandbox();
    writePack(box, 'delegation', 'a');
    return context(run(box, ['delegation'], delegationCall('probe')).out).length - 1;
  }

  it('an injection above the cap (9,153 characters) is not injected: stderr warning only, no marker', () => {
    const box = sandbox();
    const bodyLen = CAP - overhead() + 1;
    writePack(box, 'delegation', 'a'.repeat(bodyLen));
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.err.trim().split('\n').length).toBe(1);
    expect(r.err).toContain(join(box.project, '.claude', 'contexts', 'delegation.md'));
    expect(r.err).toContain(String(CAP + 1));
    expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
  });

  it('an injection of exactly the cap (9,153 characters, preamble included) still injects', () => {
    const box = sandbox();
    writePack(box, 'delegation', 'a'.repeat(CAP - overhead()));
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(context(r.out).length).toBe(CAP);
    expect(r.err).toBe('');
  });

  it('counts characters, not bytes (a cap-sized Korean injection still injects)', () => {
    const box = sandbox();
    writePack(box, 'delegation', '가'.repeat(CAP - overhead()));
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(context(r.out)).toContain('가가가');
    expect(Buffer.byteLength(context(r.out))).toBeGreaterThan(CAP * 2);
    writePack(box, 'delegation', '가'.repeat(CAP - overhead() + 1));
    const over = run(box, ['delegation'], delegationCall('sess2'));
    expect(over.out).toBe('');
    expect(over.err).toContain(String(CAP + 1));
  });

  it('size cap applies to the stripped body, not the commented source', () => {
    const box = sandbox();
    writePack(box, 'delegation', `<!-- ${'x'.repeat(20000)} -->\n${SENTINEL}`);
    expect(context(run(box, ['delegation'], delegationCall('sess1')).out)).toContain(SENTINEL);
  });

  const BAD_SESSIONS: Array<[string, unknown]> = [
    ['path traversal', '../x'],
    ['slash', 'a/b'],
    ['dot', 'a.b'],
    ['space', 'a b'],
    ['newline', 'a\nb'],
    ['empty', ''],
    ['non-string', 7],
    ['over 128 chars', 'a'.repeat(129)],
  ];
  for (const [label, sid] of BAD_SESSIONS) {
    it(`invalid session_id (${label})`, () => {
      const box = seeded();
      expectSilent(run(box, ['delegation'], { ...delegationCall('x'), session_id: sid }));
      expect(existsSync(baseDir(box))).toBe(false);
    });
  }

  it('missing session_id', () => {
    const box = seeded();
    expectSilent(run(box, ['delegation'], { tool_name: 'Agent', tool_input: {} }));
    expect(existsSync(baseDir(box))).toBe(false);
  });

  for (const agent of ['a/b', '../x', 'a.b', 'a b']) {
    it(`invalid agent_id ${JSON.stringify(agent)}`, () => {
      const box = seeded();
      expectSilent(run(box, ['delegation'], { ...delegationCall('sess1'), agent_id: agent }));
      expect(existsSync(baseDir(box))).toBe(false);
    });
  }

  it('opt-out OMCUSTOM_CONTEXT_PACKS=off (injection and reset)', () => {
    const box = seeded();
    expectSilent(
      run(box, ['delegation'], delegationCall('sess1'), { OMCUSTOM_CONTEXT_PACKS: 'off' })
    );
    expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
    run(box, ['delegation'], delegationCall('sess2'));
    expectSilent(run(box, ['--reset'], resetCall('sess2'), { OMCUSTOM_CONTEXT_PACKS: 'off' }));
    expect(existsSync(join(markerDir(box, 'sess2'), 'delegation-main'))).toBe(true);
  });

  it('any other OMCUSTOM_CONTEXT_PACKS value still injects', () => {
    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), { OMCUSTOM_CONTEXT_PACKS: 'on' });
    expect(context(r.out)).toContain(SENTINEL);
  });

  it('stdin that is not a JSON object', () => {
    const box = seeded();
    expectSilent(run(box, ['delegation'], 'not json at all'));
    expectSilent(run(box, ['delegation'], '[1,2,3]'));
    expectSilent(run(box, ['delegation'], '"str"'));
    expectSilent(run(box, ['delegation'], ''));
  });

  it('unknown pack name or no argument (no traversal through the pack argument)', () => {
    const box = seeded();
    writePack(box, 'secret', 'SECRET');
    expectSilent(run(box, ['secret'], delegationCall('sess1')));
    expectSilent(run(box, ['../contexts/delegation'], delegationCall('sess1')));
    expectSilent(run(box, [], delegationCall('sess1')));
  });

  it('jq absent from PATH (positive control: the same PATH with jq injects)', () => {
    const box = seeded();
    const bin = join(box.tmp, 'bin-nojq');
    mkdirSync(bin, { recursive: true });
    for (const name of ['cat', 'mkdir', 'rmdir', 'rm', 'awk', 'find', 'id', 'ls']) {
      const found = Bun.which(name);
      if (found === null) throw new Error(`missing tool ${name}`);
      symlinkSync(found, join(bin, name));
    }
    const noJq = run(box, ['delegation'], delegationCall('sess1'), { PATH: bin });
    expectSilent(noJq);
    const jqPath = Bun.which('jq');
    if (jqPath === null) throw new Error('jq is required for this suite');
    symlinkSync(jqPath, join(bin, 'jq'));
    const withJq = run(box, ['delegation'], delegationCall('sess1'), { PATH: bin });
    expect(context(withJq.out)).toContain(SENTINEL);
  });
});

// ── Adversarial-review fixes (F1 marker base hardening, F2 scan cost, F5 ID normalization) ──────

function spawnRaw(
  box: Sandbox,
  argv: string[],
  stdin: string,
  timeoutMs: number
): { rc: number | null; out: string; err: string; ms: number } {
  const t0 = Date.now();
  const r = Bun.spawnSync([BASH, ...argv], {
    stdin: new TextEncoder().encode(stdin),
    env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project },
    timeout: timeoutMs,
  });
  return {
    rc: r.exitCode,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
    ms: Date.now() - t0,
  };
}

/**
 * Set the full mode including special bits. `chmodSync` from Bun drops sticky/setgid (0o1700 ends up
 * 0o700 — measured on Bun 1.3.14), so the system `chmod` is used; the resulting mode is asserted so a
 * test cannot silently run against a different mode than it names. Returns false when the platform
 * refuses (e.g. setgid for a foreign group).
 */
function setMode(path: string, mode: number): boolean {
  const r = Bun.spawnSync(['chmod', mode.toString(8).padStart(4, '0'), path]);
  if (r.exitCode !== 0) return false;
  expect(statSync(path).mode & 0o7777).toBe(mode);
  return true;
}

/** Pre-create base and session dir with explicit modes (umask-proof). */
function mkTree(box: Sandbox, sid: string, baseMode = 0o700, dirMode = 0o700): string {
  const base = baseDir(box);
  mkdirSync(base);
  expect(setMode(base, baseMode)).toBe(true);
  const dir = join(base, sid);
  mkdirSync(dir);
  expect(setMode(dir, dirMode)).toBe(true);
  return dir;
}

describe('context-pack-injector: marker base hardening (F1)', () => {
  it('creates a per-user base and session dir with mode 0700 and a directory marker', () => {
    const box = seeded();
    run(box, ['delegation'], delegationCall('sess1'));
    expect(statSync(baseDir(box)).mode & 0o777).toBe(0o700);
    expect(statSync(markerDir(box, 'sess1')).mode & 0o777).toBe(0o700);
    const marker = join(markerDir(box, 'sess1'), 'delegation-main');
    expect(statSync(marker).isDirectory()).toBe(true);
    expect(statSync(marker).mode & 0o777).toBe(0o700);
    // the old shared (non per-user) base name is never used
    expect(existsSync(join(box.tmp, 'omcustom-ctxpack'))).toBe(false);
  });

  it('a symlinked base is never followed: no marker is created or deleted in the link target', () => {
    const box = seeded();
    const victim = join(box.tmp, 'victim');
    mkdirSync(join(victim, 'abc'), { recursive: true });
    for (const name of ['delegation-main', 'commit-release-plan']) {
      mkdirSync(join(victim, 'abc', name));
    }
    writeFileSync(join(victim, 'abc', 'delegation-guide'), 'keep');
    symlinkSync(victim, baseDir(box));
    const before = readdirSync(join(victim, 'abc')).sort();

    const inj = run(box, ['delegation'], delegationCall('abc', 'other'));
    expect(inj.out).toBe('');
    expect(run(box, ['--reset'], resetCall('abc')).out).toBe('');
    expect(readdirSync(join(victim, 'abc')).sort()).toEqual(before);
    expect(readdirSync(victim)).toEqual(['abc']);
  });

  it('a group/world-writable base fails closed: silent, nothing created inside', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    chmodSync(baseDir(box), 0o777);
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(readdirSync(baseDir(box))).toEqual([]);
    expect(run(box, ['--reset'], resetCall('sess1')).out).toBe('');
  });

  it('a session dir with a wrong mode fails closed: silent, no marker', () => {
    const box = seeded();
    const dir = mkTree(box, 'sess1', 0o700, 0o755);
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.out).toBe('');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('a base that is a regular file disables the hook (no crash, no stdout, one stderr line)', () => {
    const box = seeded();
    writeFileSync(baseDir(box), 'not a directory');
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.err.trim().split('\n').length).toBe(1);
    expect(r.err).toContain(baseDir(box));
  });

  it('a FIFO at the marker path cannot hang the hook', () => {
    const box = seeded();
    const dir = mkTree(box, 'sess1');
    const fifo = join(dir, 'commit-release-main');
    expect(Bun.spawnSync(['mkfifo', fifo]).exitCode).toBe(0);
    const r = spawnRaw(
      box,
      [SCRIPT, 'commit-release'],
      JSON.stringify(bashCall('sess1', 'git push')),
      10000
    );
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(8000);
  });

  it('a marker that is a symlink to /dev/null cannot make the pack inject on every call', () => {
    const box = seeded();
    const dir = mkTree(box, 'sess1');
    symlinkSync('/dev/null', join(dir, 'delegation-main'));
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toBe('');
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toBe('');
  });
});

describe('context-pack-injector: scanner cost (F2)', () => {
  // `bash -x` cannot observe this any more: the script switches inherited xtrace off on its first line
  // (R3-7). An `awk` spy on PATH counts the scanner / comment-stripper invocations instead.
  it('fast path: once the marker exists the command scan and pack read are skipped', () => {
    const box = seeded();
    const bin = toolBin(box, 'awk-spy', withoutTool('awk'));
    const log = join(box.tmp, 'awk-calls.log');
    const realAwk = Bun.which('awk');
    if (realAwk === null) throw new Error('missing tool awk');
    writeFileSync(join(bin, 'awk'), `#!/bin/sh\necho call >> '${log}'\nexec '${realAwk}' "$@"\n`);
    chmodSync(join(bin, 'awk'), 0o755);
    const calls = (): number =>
      existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean).length : 0;
    const invoke = () => run(box, ['commit-release'], bashCall('sess1', 'git push'), { PATH: bin });

    const first = invoke();
    expect(context(first.out)).toContain(SENTINEL);
    const afterFirst = calls();
    expect(afterFirst).toBeGreaterThan(0); // control: the scan runs before the first injection
    const second = invoke();
    expect(second.out).toBe('');
    expect(calls()).toBe(afterFirst);
  });

  it('scans only the first 32,768 bytes: a command after that is not detected', () => {
    const box = seeded();
    const beyond = run(
      box,
      ['commit-release'],
      bashCall('sess1', `echo ${'x'.repeat(40000)}; git push`)
    );
    expect(beyond.out).toBe('');
    const within = run(
      box,
      ['commit-release'],
      bashCall('sess2', `git push # ${'x'.repeat(40000)}`)
    );
    expect(context(within.out)).toContain(SENTINEL);
  });

  it('a 1 MB single-word command with a lookalike name finishes quickly (bounded scan)', () => {
    const box = seeded();
    const r = spawnRaw(
      box,
      [SCRIPT, 'commit-release'],
      JSON.stringify(bashCall('sess1', `${'a'.repeat(1_000_000)} gh`)),
      8000
    );
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(5000);
  });

  it('a 1 MB heredoc line finishes quickly (bounded scan)', () => {
    const box = seeded();
    const r = spawnRaw(
      box,
      [SCRIPT, 'commit-release'],
      JSON.stringify(bashCall('sess1', `cat <<EOF > f\n${'x'.repeat(1_000_000)}\nEOF\necho gh`)),
      8000
    );
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(5000);
  });
});

describe('context-pack-injector: ID normalization (F5)', () => {
  function expectRejected(box: Sandbox, payload: string): void {
    const r = run(box, ['delegation'], payload);
    expect(r).toEqual({ rc: 0, out: '', err: '' });
    expect(existsSync(baseDir(box))).toBe(false);
  }

  const BAD_AGENTS: Array<[string, string]> = [
    ['null', 'null'],
    ['empty string', '""'],
    ['number', '7'],
    ['array', '["x"]'],
    ['object', '{"a":1}'],
    ['trailing newline', '"x\\n"'],
    ['NUL byte', '"a\\u0000b"'],
    ['ESC control char', '"a\\u001bb"'],
  ];
  for (const [label, json] of BAD_AGENTS) {
    it(`rejects a present agent_id that is invalid (${label}) instead of mapping it to main`, () => {
      expectRejected(seeded(), `{"session_id":"sess1","tool_name":"Agent","agent_id":${json}}`);
    });
  }

  const BAD_SESSIONS_RAW: Array<[string, string]> = [
    ['trailing newline', '"abc\\n"'],
    ['two trailing newlines', '"abc\\n\\n\\n"'],
    ['NUL byte', '"a\\u0000b"'],
    ['control char', '"a\\u0007b"'],
    ['null', 'null'],
  ];
  for (const [label, json] of BAD_SESSIONS_RAW) {
    it(`rejects an invalid session_id (${label}) instead of stripping it`, () => {
      expectRejected(seeded(), `{"session_id":${json},"tool_name":"Agent"}`);
    });
  }

  it('rejects stdin with more than one JSON document', () => {
    expectRejected(seeded(), '[1] {"session_id":"abc"}');
    expectRejected(seeded(), '{"session_id":"abc"}{"session_id":"abd"}');
    expectRejected(seeded(), '{"session_id":"abc"}\n{"session_id":"abc"}');
  });

  it('still accepts one object (with surrounding whitespace) and a missing agent_id as main', () => {
    const box = seeded();
    const r = run(box, ['delegation'], `  ${JSON.stringify(delegationCall('sess1'))}\n\n`);
    expect(context(r.out)).toContain(SENTINEL);
    expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(true);
  });
});

// A1 (R017 review): the real tracked packs must stay deliverable. The packs are authored in
// templates/.claude/contexts/ (`.claude/contexts/` is gitignored, .gitignore:40); the script reads
// `${CLAUDE_PROJECT_DIR}/.claude/contexts/<pack>.md`, so each pack is copied there verbatim.
//
// One ceiling applies to the injection text (preamble + blank line + comment-stripped body):
// INJECT_CAP (see the top of this file) is both the script cap (MAX_INJECT_CHARS) and the largest size
// measured as delivered whole, so a pack that grows past it fails here instead of being silently
// dropped by the hook at run time.
const REAL_PACKS_DIR =
  process.env.CONTEXT_PACK_REAL_PACKS_DIR ??
  resolve(import.meta.dir, '../../../templates/.claude/contexts');

describe('context-pack-injector: real tracked packs stay deliverable (A1)', () => {
  const cases: Array<[string, (box: Sandbox) => RunResult]> = [
    ['delegation', (box) => run(box, ['delegation'], delegationCall('real-sess'))],
    [
      'commit-release',
      (box) => run(box, ['commit-release'], bashCall('real-sess', 'git commit -m x')),
    ],
  ];

  for (const [pack, invoke] of cases) {
    it(`${pack}: injects valid additionalContext within the script cap (the measured-delivery size)`, () => {
      const box = sandbox();
      writePack(box, pack, readFileSync(join(REAL_PACKS_DIR, `${pack}.md`), 'utf-8'));
      const r = invoke(box);
      expect(r.rc).toBe(0);
      expect(r.err).toBe('');
      // (a) non-empty valid JSON carrying hookSpecificOutput.additionalContext
      expect(r.out.trim()).not.toBe('');
      const parsed = JSON.parse(r.out) as {
        hookSpecificOutput?: { hookEventName?: string; additionalContext?: unknown };
      };
      expect(parsed.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
      const ctx = parsed.hookSpecificOutput?.additionalContext;
      expect(typeof ctx).toBe('string');
      const text = ctx as string;
      expect(text).toContain(`[Context Pack: ${pack}]`);
      expect(text).not.toContain('<!--');
      // (b) within the script cap, which is also the largest size measured as delivered whole
      expect(text.length).toBeLessThanOrEqual(INJECT_CAP);
    });
  }
});

// ── Re-check fixes: N1 (uid from id -u), N2 (refusal diagnostics), N3 (portable mode check),
//    N4 (command -v, scan-window truncation), F6 residuals (redirections, sudo long options, npx) ──────

const REAL_UID = process.getuid?.() ?? 0;

describe('context-pack-injector: uid is never taken from the environment (N1)', () => {
  it('ignores UID/EUID in the environment: the base is omcustom-ctxpack-<real id -u>', () => {
    // control: without any override the real-uid base is what gets created
    const plain = seeded();
    run(plain, ['delegation'], delegationCall('sess1'));
    expect(existsSync(join(plain.tmp, `omcustom-ctxpack-${REAL_UID}`))).toBe(true);

    for (const fake of ['0', '4242', '65534']) {
      const box = seeded();
      const r = run(box, ['delegation'], delegationCall('sess1'), { UID: fake, EUID: fake });
      expect(context(r.out)).toContain(SENTINEL);
      expect(readdirSync(box.tmp)).toEqual([`omcustom-ctxpack-${REAL_UID}`]);
    }
  });

  it('uses /bin/bash (3.2 imports UID from the environment) the same way', () => {
    if (!existsSync('/bin/bash')) return;
    const box = seeded();
    const r = Bun.spawnSync(['/bin/bash', SCRIPT, 'delegation'], {
      stdin: new TextEncoder().encode(JSON.stringify(delegationCall('sess1'))),
      env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project, UID: '4242' },
    });
    expect(r.stdout.toString()).toContain(SENTINEL);
    expect(readdirSync(box.tmp)).toEqual([`omcustom-ctxpack-${REAL_UID}`]);
  });
});

describe('context-pack-injector: refused marker dirs are reported once on stderr (N2)', () => {
  function expectRefused(r: RunResult, path: string, reason: string): void {
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
    const lines = r.err.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(path);
    expect(lines[0]).toContain(reason);
  }

  it('a base refused for mode, symlink, or non-directory: fail-closed, exactly one stderr line', () => {
    // control: a healthy base injects with an empty stderr
    const ok = seeded();
    const good = run(ok, ['delegation'], delegationCall('sess1'));
    expect(context(good.out)).toContain(SENTINEL);
    expect(good.err).toBe('');

    const wide = seeded();
    mkdirSync(baseDir(wide));
    expect(setMode(baseDir(wide), 0o777)).toBe(true);
    expectRefused(run(wide, ['delegation'], delegationCall('sess1')), baseDir(wide), 'mode');
    expect(readdirSync(baseDir(wide))).toEqual([]);

    const link = seeded();
    const target = join(link.tmp, 'elsewhere');
    mkdirSync(target, { mode: 0o700 });
    symlinkSync(target, baseDir(link));
    expectRefused(
      run(link, ['delegation'], delegationCall('sess1')),
      baseDir(link),
      'symbolic link'
    );
    expect(readdirSync(target)).toEqual([]);

    const file = seeded();
    writeFileSync(baseDir(file), 'x');
    expectRefused(
      run(file, ['delegation'], delegationCall('sess1')),
      baseDir(file),
      'not a directory'
    );
  });

  it('a refused session dir names the session dir, writes no marker, and prints nothing on stdout', () => {
    const box = seeded();
    const dir = mkTree(box, 'sess1', 0o700, 0o755);
    expectRefused(run(box, ['delegation'], delegationCall('sess1')), dir, 'mode');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('a TMPDIR that does not exist is reported with its would-be base path', () => {
    const box = seeded();
    const missing = join(box.tmp, 'missing-tmpdir');
    const r = run(box, ['delegation'], delegationCall('sess1'), { TMPDIR: missing });
    expectRefused(r, join(missing, `omcustom-ctxpack-${REAL_UID}`), 'does not exist');
    expect(existsSync(missing)).toBe(false);
  });

  it('--reset reports a refused existing base once, and stays silent when the base is absent', () => {
    const absent = seeded();
    expect(run(absent, ['--reset'], resetCall('sess1'))).toEqual({ rc: 0, out: '', err: '' });

    const box = seeded();
    mkdirSync(baseDir(box));
    expect(setMode(baseDir(box), 0o777)).toBe(true);
    expectRefused(run(box, ['--reset'], resetCall('sess1')), baseDir(box), 'mode');
  });
});

describe('context-pack-injector: owner-only mode check ignores special bits (N3)', () => {
  it('base and session dir with sticky/setgid-style extra bits (e.g. 1700) are accepted', () => {
    for (const mode of [0o700, 0o1700]) {
      const box = seeded();
      const dir = mkTree(box, 'sess1', mode, mode);
      const r = run(box, ['delegation'], delegationCall('sess1'));
      expect(context(r.out)).toContain(SENTINEL);
      expect(r.err).toBe('');
      expect(existsSync(join(dir, 'delegation-main'))).toBe(true);
      // reset works on the same tree and removes the marker again
      expect(run(box, ['--reset'], resetCall('sess1')).err).toBe('');
      expect(existsSync(join(dir, 'delegation-main'))).toBe(false);
    }
  });

  it('setgid base (2700) is accepted when the platform lets the owner set it', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    // not permitted for this group on this platform: the 1700 case above covers special bits
    if (!setMode(baseDir(box), 0o2700)) return;
    expect(context(run(box, ['delegation'], delegationCall('sess1')).out)).toContain(SENTINEL);
  });

  // Each group/other bit alone must refuse; the 0700 control must inject.
  const REFUSED_MODES = [
    0o710, 0o720, 0o740, 0o701, 0o702, 0o704, 0o750, 0o707, 0o770, 0o777, 0o1750,
  ];
  it('every mode with any group or other permission bit is refused (one stderr line, nothing created)', () => {
    const control = seeded();
    mkTree(control, 'sess1');
    expect(context(run(control, ['delegation'], delegationCall('sess1')).out)).toContain(SENTINEL);

    for (const mode of REFUSED_MODES) {
      const box = seeded();
      mkdirSync(baseDir(box));
      expect(setMode(baseDir(box), mode)).toBe(true);
      const r = run(box, ['delegation'], delegationCall('sess1'));
      expect(r.rc).toBe(0);
      expect(r.out).toBe('');
      expect(r.err.trim().split('\n').length).toBe(1);
      expect(readdirSync(baseDir(box))).toEqual([]);
    }
  });
});

describe('context-pack-injector: command -v/-V are lookups, not executions (N4a)', () => {
  const QUERY = [
    'command -v git push',
    'command -V git commit',
    'command -pv git push',
    'command -v git; echo git push',
  ];
  const EXEC = [
    'command git push',
    'command -p git push',
    'command -- git commit -m x',
    'command -v git && git push',
  ];
  it('query forms stay silent while plain command forms still inject', () => {
    for (const command of QUERY) {
      const box = seeded();
      const r = run(box, ['commit-release'], bashCall('sess1', command));
      expect({ command, out: r.out }).toEqual({ command, out: '' });
    }
    for (const command of EXEC) {
      const box = seeded();
      const r = run(box, ['commit-release'], bashCall('sess1', command));
      expect({ command, hit: r.out.includes(SENTINEL) }).toEqual({ command, hit: true });
    }
  });
});

describe('context-pack-injector: a token touching the scan-window end never matches (N4b)', () => {
  const LIMIT = 32768;
  const pad = (prefix: string) => 'a'.repeat(LIMIT - prefix.length);
  const hit = (command: string, sid: string): boolean => {
    const r = run(seeded(), ['commit-release'], bashCall(sid, command));
    return r.out.includes(SENTINEL);
  };

  it('pushover / commitment cut at the window end are ignored; complete tokens still match', () => {
    // cut lands exactly after "git push" / "git commit"
    expect(hit(`${pad('; git push')}; git pushover`, 's1')).toBe(false);
    expect(hit(`${pad('; git commit')}; git commitment`, 's2')).toBe(false);
    // controls: the same text ending exactly at the limit is not truncated and matches
    expect(hit(`${pad('; git push')}; git push`, 's3')).toBe(true);
    expect(hit(`${pad('; git commit')}; git commit`, 's4')).toBe(true);
    // a complete command followed by a space inside the window still matches although the input is cut
    expect(hit(`${pad('; git push ')}; git push ${'x'.repeat(2000)}`, 's5')).toBe(true);
    // a single token longer than the window leaves nothing to scan
    expect(hit(`gh${'a'.repeat(LIMIT + 10)}`, 's6')).toBe(false);
  });
});

describe('context-pack-injector: F6 residuals inside the documented trigger set', () => {
  const POSITIVE = [
    '&>log git push',
    '&>>log git commit -m x',
    '>out git commit',
    '2>&1 git push',
    '<in git commit',
    'sudo --user bot git commit',
    'sudo --group grp --user bot git push',
    'sudo -u bot git push',
    'sudo -g grp git commit -m x',
    'npx npm publish',
    'npx --yes npm publish',
    'npx -p npm npm publish',
  ];
  const NEGATIVE = [
    '&>log echo git push',
    '&>log git status',
    '>out echo git commit',
    'sudo --user bot ls',
    'sudo --user git ls -la',
    'sudo -g grp ls',
    'npx npm view pkg version',
    'npx prettier npm publish',
    'npx --yes ls',
    // out of scope by decision: no other package manager is added
    'yarn publish',
    'pnpm --filter x publish',
  ];

  it('listed positives inject and the matching negatives stay silent', () => {
    for (const command of POSITIVE) {
      const r = run(seeded(), ['commit-release'], bashCall('sess1', command));
      expect({ command, hit: r.out.includes(SENTINEL) }).toEqual({ command, hit: true });
    }
    for (const command of NEGATIVE) {
      const r = run(seeded(), ['commit-release'], bashCall('sess1', command));
      expect({ command, out: r.out }).toEqual({ command, out: '' });
    }
  });
});

// ── Round 3 fixes: R3-1 (ACL), R3-2 (stdout write failure), R3-3 (continuation at the cut),
//    R3-6 (refusal line), R3-7 (inherited shell options), R3-9 (id function import) ─────────────────

const CORE_TOOLS = ['cat', 'mkdir', 'rmdir', 'rm', 'awk', 'find', 'id', 'jq', 'ls', 'tr'];
const withoutTool = (name: string): string[] => CORE_TOOLS.filter((t) => t !== name);

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A PATH directory holding symlinks to exactly the named tools (so a missing tool is really missing). */
function toolBin(box: Sandbox, label: string, tools: string[]): string {
  const bin = join(box.tmp, `bin-${label}`);
  mkdirSync(bin, { recursive: true });
  for (const name of tools) {
    const found = Bun.which(name);
    if (found === null) throw new Error(`missing tool ${name}`);
    symlinkSync(found, join(bin, name));
  }
  return bin;
}

/**
 * Add an `ls` stub that prints a canned mode string for `-ld` / `-lde` to a tool bin. The bin must not
 * already contain `ls` (writing through a symlink would overwrite the real binary).
 */
function stubLs(bin: string): void {
  const path = join(bin, 'ls');
  if (existsSync(path) || lstatExists(path)) throw new Error(`refusing to overwrite ${path}`);
  writeFileSync(
    path,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  -ld) printf \'%s 2 u g 64 Jan 1 00:00 %s\\n\' "$STUB_MODE" "$2" ;;',
      '  -lde) printf \'%s 2 u g 64 Jan 1 00:00 %s\\n\' "$STUB_MODE" "$2"',
      '        [ -n "$STUB_ACL" ] && printf \' 0: group:everyone allow delete_child\\n\'',
      '        exit 0 ;;',
      '  *) exec /bin/ls "$@" ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(path, 0o755);
}

function stubbedRun(
  box: Sandbox,
  label: string,
  mode: string,
  extraEnv: Record<string, string> = {}
): RunResult {
  const bin = toolBin(box, label, withoutTool('ls'));
  stubLs(bin);
  return run(box, ['delegation'], delegationCall('sess1'), {
    PATH: bin,
    STUB_MODE: mode,
    ...extraEnv,
  });
}

/** Control characters (C0 and DEL) replaced by `?`, as the script prints paths. */
function printable(text: string): string {
  return [...text]
    .map((c) => {
      const code = c.charCodeAt(0);
      return code < 0x20 || code === 0x7f ? '?' : c;
    })
    .join('');
}

function expectOneRefusalLine(r: RunResult, ...needles: string[]): void {
  expect(r.rc).toBe(0);
  expect(r.out).toBe('');
  const lines = r.err.trim().split('\n');
  expect(lines.length).toBe(1);
  for (const needle of needles) expect(lines[0]).toContain(needle);
}

describe('context-pack-injector: extended ACLs are refused (R3-1)', () => {
  it('mode-string marker "+" is refused; plain, "@" (xattr) and "." (SELinux) are not', () => {
    for (const [label, mode] of [
      ['plain', 'drwx------'],
      ['xattr', 'drwx------@'],
      ['selinux', 'drwx------.'],
    ] as const) {
      const box = seeded();
      const r = stubbedRun(box, label, mode);
      expect({ label, hit: r.out.includes(SENTINEL), err: r.err }).toEqual({
        label,
        hit: true,
        err: '',
      });
    }
    const acl = seeded();
    const r = stubbedRun(acl, 'acl', 'drwx------+');
    expectOneRefusalLine(r, baseDir(acl), 'ACL');
    expect(readdirSync(baseDir(acl))).toEqual([]);
  });

  it('"@" with ACL entries listed by ls -e (macOS hides "+" behind "@") is refused', () => {
    const none = seeded();
    expect(stubbedRun(none, 'at-none', 'drwx------@').out).toContain(SENTINEL);
    const box = seeded();
    const r = stubbedRun(box, 'at-acl', 'drwx------@', { STUB_ACL: '1' });
    expectOneRefusalLine(r, baseDir(box), 'ACL');
  });

  it('a missing ls is reported as unverifiable and fails closed (control: with ls it injects)', () => {
    const ok = seeded();
    const withLs = run(ok, ['delegation'], delegationCall('sess1'), {
      PATH: toolBin(ok, 'with-ls', CORE_TOOLS),
    });
    expect(withLs.out).toContain(SENTINEL);

    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), {
      PATH: toolBin(box, 'no-ls', withoutTool('ls')),
    });
    expectOneRefusalLine(r, baseDir(box), 'ACL state cannot be verified');
  });

  // Real ACLs: macOS `chmod +a`. Where it is unavailable (Linux) these skip explicitly; the stub cases
  // above and the plain-directory cases keep running everywhere.
  function aclSupported(): boolean {
    const root = mkdtempSync(join(tmpdir(), 'ctxpack-acl-probe-'));
    cleanup.push(root);
    const r = Bun.spawnSync(['chmod', '+a', 'everyone allow list', root]);
    if (r.exitCode !== 0) return false;
    return /^\s*0:/m.test(Bun.spawnSync(['ls', '-lde', root]).stdout.toString());
  }
  const ACL_ENTRY = 'everyone allow list,add_file,search,add_subdirectory,delete_child';
  const aclIt = aclSupported() ? it : it.skip;
  const addAcl = (path: string, entry = ACL_ENTRY): void => {
    const r = Bun.spawnSync(['chmod', '+a', entry, path]);
    expect(r.exitCode).toBe(0);
  };

  it('a plain 0700 base and session dir inject with empty stderr (control for the ACL cases)', () => {
    const box = seeded();
    mkTree(box, 'sess1');
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expect(r.out).toContain(SENTINEL);
    expect(r.err).toBe('');
  });

  aclIt('real ACL on a pre-created 0700 base is refused', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    expect(setMode(baseDir(box), 0o700)).toBe(true);
    addAcl(baseDir(box));
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(r, baseDir(box), 'ACL');
    expect(readdirSync(baseDir(box))).toEqual([]);
  });

  aclIt('real ACL on the session dir is refused (base stays clean)', () => {
    const box = seeded();
    const dir = mkTree(box, 'sess1');
    addAcl(dir);
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(r, dir, 'ACL');
    expect(readdirSync(dir)).toEqual([]);
  });

  aclIt('an inheritable ACL on TMPDIR (base is created with it) is refused', () => {
    const box = seeded();
    addAcl(box.tmp, `${ACL_ENTRY},file_inherit,directory_inherit`);
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(r, baseDir(box), 'ACL');
    expect(r.out).toBe('');
  });

  aclIt('--reset refuses an ACL base and says the reset was skipped', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    expect(setMode(baseDir(box), 0o700)).toBe(true);
    addAcl(baseDir(box));
    expectOneRefusalLine(run(box, ['--reset'], resetCall('sess1')), baseDir(box), 'ACL');
  });
});

describe('context-pack-injector: stdout write failure releases the marker (R3-2)', () => {
  const closedStdout = (box: Sandbox, args: string[], payload: unknown): RunResult => {
    const r = Bun.spawnSync([BASH, '-c', 'exec "$INNER" "$0" "$@" >&-', SCRIPT, ...args], {
      stdin: new TextEncoder().encode(JSON.stringify(payload)),
      env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project, INNER: BASH },
    });
    return { rc: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
  // The reader exits at once, so the hook's write hits a pipe with no reader (default SIGPIPE
  // disposition for the child); the outer shell reports the hook's own status.
  const readerGone = (box: Sandbox, args: string[], payload: unknown): RunResult => {
    const r = Bun.spawnSync(
      [BASH, '-c', '"$INNER" "$0" "$@" | { :; }; s=$PIPESTATUS; exit "$s"', SCRIPT, ...args],
      {
        stdin: new TextEncoder().encode(JSON.stringify(payload)),
        env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project, INNER: BASH },
      }
    );
    return { rc: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  for (const [label, invoke] of [
    ['closed stdout (>&-)', closedStdout],
    ['stdout pipe whose reader is gone', readerGone],
  ] as const) {
    for (const [pack, payload] of [
      ['delegation', delegationCall('sess1')],
      ['commit-release', bashCall('sess1', 'git push')],
    ] as const) {
      it(`${pack}, ${label}: exit 0, no marker left, the next normal run injects`, () => {
        const box = seeded();
        const failed = invoke(box, [pack], payload);
        expect(failed.rc).toBe(0);
        expect(existsSync(join(markerDir(box, 'sess1'), `${pack}-main`))).toBe(false);
        const next = run(box, [pack], payload);
        expect(context(next.out)).toContain(SENTINEL);
        expect(existsSync(join(markerDir(box, 'sess1'), `${pack}-main`))).toBe(true);
      });
    }
  }

  it('control: a normal run keeps its marker (the rollback only happens on a failed write)', () => {
    const box = seeded();
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toContain(SENTINEL);
    expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(true);
    expect(run(box, ['delegation'], delegationCall('sess1')).out).toBe('');
  });
});

describe('context-pack-injector: a backslash-newline continuation at the cut is part of the token (R3-3)', () => {
  const LIMIT = 32768;
  const hit = (command: string, sid: string): boolean =>
    run(seeded(), ['commit-release'], bashCall(sid, command)).out.includes(SENTINEL);

  it('git push\\<newline>over cut after the newline or inside "over" stays silent; a complete push still matches', () => {
    const joined = '; git push\\\n';
    // cut lands right after the continuation, and two bytes into "over"
    expect(hit(`${'a'.repeat(LIMIT - joined.length)}${joined}over`, 's1')).toBe(false);
    expect(hit(`${'a'.repeat(LIMIT - joined.length - 2)}${joined}over`, 's2')).toBe(false);
    // controls: "push" is a complete token when a space precedes the continuation, same cut position
    const spaced = '; git push \\\n';
    expect(hit(`${'a'.repeat(LIMIT - spaced.length)}${spaced}over`, 's3')).toBe(true);
    expect(hit(`${'a'.repeat(LIMIT - spaced.length - 2)}${spaced}over`, 's4')).toBe(true);
    // untruncated: bash joins push\<newline>over into one word "pushover", which is no release command
    expect(hit(`${'a'.repeat(100)}${joined}over`, 's5')).toBe(false);
  });
});

describe('context-pack-injector: the refusal line stays one accurate line (R3-6)', () => {
  it('control characters in the printed path are replaced and the line stays single', () => {
    const control = seeded();
    const plain = run(control, ['delegation'], delegationCall('sess1'), {
      TMPDIR: join(control.tmp, 'missing-plain'),
    });
    expectOneRefusalLine(plain, 'does not exist');

    for (const dirty of ['a\nb', 'a\tb\x1bc', 'a\r\nb']) {
      const box = seeded();
      const missing = join(box.tmp, dirty, 'missing');
      const r = run(box, ['delegation'], delegationCall('sess1'), { TMPDIR: missing });
      expectOneRefusalLine(r, 'does not exist');
      expect(r.err).not.toContain('\x1b');
      expect(r.err).not.toContain('\r');
      expect(r.err).toContain(`${printable(dirty)}/missing`);
    }
  });

  it('find unavailable is reported as unverifiable, not as a wrong mode (control: with find it injects)', () => {
    const ok = seeded();
    const withFind = run(ok, ['delegation'], delegationCall('sess1'), {
      PATH: toolBin(ok, 'with-find', CORE_TOOLS),
    });
    expect(withFind.out).toContain(SENTINEL);

    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), {
      PATH: toolBin(box, 'no-find', withoutTool('find')),
    });
    expectOneRefusalLine(r, baseDir(box), 'mode cannot be verified', 'find is unavailable');
    expect(r.err).not.toContain('mode other than owner-only');
  });

  it('a wrong mode is still reported as a mode problem', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    expect(setMode(baseDir(box), 0o750)).toBe(true);
    const r = run(box, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(
      r,
      baseDir(box),
      'mode other than owner-only',
      'context pack not injected'
    );
  });

  it('--reset says the reset was skipped, injection says the pack was not injected', () => {
    const box = seeded();
    mkdirSync(baseDir(box));
    expect(setMode(baseDir(box), 0o777)).toBe(true);
    const reset = run(box, ['--reset'], resetCall('sess1'));
    expectOneRefusalLine(reset, baseDir(box), 'marker reset skipped');
    expect(reset.err).not.toContain('not injected');
    const inject = run(box, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(inject, baseDir(box), 'context pack not injected');
    expect(inject.err).not.toContain('reset');
  });
});

describe('context-pack-injector: inherited shell options are neutralised (R3-7)', () => {
  it('SHELLOPTS xtrace/errexit/nounset: normal path has empty stderr, rc 0, and injects', () => {
    const control = seeded();
    const base = run(control, ['delegation'], delegationCall('sess1'));
    expect(base.err).toBe('');
    for (const opts of ['xtrace:errexit', 'nounset', 'errexit', 'xtrace']) {
      const box = seeded();
      const r = run(box, ['delegation'], delegationCall('sess1'), { SHELLOPTS: opts });
      expect({ opts, rc: r.rc, err: r.err, hit: r.out.includes(SENTINEL) }).toEqual({
        opts,
        rc: 0,
        err: '',
        hit: true,
      });
      expect(context(r.out)).toBe(context(base.out));
    }
  });

  it('SHELLOPTS=verbose still exits 0 with valid JSON; only the few lines read before the switch-off are echoed', () => {
    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), { SHELLOPTS: 'verbose' });
    expect(r.rc).toBe(0);
    expect(context(r.out)).toContain(SENTINEL);
    expect(r.err.split('\n').length).toBeLessThan(12);
  });

  it('--reset with SHELLOPTS=errexit exits 0 when the session dir holds a foreign file', () => {
    for (const opts of [undefined, 'errexit', 'xtrace:errexit']) {
      const box = seeded();
      run(box, ['delegation'], delegationCall('sess1'));
      writeFileSync(join(markerDir(box, 'sess1'), 'notes.txt'), 'keep');
      const r = run(
        box,
        ['--reset'],
        resetCall('sess1'),
        opts === undefined ? {} : { SHELLOPTS: opts }
      );
      expect({ opts, rc: r.rc }).toEqual({ opts, rc: 0 });
      expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(false);
      expect(readFileSync(join(markerDir(box, 'sess1'), 'notes.txt'), 'utf-8')).toBe('keep');
    }
  });

  it('SHELLOPTS=noglob does not stop --reset from finding the markers (control: without it)', () => {
    for (const env of [{}, { SHELLOPTS: 'noglob' }] as Array<Record<string, string>>) {
      const box = seeded();
      run(box, ['delegation'], delegationCall('sess1'));
      expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(true);
      run(box, ['--reset'], resetCall('sess1'), env);
      expect(existsSync(join(markerDir(box, 'sess1'), 'delegation-main'))).toBe(false);
    }
  });

  it('the neutralising line comes before the script options, which stay intact', () => {
    const text = readFileSync(SCRIPT, 'utf-8');
    const neutralise = text.search(/^\{ set \+o allexport .*\+o xtrace; \}/m);
    const own = text.search(/^set -uo pipefail$/m);
    expect(neutralise).toBeGreaterThan(0);
    expect(own).toBeGreaterThan(neutralise);
  });
});

describe('context-pack-injector: an imported id function cannot choose the base (R3-9)', () => {
  it('BASH_FUNC_id%% returning another uid is bypassed: the base is omcustom-ctxpack-<real uid>', () => {
    const control = seeded();
    run(control, ['delegation'], delegationCall('sess1'));
    expect(readdirSync(control.tmp)).toEqual([`omcustom-ctxpack-${REAL_UID}`]);

    for (const fake of ['0', '4242']) {
      const box = seeded();
      const r = run(box, ['delegation'], delegationCall('sess1'), {
        'BASH_FUNC_id%%': `() { echo ${fake}; }`,
      });
      expect(context(r.out)).toContain(SENTINEL);
      expect(readdirSync(box.tmp)).toEqual([`omcustom-ctxpack-${REAL_UID}`]);
    }
  });
});

// ── Round 4 fixes: R4-1 (keyword/onecmd/noexec), R4-2 (EPIPE noise), R4-3 (cap warning path),
//    R4-4 (UTF-16 count), R4-5 (linear path cleaning), coverage of allexport / glob shopts ─────────

describe('context-pack-injector: keyword, onecmd and noexec never put anything on stdout (R4-1)', () => {
  it('SHELLOPTS=keyword: inject stdout is exactly the JSON object, reset and the off switch print nothing', () => {
    const env = { SHELLOPTS: 'keyword', FAKE_SECRET: 'sk-test-NOT-REAL' };
    const control = run(seeded(), ['delegation'], delegationCall('sess1'), {
      FAKE_SECRET: 'sk-test-NOT-REAL',
    });
    expect(control.out).not.toBe('');

    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), env);
    expect(r.rc).toBe(0);
    expect(r.out).toBe(control.out);
    expect(r.out).not.toContain('declare -x');
    expect(r.out).not.toContain('FAKE_SECRET');
    expect(() => JSON.parse(r.out)).not.toThrow();
    expect(r.err).toBe('');

    const reset = run(box, ['--reset'], resetCall('sess1'), env);
    expect({ rc: reset.rc, out: reset.out, err: reset.err }).toEqual({ rc: 0, out: '', err: '' });
    const off = run(seeded(), ['delegation'], delegationCall('sess1'), {
      ...env,
      OMCUSTOM_CONTEXT_PACKS: 'off',
    });
    expect({ rc: off.rc, out: off.out, err: off.err }).toEqual({ rc: 0, out: '', err: '' });
  });

  it('SHELLOPTS=onecmd / noexec cannot be undone from inside: the hook ends silent, rc 0, no marker', () => {
    const control = seeded();
    expect(run(control, ['delegation'], delegationCall('sess1')).out).toContain(SENTINEL);
    for (const opts of ['onecmd', 'noexec']) {
      const box = seeded();
      for (const [args, payload] of [
        [['delegation'], delegationCall('sess1')],
        [['--reset'], resetCall('sess1')],
      ] as const) {
        const r = run(box, [...args], payload, { SHELLOPTS: opts });
        expect({ opts, rc: r.rc, out: r.out, err: r.err }).toEqual({
          opts,
          rc: 0,
          out: '',
          err: '',
        });
      }
      expect(existsSync(baseDir(box))).toBe(false);
    }
  });
});

describe('context-pack-injector: malformed large stdin prints nothing on stderr (R4-2)', () => {
  it('a 300 KB payload that is broken early exits 0 with empty stderr (control: a small valid payload injects)', () => {
    const control = run(seeded(), ['delegation'], delegationCall('sess1'));
    expect(control.out).toContain(SENTINEL);
    const bad = `{"session_id":"s1",, "pad":"${'x'.repeat(300000)}"}`;
    for (const pack of ['delegation', 'commit-release']) {
      const box = seeded();
      const r = run(box, [pack], bad);
      expect({ pack, rc: r.rc, out: r.out, err: r.err }).toEqual({
        pack,
        rc: 0,
        out: '',
        err: '',
      });
      expect(existsSync(baseDir(box))).toBe(false);
    }
  });
});

describe('context-pack-injector: the size-cap warning is one clean line (R4-3)', () => {
  it('a project dir with a newline and an ESC is printed with ? and stays one line (control: clean path)', () => {
    const body = 'a'.repeat(INJECT_CAP);
    const clean = seeded();
    writePack(clean, 'delegation', body);
    const cleanRun = run(clean, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(cleanRun, join(clean.project, '.claude', 'contexts', 'delegation.md'));
    expect(cleanRun.err).toContain('not injected');

    const box = sandbox();
    const project = join(box.tmp, 'pr\noj\x1b[31m');
    mkdirSync(join(project, '.claude', 'contexts'), { recursive: true });
    writeFileSync(join(project, '.claude', 'contexts', 'delegation.md'), body);
    const r = run(box, ['delegation'], delegationCall('sess1'), { CLAUDE_PROJECT_DIR: project });
    expectOneRefusalLine(r, printable(join(project, '.claude', 'contexts', 'delegation.md')));
    expect(r.err).not.toContain('\x1b');
    expect(r.err).toContain('not injected');
    expect(existsSync(markerDir(box, 'sess1'))).toBe(false);
  });
});

describe('context-pack-injector: the cap counts UTF-16 code units (R4-4)', () => {
  const overhead = (): number => {
    const box = sandbox();
    writePack(box, 'delegation', 'a');
    return context(run(box, ['delegation'], delegationCall('probe')).out).length - 1;
  };
  const astralPack = (box: Sandbox, astral: number, fill: number): void =>
    writePack(box, 'delegation', `${'\u{1F600}'.repeat(astral)}${'a'.repeat(fill)}`);

  it('astral-heavy packs: exactly the cap in UTF-16 units injects, one unit more does not, code points alone do not decide', () => {
    const base = overhead();
    const astral = 100;

    // control: exactly INJECT_CAP units (but only INJECT_CAP - astral code points) injects
    const fit = sandbox();
    astralPack(fit, astral, INJECT_CAP - base - 2 * astral);
    const fitRun = run(fit, ['delegation'], delegationCall('sess1'));
    expect(context(fitRun.out).length).toBe(INJECT_CAP);
    expect(existsSync(join(markerDir(fit, 'sess1'), 'delegation-main'))).toBe(true);

    // one unit more: skipped with the warning and no marker, though code points are far below the cap
    const over = sandbox();
    astralPack(over, astral, INJECT_CAP - base - 2 * astral + 1);
    const overRun = run(over, ['delegation'], delegationCall('sess1'));
    expectOneRefusalLine(overRun, String(INJECT_CAP + 1));
    expect(existsSync(markerDir(over, 'sess1'))).toBe(false);

    // all-astral pack at the code-point cap (INJECT_CAP code points, ~2x units) is skipped
    const heavy = sandbox();
    astralPack(heavy, INJECT_CAP - base, 0);
    const heavyRun = run(heavy, ['delegation'], delegationCall('sess1'));
    expect(heavyRun.out).toBe('');
    // jq 1.8.1 may report a slightly higher count for 4-byte characters; the lower bound is exact
    const reported = Number(/injection is (\d+) chars/.exec(heavyRun.err)?.[1]);
    expect(reported).toBeGreaterThanOrEqual(base + 2 * (INJECT_CAP - base));
    expect(existsSync(markerDir(heavy, 'sess1'))).toBe(false);
  });
});

describe('context-pack-injector: path cleaning is linear (R4-5)', () => {
  const timed = (box: Sandbox, tmpdir: string): { ms: number; r: RunResult } => {
    const t0 = Date.now();
    const r = run(box, ['delegation'], delegationCall('sess1'), { TMPDIR: tmpdir });
    return { ms: Date.now() - t0, r };
  };

  it('a 64 KiB TMPDIR path finishes in time comparable to a short path and still yields one stderr line', () => {
    const box = seeded();
    const short = timed(box, join(box.tmp, 'missing'));
    expectOneRefusalLine(short.r, 'does not exist');
    const long = timed(box, `/nonexistent/${'a'.repeat(65536)}`);
    expectOneRefusalLine(long.r, 'does not exist');
    expect(long.r.err.length).toBeGreaterThan(65536);
    // the quadratic loop took ~25 s for this input; linear is a few ms above the short baseline
    expect(long.ms).toBeLessThan(short.ms * 30 + 2000);
  });

  it('C1 and Unicode controls pass through while the line stays single; C0 and DEL become ?', () => {
    const box = seeded();
    const missing = join(box.tmp, 'a\u0085b\u2028c\x01d\x7fe', 'missing');
    const r = run(box, ['delegation'], delegationCall('sess1'), { TMPDIR: missing });
    expect(r.err.trim().split('\n').length).toBe(1);
    expect(r.err).toContain('a\u0085b\u2028c?d?e/missing');
  });

  it('without tr the path is replaced by a fixed phrase and the line stays single (control: with tr)', () => {
    const ok = seeded();
    const withTr = run(ok, ['delegation'], delegationCall('sess1'), {
      TMPDIR: join(ok.tmp, 'missing'),
      PATH: toolBin(ok, 'with-tr', CORE_TOOLS),
    });
    expectOneRefusalLine(withTr, join(ok.tmp, 'missing'));

    const box = seeded();
    const r = run(box, ['delegation'], delegationCall('sess1'), {
      TMPDIR: join(box.tmp, 'missing'),
      PATH: toolBin(box, 'no-tr', withoutTool('tr')),
    });
    expectOneRefusalLine(r, '(path hidden: tr is unavailable)', 'does not exist');
  });
});

describe('context-pack-injector: allexport and glob shopts are observably neutralised', () => {
  it('SHELLOPTS=allexport does not export the script variables to its children (control: the child ran)', () => {
    const box = seeded();
    const bin = toolBin(box, 'find-spy', withoutTool('find'));
    const log = join(box.tmp, 'child-env.log');
    const realFind = Bun.which('find');
    if (realFind === null) throw new Error('missing tool find');
    writeFileSync(join(bin, 'find'), `#!/bin/sh\nexport -p >> '${log}'\nexec '${realFind}' "$@"\n`);
    chmodSync(join(bin, 'find'), 0o755);
    const r = run(box, ['delegation'], delegationCall('sess1'), {
      PATH: bin,
      SHELLOPTS: 'allexport',
    });
    expect(context(r.out)).toContain(SENTINEL);
    const env = readFileSync(log, 'utf-8');
    expect(env).toMatch(/\bTMPDIR=/); // control: the spy ran and listed the real exports
    for (const name of ['base', 'dir', 'sid', 'uid', 'mode', 'pack', 'agent']) {
      expect(env).not.toMatch(new RegExp(`(declare -x|export) ${name}=`));
    }
  });

  const withFlags = (box: Sandbox, flags: string[], args: string[]): RunResult => {
    const r = Bun.spawnSync([BASH, ...flags, SCRIPT, ...args], {
      stdin: new TextEncoder().encode(JSON.stringify(resetCall('sess1'))),
      env: { ...baseEnv(), TMPDIR: box.tmp, CLAUDE_PROJECT_DIR: box.project },
    });
    return { rc: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  it('bash -O failglob: --reset on an empty session dir stays silent (control: no flag)', () => {
    for (const flags of [[], ['-O', 'failglob']]) {
      const box = seeded();
      const dir = mkTree(box, 'sess1');
      const r = withFlags(box, flags, ['--reset']);
      expect({ flags, rc: r.rc, err: r.err }).toEqual({ flags, rc: 0, err: '' });
      expect(existsSync(dir)).toBe(false); // the empty session dir was removed by the reset
    }
  });

  it('bash -O nocasematch: --reset leaves a differently-cased marker dir alone (control: it removes the real one)', () => {
    for (const flags of [[], ['-O', 'nocasematch']]) {
      const box = seeded();
      const dir = mkTree(box, 'sess1');
      mkdirSync(join(dir, 'DELEGATION-other'), { mode: 0o700 });
      mkdirSync(join(dir, 'delegation-main'), { mode: 0o700 });
      const r = withFlags(box, flags, ['--reset']);
      expect({ flags, rc: r.rc }).toEqual({ flags, rc: 0 });
      expect(readdirSync(dir)).toEqual(['DELEGATION-other']);
    }
  });
});

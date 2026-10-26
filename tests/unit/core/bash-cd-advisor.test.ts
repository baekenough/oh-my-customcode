// Fixtures for .claude/hooks/scripts/bash-cd-advisor.sh (#1834 / #1816 H2).
// Positive: a top-level `cd` (paren depth 0, outside quotes, $( ) and backticks).
// Negative: subshell / quoted / substitution / lookalike forms.
import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';

const SCRIPT = resolve(import.meta.dir, '../../../.claude/hooks/scripts/bash-cd-advisor.sh');

function run(stdin: string, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], {
    stdin: new TextEncoder().encode(stdin),
    env: { ...process.env, ...env },
  });
  return {
    rc: r.exitCode,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
  };
}

function runCmd(command: string) {
  return run(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
}

const POSITIVE = [
  'cd sub && pwd',
  'cd sub; ls',
  'cd sub',
  'cd X && ( make )',
  'git status && cd sub',
  'echo start\ncd sub\nls',
  // pushd / popd change the cwd too
  'pushd sub',
  'pushd sub >/dev/null && ls',
  'popd',
  // command-start prefix keywords and assignments
  'if cd sub; then ls; fi',
  'if true; then cd sub; fi',
  'for d in a b; do cd "$d"; done',
  'if false; then :; else cd sub; fi',
  '{ cd sub; ls; }',
  'time cd sub',
  '! cd sub',
  'FOO=1 cd sub',
  'FOO="a b" BAR=2 cd sub',
  'builtin cd sub',
  'command cd sub',
  // heredoc bodies are skipped, so quote/paren in them no longer corrupt the scan
  "cat <<'EOF' > n.txt\nit's here\nEOF\ncd sub",
  'cat <<EOF > n.txt\n(see #1\nEOF\ncd sub',
  'cat <<-EOF\n\tbody\n\tEOF\ncd sub',
  // redirect ampersands are not backgrounding
  'cd sub 2>&1',
  'cd sub &>/dev/null; ls',
  // a piped/backgrounded cd earlier does not hide a later persistent one
  'ls | cd a; cd b',
  'cd a & cd b',
  // last pipeline element runs in the current shell under zsh (the Bash tool shell)
  'ls | cd sub',
  'ls 2>&1 | cd sub',
  'ls |& cd sub',
  'echo $((1<<2))\ncd sub',
];

const NEGATIVE = [
  '( cd sub && pwd )',
  'echo "cd sub"',
  "echo 'cd x && y'",
  'cdk deploy',
  'git -C sub status',
  'x=$(cd sub && pwd)',
  'x=`cd sub && pwd`',
  'abcd sub',
  // non-last pipeline elements and backgrounded commands run in subshells
  'cd sub | cat',
  'echo `date` cd sub',
  'cd sub &',
  // heredoc body text is data, not a command
  'cat <<EOF > f.sh\ncd sub\nEOF',
  'git commit -m "$(cat <<\'EOF\'\ncd x\nEOF\n)"',
  // pushd/popd lookalikes and subshell forms
  '( pushd sub && ls )',
  'echo pushd popd',
  'pushdx sub',
  'echo hi # cd sub',
  // pre-filter: no cd-like substring at all
  'ls -la && git status',
];

describe('bash-cd-advisor.sh', () => {
  for (const cmd of POSITIVE) {
    it(`warns on top-level cd: ${JSON.stringify(cmd)}`, () => {
      const r = runCmd(cmd);
      expect(r.rc).toBe(0);
      const j = JSON.parse(r.out);
      expect(j.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(j.hookSpecificOutput.additionalContext).toContain('R005');
      // advisory only: no decision fields, no input rewrite
      expect(r.out).not.toContain('permissionDecision');
      expect(r.out).not.toContain('"decision"');
      expect(r.out).not.toContain('updatedInput');
    });
  }

  for (const cmd of NEGATIVE) {
    it(`stays silent: ${JSON.stringify(cmd)}`, () => {
      const r = runCmd(cmd);
      expect(r.rc).toBe(0);
      expect(r.out).toBe('');
    });
  }

  it('fails open on non-object stdin', () => {
    for (const s of [
      '',
      'not json',
      '[1,2]',
      '"cd x"',
      'null',
      '{"tool_input":{}}',
      '{"tool_input":{"command":5}}',
    ]) {
      const r = run(s);
      expect(r.rc).toBe(0);
      expect(r.out).toBe('');
    }
  });

  it('is disabled by OMCUSTOM_CD_ADVISOR=off', () => {
    const r = run(JSON.stringify({ tool_input: { command: 'cd sub' } }), {
      OMCUSTOM_CD_ADVISOR: 'off',
    });
    expect(r.rc).toBe(0);
    expect(r.out).toBe('');
  });

  it('documents eval/bash -c string cd as an unseen form (limitation)', () => {
    expect(runCmd('eval "cd x"').out).toBe('');
    expect(runCmd("bash -c 'cd x'").out).toBe('');
  });

  it('documents function bodies and case arms as unseen (limitation)', () => {
    expect(runCmd('f() { cd x; }; f').out).toBe('');
    expect(runCmd('case $x in a) cd /x;; esac').out).toBe('');
  });

  it('documents command -p cd (option between prefix and cd) as unseen (limitation)', () => {
    expect(runCmd('command -p cd x').out).toBe('');
  });

  it('handles long commands in linear time', () => {
    for (const n of [30000, 60000]) {
      const t0 = Date.now();
      const r = runCmd(`echo cd ${'a'.repeat(n)}`);
      expect(r.rc).toBe(0);
      expect(r.out).toBe('');
      expect(Date.now() - t0).toBeLessThan(3000);
    }
    const hit = runCmd(`echo ${'a'.repeat(30000)}\ncd x`);
    expect(hit.out).toContain('CD Advisory');
  });
});

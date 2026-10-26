import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #1775: stdin-field assumptions of three hook scripts, checked against payloads
// measured on CC 2.1.310 (`claude -p`, model haiku, one run).

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../.claude/hooks/scripts');
const ADVISOR = join(SCRIPTS_DIR, 'subagent-failure-advisor.sh');
const CWD_DETECTOR = join(SCRIPTS_DIR, 'cwd-change-detector.sh');
const FILE_VALIDATOR = join(SCRIPTS_DIR, 'file-change-validator.sh');

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hook-fields-1775-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function run(script: string, stdin: string) {
  const r = spawnSync('bash', [script], { input: stdin, encoding: 'utf8', timeout: 20000 });
  return { rc: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Probe-shaped PostToolUseFailure payload (Agent tool, nonexistent subagent_type).
const failure = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    session_id: 's',
    cwd: '/x',
    permission_mode: 'bypassPermissions',
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Agent',
    tool_input: { description: 'x', prompt: 'hi', subagent_type: 'no-such-agent-qqq' },
    tool_use_id: 't',
    error:
      "Agent type 'no-such-agent-qqq' not found. Available agents: claude, Explore, general-purpose",
    is_interrupt: false,
    duration_ms: 1,
    ...over,
  });

describe('subagent-failure-advisor.sh (PostToolUseFailure)', () => {
  it('emits additionalContext JSON with subagent_type and error on failure', () => {
    const r = run(ADVISOR, failure());
    expect(r.rc).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUseFailure');
    expect(out.hookSpecificOutput.additionalContext).toContain('no-such-agent-qqq');
    expect(out.hookSpecificOutput.additionalContext).toContain('not found');
    expect(out.decision).toBeUndefined();
  });

  it('also handles the Task tool name', () => {
    const r = run(ADVISOR, failure({ tool_name: 'Task' }));
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain('Task call failed');
  });

  it('is silent for interrupts', () => {
    const r = run(ADVISOR, failure({ is_interrupt: true }));
    expect(r.rc).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('is silent for non-Agent tools', () => {
    const r = run(ADVISOR, failure({ tool_name: 'Bash' }));
    expect(r.rc).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('is silent when error is missing or empty', () => {
    expect(run(ADVISOR, failure({ error: undefined })).stdout).toBe('');
    expect(run(ADVISOR, failure({ error: '' })).stdout).toBe('');
  });

  it('exits 0 silently on non-object or invalid stdin', () => {
    for (const s of ['[1]', '"str"', '42', 'not json', '']) {
      const r = run(ADVISOR, s);
      expect(r.rc).toBe(0);
      expect(r.stdout).toBe('');
    }
  });

  it('does not fire on a SubagentStop-shaped payload (no error field)', () => {
    const r = run(
      ADVISOR,
      JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'x', agent_id: 'a' })
    );
    expect(r.rc).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('mutation: removing the .error read makes the failure fixture fail', () => {
    const dir = mkdtempSync(join(tmp, 'mut-'));
    const mutant = join(dir, 'advisor.sh');
    copyFileSync(ADVISOR, mutant);
    const src = readFileSync(mutant, 'utf8');
    expect(src).toContain('(.error // "")');
    writeFileSync(mutant, src.replace('(.error // "")', '("")'));
    const r = run(mutant, failure());
    expect(r.stdout).toBe(''); // original emits advisory; mutant goes silent
  });
});

describe('cwd-change-detector.sh (CwdChanged)', () => {
  it('reads top-level new_cwd from a probe-shaped payload', () => {
    const proj = join(tmp, 'proj');
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, 'go.mod'), 'module x\n');
    const payload = JSON.stringify({
      session_id: 's',
      cwd: proj,
      hook_event_name: 'CwdChanged',
      old_cwd: tmp,
      new_cwd: proj,
    });
    const r = run(CWD_DETECTOR, payload);
    expect(r.rc).toBe(0);
    expect(r.stderr).toContain('Go project detected');
  });

  it('is silent for a directory with no indicators', () => {
    const empty = join(tmp, 'empty');
    mkdirSync(empty, { recursive: true });
    const r = run(CWD_DETECTOR, JSON.stringify({ old_cwd: tmp, new_cwd: empty }));
    expect(r.stderr).toBe('');
  });
});

describe('file-change-validator.sh (FileChanged)', () => {
  it('reads top-level file_path and the documented `event` field', () => {
    const r = run(
      FILE_VALIDATOR,
      JSON.stringify({
        hook_event_name: 'FileChanged',
        file_path: '/p/CLAUDE.md',
        event: 'unlink',
      })
    );
    expect(r.rc).toBe(0);
    expect(r.stderr).toContain('unlink /p/CLAUDE.md');
    expect(r.stderr).toContain('Configuration file changed');
  });

  it('also matches a relative CLAUDE.md path (defensive)', () => {
    const r = run(
      FILE_VALIDATOR,
      JSON.stringify({ hook_event_name: 'FileChanged', file_path: 'CLAUDE.md', event: 'change' })
    );
    expect(r.rc).toBe(0);
    expect(r.stderr).toContain('Configuration file changed');
  });

  it.each([
    '/p/package-lock.json',
    '/p/pnpm-lock.yaml',
    '/p/bun.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'bun.lock',
  ])('emits the lock-file message for %s', (file) => {
    const r = run(
      FILE_VALIDATOR,
      JSON.stringify({ hook_event_name: 'FileChanged', file_path: file, event: 'change' })
    );
    expect(r.rc).toBe(0);
    expect(r.stderr).toContain(`change ${file}`);
    expect(r.stderr).toContain('Lock file changed');
    expect(r.stderr).not.toContain('Configuration file changed');
  });
});

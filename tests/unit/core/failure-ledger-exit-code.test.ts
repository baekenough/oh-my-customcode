import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #1834 / #1814 R2. Fixture shape: measured PostToolUseFailure payload (CC 2.1.310, claude -p,
// sanitized). The script path can be overridden to run a mutated scratch copy.
const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const LEDGER_SCRIPT =
  process.env.OMC_TEST_FAILURE_LEDGER_SCRIPT ?? join(SCRIPTS_DIR, 'failure-ledger.sh');
const ADVISOR_SCRIPT = join(SCRIPTS_DIR, 'fail-axis-cause-advisor.sh');

function payload(over: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    session_id: 'SESSION_ID',
    transcript_path: '/PATH/transcript.jsonl',
    cwd: '/PATH/proj',
    prompt_id: 'PROMPT_ID',
    permission_mode: 'bypassPermissions',
    effort: { level: 'medium' },
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_input: { command: "sh -c 'exit 3'", description: 'Run shell that exits with status 3' },
    tool_use_id: 'TOOL_USE_ID',
    error: 'Exit code 3',
    is_interrupt: false,
    duration_ms: 20,
  };
  const merged = { ...base, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  return JSON.stringify(merged);
}

describe('failure-ledger.sh exit_code (#1834)', () => {
  let dir: string;
  let ledger: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omcc-exitcode-'));
    ledger = join(dir, 'ledger.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function record(input: string): Record<string, unknown> {
    const r = spawnSync('bash', [LEDGER_SCRIPT], {
      input,
      env: { ...process.env, OMCUSTOM_ERROR_LEDGER: ledger },
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const lines = readFileSync(ledger, 'utf-8').split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    return JSON.parse(lines[0]) as Record<string, unknown>;
  }

  it('parses "Exit code 3" to 3 and keeps existing fields', () => {
    const rec = record(payload());
    expect(rec.exit_code).toBe(3);
    expect(rec.err).toBe('Exit code 3');
    expect(rec.tool).toBe('Bash');
    expect(rec.session).toBe('SESSION_ID');
    expect(rec.interrupt).toBe(false);
  });

  it('parses "Exit code 1" to 1', () => {
    expect(record(payload({ error: 'Exit code 1' })).exit_code).toBe(1);
  });

  it('parses a prefix match followed by output text', () => {
    expect(record(payload({ error: 'Exit code 127\nsh: foo: not found' })).exit_code).toBe(127);
  });

  it('is null when the error lacks the prefix', () => {
    expect(record(payload({ error: 'Command exited with non-zero status code 1' })).exit_code).toBe(
      null
    );
  });

  it('is null when error is missing', () => {
    expect(record(payload({ error: undefined })).exit_code).toBe(null);
  });
});

describe('failure-ledger.sh HOME guard', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omcc-homeguard-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(home: string | undefined) {
    const env: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete env.OMCUSTOM_ERROR_LEDGER;
    if (home === undefined) delete env.HOME;
    return spawnSync('bash', [LEDGER_SCRIPT], {
      input: payload(),
      env: env as NodeJS.ProcessEnv,
      cwd: dir,
      encoding: 'utf-8',
    });
  }

  it('exits 0 and writes nothing when HOME is unset', () => {
    const r = run(undefined);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('exits 0 and writes nothing when HOME is empty (relative path under cwd)', () => {
    const r = run('');
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('exits 0 and writes nothing when HOME is relative', () => {
    const r = run('rel-home');
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, 'rel-home'))).toBe(false);
  });

  it('writes the record under an absolute temp HOME', () => {
    const home = join(dir, 'home');
    const r = run(home);
    expect(r.status).toBe(0);
    const lines = readFileSync(join(home, '.claude', 'error-ledger.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean);
    expect(lines.length).toBe(1);
  });
});

describe('fail-axis-cause-advisor.sh wording (#1834)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omcc-advwording-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('requires a one-line hypothesis, conditions confirmation, and has no decision key', () => {
    const ledger = join(dir, 'ledger.jsonl');
    spawnSync('bash', [LEDGER_SCRIPT], {
      input: payload(),
      env: { ...process.env, OMCUSTOM_ERROR_LEDGER: ledger },
    });
    const r = spawnSync('bash', [ADVISOR_SCRIPT], {
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'SESSION_ID',
        prompt: '계속해',
      }),
      env: {
        ...process.env,
        OMCUSTOM_ERROR_LEDGER: ledger,
        OMCUSTOM_FAIL_MARKER_DIR: dir,
      },
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Record<string, unknown> & {
      hookSpecificOutput: { additionalContext: string };
    };
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toContain('FAIL Advisory');
    expect(text).toContain('원인 가설을 한 줄로 명시');
    expect(text).toContain('묻지 말고 진행하라고 지시하지 않은 경우에만');
    expect(text).toContain('가설만 기록하고 진행');
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect('decision' in out).toBe(false);
    expect('decision' in out.hookSpecificOutput).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #1775: PostToolUse carries `tool_response`, never `tool_output` (probe: CC 2.1.310,
// `claude -p`, one run). Both hooks must read tool_response first and keep tool_output
// only as a legacy fallback.
const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const STUCK = resolve(SCRIPTS_DIR, 'stuck-detector.sh');
const TRACKER = resolve(SCRIPTS_DIR, 'auto-dev-token-tracker.sh');

let rt: string;
let historyFile: string;

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_') && !k.startsWith('BASH_FUNC_') && k !== 'OMCUSTOM_STUCK_HISTORY_FILE')
      e[k] = v;
  }
  return {
    ...e,
    HOME: join(rt, 'home'),
    TMPDIR: join(rt, 'tmp'),
    OMCUSTOM_STUCK_HISTORY_FILE: historyFile,
    ...extra,
  };
}

function runStuck(payload: unknown) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync('bash', [STUCK], { input, env: env(), encoding: 'utf-8' });
}

function lastEntry(): Record<string, string> {
  const lines = readFileSync(historyFile, 'utf-8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

const bashInput = { command: 'git grep -n foo' };
// Probe-shaped Bash tool_response (keys as measured in the PostToolUse dump).
const bashResponse = (stdout: string) => ({
  interrupted: false,
  isImage: false,
  noOutputExpected: false,
  stderr: '',
  stdout,
});

describe('#1775 stuck-detector.sh reads tool_response', () => {
  beforeEach(() => {
    rt = mkdtempSync(join(tmpdir(), 'omcc-1775-'));
    for (const d of ['home', 'tmp']) mkdirSync(join(rt, d));
    historyFile = join(rt, 'history.jsonl');
  });
  afterEach(() => rmSync(rt, { recursive: true, force: true }));

  it('F1 probe-shaped Bash tool_response: preview comes from stdout', () => {
    const r = runStuck({
      tool_name: 'Bash',
      tool_input: bashInput,
      tool_response: bashResponse('hello from stdout'),
    });
    expect(r.status).toBe(0);
    expect(lastEntry().preview).toBe('hello from stdout');
  });

  it('F2 legacy tool_output payload still works', () => {
    const r = runStuck({
      tool_name: 'Bash',
      tool_input: bashInput,
      tool_output: { is_error: true, output: 'legacy boom' },
    });
    expect(r.status).toBe(0);
    const e = lastEntry();
    expect(e.preview).toBe('legacy boom');
    expect(e.is_error).toBe('true');
  });

  it('F3 tool_response.is_error is honoured (non-Bash shapes)', () => {
    runStuck({
      tool_name: 'Edit',
      tool_input: { file_path: '/x.ts', old_string: 'a' },
      tool_response: { is_error: true },
    });
    expect(lastEntry().is_error).toBe('true');
  });

  it('F4 string tool_response is used as the preview text (legacy path)', () => {
    const r = runStuck({ tool_name: 'Bash', tool_input: bashInput, tool_response: 'plain text' });
    expect(r.status).toBe(0);
    expect(lastEntry().preview).toBe('plain text');
  });

  for (const [name, value] of [
    ['number', 42],
    ['array', [1, 2]],
    ['boolean', true],
  ] as const) {
    it(`F5 non-object tool_response (${name}) does not crash`, () => {
      const r = runStuck({ tool_name: 'Bash', tool_input: bashInput, tool_response: value });
      expect(r.status).toBe(0);
      expect(lastEntry().preview).toBe('');
    });
  }

  it('F6 Write-shaped tool_response (no stdout) yields empty preview, rc 0', () => {
    const r = runStuck({
      tool_name: 'Write',
      tool_input: { file_path: '/x.ts', content: 'c' },
      tool_response: { content: 'c', filePath: '/x.ts', type: 'update', userModified: false },
    });
    expect(r.status).toBe(0);
    expect(lastEntry().preview).toBe('');
  });
});

describe('#1775 auto-dev-token-tracker.sh reads tool_response', () => {
  const state = `/tmp/.claude-pipeline-auto-dev-${process.pid}.json`;
  const log = `/tmp/auto-dev-spend-${process.pid}.json`;
  beforeEach(() => {
    rt = mkdtempSync(join(tmpdir(), 'omcc-1775-'));
    writeFileSync(state, JSON.stringify({ current_phase: 'p1' }));
    rmSync(log, { force: true });
  });
  afterEach(() => {
    rmSync(state, { force: true });
    rmSync(log, { force: true });
    rmSync(rt, { recursive: true, force: true });
  });

  function run(payload: unknown) {
    const r = spawnSync('bash', [TRACKER], {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
    });
    const entry = existsSync(log)
      ? JSON.parse(readFileSync(log, 'utf-8').trim().split('\n').pop() as string)
      : null;
    return { r, entry };
  }
  const base = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'x', prompt: 'abcd'.repeat(10) },
  };

  it('F7 async Agent launch shape: rc 0, tokens_out estimate is 0 (no result text)', () => {
    const { r, entry } = run({
      ...base,
      tool_response: {
        agentId: 'a1',
        canContinueAgent: true,
        canReadOutputFile: true,
        description: 'd',
        isAsync: true,
        outputFile: '/tmp/o',
        prompt: 'abcd'.repeat(10),
        resolvedModel: 'm',
        status: 'async_launched',
      },
    });
    expect(r.status).toBe(0);
    expect(entry.tokens_in).toBe(10);
    expect(entry.tokens_out).toBe(0);
  });

  it('F8 string tool_response counts toward tokens_out', () => {
    const { r, entry } = run({ ...base, tool_response: 'x'.repeat(400) });
    expect(r.status).toBe(0);
    expect(entry.tokens_out).toBe(100);
  });

  it('F9 legacy tool_output still counted', () => {
    const { r, entry } = run({ ...base, tool_output: { output: 'x'.repeat(80) } });
    expect(r.status).toBe(0);
    expect(entry.tokens_out).toBe(20);
  });
});

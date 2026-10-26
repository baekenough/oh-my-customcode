import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #1884 item 6: a start_epoch that is not a positive decimal integer without a leading zero
// must take the "no start record" path. Before the fix "" made bash arithmetic read it as 0 and
// the recorded duration became now_epoch (about 1.79e9).

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const RECORDER = join(SCRIPTS_DIR, 'task-outcome-recorder.sh');
const STALL = join(SCRIPTS_DIR, 'stall-detection-advisor.sh');

// Both scripts key their state by $PPID. runHookScript spawns bash directly from this bun
// process, so $PPID is process.pid. Only these named paths are removed.
const START_FILE = `/tmp/.claude-agent-starts-${process.pid}`;
const OUTCOME_FILE = `/tmp/.claude-task-outcomes-${process.pid}`;
const DURATION_FILE = `/tmp/.claude-agent-durations-${process.pid}`;
const TASK_COUNT_FILE = `/tmp/.claude-task-count-${process.pid}`;
const STATE_FILES = [START_FILE, OUTCOME_FILE, DURATION_FILE, TASK_COUNT_FILE];

const INVALID_VALUES = ['', '0', 'null', 'abc', '1792939922.5', '09', '-5'];

let home: string;

function cleanup(): void {
  for (const f of STATE_FILES) rmSync(f, { force: true });
  rmSync(`${START_FILE}.tmp`, { force: true });
  rmSync(`${DURATION_FILE}.tmp`, { force: true });
}

beforeEach(() => {
  cleanup();
  home = mkdtempSync(join(tmpdir(), 'omcc-start-epoch-home-'));
});

afterEach(() => {
  cleanup();
  rmSync(home, { recursive: true, force: true });
});

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(script: string, stdin: string): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const child = spawn('bash', [script], {
      env: { ...process.env, HOME: home },
      cwd: tmpdir(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('close', (code: number | null) => {
      resolve_({ stdout, stderr, exitCode: code ?? -1 });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

const STOP_PAYLOAD = JSON.stringify({ agent_type: 'epoch-probe' });

function startLine(agentType: string, startEpoch: string): string {
  return `${JSON.stringify({ agent_type: agentType, start_epoch: startEpoch })}\n`;
}

async function lastDuration(file: string): Promise<number | undefined> {
  let text: string;
  try {
    text = await readFile(file, 'utf-8');
  } catch {
    return undefined;
  }
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return undefined;
  return JSON.parse(lines[lines.length - 1] as string).duration_seconds as number;
}

describe('#1884: task-outcome-recorder.sh start_epoch validation', () => {
  it('records a positive duration for a valid epoch', async () => {
    const now = Math.floor(Date.now() / 1000);
    await writeFile(START_FILE, startLine('epoch-probe', String(now - 100)));
    const result = await run(RECORDER, STOP_PAYLOAD);
    expect(result.exitCode).toBe(0);
    const duration = await lastDuration(OUTCOME_FILE);
    expect(duration).toBeGreaterThanOrEqual(95);
    expect(duration).toBeLessThan(1000);
  });

  for (const value of INVALID_VALUES) {
    it(`start_epoch ${JSON.stringify(value)} gives rc 0 and duration 0`, async () => {
      await writeFile(START_FILE, startLine('epoch-probe', value));
      const result = await run(RECORDER, STOP_PAYLOAD);
      expect(result.exitCode).toBe(0);
      expect(await lastDuration(OUTCOME_FILE)).toBe(0);
    });
  }
});

describe('#1884: stall-detection-advisor.sh start_epoch validation', () => {
  it('records a positive duration for a valid epoch', async () => {
    const now = Math.floor(Date.now() / 1000);
    await writeFile(START_FILE, startLine('epoch-probe', String(now - 100)));
    const result = await run(STALL, STOP_PAYLOAD);
    expect(result.exitCode).toBe(0);
    const duration = await lastDuration(DURATION_FILE);
    expect(duration).toBeGreaterThanOrEqual(95);
    expect(duration).toBeLessThan(1000);
  });

  for (const value of INVALID_VALUES) {
    it(`start_epoch ${JSON.stringify(value)} gives rc 0 and no duration record`, async () => {
      await writeFile(START_FILE, startLine('epoch-probe', value));
      const result = await run(STALL, STOP_PAYLOAD);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(STOP_PAYLOAD);
      expect(await lastDuration(DURATION_FILE)).toBeUndefined();
    });
  }

  // running_start of OTHER still-running agents (loop around the stall check).
  for (const value of ['', 'abc', '1792939922.5', '09', '-5']) {
    it(`running agent with start_epoch ${JSON.stringify(value)} is skipped without advisory`, async () => {
      const now = Math.floor(Date.now() / 1000);
      await writeFile(
        START_FILE,
        startLine('epoch-probe', String(now - 10)) + startLine('running-other', value)
      );
      await writeFile(
        DURATION_FILE,
        `${JSON.stringify({ agent_type: 'peer', duration_seconds: 5 })}\n`
      );
      const result = await run(STALL, STOP_PAYLOAD);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('Stalled: running-other');
    });
  }

  it('a valid but old running agent still triggers the advisory (positive control)', async () => {
    const now = Math.floor(Date.now() / 1000);
    await writeFile(
      START_FILE,
      startLine('epoch-probe', String(now - 10)) + startLine('running-other', String(now - 1000))
    );
    await writeFile(
      DURATION_FILE,
      `${JSON.stringify({ agent_type: 'peer', duration_seconds: 5 })}\n`
    );
    const result = await run(STALL, STOP_PAYLOAD);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Stalled: running-other');
  });
});

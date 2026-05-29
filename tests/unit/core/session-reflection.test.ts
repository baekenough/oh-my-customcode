/**
 * Tests for session-reflection.sh hook (Phase 1 MVP).
 *
 * The script is a Stop hook:
 * - Reads Stop-hook JSON from stdin
 * - Spawns a background worker to analyse the session transcript
 * - Immediately echoes stdin back to stdout (pass-through) and exits 0
 *
 * Test strategy:
 * - Use OMCUSTOM_TRANSCRIPT_BASE + OMCUSTOM_PROJECT_ROOT env-overrides to
 *   isolate every test in a temporary directory (no global state).
 * - Run the script directly against the templates/ canonical copy.
 * - Poll the reflection log after a short delay to verify background output.
 *
 * Fixtures
 * ─────────
 * 1. Clean transcript       → log emitted, R007=0 R008=0
 * 2. R007 violation         → R007 count ≥ 1, sample line in log
 * 3. R008 violation         → R008 count ≥ 1, sample line in log
 * 4. OMCUSTOM_SESSION_REFLECTION=off → analysis skipped, no log file
 * 5. Sample cap             → ≤ 3 sample entries even with 5 violations
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ── Canonical script path (tests always target templates/) ──
const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const SCRIPT = join(SCRIPTS_DIR, 'session-reflection.sh');

// ── Helpers ──

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run session-reflection.sh with given stdin and env overrides. */
function runScript(
  stdinJson: string,
  env: Record<string, string> = {},
  cwd?: string
): Promise<ScriptResult> {
  return new Promise((done) => {
    const child = spawn('bash', [SCRIPT], {
      env: { ...process.env, ...env },
      cwd: cwd ?? tmpdir(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('close', (code) => done({ stdout, stderr, exitCode: code ?? -1 }));
    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}

/** Build the Stop-hook JSON payload. */
function stopInput(sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, stop_reason: 'end_turn' });
}

/** Build a JSONL line for an assistant turn. */
function assistantTurn(content: object[]): string {
  return JSON.stringify({ role: 'assistant', content });
}

/**
 * Poll the reflection log until it contains expectedText, or timeout.
 * Returns the file content (or '' on timeout/absent).
 */
async function waitForLog(
  logPath: string,
  expectedText: string,
  timeoutMs = 8000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const text = await readFile(logPath, 'utf-8');
      if (text.includes(expectedText)) return text;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return existsSync(logPath) ? readFile(logPath, 'utf-8') : '';
}

// ── Per-test isolated environment ──

let tmpRoot: string;
let transcriptDir: string;
let reflectionsDir: string;

beforeEach(async () => {
  tmpRoot = join(tmpdir(), `sr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  transcriptDir = join(tmpRoot, 'transcripts');
  reflectionsDir = join(tmpRoot, '.claude', 'outputs', 'reflections');
  await mkdir(transcriptDir, { recursive: true });
  await mkdir(reflectionsDir, { recursive: true });
});

afterEach(async () => {
  // Give the disowned background worker time to finish writing before deleting tmpRoot.
  // The worker typically completes within 200ms; 2000ms is a safe upper bound.
  await new Promise((r) => setTimeout(r, 2000));
  await rm(tmpRoot, { recursive: true, force: true });
});

/** Write a .jsonl transcript and return the expected log path. */
async function writeTranscript(sessionId: string, lines: string[]): Promise<string> {
  await writeFile(join(transcriptDir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
  // bun:test forces TZ=UTC but the bash worker uses the system local date.
  // Use execFileSync('date', ['+%Y-%m-%d']) — same logic as the worker — to guarantee the paths match.
  const date = execFileSync('date', ['+%Y-%m-%d']).toString().trim();
  return join(reflectionsDir, `${date}.md`);
}

/** Common env overrides for an isolated test run. */
function testEnv(): Record<string, string> {
  return {
    OMCUSTOM_TRANSCRIPT_BASE: transcriptDir,
    OMCUSTOM_PROJECT_ROOT: tmpRoot,
  };
}

// ════════════════════════════════════════════════════════════════
// File existence & syntax
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — file existence', () => {
  it('exists at templates/.claude/hooks/scripts/session-reflection.sh', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('passes bash -n syntax check', async () => {
    const r = await new Promise<{ exitCode: number; stderr: string }>((res) => {
      const c = spawn('bash', ['-n', SCRIPT]);
      let stderr = '';
      c.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      c.on('close', (code) => res({ exitCode: code ?? -1, stderr }));
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════
// Pass-through protocol
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Stop hook pass-through', () => {
  it('echoes stdin unchanged and exits 0 (no transcript)', async () => {
    const input = stopInput('nonexistent-xyz');
    const r = await runScript(input);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(input);
  });

  it('exits 0 when jq is absent (PATH stripped)', async () => {
    const input = stopInput('no-jq-test');
    const r = await runScript(input, { PATH: '/usr/bin:/bin' });
    expect(r.exitCode).toBe(0);
  });

  it('exits 0 when session_id is missing from input', async () => {
    const input = JSON.stringify({ stop_reason: 'end_turn' });
    const r = await runScript(input);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 1: clean transcript
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Fixture 1: clean transcript', () => {
  it('emits log with R007=0 R008=0 when all turns are compliant', async () => {
    const sid = `clean-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'Hello' }] }),
      // valid R007 header + R008 prefix before tool_use
      assistantTurn([
        { type: 'text', text: '┌─ Agent: mgr-creator (sonnet)\n└─ Task: test' },
        {
          type: 'text',
          text: '[mgr-creator][sonnet] → Tool: Read\n[mgr-creator][sonnet] → Target: file.md',
        },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'file.md' } },
      ]),
      // shorthand header, no tool_use
      assistantTurn([{ type: 'text', text: '[claude] Answering question…' }]),
    ]);

    const r = await runScript(stopInput(sid), testEnv());
    expect(r.exitCode).toBe(0);

    const log = await waitForLog(logPath, `Session ${sid}`);
    expect(log).toContain(`Session ${sid}`);
    expect(log).toContain('**R007 violations**: 0');
    expect(log).toContain('**R008 violations**: 0');
    expect(log).toContain('Total assistant turns analyzed: 2');
  }, 15000);
});

// ════════════════════════════════════════════════════════════════
// Fixture 2: R007 violation
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Fixture 2: R007 violation', () => {
  it('detects missing agent header and increments R007 count', async () => {
    const sid = `r007-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      // violation: no header
      assistantTurn([{ type: 'text', text: 'Sure, I can help with that.' }]),
      // compliant: shorthand OK
      assistantTurn([{ type: 'text', text: '[claude] Here is the answer.' }]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 1');
    expect(log).toContain('**R007 violations**: 1');
    expect(log).toContain('Total assistant turns analyzed: 2');
    expect(log).toContain('[R007 turn');
  }, 15000);

  it('treats ┌─ Agent: as valid R007 header', async () => {
    const sid = `r007-full-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: something' }]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 0');
    expect(log).toContain('**R007 violations**: 0');
  }, 15000);

  it('treats [agent-name] shorthand as valid R007 header', async () => {
    const sid = `r007-shorthand-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: '[mgr-creator] Creating agent…' }]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 0');
    expect(log).toContain('**R007 violations**: 0');
  }, 15000);
});

// ════════════════════════════════════════════════════════════════
// Fixture 3: R008 violation
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Fixture 3: R008 violation', () => {
  it('detects missing tool prefix before tool_use block', async () => {
    const sid = `r008-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      // violation: tool_use directly after header text (no R008 prefix text between them)
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        // ← no [agent][model] → Tool: line here
        { type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'some.md' } },
      ]),
      // compliant: tool_use preceded by R008 prefix text
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: write' },
        { type: 'text', text: '[claude][sonnet] → Tool: Write\n[claude][sonnet] → Target: out.md' },
        {
          type: 'tool_use',
          id: 'tu3',
          name: 'Write',
          input: { file_path: 'out.md', content: 'x' },
        },
      ]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R008 violations**: 1');
    expect(log).toContain('**R008 violations**: 1');
    expect(log).toContain('[R008 turn');
    expect(log).toContain('missing prefix');
  }, 15000);

  it('does NOT flag tool_use when preceded by valid R008 prefix', async () => {
    const sid = `r008-ok-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: search' },
        { type: 'text', text: '[claude][sonnet] → Tool: Grep' },
        { type: 'tool_use', id: 'tu4', name: 'Grep', input: { pattern: 'test' } },
      ]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R008 violations**: 0');
    expect(log).toContain('**R008 violations**: 0');
  }, 15000);
});

// ════════════════════════════════════════════════════════════════
// Fixture 4: opt-out
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Fixture 4: opt-out', () => {
  it('skips analysis when OMCUSTOM_SESSION_REFLECTION=off', async () => {
    const sid = `opt-out-${Date.now()}`;
    // create transcript so the only skip reason is the env var
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: 'No header — would be R007 violation.' }]),
    ]);

    const date = execFileSync('date', ['+%Y-%m-%d']).toString().trim();
    const logPath = join(reflectionsDir, `${date}.md`);

    await runScript(stopInput(sid), {
      ...testEnv(),
      OMCUSTOM_SESSION_REFLECTION: 'off',
    });

    // give a moment to confirm nothing is written
    await new Promise((r) => setTimeout(r, 800));
    expect(existsSync(logPath)).toBe(false);
  });

  it('passes stdin through unchanged when opt-out active', async () => {
    const input = stopInput('opt-out-pass');
    const r = await runScript(input, {
      ...testEnv(),
      OMCUSTOM_SESSION_REFLECTION: 'off',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Sample cap: max 3 violation samples logged
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — sample cap', () => {
  it('logs at most 3 sample violation entries even with 5+ violations', async () => {
    const sid = `cap-${Date.now()}`;
    // 5 assistant turns each missing a header (5 R007 violations)
    const lines = Array.from({ length: 5 }, (_, i) =>
      assistantTurn([{ type: 'text', text: `Plain response ${i + 1} — no header` }])
    );
    const logPath = await writeTranscript(sid, lines);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 5');
    expect(log).toContain('**R007 violations**: 5');

    // Count [R007 turn N] occurrences — must be ≤ 3
    const matches = log.match(/\[R007 turn \d+\]/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(3);
  }, 15000);
});

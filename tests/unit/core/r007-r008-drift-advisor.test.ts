/**
 * Tests for r007-r008-drift-advisor.sh hook (proactive R007/R008 drift advisory, #1229).
 *
 * The script is a UserPromptSubmit hook:
 * - Reads UserPromptSubmit JSON from stdin (contains `session_id`)
 * - Reads the session transcript JSONL at `${OMCUSTOM_TRANSCRIPT_BASE}/${session_id}.jsonl`
 * - Inspects ONLY the LAST assistant turn for R007/R008 compliance
 * - If the last turn violates → emits a Korean advisory to stderr containing `[R007/R008 Advisory]`
 * - ALWAYS passes stdin through to stdout and exits 0 (never blocks)
 *
 * Test strategy:
 * - Use OMCUSTOM_TRANSCRIPT_BASE env-override to isolate every test in a temp directory.
 * - Run the script directly against the templates/ canonical copy.
 * - Synchronous result (no background worker) — advisory is emitted immediately.
 *
 * Fixtures
 * ─────────
 * 1. Clean last turn (header + tool prefixes present) → no advisory, exit 0, stdin passed through
 * 2. R007 violation in last turn (missing agent header) → advisory in stderr, exit 0
 * 3. R008 violation in last turn (tool_use without preceding prefix) → advisory in stderr, exit 0
 * 4. Opt-out OMCUSTOM_R007_ADVISOR=off → no advisory even with violating transcript, exit 0
 * 5. Missing transcript file → no advisory, exit 0, pass through (graceful degrade)
 * 6. Missing session_id in stdin → no advisory, exit 0, pass through
 * 7. Only-last-turn semantics: earlier turn violates but last turn is clean → no advisory
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ── Canonical script path (tests always target templates/) ──
const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const SCRIPT = join(SCRIPTS_DIR, 'r007-r008-drift-advisor.sh');

// ── Types ──

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ── Helpers ──

/** Run r007-r008-drift-advisor.sh with given stdin and env overrides. */
function runScript(stdinJson: string, env: Record<string, string> = {}): Promise<ScriptResult> {
  return new Promise((done) => {
    const child = spawn('bash', [SCRIPT], {
      env: { ...process.env, ...env },
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
    child.on('close', (code) => done({ stdout, stderr, exitCode: code ?? -1 }));
    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}

/** Build the UserPromptSubmit JSON payload. */
function promptInput(sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, prompt: 'Hello' });
}

/** Build a JSONL line for an assistant turn (mirrors session-reflection.test.ts format). */
function assistantTurn(content: object[]): string {
  return JSON.stringify({ role: 'assistant', content });
}

/** Build a JSONL line for a user turn. */
function userTurn(text: string): string {
  return JSON.stringify({ role: 'user', content: [{ type: 'text', text }] });
}

// ── Per-test isolated environment ──

let tmpRoot: string;
let transcriptDir: string;

beforeEach(async () => {
  tmpRoot = join(
    tmpdir(),
    `drift-advisor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  transcriptDir = join(tmpRoot, 'transcripts');
  await mkdir(transcriptDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/** Write a .jsonl transcript and return the session id. */
async function writeTranscript(sessionId: string, lines: string[]): Promise<string> {
  await writeFile(join(transcriptDir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
  return sessionId;
}

/** Common env overrides for an isolated test run. */
function testEnv(): Record<string, string> {
  return {
    OMCUSTOM_TRANSCRIPT_BASE: transcriptDir,
  };
}

// ════════════════════════════════════════════════════════════════
// File existence & syntax
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — file existence', () => {
  it('exists at templates/.claude/hooks/scripts/r007-r008-drift-advisor.sh', () => {
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
// Fixture 1: clean last turn — no advisory, exit 0, stdin passed through
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 1: clean last turn', () => {
  it('emits no advisory when last turn has valid R007 header and R008 prefixes', async () => {
    const sid = `clean-${Date.now()}`;
    await writeTranscript(sid, [
      userTurn('Please read a file.'),
      assistantTurn([
        { type: 'text', text: '┌─ Agent: lang-typescript-expert (sonnet)\n└─ Task: read file' },
        {
          type: 'text',
          text: '[lang-typescript-expert][sonnet] → Tool: Read\n[lang-typescript-expert][sonnet] → Target: file.ts',
        },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'file.ts' } },
      ]),
    ]);

    const input = promptInput(sid);
    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
    // stdin must be passed through unchanged
    expect(r.stdout.trim()).toBe(input);
  });

  it('emits no advisory when last turn uses shorthand [agent] header with no tool_use', async () => {
    const sid = `clean-shorthand-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: '[claude] Here is the answer to your question.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('passes stdin through to stdout unchanged on clean turn', async () => {
    const sid = `passthrough-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: answer' }]),
    ]);

    const input = promptInput(sid);
    const r = await runScript(input, testEnv());

    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 2: R007 violation in last turn
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 2: R007 violation', () => {
  it('emits [R007/R008 Advisory] when last turn first text line lacks agent header', async () => {
    const sid = `r007-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: 'Sure, I can help with that.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });

  it('exits 0 even on R007 violation (advisory-only, never blocks)', async () => {
    const sid = `r007-exit0-${Date.now()}`;
    await writeTranscript(sid, [assistantTurn([{ type: 'text', text: 'No header here at all.' }])]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
  });

  it('still passes stdin through to stdout on R007 violation', async () => {
    const sid = `r007-stdout-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: 'Missing identification header.' }]),
    ]);

    const input = promptInput(sid);
    const r = await runScript(input, testEnv());

    expect(r.stdout.trim()).toBe(input);
  });

  it('treats ┌─ Agent: prefix as valid R007 header (no advisory)', async () => {
    const sid = `r007-full-ok-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '┌─ Agent: mgr-creator (sonnet)\n└─ Task: create agent' },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('treats [agent-name] shorthand as valid R007 header (no advisory)', async () => {
    const sid = `r007-shorthand-ok-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: '[mgr-creator] Creating agent structure...' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 3: R008 violation in last turn
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3: R008 violation', () => {
  it('emits [R007/R008 Advisory] when tool_use is not preceded by R008 prefix text', async () => {
    const sid = `r008-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        // valid R007 header
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        // tool_use directly after header text — no [agent][model] → Tool: prefix in between
        { type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'some.md' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });

  it('emits advisory when tool_use is preceded by non-R008 text', async () => {
    const sid = `r008-bad-prefix-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: search' },
        // text exists but it doesn't match the R008 pattern
        { type: 'text', text: 'Let me search for that...' },
        { type: 'tool_use', id: 'tu5', name: 'Grep', input: { pattern: 'test' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });

  it('does NOT emit advisory when tool_use is preceded by valid R008 prefix', async () => {
    const sid = `r008-ok-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: write' },
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Write\n[claude][sonnet] → Target: out.md',
        },
        {
          type: 'tool_use',
          id: 'tu3',
          name: 'Write',
          input: { file_path: 'out.md', content: 'x' },
        },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('accepts → arrow variant in R008 prefix', async () => {
    const sid = `r008-arrow-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '[claude] Task start' },
        { type: 'text', text: '[claude][sonnet] -> Tool: Read' },
        { type: 'tool_use', id: 'tu6', name: 'Read', input: { file_path: 'x.md' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('passes stdin through to stdout on R008 violation', async () => {
    const sid = `r008-stdout-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu4', name: 'Read', input: { file_path: 'file.md' } },
      ]),
    ]);

    const input = promptInput(sid);
    const r = await runScript(input, testEnv());

    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 4: opt-out
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 4: opt-out', () => {
  it('emits no advisory when OMCUSTOM_R007_ADVISOR=off, even with R007 violation', async () => {
    const sid = `opt-out-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: 'No header — would be R007 violation.' }]),
    ]);

    const r = await runScript(promptInput(sid), {
      ...testEnv(),
      OMCUSTOM_R007_ADVISOR: 'off',
    });

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('passes stdin through unchanged when opt-out active', async () => {
    const sid = `opt-out-pass-${Date.now()}`;
    await writeTranscript(sid, [
      assistantTurn([{ type: 'text', text: 'Violation turn without header.' }]),
    ]);

    const input = promptInput(sid);
    const r = await runScript(input, {
      ...testEnv(),
      OMCUSTOM_R007_ADVISOR: 'off',
    });

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 5: missing transcript file (graceful degrade)
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 5: missing transcript', () => {
  it('exits 0 with no advisory when transcript file does not exist', async () => {
    const input = promptInput('nonexistent-session-xyz');
    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('passes stdin through unchanged when transcript is missing', async () => {
    const input = promptInput('no-transcript-session');
    const r = await runScript(input, testEnv());

    expect(r.stdout.trim()).toBe(input);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 6: missing session_id in stdin
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 6: missing session_id', () => {
  it('exits 0 with no advisory when session_id is absent from input JSON', async () => {
    const input = JSON.stringify({ prompt: 'Hello' });
    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('passes stdin through unchanged when session_id is missing', async () => {
    const input = JSON.stringify({ prompt: 'No session id here' });
    const r = await runScript(input, testEnv());

    expect(r.stdout.trim()).toBe(input);
  });

  it('exits 0 when jq is absent (PATH stripped)', async () => {
    const input = promptInput('no-jq-session');
    const r = await runScript(input, { PATH: '/usr/bin:/bin' });

    expect(r.exitCode).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 7: only-last-turn semantics
// The hook inspects ONLY the last assistant turn.
// An earlier turn that violates R007/R008 must NOT trigger an advisory
// if the last (most recent) turn is compliant.
// This distinguishes r007-r008-drift-advisor.sh from session-reflection.sh
// which scans ALL turns.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 7: only-last-turn semantics', () => {
  it('does NOT emit advisory when only an earlier turn violates R007 but the last is clean', async () => {
    const sid = `last-turn-${Date.now()}`;
    await writeTranscript(sid, [
      userTurn('First question'),
      // OLDER turn — R007 violation (no header)
      assistantTurn([{ type: 'text', text: 'This response has no identification header.' }]),
      userTurn('Second question'),
      // LAST turn — fully compliant R007 + R008
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: answer second question' },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('does NOT emit advisory when earlier turns violate R008 but the last is clean', async () => {
    const sid = `last-turn-r008-${Date.now()}`;
    await writeTranscript(sid, [
      userTurn('Read a file'),
      // OLDER turn — R008 violation (tool_use without R008 prefix)
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu-old', name: 'Read', input: { file_path: 'old.md' } },
      ]),
      userTurn('Now write a file'),
      // LAST turn — compliant: R007 header + R008 prefix before tool_use
      assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: write file' },
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Write\n[claude][sonnet] → Target: new.md',
        },
        {
          type: 'tool_use',
          id: 'tu-new',
          name: 'Write',
          input: { file_path: 'new.md', content: 'ok' },
        },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits advisory when the LAST turn violates even though all prior turns are clean', async () => {
    const sid = `last-turn-bad-${Date.now()}`;
    await writeTranscript(sid, [
      userTurn('First'),
      // OLDER turn — compliant
      assistantTurn([{ type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: answer first' }]),
      userTurn('Second'),
      // LAST turn — R007 violation
      assistantTurn([{ type: 'text', text: 'Forgot the header this time.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });
});

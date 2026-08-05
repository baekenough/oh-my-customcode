/**
 * Tests for r007-r008-drift-advisor.sh hook (proactive R007/R008 drift advisory,
 * #1229, #1545, #1547, #1553).
 *
 * The script is wired to UserPromptSubmit, SubagentStop AND PostToolUse:
 * - Reads the hook JSON from stdin (`session_id`, `hook_event_name`, `transcript_path`)
 * - Resolves the transcript: OMCUSTOM_TRANSCRIPT_BASE override wins (test isolation), then
 *   the payload's `transcript_path`, then the default project transcript directory.
 * - Reconstructs the LAST assistant TURN and inspects it for R007/R008 compliance
 * - If the turn violates → emits a Korean advisory to stderr (human-visible audit trail
 *   only — stderr on exit 0 is NEVER delivered to the model per the official hook spec) AND
 *   delivers the SAME advisory to Claude via `hookSpecificOutput.additionalContext` JSON on
 *   stdout, with `hookSpecificOutput.hookEventName` echoing the input's `hook_event_name`.
 * - NEVER includes a top-level `decision`/`continue`/`stopReason` field — this keeps the hook
 *   non-blocking for every wired event (R021 advisory-first enforcement).
 * - Missing `hook_event_name` → exit 0 with EMPTY stdout. There is deliberately NO
 *   "UserPromptSubmit" default: `hookSpecificOutput.hookEventName` must match the ACTUAL
 *   firing event, and a wrong value invalidates the output (#1553).
 * - Deduplicates per TURN: PostToolUse fires on every tool call, so the same turn must not
 *   produce a second advisory. The marker is the turn's first assistant-line `uuid`, stored
 *   under OMCUSTOM_R007_MARKER_DIR — derived purely from transcript content (no date/random).
 * - ALWAYS exits 0 (never blocks).
 *
 * ── Transcript schema (this is the part that was previously wrong) ──────────────────────
 * Measured 2026-08-05 against 771 real transcripts: JSONL lines carry NO top-level
 * `role`/`content`. Role lives at `.message.role`, blocks at `.message.content`, and there
 * is exactly ONE content block per line — so a single assistant TURN spans MULTIPLE lines.
 * `isSidechain: true` marks subagent lines. Tool results come back as `.message.role ==
 * "user"` with `tool_result` blocks and are NOT turn boundaries.
 *
 * The previous fixtures in this file used a top-level `{role, content:[...]}` shape, which
 * matched the script's buggy `.role`/`.content` selectors — so the suite passed green while
 * the hook had never fired in production even once. Fixtures below build the REAL schema.
 *
 * Test strategy:
 * - OMCUSTOM_TRANSCRIPT_BASE + OMCUSTOM_R007_MARKER_DIR env-overrides isolate every test.
 * - Run the script directly against the templates/ canonical copy.
 * - Synchronous result (no background worker) — advisory is emitted immediately.
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

/** Build a UserPromptSubmit JSON payload (hook_event_name defaults to UserPromptSubmit). */
function promptInput(sessionId: string, hookEventName = 'UserPromptSubmit'): string {
  return JSON.stringify({ session_id: sessionId, prompt: 'Hello', hook_event_name: hookEventName });
}

/** Build a SubagentStop JSON payload. */
function subagentStopInput(sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, hook_event_name: 'SubagentStop' });
}

/** Build a PostToolUse JSON payload (#1553 wiring). */
function postToolUseInput(sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, hook_event_name: 'PostToolUse' });
}

// ── Real-schema transcript line builders ──────────────────────────────────────────────
// One content block PER LINE — this is what real Claude Code transcripts look like.

let uuidSeq = 0;
function nextUuid(): string {
  uuidSeq += 1;
  return `uuid-${uuidSeq}`;
}

/**
 * Build the JSONL lines for ONE assistant turn: one line per content block.
 * Returns an ARRAY of lines — the multi-line turn helper that the old fixtures lacked.
 */
function assistantTurn(blocks: object[], opts: { sidechain?: boolean; uuid?: string } = {}) {
  const lines: string[] = [];
  blocks.forEach((block, idx) => {
    lines.push(
      JSON.stringify({
        type: 'assistant',
        uuid: idx === 0 && opts.uuid ? opts.uuid : nextUuid(),
        parentUuid: null,
        isSidechain: opts.sidechain === true,
        message: { role: 'assistant', content: [block] },
      })
    );
  });
  return lines;
}

/** Build a genuine user prompt line (string content) — this IS a turn boundary. */
function userTurn(text: string): string[] {
  return [
    JSON.stringify({
      type: 'user',
      uuid: nextUuid(),
      isSidechain: false,
      message: { role: 'user', content: text },
    }),
  ];
}

/**
 * Build a tool_result line. In real transcripts these arrive as `.message.role == "user"`
 * but they are NOT turn boundaries — an assistant turn continues across them.
 */
function toolResultLine(toolUseId: string): string[] {
  return [
    JSON.stringify({
      type: 'user',
      uuid: nextUuid(),
      isSidechain: false,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
      },
    }),
  ];
}

/**
 * Parse stdout as the #1547 advisory JSON contract and assert its shape:
 * valid JSON, hookSpecificOutput.{hookEventName,additionalContext} present,
 * no top-level decision/continue/stopReason (non-blocking).
 */
function parseAdvisoryOutput(stdout: string): {
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
} {
  const trimmed = stdout.trim();
  expect(trimmed.length).toBeGreaterThan(0);
  const parsed = JSON.parse(trimmed);
  expect(parsed).not.toHaveProperty('decision');
  expect(parsed).not.toHaveProperty('continue');
  expect(parsed).not.toHaveProperty('stopReason');
  expect(parsed.hookSpecificOutput).toBeDefined();
  expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string');
  return parsed;
}

// ── Per-test isolated environment ──

let tmpRoot: string;
let transcriptDir: string;
let markerDir: string;

beforeEach(async () => {
  tmpRoot = join(
    tmpdir(),
    `drift-advisor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  transcriptDir = join(tmpRoot, 'transcripts');
  markerDir = join(tmpRoot, 'markers');
  await mkdir(transcriptDir, { recursive: true });
  await mkdir(markerDir, { recursive: true });
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
    OMCUSTOM_R007_MARKER_DIR: markerDir,
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

  it('selects role/content from .message (real transcript schema), not top-level', async () => {
    // Regression guard for #1553: the top-level `.role` / `.content` selectors made this
    // hook a permanent no-op. Pin the corrected selectors in the source itself so a
    // revert is caught even if a fixture happens to be shaped forgivingly.
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('.message.role');
    expect(src).toContain('.message.content');
    expect(src).not.toMatch(/jq -r '\.role \/\/ empty'/);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 1: clean last turn — no advisory, exit 0, empty stdout
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 1: clean last turn', () => {
  it('emits no advisory when last turn has valid R007 header and R008 prefixes', async () => {
    const sid = `clean-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Please read a file.'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: lang-typescript-expert (sonnet)\n└─ Task: read file' },
        {
          type: 'text',
          text: '[lang-typescript-expert][sonnet] → Tool: Read\n[lang-typescript-expert][sonnet] → Target: file.ts',
        },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'file.ts' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
    // #1547: no advisory needed → stdout is empty (no pass-through, no JSON)
    expect(r.stdout.trim()).toBe('');
  });

  it('emits no advisory when last turn uses shorthand [agent] header with no tool_use', async () => {
    const sid = `clean-shorthand-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: '[claude] Here is the answer to your question.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits empty stdout on clean turn (no advisory, no JSON)', async () => {
    const sid = `passthrough-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: answer' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('ignores thinking blocks when checking R007/R008 adjacency', async () => {
    const sid = `clean-thinking-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Do something'),
      ...assistantTurn([
        { type: 'thinking', thinking: 'internal reasoning that is not user-visible' },
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'thinking', thinking: 'more reasoning' },
        { type: 'tool_use', id: 'tu-think', name: 'Read', input: { file_path: 'x.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 1b: multi-line turn reconstruction (#1553)
//
// Real transcripts store ONE content block per line. A turn spanning several lines must be
// reassembled before adjacency analysis; otherwise every tool_use sits at block index 0 of
// its own line and the R008 check reports a permanent false violation.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 1b: multi-line turn reconstruction', () => {
  it('reassembles a turn split across multiple JSONL lines (no false R008 violation)', async () => {
    const sid = `multiline-${Date.now()}`;
    const lines = [
      ...userTurn('Read then write'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: multi-step' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'tu-a', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ];
    // Sanity: this fixture really is multi-line (3 assistant lines, not one packed array).
    expect(lines.filter((l) => JSON.parse(l).message.role === 'assistant').length).toBe(3);
    await writeTranscript(sid, lines);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('continues the same turn across tool_result lines (tool_result is not a boundary)', async () => {
    const sid = `toolresult-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read two files'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read two' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'tu-b1', name: 'Read', input: { file_path: 'b1.md' } },
      ]),
      ...toolResultLine('tu-b1'),
      ...assistantTurn([
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'tu-b2', name: 'Read', input: { file_path: 'b2.md' } },
      ]),
      ...toolResultLine('tu-b2'),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    // The second tool_use belongs to the SAME turn (header already emitted at its start)
    // and is preceded by a valid R008 prefix → no advisory.
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('flags a multi-line turn whose tool_use lacks a preceding R008 prefix', async () => {
    const sid = `multiline-bad-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu-c', name: 'Read', input: { file_path: 'c.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 1c: isSidechain filtering (#1553)
// Subagent turns must never be attributed to the orchestrator.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 1c: isSidechain filtering', () => {
  it('ignores isSidechain:true lines when locating the last turn', async () => {
    const sid = `sidechain-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Delegate this'),
      // Orchestrator turn — fully compliant
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: delegate' },
        { type: 'text', text: '[claude][sonnet] → Tool: Agent' },
        { type: 'tool_use', id: 'tu-agent', name: 'Agent', input: { subagent_type: 'x' } },
      ]),
      // Subagent turns — violating, but must be excluded from analysis
      ...assistantTurn([{ type: 'text', text: 'Subagent response without any header.' }], {
        sidechain: true,
      }),
      ...assistantTurn([{ type: 'tool_use', id: 'sc-1', name: 'Read', input: {} }], {
        sidechain: true,
      }),
    ]);

    const r = await runScript(subagentStopInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('still flags the orchestrator turn when only sidechain lines follow it', async () => {
    const sid = `sidechain-bad-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Delegate this'),
      // Orchestrator turn — R007 violation
      ...assistantTurn([{ type: 'text', text: 'Delegating now, no header.' }]),
      // Clean subagent lines that must NOT mask the orchestrator violation
      ...assistantTurn([{ type: 'text', text: '[sub-agent] All good here.' }], {
        sidechain: true,
      }),
    ]);

    const r = await runScript(subagentStopInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R007 헤더=1');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 2: R007 violation in last turn
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 2: R007 violation', () => {
  it('emits [R007/R008 Advisory] when last turn first text line lacks agent header', async () => {
    const sid = `r007-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'Sure, I can help with that.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });

  it('exits 0 even on R007 violation (advisory-only, never blocks)', async () => {
    const sid = `r007-exit0-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header here at all.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
  });

  it('delivers the advisory via hookSpecificOutput.additionalContext JSON on R007 violation', async () => {
    const sid = `r007-stdout-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'Missing identification header.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('[R007/R008 Advisory]');
  });

  it('treats ┌─ Agent: prefix as valid R007 header (no advisory)', async () => {
    const sid = `r007-full-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: mgr-creator (sonnet)\n└─ Task: create agent' },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('treats [agent-name] shorthand as valid R007 header (no advisory)', async () => {
    const sid = `r007-shorthand-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: '[mgr-creator] Creating agent structure...' }]),
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
      ...assistantTurn([
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
      ...assistantTurn([
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
      ...assistantTurn([
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

  it('accepts -> arrow variant in R008 prefix', async () => {
    const sid = `r008-arrow-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([
        { type: 'text', text: '[claude] Task start' },
        { type: 'text', text: '[claude][sonnet] -> Tool: Read' },
        { type: 'tool_use', id: 'tu6', name: 'Read', input: { file_path: 'x.md' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('delivers the advisory via hookSpecificOutput.additionalContext JSON on R008 violation', async () => {
    const sid = `r008-stdout-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu4', name: 'Read', input: { file_path: 'file.md' } },
      ]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('[R007/R008 Advisory]');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 4: opt-out
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 4: opt-out', () => {
  it('emits no advisory when OMCUSTOM_R007_ADVISOR=off, even with R007 violation', async () => {
    const sid = `opt-out-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header — would be R007 violation.' }]),
    ]);

    const r = await runScript(promptInput(sid), {
      ...testEnv(),
      OMCUSTOM_R007_ADVISOR: 'off',
    });

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits empty stdout when opt-out active, even with a violating transcript', async () => {
    const sid = `opt-out-pass-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'Violation turn without header.' }]),
    ]);

    const r = await runScript(promptInput(sid), {
      ...testEnv(),
      OMCUSTOM_R007_ADVISOR: 'off',
    });

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 5: missing transcript file (graceful degrade)
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 5: missing transcript', () => {
  it('exits 0 with no advisory when transcript file does not exist', async () => {
    const r = await runScript(promptInput('nonexistent-session-xyz'), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits empty stdout when transcript is missing', async () => {
    const r = await runScript(promptInput('no-transcript-session'), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 6: missing session_id / hook_event_name in stdin
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 6: missing input fields', () => {
  it('exits 0 with no advisory when session_id is absent from input JSON', async () => {
    const input = JSON.stringify({ prompt: 'Hello', hook_event_name: 'UserPromptSubmit' });
    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits empty stdout when session_id is missing', async () => {
    const input = JSON.stringify({ prompt: 'No session id here' });
    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('exits 0 when jq is absent (PATH stripped)', async () => {
    const r = await runScript(promptInput('no-jq-session'), { PATH: '/usr/bin:/bin' });

    expect(r.exitCode).toBe(0);
  });

  it('emits NOTHING when hook_event_name is absent (no UserPromptSubmit default, #1553)', async () => {
    // hookSpecificOutput.hookEventName must match the ACTUAL firing event. Guessing a
    // default invalidates the output, so a missing field is a hard exit 0.
    const sid = `no-event-name-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header, no hook_event_name in payload.' }]),
    ]);
    const input = JSON.stringify({ session_id: sid, prompt: 'Hello' });

    const r = await runScript(input, testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 7: only-last-turn semantics
// The hook inspects ONLY the last assistant turn.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 7: only-last-turn semantics', () => {
  it('does NOT emit advisory when only an earlier turn violates R007 but the last is clean', async () => {
    const sid = `last-turn-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('First question'),
      // OLDER turn — R007 violation (no header)
      ...assistantTurn([{ type: 'text', text: 'This response has no identification header.' }]),
      ...userTurn('Second question'),
      // LAST turn — fully compliant
      ...assistantTurn([
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
      ...userTurn('Read a file'),
      // OLDER turn — R008 violation (tool_use without R008 prefix)
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu-old', name: 'Read', input: { file_path: 'old.md' } },
      ]),
      ...userTurn('Now write a file'),
      // LAST turn — compliant
      ...assistantTurn([
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
      ...userTurn('First'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: answer first' },
      ]),
      ...userTurn('Second'),
      // LAST turn — R007 violation
      ...assistantTurn([{ type: 'text', text: 'Forgot the header this time.' }]),
    ]);

    const r = await runScript(promptInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('[R007/R008 Advisory]');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 8: hookSpecificOutput.additionalContext delivery contract (#1547)
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 8: hookSpecificOutput delivery contract (#1547)', () => {
  it('emits valid JSON with hookSpecificOutput.additionalContext for a violating SubagentStop turn', async () => {
    const sid = `hso-subagentstop-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header on subagent completion.' }]),
    ]);

    const r = await runScript(subagentStopInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SubagentStop');
  });

  it('emits valid JSON with hookSpecificOutput.additionalContext for a violating UserPromptSubmit turn', async () => {
    const sid = `hso-userpromptsubmit-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header on prompt submit re-entry.' }]),
    ]);

    const r = await runScript(promptInput(sid, 'UserPromptSubmit'), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  });

  it('echoes PostToolUse as hookEventName when fired from the PostToolUse wiring (#1553)', async () => {
    const sid = `hso-posttooluse-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'Orchestrator turn with no header.' }]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  });

  it('never includes a top-level decision/continue/stopReason field (non-blocking)', async () => {
    const sid = `hso-nonblocking-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'tool_use', id: 'tu-nb', name: 'Read', input: { file_path: 'x.md' } },
      ]),
    ]);

    const r = await runScript(subagentStopInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed).not.toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('continue');
    expect(parsed).not.toHaveProperty('stopReason');
  });

  it('emits empty stdout for a clean SubagentStop turn (no advisory, no JSON)', async () => {
    const sid = `hso-clean-subagentstop-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: '[claude][sonnet] → Tool: Read' }]),
    ]);

    const r = await runScript(subagentStopInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 9: per-turn dedup (#1553)
//
// PostToolUse fires on EVERY tool call. Without dedup the same violating turn would inject
// an advisory on each call. The marker is the turn's first assistant-line uuid — content
// derived, no date/random — so the behavior is idempotent and testable.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 9: per-turn dedup', () => {
  it('emits the advisory once and stays silent on a repeat call for the SAME turn', async () => {
    const sid = `dedup-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Do a thing'),
      ...assistantTurn([{ type: 'text', text: 'No header on this turn.' }], {
        uuid: 'turn-dedup-1',
      }),
    ]);

    const first = await runScript(postToolUseInput(sid), testEnv());
    expect(first.exitCode).toBe(0);
    parseAdvisoryOutput(first.stdout);

    const second = await runScript(postToolUseInput(sid), testEnv());
    expect(second.exitCode).toBe(0);
    expect(second.stdout.trim()).toBe('');
    expect(second.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('emits again once a NEW violating turn appears', async () => {
    const sid = `dedup-newturn-${Date.now()}`;
    const turn1 = [
      ...userTurn('First'),
      ...assistantTurn([{ type: 'text', text: 'First turn, no header.' }], {
        uuid: 'turn-dedup-a',
      }),
    ];
    await writeTranscript(sid, turn1);

    const first = await runScript(postToolUseInput(sid), testEnv());
    parseAdvisoryOutput(first.stdout);

    // Repeat on the same turn → silent
    const repeat = await runScript(postToolUseInput(sid), testEnv());
    expect(repeat.stdout.trim()).toBe('');

    // A NEW turn arrives → advisory again
    await writeTranscript(sid, [
      ...turn1,
      ...userTurn('Second'),
      ...assistantTurn([{ type: 'text', text: 'Second turn, still no header.' }], {
        uuid: 'turn-dedup-b',
      }),
    ]);

    const third = await runScript(postToolUseInput(sid), testEnv());
    expect(third.exitCode).toBe(0);
    parseAdvisoryOutput(third.stdout);
  });

  it('does not consume a dedup slot for a clean turn', async () => {
    const sid = `dedup-clean-${Date.now()}`;
    // Clean turn first — must not write a marker that would mask a later violation.
    await writeTranscript(sid, [
      ...userTurn('Clean'),
      ...assistantTurn([{ type: 'text', text: '[claude] all good' }], { uuid: 'turn-clean' }),
    ]);
    const clean = await runScript(postToolUseInput(sid), testEnv());
    expect(clean.stdout.trim()).toBe('');

    await writeTranscript(sid, [
      ...userTurn('Clean'),
      ...assistantTurn([{ type: 'text', text: '[claude] all good' }], { uuid: 'turn-clean' }),
      ...userTurn('Bad'),
      ...assistantTurn([{ type: 'text', text: 'now missing the header' }], { uuid: 'turn-bad' }),
    ]);
    const bad = await runScript(postToolUseInput(sid), testEnv());
    parseAdvisoryOutput(bad.stdout);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 10: transcript_path resolution + performance budget (#1553)
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 10: transcript_path + performance', () => {
  it('resolves the transcript from the payload transcript_path when no base override is set', async () => {
    const sid = `tpath-${Date.now()}`;
    await writeTranscript(sid, [
      ...assistantTurn([{ type: 'text', text: 'No header via transcript_path.' }]),
    ]);
    const input = JSON.stringify({
      session_id: 'unrelated-session-id',
      hook_event_name: 'PostToolUse',
      transcript_path: join(transcriptDir, `${sid}.jsonl`),
    });

    // NOTE: no OMCUSTOM_TRANSCRIPT_BASE — forces the transcript_path branch.
    const r = await runScript(input, { OMCUSTOM_R007_MARKER_DIR: markerDir });

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  });

  it('completes well under the PostToolUse budget on a large transcript', async () => {
    const sid = `perf-${Date.now()}`;
    const lines: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      lines.push(...userTurn(`Question ${i}`));
      lines.push(
        ...assistantTurn([
          { type: 'text', text: `┌─ Agent: claude (default)\n└─ Task: answer ${i}` },
          { type: 'text', text: '[claude][sonnet] → Tool: Read' },
          { type: 'tool_use', id: `tu-${i}`, name: 'Read', input: { file_path: `f${i}.md` } },
        ])
      );
    }
    await writeTranscript(sid, lines);

    const started = Date.now();
    const r = await runScript(postToolUseInput(sid), testEnv());
    const elapsed = Date.now() - started;

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    // The pre-fix implementation forked jq once per line (measured 2.8s / 8.6s on real
    // transcripts). A single-fork bounded-window read must stay far below that.
    expect(elapsed).toBeLessThan(1500);
  });
});

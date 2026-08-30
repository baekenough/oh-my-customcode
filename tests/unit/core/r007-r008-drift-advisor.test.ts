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
// Fixture 3b: R008 is a TURN-LEVEL COUNT, not block adjacency (#1563 찐빠 #1)
//
// R008 verbatim: "For parallel calls: list ALL identifications BEFORE the tool calls."
// The old implementation tested block adjacency (`$blocks[i-1]` must be a matching text
// block), so in the parallel batch `[text, tool_use, tool_use]` — which R009 MANDATES —
// every tool_use after the first was scored a violation. Measured: 212 bytes of advisory on
// a compliant live turn, 348 on a synthetic fixture; both must be 0.
//
// New verdict: violations = max(0, tool_use blocks − announce lines).
// `→ Target:` is deliberately NOT an announce line (it is the companion of `→ Tool:`;
// counting it would score 2 per tool and mask genuine omissions).
//
// The fixtures below are paired negative (must be SILENT) / positive (must FIRE) controls —
// a silence-only suite would pass against a script that never fires at all.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3b: turn-level R008 counting', () => {
  // ── Negative controls: advisory must stay SILENT (stdout 0 bytes) ──

  it('N1: stays silent on a compliant parallel batch (2 → Tool: lines, 2 tool_use)', async () => {
    const sid = `r008-parallel-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read two files in parallel'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: parallel read' },
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Read\n[claude][sonnet] → Tool: Read',
        },
        // Both tool_use blocks are in ONE batch — the second has a tool_use predecessor,
        // which the adjacency implementation scored as a false violation.
        { type: 'tool_use', id: 'par-1', name: 'Read', input: { file_path: 'a.md' } },
        { type: 'tool_use', id: 'par-2', name: 'Read', input: { file_path: 'b.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('N2: stays silent on a compliant single call (→ Tool: + → Target: companion, 1 tool_use)', async () => {
    const sid = `r008-single-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read one file'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: single read' },
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Read\n[claude][sonnet] → Target: a.md',
        },
        { type: 'tool_use', id: 'single-1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('N3: stays silent on a compliant 3-call parallel batch', async () => {
    const sid = `r008-parallel3-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Three things at once'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: three calls' },
        {
          type: 'text',
          text: [
            '[claude][sonnet] → Tool: Read',
            '[claude][sonnet] → Tool: Grep',
            '[claude][sonnet] → Tool: Bash',
          ].join('\n'),
        },
        { type: 'tool_use', id: 'p3-1', name: 'Read', input: { file_path: 'a.md' } },
        { type: 'tool_use', id: 'p3-2', name: 'Grep', input: { pattern: 'x' } },
        { type: 'tool_use', id: 'p3-3', name: 'Bash', input: { command: 'ls' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('N4: accepts the R008 §Parallel Spawn notation (→ Spawning: + [N] lines, no → Tool:)', async () => {
    // R008 documents parallel Agent spawns as a `→ Spawning:` header plus one indented
    // `[N] subagent_type:model → description` line per agent — with NO `→ Tool: Agent`
    // line. Counting only `→ Tool:` would recreate the same false positive here.
    const sid = `r008-spawn-ok-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Review both files'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (secretary-routing)\n└─ Task: parallel review' },
        {
          type: 'text',
          text: [
            '[secretary][opus] → Spawning:',
            '  [1] lang-golang-expert:sonnet → Go code review',
            '  [2] lang-python-expert:sonnet → Python code review',
          ].join('\n'),
        },
        { type: 'tool_use', id: 'sp-1', name: 'Agent', input: { subagent_type: 'a' } },
        { type: 'tool_use', id: 'sp-2', name: 'Agent', input: { subagent_type: 'b' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  // ── Positive controls: advisory MUST fire ──

  it('P1: fires when announce lines under-count the batch (1 → Tool:, 2 tool_use)', async () => {
    const sid = `r008-undercount-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Do two things'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: two calls' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'uc-1', name: 'Read', input: { file_path: 'a.md' } },
        { type: 'tool_use', id: 'uc-2', name: 'Grep', input: { pattern: 'x' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R007 헤더=0');
  });

  it('P2: fires for R007 only when the header is missing but prefixes are compliant', async () => {
    const sid = `r007-only-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read two files'),
      ...assistantTurn([
        // No ┌─ Agent: / [agent] header on the first line → R007 violation …
        { type: 'text', text: 'Reading both files now.' },
        // … but the R008 announce count matches the batch → R008 must be 0.
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Read\n[claude][sonnet] → Tool: Read',
        },
        { type: 'tool_use', id: 'ro-1', name: 'Read', input: { file_path: 'a.md' } },
        { type: 'tool_use', id: 'ro-2', name: 'Read', input: { file_path: 'b.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R007 헤더=1');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=0');
  });

  it('P3: fires when the turn has no announce text at all (tool_use only)', async () => {
    const sid = `r008-noannounce-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Just do it'),
      ...assistantTurn([
        { type: 'tool_use', id: 'na-1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
  });

  // ── Source-level regression guard ──

  it('no longer scores R008 by block adjacency (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    // The adjacency probe (`$blocks[. - 1]`) is what produced the parallel-batch false
    // positive. Pin its absence so a revert is caught even if a fixture is forgiving.
    expect(src).not.toContain('$blocks[. - 1]');
    // `→ Target:` must not be an announce line — counting it scores 2 per tool call.
    expect(src).not.toContain('?(Tool|Target):');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 3c: the Skill tool is EXEMPT from the R008 denominator (#1569)
//
// R008 §"Tier-3 Interaction Tool Prefix" says verbatim:
//   "Skill | NO separate R008 prefix — identified via R007 `claude → {skill-name}`
//    integrated header instead"
// A compliant skill invocation therefore emits ONLY the integrated R007 header and no
// `→ Tool:` line. Counting the Skill tool_use scored `R008 접두사=1` against a turn that
// follows the rule exactly — the advisor fired at rule-compliant behavior.
//
// Paired controls: N-cases must be SILENT (0 bytes), P-cases must FIRE. A silence-only
// suite would also pass against a script that has stopped firing altogether, and the
// exemption itself is a silence-widening change — the P-cases are what keep it honest.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3c: Skill tool exemption (#1569)', () => {
  // ── Negative controls: must stay SILENT ──

  it('N5: stays silent on an R007-integrated-header turn whose only tool_use is Skill', async () => {
    const sid = `skill-exempt-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run the homework skill'),
      ...assistantTurn([
        // The integrated header form R008 points to — and deliberately NO `→ Tool:` line.
        { type: 'text', text: '┌─ Agent: claude → homework\n└─ Task: session retrospective' },
        { type: 'tool_use', id: 'sk-1', name: 'Skill', input: { skill: 'homework' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('N6: stays silent when a Skill call is mixed with a properly announced tool call', async () => {
    const sid = `skill-mixed-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run the skill then read a file'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude → homework\n└─ Task: retrospective + read' },
        // ONE announce line for the ONE non-exempt tool call. The Skill call adds no
        // announce line and must add nothing to the denominator either.
        { type: 'text', text: '[claude][opus] → Tool: Read' },
        { type: 'tool_use', id: 'sk-2', name: 'Skill', input: { skill: 'homework' } },
        { type: 'tool_use', id: 'sk-3', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('N7: stays silent on two consecutive Skill calls with no announce lines at all', async () => {
    const sid = `skill-double-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run two skills'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude → pipeline\n└─ Task: two skills' },
        { type: 'tool_use', id: 'sk-4', name: 'Skill', input: { skill: 'pipeline' } },
        { type: 'tool_use', id: 'sk-5', name: 'Skill', input: { skill: 'homework' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  // ── Positive controls: the exemption must NOT swallow real violations ──

  it('P4: still fires for an unannounced NON-Skill call sitting beside an exempt Skill call', async () => {
    const sid = `skill-pos-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run the skill then read'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude → homework\n└─ Task: retrospective + read' },
        // No announce line anywhere: Skill is exempt, Read is not → exactly 1 violation.
        { type: 'tool_use', id: 'sk-6', name: 'Skill', input: { skill: 'homework' } },
        { type: 'tool_use', id: 'sk-7', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
  });

  it('P5: still fires for R007 when a Skill turn lacks any identification header', async () => {
    const sid = `skill-r007-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run the skill'),
      ...assistantTurn([
        // Skill exemption covers R008 only — the R007 header is still mandatory.
        { type: 'text', text: 'Running the homework skill now.' },
        { type: 'tool_use', id: 'sk-8', name: 'Skill', input: { skill: 'homework' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R007 헤더=1');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=0');
  });

  // ── Source-level regression guard ──

  it('excludes Skill from the tool_use denominator (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('!= "Skill"');
    // The bare selector is what counted Skill; pin its absence so a revert is caught.
    expect(src).not.toMatch(/\[ \$blocks\[\] \| select\(\.type\? == "tool_use"\) \]/);
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 3d: REVERSE signal — announced a tool call, emitted none (#1595 제안 #6)
//
// R009 Self-Check #6 requires the announced tool count to match the tool_use blocks actually
// emitted in the same message. The forward verdict only catches `tool_use > announce`; this
// signal catches the opposite direction, which is structurally invisible to it.
//
// It is deliberately NARROW and OPT-IN. Measured over 482 orchestrator turns:
//   * naive `announce - ntools > 0` fires on 36/482 and DOUBLES the advisory rate — 16 of
//     those are Skill-exclusion artifacts and 15 more are prose matching the UNANCHORED
//     announce regexes.
//   * "no tool_use at all" + an ANCHORED `→ Tool:` counter yields 3/3 true positives and 0
//     false positives.
// So the N-cases below are not decoration: RN3/RN4/RN5 each pin one of the exact false
// positives that the narrowing removes, and RN1 pins the opt-in contract itself.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3d: reverse signal (#1595 #6)', () => {
  /** Env for an isolated run with the reverse signal switched ON. */
  function reverseOnEnv(): Record<string, string> {
    return { ...testEnv(), OMCUSTOM_R008_REVERSE: 'on' };
  }

  // ── Positive controls: MUST fire when opted in ──

  it('RP1: fires when the turn announces a tool call but emits no tool_use block', async () => {
    const sid = `rev-p1-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Spawn the reviewer'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: spawn reviewer' },
        // Announced — and then the turn simply ends. No tool_use anywhere.
        { type: 'text', text: '[claude][opus] → Tool: Agent' },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R009 Self-Check #6');
  });

  it('RP2: reports the announced count when two calls were announced and none emitted', async () => {
    const sid = `rev-p2-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read both files'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: parallel read' },
        {
          type: 'text',
          text: '[claude][sonnet] → Tool: Read\n[claude][sonnet] → Tool: Grep',
        },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('도구 호출 2건');
  });

  // ── Negative controls: MUST stay silent (stdout 0 bytes) ──

  it('RN1: stays silent on the RP1 fixture when the opt-in env var is unset (default off)', async () => {
    const sid = `rev-n1-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Spawn the reviewer'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: spawn reviewer' },
        { type: 'text', text: '[claude][opus] → Tool: Agent' },
      ]),
    ]);

    // Identical fixture to RP1 — only the opt-in flag differs.
    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('RN2: stays silent on a compliant turn (1 announce, 1 tool_use)', async () => {
    const sid = `rev-n2-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'rev-t1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('RN3: stays silent when the only tool_use is Skill (Skill-exclusion artifact)', async () => {
    // THE reason the condition counts ALL tool_use blocks instead of the Skill-excluded
    // denominator: this turn DID call a tool, so "announced but never called" is false.
    // Reusing $ntools here would fire on a rule-compliant Skill invocation (#1569).
    const sid = `rev-n3-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('run the homework skill'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude → homework\n└─ Task: retrospective' },
        { type: 'text', text: '[claude][opus] → Tool: Skill' },
        { type: 'tool_use', id: 'rev-sk', name: 'Skill', input: { skill: 'homework' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('RN4: stays silent when the R008 form appears only inside a markdown table (anchor guard)', async () => {
    // Documentation/retrospective turns quote the R008 prefix format constantly. The
    // UNANCHORED forward regex matches mid-line, so without the `^` anchor this prose would
    // be scored as an unfulfilled announcement.
    const sid = `rev-n4-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Explain the R008 format'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: explain R008' },
        {
          type: 'text',
          text: [
            '| Anti-pattern | Required |',
            '|---|---|',
            '| prefix 누락 | `[agent][model] → Tool: Read` 를 붙인다 |',
          ].join('\n'),
        },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('RN5: stays silent on a numbered list line carrying an arrow (spawn-item guard)', async () => {
    // `[N] ... → ...` is counted by the forward spawn-item regex. The reverse counter must
    // NOT reuse that regex, or every numbered plan/summary list becomes a violation.
    const sid = `rev-n5-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Summarize the plan'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: summarize' },
        {
          type: 'text',
          text: ['[1] 룰 문서 수정 → 미러 동기화', '[2] 테스트 추가 → 단일 실행'].join('\n'),
        },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('RN6: stays silent on a prose-only turn with no announce lines at all', async () => {
    const sid = `rev-n6-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('What is R009?'),
      ...assistantTurn([
        {
          type: 'text',
          text: '┌─ Agent: claude (default)\n└─ Task: answer\n\nR009는 병렬 실행 규칙입니다.',
        },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), reverseOnEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  // ── Source-level regression guards ──

  it('anchors the REVERSE counter without anchoring the forward counter (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    const lines = src.split('\n');
    const anAnchored = lines.find((l) => l.includes('as $an_anchored'));
    const anTool = lines.find((l) => l.includes('as $an_tool'));

    expect(anAnchored).toBeDefined();
    expect(anTool).toBeDefined();
    // Reverse counter is anchored to line start.
    expect(anAnchored).toContain('test("^');
    // Forward counter must stay UNANCHORED: the forward verdict is
    // max(0, ntools - announce), so under-counting announce INCREASES reported violations.
    expect(anTool).not.toContain('test("^');

    // The reverse condition must use the all-tools count, never the Skill-excluded one (RN3).
    const revLine = lines.find((l) => l.includes('as $r008rev'));
    expect(revLine).toContain('$nall_tools == 0');
    expect(revLine).not.toContain('$ntools');
  });

  it('keeps the reverse signal opt-in with a default of off (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('OMCUSTOM_R008_REVERSE:-off');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 3e: #1625 찐빠 #3 — forward R008 false positives
//
// An explicit `$nall_tools == 0 → r008 = 0` guard. Under the pre-existing formula
// (max(0, ntools - announce)) this was already unreachable in isolation, but the guard pins
// the invariant in the code itself so a future formula change cannot silently break it.
// G1/G2 are the negative pair the issue asked for; G3 is the positive control proving the
// guard does not swallow a real violation.
//
// A SECOND fix was investigated and REJECTED (not applied): excluding `<task-notification>` /
// `Stop hook feedback:` from the role=user string-content turn-boundary check. It does stop a
// mid-batch notification from splitting an otherwise-compliant multi-tool-call turn — but a
// live-session regression check (200ee7fe, a real `/fsd` autonomous-loop transcript, tail-200
// window simulation) showed these markers are the ONLY turn-boundary signal available during
// headless autonomous re-entry (no UserPromptSubmit ever fires there). Excluding them left
// `$bi` empty, `$b` fell back to -1, and independently-compliant follow-up responses kept
// merging into one ever-growing pseudo-turn — R008 drift measured 6 → 10 → 9 across three
// genuinely separate responses that were each individually clean (0/0) before the exclusion
// was applied. Net regression on the dominant real-world use case of this hook, so it was
// reverted; see the code comment above `$bi` in the script for the full measurement.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3e: #1625 찐빠 #3 forward guard', () => {
  // ── explicit zero-tool_use guard ──

  it('G1: stays silent on a compliant turn with ZERO tool_use blocks (header+text only)', async () => {
    const sid = `g1625-notools-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Just summarize'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: summarize, no tool calls' },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('G2: stays silent when announce count exactly matches tool_use count (N announces, N calls)', async () => {
    const sid = `g1625-match-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Run three checks'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: three checks' },
        {
          type: 'text',
          text: [
            '[claude][sonnet] → Tool: Bash',
            '[claude][sonnet] → Tool: Bash',
            '[claude][sonnet] → Tool: Bash',
          ].join('\n'),
        },
        { type: 'tool_use', id: 'g2-1', name: 'Bash', input: { command: 'echo a' } },
        { type: 'tool_use', id: 'g2-2', name: 'Bash', input: { command: 'echo b' } },
        { type: 'tool_use', id: 'g2-3', name: 'Bash', input: { command: 'echo c' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('G3: still fires when there is exactly one tool_use and zero announce lines', async () => {
    const sid = `g1625-fire-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Just do it, no announce'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: silent call' },
        { type: 'tool_use', id: 'g3-1', name: 'Bash', input: { command: 'echo x' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
  });

  it('source guard: forward r008 is hard-gated on $nall_tools == 0', async () => {
    const src = await Bun.file(SCRIPT).text();
    const lines = src.split('\n');
    const r008Line = lines.findIndex((l) => l.includes('as $r008') && !l.includes('$r008rev'));
    expect(r008Line).toBeGreaterThan(-1);
    // The guard must appear in the small window right before the binding.
    const window = lines.slice(Math.max(0, r008Line - 4), r008Line + 1).join('\n');
    expect(window).toContain('$nall_tools == 0 then 0');
  });

  it('source guard: the task-notification/Stop-hook-feedback exclusion was NOT applied', async () => {
    // Regression pin for the REJECTED fix (see describe-block comment above): a live-session
    // check showed excluding these markers from the turn-boundary test makes autonomous
    // `/fsd`-loop drift WORSE (they are the only boundary signal available there), so the
    // original unconditional string-content boundary check must remain untouched.
    const src = await Bun.file(SCRIPT).text();
    expect(src).not.toContain('^<task-notification>|^<system-reminder>|^Stop hook feedback:');
  });
});

// ════════════════════════════════════════════════════════════════
// Fixture 3f: #1628 — window-saturation guard on the $b=-1 boundary fallback
//
// When the tail -n 200 window contains NO turn boundary at all, the previous
// implementation ALWAYS fell back to $b=-1, merging the ENTIRE window into one turn.
// That is correct only when the window is NOT saturated (the file has fewer than 200
// lines, so tail returned the whole transcript from session start — there truly is no
// earlier boundary). When the window IS saturated (tail actually returned 200 lines),
// a real boundary may exist just outside the window, and merging the whole window
// misattributes announce/tool_use counts across what are really several independent,
// individually-compliant responses — producing R008 false positives that swung
// 5~10 across a live autonomous-loop session (#1628).
//
// The fix: bash measures the actual window line count ($wlc) via `awk 'END{print NR}'`
// and passes it to jq as --argjson wlc. When $bi (candidate boundary indices) is empty
// AND $wlc >= 200 (saturated), the verdict is skipped entirely (`empty` → no result →
// exit 0, no advisory). When $bi is empty and $wlc < 200 (genuinely short session), the
// original $b=-1 fallback is preserved unchanged.
// ════════════════════════════════════════════════════════════════

describe('r007-r008-drift-advisor.sh — Fixture 3f: #1628 window-saturation guard', () => {
  it('TP: fires normally when a real boundary exists inside a saturated (>=200 line) window', async () => {
    // Regression guard: the saturation gate must NOT suppress genuine violations when a
    // boundary IS present in the window — it only applies when $bi is completely empty.
    const sid = `g1628-tp-${Date.now()}`;
    const lines: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      lines.push(...userTurn(`Question ${i}`));
      lines.push(
        ...assistantTurn([
          { type: 'text', text: `┌─ Agent: claude (default)\n└─ Task: answer ${i}` },
          { type: 'text', text: '[claude][sonnet] → Tool: Read' },
          { type: 'tool_use', id: `g1628-tp-${i}`, name: 'Read', input: { file_path: `f${i}.md` } },
        ])
      );
    }
    // LAST turn — a genuine violation, preceded by a real boundary.
    lines.push(...userTurn('Last question'));
    lines.push(
      ...assistantTurn([{ type: 'tool_use', id: 'g1628-tp-last', name: 'Bash', input: {} }])
    );
    await writeTranscript(sid, lines);
    // Sanity: the tail-200 window is genuinely saturated for this fixture.
    expect(lines.length).toBeGreaterThanOrEqual(200);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=1');
  });

  it('TN1: stays SILENT when the window is saturated (>=200 lines) with NO boundary at all', async () => {
    // This is the exact false-positive shape from #1628: a long stretch of purely
    // assistant lines (autonomous-loop re-entry with no UserPromptSubmit boundary) that,
    // pre-fix, would merge into one mega-turn and misfire on tool_use/announce mismatch.
    const sid = `g1628-tn1-${Date.now()}`;
    const lines: string[] = [];
    for (let i = 0; i < 220; i += 1) {
      // No text block at all → no announce lines anywhere, only tool_use blocks. Pre-fix
      // this merges into ONE giant turn with ~220 tool_use and 0 announce → r008=220.
      lines.push(
        ...assistantTurn([{ type: 'tool_use', id: `g1628-tn1-${i}`, name: 'Bash', input: {} }])
      );
    }
    await writeTranscript(sid, lines);
    expect(lines.length).toBeGreaterThanOrEqual(200);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
  });

  it('TN2: preserves the pre-fix $b=-1 fallback when the window is NOT saturated (<200 lines)', async () => {
    // A genuinely short session (no earlier boundary because there IS no earlier content)
    // must keep firing exactly as before — the saturation gate must not swallow this case.
    const sid = `g1628-tn2-${Date.now()}`;
    const lines: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      lines.push(
        ...assistantTurn([{ type: 'tool_use', id: `g1628-tn2-${i}`, name: 'Bash', input: {} }])
      );
    }
    await writeTranscript(sid, lines);
    expect(lines.length).toBeLessThan(200);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    const parsed = parseAdvisoryOutput(r.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 접두사=5');
  });

  it('source guard: the $wlc saturation check gates the empty-boundary fallback (#1628)', async () => {
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('$wlc >= 200');
    expect(src).toContain('--argjson wlc');
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

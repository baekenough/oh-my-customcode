/**
 * Tests for session-reflection.sh hook (Phase 1 MVP).
 *
 * The script is a Stop hook:
 * - Reads Stop-hook JSON from stdin
 * - Spawns a background worker to analyse the session transcript
 * - Immediately echoes stdin back to stdout (pass-through) and exits 0
 *
 * ── Transcript schema (this is the part that was previously wrong) ──────────────────────
 * Measured 2026-08-05 against real transcripts (#1553): JSONL lines carry NO top-level
 * `role`/`content`. Role lives at `.message.role`, blocks at `.message.content`, and there
 * is exactly ONE content block per line — so a single assistant TURN spans MULTIPLE lines
 * and must be reconstructed before the R008 adjacency test means anything. `isSidechain:
 * true` marks subagent lines. Tool results arrive as `.message.role == "user"` with
 * `tool_result` blocks and are NOT turn boundaries; only a genuine prompt ends a turn.
 *
 * The previous fixtures used a top-level `{role, content:[...]}` shape, which matched the
 * worker's buggy `.role`/`.content` selectors — the suite passed green while the analyzer
 * matched zero lines of any real transcript (0-layer detection). Fixtures below build the
 * REAL schema, and this file is the twin of r007-r008-drift-advisor.test.ts: the two share
 * fixture conventions, so both must be corrected together or the next copy re-contaminates.
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
 * 6. Multi-line turn reconstruction + isSidechain filtering (#1553)
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

// ── Real-schema transcript line builders (mirrors r007-r008-drift-advisor.test.ts) ──────
// One content block PER LINE — this is what real Claude Code transcripts look like.

let uuidSeq = 0;
function nextUuid(): string {
  uuidSeq += 1;
  return `sr-uuid-${uuidSeq}`;
}

/**
 * Build the JSONL lines for ONE assistant turn: one line per content block.
 * Returns an ARRAY of lines — the multi-line turn helper the old fixtures lacked.
 */
function assistantTurn(blocks: object[], opts: { sidechain?: boolean } = {}): string[] {
  return blocks.map((block) =>
    JSON.stringify({
      type: 'assistant',
      uuid: nextUuid(),
      parentUuid: null,
      isSidechain: opts.sidechain === true,
      message: { role: 'assistant', content: [block] },
    })
  );
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

/** Build a tool_result line — role "user", but NOT a turn boundary. */
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

  it('selects role/content from .message (real transcript schema), not top-level', async () => {
    // Regression guard for #1553: the worker's top-level `.role` selector matched nothing in
    // any real transcript, making this analyzer a 0-layer detector.
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('.message.role');
    expect(src).toContain('.message.content');
    expect(src).not.toMatch(/jq -r '\.role \/\/ empty'/);
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
      ...userTurn('Hello'),
      // Turn 1: valid R007 header + R008 prefix before tool_use (3 lines, one turn)
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: mgr-creator (sonnet)\n└─ Task: test' },
        {
          type: 'text',
          text: '[mgr-creator][sonnet] → Tool: Read\n[mgr-creator][sonnet] → Target: file.md',
        },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'file.md' } },
      ]),
      ...toolResultLine('tu1'),
      // A genuine user prompt ends turn 1 and opens turn 2
      ...userTurn('One more question'),
      // Turn 2: shorthand header, no tool_use
      ...assistantTurn([{ type: 'text', text: '[claude] Answering question…' }]),
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
      ...userTurn('First'),
      // violation: no header
      ...assistantTurn([{ type: 'text', text: 'Sure, I can help with that.' }]),
      ...userTurn('Second'),
      // compliant: shorthand OK
      ...assistantTurn([{ type: 'text', text: '[claude] Here is the answer.' }]),
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
      ...userTurn('Ask'),
      ...assistantTurn([{ type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: something' }]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 0');
    expect(log).toContain('**R007 violations**: 0');
  }, 15000);

  it('treats [agent-name] shorthand as valid R007 header', async () => {
    const sid = `r007-shorthand-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      ...userTurn('Ask'),
      ...assistantTurn([{ type: 'text', text: '[mgr-creator] Creating agent…' }]),
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
      ...userTurn('Read a file'),
      // violation: tool_use directly after header text (no R008 prefix text between them)
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        // ← no [agent][model] → Tool: line here
        { type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: 'some.md' } },
      ]),
      ...userTurn('Now write'),
      // compliant: tool_use preceded by R008 prefix text
      ...assistantTurn([
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
      ...userTurn('Search'),
      ...assistantTurn([
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
      ...assistantTurn([{ type: 'text', text: 'No header — would be R007 violation.' }]),
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
    // 5 assistant turns each missing a header (5 R007 violations).
    // Each turn is separated by a genuine user prompt — otherwise consecutive assistant
    // lines belong to the SAME turn and would count as one violation.
    const lines: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      lines.push(...userTurn(`Question ${i + 1}`));
      lines.push(...assistantTurn([{ type: 'text', text: `Plain response ${i + 1} — no header` }]));
    }
    const logPath = await writeTranscript(sid, lines);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R007 violations**: 5');
    expect(log).toContain('**R007 violations**: 5');

    // Count [R007 turn N] occurrences — must be ≤ 3
    const matches = log.match(/\[R007 turn \d+\]/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(3);
  }, 15000);
});

// ════════════════════════════════════════════════════════════════
// Fixture 6: multi-line turn reconstruction + isSidechain filtering (#1553)
// ════════════════════════════════════════════════════════════════

describe('session-reflection.sh — Fixture 6: turn reconstruction & sidechain', () => {
  it('treats consecutive assistant lines as ONE turn (no false R008 violations)', async () => {
    const sid = `sr-multiline-${Date.now()}`;
    const lines = [
      ...userTurn('Read then write'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: multi-step' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'tu-m1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
      ...toolResultLine('tu-m1'),
      ...assistantTurn([
        { type: 'text', text: '[claude][sonnet] → Tool: Write' },
        { type: 'tool_use', id: 'tu-m2', name: 'Write', input: { file_path: 'b.md' } },
      ]),
      ...toolResultLine('tu-m2'),
    ];
    // Sanity: the fixture really is one block per line.
    expect(lines.filter((l) => JSON.parse(l).message.role === 'assistant').length).toBe(5);
    const logPath = await writeTranscript(sid, lines);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, 'Total assistant turns analyzed: 1');
    expect(log).toContain('Total assistant turns analyzed: 1');
    expect(log).toContain('**R007 violations**: 0');
    expect(log).toContain('**R008 violations**: 0');
  }, 15000);

  it('scores R008 as a turn-level COUNT, not block adjacency (#1563 찐빠 #1)', async () => {
    // Twin of r007-r008-drift-advisor.test.ts Fixture 3b. The two scripts share this
    // verdict, so both suites must pin it or the next copy re-contaminates.
    // Turn 1: compliant parallel batch (2 announce lines, 2 tool_use) → 0 violations.
    // Turn 2: under-counted batch (1 announce line, 2 tool_use)       → 1 violation.
    const sid = `sr-parallel-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      ...userTurn('Read two files in parallel'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: parallel read' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read\n[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'sr-par-1', name: 'Read', input: { file_path: 'a.md' } },
        { type: 'tool_use', id: 'sr-par-2', name: 'Read', input: { file_path: 'b.md' } },
      ]),
      ...userTurn('Now two more'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: undercounted' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'sr-uc-1', name: 'Read', input: { file_path: 'c.md' } },
        { type: 'tool_use', id: 'sr-uc-2', name: 'Grep', input: { pattern: 'x' } },
      ]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R008 violations**: 1');
    expect(log).toContain('**R008 violations**: 1');
    expect(log).toContain('**R007 violations**: 0');
    expect(log).toContain('Total assistant turns analyzed: 2');
    // The reported sample is the trailing unannounced call of turn 2 — never turn 1.
    expect(log).toContain('[R008 turn 2]');
    expect(log).not.toContain('[R008 turn 1]');
  }, 15000);

  it('accepts the R008 §Parallel Spawn notation (→ Spawning: + [N] lines)', async () => {
    const sid = `sr-spawn-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      ...userTurn('Review both'),
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
        { type: 'tool_use', id: 'sr-sp-1', name: 'Agent', input: { subagent_type: 'a' } },
        { type: 'tool_use', id: 'sr-sp-2', name: 'Agent', input: { subagent_type: 'b' } },
      ]),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, '**R008 violations**: 0');
    expect(log).toContain('**R008 violations**: 0');
  }, 15000);

  it('excludes isSidechain:true (subagent) lines from the analysis', async () => {
    const sid = `sr-sidechain-${Date.now()}`;
    const logPath = await writeTranscript(sid, [
      ...userTurn('Delegate'),
      // Orchestrator turn — compliant
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: delegate' },
        { type: 'text', text: '[claude][sonnet] → Tool: Agent' },
        { type: 'tool_use', id: 'tu-sc', name: 'Agent', input: { subagent_type: 'x' } },
      ]),
      // Subagent turns — violating, must be ignored entirely
      ...assistantTurn([{ type: 'text', text: 'Subagent reply without header.' }], {
        sidechain: true,
      }),
      ...assistantTurn([{ type: 'tool_use', id: 'sc-tu', name: 'Read', input: {} }], {
        sidechain: true,
      }),
    ]);

    await runScript(stopInput(sid), testEnv());

    const log = await waitForLog(logPath, 'Total assistant turns analyzed: 1');
    expect(log).toContain('Total assistant turns analyzed: 1');
    expect(log).toContain('**R007 violations**: 0');
    expect(log).toContain('**R008 violations**: 0');
  }, 15000);
});

/**
 * Tests for scripts/count-r007-r008.sh (#1683 찐빠 #2).
 *
 * count-r007-r008.sh is a retrospective self-counting tool that REUSES
 * `.claude/hooks/scripts/r007-r008-drift-advisor.sh`'s own verdict logic instead of
 * re-implementing R007/R008 detection — it drives the advisor once per detected turn via a
 * synthetic hook stdin payload (`{session_id, hook_event_name: "UserPromptSubmit",
 * transcript_path: <turn-prefix file>}`) and parses its `hookSpecificOutput.additionalContext`
 * advisory text. Because the advisor itself always produces the verdict, the self-count is
 * guaranteed to match what the hook would have fired — not by careful copying, but by
 * construction.
 *
 * This test builds two synthetic transcripts (positive/negative pair, per R023 "Conditional-
 * Output Verification") in the REAL Claude Code transcript schema the advisor actually parses
 * (measured in r007-r008-drift-advisor.test.ts / the advisor's own header comment): no
 * top-level `role`/`content` — role lives at `.message.role`, content blocks at
 * `.message.content`, and each assistant TURN spans one JSONL line per content block.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../../..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'count-r007-r008.sh');
const ADVISOR = join(REPO_ROOT, '.claude', 'hooks', 'scripts', 'r007-r008-drift-advisor.sh');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run count-r007-r008.sh with the given positional args. */
function runCounter(args: string[]): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn('bash', [SCRIPT, ...args], { cwd: tmpdir() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('close', (code) => done({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

// ── Real-schema transcript line builders (one content block per JSONL line) ──────────────

let uuidSeq = 0;
function nextUuid(): string {
  uuidSeq += 1;
  return `count-uuid-${uuidSeq}`;
}

function assistantTurn(blocks: object[]): string[] {
  return blocks.map((block) =>
    JSON.stringify({
      type: 'assistant',
      uuid: nextUuid(),
      parentUuid: null,
      isSidechain: false,
      message: { role: 'assistant', content: [block] },
    })
  );
}

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

/** A tool_result line: role=="user" but NOT a turn boundary (the assistant turn continues). */
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
 * A sidechain user record (subagent transcript) with bare-string content — this SHAPE matches
 * a real turn boundary (role=="user", string content) and must NOT be treated as one, since
 * isSidechain:true records are excluded from boundary detection entirely (mirrors the
 * advisor's own `(.isSidechain // false) != true` filter).
 */
function sidechainUserTurn(text: string): string[] {
  return [
    JSON.stringify({
      type: 'user',
      uuid: nextUuid(),
      isSidechain: true,
      message: { role: 'user', content: text },
    }),
  ];
}

/** A sidechain assistant record (subagent turn) with a tool_use and NO header/prefix. */
function sidechainAssistantTurn(blocks: object[]): string[] {
  return blocks.map((block) =>
    JSON.stringify({
      type: 'assistant',
      uuid: nextUuid(),
      parentUuid: null,
      isSidechain: true,
      message: { role: 'assistant', content: [block] },
    })
  );
}

let tmpRoot: string;

async function writeTranscript(name: string, lines: string[]): Promise<string> {
  const path = join(tmpRoot, `${name}.jsonl`);
  await writeFile(path, `${lines.join('\n')}\n`);
  return path;
}

// ════════════════════════════════════════════════════════════════
// File existence & syntax
// ════════════════════════════════════════════════════════════════

describe('count-r007-r008.sh — file existence', () => {
  it('exists at scripts/count-r007-r008.sh and is executable', async () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const { statSync } = await import('node:fs');
    const mode = statSync(SCRIPT).mode;
    const executableBits = mode & 0o111;
    expect(executableBits).not.toBe(0);
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

  it('drives the real advisor script rather than re-implementing its jq verdict', async () => {
    expect(existsSync(ADVISOR)).toBe(true);
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('.claude/hooks/scripts/r007-r008-drift-advisor.sh');
    // Must invoke the advisor (bash "$ADVISOR" or similar) — not copy its jq verdict program.
    expect(src).toMatch(/"\$ADVISOR"/);
    expect(src).not.toContain('JQ_LAST_TURN');
  });

  it('prints usage and exits non-zero with no arguments', async () => {
    const r = await runCounter([]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('Usage');
  });

  it('exits non-zero for a missing transcript file', async () => {
    const r = await runCounter([join(tmpdir(), 'does-not-exist.jsonl')]);
    expect(r.exitCode).not.toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Positive/negative pair (R023 "Conditional-Output Verification")
// ════════════════════════════════════════════════════════════════

describe('count-r007-r008.sh — positive/negative pair', () => {
  beforeEach(async () => {
    tmpRoot = join(
      tmpdir(),
      `count-r007-r008-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(tmpRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('counts 0 R007/R008 violations for a fully compliant turn', async () => {
    // Header + R008 "→ Tool:" prefix on the SAME text block, immediately followed by the
    // tool_use it announces — matches the advisor's Core Rule format exactly (R008
    // "Core Rule" / "Required-Parameter Completeness Check").
    const path = await writeTranscript('positive', [
      ...userTurn('Please run the check.'),
      ...assistantTurn([
        {
          type: 'text',
          text: '┌─ Agent: claude (default)\n[claude][fable] → Tool: Bash',
        },
        { type: 'tool_use', id: 'tu-pos', name: 'Bash', input: {} },
      ]),
    ]);

    const r = await runCounter([path, '--json']);

    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.turns).toBe(1);
    expect(parsed.r007_missing).toBe(0);
    expect(parsed.r008_missing).toBe(0);
  });

  it('counts 1 R007 + 1 R008 violation for a turn with no header and no prefix', async () => {
    // NOTE: per the advisor's own jq (r007-r008-drift-advisor.sh ~line 268-272), a turn with
    // ZERO text blocks at all scores r007=0 (nothing to check, not a violation) — so to
    // actually trigger r007=1 the turn needs a NON-EMPTY text block that fails BOTH header
    // patterns (`^┌─ Agent:` / `^\[.+\]`), same as the advisor's own Fixture 2 tests. This is
    // "no *effective* header/prefix" — the faithful way to reproduce a real "forgot the
    // header" turn against the actual advisor, not a literal empty-content turn.
    const path = await writeTranscript('negative', [
      ...userTurn('Please run the check.'),
      ...assistantTurn([
        { type: 'text', text: 'Sure, I can help with that.' },
        { type: 'tool_use', id: 'tu-neg', name: 'Bash', input: {} },
      ]),
    ]);

    const r = await runCounter([path, '--json']);

    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.turns).toBe(1);
    expect(parsed.r007_missing).toBe(1);
    expect(parsed.r008_missing).toBe(1);
  });

  it('produces the same human-readable counts without --json', async () => {
    const path = await writeTranscript('negative-human', [
      ...userTurn('Please run the check.'),
      ...assistantTurn([
        { type: 'text', text: 'Sure, I can help with that.' },
        { type: 'tool_use', id: 'tu-neg2', name: 'Bash', input: {} },
      ]),
    ]);

    const r = await runCounter([path]);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('turns scanned:       1');
    expect(r.stdout).toContain('R007 header missing: 1');
    expect(r.stdout).toContain('R008 prefix missing: 1');
  });

  it('scans multiple turns across a tool_result continuation boundary', async () => {
    const path = await writeTranscript('multi-turn', [
      ...userTurn('first'),
      ...assistantTurn([
        {
          type: 'text',
          text: '┌─ Agent: claude (default)\n[claude][fable] → Tool: Bash',
        },
        { type: 'tool_use', id: 'tu-a', name: 'Bash', input: {} },
      ]),
      ...toolResultLine('tu-a'),
      ...userTurn('second'),
      ...assistantTurn([
        { type: 'text', text: 'No header at all.' },
        { type: 'tool_use', id: 'tu-b', name: 'Read', input: {} },
      ]),
    ]);

    const r = await runCounter([path, '--json']);

    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.turns).toBe(2);
    expect(parsed.r007_missing).toBe(1);
    expect(parsed.r008_missing).toBe(1);
  });

  it('excludes isSidechain:true records from boundary detection (no spurious cutpoint, no double count)', async () => {
    // A compliant orchestrator turn, then interleaved isSidechain:true records: a sidechain
    // user record with bare-string content (shape-matches a real boundary) and a sidechain
    // assistant record with a tool_use and NO header/prefix (would score a violation if
    // attributed to the orchestrator), then a normal tool_result continuation. Without the
    // sidechain filter, the sidechain user record creates a spurious cutpoint that splits the
    // single orchestrator turn into two, and the advisor is re-invoked a second time on a
    // cumulative prefix that (per its OWN internal isSidechain filter) re-resolves to the SAME
    // preceding orchestrator turn — a double count of `turns` for one real turn.
    const withSidechainLines = [
      ...userTurn('first'),
      ...assistantTurn([
        {
          type: 'text',
          text: '┌─ Agent: claude (default)\n[claude][fable] → Tool: Bash',
        },
        { type: 'tool_use', id: 'tu-sc', name: 'Bash', input: {} },
      ]),
      ...sidechainUserTurn('subagent sub-prompt'),
      ...sidechainAssistantTurn([{ type: 'tool_use', id: 'tu-sc-sub', name: 'Read', input: {} }]),
      ...toolResultLine('tu-sc'),
    ];

    const withoutSidechainLines = withSidechainLines.filter(
      (line) => JSON.parse(line).isSidechain !== true
    );

    const withPath = await writeTranscript('sidechain-with', withSidechainLines);
    const withoutPath = await writeTranscript('sidechain-without', withoutSidechainLines);

    const withResult = await runCounter([withPath, '--json']);
    const withoutResult = await runCounter([withoutPath, '--json']);

    expect(withResult.exitCode).toBe(0);
    expect(withoutResult.exitCode).toBe(0);

    const withParsed = JSON.parse(withResult.stdout.trim());
    const withoutParsed = JSON.parse(withoutResult.stdout.trim());

    // Only the orchestrator turn is counted — no spurious cutpoint from the sidechain records,
    // no attribution of the sidechain assistant's header-less tool_use as a violation.
    expect(withParsed.turns).toBe(1);
    expect(withParsed.r007_missing).toBe(0);
    expect(withParsed.r008_missing).toBe(0);

    // Same transcript minus the sidechain records must yield IDENTICAL counts.
    expect(withParsed).toEqual(withoutParsed);
  });
});

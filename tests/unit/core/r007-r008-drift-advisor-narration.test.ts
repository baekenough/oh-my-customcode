/**
 * Tests for the OPT-IN narration-channel split in r007-r008-drift-advisor.sh (#1701 하네스
 * 제안 2, following #1654's confirmed root cause that announce prose is often serialized as a
 * `thinking`-type block — narration — rather than a `text` block, and the advisor deliberately
 * excludes `thinking` blocks from its default R008 verdict).
 *
 * Scope: this suite ONLY exercises `OMCUSTOM_R008_NARRATION`. It does NOT change the default
 * verdict — with the env var off (or unset), advisory text must be byte-identical to the
 * pre-existing behavior. With it on, a missing-count line gets a
 * "(그중 narration 채널에만 존재 M건)" suffix reporting how many of the missing announces were
 * found in the narration (`thinking`) channel instead of a `text` block.
 *
 * Positive/negative pairs (R023 Conditional-Output Verification):
 *   (i)   env off,  announce only in a thinking block  → verdict/text unchanged (still missing,
 *         no narration note)
 *   (ii)  env on,   same transcript                    → narration note appears, M=1
 *   (iii) env on,   announce in a text block (compliant) → no missing, no narration note
 *   (iv)  env on,   no announce anywhere                 → missing 1, narration note M=0 (absent)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const SCRIPT = join(SCRIPTS_DIR, 'r007-r008-drift-advisor.sh');

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

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

function postToolUseInput(sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, hook_event_name: 'PostToolUse' });
}

let uuidSeq = 0;
function nextUuid(): string {
  uuidSeq += 1;
  return `uuid-narr-${uuidSeq}`;
}

function assistantTurn(blocks: object[], opts: { uuid?: string } = {}) {
  const lines: string[] = [];
  blocks.forEach((block, idx) => {
    lines.push(
      JSON.stringify({
        type: 'assistant',
        uuid: idx === 0 && opts.uuid ? opts.uuid : nextUuid(),
        parentUuid: null,
        isSidechain: false,
        message: { role: 'assistant', content: [block] },
      })
    );
  });
  return lines;
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

let tmpRoot: string;
let transcriptDir: string;
let markerDir: string;

beforeEach(async () => {
  tmpRoot = join(
    tmpdir(),
    `drift-advisor-narr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  transcriptDir = join(tmpRoot, 'transcripts');
  markerDir = join(tmpRoot, 'markers');
  await mkdir(transcriptDir, { recursive: true });
  await mkdir(markerDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function writeTranscript(sessionId: string, lines: string[]): Promise<string> {
  await writeFile(join(transcriptDir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
  return sessionId;
}

function testEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    OMCUSTOM_TRANSCRIPT_BASE: transcriptDir,
    OMCUSTOM_R007_MARKER_DIR: markerDir,
    ...extra,
  };
}

describe('r007-r008-drift-advisor.sh — OMCUSTOM_R008_NARRATION opt-in split (#1701)', () => {
  it('(i) env OFF: announce only in a thinking block → verdict/text unchanged (still missing, no narration note)', async () => {
    const sid = `narr-off-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'thinking', thinking: '[claude][sonnet] → Tool: Read\n이제 파일을 읽겠습니다.' },
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv());

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('R008 도구 식별 접두사 누락 1건');
    expect(r.stderr).not.toContain('narration 채널');
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).toContain('R008 도구 식별 접두사 누락 1건');
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('narration 채널');
  });

  it('(ii) env ON: same transcript → advisory mentions narration count M=1', async () => {
    const sid = `narr-on-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'thinking', thinking: '[claude][sonnet] → Tool: Read\n이제 파일을 읽겠습니다.' },
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv({ OMCUSTOM_R008_NARRATION: 'on' }));

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('R008 도구 식별 접두사 누락 1건');
    expect(r.stderr).toContain('그중 narration 채널에만 존재 1건');
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      '그중 narration 채널에만 존재 1건'
    );
  });

  it('(iii) env ON: announce in a text block (compliant) → no missing, no narration note', async () => {
    const sid = `narr-on-compliant-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        { type: 'text', text: '[claude][sonnet] → Tool: Read' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv({ OMCUSTOM_R008_NARRATION: 'on' }));

    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('[R007/R008 Advisory]');
    expect(r.stdout.trim()).toBe('');
  });

  it('(iv) env ON: no announce anywhere → missing 1, narration note absent (M=0 not reported)', async () => {
    const sid = `narr-on-noannounce-${Date.now()}`;
    await writeTranscript(sid, [
      ...userTurn('Read a file'),
      ...assistantTurn([
        { type: 'thinking', thinking: '내부 추론만 있고 announce는 없습니다.' },
        { type: 'text', text: '┌─ Agent: claude (default)\n└─ Task: read file' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'a.md' } },
      ]),
    ]);

    const r = await runScript(postToolUseInput(sid), testEnv({ OMCUSTOM_R008_NARRATION: 'on' }));

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('R008 도구 식별 접두사 누락 1건');
    expect(r.stderr).not.toContain('narration 채널');
    const parsed = JSON.parse(r.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('narration 채널');
  });
});

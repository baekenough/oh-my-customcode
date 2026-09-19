import { describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// #1692: the UserPromptSubmit session-end detector in user-prompt-preprocessor.sh fired on
// trigger words ("done"/완료/마무리 등) found inside a SUBAGENT hand-back message or a
// task-notification/system-reminder frame, not a genuine user utterance. This file pins the
// R023 positive/negative fixture pair for the source filter that was added to fix it.
//
// Kept as its own file (not appended to hooks-scripts.test.ts) to avoid touching a file shared
// with concurrent sibling work on other hook scripts in this repo.

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const SCRIPT = join(SCRIPTS_DIR, 'user-prompt-preprocessor.sh');

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runHookScript(scriptPath: string, stdinInput: string): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const child = spawn('bash', [scriptPath], { cwd: tmpdir() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code: number | null) => {
      resolve_({ stdout, stderr, exitCode: code ?? -1 });
    });
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

/** Build a platform-shaped UserPromptSubmit payload (the field the platform actually sends). */
function platformInput(prompt: string): string {
  return JSON.stringify({
    session_id: 'ups-source-filter-test',
    prompt,
    hook_event_name: 'UserPromptSubmit',
  });
}

describe('user-prompt-preprocessor.sh — #1692 source filter', () => {
  // --- POSITIVE: a genuine user utterance must still be detected ---

  it('POSITIVE: detects session-end signal in a genuine user prompt', async () => {
    const result = await runHookScript(SCRIPT, platformInput('오늘 여기까지 마무리하자'));
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Session-end signal detected');
  });

  // --- NEGATIVE: subagent hand-back / task-notification / system-reminder frames must NOT fire ---

  it('NEGATIVE: stays silent when the trigger words are inside a [Subagent hand-back] frame', async () => {
    const prompt =
      '[Subagent hand-back] mgr-gitnerd reports: 커밋 완료. All done, PR merged successfully.';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside an <agent-message> frame', async () => {
    const prompt = '<agent-message from="lang-python-expert">작업 완료, done.</agent-message>';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside a <task-notification> frame', async () => {
    const prompt = '<task-notification>Background task completed successfully.</task-notification>';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside a <system-reminder> frame', async () => {
    const prompt =
      '<system-reminder>Session wrap up notice: background job done.</system-reminder>';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside a subagent completion line (⏺ Agent "…")', async () => {
    const prompt = '⏺ Agent "세션 148 메모리 저장" finished — 완료했습니다, 마무리 done.';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside a compaction resume notice', async () => {
    const prompt =
      'This session is being continued from a previous conversation that ran out of context. 완료, done, 마무리.';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('NEGATIVE: stays silent when the trigger words are inside a skill base-directory injection line', async () => {
    const prompt = 'Base directory for this skill: /some/path — 마무리, 완료, done.';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  // --- Other preprocessing (slash-command detection) must remain unaffected by the filter ---

  it('unaffected: slash-command detection still fires even inside a hand-back frame', async () => {
    const prompt = '/status <system-reminder>done</system-reminder>';
    const result = await runHookScript(SCRIPT, platformInput(prompt));
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Slash command detected');
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('Session-end');
  });

  it('unaffected: slash-command detection fires normally for a genuine user prompt', async () => {
    const result = await runHookScript(SCRIPT, platformInput('/status'));
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Slash command detected');
  });
});

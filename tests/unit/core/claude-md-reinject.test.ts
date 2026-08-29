// claude-md-reinject.test.ts — SessionStart: CLAUDE.md re-injection hook (#1617)
//
// Verifies claude-md-reinject.sh:
//   - re-injects project CLAUDE.md via hookSpecificOutput.additionalContext on SessionStart
//     (covers all sources: startup/resume/clear/compact, per matcher "*")
//   - stays silent (R023 Conditional-Output Verification positive/negative pair):
//       negative 1: OMCUSTOM_CLAUDEMD_REINJECT=off
//       negative 2: CLAUDE.md absent
//       negative 3: CLAUDE.md exceeds the size guard
//   - always emits valid JSON (R021 v2.1.248 — invalid hook JSON is now surfaced as a hook error)
//
// Each test uses its own unique temp directory (mkdtemp) — no shared fixture path, no
// repository tracked-file manipulation (R009 File-Disjoint / shared-$TMPDIR discipline).

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(
  import.meta.dir,
  '../../../templates/.claude/hooks/scripts/claude-md-reinject.sh'
);

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run the hook script with a given stdin payload, env, and working directory. */
function runHookScript(
  scriptPath: string,
  stdinInput: string,
  env?: Record<string, string>,
  cwd?: string
): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    const child = spawn('bash', [scriptPath], {
      env: childEnv,
      cwd: cwd ?? tmpdir(),
    });

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

/** Run bash syntax check on the script file. */
function bashSyntaxCheck(scriptPath: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((res) => {
    const child = spawn('bash', ['-n', scriptPath]);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('close', (code: number | null) => res({ exitCode: code ?? -1, stderr }));
  });
}

function makeSessionStartInput(source: string): string {
  return JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'sess-A', source });
}

/** Extract the additionalContext string, or '' when the hook stayed silent. */
function additionalContextOf(stdout: string): string {
  if (stdout.trim().length === 0) return '';
  const parsed = JSON.parse(stdout) as {
    hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
  };
  return parsed.hookSpecificOutput?.additionalContext ?? '';
}

describe('claude-md-reinject.sh', () => {
  let workDir: string;

  beforeEach(async () => {
    // Unique per-test temp dir — never a shared fixed path (R009 $TMPDIR discipline).
    workDir = await mkdtemp(join(tmpdir(), 'omcc-claude-md-reinject-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
  });

  // --- POSITIVE ---

  it('should re-inject CLAUDE.md content via hookSpecificOutput.additionalContext on startup', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Project Rules\n\nSome rule text.\n');
    const result = await runHookScript(SCRIPT, makeSessionStartInput('startup'), {}, workDir);
    expect(result.exitCode).toBe(0);
    const ctx = additionalContextOf(result.stdout);
    expect(ctx).toContain('# Project Rules');
    expect(ctx).toContain('Some rule text.');
  });

  it('should deliver via hookSpecificOutput.additionalContext with hookEventName SessionStart', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Rules\n');
    const result = await runHookScript(SCRIPT, makeSessionStartInput('startup'), {}, workDir);
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(parsed.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  it('should fire for every SessionStart source (startup/resume/clear/compact)', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Rules\n');
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      const result = await runHookScript(SCRIPT, makeSessionStartInput(source), {}, workDir);
      const ctx = additionalContextOf(result.stdout);
      expect(ctx).toContain('# Rules');
      expect(ctx).toContain(`source: ${source}`);
    }
  });

  it('should never emit a decision field (advisory-only, must not block session start)', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Rules\n');
    const result = await runHookScript(SCRIPT, makeSessionStartInput('startup'), {}, workDir);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.decision).toBeUndefined();
  });

  // --- NEGATIVE CONTROLS (silence is the correct answer) ---

  it('should stay silent when opted out via OMCUSTOM_CLAUDEMD_REINJECT=off', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Rules\n');
    const result = await runHookScript(
      SCRIPT,
      makeSessionStartInput('startup'),
      { OMCUSTOM_CLAUDEMD_REINJECT: 'off' },
      workDir
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('should stay silent (exit 0, no output) when CLAUDE.md does not exist', async () => {
    // workDir has no CLAUDE.md and is not itself a git repo, so the script's
    // `git rev-parse --show-toplevel || pwd` fallback resolves to workDir.
    const result = await runHookScript(SCRIPT, makeSessionStartInput('startup'), {}, workDir);
    expect(result.exitCode).toBe(0);
    expect(additionalContextOf(result.stdout)).toBe('');
  });

  it('should stay silent when CLAUDE.md exceeds the size guard', async () => {
    const big = 'x'.repeat(2000);
    await writeFile(join(workDir, 'CLAUDE.md'), big);
    const result = await runHookScript(
      SCRIPT,
      makeSessionStartInput('startup'),
      { OMCUSTOM_CLAUDEMD_REINJECT_MAX_BYTES: '1000' },
      workDir
    );
    expect(result.exitCode).toBe(0);
    expect(additionalContextOf(result.stdout)).toBe('');
  });

  it('should still fire when CLAUDE.md is under the size guard boundary', async () => {
    const small = 'y'.repeat(500);
    await writeFile(join(workDir, 'CLAUDE.md'), small);
    const result = await runHookScript(
      SCRIPT,
      makeSessionStartInput('startup'),
      { OMCUSTOM_CLAUDEMD_REINJECT_MAX_BYTES: '1000' },
      workDir
    );
    expect(additionalContextOf(result.stdout)).toContain('y'.repeat(500));
  });

  // --- JSON validity (R021 v2.1.248 — invalid hook JSON now surfaces as a hook error) ---

  it('should always emit valid JSON when it fires', async () => {
    await writeFile(join(workDir, 'CLAUDE.md'), '# Rules with "quotes" and \\backslashes\\\n');
    const result = await runHookScript(SCRIPT, makeSessionStartInput('startup'), {}, workDir);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('should produce valid JSON output even with special characters in CLAUDE.md', async () => {
    const tricky = '# Rules\n\n`code` and $vars and \n newlines \t tabs and 한국어 텍스트\n';
    await writeFile(join(workDir, 'CLAUDE.md'), tricky);
    const result = await runHookScript(SCRIPT, makeSessionStartInput('compact'), {}, workDir);
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toContain('한국어 텍스트');
  });
});

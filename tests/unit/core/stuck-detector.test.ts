import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const STUCK_DETECTOR_SCRIPT = resolve(SCRIPTS_DIR, 'stuck-detector.sh');

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the stuck-detector hook script by spawning bash.
 * stdinInput is piped to stdin. Returns stdout, stderr, exitCode.
 *
 * The stuck-detector uses /tmp/.claude-tool-history-${PPID} to track
 * history. When spawned via spawn('bash', [script]), the PPID of the
 * bash process is the bun test runner's PID — so sequential calls
 * within a single test process share the same history file. This is
 * what allows us to build up state across multiple calls.
 */
function runStuckDetector(stdinInput: string, env?: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    const child = spawn('bash', [STUCK_DETECTOR_SCRIPT], { env: childEnv });

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

/**
 * Build a PostToolUse hook JSON payload for the stuck-detector.
 * Mirrors the Claude Code hook protocol: tool_name, tool_input, tool_output.
 */
function makeInput(opts: {
  tool_name: string;
  file_path?: string;
  command?: string;
  /** Edit/Write payload content — feeds edit_hash (#1641). */
  old_string?: string;
  is_error?: boolean;
  output?: string;
}): string {
  return JSON.stringify({
    tool_name: opts.tool_name,
    tool_input: {
      ...(opts.file_path !== undefined ? { file_path: opts.file_path } : {}),
      ...(opts.command !== undefined ? { command: opts.command } : {}),
      ...(opts.old_string !== undefined ? { old_string: opts.old_string } : {}),
    },
    tool_output: {
      is_error: opts.is_error ?? false,
      output: opts.output ?? '',
    },
  });
}

/** Run the stuck-detector N times with the same input, returning only the last result. */
async function runNTimes(
  input: string,
  n: number,
  env?: Record<string, string>
): Promise<ScriptResult> {
  let last: ScriptResult = { stdout: '', stderr: '', exitCode: 0 };
  for (let i = 0; i < n; i++) {
    last = await runStuckDetector(input, env);
  }
  return last;
}

/**
 * Run the stuck-detector N times and collect all results.
 * Useful for verifying that advisory appears at a specific call index.
 */
async function runNTimesAll(
  input: string,
  n: number,
  env?: Record<string, string>
): Promise<ScriptResult[]> {
  const results: ScriptResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await runStuckDetector(input, env));
  }
  return results;
}

// -------------------------------------------------------------------
// Test state management
// -------------------------------------------------------------------

/** The history file path is /tmp/.claude-tool-history-<bun-pid> */
function historyFilePath(): string {
  return `/tmp/.claude-tool-history-${process.pid}`;
}

/** Remove the history file so each test starts with a clean state. */
function cleanHistory(): void {
  try {
    require('node:fs').unlinkSync(historyFilePath());
  } catch {
    // ignore if file doesn't exist
  }
}

// -------------------------------------------------------------------
// Test suite
// -------------------------------------------------------------------

describe('stuck-detector.sh', () => {
  beforeEach(() => {
    cleanHistory();
  });

  afterEach(() => {
    cleanHistory();
  });

  // -----------------------------------------------------------------
  // Script existence and syntax
  // -----------------------------------------------------------------

  describe('script validity', () => {
    it('should exist in the templates scripts directory', () => {
      expect(existsSync(STUCK_DETECTOR_SCRIPT)).toBe(true);
    });

    it('should have a bash shebang on the first line', async () => {
      const content = await readFile(STUCK_DETECTOR_SCRIPT, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toMatch(/^#!.*bash/);
    });

    it('should pass bash -n syntax check', async () => {
      const result = await new Promise<ScriptResult>((res) => {
        const child = spawn('bash', ['-n', STUCK_DETECTOR_SCRIPT]);
        let stderr = '';
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        child.on('close', (code: number | null) =>
          res({ stdout: '', stderr, exitCode: code ?? -1 })
        );
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  // -----------------------------------------------------------------
  // Basic pass-through behavior
  // -----------------------------------------------------------------

  describe('basic pass-through', () => {
    it('should exit 0 on first call (no history yet)', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/foo.ts' });
      const result = await runStuckDetector(input);
      expect(result.exitCode).toBe(0);
    });

    it('should pass stdin through to stdout on first call', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/foo.ts' });
      const result = await runStuckDetector(input);
      expect(result.stdout.trim()).toBe(input);
    });

    it('should exit 0 when history has fewer than 3 entries', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/foo.ts' });
      const results = await runNTimesAll(input, 2);
      for (const r of results) {
        expect(r.exitCode).toBe(0);
      }
    });

    it('should pass stdin through to stdout even when advisory is emitted', async () => {
      // Trigger an edit loop advisory (3 repeats of same file in last 8)
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/loop.ts' });
      // Need 3+ entries to pass the recent_count check, and 3+ of same file to trigger
      const results = await runNTimesAll(input, 4);
      const last = results[results.length - 1];
      // Regardless of advisory, stdout must always contain the original input
      expect(last.stdout.trim()).toBe(input);
    });
  });

  // -----------------------------------------------------------------
  // Signal 1: Repeated error hash (advisory at 3+, hard-block at 3+)
  // -----------------------------------------------------------------

  describe('Signal 1: Repeated error hash detection', () => {
    const ERROR_OUTPUT = 'TypeError: Cannot read property of undefined';

    function makeErrorInput(output = ERROR_OUTPUT): string {
      return makeInput({
        tool_name: 'Bash',
        command: 'npm test',
        is_error: true,
        output,
      });
    }

    it('should NOT emit advisory on first 2 error occurrences', async () => {
      const input = makeErrorInput();
      const results = await runNTimesAll(input, 2);
      for (const r of results) {
        expect(r.stderr).not.toContain('[Stuck Detection]');
      }
    });

    it('should emit advisory and hard-block when same error appears 3 times', async () => {
      const input = makeErrorInput();
      const results = await runNTimesAll(input, 3);
      const third = results[2];
      // At threshold=3, hard-block fires (exit 2). Advisory fires first (in stderr), then hard-block.
      expect(third.exitCode).toBe(2);
      expect(third.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should report "Repeated error" signal type in advisory', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Repeated error');
    });

    it('should include occurrence count in advisory', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('3');
    });

    it('should include recovery suggestion in advisory', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Recovery');
    });

    it('should hard-block at 4 consecutive identical errors (threshold=3)', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(2);
    });

    it('should hard-block (exit 2) when same error hash appears 3 consecutive times', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should emit HARD BLOCK message to stderr on 3rd consecutive same-error', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should include hard-block reason mentioning consecutive repetitions', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('consecutive');
    });

    it('should still pass stdin to stdout even when hard-blocking', async () => {
      const input = makeErrorInput();
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
      expect(result.stdout.trim()).toBe(input);
    });

    it('should NOT hard-block when errors have different content (different hash)', async () => {
      // Alternate between two different errors — neither reaches 3 consecutive identical.
      // Use different commands to avoid triggering the tool+target consecutive hard-block.
      for (let i = 0; i < 3; i++) {
        await runStuckDetector(
          makeInput({
            tool_name: 'Bash',
            command: `cmd-a-${i}`,
            is_error: true,
            output: `Error A occurrence ${i}`,
          })
        );
        await runStuckDetector(
          makeInput({
            tool_name: 'Bash',
            command: `cmd-b-${i}`,
            is_error: true,
            output: `Error B occurrence ${i}`,
          })
        );
      }
      const last = await runStuckDetector(
        makeInput({
          tool_name: 'Bash',
          command: 'cmd-a-final',
          is_error: true,
          output: 'Error A occurrence final',
        })
      );
      // "Error A occurrence" hash appears 4 times in last 10 (>= 3 advisory threshold)
      // but only 1 time consecutively at the end (not >= 3 for hard-block)
      // However note: advisory exits 0 even when it fires
      expect(last.exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // Signal 2: Edit loop — same file edited multiple times
  // -----------------------------------------------------------------

  describe('Signal 2: Same file edit loop detection', () => {
    const TARGET_FILE = '/src/components/Button.tsx';

    function makeEditInput(filePath = TARGET_FILE): string {
      return makeInput({ tool_name: 'Edit', file_path: filePath });
    }

    it('should NOT emit advisory for 2 edits of the same file', async () => {
      const input = makeEditInput();
      const results = await runNTimesAll(input, 2);
      for (const r of results) {
        expect(r.stderr).not.toContain('[Stuck Detection]');
      }
    });

    it('should hard-block when same file is edited 3 times (at threshold)', async () => {
      const input = makeEditInput();
      const results = await runNTimesAll(input, 3);
      const third = results[2];
      // At threshold=3, hard-block fires (exit 2).
      expect(third.exitCode).toBe(2);
      expect(third.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should report "Edit loop" signal type in advisory', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Edit loop');
    });

    it('should include the filename (not full path) in the advisory pattern description', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      // basename of TARGET_FILE is "Button.tsx"
      expect(result.stderr).toContain('Button.tsx');
    });

    it('should include edit count in advisory', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      // occurrence count is 3
      expect(result.stderr).toContain('3');
    });

    it('should hard-block (exit 2) when same file edited 3 consecutive times', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should emit HARD BLOCK message when same file edited 3 consecutive times', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should include file basename in hard-block reason', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Button.tsx');
    });

    it('should hard-block at exactly 4 consecutive same-file edits (threshold=3)', async () => {
      const input = makeEditInput();
      const result = await runNTimes(input, 4);
      // 4 >= HARD_BLOCK_THRESHOLD=3, so hard block
      expect(result.exitCode).toBe(2);
    });

    it('should also trigger advisory for Write tool on same file', async () => {
      const input = makeInput({ tool_name: 'Write', file_path: TARGET_FILE });
      const results = await runNTimesAll(input, 3);
      const third = results[2];
      expect(third.stderr).toContain('[Stuck Detection] Loop detected');
    });

    it('should NOT trigger edit-loop advisory when different files are edited', async () => {
      // Edit 3 different files — no single file reaches the threshold
      await runStuckDetector(makeEditInput('/src/a.ts'));
      await runStuckDetector(makeEditInput('/src/b.ts'));
      const last = await runStuckDetector(makeEditInput('/src/c.ts'));
      expect(last.stderr).not.toContain('Edit loop');
    });
  });

  // -----------------------------------------------------------------
  // Signal 3: Tool spam — same tool+target (hard-block check)
  // -----------------------------------------------------------------

  describe('Signal 3: Same tool+target combination detection', () => {
    const TARGET_FILE = '/scripts/build.sh';

    function makeBashInput(filePath = TARGET_FILE): string {
      return makeInput({ tool_name: 'Bash', file_path: filePath });
    }

    it('should hard-block on 4 consecutive same tool+target calls (threshold=3)', async () => {
      const input = makeBashInput();
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(2);
    });

    it('should hard-block (exit 2) on 3 consecutive same tool+target calls', async () => {
      const input = makeBashInput();
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should emit HARD BLOCK message on 3rd consecutive same tool+target', async () => {
      const input = makeBashInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should include target identifier in hard-block reason', async () => {
      // Check 1 fires for same path (any tool), reason includes the basename
      const input = makeBashInput();
      const result = await runNTimes(input, 3);
      // Hard-block reason always identifies the target (file basename)
      expect(result.stderr).toContain('build.sh');
    });

    it('should include file basename in hard-block reason', async () => {
      const input = makeBashInput();
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('build.sh');
    });

    it('should still pass stdin through when hard-blocking', async () => {
      const input = makeBashInput();
      const result = await runNTimes(input, 3);
      expect(result.stdout.trim()).toBe(input);
    });

    it('should NOT hard-block when same tool is used on different targets', async () => {
      // 5 Bash calls on different files — tool spam advisory may trigger but not per-file hard block
      for (let i = 0; i < 5; i++) {
        await runStuckDetector(makeBashInput(`/scripts/script-${i}.sh`));
      }
      const last = await runStuckDetector(makeBashInput('/scripts/final.sh'));
      // No single tool+target combo reached 3 consecutive, so no hard block
      expect(last.exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // Tool spam (Signal 3 advisory): same tool 5+ times in last 8
  // -----------------------------------------------------------------

  describe('Signal 3 advisory: tool spam detection', () => {
    it('should emit tool loop advisory when same tool called 5 times in last 8', async () => {
      // Use a non-Edit/Write tool so edit-loop signal doesn't trigger first
      // Use different file_path values so per-file signals don't trigger
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: `cmd-${i}` }));
      }
      const result = await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'cmd-4' }));
      expect(result.stderr).toContain('Tool loop');
    });

    it('should include tool name in tool loop advisory', async () => {
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: `build-${i}` }));
      }
      const result = await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'build-4' }));
      expect(result.stderr).toContain('Bash');
    });

    it('should include call count in tool loop advisory', async () => {
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: `step-${i}` }));
      }
      const result = await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'step-4' }));
      expect(result.stderr).toContain('5');
    });

    it('should exit 0 (advisory only) when tool spam threshold is met', async () => {
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: `run-${i}` }));
      }
      const result = await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'run-4' }));
      // Tool spam at count=5 triggers advisory but not hard-block unless same target
      // (hard-block requires same tool+target or same file or same error)
      // exit 0 expected since no single target was hit 5 times consecutively
      expect(result.exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // Counter reset: different operations reset patterns
  // -----------------------------------------------------------------

  describe('counter reset via different operations', () => {
    it('should reset edit-loop count when a different file is accessed', async () => {
      const sameFile = '/src/target.ts';
      // 2 edits to same file (not enough to trigger)
      await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: sameFile }));
      await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: sameFile }));
      // Switch to a different file — this breaks any consecutive run for hard-block
      await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: '/src/other.ts' }));
      // Now edit the original file again — consecutive count for hard-block is broken
      // But we need to check advisory in last 8 entries
      const last = await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: sameFile }));
      // Only 3 of last 8 are target.ts (count=3 >= advisory threshold=3 for edit loop)
      // Advisory may still appear due to Signal 2 (last 8 window), but hard-block requires
      // 3 CONSECUTIVE, which was broken by the /src/other.ts entry.
      expect(last.exitCode).toBe(0);
    });

    it('should NOT hard-block when interleaved different operations break the consecutive run', async () => {
      const sameFile = '/src/module.ts';
      // Edits to same file (some will trigger hard-block at count=3, but we only care about the final call)
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: sameFile }));
      }
      // Interrupt consecutive run with a different file
      await runStuckDetector(makeInput({ tool_name: 'Read', file_path: '/src/other.ts' }));
      // Resume editing — but consecutive run was broken; only 1 consecutive same-file call
      const last = await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: sameFile }));
      // Hard block requires 3 CONSECUTIVE; the Read interruption resets the count
      expect(last.exitCode).toBe(0);
    });

    it('should reset error consecutive count when a non-error call interrupts', async () => {
      const errorOutput = 'SyntaxError: Unexpected token';
      const errorInput = makeInput({
        tool_name: 'Edit',
        file_path: '/src/compile-target.ts',
        is_error: true,
        output: errorOutput,
      });
      // Use a different file for the success to break the consecutive same-file run
      const successInput = makeInput({
        tool_name: 'Read',
        file_path: '/src/different-file.ts',
        is_error: false,
        output: 'Success',
      });

      // Several consecutive errors on same file (some will hard-block at count=3)
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(errorInput);
      }
      // One success on a different file interrupts the consecutive same-file run
      await runStuckDetector(successInput);
      // Now back to error — consecutive count for same file+tool restarted
      const last = await runStuckDetector(errorInput);
      // Only 1 consecutive same-file call after the interruption — no hard block
      expect(last.exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // Below threshold: advisory only (exit 0), no hard-block
  // -----------------------------------------------------------------

  describe('below threshold behavior (counts < 3)', () => {
    it('should exit 0 at count=1 (same file)', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runStuckDetector(input);
      expect(result.exitCode).toBe(0);
    });

    it('should exit 0 at count=2 (same file)', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runNTimes(input, 2);
      expect(result.exitCode).toBe(0);
    });

    it('should hard-block (exit 2) at count=3 (same file) — at threshold', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should hard-block (exit 2) at count=4 (same file) — above threshold', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(2);
    });

    it('should emit HARD BLOCK (not just advisory) at count=3', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const results = await runNTimesAll(input, 3);
      const third = results[2];
      expect(third.exitCode).toBe(2);
      expect(third.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should emit HARD BLOCK at count=4', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });

    it('should NOT emit any detection output at count=1', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runStuckDetector(input);
      expect(result.stderr).not.toContain('[Stuck Detection]');
    });

    it('should NOT emit any detection output at count=2', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/app.ts' });
      const result = await runNTimes(input, 2);
      expect(result.stderr).not.toContain('[Stuck Detection]');
    });
  });

  // -----------------------------------------------------------------
  // At threshold: hard-block (exit 1)
  // -----------------------------------------------------------------

  describe('at threshold behavior (count = 3)', () => {
    it('should hard-block (exit 2) at count=3 for same file consecutive edits', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should emit HARD BLOCK header to stderr at count=3', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('=== [Stuck Detection] HARD BLOCK ===');
    });

    it('should include threshold value in hard-block message', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('3');
    });

    it('should include "Blocking this tool call" message', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Blocking this tool call');
    });

    it('should include recovery advice in hard-block message', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Recovery');
    });

    it('should still pass stdin to stdout when hard-blocking', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/stuck.ts' });
      const result = await runNTimes(input, 3);
      // Even on hard block, input is echoed back (hook protocol)
      expect(result.stdout.trim()).toBe(input);
    });

    it('should hard-block at count=3 for same error hash', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'test',
        is_error: true,
        output: 'ReferenceError: x is not defined',
      });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should hard-block at count=3 for same tool+target', async () => {
      // Bash with a command (resolves as file_path fallback for tool_input.command)
      const input = makeInput({ tool_name: 'Bash', file_path: '/scripts/deploy.sh' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should transition from no-block to hard-block between count=2 and count=3', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/transition.ts' });
      const results = await runNTimesAll(input, 3);

      // count=2: no hard-block (exit 0)
      expect(results[1].exitCode).toBe(0);
      expect(results[1].stderr).not.toContain('HARD BLOCK');

      // count=3: hard-block (exit 2)
      expect(results[2].exitCode).toBe(2);
      expect(results[2].stderr).toContain('[Stuck Detection] HARD BLOCK');
    });
  });

  // -----------------------------------------------------------------
  // Advisory output format validation
  // -----------------------------------------------------------------

  describe('advisory output format', () => {
    it('should emit advisory to stderr (not stdout)', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/check.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('[Stuck Detection] Loop detected');
      // stdout should only contain the original input
      expect(result.stdout.trim()).toBe(input);
    });

    it('should include Signal field in advisory', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/format.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Signal:');
    });

    it('should include Pattern field in advisory', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/format.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Pattern:');
    });

    it('should include Occurrences field with threshold in advisory', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/format.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Occurrences:');
    });

    it('should include Recovery field in advisory', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/format.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('Recovery:');
    });
  });

  // -----------------------------------------------------------------
  // Hard-block output format validation
  // -----------------------------------------------------------------

  describe('hard-block output format', () => {
    it('should emit hard-block to stderr (not stdout)', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/hb.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('HARD BLOCK');
      expect(result.stdout.trim()).toBe(input);
    });

    it('should emit opening and closing block delimiters', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/hb.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('===');
    });

    it('should mention threshold count in hard-block message', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/hb.ts' });
      const result = await runNTimes(input, 3);
      expect(result.stderr).toContain('consecutive identical operations');
    });
  });

  // -----------------------------------------------------------------
  // Read-only Bash exemption from Hard Block Checks 1/3 (#1625 찐빠 #2)
  // -----------------------------------------------------------------

  describe('read-only Bash exemption from hard-block (#1625)', () => {
    it('POSITIVE CONTROL: should still hard-block when the same file is Edited 3 consecutive times', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/readonly-control.ts' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should NOT hard-block when the same read-only git command is run 3 consecutive times', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('should NOT hard-block when the same read-only gh command is run 4 consecutive times', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'gh issue view 1625' });
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(0);
    });

    it('should NOT hard-block on repeated read-only ls command', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'ls -la .claude/hooks/scripts' });
      const result = await runNTimes(input, 4);
      expect(result.exitCode).toBe(0);
    });

    it('should NOT hard-block on bare "git branch" (read query, no positional arg)', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git branch' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('should NOT hard-block on "gh api" without mutating flags (GET-style)', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'gh api repos/o/r/branches/develop/protection',
      });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE CONTROL: should still hard-block when the same non-read-only Bash command is run 3 consecutive times', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'npm install' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block when a read-only-looking command has an ambiguous redirection', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status > /tmp/out.txt' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block on "git branch <name>" (create, not a bare query)', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git branch new-feature' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block on "gh api" with mutating field flags', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'gh api repos/o/r/issues -f title=x' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block on repeated identical error even for a read-only command (Check 2 unaffected)', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'git status',
        is_error: true,
        output: 'fatal: not a git repository',
      });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('[Stuck Detection] HARD BLOCK');
    });
  });

  // -----------------------------------------------------------------
  // Compound/piped read-only command classification (#1629)
  // -----------------------------------------------------------------

  describe('compound command read-only classification (#1629)', () => {
    it('NEGATIVE: should NOT hard-block on 3 consecutive all-read-only "|"-piped commands', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status | grep modified' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on 3 consecutive all-read-only "&&"-chained commands', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status && git log' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on 3 consecutive all-read-only ";"-chained commands', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'ls; pwd' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on 3 consecutive mixed "&&"/"|"/";" all-read-only commands', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status && ls | grep x; pwd' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('POSITIVE: should still hard-block on 3 consecutive "|"-piped commands with a write segment', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'ls | tee /tmp/agent3b-out.txt' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('POSITIVE: should still hard-block on 3 consecutive "&&"-chained commands with a write segment', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status && npm install' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('POSITIVE: should still hard-block on 3 consecutive ";"-chained commands with a write segment', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'ls; npm install' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block on "||" (conditional-OR, not decomposed) even when both sides look read-only', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status || echo fail' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block on a trailing-separator command (empty segment => conservative write)', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status;' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });
  });
  // -----------------------------------------------------------------
  // Command substitution / loop read-only classification (#1641)
  // -----------------------------------------------------------------

  describe('command substitution and loop read-only classification (#1641)', () => {
    /**
     * Ground-truth read of the classifier's verdict for the most recent call.
     * The hook records its is_readonly decision as the "readonly" field of each
     * history entry, so this asserts is_readonly_bash_command() directly.
     *
     * Needed because the exitCode-2 route (hard-block Check 1/Check 3) matches
     * history with `grep` on a sed-escaped path, and that escaping backslashes
     * "(" / ")" — which are LITERALS in BRE, so escaping them turns them into
     * grouping metacharacters and the match silently never succeeds. Commands
     * containing parentheses or double quotes therefore can never reach
     * exitCode 2 regardless of their classification. That is a pre-existing
     * Check 1/3 defect (owned by the #1641 B2 follow-up), independent of the
     * classification logic under test here.
     */
    function lastReadonlyFlag(): string {
      const raw = require('node:fs').readFileSync(historyFilePath(), 'utf-8') as string;
      const lines = raw.trim().split('\n');
      return JSON.parse(lines[lines.length - 1]).readonly;
    }

    // --- NEGATIVE controls: genuinely read-only => must NOT hard-block ---

    it('NEGATIVE: should NOT hard-block on a read-only "$(...)" capture piped into a read-only chain', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'run_id=$(gh pr view 1 --json x); gh run view "$run_id" --log-failed | grep err',
      });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on a "for ... do ... done" loop with a read-only body', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'for i in 1 2 3; do gh api repos/o/r/issues/$i; done',
      });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on a read-only command with ">/dev/null" redirection', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status 2>/dev/null' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT hard-block on a read-only command with "2>&1" fd duplication', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'ls -la .claude 2>&1 | grep hooks' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(0);
    });

    // --- POSITIVE controls: the safety gate must NOT be weakened. If any of
    // these turns into exitCode 0, the relaxation went too far — revert. ---

    it('POSITIVE: should still classify a "$(...)" substitution containing a write (rm) as NOT read-only', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'echo "$(rm -rf /tmp/x1641)"' });
      await runNTimes(input, 3);
      expect(lastReadonlyFlag()).toBe('false');
    });

    it('POSITIVE: should still classify an assigned "$(...)" substitution containing "git push" as NOT read-only', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'x=$(git push origin main); echo done',
      });
      await runNTimes(input, 3);
      expect(lastReadonlyFlag()).toBe('false');
    });

    it('POSITIVE: should still hard-block on a "for" loop whose body performs a write', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'for f in a b; do rm -f $f; done' });
      const result = await runNTimes(input, 3);
      expect(lastReadonlyFlag()).toBe('false');
      expect(result.exitCode).toBe(2);
    });

    it('POSITIVE: should still hard-block on a real file-write redirection (not /dev/null)', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'cat x > /tmp/out1641.txt' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('POSITIVE: should still hard-block when a backtick substitution contains a write', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'echo `npm install`' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });

    it('POSITIVE: should still hard-block on "||" (regression guard for #1629)', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status || echo fail' });
      const result = await runNTimes(input, 3);
      expect(result.exitCode).toBe(2);
    });
  });

  // -----------------------------------------------------------------
  // Signal 3 advisory read-only exemption (#1629)
  // -----------------------------------------------------------------

  describe('Signal 3 advisory read-only exemption (#1629)', () => {
    it('NEGATIVE: should NOT emit Tool loop advisory for 5 consecutive read-only Bash calls', async () => {
      const input = makeInput({ tool_name: 'Bash', command: 'git status' });
      const results = await runNTimesAll(input, 5);
      for (const r of results) {
        expect(r.stderr).not.toContain('Tool loop');
      }
      const last = results[results.length - 1];
      expect(last.exitCode).toBe(0);
    });

    it('NEGATIVE: should NOT emit Tool loop advisory when read-only calls are mixed with a non-triggering write call', async () => {
      // 4 read-only calls + a 5th write call on a distinct target: the read-only
      // entries are excluded from the historical count, so the tool-spam
      // threshold (5) is never reached for either read-only or write history.
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git log' }));
      }
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'npm run build' })
      );
      expect(result.stderr).not.toContain('Tool loop');
    });

    it('POSITIVE CONTROL: should still emit Tool loop advisory for 5 consecutive non-read-only Bash calls', async () => {
      for (let i = 0; i < 4; i++) {
        await runStuckDetector(makeInput({ tool_name: 'Bash', command: `npm run task-${i}` }));
      }
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'npm run task-4' })
      );
      expect(result.stderr).toContain('Tool loop');
    });
  });

  // -----------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty stdin without crashing (may exit non-zero due to jq)', async () => {
      const result = await runStuckDetector('');
      // set -euo pipefail: jq parse error on empty input causes non-zero exit, which is acceptable
      // The key requirement is: it must not hang and must complete
      expect(result.exitCode).toBeDefined();
    });

    it('should handle minimal valid JSON input (no tool fields)', async () => {
      const result = await runStuckDetector('{}');
      // jq extracts defaults: tool_name="unknown", file_path="", is_error=false
      expect(result.exitCode).toBe(0);
    });

    it('should gracefully handle tool_name of "unknown"', async () => {
      const input = makeInput({ tool_name: 'unknown', file_path: '' });
      const result = await runStuckDetector(input);
      expect(result.exitCode).toBe(0);
    });

    it('should NOT emit error detection when is_error is false', async () => {
      const input = makeInput({
        tool_name: 'Bash',
        command: 'echo hello',
        is_error: false,
        output: 'hello',
      });
      const result = await runNTimes(input, 4);
      // No error hash generated, so error repetition signal cannot trigger
      expect(result.stderr).not.toContain('Repeated error');
    });

    it('should NOT generate error_hash when is_error is false', async () => {
      // Even if we have the same "output" text, non-error calls do not build error_hash
      const successInput = makeInput({
        tool_name: 'Bash',
        command: 'run',
        is_error: false,
        output: 'same output text repeated',
      });
      // Run 5 times — no error detection should trigger since is_error=false
      const result = await runNTimes(successInput, 5);
      expect(result.stderr).not.toContain('Repeated error');
    });

    it('should create history file after first call', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/x.ts' });
      await runStuckDetector(input);
      expect(existsSync(historyFilePath())).toBe(true);
    });

    it('should append one JSON entry to history file per call', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/append.ts' });
      await runNTimes(input, 3);
      const content = await readFile(historyFilePath(), 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((l) => l.trim() !== '');
      expect(lines.length).toBe(3);
    });

    it('should write valid JSON entries to history file', async () => {
      const input = makeInput({ tool_name: 'Write', file_path: '/src/valid.ts' });
      await runStuckDetector(input);
      const content = await readFile(historyFilePath(), 'utf-8');
      const line = content.trim().split('\n')[0];
      expect(() => JSON.parse(line)).not.toThrow();
    });

    it('should record correct tool_name in history entry', async () => {
      const input = makeInput({ tool_name: 'Write', file_path: '/src/valid.ts' });
      await runStuckDetector(input);
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.tool).toBe('Write');
    });

    it('should record correct path in history entry', async () => {
      const input = makeInput({ tool_name: 'Edit', file_path: '/src/path-check.ts' });
      await runStuckDetector(input);
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.path).toBe('/src/path-check.ts');
    });
  });

  // -----------------------------------------------------------------
  // #1641 — Bash target vs file path separation + JSON-encoded history
  //         matching (B2a scope: field split, entry schema, match fix)
  // -----------------------------------------------------------------

  describe('Bash target vs file path separation (#1641)', () => {
    it('should record the Bash command as path and leave edit_hash empty', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'npm run build' }));
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.path).toBe('npm run build');
      expect(entry.edit_hash).toBe('');
    });

    it('should derive edit_hash from Edit old_string (alphanumerics only)', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Edit', file_path: '/src/hash.ts', old_string: 'AAA-111 bbb' })
      );
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.edit_hash).toBe('AAA111bbb');
    });

    it('should NOT report a Bash command as a "Same file" hard block', async () => {
      // 3 distinct read-only queries, then one write — the pre-#1641 code fed
      // the command text into file_path and reported it as an edited "file".
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status' }));
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git log --oneline' }));
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'ls -la' }));
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'npm install' })
      );
      expect(result.stderr).not.toContain('Same file (');
      expect(result.exitCode).toBe(0);
    });

    it('should still hard-block an identical Bash write command repeated 3 times', async () => {
      const result = await runNTimes(makeInput({ tool_name: 'Bash', command: 'npm install' }), 3);
      expect(result.exitCode).toBe(2);
    });

    it('should still hard-block an identical Edit repeated 3 times', async () => {
      const result = await runNTimes(
        makeInput({ tool_name: 'Edit', file_path: '/src/same-edit.ts', old_string: 'A' }),
        3
      );
      expect(result.exitCode).toBe(2);
    });

    // History matching regression: the old BRE escaping turned "( ) + ? { |"
    // into operators (they are literals in POSIX BRE) and compared a RAW value
    // against a JSON-ENCODED history field, so any command with parentheses or
    // quotes silently stopped matching.
    it('should hard-block an identical command containing parentheses and quotes', async () => {
      const cmd = 'npm install "$(echo pkg-a)"';
      const result = await runNTimes(makeInput({ tool_name: 'Bash', command: cmd }), 3);
      expect(result.exitCode).toBe(2);
    });

    // Narrowing regression (#1641): three DIFFERENT edits to one file is the
    // normal incremental-edit workflow (the wiki-curator case in the issue),
    // not a stuck loop. Before the narrowing this hard-blocked at the 3rd edit.
    it('should NOT hard-block 3 different edits to the same file', async () => {
      const path = '/src/incremental.ts';
      await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: path, old_string: 'A' }));
      await runStuckDetector(makeInput({ tool_name: 'Edit', file_path: path, old_string: 'B' }));
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Edit', file_path: path, old_string: 'C' })
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('HARD BLOCK');
    });

    it('should describe a repeated Bash command as a command, not a file', async () => {
      const result = await runNTimes(makeInput({ tool_name: 'Bash', command: 'npm install' }), 3);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Identical Bash command');
      expect(result.stderr).not.toContain('Same file (');
    });

    it('should NOT hard-block different commands sharing a parenthesized prefix', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'npm install "$(echo a)"' }));
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'npm install "$(echo b)"' }));
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'npm install "$(echo c)"' })
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('HARD BLOCK');
    });
  });
  // -----------------------------------------------------------------
  // Adversarial-review regressions (M-4 / M-3 / L-3 / L-4)
  // -----------------------------------------------------------------

  describe('adversarial-review regressions', () => {
    // M-4: the "$(...)" balance scan is a per-character loop that rebuilds the
    // accumulator each iteration => O(n^2). Measured before the cap: 5 KB of
    // inner text took 0.9 s and 20 KB took 13.6 s of hook latency. raw_command
    // was the only field with no length cap, so a long command is now
    // classified as a write without being scanned at all.
    it('should classify a 20 KB command-substitution command without the O(n^2) scan', async () => {
      const command = `ls $(echo ${'a'.repeat(20000)})`;
      const started = Date.now();
      const result = await runStuckDetector(makeInput({ tool_name: 'Bash', command }));
      const elapsed = Date.now() - started;
      expect(result.exitCode).toBe(0);
      expect(elapsed).toBeLessThan(5000);
    }, 30000);

    it('should treat an over-cap command as a write (conservative side)', async () => {
      const command = `ls $(echo ${'a'.repeat(20000)})`;
      await runStuckDetector(makeInput({ tool_name: 'Bash', command }));
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.readonly).toBe('false');
    });

    // M-3: target_key is truncated, so two DIFFERENT long commands that share
    // the capped prefix used to collapse to the same history key and hard-block
    // each other (a false positive re-introduced by the grep -F switch).
    // truncate_key() now appends the ORIGINAL length to the truncated key.
    it('should NOT hard-block 3 long commands sharing the capped prefix', async () => {
      const prefix = `npm install ${'a'.repeat(1100)}`;
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: `${prefix} one` }));
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: `${prefix} twotwo` }));
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: `${prefix} threethreethree` })
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain('HARD BLOCK');
    });

    // Negative control for the fix above: an identical over-cap command must
    // STILL hard-block — the length tag must not defeat genuine detection.
    it('should still hard-block an identical over-cap command repeated 3 times', async () => {
      const command = `npm install ${'a'.repeat(1100)} same`;
      const result = await runNTimes(makeInput({ tool_name: 'Bash', command }), 3);
      expect(result.exitCode).toBe(2);
    });

    it('should record the original length in a truncated target key', async () => {
      const command = `npm install ${'a'.repeat(1100)}`;
      await runStuckDetector(makeInput({ tool_name: 'Bash', command }));
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.path).toBe(`${command.slice(0, 1000)}#len=${command.length}`);
    });

    // L-3: basename without "--" treats a leading-dash value as an option, so
    // it exits 1 and (under set -e) killed the whole hook with exit 1 instead
    // of producing a verdict.
    it('should not crash when file_path starts with a dash', async () => {
      const result = await runNTimes(
        makeInput({ tool_name: 'Edit', file_path: '-e', old_string: 'A' }),
        3
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).not.toContain('illegal option');
      expect(result.stderr).not.toContain('usage: basename');
      expect(result.stderr).toContain('HARD BLOCK');
    });

    // L-4: the remaining `echo "$var"` call sites were replaced with printf so
    // that backslash sequences in captured data can never be re-interpreted.
    it('should keep backslash sequences in a command target intact', async () => {
      const command = 'grep -c "\\n\\t" file.txt';
      await runStuckDetector(makeInput({ tool_name: 'Bash', command }));
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.path).toBe(command);
    });

    it('should still classify "git branch -a" read-only and "git branch foo" as a write', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git branch -a' }));
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git branch foo' }));
      const content = await readFile(historyFilePath(), 'utf-8');
      const lines = content.trim().split('\n');
      expect(JSON.parse(lines[0]).readonly).toBe('true');
      expect(JSON.parse(lines[1]).readonly).toBe('false');
    });

    it('should build an error hash from output containing backslashes', async () => {
      const result = await runStuckDetector(
        makeInput({
          tool_name: 'Bash',
          command: 'false',
          is_error: true,
          output: 'ENOENT: no such file \\n C:\\temp\\x',
        })
      );
      expect(result.exitCode).toBe(0);
      const content = await readFile(historyFilePath(), 'utf-8');
      const entry = JSON.parse(content.trim().split('\n')[0]);
      expect(entry.error_hash).not.toBe('');
    });
  });

  // -----------------------------------------------------------------
  // Newline decomposition + SIGPIPE-safe preview (#1647 M-5 / M-6)
  // -----------------------------------------------------------------

  describe('newline separators and large tool output (#1647)', () => {
    /**
     * Ground-truth read of the classifier verdict recorded for the LAST call.
     * The hook writes its is_readonly decision as the "readonly" field of each
     * history entry, so this asserts is_readonly_bash_command() directly
     * instead of going through the exit-code route.
     */
    function lastEntry(): Record<string, string> {
      const raw = require('node:fs').readFileSync(historyFilePath(), 'utf-8') as string;
      const lines = raw.trim().split('\n');
      return JSON.parse(lines[lines.length - 1]);
    }

    // --- M-5: a newline was not a statement separator, and
    // is_readonly_single_command's `read -ra` stops at the first newline, so
    // everything after line 1 was invisible to the classifier.

    it('POSITIVE: should classify a write hidden on the second line as a write', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status\nrm -rf build' }));
      expect(lastEntry().readonly).toBe('false');
    });

    it('NEGATIVE: should keep an all-read-only newline-separated command read-only', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status\ngit log' }));
      expect(lastEntry().readonly).toBe('true');
    });

    it('POSITIVE: should hard-block 3 newline-separated commands with a write line', async () => {
      const result = await runNTimes(
        makeInput({ tool_name: 'Bash', command: 'git status\nnpm install' }),
        3
      );
      expect(result.exitCode).toBe(2);
    });

    it('NEGATIVE: should NOT hard-block 3 all-read-only newline-separated commands', async () => {
      const result = await runNTimes(makeInput({ tool_name: 'Bash', command: 'ls\npwd' }), 3);
      expect(result.exitCode).toBe(0);
    });

    it('should treat CRLF as a separator in both directions', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'git status\r\nrm -rf build' })
      );
      expect(lastEntry().readonly).toBe('false');
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status\r\ngit log' }));
      expect(lastEntry().readonly).toBe('true');
    });

    it('should not treat a blank line between read-only commands as an empty segment', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status\n\ngit log' }));
      expect(lastEntry().readonly).toBe('true');
    });

    it('should still treat a trailing ";" as an empty (ambiguous) segment', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'git status;' }));
      expect(lastEntry().readonly).toBe('false');
    });

    // A heredoc body is DATA, not statements: splitting it into commands would
    // have flipped the pre-#1647 verdict for `cat <<'EOF' ... EOF`.
    it('should keep a heredoc command read-only (pre-#1647 verdict preserved)', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: "cat <<'EOF'\nhello world\nEOF" })
      );
      expect(lastEntry().readonly).toBe('true');
    });

    it('should keep a redirecting heredoc a write (pre-#1647 verdict preserved)', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: "cat > out.txt <<'EOF'\nx\nEOF" })
      );
      expect(lastEntry().readonly).toBe('false');
    });

    it('should classify a write that FOLLOWS a heredoc body as a write', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: "cat <<'EOF'\nhello\nEOF\nrm -rf build" })
      );
      expect(lastEntry().readonly).toBe('false');
    });

    it('should classify an unterminated heredoc as a write', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: "cat <<'EOF'\nno terminator here" })
      );
      expect(lastEntry().readonly).toBe('false');
    });

    it('should not mistake a herestring "<<<" for a heredoc opener', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'grep x <<< foo' }));
      expect(lastEntry().readonly).toBe('true');
    });

    it('should not mistake a literal "<<" in a single-line command for a heredoc', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'echo "a << b"' }));
      expect(lastEntry().readonly).toBe('true');
    });

    // --- M-1: heredoc DELIMITER FORGERY. The opener scan does not know
    // whether the "<<" it found is shell syntax or literal text inside a
    // quoted string, so a forged opener let a real command be swallowed as
    // heredoc DATA and dropped — the whole thing came back read-only
    // (measured before the fix: "true").

    it('POSITIVE: should classify a forged heredoc delimiter as a write', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'echo "a << EOF"\nrm -rf x\nEOF' })
      );
      expect(lastEntry().readonly).toBe('false');
    });

    it('NEGATIVE: should keep a genuine heredoc read-only after the forgery guard', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: "cat <<'EOF'\nhello\nEOF" }));
      expect(lastEntry().readonly).toBe('true');
    });

    it('NEGATIVE: should keep a heredoc opened after BALANCED quotes read-only', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'echo "hi" && cat <<\'EOF\'\nx\nEOF' })
      );
      expect(lastEntry().readonly).toBe('true');
    });

    it('should conservatively classify a quoted "<<" on a MULTI-line command as a write', async () => {
      // Same root cause as the forgery above: the quote count before the "<<"
      // is odd, so the command is unparseable here and falls back to write.
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'echo "a << b"\nls' }));
      expect(lastEntry().readonly).toBe('false');
    });

    it('should not let the forgery guard disturb a herestring', async () => {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'grep x <<< foo' }));
      expect(lastEntry().readonly).toBe('true');
    });

    // --- M-6: `jq | head -c 200` let jq die of SIGPIPE once the output
    // exceeded the pipe buffer; with `set -o pipefail` that killed the hook
    // BEFORE the history append, so the entry the hook exists to write was
    // silently lost (measured: 300 KB => exit 141, 0 history lines).

    it('should record a history entry for a 300 KB tool output without dying', async () => {
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'ls big', output: 'X'.repeat(300000) })
      );
      expect(result.exitCode).toBe(0);
      const raw = await readFile(historyFilePath(), 'utf-8');
      expect(raw.trim().split('\n').length).toBe(1);
      expect(lastEntry().preview.length).toBe(200);
    }, 30000);

    it('should keep the 200-byte preview cap for a below-buffer output (unchanged)', async () => {
      const result = await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'ls small', output: 'Y'.repeat(70000) })
      );
      expect(result.exitCode).toBe(0);
      expect(lastEntry().preview).toBe('Y'.repeat(200));
    }, 30000);

    it('should append every entry when large and small outputs are interleaved', async () => {
      await runStuckDetector(
        makeInput({ tool_name: 'Bash', command: 'ls a', output: 'A'.repeat(300000) })
      );
      await runStuckDetector(makeInput({ tool_name: 'Bash', command: 'ls b', output: 'B' }));
      const raw = await readFile(historyFilePath(), 'utf-8');
      expect(raw.trim().split('\n').length).toBe(2);
      expect(lastEntry().preview).toBe('B');
    }, 30000);
  });

  // -----------------------------------------------------------------
  // Execution-environment prefixes, ">&N", and prefix verbs (#1647 L-1/L-2/L-5)
  // -----------------------------------------------------------------

  describe('assignment prefixes, fd redirection and prefix verbs (#1647)', () => {
    /** Ground-truth read of the classifier verdict recorded for the LAST call. */
    function lastEntry(): Record<string, string> {
      const raw = require('node:fs').readFileSync(historyFilePath(), 'utf-8') as string;
      const lines = raw.trim().split('\n');
      return JSON.parse(lines[lines.length - 1]);
    }

    async function readonlyOf(command: string): Promise<string> {
      await runStuckDetector(makeInput({ tool_name: 'Bash', command }));
      return lastEntry().readonly;
    }

    // --- L-1: "VAR=value cmd" deferred to cmd unconditionally, so a variable
    // that changes WHICH program runs (PATH) or how it loads (LD_PRELOAD) was
    // classified by the innocent-looking trailing verb.

    it('NEGATIVE: should keep an ordinary assignment prefix deferring to the trailing command', async () => {
      expect(await readonlyOf('FOO=1 ls')).toBe('true');
      expect(await readonlyOf('FOO=bar git status')).toBe('true');
    });

    it('NEGATIVE: should keep a bare ordinary assignment read-only', async () => {
      expect(await readonlyOf('FOO=1')).toBe('true');
    });

    it('POSITIVE: should classify an LD_/DYLD_ preload prefix as a write', async () => {
      expect(await readonlyOf('LD_PRELOAD=./evil.so ls')).toBe('false');
      expect(await readonlyOf('DYLD_INSERT_LIBRARIES=./evil.dylib ls')).toBe('false');
    });

    it('POSITIVE: should classify a PATH prefix as a write', async () => {
      expect(await readonlyOf('PATH=/tmp ls')).toBe('false');
    });

    it('POSITIVE: should classify BASH_ENV / IFS / PROMPT_COMMAND prefixes as writes', async () => {
      expect(await readonlyOf('BASH_ENV=/tmp/x ls')).toBe('false');
      expect(await readonlyOf('IFS=, ls')).toBe('false');
      expect(await readonlyOf('PROMPT_COMMAND=x ls')).toBe('false');
    });

    it('POSITIVE: should classify GIT_DIR / GIT_WORK_TREE prefixes as writes', async () => {
      expect(await readonlyOf('GIT_DIR=/other/.git git status')).toBe('false');
      expect(await readonlyOf('GIT_WORK_TREE=/other git status')).toBe('false');
    });

    // The three enumerated GIT_ names were replaced by the glob "GIT_*": git
    // has many more variables that run an arbitrary program or relocate the
    // repository, and naming them one at a time kept losing that race.

    it('POSITIVE: should classify GIT_* program-substituting prefixes as writes', async () => {
      expect(await readonlyOf('GIT_EXTERNAL_DIFF=./evil git diff')).toBe('false');
      expect(await readonlyOf('GIT_PAGER=./evil git log')).toBe('false');
      expect(await readonlyOf('GIT_INDEX_FILE=/tmp/idx git status')).toBe('false');
    });

    it('POSITIVE: should classify GLOBIGNORE / BASH_XTRACEFD prefixes as writes', async () => {
      expect(await readonlyOf('GLOBIGNORE=x ls')).toBe('false');
      expect(await readonlyOf('BASH_XTRACEFD=3 ls')).toBe('false');
    });

    it('NEGATIVE: should not let "GIT_*" swallow an unrelated name', async () => {
      expect(await readonlyOf('GITFOO=1 ls')).toBe('true');
    });

    it('POSITIVE: should classify a BARE environment-altering assignment as a write', async () => {
      expect(await readonlyOf('PATH=/tmp')).toBe('false');
    });

    // --- L-2: every ">&N" was stripped, so "cat x >&3" lost its redirection
    // before the ">" write check and came back read-only.

    it('NEGATIVE: should keep ">&1" / ">&2" redirections read-only', async () => {
      expect(await readonlyOf('git status 2>&1')).toBe('true');
      expect(await readonlyOf('ls >&1')).toBe('true');
      expect(await readonlyOf('ls 1>&2')).toBe('true');
    });

    it('NEGATIVE: should keep "/dev/null" redirections read-only', async () => {
      expect(await readonlyOf('ls >/dev/null')).toBe('true');
      expect(await readonlyOf('ls 2>/dev/null')).toBe('true');
      expect(await readonlyOf('ls &>/dev/null')).toBe('true');
    });

    it('POSITIVE: should classify a redirection to an arbitrary fd as a write', async () => {
      expect(await readonlyOf('cat x >&3')).toBe('false');
      expect(await readonlyOf('cat x 2>&5')).toBe('false');
    });

    it('POSITIVE: should not read ">&10" as ">&1" plus a stray digit', async () => {
      expect(await readonlyOf('cat x >&10')).toBe('false');
    });

    // --- L-5: "command" sat in the read-only whitelist, so "command rm -rf x"
    // was read-only; find's writing actions were only partially matched
    // ("-fprintf" but not "-fprint"/"-fls"/"-ok").

    it('NEGATIVE: should keep "command -v" / "command -V" lookups read-only', async () => {
      expect(await readonlyOf('command -v jq')).toBe('true');
      expect(await readonlyOf('command -V jq')).toBe('true');
    });

    it('POSITIVE: should classify "command <program>" as a write', async () => {
      expect(await readonlyOf('command rm -rf x')).toBe('false');
      expect(await readonlyOf('command ls')).toBe('false');
    });

    it('POSITIVE: should classify "builtin" / "exec" prefixes as writes', async () => {
      expect(await readonlyOf('builtin cd /tmp')).toBe('false');
      expect(await readonlyOf('exec rm -rf x')).toBe('false');
    });

    it('NEGATIVE: should keep a plain find query read-only', async () => {
      expect(await readonlyOf('find . -name x')).toBe('true');
      expect(await readonlyOf('find . -type f -maxdepth 2')).toBe('true');
    });

    it('POSITIVE: should classify find -delete / -exec / -execdir as writes', async () => {
      expect(await readonlyOf('find . -delete')).toBe('false');
      expect(await readonlyOf('find . -exec rm {} +')).toBe('false');
      expect(await readonlyOf('find . -execdir rm {} +')).toBe('false');
    });

    it('POSITIVE: should classify find -fprint / -fprint0 / -fprintf as writes', async () => {
      expect(await readonlyOf('find . -fprint out')).toBe('false');
      expect(await readonlyOf('find . -fprint0 out')).toBe('false');
      expect(await readonlyOf('find . -fprintf out %p')).toBe('false');
    });

    it('POSITIVE: should classify find -fls as a write', async () => {
      expect(await readonlyOf('find . -fls out')).toBe('false');
    });

    it('POSITIVE: should classify find -ok / -okdir as writes', async () => {
      expect(await readonlyOf('find . -ok rm')).toBe('false');
      expect(await readonlyOf('find . -okdir rm')).toBe('false');
    });
  });
});

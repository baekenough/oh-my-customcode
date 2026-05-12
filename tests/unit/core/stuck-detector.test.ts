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
  is_error?: boolean;
  output?: string;
}): string {
  return JSON.stringify({
    tool_name: opts.tool_name,
    tool_input: {
      ...(opts.file_path !== undefined ? { file_path: opts.file_path } : {}),
      ...(opts.command !== undefined ? { command: opts.command } : {}),
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
});

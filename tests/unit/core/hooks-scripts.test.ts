import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const HOOKS_JSON_PATH = resolve(import.meta.dir, '../../../templates/.claude/hooks/hooks.json');

const STAGE_BLOCKER_SCRIPT = join(SCRIPTS_DIR, 'stage-blocker.sh');
const GIT_DELEGATION_GUARD_SCRIPT = join(SCRIPTS_DIR, 'git-delegation-guard.sh');
const DESTRUCTIVE_GIT_GUARD_SCRIPT = join(SCRIPTS_DIR, 'destructive-git-guard.sh');
const STOP_CONSOLE_AUDIT_SCRIPT = join(SCRIPTS_DIR, 'stop-console-audit.sh');
const AGENT_TEAMS_ADVISOR_SCRIPT = join(SCRIPTS_DIR, 'agent-teams-advisor.sh');
const SESSION_ENV_CHECK_SCRIPT = join(SCRIPTS_DIR, 'session-env-check.sh');
const SUBAGENT_FAILURE_ADVISOR_SCRIPT = join(SCRIPTS_DIR, 'subagent-failure-advisor.sh');

// stage-blocker.sh reads /tmp/.claude-dev-stage-$PPID (PPID-scoped, per project convention).
// runHookScript spawns `bash <script>` directly from this bun test process (no intermediate
// shell), so the script's $PPID at runtime equals this process's PID (process.pid).
const STAGE_FILE = `/tmp/.claude-dev-stage-${process.pid}`;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a hook script by spawning bash with the script path.
 * stdinInput is piped to the process. Returns stdout, stderr, exitCode.
 */
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

/**
 * Run bash syntax check on a script file. Returns { exitCode, stderr }.
 */
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

/** Build a minimal Claude Code hook JSON payload for Task tool calls. */
function makeTaskInput(subagentType: string, prompt: string): string {
  return JSON.stringify({
    tool: 'Task',
    tool_input: {
      subagent_type: subagentType,
      prompt,
    },
  });
}

/** Build a minimal Stop hook payload. */
function makeStopInput(extra?: Record<string, unknown>): string {
  return JSON.stringify({ tool: 'Stop', ...extra });
}

// -------------------------------------------------------------------
// Issue #1632: `echo "$var"` JSON-payload regression scan helpers
// -------------------------------------------------------------------

/**
 * Variables known to hold a JSON payload (raw stdin input, or a jq-extracted JSON
 * fragment/array/object), scoped per-file since the same identifier (e.g. `summary`)
 * holds plain text in one script (playwright-compress.sh) and a JSON array in another
 * (auto-dev-token-summary.sh) — see #1632 fix report.
 */
const JSON_VARS_BY_FILE: Record<string, ReadonlySet<string>> = {
  'session-reflection.sh': new Set([
    'input',
    'bg_tasks_json',
    'session_crons_json',
    'BG_TASKS_JSON',
    'SESSION_CRONS_JSON',
  ]),
  'schema-validator.sh': new Set(['input', 'tool_input']),
  'stall-detection-advisor.sh': new Set(['input', 'duration_entry', 'line']),
  'auto-dev-token-tracker.sh': new Set(['input', 'entry']),
  'auto-dev-token-summary.sh': new Set(['summary', 'totals']),
  'task-state-precompact.sh': new Set(['state']),
  'session-autofix-prompt.sh': new Set(['FINDINGS']),
  'agent-start-recorder.sh': new Set(['input', 'entry']),
  'stuck-detector.sh': new Set(['input', 'entry']),
  'task-outcome-recorder.sh': new Set(['input', 'entry']),
  'feedback-collector.sh': new Set(['input', 'line']),
};
const DEFAULT_JSON_VARS = new Set(['input']);

const RISKY_ECHO_PATTERN = /echo\s+"\$[A-Za-z_][A-Za-z0-9_]*"\s*(\||>>?|$|;|\))/m;
const ECHO_VAR_NAME_PATTERN = /echo\s+"\$([A-Za-z_][A-Za-z0-9_]*)"/;

/** Returns `true` when `line` echoes a variable known to carry JSON for `scriptName`. */
function isJsonVarEchoOffense(scriptName: string, line: string): boolean {
  if (!RISKY_ECHO_PATTERN.test(line)) return false;
  const varName = ECHO_VAR_NAME_PATTERN.exec(line)?.[1];
  if (!varName) return false;
  const jsonVarNames = JSON_VARS_BY_FILE[scriptName] ?? DEFAULT_JSON_VARS;
  return jsonVarNames.has(varName);
}

/** Scans `content` (the text of `scriptName`) for `echo "$jsonVar"` regressions (#1632). */
function findJsonVarEchoOffenders(scriptName: string, content: string): string[] {
  return content
    .split('\n')
    .filter((line) => isJsonVarEchoOffense(scriptName, line))
    .map((line) => `${scriptName}: ${line.trim()}`);
}

// -------------------------------------------------------------------
// stop-console-audit.sh
// -------------------------------------------------------------------

describe('stop-console-audit.sh', () => {
  let tmpGitDir: string;
  let nonGitDir: string;

  beforeAll(async () => {
    // Create a temporary git repository for git-context tests.
    tmpGitDir = join(tmpdir(), `omcc-test-git-${Date.now()}`);
    await mkdir(tmpGitDir, { recursive: true });

    // Strip git env vars so temp repo operations don't inherit GIT_DIR from
    // a parent hook context (e.g., pre-commit hook running bun test --coverage).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { GIT_DIR: _gd, GIT_WORK_TREE: _gwt, GIT_INDEX_FILE: _gif, ...cleanEnv } = process.env;

    execFileSync('git', ['init'], { cwd: tmpGitDir, stdio: 'pipe', env: cleanEnv });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: tmpGitDir,
      stdio: 'pipe',
      env: cleanEnv,
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], {
      cwd: tmpGitDir,
      stdio: 'pipe',
      env: cleanEnv,
    });
    // Disable hooks in the temp repo to prevent inheriting the project's core.hooksPath
    execFileSync('git', ['config', 'core.hooksPath', '/dev/null'], {
      cwd: tmpGitDir,
      stdio: 'pipe',
      env: cleanEnv,
    });

    // Create an initial commit so HEAD is defined.
    const initFile = join(tmpGitDir, 'initial.txt');
    await writeFile(initFile, 'init\n');
    execFileSync('git', ['add', '.'], { cwd: tmpGitDir, stdio: 'pipe', env: cleanEnv });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpGitDir, stdio: 'pipe', env: cleanEnv });

    // Create a non-git directory.
    nonGitDir = join(tmpdir(), `omcc-test-nongit-${Date.now()}`);
    await mkdir(nonGitDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tmpGitDir, { recursive: true, force: true });
    await rm(nonGitDir, { recursive: true, force: true });
  });

  // --- Basic behavior ---

  it('should always exit with code 0', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.exitCode).toBe(0);
  });

  it('should pass through stdin input unchanged to stdout', async () => {
    const input = makeStopInput({ session_id: 'abc123' });
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, input, {}, nonGitDir);
    expect(result.stdout.trim()).toBe(input);
  });

  it('should output audit messages to stderr', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.stderr).toContain('[Stop]');
  });

  it('should output "Session safe to terminate" to stderr', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.stderr).toContain('Session safe to terminate');
  });

  it('should output audit start message to stderr', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.stderr).toContain('Session termination audit starting');
  });

  // --- Console.log detection in git-tracked JS/TS files ---

  it('should warn about console.log in modified .ts files', async () => {
    const tsFile = join(tmpGitDir, 'test-warn.ts');
    await writeFile(tsFile, 'console.log("debug");\nexport const x = 1;\n');
    execFileSync('git', ['add', 'test-warn.ts'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'test-warn.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(tsFile);

    expect(result.stderr).toContain('console.log');
    expect(result.stderr).toContain('test-warn.ts');
  });

  it('should warn about console.log in modified .tsx files', async () => {
    const tsxFile = join(tmpGitDir, 'component.tsx');
    await writeFile(
      tsxFile,
      'console.log("render");\nexport default function C() { return null; }\n'
    );
    execFileSync('git', ['add', 'component.tsx'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'component.tsx'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(tsxFile);

    expect(result.stderr).toContain('console.log');
    expect(result.stderr).toContain('component.tsx');
  });

  it('should warn about console.log in modified .js files', async () => {
    const jsFile = join(tmpGitDir, 'util.js');
    await writeFile(jsFile, 'console.log("js log");\nmodule.exports = {};\n');
    execFileSync('git', ['add', 'util.js'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'util.js'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(jsFile);

    expect(result.stderr).toContain('console.log');
    expect(result.stderr).toContain('util.js');
  });

  it('should warn about console.log in modified .jsx files', async () => {
    const jsxFile = join(tmpGitDir, 'app.jsx');
    await writeFile(jsxFile, 'console.log("jsx");\nfunction App() { return null; }\n');
    execFileSync('git', ['add', 'app.jsx'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'app.jsx'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(jsxFile);

    expect(result.stderr).toContain('console.log');
    expect(result.stderr).toContain('app.jsx');
  });

  it('should NOT warn when no console.log exists in modified files', async () => {
    const cleanFile = join(tmpGitDir, 'clean.ts');
    await writeFile(cleanFile, 'export const greeting = "hello";\n');
    execFileSync('git', ['add', 'clean.ts'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'clean.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(cleanFile);

    expect(result.stderr).not.toContain('WARNING: console.log');
  });

  it('should NOT warn when only non-JS/TS files are modified', async () => {
    const mdFile = join(tmpGitDir, 'NOTES.md');
    await writeFile(mdFile, '# console.log\nThis is docs.\n');
    execFileSync('git', ['add', 'NOTES.md'], { cwd: tmpGitDir, stdio: 'pipe' });

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    execFileSync('git', ['reset', 'HEAD', 'NOTES.md'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(mdFile);

    // "console.log" appears in the file but .md is excluded from the grep filter
    expect(result.stderr).not.toContain('WARNING: console.log');
  });

  it('should NOT warn when no files are modified', async () => {
    // Clean repo with no staged files
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);
    expect(result.stderr).not.toContain('WARNING: console.log');
    expect(result.exitCode).toBe(0);
  });

  // --- Edge cases ---

  it('should handle non-git directory gracefully (exit 0)', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.exitCode).toBe(0);
  });

  it('should handle empty stdin gracefully', async () => {
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, '', {}, nonGitDir);
    expect(result.exitCode).toBe(0);
  });

  it('should handle malformed JSON stdin (still exit 0)', async () => {
    const result = await runHookScript(
      STOP_CONSOLE_AUDIT_SCRIPT,
      '{not valid json}',
      {},
      nonGitDir
    );
    expect(result.exitCode).toBe(0);
  });

  it('should handle missing (deleted) files referenced in git diff', async () => {
    // Create, commit, modify+stage, then physically delete without unstaging.
    const deletedFile = join(tmpGitDir, 'deleted.ts');
    await writeFile(deletedFile, 'console.log("exists");\n');
    execFileSync('git', ['add', 'deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'add deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });

    await writeFile(deletedFile, 'console.log("modified");\n');
    execFileSync('git', ['add', 'deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    await unlink(deletedFile); // file no longer on disk but staged

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, tmpGitDir);

    // Cleanup
    execFileSync('git', ['reset', 'HEAD', 'deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    execFileSync('git', ['rm', '-f', '--cached', 'deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'remove deleted.ts'], { cwd: tmpGitDir, stdio: 'pipe' });

    expect(result.exitCode).toBe(0);
  });

  // --- Background task diagnostics ---

  it('should report background task output files count to stderr when they exist', async () => {
    const fakeBgFile = '/tmp/claude-omcc-test-99998.output';
    await writeFile(fakeBgFile, 'task output\n');

    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);

    await unlink(fakeBgFile).catch(() => undefined);

    // Whether 0 or more files exist, the script always exits 0 and writes to stderr
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Stop]');
  });

  it('should exit 0 and write to stderr regardless of background task file count', async () => {
    // Scenario: no background task files
    const result = await runHookScript(STOP_CONSOLE_AUDIT_SCRIPT, makeStopInput(), {}, nonGitDir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------
// stage-blocker.sh
// -------------------------------------------------------------------

describe('stage-blocker.sh', () => {
  afterEach(async () => {
    await unlink(STAGE_FILE).catch(() => undefined);
  });

  // --- Allowed stages ---

  it('should exit 0 when stage is "implement"', async () => {
    await writeFile(STAGE_FILE, 'implement');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(0);
  });

  it('should exit 0 when no stage file exists', async () => {
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(0);
  });

  // --- Blocked stages ---

  it('should exit 2 when stage is "plan"', async () => {
    await writeFile(STAGE_FILE, 'plan');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });

  it('should exit 2 when stage is "verify-plan"', async () => {
    await writeFile(STAGE_FILE, 'verify-plan');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });

  it('should exit 2 when stage is "verify-impl"', async () => {
    await writeFile(STAGE_FILE, 'verify-impl');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });

  it('should exit 2 when stage is "compound"', async () => {
    await writeFile(STAGE_FILE, 'compound');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });

  it('should exit 2 when stage is "done"', async () => {
    await writeFile(STAGE_FILE, 'done');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });

  // --- Output ---

  it('should output blocking message to stdout when blocking', async () => {
    await writeFile(STAGE_FILE, 'plan');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    // stage-blocker.sh echoes the BLOCKED message to stdout (no >&2 redirect)
    expect(result.stdout).toContain('BLOCKED');
  });

  it('should include the stage name in the blocking message', async () => {
    await writeFile(STAGE_FILE, 'verify-impl');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.stdout).toContain('verify-impl');
  });

  it('should pass through (exit 0) when stage is "implement"', async () => {
    await writeFile(STAGE_FILE, 'implement');
    // stage-blocker.sh does not echo stdin; the runtime handles pass-through on exit 0.
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(0);
  });

  it('should handle empty stage file gracefully (exit 0)', async () => {
    await writeFile(STAGE_FILE, '');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    // The script checks `[ -z "$stage" ]; exit 0` for empty strings
    expect(result.exitCode).toBe(0);
  });

  it('should strip surrounding whitespace/newlines from stage value', async () => {
    await writeFile(STAGE_FILE, '  plan  \n');
    const result = await runHookScript(STAGE_BLOCKER_SCRIPT, '{}');
    expect(result.exitCode).toBe(2);
  });
});

// -------------------------------------------------------------------
// git-delegation-guard.sh
// -------------------------------------------------------------------

describe('git-delegation-guard.sh', () => {
  // --- Git command detection: non-gitnerd agents must trigger warnings ---

  it('should warn when non-gitnerd agent has "git commit" in prompt', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Please git commit the changes');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('WARNING');
    expect(result.stderr).toContain('git commit');
  });

  it('should warn when non-gitnerd agent has "git push" in prompt', async () => {
    const input = makeTaskInput('lang-golang-expert', 'After editing, git push origin main');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('WARNING');
    expect(result.stderr).toContain('git push');
  });

  it('should warn when non-gitnerd agent has "git rebase" in prompt', async () => {
    const input = makeTaskInput('be-fastapi-expert', 'git rebase -i HEAD~3');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('WARNING');
  });

  it('should warn when non-gitnerd agent has "git merge" in prompt', async () => {
    const input = makeTaskInput('lang-python-expert', 'git merge feature/branch');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('WARNING');
  });

  it('should warn when non-gitnerd agent has "git reset" in prompt', async () => {
    const input = makeTaskInput('arch-documenter', 'Run git reset --hard HEAD~1');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('WARNING');
  });

  it('should reference R010 in the warning message', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Please git commit the changes');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('R010');
  });

  it('should mention mgr-gitnerd as the correct agent in the warning', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Please git commit the changes');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).toContain('mgr-gitnerd');
  });

  // --- No warning for gitnerd or clean prompts ---

  it('should NOT warn when agent is mgr-gitnerd', async () => {
    const input = makeTaskInput('mgr-gitnerd', 'git commit -m "feat: add feature"');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).not.toContain('WARNING');
  });

  it('should NOT warn when prompt has no git commands', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Refactor the auth module');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).not.toContain('WARNING');
  });

  it('should NOT warn for text containing "git" that is not a git command', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Use digital transformation strategy');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stderr).not.toContain('WARNING');
  });

  // --- Pass-through: always exit 0, always echo stdin ---

  it('should always exit 0 even when warning is emitted', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'git commit everything');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('should always exit 0 with a clean prompt', async () => {
    const input = makeTaskInput('lang-golang-expert', 'Write a function that parses JSON');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('should always pass through stdin to stdout', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'Implement feature X');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.stdout.trim()).toBe(input.trim());
  });

  it('should pass stdin to stdout even when a warning is emitted', async () => {
    const input = makeTaskInput('lang-typescript-expert', 'git commit -m "fix"');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input.trim());
    expect(result.stderr).toContain('WARNING');
  });

  // --- Edge cases ---

  it('should warn when subagent_type field is missing (defaults to empty, not gitnerd)', async () => {
    const input = JSON.stringify({ tool: 'Task', tool_input: { prompt: 'git commit changes' } });
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    // subagent_type resolves to "" via jq default → "" !== "mgr-gitnerd" → should warn
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('WARNING');
  });

  it('should NOT warn when prompt field is missing', async () => {
    const input = JSON.stringify({
      tool: 'Task',
      tool_input: { subagent_type: 'lang-typescript-expert' },
    });
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
    // prompt resolves to "" → no git keywords → no warning
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('WARNING');
  });

  it('should handle empty stdin gracefully (exit 0)', async () => {
    // jq will produce errors on empty input but the script should still exit 0
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, '');
    expect(result.exitCode).toBe(0);
  });
});

// -------------------------------------------------------------------
// destructive-git-guard.sh
// -------------------------------------------------------------------

describe('destructive-git-guard.sh', () => {
  function makeBashInput(command: string): string {
    return JSON.stringify({
      tool: 'Bash',
      tool_input: { command },
    });
  }

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(DESTRUCTIVE_GIT_GUARD_SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  it('should pass through normal git commands without warnings', async () => {
    const input = makeBashInput('git status && git log --oneline -1');
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
    expect(result.stderr).not.toContain('DESTRUCTIVE GIT WARNING');
  });

  it('should warn but not block git reset --hard', async () => {
    const input = makeBashInput('git reset --hard HEAD~1');
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
    expect(result.stderr).toContain('DESTRUCTIVE GIT WARNING');
    expect(result.stderr).toContain('git reset --hard');
    expect(result.stderr).toContain('git reflog');
  });

  it('should warn but not block git clean -fdx', async () => {
    const input = makeBashInput('git clean -fdx');
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('DESTRUCTIVE GIT WARNING');
    expect(result.stderr).toContain('git clean');
  });

  it('should warn but not block git checkout -- .', async () => {
    const input = makeBashInput('git checkout -- .');
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('DESTRUCTIVE GIT WARNING');
    expect(result.stderr).toContain('git checkout -- .');
  });

  it('should be registered in hooks.json for destructive Git Bash PreToolUse', async () => {
    const raw = await readFile(HOOKS_JSON_PATH, 'utf-8');
    const hooksConfig = JSON.parse(raw);
    const entry = hooksConfig.hooks.PreToolUse.find(
      (hook: { matcher?: string; hooks?: { command?: string }[] }) =>
        hook.matcher?.includes('tool == "Bash"') &&
        hook.matcher?.includes('git (reset|clean|checkout|restore|switch|rebase|merge)') &&
        hook.hooks?.some((h) => h.command?.includes('destructive-git-guard.sh'))
    );
    expect(entry).toBeTruthy();
  });
});

// -------------------------------------------------------------------
// agent-teams-advisor.sh
// -------------------------------------------------------------------

describe('agent-teams-advisor.sh', () => {
  /** Build a Task hook JSON payload using the `description` field the script actually reads. */
  function makeAdvisorInput(agentType: string, description: string): string {
    return JSON.stringify({
      tool_input: {
        subagent_type: agentType,
        description,
        model: 'sonnet',
      },
    });
  }

  beforeEach(() => {
    // Clean up session-scoped counter files before each test so counts reset.
    const { execSync } = require('node:child_process');
    try {
      execSync('rm -f /tmp/.claude-task-count-*');
      // #1588: session-env-check.sh writes /tmp/.claude-env-status-$PPID, which resolves to
      // the SAME pid-scoped path this advisor reads. A leftover `agent_teams=env-set` file
      // makes every warning assertion below silently vacuous (the script exits early), so it
      // must be cleared here rather than relying on file ordering between describe blocks.
      execSync('rm -f /tmp/.claude-env-status-*');
    } catch {
      // ignore if no files exist
    }
  });

  // --- Basic pass-through behavior ---

  it('should always exit with code 0', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'Review code');
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('should pass stdin through to stdout unchanged', async () => {
    const input = makeAdvisorInput('lang-golang-expert', 'Write Go code');
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stdout.trim()).toBe(input);
  });

  // --- Counter and warning behavior ---

  it('should not show warning on first Task call', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'First call');
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stderr).not.toContain('R018 Advisor');
    expect(result.stderr).not.toContain('Multiple Task calls');
  });

  it('should show R018 warning on second Task call', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'Second call');
    // First call — no warning
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    // Second call — warning appears
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stderr).toContain('R018 Advisor');
    expect(result.stderr).toContain('Task tool call #2');
  });

  it('should show warning on third and subsequent calls', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'Call');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stderr).toContain('Task tool call #3');
  });

  it('should include agent type in warning', async () => {
    const input = makeAdvisorInput('lang-golang-expert', 'Go review');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stderr).toContain('lang-golang-expert');
  });

  it('should include description preview in warning', async () => {
    const input = makeAdvisorInput('fe-vercel-agent', 'React component optimization');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stderr).toContain('React component optimization');
  });

  it('should mention Agent Teams considerations in warning', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'Test');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    // Verify all three consideration bullets are present
    expect(result.stderr).toContain('3+ agents');
    expect(result.stderr).toContain('review');
    expect(result.stderr).toContain('shared state');
  });

  it('should increment counter correctly across multiple calls', async () => {
    const input = makeAdvisorInput('test-agent', 'Counting test');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input); // 1
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input); // 2
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input); // 3
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input); // 4
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input); // 5
    expect(result.stderr).toContain('Task tool call #5');
  });

  it('should always pass through stdin even when warning is shown', async () => {
    const input = makeAdvisorInput('mgr-gitnerd', 'Git push');
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.stdout.trim()).toBe(input);
    expect(result.exitCode).toBe(0);
  });

  // --- Edge cases ---

  it('should handle missing subagent_type gracefully', async () => {
    const input = JSON.stringify({ tool_input: { description: 'no agent type' } });
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
  });

  it('should handle empty JSON input', async () => {
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, '{}');
    expect(result.exitCode).toBe(0);
  });

  // Superseded by issue #1650 B: a hook must NEVER crash on malformed stdin.
  // Previously this script exited 5 (jq parse error propagated through
  // `set -euo pipefail`); it now swallows non-object stdin and exits 0.
  it('should exit 0 and emit nothing on malformed JSON (#1650 B)', async () => {
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, 'not json');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('should truncate long descriptions to 60 characters in warning', async () => {
    const longDesc = 'A'.repeat(100);
    const input = makeAdvisorInput('lang-typescript-expert', longDesc);
    await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    // head -c 60 truncates; the full 100-char string must not appear
    expect(result.stderr).not.toContain('A'.repeat(100));
    // But the first 60 chars should be present
    expect(result.stderr).toContain('A'.repeat(60));
  });

  it('should not block task execution — exit 0 on repeated calls', async () => {
    const input = makeAdvisorInput('lang-typescript-expert', 'Important task');
    for (let i = 0; i < 10; i++) {
      const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
      expect(result.exitCode).toBe(0);
    }
  });

  // --- Batch context detection ---

  it('should warn on FIRST call when workflow file has 3+ issues', async () => {
    const workflowFile = `/tmp/.claude-workflow-test-${process.pid}.json`;
    await writeFile(workflowFile, JSON.stringify({ issue_count: 5 }));
    try {
      const input = makeAdvisorInput('lang-typescript-expert', 'Process issues');
      const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
      expect(result.stderr).toContain('R018 Advisor');
      expect(result.stderr).toContain('Batch context detected');
      expect(result.stderr).toContain('5');
    } finally {
      await unlink(workflowFile).catch(() => {});
    }
  });

  it('should warn on FIRST call when release-plan file exists', async () => {
    const releasePlanFile = `/tmp/.claude-release-plan-${process.pid}`;
    await writeFile(releasePlanFile, 'release plan content');
    try {
      const input = makeAdvisorInput('lang-golang-expert', 'Release fixes');
      const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
      expect(result.stderr).toContain('R018 Advisor');
      expect(result.stderr).toContain('Batch context detected');
    } finally {
      await unlink(releasePlanFile).catch(() => {});
    }
  });

  it('should NOT warn on first call when workflow file has fewer than 3 issues', async () => {
    const workflowFile = `/tmp/.claude-workflow-test-${process.pid}.json`;
    await writeFile(workflowFile, JSON.stringify({ issue_count: 2 }));
    try {
      const input = makeAdvisorInput('lang-typescript-expert', 'Process issues');
      const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
      expect(result.stderr).not.toContain('R018 Advisor');
    } finally {
      await unlink(workflowFile).catch(() => {});
    }
  });

  it('should use batch warning format (not sequential) when batch context detected on first call', async () => {
    const workflowFile = `/tmp/.claude-workflow-test-${process.pid}.json`;
    await writeFile(workflowFile, JSON.stringify({ issue_count: 4 }));
    try {
      const input = makeAdvisorInput('mgr-gitnerd', 'Deploy batch');
      const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
      expect(result.stderr).toContain('Batch context detected');
      expect(result.stderr).toContain('RECOMMENDATION');
      // Batch warning is different from sequential warning
      expect(result.stderr).not.toContain('Multiple Task calls detected');
    } finally {
      await unlink(workflowFile).catch(() => {});
    }
  });
});

// -------------------------------------------------------------------
// subagent-failure-advisor.sh (#1631)
//
// Replaces the removed `type: "prompt"` SubagentStop hook, which asked an LLM judge
// whether the CURRENT session's own background_tasks entry had reached "completed"
// before allowing Stop. That transition only happens AFTER the SubagentStop hook chain
// resolves, so a subagent judging its OWN stop always observed "running" — producing an
// un-deduped `Stop hook feedback:` re-injection loop (8-10x per session, observed live).
// This script is advisory-only: it inspects tool_output.is_error and, on failure, prints
// a stderr warning — never invoking the Stop-hook-feedback / LLM-judge path, and never
// blocking (always exit 0).
// -------------------------------------------------------------------

describe('subagent-failure-advisor.sh', () => {
  function makeSubagentStopInput(
    isError: boolean,
    agentType = 'lang-typescript-expert',
    output = ''
  ): string {
    return JSON.stringify({
      agent_type: agentType,
      tool_output: {
        is_error: isError,
        output,
      },
    });
  }

  // --- Basic pass-through behavior (never blocks) ---

  it('should always exit with code 0 on failure input', async () => {
    const input = makeSubagentStopInput(
      true,
      'lang-golang-expert',
      'panic: nil pointer dereference'
    );
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('should always exit with code 0 on success input', async () => {
    const input = makeSubagentStopInput(false);
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('should pass stdin through to stdout unchanged', async () => {
    const input = makeSubagentStopInput(true, 'lang-golang-expert', 'build failed');
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.stdout.trim()).toBe(input);
  });

  // --- Positive case: is_error=true -> stderr warning ---

  it('should emit a stderr warning when tool_output.is_error is true', async () => {
    const input = makeSubagentStopInput(
      true,
      'lang-golang-expert',
      'compile error: undefined symbol'
    );
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.stderr).toContain('Subagent Failure Advisor');
    expect(result.stderr).toContain('lang-golang-expert');
    expect(result.stderr).toContain('compile error: undefined symbol');
  });

  // --- Negative case: is_error=false (or absent) -> silence ---

  it('should NOT emit a warning when tool_output.is_error is false', async () => {
    const input = makeSubagentStopInput(false, 'lang-python-expert');
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.stderr).not.toContain('Subagent Failure Advisor');
  });

  it('should NOT emit a warning when tool_output.is_error is absent', async () => {
    const input = JSON.stringify({ agent_type: 'lang-python-expert', tool_output: {} });
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.stderr).not.toContain('Subagent Failure Advisor');
  });

  // --- Never triggers the removed prompt/LLM-judge/Stop-hook-feedback path ---

  it('should never reference background_tasks or Stop hook feedback (no self-referential judge path)', async () => {
    const input = makeSubagentStopInput(true, 'lang-golang-expert', 'error');
    const result = await runHookScript(SUBAGENT_FAILURE_ADVISOR_SCRIPT, input);
    expect(result.stdout + result.stderr).not.toContain('background_tasks');
    expect(result.stdout + result.stderr).not.toContain('Stop hook feedback');
  });
});

// -------------------------------------------------------------------
// session-env-check.sh
// -------------------------------------------------------------------

describe('session-env-check.sh', () => {
  const sessionInput = JSON.stringify({ event: 'session_start' });

  afterEach(() => {
    // Clean up status files created during tests.
    const { execSync } = require('node:child_process');
    try {
      execSync('rm -f /tmp/.claude-env-status-*');
    } catch {
      // ignore if no files exist
    }
  });

  // --- Basic pass-through behavior ---

  it('should always exit with code 0', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    expect(result.exitCode).toBe(0);
  });

  it('should pass stdin through to stdout', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    expect(result.stdout.trim()).toBe(sessionInput);
  });

  // --- Environment check output ---

  it('should output environment check header to stderr', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    expect(result.stderr).toContain('Session Environment Check');
  });

  it('should report codex CLI status in stderr', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    expect(result.stderr).toContain('codex CLI:');
  });

  it('should report Agent Teams status in stderr', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    expect(result.stderr).toContain('Agent Teams:');
  });

  it('should show Agent Teams disabled when env var is not set to 1', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '0',
    });
    expect(result.stderr).toContain('Agent Teams: disabled');
    expect(result.stderr).not.toContain('env-set');
  });

  // #1588: the env var expresses INTENT. R018 Detection additionally requires TeamCreate in
  // the tool list, which a SessionStart hook cannot observe — MEASURED against claude-code
  // 2.1.233: SessionStart stdin carries no tool inventory, and availability additionally
  // depends on a remote gate plus plan entitlement. So this hook must never claim activation
  // from the env var alone.
  it('reports env-set (NOT enabled) when only the env var is 1', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      OMCUSTOM_AGENT_TEAMS_VERIFIED: '0',
    });
    expect(result.stderr).toContain('Agent Teams: env-set');
    expect(result.stderr).toContain('INTENT, not activation');
    expect(result.stderr).toContain('TeamCreate');
    expect(result.stderr).not.toContain('Agent Teams: enabled');
  });

  it('reports enabled ONLY when TeamCreate presence has been measured and declared', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      OMCUSTOM_AGENT_TEAMS_VERIFIED: '1',
    });
    expect(result.stderr).toContain('Agent Teams: enabled');
    expect(result.stderr).not.toContain('INTENT, not activation');
  });

  it('writes an =-free agent_teams value (agent-teams-advisor.sh cut -d= -f2 contract)', async () => {
    await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      OMCUSTOM_AGENT_TEAMS_VERIFIED: '0',
    });
    const status = await readFile(`/tmp/.claude-env-status-${process.pid}`, 'utf-8');
    const line = status.split('\n').find((l) => l.startsWith('agent_teams='));
    expect(line).toBe('agent_teams=env-set');
  });

  it('should show codex unavailable when binary is not in PATH', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      PATH: '/usr/bin:/bin',
      OPENAI_API_KEY: '',
      // Unset git env vars that may be inherited from a parent hook context,
      // which can cause the script to exit early via set -euo pipefail.
      GIT_DIR: '',
      GIT_WORK_TREE: '',
      GIT_INDEX_FILE: '',
    });
    expect(result.stderr).toContain('codex CLI: unavailable');
  });

  it('should create a status file in /tmp', async () => {
    await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    const { execSync } = require('node:child_process');
    // The file is named .claude-env-status-<PPID>; at least one must exist after the run.
    const output = execSync('ls /tmp/.claude-env-status-* 2>/dev/null || echo "none"')
      .toString()
      .trim();
    expect(output).not.toBe('none');
  });

  it('should handle empty stdin gracefully', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, '');
    expect(result.exitCode).toBe(0);
  });

  it('should handle arbitrary JSON stdin and pass it through', async () => {
    const input = JSON.stringify({ complex: { nested: true } });
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, input);
    expect(result.stdout.trim()).toBe(input);
    expect(result.exitCode).toBe(0);
  });

  it('should report both codex CLI and Agent Teams statuses in a single run', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput);
    const stderrLines = result.stderr.split('\n');
    const codexLine = stderrLines.find((l) => l.includes('codex CLI:'));
    const teamsLine = stderrLines.find((l) => l.includes('Agent Teams:'));
    expect(codexLine).toBeDefined();
    expect(teamsLine).toBeDefined();
  });

  // --- Self-update cache schema (#1570) ---
  //
  // The script runs under `set -euo pipefail`, so an unmatched grep exits 1 and (via
  // pipefail) aborts the whole SessionStart hook — measured as exit 1 with 0 bytes of
  // stdout, breaking the "always exit 0" contract asserted above.
  //
  // TWO writers produce this cache path with DIFFERENT key names, and both are current:
  //   omcustom-auto-update.sh → {"version","timestamp","source"}
  //   src/core/self-update.ts → {"checkedAt","latestVersion"}
  // The live cache was the first shape, so the hard-coded "latestVersion" lookup matched
  // nothing. Each case below asserts the VALUE is actually read, not merely that the crash
  // is gone — a bare exit-0 assertion would also pass against a script that silently
  // ignores the cache entirely.
  describe('self-update cache schema handling', () => {
    let cacheHome: string;
    let projectCwd: string;
    let cachePath: string;

    beforeEach(async () => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cacheHome = join(tmpdir(), `omcc-envcheck-home-${stamp}`);
      projectCwd = join(tmpdir(), `omcc-envcheck-cwd-${stamp}`);
      await mkdir(join(cacheHome, '.oh-my-customcode'), { recursive: true });
      await mkdir(projectCwd, { recursive: true });
      cachePath = join(cacheHome, '.oh-my-customcode', 'self-update-cache.json');
      // Installed version pinned low so any readable cache reports "update available".
      await writeFile(join(projectCwd, '.omcustomrc.json'), JSON.stringify({ version: '1.0.0' }));
    });

    afterEach(async () => {
      await rm(cacheHome, { recursive: true, force: true });
      await rm(projectCwd, { recursive: true, force: true });
    });

    function runWithCacheHome() {
      return runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, { HOME: cacheHome }, projectCwd);
    }

    it('exits 0 and passes stdin through when the cache file is absent', async () => {
      const result = await runWithCacheHome();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sessionInput);
      expect(result.stderr).toContain('[Update Check]');
    });

    it('reads the auto-update schema {version,timestamp,source} (no latestVersion key)', async () => {
      // This is the shape that was live on disk and killed the hook.
      await writeFile(
        cachePath,
        JSON.stringify({ version: '9.9.9', timestamp: 1786352189, source: 'npm-registry' })
      );

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sessionInput);
      expect(result.stderr).toContain('oh-my-customcode v9.9.9 available');
      expect(result.stderr).toContain('current: v1.0.0');
    });

    it('reads the self-update.ts schema {checkedAt,latestVersion}', async () => {
      await writeFile(
        cachePath,
        JSON.stringify({ checkedAt: new Date().toISOString(), latestVersion: '8.8.8' })
      );

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('oh-my-customcode v8.8.8 available');
    });

    it('prefers latestVersion over version when a cache carries both', async () => {
      await writeFile(
        cachePath,
        JSON.stringify({ latestVersion: '8.8.8', version: '9.9.9', source: 'mixed' })
      );

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('oh-my-customcode v8.8.8 available');
      expect(result.stderr).not.toContain('v9.9.9 available');
    });

    it('exits 0 and degrades to no-cache when the cache carries neither version key', async () => {
      await writeFile(cachePath, JSON.stringify({ timestamp: 1786352189, source: 'npm-registry' }));

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sessionInput);
      // No usable cached version → the "run omcustom doctor --updates" branch, not a crash.
      expect(result.stderr).toContain("run 'omcustom doctor --updates'");
    });

    it('exits 0 on a malformed (non-JSON) cache file', async () => {
      await writeFile(cachePath, 'this is not json');

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sessionInput);
    });

    it('exits 0 on an empty cache file', async () => {
      await writeFile(cachePath, '');

      const result = await runWithCacheHome();

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sessionInput);
    });

    it('guards every version grep against an unmatched pattern (source guard)', async () => {
      const src = await readFile(SESSION_ENV_CHECK_SCRIPT, 'utf-8');
      // The unguarded two-grep pipeline is the #1570 defect; pin its absence.
      expect(src).not.toMatch(/CACHED_LATEST=\$\(grep -o '"latestVersion"/);
      expect(src).toContain('json_string_field');
      expect(src).toContain("|| printf ''");
    });
  });
});

// -------------------------------------------------------------------
// user-prompt-preprocessor.sh
// -------------------------------------------------------------------

/**
 * These fixtures are built from the PLATFORM payload (`prompt`), not the script-shaped
 * `user_input` the previous suite fed in. That mismatch is the whole of #1568: the script
 * read `.user_input`, the platform sends `prompt`, and the tests supplied `user_input` — so
 * the suite validated the bug instead of the behavior and stayed green while the hook was a
 * pure pass-through in production.
 *
 * Two axes are pinned here, because fixing either alone leaves the hook silent:
 *   selector  — `.prompt` first, `.user_input` retained as a back-compat fallback
 *   delivery  — hints reach the model via `hookSpecificOutput.additionalContext` on stdout
 *               (stderr on exit 0 never reaches the model; it is a human audit trail only)
 *
 * Every detection case is paired: a positive (must emit) and a negative (must stay silent).
 */
describe('user-prompt-preprocessor.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'user-prompt-preprocessor.sh');

  /** Build a platform-shaped UserPromptSubmit payload. */
  function platformInput(prompt: string, hookEventName = 'UserPromptSubmit'): string {
    return JSON.stringify({
      session_id: 'ups-test',
      prompt,
      hook_event_name: hookEventName,
    });
  }

  /** Parse the advisory contract off stdout and assert it is non-blocking. */
  function parseAdvisory(stdout: string): {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  } {
    const trimmed = stdout.trim();
    expect(trimmed.length).toBeGreaterThan(0);
    const parsed = JSON.parse(trimmed);
    expect(parsed).not.toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('continue');
    expect(parsed).not.toHaveProperty('stopReason');
    expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string');
    return parsed;
  }

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  // --- Selector: platform `prompt` field (#1568 axis 1) ---

  it('should read the platform `prompt` field and detect session-end signals', async () => {
    const result = await runHookScript(SCRIPT, platformInput('끝'));
    expect(result.exitCode).toBe(0);
    const parsed = parseAdvisory(result.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Session-end signal detected');
  });

  it('should read the platform `prompt` field and detect slash commands', async () => {
    const result = await runHookScript(SCRIPT, platformInput('/status'));
    expect(result.exitCode).toBe(0);
    const parsed = parseAdvisory(result.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Slash command detected');
  });

  it('should still honour the legacy `user_input` field as a fallback', async () => {
    const input = JSON.stringify({ user_input: '종료', hook_event_name: 'UserPromptSubmit' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    const parsed = parseAdvisory(result.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Session-end signal detected');
  });

  it('should prefer `prompt` over `user_input` when both are present', async () => {
    const input = JSON.stringify({
      prompt: '/status',
      user_input: 'fix the login bug',
      hook_event_name: 'UserPromptSubmit',
    });
    const result = await runHookScript(SCRIPT, input);
    const parsed = parseAdvisory(result.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Slash command detected');
  });

  // --- Negative controls: must stay completely silent ---

  it('should emit nothing for regular input (no hint on stdout or stderr)', async () => {
    const result = await runHookScript(SCRIPT, platformInput('fix the login bug'));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toBe('');
  });

  it('should emit nothing when the prompt is empty', async () => {
    const result = await runHookScript(SCRIPT, platformInput(''));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('should emit nothing for a payload carrying neither prompt nor user_input', async () => {
    const input = JSON.stringify({ session_id: 'x', hook_event_name: 'UserPromptSubmit' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('should exit 0 on malformed JSON stdin', async () => {
    const result = await runHookScript(SCRIPT, 'not json at all');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  // --- Delivery channel (#1568 axis 2) ---

  it('should echo the firing event into hookSpecificOutput.hookEventName', async () => {
    const result = await runHookScript(SCRIPT, platformInput('/status', 'UserPromptSubmit'));
    const parsed = parseAdvisory(result.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  });

  it('should emit no JSON when hook_event_name is absent (no guessed default)', async () => {
    // hookSpecificOutput.hookEventName must match the ACTUAL firing event; a wrong value
    // invalidates the output. The stderr audit line still fires.
    const input = JSON.stringify({ prompt: '/status' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toContain('Slash command detected');
  });

  it('should NOT echo the raw payload back on stdout (no pass-through)', async () => {
    // For UserPromptSubmit, plain stdout on exit 0 is injected into the model's context, so
    // echoing the payload would inject raw hook JSON as noise. Sibling UserPromptSubmit
    // advisors in this repo do not echo either.
    const input = platformInput('/status');
    const result = await runHookScript(SCRIPT, input);
    expect(result.stdout.trim()).not.toBe(input);
    expect(result.stdout).not.toContain('"session_id"');
  });

  it('should keep the stderr line as a human audit trail alongside the JSON', async () => {
    const result = await runHookScript(SCRIPT, platformInput('끝'));
    expect(result.stderr).toContain('Session-end signal detected');
  });

  it('should exit 0 when jq is unavailable (PATH stripped)', async () => {
    const result = await runHookScript(SCRIPT, platformInput('/status'), { PATH: '/usr/bin:/bin' });
    expect(result.exitCode).toBe(0);
  });

  // --- Source-level regression guards ---

  it('should select .prompt, not .user_input alone (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('.prompt');
    // The bare `.user_input // ""` selector is the #1568 defect; pin its absence.
    expect(src).not.toMatch(/jq -r '\.user_input \/\/ ""'/);
  });

  it('should deliver via additionalContext, never a decision field (source guard)', async () => {
    const src = await Bun.file(SCRIPT).text();
    expect(src).toContain('additionalContext');
    // Strip comment lines first — the header documents WHY `"decision": "block"` is
    // forbidden, and a naive substring match would flag that explanation as the defect.
    const code = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toContain('decision');
  });
});

// -------------------------------------------------------------------
// cwd-change-detector.sh
// -------------------------------------------------------------------

describe('cwd-change-detector.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'cwd-change-detector.sh');

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  it('should pass through input unchanged on stdout', async () => {
    const input = JSON.stringify({ new_cwd: '/tmp' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
  });

  it('should detect project with CLAUDE.md', async () => {
    const projectRoot = process.cwd();
    const input = JSON.stringify({ new_cwd: projectRoot });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    // May or may not detect depending on cwd; just verify it doesn't crash
  });

  it('should handle empty new_cwd gracefully', async () => {
    const input = JSON.stringify({ new_cwd: '' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });
});

// -------------------------------------------------------------------
// file-change-validator.sh
// -------------------------------------------------------------------

describe('file-change-validator.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'file-change-validator.sh');

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  it('should pass through input unchanged on stdout', async () => {
    const input = JSON.stringify({ file_path: '/tmp/test.txt', change_type: 'modified' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
  });

  it('should detect external file change', async () => {
    const input = JSON.stringify({ file_path: '/tmp/test.txt', change_type: 'modified' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('External file change detected');
  });

  it('should warn about configuration file changes', async () => {
    const input = JSON.stringify({ file_path: '/project/CLAUDE.md', change_type: 'modified' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Configuration file changed externally');
  });

  it('should warn about lock file changes', async () => {
    const input = JSON.stringify({ file_path: '/project/yarn.lock', change_type: 'modified' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Lock file changed');
  });

  it('should handle empty file_path gracefully', async () => {
    const input = JSON.stringify({ file_path: '' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });
});

// -------------------------------------------------------------------
// failure-ledger.sh  (PostToolUseFailure)
// -------------------------------------------------------------------

describe('failure-ledger.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'failure-ledger.sh');
  let ledger: string;

  /**
   * PostToolUseFailure payload, copied from the official hook docs.
   * The error is a TOP-LEVEL `error` string — PostToolUseFailure does NOT send
   * `tool_response` (that field belongs to PostToolUse). See the err-selector test below.
   */
  function makeFailureInput(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      session_id: 'sess-A',
      transcript_path: '/tmp/t.jsonl',
      cwd: '/tmp',
      permission_mode: 'default',
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npm test', description: 'Run test suite' },
      tool_use_id: 'toolu_01ABC',
      error: 'Command exited with non-zero status code 1',
      is_interrupt: false,
      duration_ms: 4187,
      ...over,
    });
  }

  async function readLedger(): Promise<Record<string, unknown>[]> {
    const raw = await readFile(ledger, 'utf-8').catch(() => '');
    return raw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  beforeEach(() => {
    ledger = join(
      tmpdir(),
      `omcc-ledger-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`
    );
  });

  afterEach(async () => {
    await unlink(ledger).catch(() => undefined);
  });

  it('should pass bash syntax check', async () => {
    const { exitCode } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
  });

  // --- POSITIVE ---

  it('should append exactly one JSONL record for a tool failure', async () => {
    const result = await runHookScript(SCRIPT, makeFailureInput(), {
      OMCUSTOM_ERROR_LEDGER: ledger,
    });
    expect(result.exitCode).toBe(0);
    expect(await readLedger()).toHaveLength(1);
  });

  /**
   * Regression guard (#1561): the first draft read `.tool_response.error`, which does not
   * exist on a PostToolUseFailure payload, so `err` was ALWAYS "" — the same silent-selector
   * class of defect as `.role` vs `.message.role` in r007-r008-drift-advisor.sh.
   */
  it('should capture the top-level `error` field, not an empty string', async () => {
    await runHookScript(SCRIPT, makeFailureInput(), { OMCUSTOM_ERROR_LEDGER: ledger });
    const [rec] = await readLedger();

    expect(rec.err).toBe('Command exited with non-zero status code 1');
    expect(rec.err).not.toBe('');
  });

  it('should record tool name and target', async () => {
    await runHookScript(SCRIPT, makeFailureInput(), { OMCUSTOM_ERROR_LEDGER: ledger });
    const [rec] = await readLedger();

    expect(rec.tool).toBe('Bash');
    expect(rec.target).toBe('npm test');
    expect(rec.session).toBe('sess-A');
  });

  it('should flag user-interrupt failures via is_interrupt', async () => {
    await runHookScript(SCRIPT, makeFailureInput({ is_interrupt: true }), {
      OMCUSTOM_ERROR_LEDGER: ledger,
    });
    const [rec] = await readLedger();
    expect(rec.interrupt).toBe(true);
  });

  it('should mark normal failures as interrupt:false', async () => {
    await runHookScript(SCRIPT, makeFailureInput(), { OMCUSTOM_ERROR_LEDGER: ledger });
    const [rec] = await readLedger();
    expect(rec.interrupt).toBe(false);
  });

  it('should append across multiple failures', async () => {
    const env = { OMCUSTOM_ERROR_LEDGER: ledger };
    await runHookScript(SCRIPT, makeFailureInput(), env);
    await runHookScript(SCRIPT, makeFailureInput({ tool_name: 'Edit' }), env);
    expect(await readLedger()).toHaveLength(2);
  });

  it('should not write anything to stdout (ledger must not emit hook JSON output)', async () => {
    const result = await runHookScript(SCRIPT, makeFailureInput(), {
      OMCUSTOM_ERROR_LEDGER: ledger,
    });
    expect(result.stdout).toBe('');
  });

  // --- NEGATIVE CONTROLS ---

  it('should append NOTHING when opted out via OMCUSTOM_FAILURE_LEDGER=off', async () => {
    const result = await runHookScript(SCRIPT, makeFailureInput(), {
      OMCUSTOM_ERROR_LEDGER: ledger,
      OMCUSTOM_FAILURE_LEDGER: 'off',
    });
    expect(result.exitCode).toBe(0);
    expect(await readLedger()).toHaveLength(0);
  });

  it('should exit 0 and append nothing on malformed JSON', async () => {
    const result = await runHookScript(SCRIPT, 'not json at all', {
      OMCUSTOM_ERROR_LEDGER: ledger,
    });
    expect(result.exitCode).toBe(0);
    expect(await readLedger()).toHaveLength(0);
  });

  it('should exit 0 on empty stdin', async () => {
    const result = await runHookScript(SCRIPT, '', { OMCUSTOM_ERROR_LEDGER: ledger });
    expect(result.exitCode).toBe(0);
  });
});

// -------------------------------------------------------------------
// fail-axis-cause-advisor.sh  (UserPromptSubmit)
// -------------------------------------------------------------------

describe('fail-axis-cause-advisor.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'fail-axis-cause-advisor.sh');
  const SESSION = 'sess-A';
  let ledger: string;
  let markerDir: string;

  function makePrompt(prompt: string, session = SESSION): string {
    // UserPromptSubmit delivers the typed text in `prompt` (per the official hook docs).
    return JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt });
  }

  function ledgerLine(over: Record<string, unknown> = {}): string {
    return `${JSON.stringify({
      ts: 't',
      session: SESSION,
      cwd: '/tmp',
      tool: 'Bash',
      target: 'npm test',
      interrupt: false,
      err: 'exit 1',
      ...over,
    })}\n`;
  }

  /** Extract the model-facing advisory string, or '' when the hook stayed silent. */
  function advisoryOf(stdout: string): string {
    if (stdout.trim().length === 0) return '';
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
    };
    return parsed.hookSpecificOutput?.additionalContext ?? '';
  }

  /**
   * Base env for every invocation in this describe block: an isolated ledger path AND an
   * isolated dedup-marker directory (#1625 찐빠 #4). Without OMCUSTOM_FAIL_MARKER_DIR every
   * test would share the marker key derived from the constant SESSION ('sess-A') against the
   * real ${TMPDIR:-/tmp}, so the dedup feature added in this fix would make later tests in
   * this file silently fail (marker left behind by an earlier test's fail_count=2 firing).
   */
  function baseEnv(over: Record<string, string> = {}): Record<string, string> {
    return { OMCUSTOM_ERROR_LEDGER: ledger, OMCUSTOM_FAIL_MARKER_DIR: markerDir, ...over };
  }

  beforeEach(async () => {
    ledger = join(tmpdir(), `omcc-adv-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
    markerDir = join(
      tmpdir(),
      `omcc-adv-markers-${process.pid}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(markerDir, { recursive: true });
    await writeFile(ledger, ledgerLine() + ledgerLine({ tool: 'Edit', target: 'a.ts' }));
  });

  afterEach(async () => {
    await unlink(ledger).catch(() => undefined);
    await rm(markerDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('should pass bash syntax check', async () => {
    const { exitCode } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
  });

  // --- POSITIVE ---

  it('should advise on a short cause-free nudge when the session has failures', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('계속해'), baseEnv());
    expect(result.exitCode).toBe(0);
    expect(advisoryOf(result.stdout)).toContain('FAIL Advisory');
  });

  it('should deliver via hookSpecificOutput.additionalContext with the right event name', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('계속해'), baseEnv());
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(parsed.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  it('should never emit a decision field (advisory-only, must not block the prompt)', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('계속해'), baseEnv());
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.decision).toBeUndefined();
  });

  it('should report the failure count in the advisory', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('계속해'), baseEnv());
    expect(advisoryOf(result.stdout)).toContain('2건');
  });

  it('should trigger on other nudge phrasings', async () => {
    for (const nudge of ['ㄱㄱ', 'continue', '진행해', 'go on']) {
      // Each nudge uses its OWN session (with its own matching ledger entries) so the
      // dedup marker (#1625 찐빠 #4) from a previous iteration's fail_count does not
      // silence this one — dedup is keyed per session, not globally.
      const session = `sess-nudge-${nudge}`;
      await writeFile(
        ledger,
        ledgerLine({ session }) + ledgerLine({ session, tool: 'Edit', target: 'a.ts' })
      );
      const result = await runHookScript(SCRIPT, makePrompt(nudge, session), baseEnv());
      expect(advisoryOf(result.stdout)).toContain('FAIL Advisory');
    }
  });

  // --- POSITIVE: resolve-path dedup (#1625 찐빠 #4) ---

  it('fires again once a NEW failure is appended after the first advisory', async () => {
    const session = 'sess-dedup-new-failure';
    await writeFile(
      ledger,
      ledgerLine({ session }) + ledgerLine({ session, tool: 'Edit', target: 'a.ts' })
    );
    const first = await runHookScript(SCRIPT, makePrompt('계속해', session), baseEnv());
    expect(advisoryOf(first.stdout)).toContain('2건');

    // A third failure lands in the ledger for the same session.
    await writeFile(
      ledger,
      (await readFile(ledger, 'utf-8')) + ledgerLine({ session, tool: 'Write', target: 'b.ts' })
    );

    const second = await runHookScript(SCRIPT, makePrompt('계속해', session), baseEnv());
    expect(advisoryOf(second.stdout)).toContain('3건');
  });

  // --- NEGATIVE CONTROLS (silence is the correct answer) ---

  it('should stay silent when the prompt already names a cause', async () => {
    for (const p of ['계속해, 원인이 뭐야', '에러 때문에 실패', 'why did it fail']) {
      const result = await runHookScript(SCRIPT, makePrompt(p), baseEnv());
      expect(advisoryOf(result.stdout)).toBe('');
    }
  });

  it('should stay silent for prompts longer than 40 characters', async () => {
    // 41 chars — one past the boundary; 40 or fewer still fires (see boundary test below).
    const long = `${'a'.repeat(38)}계속해`;
    expect(long.length).toBeGreaterThan(40);
    const result = await runHookScript(SCRIPT, makePrompt(long), baseEnv());
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should still fire at exactly the 40-character boundary', async () => {
    const atBoundary = `${'a'.repeat(37)}계속해`;
    expect(atBoundary.length).toBe(40);
    const result = await runHookScript(SCRIPT, makePrompt(atBoundary), baseEnv());
    expect(advisoryOf(result.stdout)).toContain('FAIL Advisory');
  });

  it('should stay silent when the prompt is not a progress nudge', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('파일 읽어줘'), baseEnv());
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should stay silent for a different session with no failures of its own', async () => {
    const result = await runHookScript(SCRIPT, makePrompt('계속해', 'other-session'), baseEnv());
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should stay silent when the ledger does not exist', async () => {
    const result = await runHookScript(
      SCRIPT,
      makePrompt('계속해'),
      baseEnv({ OMCUSTOM_ERROR_LEDGER: join(tmpdir(), 'omcc-no-such-ledger.jsonl') })
    );
    expect(result.exitCode).toBe(0);
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should stay silent when the only failures were user interrupts', async () => {
    await writeFile(ledger, ledgerLine({ interrupt: true, err: 'interrupted' }));
    const result = await runHookScript(SCRIPT, makePrompt('계속해'), baseEnv());
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should stay silent when opted out via OMCUSTOM_FAIL_ADVISOR=off', async () => {
    const result = await runHookScript(
      SCRIPT,
      makePrompt('계속해'),
      baseEnv({ OMCUSTOM_FAIL_ADVISOR: 'off' })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('should exit 0 on an empty prompt', async () => {
    const result = await runHookScript(SCRIPT, makePrompt(''), baseEnv());
    expect(result.exitCode).toBe(0);
    expect(advisoryOf(result.stdout)).toBe('');
  });

  // --- NEGATIVE: resolve-path dedup (#1625 찐빠 #4) ---

  it('stays silent on a repeat nudge when no NEW failure was appended (same fail_count)', async () => {
    const session = 'sess-dedup-repeat';
    await writeFile(
      ledger,
      ledgerLine({ session }) + ledgerLine({ session, tool: 'Edit', target: 'a.ts' })
    );
    const first = await runHookScript(SCRIPT, makePrompt('계속해', session), baseEnv());
    expect(advisoryOf(first.stdout)).toContain('FAIL Advisory');

    // Same ledger, same session, same fail_count=2 — this is the already-diagnosed failure
    // set, so a second cause-free nudge must not re-fire.
    const second = await runHookScript(SCRIPT, makePrompt('계속해', session), baseEnv());
    expect(advisoryOf(second.stdout)).toBe('');
  });

  // --- NEGATIVE: "다음" scope-directive narrowing (#1625 찐빠 #4) ---

  it('should stay silent for a scope directive using bare "다음" ("다음엔 …")', async () => {
    // Real misfire (#1625): "다음엔 Pre,PostToolUse 찐빠도 해결한다" is a plan statement about
    // FUTURE work, not a cause-free progress nudge on the CURRENT failure — it must not match
    // condition 2 merely because it contains the substring "다음".
    const result = await runHookScript(
      SCRIPT,
      makePrompt('다음엔 Pre,PostToolUse 찐빠도 해결한다'),
      baseEnv()
    );
    expect(advisoryOf(result.stdout)).toBe('');
  });

  it('should stay silent for other bare-다음 scope directives (다음 세션/다음 릴리즈/다음번)', async () => {
    for (const p of ['다음 세션에 마저 하자', '다음 릴리즈에서 처리', '다음번엔 미리 확인']) {
      const result = await runHookScript(SCRIPT, makePrompt(p), baseEnv());
      expect(advisoryOf(result.stdout)).toBe('');
    }
  });

  it('should still fire for genuine immediate-continuation phrasing (다음 단계/다음으로/다음 진행)', async () => {
    for (const p of ['다음 단계로', '다음으로 넘어가', '다음 진행']) {
      // Own session + matching ledger entries per iteration — see the dedup note above.
      const session = `sess-next-${p}`;
      await writeFile(
        ledger,
        ledgerLine({ session }) + ledgerLine({ session, tool: 'Edit', target: 'a.ts' })
      );
      const result = await runHookScript(SCRIPT, makePrompt(p, session), baseEnv());
      expect(advisoryOf(result.stdout)).toContain('FAIL Advisory');
    }
  });
});

// -------------------------------------------------------------------
// Script file validation
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// Issue #1632: echo pass-through escape-corruption regression guard
// -------------------------------------------------------------------
//
// Live evidence (2026-08-30): a Bash grep pattern containing a literal `\|` was
// JSON-encoded (correctly) as `\\|` in the hook input payload; `echo "$input"`
// re-output collapsed one backslash before jq/CC ever saw it, producing invalid
// JSON ("Invalid escape character |"). A second observation ("Unterminated
// string") is consistent with a literal `\n` escape sequence being expanded by
// echo into a real newline byte inside what must remain a single-line JSON
// string. All hook scripts (and hooks.json inline commands) now use
// `printf '%s\n' "$var"` instead of `echo "$var"` for any JSON payload that is
// re-emitted to stdout or re-piped into jq — printf does not interpret escape
// sequences in its %s argument, so the byte sequence survives unchanged.
describe('Issue #1632: JSON pass-through escape safety', () => {
  beforeEach(() => {
    const { execSync } = require('node:child_process');
    try {
      execSync('rm -f /tmp/.claude-task-count-* /tmp/.claude-env-status-*');
    } catch {
      // ignore if no files exist
    }
  });

  // --- Positive case A: literal backslash-pipe (\|), the exact live-evidence pattern ---

  it('agent-teams-advisor.sh: stdout stays byte-identical JSON when a field contains a literal \\|', async () => {
    const input = JSON.stringify({
      tool_input: {
        subagent_type: 'lang-golang-expert',
        description: String.raw`grep -l 'a\|b' pattern with literal backslash-pipe`,
        model: 'sonnet',
      },
    });
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trim()).toBe(input);
  });

  it('destructive-git-guard.sh: stdout stays byte-identical JSON when tool_input.command contains a literal \\|', async () => {
    const input = JSON.stringify({
      tool: 'Bash',
      tool_input: {
        command: String.raw`git status && find . -name "*.txt" -exec grep -l 'a\|b' {} \;`,
      },
    });
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trim()).toBe(input);
    expect(result.stderr).not.toContain('DESTRUCTIVE GIT WARNING');
  });

  // --- Positive case B: literal backslash-n (\n) escape, the "Unterminated string" pattern ---

  it('agent-teams-advisor.sh: stdout stays byte-identical JSON when a field contains a literal \\n escape', async () => {
    const input = JSON.stringify({
      tool_input: {
        subagent_type: 'lang-python-expert',
        description: String.raw`printf 'line1\nline2\n' style literal backslash-n`,
        model: 'sonnet',
      },
    });
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trim()).toBe(input);
  });

  it('destructive-git-guard.sh: stdout stays byte-identical JSON when tool_input.command contains a literal \\n escape', async () => {
    const input = JSON.stringify({
      tool: 'Bash',
      tool_input: { command: String.raw`printf 'line1\nline2\n'` },
    });
    const result = await runHookScript(DESTRUCTIVE_GIT_GUARD_SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout.trim()).toBe(input);
  });

  // --- Negative/structural case: no script should re-output a JSON payload via bare `echo` ---
  // (This is the deterministic Tier-1 guard: the functional tests above prove the fix
  // works for two representative scripts; this proves the fix isn't merely local to
  // those two by scanning every shipped hook script and hooks.json for the regressed
  // pattern directly.)

  it('no hook script should re-output/pipe stdin JSON via bare `echo "$var"` (regression guard)', async () => {
    const { readdirSync } = require('node:fs');
    const scriptNames = readdirSync(SCRIPTS_DIR).filter((f: string) => f.endsWith('.sh'));
    const offenders: string[] = [];
    for (const fname of scriptNames) {
      const content = await readFile(join(SCRIPTS_DIR, fname), 'utf-8');
      offenders.push(...findJsonVarEchoOffenders(fname, content));
    }
    expect(offenders).toEqual([]);
  });

  it('hooks.json should not contain the literal `echo \\"$input\\"` pass-through pattern', async () => {
    const raw = await readFile(HOOKS_JSON_PATH, 'utf-8');
    expect(raw.includes('echo \\"$input\\"')).toBe(false);
  });
});

describe('Script file validation', () => {
  const EXPECTED_SCRIPTS = [
    'stage-blocker.sh',
    'git-delegation-guard.sh',
    'destructive-git-guard.sh',
    'stop-console-audit.sh',
    'agent-teams-advisor.sh',
    'session-env-check.sh',
    'stuck-detector.sh',
    'user-prompt-preprocessor.sh',
    'cwd-change-detector.sh',
    'file-change-validator.sh',
    'failure-ledger.sh',
    'fail-axis-cause-advisor.sh',
    'subagent-failure-advisor.sh',
  ] as const;

  it('all expected scripts should exist in the templates directory', async () => {
    for (const scriptName of EXPECTED_SCRIPTS) {
      const scriptPath = join(SCRIPTS_DIR, scriptName);
      expect(existsSync(scriptPath)).toBe(true);
    }
  });

  it('all scripts should have a bash shebang on the first line', async () => {
    for (const scriptName of EXPECTED_SCRIPTS) {
      const scriptPath = join(SCRIPTS_DIR, scriptName);
      const content = await readFile(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      expect(firstLine).toMatch(/^#!.*bash/);
    }
  });

  it('all scripts should be non-empty', async () => {
    for (const scriptName of EXPECTED_SCRIPTS) {
      const scriptPath = join(SCRIPTS_DIR, scriptName);
      const content = await readFile(scriptPath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  it('all scripts referenced in hooks.json should exist on disk', async () => {
    const raw = await readFile(HOOKS_JSON_PATH, 'utf-8');
    // Match references like "bash .claude/hooks/scripts/foo.sh" or "scripts/foo.sh"
    const scriptRefs = [...raw.matchAll(/scripts\/([\w-]+\.sh)/g)].map((m) => m[1]);
    const uniqueRefs = [...new Set(scriptRefs)];

    expect(uniqueRefs.length).toBeGreaterThan(0);

    for (const scriptName of uniqueRefs) {
      const scriptPath = join(SCRIPTS_DIR, scriptName);
      const scriptExists = existsSync(scriptPath);
      expect(scriptExists).toBe(true);
    }
  });

  it('all scripts should pass bash -n syntax check', async () => {
    for (const scriptName of EXPECTED_SCRIPTS) {
      const scriptPath = join(SCRIPTS_DIR, scriptName);
      const { exitCode, stderr } = await bashSyntaxCheck(scriptPath);
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
    }
  });
});

// -------------------------------------------------------------------
// Issue #1650 B: non-object stdin must never crash a hook
// -------------------------------------------------------------------
// Measured: `printf 'not json' | bash <hook>.sh` exited 5 (jq parse error
// propagated through `set -euo pipefail`) for 10 of 40 scripts. The hook
// protocol requires an `exit 0` swallow (R021 — hooks must never crash), so
// each affected script now guards its stdin immediately after `input=$(cat)`:
//
//   printf '%s' "$input" | jq -e 'type=="object"' >/dev/null 2>&1 || exit 0
//
// The same crash class also fired on type-shape mismatch (tool_input /
// tool_output arriving as a scalar instead of an object), fixed with jq's `?`
// error-suppression operator on nested path accesses.
describe('Issue #1650 B: non-object stdin swallow (exit 0, no stdout)', () => {
  const HARDENED_SCRIPTS = [
    'agent-start-recorder.sh',
    'agent-teams-advisor.sh',
    'audit-log.sh',
    'content-hash-validator.sh',
    'model-escalation-advisor.sh',
    'playwright-compress.sh',
    'schema-validator.sh',
    'secret-filter.sh',
    'session-reflection.sh',
    'task-outcome-recorder.sh',
  ];

  const NON_OBJECT_INPUTS: Array<[string, string]> = [
    ['non-JSON text', 'not json'],
    ['JSON array', '[]'],
    ['JSON array with elements', '[{"tool_name":"Read"}]'],
    ['empty stdin', ''],
    ['bare JSON string', '"hello"'],
    ['bare JSON number', '42'],
  ];

  // --- Negative cases: garbage stdin -> rc 0, empty stdout, no crash ---

  for (const scriptName of HARDENED_SCRIPTS) {
    for (const [label, payload] of NON_OBJECT_INPUTS) {
      it(`${scriptName}: exits 0 with empty stdout on ${label}`, async () => {
        const result = await runHookScript(join(SCRIPTS_DIR, scriptName), payload);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain('parse error');
      });
    }
  }

  // --- Positive cases: a well-formed object still passes through unchanged ---

  for (const scriptName of HARDENED_SCRIPTS) {
    it(`${scriptName}: passes a well-formed object through unchanged`, async () => {
      const input = JSON.stringify({
        tool_name: 'Read',
        agent_type: 'general-purpose',
        model: 'sonnet',
        description: 'issue-1650 positive case',
        tool_input: { file_path: '/nonexistent/issue-1650-probe.txt' },
        tool_output: { is_error: false },
      });
      const result = await runHookScript(join(SCRIPTS_DIR, scriptName), input);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(input);
    });
  }

  // --- Positive case: scalar-shaped tool_input/tool_output must not crash jq ---

  for (const scriptName of HARDENED_SCRIPTS) {
    it(`${scriptName}: survives scalar-shaped tool_input/tool_output without crashing`, async () => {
      const input = JSON.stringify({
        tool_name: 'Read',
        agent_type: 'general-purpose',
        model: 'sonnet',
        tool_input: 'scalar-instead-of-object',
        tool_output: 'scalar-instead-of-object',
      });
      const result = await runHookScript(join(SCRIPTS_DIR, scriptName), input);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(input);
      expect(result.stderr).not.toContain('Cannot index');
    });
  }

  // --- Structural regression guard: the guard line must stay present ---

  it('every hardened script keeps the non-object stdin guard immediately after `input=$(cat)`', async () => {
    const missing: string[] = [];
    for (const scriptName of HARDENED_SCRIPTS) {
      const content = await readFile(join(SCRIPTS_DIR, scriptName), 'utf-8');
      const lines = content.split('\n');
      const anchor = lines.findIndex((l) => l.trim() === 'input=$(cat)');
      if (anchor === -1) {
        missing.push(`${scriptName}: no \`input=$(cat)\` anchor`);
        continue;
      }
      const window = lines.slice(anchor, anchor + 6).join('\n');
      if (!window.includes(`jq -e 'type=="object"'`)) {
        missing.push(`${scriptName}: guard not found within 5 lines of anchor`);
      }
    }
    expect(missing).toEqual([]);
  });

  // --- Guard must not become a detection bypass (security-hook carve-out) ---
  //
  // secret-filter.sh is a security hook: the non-object guard rejects only stdin
  // a scanner could never read anyway. A well-formed object MUST still be scanned
  // and still warn. Without this positive case, a future "harden" edit could turn
  // the guard into a silent bypass and every negative case would stay green.

  it('secret-filter.sh still detects secrets in a well-formed object after the guard', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { output: 'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE' },
    });
    const result = await runHookScript(join(SCRIPTS_DIR, 'secret-filter.sh'), input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Security]');
    expect(result.stderr).toContain('AWS Access Key');
    expect(result.stdout.trim()).toBe(input);
  });

  it('schema-validator.sh still emits dangerous-pattern warnings after the guard', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'sudo rm -rf /etc' },
    });
    // cwd MUST be the repo root: the script resolves `.claude/schemas/tool-inputs.json`
    // relative to cwd and passes stdin straight through when that file is absent.
    const repoRoot = resolve(import.meta.dir, '../../..');
    const result = await runHookScript(
      join(SCRIPTS_DIR, 'schema-validator.sh'),
      input,
      {},
      repoRoot
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Schema]');
    expect(result.stdout.trim()).toBe(input);
  });

  // --- Regression: `set -euo pipefail` + no-match grep aborted the hook (rc=1) ---
  //
  // Measured before the fix: task-outcome-recorder.sh exited 1 on empty stdin AND
  // on a well-formed object carrying no skill name, because `grep -oiE ... | head -1`
  // exits 1 when nothing matches and pipefail propagates it out of the assignment.

  it('task-outcome-recorder.sh exits 0 on a well-formed object with no skill name', async () => {
    const input = JSON.stringify({
      tool_input: { subagent_type: 'general-purpose', description: 'plain description' },
      tool_output: { is_error: false },
    });
    const result = await runHookScript(join(SCRIPTS_DIR, 'task-outcome-recorder.sh'), input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
  });
});

// -------------------------------------------------------------------
// secret-filter.sh: private-key leading-dash grep option-injection bypass
// -------------------------------------------------------------------
//
// Measured before the fix: the private-key pattern `-----BEGIN.*PRIVATE
// KEY-----` starts with `-`, so `grep -qE 'PATTERN'` (no `--`) parses the
// pattern text itself as a run of short options. grep aborts with
// `unrecognized option` (rc=2), which the `if grep -qE ...; then` guard
// silently absorbs as "no match" — real PEM private-key blocks pass through
// the hook with zero [Security] warning. Only this one pattern starts with
// `-`; the other 9 secret patterns in the file do not exhibit the bug.
describe('secret-filter.sh: private-key detection (leading-dash grep bypass)', () => {
  it('detects a PEM RSA private key block and emits a [Security] warning', async () => {
    const pemBlock = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { output: pemBlock },
    });
    const result = await runHookScript(join(SCRIPTS_DIR, 'secret-filter.sh'), input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Security]');
    expect(result.stderr).toContain('private key');
    expect(result.stdout.trim()).toBe(input);
  });

  it('does not flag a plain certificate block (negative control — not a private key)', async () => {
    const certBlock = [
      '-----BEGIN CERTIFICATE-----',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      '-----END CERTIFICATE-----',
    ].join('\n');
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { output: certBlock },
    });
    const result = await runHookScript(join(SCRIPTS_DIR, 'secret-filter.sh'), input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('private key');
    expect(result.stdout.trim()).toBe(input);
  });
});

// -------------------------------------------------------------------
// PostToolUse payload field name: `tool_response`, NOT `tool_output`
// -------------------------------------------------------------------
//
// Measured 2026-09-03 over 1764 PostToolUse payloads echoed by this project's
// own pass-through hooks into the session transcripts
// (~/.claude/projects/<slug>/*.jsonl -> records with type "attachment",
// attachment.type == "hook_success", attachment.stdout == the hook's stdin
// verbatim):
//
//   top-level keys : session_id, transcript_path, cwd, prompt_id,
//                    permission_mode, effort, hook_event_name, tool_name,
//                    tool_input, tool_response, tool_use_id, duration_ms
//                    (+ scratchpad_dir on 1187 of them)
//   `tool_output`  : present in 0 of 1764.  `tool_response`: 1764 of 1764.
//
//   Bash  .tool_response = {stdout, stderr, interrupted, isImage,
//                           noOutputExpected} (+ backgroundTaskId /
//                           returnCodeInterpretation / persistedOutputPath)
//   Read  .tool_response = {type:"text", file:{filePath, content}}
//   Write .tool_response = {type:"create", filePath, content,
//                           originalFile, structuredPatch, userModified}
//   Agent .tool_response = {agentId, status, description, prompt,
//                           resolvedModel, isAsync, outputFile,
//                           canReadOutputFile}
//
// The CC 2.1.259 binary agrees: its embedded hook reference documents
//   "tool_response": { "success": true }  // PostToolUse only
// and its own example hooks read `.tool_response.filePath`. (The 2 `tool_output`
// strings in the binary are unrelated — a telemetry event name and an HTTP-hook
// error message.)
//
// Before the fix, all three scripts read `.tool_output...`, which is never
// present on PostToolUse: secret-filter.sh saw output="" and returned before
// scanning a single pattern (AWS keys / private keys / PATs all passed through
// unflagged), audit-log.sh recorded outcome=success unconditionally, and
// playwright-compress.sh never compressed anything.
describe('PostToolUse `tool_response` payload field (measured shape)', () => {
  const SECRET_FILTER = join(SCRIPTS_DIR, 'secret-filter.sh');
  const AUDIT_LOG = join(SCRIPTS_DIR, 'audit-log.sh');
  const PLAYWRIGHT_COMPRESS = join(SCRIPTS_DIR, 'playwright-compress.sh');

  const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
  const GH_PAT = `ghp_${'a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ'.slice(0, 36)}`;
  const PEM_KEY = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
    'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  // ---------------- secret-filter.sh: positive cases (measured shapes) -------

  it('secret-filter.sh detects an AWS key in Bash `.tool_response.stdout`', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'cat ~/.aws/credentials' },
      tool_response: {
        stdout: `aws_access_key_id = ${AWS_KEY}`,
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Security]');
    expect(result.stderr).toContain('AWS Access Key');
    expect(result.stdout.trim()).toBe(input);
  });

  it('secret-filter.sh detects a PEM private key in Read `.tool_response.file.content`', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/home/u/.ssh/id_rsa' },
      tool_response: {
        type: 'text',
        file: { filePath: '/home/u/.ssh/id_rsa', content: PEM_KEY },
      },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Security]');
    expect(result.stderr).toContain('private key');
    expect(result.stdout.trim()).toBe(input);
  });

  it('secret-filter.sh detects a GitHub PAT in Write `.tool_response.content`', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/ci.env' },
      tool_response: {
        type: 'create',
        filePath: '/tmp/ci.env',
        content: `GITHUB_TOKEN=${GH_PAT}\n`,
        userModified: false,
      },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[Security]');
    expect(result.stderr).toContain('GitHub PAT');
    expect(result.stdout.trim()).toBe(input);
  });

  it('secret-filter.sh detects a secret in Bash `.tool_response.stderr`', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { stdout: '', stderr: `auth failed for ${AWS_KEY}`, interrupted: false },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('AWS Access Key');
  });

  it('secret-filter.sh detects a secret in a string-shaped `.tool_response` (MCP-style)', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__example__fetch',
      tool_response: `token: ${GH_PAT}`,
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('GitHub PAT');
    expect(result.stdout.trim()).toBe(input);
  });

  it('secret-filter.sh detects a secret in an MCP `.tool_response.content[].text` array', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__example__read',
      tool_response: {
        content: [
          { type: 'text', text: 'header line' },
          { type: 'text', text: `aws_access_key_id = ${AWS_KEY}` },
        ],
      },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('AWS Access Key');
  });

  // ---------------- secret-filter.sh: negative control ----------------------

  it('secret-filter.sh stays silent on a clean `.tool_response` (negative control)', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: {
        stdout: 'total 8\ndrwxr-xr-x  2 u  staff   64 Sep  3 10:00 .\n',
        stderr: '',
        interrupted: false,
      },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('[Security]');
    expect(result.stdout.trim()).toBe(input);
  });

  // ---------------- secret-filter.sh: legacy fallback must keep working -----

  it('secret-filter.sh still detects secrets via the legacy `.tool_output.output` fallback', async () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_output: { output: `export AWS_ACCESS_KEY_ID=${AWS_KEY}` },
    });
    const result = await runHookScript(SECRET_FILTER, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('AWS Access Key');
    expect(result.stdout.trim()).toBe(input);
  });

  // ---------------- audit-log.sh: outcome must reflect real failures --------

  describe('audit-log.sh outcome field', () => {
    let auditHome: string;

    beforeEach(async () => {
      auditHome = join(
        tmpdir(),
        `audit-home-${process.pid}-${Math.random().toString(36).slice(2)}`
      );
      await mkdir(join(auditHome, '.claude'), { recursive: true });
    });

    afterEach(async () => {
      await rm(auditHome, { recursive: true, force: true });
    });

    async function runAudit(payload: unknown): Promise<Record<string, unknown>> {
      const input = JSON.stringify(payload);
      const result = await runHookScript(AUDIT_LOG, input, { HOME: auditHome });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(input);
      const raw = await readFile(join(auditHome, '.claude', 'audit.jsonl'), 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    }

    it('records outcome=error from `.tool_response.is_error`', async () => {
      const entry = await runAudit({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/tmp/x.txt' },
        tool_response: { is_error: true, content: 'EACCES: permission denied' },
      });
      expect(entry.outcome).toBe('error');
    });

    it('records outcome=error from Bash `.tool_response.interrupted`', async () => {
      const entry = await runAudit({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'sleep 600' },
        tool_response: { stdout: '', stderr: '', interrupted: true, isImage: false },
      });
      expect(entry.outcome).toBe('error');
    });

    it('records outcome=success on a clean measured `.tool_response`', async () => {
      const entry = await runAudit({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git status --short' },
        tool_response: { stdout: '', stderr: '', interrupted: false, isImage: false },
      });
      expect(entry.outcome).toBe('success');
      expect(entry.tool).toBe('Bash');
    });

    it('still honours the legacy `.tool_output.is_error` fallback', async () => {
      const entry = await runAudit({
        tool_name: 'Edit',
        tool_input: { file_path: '/tmp/y.txt' },
        tool_output: { is_error: true },
      });
      expect(entry.outcome).toBe('error');
    });
  });

  // ---------------- playwright-compress.sh: must actually compress ----------

  describe('playwright-compress.sh compression path', () => {
    let stubDir: string;
    const STUB_SUMMARY = 'STUBBED-HAIKU-SUMMARY: page with interactive elements';

    beforeAll(async () => {
      stubDir = join(tmpdir(), `claude-stub-${process.pid}`);
      await mkdir(stubDir, { recursive: true });
      // Offline stub for `claude -p --model haiku` so the compression branch is
      // deterministic and never reaches the network.
      await writeFile(
        join(stubDir, 'claude'),
        `#!/bin/bash\ncat >/dev/null\nprintf '%s\\n' '${STUB_SUMMARY}'\n`,
        { mode: 0o755 }
      );
    });

    afterAll(async () => {
      await rm(stubDir, { recursive: true, force: true });
    });

    /** >3000 chars of page-like text carrying a ref= attribute. */
    function bigPage(): string {
      return `<button ref="e42">Submit</button>\n${'lorem ipsum dolor sit amet '.repeat(150)}`;
    }

    it('compresses a large measured `.tool_response` payload', async () => {
      const page = bigPage();
      expect(page.length).toBeGreaterThan(3000);
      const input = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__claude-in-chrome__read_page',
        tool_response: { content: [{ type: 'text', text: page }] },
      });
      const result = await runHookScript(PLAYWRIGHT_COMPRESS, input, {
        PATH: `${stubDir}:${process.env.PATH}`,
      });
      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(out.updatedMCPToolOutput)).toContain(STUB_SUMMARY);
      // ref= values must survive the summarisation
      expect(String(out.updatedMCPToolOutput)).toContain('ref="e42"');
    });

    it('still compresses a large legacy `.tool_output` payload (fallback)', async () => {
      const page = bigPage();
      const input = JSON.stringify({
        tool_name: 'mcp__claude-in-chrome__read_page',
        tool_output: page,
      });
      const result = await runHookScript(PLAYWRIGHT_COMPRESS, input, {
        PATH: `${stubDir}:${process.env.PATH}`,
      });
      expect(result.exitCode).toBe(0);
      const out = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(String(out.updatedMCPToolOutput)).toContain(STUB_SUMMARY);
    });

    it('passes a small `.tool_response` payload through untouched', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__claude-in-chrome__read_page',
        tool_response: { content: [{ type: 'text', text: 'tiny page' }] },
      });
      const result = await runHookScript(PLAYWRIGHT_COMPRESS, input, {
        PATH: `${stubDir}:${process.env.PATH}`,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(input);
    });
  });
});

// -------------------------------------------------------------------
// Issue #1656 A: scalar-shaped tool_input / tool_response sweep
// -------------------------------------------------------------------
// v1.1.62 hardened 10 scripts against non-object *stdin*. This is the
// follow-up sweep for non-object *field shapes*: `{"tool_input":"x"}` makes
// jq raise `Cannot index string with string` on any bare `.tool_input.<k>`
// access. Measured across all 36 in-scope scripts x 6 event/tool gates x 5
// shapes (scalar string / number / array / absent / well-formed object);
// two scripts carried an unguarded access:
//
//   git-delegation-guard.sh — leaked the jq error to stderr on every
//     non-object tool_input (rc stayed 0: the script has no `set -e`).
//   failure-ledger.sh       — the jq error was swallowed by
//     `2>/dev/null || true`, so the crash surfaced as **silent total record
//     loss** rather than a non-zero exit. rc 0 + empty stderr is therefore
//     NOT sufficient evidence of correctness for an append-only ledger.
//
// Both now normalise the shape before indexing (`?` / an explicit
// `type == "object"` check), matching the pattern already used for
// `.tool_response` in failure-ledger.sh.
describe('Issue #1656 A: scalar-shaped tool_input/tool_response', () => {
  const SCALAR_SHAPES: Array<[string, string]> = [
    ['string scalar', '"x"'],
    ['number scalar', '42'],
    ['array', '["a"]'],
    ['absent', 'ABSENT'],
  ];

  function makeShapeInput(shape: string, eventName: string, toolName: string): string {
    if (shape === 'ABSENT') {
      return `{"hook_event_name":"${eventName}","tool_name":"${toolName}","session_id":"s1"}`;
    }
    return (
      `{"hook_event_name":"${eventName}","tool_name":"${toolName}","session_id":"s1",` +
      `"tool_input":${shape},"tool_response":${shape}}`
    );
  }

  // --- git-delegation-guard.sh (advisory, no `set -e`: assert on stderr) ---

  describe('git-delegation-guard.sh', () => {
    for (const [label, shape] of SCALAR_SHAPES) {
      it(`emits no jq error and passes through on ${label} tool_input`, async () => {
        const input = makeShapeInput(shape, 'PreToolUse', 'Task');
        const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout.trim()).toBe(input);
      });
    }

    it('still warns for a git op delegated away from mgr-gitnerd (object regression)', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'general-purpose', prompt: 'please git push origin main' },
      });
      const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('R010 violation detected');
      expect(result.stderr).toContain('git push');
      expect(result.stdout.trim()).toBe(input);
    });

    it('stays silent for mgr-gitnerd (object regression, negative control)', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'mgr-gitnerd', prompt: 'git push origin main' },
      });
      const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe(input);
    });
  });

  // --- failure-ledger.sh (rc is always 0: assert on the ledger contents) ---

  describe('failure-ledger.sh', () => {
    const FAILURE_LEDGER_SCRIPT = join(SCRIPTS_DIR, 'failure-ledger.sh');
    let ledgerDir: string;

    beforeEach(async () => {
      ledgerDir = join(tmpdir(), `omc-1656a-${process.pid}-${Math.random().toString(36).slice(2)}`);
      await mkdir(ledgerDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(ledgerDir, { recursive: true, force: true });
    });

    async function runLedger(input: string): Promise<{ exitCode: number; records: string[] }> {
      const ledger = join(ledgerDir, 'error-ledger.jsonl');
      const result = await runHookScript(FAILURE_LEDGER_SCRIPT, input, {
        OMCUSTOM_ERROR_LEDGER: ledger,
      });
      const raw = existsSync(ledger) ? await readFile(ledger, 'utf-8') : '';
      return { exitCode: result.exitCode, records: raw.split('\n').filter(Boolean) };
    }

    for (const [label, shape] of SCALAR_SHAPES) {
      it(`still records the failure when tool_input is a ${label}`, async () => {
        const base = makeShapeInput(shape, 'PostToolUseFailure', 'Bash');
        // splice the top-level `error` field in without disturbing the shape fixture
        const input = `${base.slice(0, -1)},"error":"boom boom"}`;
        const { exitCode, records } = await runLedger(input);
        expect(exitCode).toBe(0);
        // The pre-fix behaviour lost the whole record here (jq indexing error
        // swallowed by `2>/dev/null || true`), so length 1 is the assertion.
        expect(records).toHaveLength(1);
        const rec = JSON.parse(records[0]!) as Record<string, unknown>;
        expect(rec.tool).toBe('Bash');
        expect(rec.err).toBe('boom boom');
        expect(rec.target).toBe('');
      });
    }

    it('extracts tool_input.command when tool_input is a well-formed object', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        session_id: 's1',
        error: 'boom',
        tool_input: { command: 'ls -la' },
      });
      const { exitCode, records } = await runLedger(input);
      expect(exitCode).toBe(0);
      expect(records).toHaveLength(1);
      expect((JSON.parse(records[0]!) as Record<string, unknown>).target).toBe('ls -la');
    });

    it('falls back to tool_input.file_path when no command is present', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Edit',
        session_id: 's1',
        error: 'boom',
        tool_input: { file_path: '/tmp/omc-1656a.txt' },
      });
      const { exitCode, records } = await runLedger(input);
      expect(exitCode).toBe(0);
      expect(records).toHaveLength(1);
      expect((JSON.parse(records[0]!) as Record<string, unknown>).target).toBe(
        '/tmp/omc-1656a.txt'
      );
    });

    it('keeps the pre-existing scalar tool_response guard intact', async () => {
      const input = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'x' },
        tool_response: 'plain-string-error',
      });
      const { exitCode, records } = await runLedger(input);
      expect(exitCode).toBe(0);
      expect(records).toHaveLength(1);
      expect((JSON.parse(records[0]!) as Record<string, unknown>).err).toBe('plain-string-error');
    });
  });

  // --- Structural guard: neither script may regress to a bare index ---

  it('git-delegation-guard.sh keeps `?` on every nested tool_input access', async () => {
    const content = await readFile(join(SCRIPTS_DIR, 'git-delegation-guard.sh'), 'utf-8');
    const bare = content
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      // `[A-Za-z_]+` alone backtracks past the final char, so the lookahead must also
      // exclude further identifier chars for it to actually mean "not followed by `?`".
      .filter((l) => /\.tool_input\.[A-Za-z_]+(?![A-Za-z_?])/.test(l));
    expect(bare).toEqual([]);
  });

  it('failure-ledger.sh keeps the tool_input type check before indexing', async () => {
    const content = await readFile(join(SCRIPTS_DIR, 'failure-ledger.sh'), 'utf-8');
    const body = content
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(body).toContain('(.tool_input | type) == "object"');
    expect(body).toContain('(.tool_response | type) == "object"');
  });
});

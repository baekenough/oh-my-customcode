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

  it('should exit non-zero on malformed JSON due to set -euo pipefail', async () => {
    // The script uses set -euo pipefail; jq parse error causes non-zero exit.
    const result = await runHookScript(AGENT_TEAMS_ADVISOR_SCRIPT, 'not json');
    expect(result.exitCode).not.toBe(0);
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

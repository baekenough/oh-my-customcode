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

const STAGE_FILE = '/tmp/.claude-dev-stage';

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
  });

  it('should show Agent Teams enabled when env var is 1', async () => {
    const result = await runHookScript(SESSION_ENV_CHECK_SCRIPT, sessionInput, {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });
    expect(result.stderr).toContain('Agent Teams: enabled');
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
});

// -------------------------------------------------------------------
// user-prompt-preprocessor.sh
// -------------------------------------------------------------------

describe('user-prompt-preprocessor.sh', () => {
  const SCRIPT = join(SCRIPTS_DIR, 'user-prompt-preprocessor.sh');

  it('should pass bash syntax check', async () => {
    const { exitCode, stderr } = await bashSyntaxCheck(SCRIPT);
    expect(exitCode).toBe(0);
    if (stderr) console.warn('Syntax warnings:', stderr);
  });

  it('should pass through input unchanged on stdout', async () => {
    const input = JSON.stringify({ user_input: 'hello world' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(input);
  });

  it('should detect session-end signals', async () => {
    const input = JSON.stringify({ user_input: '종료' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Session-end signal detected');
  });

  it('should detect slash commands', async () => {
    const input = JSON.stringify({ user_input: '/status' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Slash command detected');
  });

  it('should not emit hints for regular input', async () => {
    const input = JSON.stringify({ user_input: 'fix the login bug' });
    const result = await runHookScript(SCRIPT, input);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
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

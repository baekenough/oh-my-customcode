import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Payload-shape conformance for the two hooks whose stdin selectors were written
// against a shape Claude Code does not actually send (#1656 B / #1656 C).
//
// Ground truth for this file comes from two measured sources, recorded here so a
// later reader can re-derive it rather than trusting the assertions:
//
//   1. The Claude Code 2.1.259 binary's embedded hook-input schema
//      (`~/.local/share/claude/versions/2.1.259`). SubagentStop is defined as:
//        base .and({ hook_event_name: "SubagentStop", stop_hook_active: boolean,
//                    agent_id: string, agent_transcript_path: string,
//                    agent_type: string, last_assistant_message?: string,
//                    background_tasks?: array, session_crons?: array })
//      where `base` = { session_id, transcript_path, cwd, prompt_id?,
//                       permission_mode?, agent_id?, agent_type?, effort?, ... }.
//      Note what is ABSENT: no `tool_input`, no `tool_output`, no `model`,
//      no `description`, no `prompt`, and no error signal of any kind.
//      PostToolUse in the same schema is:
//        base .and({ hook_event_name: "PostToolUse", tool_name, tool_input,
//                    tool_response, tool_use_id, duration_ms? })
//      — again with no top-level `agent_type` guaranteed and no top-level `model`.
//
//   2. This project's session transcript corpus (889 files, 458MB). It contains
//      ZERO SubagentStop hook records (hookEvent distribution: PreToolUse 1982,
//      PostToolUse 1976, Stop 1122, SessionStart 124, UserPromptSubmit 4), so the
//      SubagentStop fixtures below are schema-derived, not corpus-derived. The
//      PostToolUse fixtures ARE corpus-derived: `resolvedModel` appears 892 times
//      under the Agent tool's result object, alongside `agentId` / `agentType` /
//      `description` / `prompt` / `status`.

const SCRIPTS_DIR = resolve(import.meta.dir, '../../../templates/.claude/hooks/scripts');
const TASK_OUTCOME_RECORDER_SCRIPT = join(SCRIPTS_DIR, 'task-outcome-recorder.sh');
const AUDIT_LOG_SCRIPT = join(SCRIPTS_DIR, 'audit-log.sh');
const MODEL_ESCALATION_SCRIPT = join(SCRIPTS_DIR, 'model-escalation-advisor.sh');
const GIT_DELEGATION_GUARD_SCRIPT = join(SCRIPTS_DIR, 'git-delegation-guard.sh');

// task-outcome-recorder.sh appends to /tmp/.claude-task-outcomes-$PPID. runHookScript
// spawns bash directly from this bun process, so the script's $PPID is process.pid.
const OUTCOME_FILE = `/tmp/.claude-task-outcomes-${process.pid}`;
const TASK_COUNT_FILE = `/tmp/.claude-task-count-${process.pid}`;
const R010_VIOLATION_FILE = `/tmp/.claude-r010-violations-${process.pid}`;

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a hook script by spawning bash, piping `stdinInput`, and collecting its streams. */
function runHookScript(
  scriptPath: string,
  stdinInput: string,
  env?: Record<string, string>
): Promise<ScriptResult> {
  return new Promise((resolve_) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
    const child = spawn('bash', [scriptPath], { env: childEnv, cwd: tmpdir() });

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

/** Read the last JSONL entry the recorder appended, or `null` when it wrote nothing. */
async function lastOutcomeEntry(): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(OUTCOME_FILE, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
}

/**
 * Build a SubagentStop payload matching the 2.1.259 schema exactly — every required
 * field present, and deliberately NO `tool_input` / `tool_output` / `model`.
 */
function makeSubagentStopInput(extra?: Record<string, unknown>): string {
  return JSON.stringify({
    session_id: 'sess-shape-0001',
    transcript_path: '/tmp/parent-transcript.jsonl',
    cwd: '/Users/example/project',
    permission_mode: 'auto',
    hook_event_name: 'SubagentStop',
    stop_hook_active: false,
    agent_id: 'agent-shape-0001',
    agent_transcript_path: '/tmp/agent-transcript.jsonl',
    agent_type: 'lang-rust-expert',
    ...extra,
  });
}

/**
 * Build a PostToolUse payload for an Agent tool call, matching the corpus-measured
 * result shape (`resolvedModel` + `agentType` live under `tool_response`).
 */
function makeAgentPostToolUseInput(
  toolInput: Record<string, unknown>,
  toolResponse: unknown
): string {
  return JSON.stringify({
    session_id: 'sess-shape-0002',
    transcript_path: '/tmp/parent-transcript.jsonl',
    cwd: '/Users/example/project',
    permission_mode: 'auto',
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_use_id: 'toolu_shape_0002',
    duration_ms: 1234,
    tool_input: toolInput,
    tool_response: toolResponse,
  });
}

// -------------------------------------------------------------------
// #1656 B — task-outcome-recorder.sh vs the real SubagentStop payload
// -------------------------------------------------------------------
//
// The script is wired to SubagentStop and to nothing else (settings.json
// `hooks.SubagentStop[0]`), yet it read `.tool_input.subagent_type`,
// `.tool_input.description`, `.tool_input.prompt` and `.tool_output.is_error` —
// none of which exist on that event. Every recorded entry therefore carried an
// empty description, an empty skill and outcome=success regardless of what the
// subagent actually did. `last_assistant_message` is the one text-bearing field
// the event does carry, so the selectors fall back to it.
describe('#1656 B: task-outcome-recorder.sh SubagentStop payload conformance', () => {
  afterEach(async () => {
    await rm(OUTCOME_FILE, { force: true });
  });

  it('records agent_type from the top-level SubagentStop field', async () => {
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, makeSubagentStopInput());
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.agent_type).toBe('lang-rust-expert');
  });

  it('prefers the top-level agent_type over a stray tool_input.subagent_type', async () => {
    const input = makeSubagentStopInput({ tool_input: { subagent_type: 'stale-shape' } });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.agent_type).toBe('lang-rust-expert');
  });

  it('falls back to last_assistant_message for the description', async () => {
    const input = makeSubagentStopInput({
      last_assistant_message: 'Refactored the parser and all 12 tests pass.',
    });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.description).toContain('Refactored the parser');
  });

  it('extracts a skill name from last_assistant_message', async () => {
    const input = makeSubagentStopInput({
      last_assistant_message: 'Skill: systematic-debugging applied to the failing case.',
    });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.skill).toBe('systematic-debugging');
  });

  it('truncates an oversized last_assistant_message instead of storing it whole', async () => {
    const input = makeSubagentStopInput({ last_assistant_message: 'z'.repeat(5000) });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect((entry?.description as string).length).toBeLessThanOrEqual(200);
  });

  // --- Degenerate shapes must never crash the hook (R021: hooks never block) ---

  it('exits 0 when the payload carries no text-bearing field at all', async () => {
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, makeSubagentStopInput());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(makeSubagentStopInput());
  });

  it('exits 0 when agent_type arrives as a scalar number', async () => {
    const input = makeSubagentStopInput({ agent_type: 42 });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 when last_assistant_message arrives as an object', async () => {
    const input = makeSubagentStopInput({ last_assistant_message: { unexpected: 'shape' } });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 when tool_input arrives as a string scalar', async () => {
    const input = makeSubagentStopInput({ tool_input: 'not-an-object' });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 and writes nothing on non-object stdin', async () => {
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, 'not json at all');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});

// -------------------------------------------------------------------
// #1656 C — audit-log.sh agent_type / model always logged as "unknown"
// -------------------------------------------------------------------
//
// PostToolUse has no top-level `agent_type` on the main thread (the schema marks it
// optional and present only inside a subagent) and no top-level `model` at all, so
// both reads resolved to "unknown" on every entry. The Agent tool's `tool_response`
// carries the real values: `resolvedModel` (892 corpus occurrences) and `agentType`.
describe('#1656 C: audit-log.sh agent_type / model resolution', () => {
  let auditHome: string;

  /** Run audit-log.sh against a throwaway HOME so the real ~/.claude/audit.jsonl is untouched. */
  async function runAuditLog(input: string): Promise<ScriptResult> {
    auditHome = await mkdtemp(join(tmpdir(), 'sh-audit-'));
    return runHookScript(AUDIT_LOG_SCRIPT, input, { HOME: auditHome });
  }

  /** Read the last entry audit-log.sh appended under the throwaway HOME. */
  async function lastAuditEntry(): Promise<Record<string, unknown> | null> {
    let raw: string;
    try {
      raw = await readFile(join(auditHome, '.claude', 'audit.jsonl'), 'utf-8');
    } catch {
      return null;
    }
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
  }

  afterEach(async () => {
    if (auditHome) await rm(auditHome, { recursive: true, force: true });
  });

  it('resolves model from tool_response.resolvedModel', async () => {
    const input = makeAgentPostToolUseInput(
      { subagent_type: 'lang-golang-expert', description: 'review' },
      { agentId: 'agent-1', resolvedModel: 'claude-opus-5[1m]', status: 'completed' }
    );
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.model).toBe('claude-opus-5[1m]');
  });

  it('resolves agent_type from tool_input.subagent_type', async () => {
    const input = makeAgentPostToolUseInput(
      { subagent_type: 'lang-golang-expert', description: 'review' },
      { agentId: 'agent-1', resolvedModel: 'claude-sonnet-5', status: 'completed' }
    );
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.agent_type).toBe('lang-golang-expert');
  });

  it('resolves agent_type from tool_response.agentType when tool_input lacks it', async () => {
    const input = makeAgentPostToolUseInput(
      { description: 'review' },
      { agentId: 'agent-1', agentType: 'qa-engineer', resolvedModel: 'claude-sonnet-5' }
    );
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.agent_type).toBe('qa-engineer');
  });

  it('prefers a top-level agent_type when the hook fires inside a subagent', async () => {
    const base = JSON.parse(
      makeAgentPostToolUseInput(
        { subagent_type: 'stale-shape' },
        { resolvedModel: 'claude-sonnet-5' }
      )
    ) as Record<string, unknown>;
    const result = await runAuditLog(
      JSON.stringify({ ...base, agent_id: 'agent-9', agent_type: 'mgr-gitnerd' })
    );
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.agent_type).toBe('mgr-gitnerd');
  });

  it('still records "unknown" when no agent or model signal is present', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/x.txt' },
      tool_response: { file: { content: 'hello' } },
    });
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.agent_type).toBe('unknown');
    expect(entry?.model).toBe('unknown');
  });

  it('exits 0 and records "unknown" when tool_response is a bare string', async () => {
    const input = makeAgentPostToolUseInput({ subagent_type: 'qa-planner' }, 'plain string result');
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.agent_type).toBe('qa-planner');
    expect(entry?.model).toBe('unknown');
  });

  it('exits 0 when tool_input is a scalar', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: 'not-an-object',
      tool_response: { resolvedModel: 'claude-haiku-4-5-20251001' },
    });
    const result = await runAuditLog(input);
    expect(result.exitCode).toBe(0);

    const entry = await lastAuditEntry();
    expect(entry?.model).toBe('claude-haiku-4-5-20251001');
  });
});

// -------------------------------------------------------------------
// #1656 D — task-outcome-recorder.sh pattern detection input scope
// -------------------------------------------------------------------
//
// `$description` now falls back to `last_assistant_message`, i.e. free-form LLM
// prose written by the subagent itself. Feeding that into the pattern cascade
// mislabels any run whose closing summary happens to say "parallel" or
// "orchestrator". Pattern detection must read ONLY the spawn argument
// (`tool_input.description`); with no spawn argument the honest value is
// "unknown", not a fabricated "sequential".
describe('#1656 D: task-outcome-recorder.sh pattern detection reads only the spawn argument', () => {
  beforeEach(async () => {
    await rm(OUTCOME_FILE, { force: true });
    await rm(TASK_COUNT_FILE, { force: true });
  });

  afterEach(async () => {
    await rm(OUTCOME_FILE, { force: true });
    await rm(TASK_COUNT_FILE, { force: true });
  });

  it('detects parallel from tool_input.description (spawn argument)', async () => {
    const input = makeAgentPostToolUseInput(
      { subagent_type: 'qa-engineer', description: '[1] Parallel review of the parser' },
      { resolvedModel: 'claude-sonnet-5', status: 'completed' }
    );
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.pattern_used).toBe('parallel');
  });

  it('does not classify from last_assistant_message prose', async () => {
    const input = makeSubagentStopInput({
      last_assistant_message: 'I ran the parallel orchestrator pipeline and everything passed.',
    });
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    // The prose is still recorded as the description — it is simply not a pattern signal.
    expect(entry?.description).toContain('parallel orchestrator');
    expect(entry?.pattern_used).not.toBe('parallel');
    expect(entry?.pattern_used).not.toBe('orchestrator');
    expect(entry?.pattern_used).toBe('unknown');
  });

  it('records sequential when the spawn argument carries no pattern keyword', async () => {
    const input = makeAgentPostToolUseInput(
      { subagent_type: 'qa-engineer', description: 'Fix the failing assertion' },
      { resolvedModel: 'claude-sonnet-5', status: 'completed' }
    );
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, input);
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.pattern_used).toBe('sequential');
  });

  it('keeps the session agent-count signal (non-prose) as a parallel inference', async () => {
    await writeFile(TASK_COUNT_FILE, '3\n');
    const result = await runHookScript(TASK_OUTCOME_RECORDER_SCRIPT, makeSubagentStopInput());
    expect(result.exitCode).toBe(0);

    const entry = await lastOutcomeEntry();
    expect(entry?.pattern_used).toBe('parallel');
  });
});

// -------------------------------------------------------------------
// #1656 E — model-escalation-advisor.sh `grep -c` count hygiene
// -------------------------------------------------------------------
//
// `grep -c` prints `0` AND exits 1 when nothing matches, so `$(grep -c ... || echo "0")`
// produced the two-line value "0\n0". Every later `[ "$count" -ge N ]` then emitted
// "integer expression expected" to stderr — advisory noise indistinguishable from a
// real hook failure.
describe('#1656 E: model-escalation-advisor.sh emits no integer-expression noise', () => {
  function makePreToolUseAgentInput(toolInput: Record<string, unknown>): string {
    return JSON.stringify({
      session_id: 'sess-shape-0003',
      transcript_path: '/tmp/parent-transcript.jsonl',
      cwd: '/Users/example/project',
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: toolInput,
    });
  }

  async function seedLedger(entries: Array<Record<string, unknown>>): Promise<void> {
    await writeFile(OUTCOME_FILE, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
  }

  beforeEach(async () => {
    await rm(OUTCOME_FILE, { force: true });
  });

  afterEach(async () => {
    await rm(OUTCOME_FILE, { force: true });
  });

  it('escalates on an all-failure ledger without integer-expression errors', async () => {
    await seedLedger([
      { agent_type: 'qa-engineer', outcome: 'failure' },
      { agent_type: 'qa-engineer', outcome: 'failure' },
      { agent_type: 'qa-engineer', outcome: 'failure' },
    ]);
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('integer expression expected');
    expect(result.stderr).toContain('Model Escalation Advisory');
  });

  it('stays silent, and error-free, on a ledger with no matching failures', async () => {
    await seedLedger([{ agent_type: 'mgr-gitnerd', outcome: 'success' }]);
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'haiku' })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('still de-escalates after a run of successes', async () => {
    await seedLedger(
      Array.from({ length: 5 }, () => ({ agent_type: 'qa-engineer', outcome: 'success' }))
    );
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('integer expression expected');
    expect(result.stderr).toContain('De-escalation Advisory');
  });
});

// -------------------------------------------------------------------
// #1656 F — git-delegation-guard.sh non-object stdin guard
// -------------------------------------------------------------------
//
// Every sibling hook swallows non-object stdin instead of echoing it back; this one
// did not, so garbage on stdin was reflected verbatim to stdout.
describe('#1656 F: git-delegation-guard.sh stdin guard and advisory behaviour', () => {
  beforeEach(async () => {
    await rm(R010_VIOLATION_FILE, { force: true });
  });

  afterEach(async () => {
    await rm(R010_VIOLATION_FILE, { force: true });
  });

  function makeSpawnInput(subagentType: string, prompt: string): string {
    return JSON.stringify({
      session_id: 'sess-shape-0004',
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: subagentType, prompt },
    });
  }

  it('warns when a git operation is delegated to a non-mgr-gitnerd agent', async () => {
    const input = makeSpawnInput('lang-rust-expert', 'Please git commit the refactor.');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('R010 violation detected');
    expect(result.stdout.trim()).toBe(input);
  });

  it('stays silent when the delegate is mgr-gitnerd', async () => {
    const input = makeSpawnInput('mgr-gitnerd', 'Please git commit the refactor.');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe(input);
  });

  it('exits 0 and writes nothing on non-object stdin', async () => {
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, 'not json at all');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('exits 0 and writes nothing on a JSON array', async () => {
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, '[1, 2, 3]');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});

// -------------------------------------------------------------------
// #1656 A — header comments must state measured facts, not inferred ones
// -------------------------------------------------------------------
//
// Adversarial review found three comment claims that outran the measurement:
// a failure-reporting hand-off that does not fire, a line count that was wrong,
// and a "measured failure signal" label on a field never observed true.
describe('#1656 A: hook header comments state measured facts', () => {
  it('task-outcome-recorder.sh does not claim subagent-failure-advisor.sh reports failures', async () => {
    const source = await readFile(TASK_OUTCOME_RECORDER_SCRIPT, 'utf-8');
    expect(source).not.toContain('reported separately by subagent-failure-advisor.sh');
    expect(source).toContain('#1656 G');
  });

  it('task-outcome-recorder.sh states the measured pretty-printed line count', async () => {
    const source = await readFile(TASK_OUTCOME_RECORDER_SCRIPT, 'utf-8');
    expect(source).not.toContain('spans 9 lines');
    expect(source).toContain('spans 11 lines');
  });

  it('audit-log.sh does not label `interrupted` a measured failure signal', async () => {
    const source = await readFile(AUDIT_LOG_SCRIPT, 'utf-8');
    expect(source).not.toContain('Measured failure signals');
    expect(source).toContain('0/1555');
  });
});

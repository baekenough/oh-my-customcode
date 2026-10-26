import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
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
// #1885: model-escalation-advisor.sh shows each distinct advisory key once per session
// (state keyed by $PPID = this bun process, shared by every test file in the run).
// Atomic per-key marker DIRECTORY: one entry per shown key (cksum of the key).
// #1885: count-line marker dir of git-delegation-guard.sh (claimed once per session).
const R010_THRESHOLD_DIR = `/tmp/.claude-r010-threshold-${process.pid}`;
const MODEL_ADVISORY_SHOWN_DIR = `/tmp/.claude-model-advisory-shown-${process.pid}.d`;

// runHookScript resolves on child close, after audit-log's final performance write.
afterEach(async () => {
  await rm(`/tmp/.claude-hook-perf-${process.pid}.log`, { force: true });
});

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface PreToolUseAdvisory {
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
}

/**
 * #1885: a PreToolUse advisory hook that fires prints exactly one line of JSON on stdout
 * (`hookSpecificOutput.additionalContext`), nothing on stderr, and exits 0. Asserts that
 * contract and returns the additionalContext text for content assertions.
 */
function preToolUseContext(result: ScriptResult): string {
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout.endsWith('\n')).toBe(true);
  expect(result.stdout.trimEnd().split('\n')).toHaveLength(1);
  const parsed = JSON.parse(result.stdout.trim()) as PreToolUseAdvisory;
  expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  expect(typeof parsed.hookSpecificOutput.additionalContext).toBe('string');
  return parsed.hookSpecificOutput.additionalContext;
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

  // De-escalation is opt-in via OMCUSTOM_MODEL_DEESCALATION=on. A developer shell that already
  // exports it would change the "default" cases, so it is scrubbed here and restored after.
  let savedDeescalationEnv: string | undefined;
  const DEESC_ON = { OMCUSTOM_MODEL_DEESCALATION: 'on' };

  beforeEach(async () => {
    savedDeescalationEnv = process.env.OMCUSTOM_MODEL_DEESCALATION;
    delete process.env.OMCUSTOM_MODEL_DEESCALATION;
    await rm(OUTCOME_FILE, { force: true });
    await rm(MODEL_ADVISORY_SHOWN_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (savedDeescalationEnv === undefined) {
      delete process.env.OMCUSTOM_MODEL_DEESCALATION;
    } else {
      process.env.OMCUSTOM_MODEL_DEESCALATION = savedDeescalationEnv;
    }
    await rm(OUTCOME_FILE, { force: true });
    await rm(MODEL_ADVISORY_SHOWN_DIR, { recursive: true, force: true });
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

    // #1885: the advisory travels as additionalContext JSON on stdout; stderr stays empty,
    // which also proves no integer-expression noise leaks there.
    expect(preToolUseContext(result)).toContain('Model Escalation Advisory');
  });

  it('stays silent, and error-free, on a ledger with no matching failures', async () => {
    await seedLedger([{ agent_type: 'mgr-gitnerd', outcome: 'success' }]);
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'haiku' })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('still de-escalates after a run of successes when OMCUSTOM_MODEL_DEESCALATION=on', async () => {
    await seedLedger(
      Array.from({ length: 5 }, () => ({ agent_type: 'qa-engineer', outcome: 'success' }))
    );
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' }),
      DEESC_ON
    );

    expect(preToolUseContext(result)).toContain('De-escalation Advisory');
  });

  it('is silent about de-escalation by default (opt-in), even after a run of successes', async () => {
    await seedLedger(
      Array.from({ length: 5 }, () => ({ agent_type: 'qa-engineer', outcome: 'success' }))
    );
    const input = makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' });

    for (const env of [
      {},
      { OMCUSTOM_MODEL_DEESCALATION: '' },
      { OMCUSTOM_MODEL_DEESCALATION: 'off' },
    ]) {
      const result = await runHookScript(MODEL_ESCALATION_SCRIPT, input, env);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    }
    // Nothing was claimed either.
    expect(existsSync(MODEL_ADVISORY_SHOWN_DIR)).toBe(false);
  });

  it('stays silent (empty stdout and stderr, exit 0) when no outcome ledger exists', async () => {
    const result = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  // --- Once per session (#1885): each distinct key is shown at most once ---

  const FAILURES_FOR_QA = [
    { agent_type: 'qa-engineer', outcome: 'failure' },
    { agent_type: 'qa-engineer', outcome: 'failure' },
    { agent_type: 'qa-engineer', outcome: 'failure' },
  ];

  it('shows the escalation advisory once: the second identical run is silent', async () => {
    await seedLedger(FAILURES_FOR_QA);
    const input = makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' });

    const first = await runHookScript(MODEL_ESCALATION_SCRIPT, input);
    expect(preToolUseContext(first)).toContain('Model Escalation Advisory');
    // One marker dir entry for the claimed key.
    expect(readdirSync(MODEL_ADVISORY_SHOWN_DIR)).toHaveLength(1);

    const second = await runHookScript(MODEL_ESCALATION_SCRIPT, input);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe('');
    expect(second.stderr).toBe('');
    expect(readdirSync(MODEL_ADVISORY_SHOWN_DIR)).toHaveLength(1);
  });

  it('still emits for a different escalation key (other model, other agent)', async () => {
    await seedLedger([
      ...FAILURES_FOR_QA,
      ...FAILURES_FOR_QA.map((e) => ({ ...e, agent_type: 'be-fastapi-expert' })),
    ]);

    const sonnet = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' })
    );
    expect(preToolUseContext(sonnet)).toContain('Escalate to opus');

    // Different `from`->`to` pair: esc:qa-engineer:haiku->sonnet
    const haiku = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'haiku' })
    );
    expect(preToolUseContext(haiku)).toContain('Escalate to sonnet');

    // Different agent: esc:be-fastapi-expert:sonnet->opus
    const other = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'be-fastapi-expert', model: 'sonnet' })
    );
    expect(preToolUseContext(other)).toContain('be-fastapi-expert');

    // Three distinct keys -> three marker entries; a repeat of the first stays silent.
    expect(readdirSync(MODEL_ADVISORY_SHOWN_DIR)).toHaveLength(3);
    const repeat = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' })
    );
    expect(repeat.stdout).toBe('');
    expect(readdirSync(MODEL_ADVISORY_SHOWN_DIR)).toHaveLength(3);
  });

  it('shows the de-escalation advisory once, and emits again for a different from->to pair', async () => {
    await seedLedger(
      Array.from({ length: 5 }, () => ({ agent_type: 'qa-engineer', outcome: 'success' }))
    );

    const first = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' }),
      DEESC_ON
    );
    expect(preToolUseContext(first)).toContain('De-escalation Advisory');

    const again = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' }),
      DEESC_ON
    );
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toBe('');
    expect(again.stderr).toBe('');

    // deesc:opus->sonnet is a different key
    const opus = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'opus' }),
      DEESC_ON
    );
    expect(preToolUseContext(opus)).toContain('opus → sonnet');

    expect(readdirSync(MODEL_ADVISORY_SHOWN_DIR)).toHaveLength(2);
  });

  it('fails open: still emits (rc 0, empty stderr) when the marker dir cannot be created', async () => {
    // A regular file at the marker-dir path makes `mkdir -p` fail.
    await writeFile(MODEL_ADVISORY_SHOWN_DIR, 'not a directory');
    await seedLedger(FAILURES_FOR_QA);
    const input = makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' });

    for (let i = 0; i < 2; i++) {
      const result = await runHookScript(MODEL_ESCALATION_SCRIPT, input);
      expect(preToolUseContext(result)).toContain('Model Escalation Advisory');
    }
  });

  it('an agent_type with an embedded newline cannot suppress a later legitimate key', async () => {
    // Under the old line-based shown file, a key containing "\ndeesc:sonnet->haiku\n" would
    // have written a line that equals the legitimate de-escalation key and silenced it.
    await seedLedger(FAILURES_FOR_QA);
    const poisoned = makePreToolUseAgentInput({
      subagent_type: 'x\ndeesc:sonnet->haiku\nz',
      model: 'sonnet',
    });
    expect(preToolUseContext(await runHookScript(MODEL_ESCALATION_SCRIPT, poisoned))).toContain(
      'Model Escalation Advisory'
    );

    await seedLedger(
      Array.from({ length: 5 }, () => ({ agent_type: 'qa-engineer', outcome: 'success' }))
    );
    const legitimate = await runHookScript(
      MODEL_ESCALATION_SCRIPT,
      makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' }),
      DEESC_ON
    );
    expect(preToolUseContext(legitimate)).toContain('De-escalation Advisory');
  });

  // --- Boundary pins for the hard-coded constants ---
  //
  // NOTE: in production the recorder (task-outcome-recorder.sh) only ever sees SubagentStop, which
  // carries no error signal, so it NEVER writes outcome=failure. The escalation branch below is
  // therefore currently unreachable from real sessions (the docs say so too); these tests pin the
  // thresholds so they stay correct if a failure source is ever wired in.
  //
  // Ledger lines use the exact shape task-outcome-recorder.sh appends (`jq -cn`, insertion order:
  // timestamp, agent_type, model, outcome, pattern_used, skill, description, error_summary,
  // duration_seconds), because the advisor greps `"agent_type":"X".*"outcome":"failure"`.

  function outcome(agent: string, result: 'success' | 'failure'): Record<string, unknown> {
    return {
      timestamp: '2026-10-26T00:00:00Z',
      agent_type: agent,
      model: 'sonnet',
      outcome: result,
      pattern_used: 'single',
      skill: '',
      description: 'boundary fixture',
      error_summary: '',
      duration_seconds: 1,
    };
  }
  const sonnetInput = (agent: string) =>
    makePreToolUseAgentInput({ subagent_type: agent, model: 'sonnet' });

  async function runAdvisor(agent: string, env?: Record<string, string>) {
    return runHookScript(MODEL_ESCALATION_SCRIPT, sonnetInput(agent), env);
  }

  describe('FAILURE_THRESHOLD = 2 (per agent type)', () => {
    it('1 failure of the agent type is silent', async () => {
      await seedLedger([
        outcome('qa-engineer', 'failure'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
      ]);
      const result = await runAdvisor('qa-engineer');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('2 failures of the agent type fire, with the per-type reason', async () => {
      await seedLedger([
        outcome('qa-engineer', 'failure'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'failure'),
      ]);
      const context = preToolUseContext(await runAdvisor('qa-engineer'));
      expect(context).toContain('Model Escalation Advisory');
      expect(context).toContain('Reason: qa-engineer failed 2x with sonnet');
    });

    it('failures of ANOTHER agent type do not count toward the per-type threshold', async () => {
      // Two failures, but both belong to other agents, and they are not in the last 3 entries.
      await seedLedger([
        outcome('be-fastapi-expert', 'failure'),
        outcome('be-fastapi-expert', 'failure'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
        outcome('qa-engineer', 'success'),
      ]);
      const result = await runAdvisor('qa-engineer');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });
  });

  describe('CONSECUTIVE_THRESHOLD = 3 (last 3 entries, any agent)', () => {
    it('2 failures in the last 3 entries (other agent, none for this type) are silent', async () => {
      await seedLedger([
        outcome('be-fastapi-expert', 'success'),
        outcome('be-fastapi-expert', 'failure'),
        outcome('be-fastapi-expert', 'failure'),
        outcome('be-fastapi-expert', 'success'),
      ]);
      expect((await runAdvisor('qa-engineer')).stdout).toBe('');
    });

    it('3 failures in the last 3 entries fire, with the consecutive reason', async () => {
      await seedLedger([
        outcome('be-fastapi-expert', 'success'),
        outcome('be-fastapi-expert', 'failure'),
        outcome('be-fastapi-expert', 'failure'),
        outcome('be-fastapi-expert', 'failure'),
      ]);
      const context = preToolUseContext(await runAdvisor('qa-engineer'));
      expect(context).toContain('Reason: 3 consecutive failures');
    });
  });

  describe('COOLDOWN = 5 (de-escalation, opt-in)', () => {
    it('4 successes in the last 5 entries are silent even with the opt-in on', async () => {
      await seedLedger(Array.from({ length: 4 }, () => outcome('qa-engineer', 'success')));
      const result = await runAdvisor('qa-engineer', DEESC_ON);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('4 successes preceded by a failure (5 entries, 4 successes) are silent', async () => {
      await seedLedger([
        outcome('qa-engineer', 'failure'),
        ...Array.from({ length: 4 }, () => outcome('qa-engineer', 'success')),
      ]);
      expect((await runAdvisor('qa-engineer', DEESC_ON)).stdout).toBe('');
    });

    it('5 successes fire with the opt-in on', async () => {
      await seedLedger(Array.from({ length: 5 }, () => outcome('qa-engineer', 'success')));
      const context = preToolUseContext(await runAdvisor('qa-engineer', DEESC_ON));
      expect(context).toContain('De-escalation Advisory');
      expect(context).toContain('5 consecutive successes');
    });
  });

  it('does not echo the stdin payload to stdout when it advises', async () => {
    await seedLedger([
      { agent_type: 'qa-engineer', outcome: 'failure' },
      { agent_type: 'qa-engineer', outcome: 'failure' },
      { agent_type: 'qa-engineer', outcome: 'failure' },
    ]);
    const input = makePreToolUseAgentInput({ subagent_type: 'qa-engineer', model: 'sonnet' });
    const result = await runHookScript(MODEL_ESCALATION_SCRIPT, input);

    preToolUseContext(result);
    expect(result.stdout.trim()).not.toBe(input);
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
    await rm(R010_THRESHOLD_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(R010_VIOLATION_FILE, { force: true });
    await rm(R010_THRESHOLD_DIR, { recursive: true, force: true });
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

    const context = preToolUseContext(result);
    expect(context).toContain("mentions 'git commit'");
    expect(context).toContain('R010');
    expect(result.stdout.trim()).not.toBe(input);
  });

  it('stays silent when the delegate is mgr-gitnerd', async () => {
    const input = makeSpawnInput('mgr-gitnerd', 'Please git commit the refactor.');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('stays silent when the git keyword sits in a prohibition (excluded occurrence)', async () => {
    const input = makeSpawnInput('lang-rust-expert', 'Forbidden: git commit, push.');
    const result = await runHookScript(GIT_DELEGATION_GUARD_SCRIPT, input);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
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

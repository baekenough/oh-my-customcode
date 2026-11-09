---
name: model-escalation
description: Advisory model escalation based on task outcome tracking
scope: core
user-invocable: false
---

# Model Escalation Skill

Tracks task outcomes and advises model upgrades when failures are detected. **Advisory-only** — the orchestrator makes the final decision (R010).

## Escalation Path

```
haiku → sonnet → opus
```

## Trigger Conditions

| Condition | Action |
|-----------|--------|
| 2+ recorded failures for the same agent type (any model; evaluated only for haiku/sonnet spawns) | Advise escalation |
| 3+ consecutive failures across any agent type | Advise escalation (per spawn, not global; only when the spawn's `model` parameter is haiku or sonnet) |
| Sustained consecutive successes (ledger rows carry model `inherit`, so "after escalation" cannot be distinguished) | Advise de-escalation (opt-in: `OMCUSTOM_MODEL_DEESCALATION=on`) |

## Thresholds

Hard-coded in `model-escalation-advisor.sh` (not configurable via frontmatter or settings):

| Constant | Value | Description |
|----------|-------|-------------|
| `FAILURE_THRESHOLD` | 2 | Failures before escalation advisory |
| `CONSECUTIVE_THRESHOLD` | 3 | Consecutive failures for the per-spawn advisory |
| `COOLDOWN` | 5 | Successes before de-escalation advisory (opt-in only) |

Each distinct advisory is shown at most once per session (atomic per-key marker dir `/tmp/.claude-model-advisory-shown-${PPID}.d/`). De-escalation is off by default because, as wired (SubagentStop carries no failure signal), the ledger writer (`task-outcome-recorder.sh`) records success only, so consecutive successes carry no signal. The writer still contains an `outcome="failure"` branch (`is_error == true`) that this wiring never reaches.

## Cost Guard

- Advisory includes estimated cost multiplier
- De-escalation (opt-in via `OMCUSTOM_MODEL_DEESCALATION=on`) suggested after `COOLDOWN` consecutive success rows while the spawn `model` parameter is `opus` or `sonnet` (`model-escalation-advisor.sh` de-escalation block: the outer gate only excludes haiku, inherit and empty, but its `case` yields a lower model solely for opus→sonnet and sonnet→haiku, so any other value such as `fable` passes the gate and still gets no advisory)
- The cost multiplier in the advisory is derived from the model tier by `model-escalation-advisor.sh`; ledger rows (PPID-scoped temp file) have no cost field

## Architecture

```
SubagentStop → task-outcome-recorder.sh (the only wiring; not PostToolUse)
  Records: agent_type, model ("inherit"), outcome (as wired, the ledger writer records success only, so the escalation advisory is unreachable)
  Storage: /tmp/.claude-task-outcomes-$PPID (JSON lines, max 50)

PreToolUse (Task) → model-escalation-advisor.sh
  Reads outcomes → counts failures → advises escalation via additionalContext
  Advisory only — never blocks, never modifies tool input
```

## Advisory Format

```
--- [Model Escalation Advisory] ---
  Agent type: {agent_type}
  Current model: {current_model}
  ⚡ Recommended: Escalate to {next_model}
  Cost impact: {multiplier} per task
  Reason: {reason}
------------------------------------
```

## Probe Record (#1912)

Measured on CC 2.1.318 with `claude -p` and a haiku model:

- `PostToolUseFailure` fired for a spawn error (unknown `subagent_type`) and for a subagent terminated by an API error after `SubagentStart`.
- It did not fire when the subagent exceeded its `maxTurns` (two runs, both `maxTurns=1`: foreground, `PostToolUse` reported `status=completed`; default run, `PostToolUse` reported `status=async_launched`).
- Not observed: a failure after several successful turns, and interactive sessions.
- Nothing writes these failures to the ledger (the proposal to add a failure-row writer was closed in #1912 without implementation).

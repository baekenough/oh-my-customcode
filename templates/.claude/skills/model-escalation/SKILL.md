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
| Sustained success after escalation | Advise de-escalation (opt-in: `OMCUSTOM_MODEL_DEESCALATION=on`) |

## Thresholds

Hard-coded in `model-escalation-advisor.sh` (not configurable via frontmatter or settings):

| Constant | Value | Description |
|----------|-------|-------------|
| `FAILURE_THRESHOLD` | 2 | Failures before escalation advisory |
| `CONSECUTIVE_THRESHOLD` | 3 | Consecutive failures for the per-spawn advisory |
| `COOLDOWN` | 5 | Successes before de-escalation advisory (opt-in only) |

Each distinct advisory is shown at most once per session (atomic per-key marker dir `/tmp/.claude-model-advisory-shown-${PPID}.d/`). De-escalation is off by default because `task-outcome-recorder.sh` records every subagent completion as success, so consecutive successes carry no signal.

## Cost Guard

- Advisory includes estimated cost multiplier
- De-escalation (opt-in via `OMCUSTOM_MODEL_DEESCALATION=on`) suggested after sustained success at higher tier
- Cost tracked per session via PPID-scoped temp file

## Architecture

```
SubagentStop → task-outcome-recorder.sh (the only wiring; not PostToolUse)
  Records: agent_type, model ("inherit"), outcome (always success; no failure signal, so the escalation advisory is currently unreachable)
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
  Recent failures: {count}/{threshold}
  ⚡ Recommended: Escalate to {next_model}
  Cost impact: {multiplier} per task
---
```

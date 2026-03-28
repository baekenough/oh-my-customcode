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
| 2+ failures with same model for same agent type | Advise escalation |
| 3+ consecutive failures across any agent type | Advise global escalation |
| Sustained success after escalation | Advise de-escalation |

## Thresholds

| Parameter | Default | Description |
|-----------|---------|-------------|
| `failure_threshold` | 2 | Failures before escalation advisory |
| `consecutive_threshold` | 3 | Consecutive failures for global advisory |
| `cooldown_tasks` | 5 | Successes before de-escalation advisory |

## Cost Guard

- Advisory includes estimated cost multiplier
- De-escalation suggested after sustained success at higher tier
- Cost tracked per session via PPID-scoped temp file

## Architecture

```
PostToolUse (Task) → task-outcome-recorder.sh
  Records: agent_type, model, success/failure, error_summary
  Storage: /tmp/.claude-task-outcomes-$PPID (JSON lines, max 50)

PreToolUse (Task) → model-escalation-advisor.sh
  Reads outcomes → counts failures → advises escalation via stderr
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

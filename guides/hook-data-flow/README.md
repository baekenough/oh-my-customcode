# Hook Data Flow: Stall Detection Pipeline

Added in v0.78.0. Documents the three-script pipeline that detects stalled parallel agents and emits R009 Adaptive Parallel Splitting advisories.

Related rule: `.claude/rules/MUST-parallel-execution.md` (R009 Adaptive Parallel Splitting section)

---

## Overview

When multiple agents run in parallel, one agent may take significantly longer than its peers. The stall detection pipeline identifies this condition at the moment any agent completes and advises the orchestrator to spawn independent pending tasks immediately — without cancelling the stalled agent.

The pipeline spans two hook events and three scripts:

| Event | Script | Role |
|-------|--------|------|
| SubagentStart | `agent-start-recorder.sh` | Record spawn timestamp |
| SubagentStop (1st) | `task-outcome-recorder.sh` | Read start time, record outcome with duration |
| SubagentStop (2nd) | `stall-detection-advisor.sh` | Read start times, compare durations, emit advisory, consume start entry |

---

## Data Flow

```
SubagentStart event
  └─ agent-start-recorder.sh
       reads:  stdin JSON (agent_type, model, description)
       writes: /tmp/.claude-agent-starts-$PPID  (appends 1 JSON line)

SubagentStop event  [hooks execute in array order — ordering is critical]
  │
  ├─ [1] task-outcome-recorder.sh
  │       reads:  stdin JSON (agent_type, model, outcome)
  │       reads:  /tmp/.claude-agent-starts-$PPID  (duration calc — entry still present)
  │       writes: /tmp/.claude-task-outcomes-$PPID  (appends 1 JSON line with duration_seconds)
  │       writes: stderr  (on failure only)
  │
  └─ [2] stall-detection-advisor.sh
          reads:  stdin JSON (agent_type, model, description)
          reads:  /tmp/.claude-agent-starts-$PPID  (finds matching start entry for duration)
          reads:  /tmp/.claude-agent-durations-$PPID  (peer durations for average calculation)
          writes: /tmp/.claude-agent-durations-$PPID  (appends completed agent's duration)
          writes: /tmp/.claude-agent-starts-$PPID  (removes consumed start entry)
          writes: stderr  (advisory block if stall detected — R021 advisory-only)
```

### Stall Detection Logic

At SubagentStop, after at least one peer has already completed:

1. Calculate `avg_duration` from all entries in `.claude-agent-durations-$PPID`
2. Set `stall_threshold = avg_duration * 2`
3. Scan `.claude-agent-starts-$PPID` for agents not yet in the duration file (still running)
4. For each still-running agent where `elapsed > stall_threshold`, emit advisory to stderr

The current agent's duration is recorded *after* stall detection so it does not inflate the average for its own check.

### Advisory Output Format

```
─── [Stall Detection Advisory] ───────────────────────────
  Stalled: {agent_type}:{model} ({elapsed}s elapsed, 2x avg {avg_duration}s)
  Description: {description}
  ⚡ Consider spawning independent pending tasks immediately
  R009 Adaptive Parallel Splitting applies
──────────────────────────────────────────────────────────
```

---

## Shared Files

| File | Writer | Readers | Lifecycle |
|------|--------|---------|-----------|
| `/tmp/.claude-agent-starts-$PPID` | `agent-start-recorder.sh` (append) | `task-outcome-recorder.sh` (read), `stall-detection-advisor.sh` (read + remove entry) | Session-scoped via PPID; ring buffer 50 entries; entry removed after `stall-detection-advisor` consumes it |
| `/tmp/.claude-task-outcomes-$PPID` | `task-outcome-recorder.sh` (append) | `feedback-collector.sh`, `eval-core-batch-save.sh` (at Stop) | Session-scoped via PPID; ring buffer 50 entries |
| `/tmp/.claude-agent-durations-$PPID` | `stall-detection-advisor.sh` (append) | `stall-detection-advisor.sh` (read for average calculation) | Session-scoped via PPID; ring buffer 50 entries |

---

## Execution Order Requirements

The SubagentStop hook array in `hooks.json` defines a strict ordering:

```json
"SubagentStop": [
  { "command": "bash .claude/hooks/scripts/task-outcome-recorder.sh" },
  { "command": "bash .claude/hooks/scripts/stall-detection-advisor.sh" },
  ...
]
```

**task-outcome-recorder MUST run before stall-detection-advisor.**

Reason: `stall-detection-advisor.sh` removes the matching start entry from `.claude-agent-starts-$PPID` after reading it (to prevent re-matching on the next SubagentStop). If the order were reversed, `task-outcome-recorder.sh` would find no start entry for the agent and would always record `duration_seconds=0`.

If the order is swapped:
- `task-outcome-recorder` records `duration_seconds=0` for all agents
- Model escalation decisions based on duration become unreliable
- No other visible error — silent data corruption

---

## Temp File Lifecycle

```
Session start (PPID assigned)
  │
  ├─ First SubagentStart  →  .claude-agent-starts-$PPID  created
  │
  ├─ First SubagentStop   →  .claude-task-outcomes-$PPID  created
  │                          .claude-agent-durations-$PPID  created
  │
  ├─ Each SubagentStop    →  start entry consumed (removed by stall-detection-advisor)
  │                          duration entry appended
  │                          outcome entry appended
  │
  └─ Session end (PPID released)
       Files remain in /tmp — OS cleans up on reboot
       Ring buffers cap each file at 50 lines to bound growth
```

PPID (parent process ID) is used rather than PID (`$$`) to scope files to the Claude Code session rather than to individual script invocations. All three scripts use `${PPID}` consistently.

---

## Design Principles

- **Advisory-only (R021):** All three scripts exit 0 unconditionally. A missing `jq` binary causes silent pass-through, not a blocked hook.
- **PPID scoping:** Isolates temp files per Claude Code session. Multiple concurrent sessions do not interfere.
- **Ring buffers:** Each temp file is capped at 50 lines via `tail -50` after each append. Prevents unbounded growth in long sessions with many agents.
- **grep -F for pattern matching:** Fixed-string matching in `agent-start-recorder` and `task-outcome-recorder` avoids regex injection from agent type names.
- **Self-exclusion from average:** `stall-detection-advisor` reads the duration file *before* appending its own entry, so the completing agent is never compared against itself.
- **Sibling preservation:** When removing a start entry, `awk` removes only the first matching line — preserving sibling entries when multiple agents of the same type run in parallel.

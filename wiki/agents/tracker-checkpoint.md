---
title: "tracker-checkpoint"
type: agent
updated: 2026-04-24
sources:
  - .claude/agents/tracker-checkpoint.md
related:
  - [[r006]]
  - [[r010]]
  - [[r017]]
---

# tracker-checkpoint

Pipeline execution state tracker that persists checkpoint files so failed pipelines can resume from the last successful step rather than restarting from scratch.

## Overview

`tracker-checkpoint` owns the lifecycle of `/tmp/.claude-pipeline-{name}-{PPID}.json` state files. It creates the file on pipeline bootstrap, updates it atomically after each step, freezes state on failure, and serves the saved state back to the orchestrator on `/pipeline resume`. This design separates state persistence from pipeline logic — dag-orchestration resolves dependencies, pipeline-guards enforces quality gates, and tracker-checkpoint is the single writer of ground-truth execution state.

## State File Schema

```json
{
  "pipeline": "{name}",
  "started": "ISO-8601",
  "status": "running|completed|halted",
  "current_step": 0,
  "steps": [
    {"name": "triage", "status": "completed", "duration_ms": 5000, "artifacts": []},
    {"name": "plan", "status": "running"}
  ]
}
```

State transitions follow a strict machine: `pending → running → completed | failed`. On failure the status is set to `halted` and all partial artifact paths are preserved.

## Key Details

- **Model**: sonnet
- **Effort**: medium
- **Tools**: Read, Write, Edit, Bash, Glob, Grep
- **Skills**: `dag-orchestration`, `pipeline-guards`
- **Memory**: project
- **Domain**: universal
- **Permission**: bypassPermissions

## Integration Points

| Integrator | How |
|-----------|-----|
| `dag-orchestration` skill | Step dependency resolution calls tracker to record per-step state |
| `pipeline-guards` skill | Gate-level snapshots written to state file for quality gate auditing |
| `pipeline` skill | `/pipeline resume` reads last halted state and returns retry/skip/abort options to orchestrator |

## Rules Compliance

- **[[r006]]**: Skills (`dag-orchestration`, `pipeline-guards`) are source; agent body stays workflow-focused
- **[[r010]]**: File modifications go through Write/Edit (not Bash) to avoid `.claude/` sensitive-path prompts
- **[[r017]]**: Structural changes require `mgr-sauron:watch` before commit

## Sources

- `.claude/agents/tracker-checkpoint.md` — agent definition

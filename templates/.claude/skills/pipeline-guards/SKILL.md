---
name: pipeline-guards
description: Safety constraints and quality gates for pipeline and workflow execution
scope: core
context: fork
user-invocable: false
---

# Pipeline Guards Skill

Defines mandatory safety constraints for all pipeline, workflow, and iterative execution within the oh-my-customcode system. Prevents infinite loops, enforces timeouts, and establishes quality gates.

**System-wide** — these guards apply to dag-orchestration, worker-reviewer-pipeline, and any iterative process.

## Guard Limits

| Guard | Default | Hard Cap | Applies To |
|-------|---------|----------|------------|
| Max iterations | 3 | 5 | worker-reviewer-pipeline |
| Max DAG nodes | 20 | 30 | dag-orchestration |
| Max parallel agents | 4 | 5 | R009 (all pipelines) |
| Timeout per node | 300s | 600s | dag-orchestration nodes |
| Timeout per pipeline | 900s | 1800s | worker-reviewer-pipeline |
| Max retry count | 2 | 3 | Failure retry strategies |
| Max PR improvement items | 20 | 50 | pr-auto-improve |
| Max auto-improve items | 20 | 50 | omcustom-auto-improve |

## Enforcement

Guards are enforced at two levels:

### Level 1: Skill-Level (Soft)
Each skill checks guard limits before execution:

```
Before starting pipeline:
  1. Check max_iterations ≤ hard cap
  2. Check timeout ≤ hard cap
  3. Check node count ≤ hard cap
  If any exceeded → warn user, use hard cap value
```

### Level 2: Hook-Level (Hard)
The stuck-detector hook monitors for guard violations:

```
PostToolUse → check:
  - Iteration count > max_iterations?
  - Elapsed time > timeout?
  - Same error repeated > max_retry?
  If any → emit advisory to stderr
```

## Quality Gates

### Pipeline Quality Gate
```
[Quality Gate Check]
├── Critical issues: {count} (must be 0)
├── Major issues: {count} (must be ≤ threshold)
├── Minor issues: {count} (informational)
└── Gate: PASS | FAIL
```

### DAG Completion Gate
```
[DAG Completion Gate]
├── Nodes completed: {n}/{total}
├── Nodes failed: {count}
├── Nodes skipped: {count}
└── Gate: PASS | PARTIAL | FAIL
```

## Escalation Integration

When guards are triggered, they integrate with existing advisory systems:

| Event | Action |
|-------|--------|
| Max iterations reached | → stuck-recovery advisory |
| Repeated failures | → model-escalation advisory |
| Timeout approaching (80%) | → warn user, suggest early termination |
| Hard cap hit | → force stop, report to user |

## Guard Configuration

Pipelines can override defaults (within hard caps):

```yaml
# In pipeline/workflow spec
guards:
  max_iterations: 4          # Override default 3, cannot exceed 5
  timeout_per_node: 120      # Override default 300s
  timeout_pipeline: 600      # Override default 900s
  quality_gate: all_pass     # all_pass | majority_pass
```

## Kill Switch

When a pipeline or workflow must be terminated:

```
[Kill Switch] Activated
├── Reason: {max_iterations | timeout | user_request | stuck_detected}
├── Pipeline: {name}
├── Progress: {completed}/{total} steps
├── Preserved state: /tmp/.claude-pipeline-$PPID.json
└── Action: Stopped gracefully, state saved for resume
```

The kill switch:
1. Signals all running agents to complete current operation
2. Does NOT terminate mid-write (waits for current tool call)
3. Saves pipeline state for potential resume
4. Reports final status to user

## State Preservation

On guard-triggered termination:

```json
{
  "pipeline": "feature-review",
  "terminated_at": "2026-03-07T10:15:00Z",
  "reason": "max_iterations_reached",
  "completed_iterations": 3,
  "last_verdict": "FAIL",
  "remaining_issues": [
    {"severity": "major", "file": "src/auth.ts", "line": 42, "description": "..."}
  ],
  "worker_last_output": "...",
  "resumable": true
}
```

## Display Format

Guard warnings appear inline:

```
[Guard] ⚠ Iteration 3/3 — final attempt
[Guard] ⚠ Timeout 80% (240s/300s) — consider early termination
[Guard] 🛑 Max iterations reached — pipeline stopped
[Guard] 🛑 Hard timeout (600s) — force stop
```

## Integration

| Rule/Skill | Integration |
|------------|-------------|
| R009 | Max parallel agents enforced (hard cap: 5, soft default: 4) |
| R010 | Guards run in orchestrator only |
| R015 | Guard warnings displayed transparently |
| dag-orchestration | Node count and timeout limits |
| worker-reviewer-pipeline | Iteration and pipeline timeout limits |
| pr-auto-improve | Improvement item count limits |
| omcustom-auto-improve | Auto-improve item count limits |
| stuck-recovery | Guard triggers feed into stuck detection |
| model-escalation | Repeated failures trigger escalation advisory |

## Override Policy

- Defaults can be overridden in pipeline spec (within hard caps)
- Hard caps can ONLY be changed by modifying this skill file
- User cannot bypass hard caps at runtime
- All overrides are logged and displayed (R015)

## Limitations

- Guards are advisory at skill level, hard at hook level
- Cannot prevent infinite loops in agent reasoning (only tool call patterns)
- State preservation is best-effort (process crash = state loss)
- Resume from saved state requires user confirmation

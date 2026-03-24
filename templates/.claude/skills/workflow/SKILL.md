---
name: omcustom:workflow
description: Invoke YAML-defined workflows by name — /omcustom:workflow auto-dev runs the full pipeline
scope: harness
user-invocable: true
effort: high
argument-hint: "<workflow-name> | (no args to list available)"
---

# /omcustom:workflow — Workflow Invocation

## Usage

```
/omcustom:workflow auto-dev     # Run the auto-dev workflow
/omcustom:workflow                  # List available workflows
/omcustom:workflow:resume           # Resume a halted workflow
```

## Behavior

### List Mode (no arguments)

Scan `workflows/*.yaml` and display:
```
Available workflows:
  auto-dev — verify-done issues release batch: triage → plan → implement → verify → PR
```

### Run Mode (with workflow name)

1. Validate workflow exists: `workflows/{name}.yaml`
2. Load and validate YAML structure
3. Announce: `[Workflow] Starting {name} — {step_count} steps`
4. Invoke workflow-runner skill with the loaded definition
5. Report completion or failure

### Resume Mode (/omcustom:workflow:resume)

1. Check for state file: `/tmp/.claude-workflow-*-{PPID}.json`
2. If found: show halted workflow name and failed step
3. Ask: "Resume from step {N} ({step_name})?"
4. Re-invoke workflow-runner from the failed step

## Error Handling

- Workflow not found → list available workflows with suggestion
- YAML parse error → report with line number
- Step failure → halt-and-report per workflow error policy

---
name: workflow-runner
description: Execute YAML-defined workflow pipelines — parse, validate, and run multi-step skill chains
scope: harness
user-invocable: false
effort: high
---

# Workflow Runner

## Purpose

Core engine for the workflow system. Parses YAML workflow definitions from `workflows/` directory, validates step structure, and executes each step sequentially by invoking the referenced skills or actions.

## Execution Protocol

### 1. Load Workflow

Read the specified YAML file from `workflows/{name}.yaml`. Validate:
- Required fields: `name`, `description`, `steps[]`
- Each step has either `skill:` or `action:` (not both)
- Referenced skills exist in `.claude/skills/`
- Skill names must match `^[a-z0-9-]+$` (kebab-case only) — reject path traversal attempts
- Action values must be one of: `implement`, `create-pr` — reject unknown actions with error

### 2. Execute Steps

Process steps top-to-bottom:

**Skill steps** (`skill: name`):
- Invoke via Skill tool: `Skill(skill: "{name}")`
- Capture output for next step's `input` reference

**Action steps** (`action: name`):
- `implement` — Delegate to appropriate agents based on issue domain
- `create-pr` — Delegate to mgr-gitnerd for branch creation, push, PR

**Foreach steps** (`foreach: collection`):
- Iterate over collection from previous step output
- Execute the step once per item

### 3. Error Handling

Based on workflow `error` field:
- `halt-and-report` — Stop execution, save state, report failure with context
- State saved to `/tmp/.claude-workflow-{name}-{PPID}.json`

### 4. State Tracking

Track per-step state:
```json
{
  "workflow": "{name}",
  "started": "ISO-8601",
  "status": "running|completed|halted",
  "current_step": 0,
  "steps": [
    {"name": "triage", "status": "completed", "duration_ms": 5000},
    {"name": "plan", "status": "running"}
  ]
}
```

### 5. Completion

On all steps completed:
- Delete state file
- Report summary with per-step durations
- Output final results

## Notes

- This skill is invoked by the workflow bridge skill (workflow/SKILL.md)
- It does NOT appear in slash commands (user-invocable: false)
- All file writes delegated to subagents per R010

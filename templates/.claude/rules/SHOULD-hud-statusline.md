# [SHOULD] HUD Statusline Rules

> **Priority**: SHOULD - Recommended for visibility
> **ID**: R012

## Purpose

Display real-time status information during agent operations for improved visibility and progress tracking.

## Format

```
─── [Agent] {name} | [Progress] {n}/{total} | [Parallel] {count} ───
```

## Update Triggers

| Trigger | Description |
|---------|-------------|
| Agent activation | When an agent starts handling a task |
| Task start | When a specific task begins execution |
| Task complete | When a task finishes (success or failure) |
| Parallel spawn | When parallel instances are created |
| Parallel complete | When parallel instances finish |

## Components

| Component | Description | Example |
|-----------|-------------|---------|
| Agent | Active agent name | `lang-golang-expert` |
| Model | Model used (for parallel) | `sonnet` |
| Progress | Task progress (current/total) | `2/5` |
| Parallel | Parallel instance count | `3` |

## Display Rules

### Single Agent

```
─── [Agent] mgr-creator | [Progress] 1/3 ───
```

### With Parallel Execution (Model Display REQUIRED)

```
─── [Agent] secretary | [Progress] 0/4 | [Parallel] 4 ───

Instances:
  [1] Task(general-purpose):sonnet → README update
  [2] Task(lang-golang-expert):haiku → Code review
  [3] Task(Explore):opus → Architecture analysis
  [4] Task(general-purpose):haiku → Validation
```

### Completion

```
─── [Agent] mgr-supplier | [Progress] 5/5 | [Done] ───
```

## Implementation

Status updates via stderr to avoid output pollution:

```bash
echo "─── [Agent] $AGENT | [Progress] $PROGRESS ───" >&2
```

## Integration with Other Rules

| Rule | Integration |
|------|-------------|
| R007 (Agent ID) | HUD complements agent identification |
| R008 (Tool ID) | HUD shows overall progress, tool ID shows specific operations |
| R009 (Parallel) | HUD displays parallel instance count |

## When to Display

| Situation | Display HUD |
|-----------|-------------|
| Single file operation | No (too brief) |
| Multi-step task | Yes |
| Parallel execution | Yes |
| Long-running operations | Yes |

## Hook Usage

The HUD statusline is implemented as an inline hook in `.claude/hooks/hooks.json` (PreToolUse → Task matcher).

The hook automatically displays subagent details when the Task tool is used:

```
─── [Spawn] {subagent_type}:{model} | {description} ───
─── [Resume] {subagent_type}:{model} | {description} ───
```

### Examples

```
─── [Spawn] mgr-gitnerd:sonnet | Commit and push ───
─── [Spawn] lang-golang-expert:sonnet | Review Go code ───
─── [Spawn] mgr-creator:sonnet | Create new agent ───
─── [Resume] mgr-gitnerd:sonnet | Continue push ───
```

### Fields Displayed

| Field | Source | Purpose |
|-------|--------|---------|
| `subagent_type` | Task tool parameter | Which agent is running |
| `model` | Task tool parameter | Which model (opus/sonnet/haiku) |
| `description` | Task tool parameter | What the agent is doing (max 40 chars) |

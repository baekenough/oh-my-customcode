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
| Agent | Active agent name | `golang-expert` |
| Progress | Task progress (current/total) | `2/5` |
| Parallel | Parallel instance count | `3` |

## Display Rules

### Single Agent

```
─── [Agent] creator | [Progress] 1/3 ───
```

### With Parallel Execution

```
─── [Agent] secretary | [Progress] 0/4 | [Parallel] 4 ───
```

### Completion

```
─── [Agent] supplier | [Progress] 5/5 | [Done] ───
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

The HUD statusline hook can be triggered via:

```bash
~/.claude/hooks/hud/update-status.sh <agent> [progress] [parallel_count]

# Examples
~/.claude/hooks/hud/update-status.sh "creator" "1/3"
~/.claude/hooks/hud/update-status.sh "secretary" "0/4" "4"
```

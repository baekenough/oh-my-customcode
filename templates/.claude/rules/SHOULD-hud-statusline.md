# [SHOULD] HUD Statusline Rules

> **Priority**: SHOULD | **ID**: R012

## Two-System Architecture

| Aspect | HUD Events | Statusline API |
|--------|-----------|----------------|
| Channel | stderr (hooks) | stdout (dedicated statusline) |
| Location | Inline in conversation log | Persistent bar at screen bottom |
| Trigger | PreToolUse (Agent/Task matcher) | Message update cycle (~300ms) |
| Role | Event notifications | Persistent session status |

## HUD Events (Hook-based)

### Format

```
─── [Spawn] {subagent_type}:{model} | {description} ───
─── [Resume] {subagent_type}:{model} | {description} ───
```

### When to Display

Multi-step tasks, parallel execution, long-running operations. Skip for single brief operations.

### Implementation

Implemented in `.claude/hooks/hooks.json` (PreToolUse → Agent/Task matcher).

### Parallel Display

```
─── [Agent] secretary | [Parallel] 4 ───
  [1] Agent(mgr-creator):sonnet → Create agent
  [2] Agent(lang-golang-expert):haiku → Code review
```

## Statusline API (Command-based)

### Format

```
{Cost} | {project} | {branch} | RL:{rate_limit}% | CTX:{usage}%
```

Example: `$0.05 | my-project | develop | RL:45% | CTX:42%`

### Configuration

```json
{
  "statusLine": {
    "type": "command",
    "command": ".claude/statusline.sh",
    "padding": 0
  }
}
```

Set in `.claude/settings.local.json`. The command receives JSON via stdin with model, workspace, context window, cost, and rate limit data.

### Color Coding

| Element | Condition | Color |
|---------|-----------|-------|
| Cost | < $1.00 | Green |
| Cost | $1.00 - $4.99 | Yellow |
| Cost | >= $5.00 | Red |
| Rate Limit | < 50% | Green |
| Rate Limit | 50-79% | Yellow |
| Rate Limit | >= 80% | Red |
| Context | < 60% | Green |
| Context | 60-79% | Yellow |
| Context | >= 80% | Red |

The `RL:{rate_limit}%` segment only appears when Claude Code v2.1.80+ provides `rate_limits` data. On older versions, this segment is omitted.

## Integration

Integrates with R007 (Agent ID), R008 (Tool ID), R009 (Parallel).

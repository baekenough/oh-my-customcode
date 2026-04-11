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

Format: `─── [Spawn] {subagent_type}:{model} | {description} ───` — implemented in `.claude/hooks/hooks.json` (PreToolUse → Agent/Task matcher). Display for multi-step/parallel/long-running ops only.

<!-- DETAIL: HUD Events full spec
### When to Display: Multi-step tasks, parallel execution, long-running operations. Skip for single brief operations.
### Parallel Display:
─── [Agent] secretary | [Parallel] 4 ───
  [1] Agent(mgr-creator):sonnet → Create agent
  [2] Agent(lang-golang-expert):haiku → Code review
-->

## Statusline API (Command-based)

Format: `{Cost} | {project} | {branch} | RL:{rate_limit}% {countdown} | WL:{weekly_limit}% {countdown} | CTX:{usage}%`

Config in `.claude/settings.local.json`: `statusLine.type: "command"`, `statusLine.command: ".claude/statusline.sh"`. Requires CC v2.1.80+ for RL/WL segments. `refreshInterval` setting (v2.1.97+): Auto-refresh interval in seconds for the status line command. Set in `statusLine.refreshInterval` in settings.json.

<!-- DETAIL: Statusline configuration JSON and color coding
```json
{ "statusLine": { "type": "command", "command": ".claude/statusline.sh", "padding": 0 } }
```
Color coding: Cost (<$1 green, $1-4.99 yellow, >=5 red), RL/WL (<50% green, 50-79% yellow, >=80% red), CTX (<60% green, 60-79% yellow, >=80% red).
Countdown format: >=1d → "{d}d{h}h", >=1h → "{h}h{m}m", <1h → "{m}m", unavailable → omitted.
RL/WL segments omitted on CC older than v2.1.80.
-->

## Integration

Integrates with R007 (Agent ID), R008 (Tool ID), R009 (Parallel).

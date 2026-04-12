---
title: sys-naggy
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/sys-naggy.md
related:
  - [[sys-memory-keeper]]
  - [[mgr-sauron]]
---

# sys-naggy

Task management and proactive reminder specialist that monitors stale tasks, tracks dependencies, and detects recurring rule violations to propose R016 rule patches as GitHub issues.

## Overview

`sys-naggy` manages TODO items across sessions with proactive reminders. It tracks task priorities, dependencies, and blockers, monitors stale tasks (>24h) and approaching deadlines, and syncs with project TODO.md files. A unique feature is **Rule Pattern Detection**: when it detects a rule violation recurring 3+ times across sessions, it automatically generates a GitHub issue proposing a rule patch — but never auto-applies it (human approval required, debounced to 1 proposal/rule/week).

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep (no Bash)
- **Memory**: local
- **Effort**: low
- **Max Turns**: 10
- **Limitations**: cannot modify project files, cannot execute external commands

## Commands

| Command | Description |
|---------|-------------|
| `sys-naggy:list` | List pending TODOs |
| `sys-naggy:add <task>` | Add new TODO |
| `sys-naggy:done <id>` | Mark complete |
| `sys-naggy:remind` | Show overdue tasks |

## Relationships

- **Depends on**: MEMORY.md violations section, `/tmp/.claude-session-compliance-*` data
- **Used by**: Proactive task management, R016 violation pattern detection
- **See also**: [[sys-memory-keeper]] (session memory), [[mgr-sauron]] (rule violation context)

## Sources

- `.claude/agents/sys-naggy.md` — agent definition

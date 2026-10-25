---
title: Status
type: skill
updated: 2026-10-25
sources:
  - .claude/skills/status/SKILL.md
related:
  - [[lists]]
  - [[help]]
  - [[monitoring-setup]]
---

# Status

Show system status and health checks.

## Overview

Displays a comprehensive system status: rules loaded, agent counts by category, skill counts, guide count, and available commands. `--verbose` shows each agent and skill with validity status. `--health` runs integrity checks (all agent files exist, skill references valid, external sources reachable, CLAUDE.md in sync). Used for quick system health verification.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:status`
- **Effort**: not specified
- **Argument hint**: `[--verbose] [--health]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[lists]], [[help]]
- **See also**: [[R017]]

## Sources

- `.claude/skills/status/SKILL.md` — skill definition
- Content-drift resync 2026-10-25: source sample output now shows "Total: 114 skills" (was 115); no other change.

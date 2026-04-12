---
title: Omcustom Loop
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-loop/SKILL.md
related:
  - [[pipeline]]
  - [[dag-orchestration]]
---

# Omcustom Loop

Prevent session idle during background agent execution by keeping the session active.

## Overview

Keeps a Claude Code session alive during long-running background operations by emitting periodic status messages. Used when background agents are running and the session would otherwise timeout. Emits heartbeat messages and current agent status at configurable intervals. Complements `pipeline` and `dag-orchestration` for long-running workflows.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:loop`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[pipeline]], [[dag-orchestration]]
- **See also**: [[R009]]

## Sources

- `.claude/skills/omcustom-loop/SKILL.md` — skill definition

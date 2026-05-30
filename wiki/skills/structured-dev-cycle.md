---
title: Structured Dev Cycle
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/structured-dev-cycle/SKILL.md
related:
  - [[deep-plan]]
  - [[multi-model-verification]]
  - [[reasoning-sandwich]]
  - [[R018]]
---

# Structured Dev Cycle

6-stage structured development cycle with stage-based tool restrictions.

## Overview

Enforces a disciplined 6-stage cycle: Plan (Read-only) → Verify Plan → Implement (all tools) → Verify Implementation → Compound testing → Done. Stage transitions are enforced via a `/tmp/.claude-dev-stage` marker file checked by PreToolUse hooks. Recommends opus for planning stages, sonnet for implementation, haiku for Done. Supports Codex hybrid in Stage 3 and Agent Teams for complex tasks (R018). Full cycle for 10+ file changes; abbreviated for smaller tasks.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/structured-dev-cycle`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[deep-plan]], [[multi-model-verification]], [[reasoning-sandwich]]
- **See also**: [[R018]], [[R009]], [[R010]]

## Sources

- `.claude/skills/structured-dev-cycle/SKILL.md` — skill definition

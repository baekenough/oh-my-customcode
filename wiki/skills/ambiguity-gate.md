---
title: Ambiguity Gate
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/ambiguity-gate/SKILL.md
related:
  - [[secretary-routing]]
  - [[dev-lead-routing]]
  - [[R015]]
---

# Ambiguity Gate

Pre-routing ambiguity analysis — scores request clarity and asks clarifying questions when needed (inspired by ouroboros).

## Overview

Analyzes a user request for ambiguity before routing to implementation, scoring it 0.0–1.0 across five factors: scope clarity (30%), technical specificity (25%), acceptance criteria (20%), constraint clarity (15%), and context sufficiency (10%). Scores above 0.5 halt routing and require clarification; 0.2–0.5 suggest clarifications but allow proceeding. Can be invoked manually or integrated into routing skills.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/ambiguity-gate`
- **Effort**: not specified
- **Argument hint**: `[request to analyze for ambiguity]`

## Relationships

- **Used by agents**: orchestrator, routing skills
- **Related skills**: [[secretary-routing]], [[dev-lead-routing]], [[de-lead-routing]], [[qa-lead-routing]]
- **See also**: [[R015]]

## Sources

- `.claude/skills/ambiguity-gate/SKILL.md` — skill definition

---
title: Deep Plan
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/deep-plan/SKILL.md
related:
  - [[research]]
  - [[structured-dev-cycle]]
  - [[deep-verify]]
---

# Deep Plan

Research-validated planning — research then plan then verify workflow for complex tasks.

## Overview

Three-phase planning workflow: (1) Research phase using multi-team parallel analysis, (2) Plan synthesis from research findings, (3) Plan verification via multiple perspectives. Produces a validated implementation plan before any code is written. Uses Agent Teams when available (R018). Designed for complex features (10+ files) or architecture changes where planning failures are costly.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/deep-plan`
- **Effort**: not specified
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[research]], [[deep-verify]], [[structured-dev-cycle]], [[multi-model-verification]]
- **See also**: [[R018]], [[R009]]

## Sources

- `.claude/skills/deep-plan/SKILL.md` — skill definition

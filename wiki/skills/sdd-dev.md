---
title: SDD Dev
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/sdd-dev/SKILL.md
related:
  - [[sdd]]
  - [[sdd-development]]
  - [[structured-dev-cycle]]
  - [[arch-speckit-agent]]
---

# SDD Dev

Spec-Driven Development workflow using sdd/ folder as the single source of truth.

## Overview

Implements Spec-Driven Development: spec files in `sdd/` define the intended behavior before implementation. Workflow: write spec → validate spec → implement from spec → verify against spec → update spec on change. Ensures all agents work from a consistent specification rather than inferred intent. Aliases: `/sdd` and `/sdd-development` both invoke this skill.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/sdd-dev`
- **Effort**: not specified
- **Argument hint**: `[task description or leave empty for guided workflow]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[structured-dev-cycle]], [[omcustom-takeover]], [[deep-plan]]
- **See also**: [[arch-speckit-agent]], [[R020]]

## Sources

- `.claude/skills/sdd-dev/SKILL.md` — skill definition

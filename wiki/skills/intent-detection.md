---
title: Intent Detection
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/intent-detection/SKILL.md
related:
  - [[secretary-routing]]
  - [[dev-lead-routing]]
  - [[R015]]
---

# Intent Detection

Automatically detect user intent and route to the appropriate agent or skill.

## Overview

Pattern-based intent detection for routing decisions. Analyzes user input using keyword matching (40%), file pattern detection (30%), action verbs (20%), and conversational context (10%) to identify the most appropriate agent. Confidence thresholds determine routing behavior: ≥90% auto-route, 70-89% confirm, <70% present options. Patterns defined in `.claude/skills/intent-detection/patterns/agent-triggers.yaml`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[secretary-routing]], [[dev-lead-routing]], [[de-lead-routing]], [[qa-lead-routing]], [[ambiguity-gate]]
- **See also**: [[R015]]

## Sources

- `.claude/skills/intent-detection/SKILL.md` — skill definition

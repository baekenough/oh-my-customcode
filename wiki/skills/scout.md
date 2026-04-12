---
title: Scout
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/scout/SKILL.md
related:
  - [[skills-sh-search]]
  - [[update-external]]
  - [[research]]
---

# Scout

Analyze external URL to evaluate project fit and integration potential.

## Overview

Fetches and analyzes an external URL (GitHub repo, npm package, article) to evaluate its fit for the current project. Assesses: technology alignment, maturity indicators (stars, activity, license), API surface compatibility, integration complexity, and potential conflicts with existing agents/skills. Produces a structured evaluation report with a recommended action (adopt, evaluate, skip).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/scout`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[skills-sh-search]], [[update-external]], [[research]]
- **See also**: [[R002]]

## Sources

- `.claude/skills/scout/SKILL.md` — skill definition

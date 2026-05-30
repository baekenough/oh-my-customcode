---
title: Research
type: skill
updated: 2026-04-27
sources:
  - .claude/skills/research/SKILL.md
related:
  - [[deep-plan]]
  - [[result-aggregation]]
  - [[R018]]
---

# Research

10-team parallel deep analysis with cross-validation for complex research tasks.

## Overview

Spawns 10 parallel research agents (Agent Teams when available, R018) to analyze a topic from different angles simultaneously. Each team investigates a specific aspect (architecture, security, performance, ecosystem, etc.), then a synthesizer agent aggregates findings with cross-validation. Produces a comprehensive research report saved to `.claude/outputs/`. Designed for complex architectural decisions or technology evaluations.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/research`
- **Effort**: not specified
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[deep-plan]], [[result-aggregation]], [[task-decomposition]]
- **See also**: [[R018]], [[R009]]

## Sources

- `.claude/skills/research/SKILL.md` — skill definition (teams-compatible flag added; sensitive-path bypass documented #1045)

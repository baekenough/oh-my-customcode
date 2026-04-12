---
title: Professor Triage
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/professor-triage/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[post-release-followup]]
---

# Professor Triage

Analyze GitHub issues against current codebase to generate prioritized triage report.

## Overview

Reads GitHub issues labeled `professor`, cross-analyzes them against the current codebase, and produces a prioritized triage report. Groups issues by component, identifies duplicates and related issues, assigns priority labels (P1/P2/P3), and suggests which issues should be included in the next release unit. Output saved to `.claude/outputs/`. Used as input to `release-plan`.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/professor-triage`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[post-release-followup]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/professor-triage/SKILL.md` — skill definition

---
title: Optimize Report
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/optimize-report/SKILL.md
related:
  - [[tool-optimizer]]
  - [[optimize-analyze]]
  - [[optimize-bundle]]
---

# Optimize Report

Generate comprehensive optimization report with before/after metrics.

## Overview

Produces a structured optimization report comparing before/after metrics for bundle size, Lighthouse scores, and runtime performance. Summarizes applied optimizations, remaining opportunities, and estimated impact of each change. Output saved to `.claude/outputs/`. Used as the final step in the optimize workflow after analysis and bundle optimization.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/optimize-report`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-optimizer]]
- **Related skills**: [[optimize-analyze]], [[optimize-bundle]]
- **See also**: [[R005]]

## Sources

- `.claude/skills/optimize-report/SKILL.md` — skill definition

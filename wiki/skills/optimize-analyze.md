---
title: Optimize Analyze
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/optimize-analyze/SKILL.md
related:
  - [[tool-optimizer]]
  - [[optimize-bundle]]
  - [[optimize-report]]
---

# Optimize Analyze

Analyze bundle size and performance metrics for optimization opportunities.

## Overview

Analyzes application bundles and runtime performance to identify optimization opportunities. Runs bundle analyzer tools (webpack-bundle-analyzer, rollup-visualizer), captures Lighthouse scores, identifies large dependencies, code splitting opportunities, and render-blocking resources. Output feeds into `optimize-bundle` for targeted optimizations and `optimize-report` for summary.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/optimize-analyze`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-optimizer]]
- **Related skills**: [[optimize-bundle]], [[optimize-report]]
- **See also**: [[R005]]

## Sources

- `.claude/skills/optimize-analyze/SKILL.md` — skill definition

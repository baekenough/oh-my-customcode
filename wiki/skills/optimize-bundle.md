---
title: Optimize Bundle
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/optimize-bundle/SKILL.md
related:
  - [[tool-optimizer]]
  - [[optimize-analyze]]
  - [[optimize-report]]
---

# Optimize Bundle

Reduce bundle size through code splitting, tree shaking, and dependency optimization.

## Overview

Applies bundle size optimizations based on analysis findings: dynamic imports for code splitting, tree shaking configuration, dependency replacement (lighter alternatives), lazy loading for routes and components, image optimization, and dead code elimination. Works from `optimize-analyze` output. Delegates file modifications to `lang-typescript-expert` or `fe-vercel-agent`.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/optimize-bundle`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[tool-optimizer]]
- **Related skills**: [[optimize-analyze]], [[optimize-report]], [[react-best-practices]]
- **See also**: [[R005]]

## Sources

- `.claude/skills/optimize-bundle/SKILL.md` — skill definition

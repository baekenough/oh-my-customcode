---
title: tool-optimizer
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/tool-optimizer.md
related:
  - [[fe-vercel-agent]]
  - [[lang-typescript-expert]]
  - [[tool-npm-expert]]
  - [[fe-design-expert]]
---

# tool-optimizer

Bundle size and performance analysis specialist for detecting dead code, verifying tree-shaking, profiling application performance, and providing actionable optimization recommendations — without modifying source code.

## Overview

`tool-optimizer` analyzes application bundles, dependency graphs, and performance characteristics across all major bundlers (Webpack, Rollup, Vite, esbuild). It operates in three modes: Analyze (bundle composition, size metrics, unused code), Optimize (identify opportunities, prioritize by impact), and Report (collect metrics, compare baselines, generate recommendations). It is read-only — it never modifies source code, only reports.

Uses three skills: `optimize-analyze`, `optimize-bundle`, and `optimize-report`.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Grep, Glob, Bash (read-only operations only)
- **Skills**: `optimize-analyze`, `optimize-bundle`, `optimize-report`
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot modify source code

## Relationships

- **Depends on**: `optimize-analyze` skill, `optimize-bundle` skill, `optimize-report` skill
- **Used by**: `/optimize-analyze`, `/optimize-bundle`, `/optimize-report` commands, `dev-lead-routing` (performance optimization tasks)
- **See also**: [[fe-vercel-agent]] (React/Next.js optimization), [[lang-typescript-expert]] (TS build configuration), [[tool-npm-expert]] (dependency audits), [[fe-design-expert]] (use tool-optimizer for performance, not fe-design-expert)

## Sources

- `.claude/agents/tool-optimizer.md` — agent definition

---
title: Result Aggregation
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/result-aggregation/SKILL.md
related:
  - [[research]]
  - [[worker-reviewer-pipeline]]
  - [[task-decomposition]]
---

# Result Aggregation

Aggregate parallel agent results into a unified, deduplicated summary.

## Overview

Collects outputs from parallel agent runs, deduplicates overlapping findings, resolves conflicts via majority vote or severity weighting, and produces a unified summary. Handles different output formats (findings, code review results, research summaries) with format-specific merging logic. Used as the synthesis step in `research`, `multi-model-verification`, and other parallel workflows.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[research]], [[worker-reviewer-pipeline]], [[task-decomposition]], [[multi-model-verification]]
- **See also**: [[R009]]

## Sources

- `.claude/skills/result-aggregation/SKILL.md` — skill definition

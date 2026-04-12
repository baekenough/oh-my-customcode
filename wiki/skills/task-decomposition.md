---
title: Task Decomposition
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/task-decomposition/SKILL.md
related:
  - [[pipeline]]
  - [[dag-orchestration]]
  - [[research]]
  - [[R009]]
---

# Task Decomposition

Auto-decompose large tasks into DAG of parallel subtasks for execution.

## Overview

Analyzes a large task, identifies parallelizable subtasks, and produces a DAG of work units for parallel execution. Respects the 10-file-per-agent advisory limit (pipeline-guards) and assigns appropriate specialist agents per subtask. Output is consumed by `dag-orchestration` or `pipeline` for execution. Checks Agent Teams eligibility (R018) before recommending parallel spawning.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[pipeline]], [[dag-orchestration]], [[research]], [[result-aggregation]]
- **See also**: [[R009]], [[R018]], [[pipeline-guards]]

## Sources

- `.claude/skills/task-decomposition/SKILL.md` — skill definition

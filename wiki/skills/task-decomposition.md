---
title: Task Decomposition
type: skill
updated: 2026-07-20
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

> **Soft-deprecated (since #1474)** — new DAG/orchestration work should prefer the native Workflow tool, which provides topological sort, parallel fan-out, and resume directly at the platform level. This skill is retained only for backward compatibility with `pipeline auto-dev.yaml` and the `/fsd` autonomous loop, which still depend on it. It is not slated for deletion — only new usage is discouraged as part of a staged migration.

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

---
title: DAG Orchestration
type: skill
updated: 2026-07-20
sources:
  - .claude/skills/dag-orchestration/SKILL.md
related:
  - [[pipeline]]
  - [[pipeline-guards]]
  - [[task-decomposition]]
  - [[tracker-checkpoint]]
---

# DAG Orchestration

YAML-based DAG workflow engine with dependency resolution and parallel execution.

> **Soft-deprecated (since #1474)** — new DAG/orchestration work should prefer the native Workflow tool, which provides topological sort, parallel fan-out, and resume directly at the platform level. This skill is retained only for backward compatibility with `pipeline auto-dev.yaml` and the `/fsd` autonomous loop, which still depend on it. It is not slated for deletion — only new usage is discouraged as part of a staged migration.

## Overview

Defines a DAG-based workflow execution engine for multi-step agent pipelines. Parses YAML workflow definitions, resolves task dependencies, executes independent nodes in parallel (respecting R009 limits), handles retries, and tracks state. Enforces pipeline-guards limits (max 20 nodes, 300s per node, 900s pipeline). Used by the `pipeline` skill for complex multi-step workflows. State persistence during execution is delegated to `tracker-checkpoint`, which owns `/tmp/.claude-pipeline-{name}-{PPID}.json`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator (via `pipeline` skill)
- **Related skills**: [[pipeline]], [[pipeline-guards]], [[task-decomposition]], [[worker-reviewer-pipeline]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/dag-orchestration/SKILL.md` — skill definition

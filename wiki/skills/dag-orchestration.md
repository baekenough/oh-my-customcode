---
title: DAG Orchestration
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/dag-orchestration/SKILL.md
related:
  - [[pipeline]]
  - [[pipeline-guards]]
  - [[task-decomposition]]
---

# DAG Orchestration

YAML-based DAG workflow engine with dependency resolution and parallel execution.

## Overview

Defines a DAG-based workflow execution engine for multi-step agent pipelines. Parses YAML workflow definitions, resolves task dependencies, executes independent nodes in parallel (respecting R009 limits), handles retries, and tracks state. Enforces pipeline-guards limits (max 20 nodes, 300s per node, 900s pipeline). Used by the `pipeline` skill for complex multi-step workflows.

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

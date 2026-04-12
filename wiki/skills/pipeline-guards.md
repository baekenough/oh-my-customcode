---
title: Pipeline Guards
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/pipeline-guards/SKILL.md
related:
  - [[pipeline]]
  - [[dag-orchestration]]
  - [[worker-reviewer-pipeline]]
  - [[stuck-recovery]]
---

# Pipeline Guards

Safety constraints and quality gates for pipeline and workflow execution.

## Overview

Defines system-wide safety limits for all pipeline execution: max iterations (3, hard cap 5), max DAG nodes (20, hard cap 30), max parallel agents (4, hard cap 5), timeouts (300s/node, 900s/pipeline), and retry counts (2, max 3). Includes a kill switch with state preservation for graceful termination. Limits can be overridden per pipeline within hard caps. Integrates with `stuck-recovery` and `model-escalation`.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[pipeline]], [[dag-orchestration]], [[worker-reviewer-pipeline]], [[stuck-recovery]], [[model-escalation]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/pipeline-guards/SKILL.md` — skill definition

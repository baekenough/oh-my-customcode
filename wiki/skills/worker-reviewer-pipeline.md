---
title: Worker Reviewer Pipeline
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/worker-reviewer-pipeline/SKILL.md
related:
  - [[evaluator-optimizer]]
  - [[pipeline-guards]]
  - [[dag-orchestration]]
---

# Worker Reviewer Pipeline

Worker-Reviewer iterative pipeline for quality-gated code generation.

## Overview

Implements a worker-reviewer loop where a worker agent generates/modifies code and a reviewer agent evaluates it against quality criteria. The loop continues until the reviewer approves or max iterations is reached (default 3, hard cap 5 per pipeline-guards). Reviewer findings are fed back to the worker for targeted improvements. Supports configurable quality gates and escalation to higher-tier models on repeated failure.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator (via `pipeline` or direct invocation)
- **Related skills**: [[evaluator-optimizer]], [[pipeline-guards]], [[dag-orchestration]], [[model-escalation]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/worker-reviewer-pipeline/SKILL.md` — skill definition

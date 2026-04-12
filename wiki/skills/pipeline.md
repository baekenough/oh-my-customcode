---
title: Pipeline
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/pipeline/SKILL.md
related:
  - [[dag-orchestration]]
  - [[pipeline-guards]]
  - [[task-decomposition]]
---

# Pipeline

Invoke and resume YAML-defined pipelines — `/pipeline auto-dev` runs the full release pipeline.

## Overview

YAML-based pipeline executor. In list mode, scans `workflows/*.yaml` and displays available pipelines. In run mode, loads and validates a pipeline YAML, then executes steps sequentially (skill steps via Skill tool, prompt steps via agent delegation, parallel steps via Agent tool). Tracks state per step in `/tmp/.claude-pipeline-{name}-{PPID}.json`. Resume mode re-executes from the failed step. Max 4 concurrent parallel steps (pipeline-guards).

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/pipeline`
- **Effort**: high
- **Argument hint**: `<pipeline-name> | resume | (no args to list available)`
- **Source**: external (github: baekenough/baekenough-skills v1.0.0)

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dag-orchestration]], [[pipeline-guards]], [[task-decomposition]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/pipeline/SKILL.md` — skill definition

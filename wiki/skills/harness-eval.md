---
title: Harness Eval
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/harness-eval/SKILL.md
related:
  - [[structured-dev-cycle]]
  - [[deep-verify]]
---

# Harness Eval

Structured SE task evaluation using 15-task benchmark for agent quality assessment.

## Overview

Runs a structured benchmark of 15 canonical software engineering tasks to evaluate agent quality, rule compliance, and system health. Each task tests specific capabilities (code review, refactoring, agent creation, git operations, etc.) and is scored against defined criteria. Results identify weak areas and regression from previous versions. Used for release qualification and continuous improvement.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:harness-eval`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[structured-dev-cycle]], [[deep-verify]], [[multi-model-verification]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/harness-eval/SKILL.md` — skill definition

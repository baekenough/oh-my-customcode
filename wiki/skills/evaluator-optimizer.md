---
title: Evaluator Optimizer
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/evaluator-optimizer/SKILL.md
related:
  - [[worker-reviewer-pipeline]]
  - [[pipeline-guards]]
  - [[reasoning-sandwich]]
---

# Evaluator Optimizer

Parameterized evaluator-optimizer loop for iterative quality improvement.

## Overview

Implements the evaluator-optimizer pattern: a worker agent generates output, an evaluator agent scores it against criteria, and the loop continues until the score meets threshold or max iterations is reached. Parameterized by task type, quality criteria, scoring rubric, and convergence threshold. Subject to pipeline-guards limits (max iterations: 3-5).

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[worker-reviewer-pipeline]], [[pipeline-guards]], [[reasoning-sandwich]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/evaluator-optimizer/SKILL.md` — skill definition

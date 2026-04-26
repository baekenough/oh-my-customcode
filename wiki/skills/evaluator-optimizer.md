---
title: Evaluator Optimizer
type: skill
updated: 2026-04-26
sources:
  - .claude/skills/evaluator-optimizer/SKILL.md
related:
  - [[worker-reviewer-pipeline]]
  - [[pipeline-guards]]
  - [[reasoning-sandwich]]
  - [[agent-eval-framework]]
---

# Evaluator Optimizer

Parameterized evaluator-optimizer loop for iterative quality improvement.

## Overview

Implements the evaluator-optimizer pattern: a worker agent generates output, an evaluator agent scores it against criteria, and the loop continues until the score meets threshold or max iterations is reached. Parameterized by task type, quality criteria, scoring rubric, and convergence threshold. Subject to pipeline-guards limits (max iterations: 3-5).

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Efficiency Gate (added v0.113.0)

When multiple optimizer iterations produce passing variants (all meeting the rubric quality threshold), the [[agent-eval-framework]] 4-metric efficiency gate selects the winner:

1. **Quality phase** — existing rubric loop (unchanged)
2. **Efficiency phase** — among passing variants, prefer lower step_ratio + tool_call_ratio + latency_ratio

Apply when: multiple candidates pass the rubric, an objective tiebreaker is needed, or a cost/latency budget is active. Winner = variant with lowest weighted ratio sum.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[worker-reviewer-pipeline]], [[pipeline-guards]], [[reasoning-sandwich]], [[agent-eval-framework]]
- **See also**: [[R009]], [[R010]]
- **Guide**: [Agent Eval guide](../guides/agent-eval.md)

## Sources

- `.claude/skills/evaluator-optimizer/SKILL.md` — skill definition

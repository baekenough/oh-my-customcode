---
title: Harness Eval
type: skill
updated: 2026-04-26
sources:
  - .claude/skills/harness-eval/SKILL.md
related:
  - [[structured-dev-cycle]]
  - [[deep-verify]]
  - [[agent-eval-framework]]
  - [[evaluator-optimizer]]
---

# Harness Eval

Structured SE task evaluation using 15-task benchmark for agent quality assessment.

## Overview

Runs a structured benchmark of 15 canonical software engineering tasks to evaluate agent quality, rule compliance, and system health. Each task tests specific capabilities (code review, refactoring, agent creation, git operations, etc.) and is scored against defined criteria. Results identify weak areas and regression from previous versions. Used for release qualification and continuous improvement.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:harness-eval`
- **Effort**: high

## 4-Metric Quantitative Layer (added v0.113.0)

The 15 benchmark tasks measure task correctness (pass/fail). Starting v0.113.0, the [[agent-eval-framework]] skill layers efficiency metrics on top of each task result:

- **step_ratio** — observed_steps / ideal_steps
- **tool_call_ratio** — observed_tool_calls / ideal_tool_calls
- **latency_ratio** — observed_latency / ideal_latency

Workflow: run benchmark task → collect trajectory → compare against ideal annotation → Phase 1 (correctness) gate → Phase 2 (efficiency) comparison. Ideal trajectory annotations follow the YAML schema in `guides/agent-eval/README.md`.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[structured-dev-cycle]], [[deep-verify]], [[multi-model-verification]], [[agent-eval-framework]]
- **See also**: [[R020]]
- **Guide**: [Agent Eval guide](../guides/agent-eval.md)

## Sources

- `.claude/skills/harness-eval/SKILL.md` — skill definition

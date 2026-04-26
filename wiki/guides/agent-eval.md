---
title: Agent Eval Guide
type: guide
updated: 2026-04-26
sources:
  - guides/agent-eval/README.md
related:
  - [[agent-eval-framework]]
  - [[harness-eval]]
  - [[evaluator-optimizer]]
  - [[deep-verify]]
  - [[R020]]
  - [[R009]]
  - [[R013]]
---

# Agent Eval Guide

Measurement methodology for the 4-metric quantitative agent evaluation framework.

## Overview

Derived from LangChain's "More evals ≠ better agents" philosophy: focus on four reproducible metrics rather than a large suite of ad-hoc checks. Quantitative metrics act as a **filter** (phase 1 gate) so measurement effort is spent only on agents that first pass correctness.

## Metrics in Detail

**correctness** — binary pass/fail on final state (file contents, test results). Partial passes decompose into sub-goals. Flaky tasks require 2/3 majority over 3 runs.

**step_ratio** — `actual_steps / ideal_steps`. Parallel tool calls in the same turn count as 1 step (no R009 penalty). Retries on failure count separately.

**tool_call_ratio** — `actual_tool_calls / ideal_tool_calls`. Redundant re-reads of the same file are counted individually. Parallel calls count individually (2 parallel Reads = 2 calls).

**latency_ratio** — `actual_latency / ideal_latency`. Correct for cold-start overhead; use median of 3 runs to smooth network jitter. Parallel ideal steps use max-duration rather than sum.

## Ideal Trajectory Annotation

Each task needs a `.claude/outputs/eval/{capability}/{task-id}.yaml` file specifying: `ideal_trajectory` steps with tool, target, rationale, estimated_ms; summary `metrics` block; `correctness_checks` (automatable: compile, test_pass, grep, file_exists).

Key anti-patterns: fixing step ordering when order doesn't matter, using subjective correctness checks, mismatching ideal trajectory and correctness checks.

## Integration with Existing Skills

| Skill | Integration |
|-------|-------------|
| [[harness-eval]] | Add 4-metric layer to each of the 15 benchmark tasks |
| [[evaluator-optimizer]] | Efficiency gate after rubric loop converges |
| [[deep-verify]] | Optional quantitative dimension for release checks |
| [[mgr-creator]] | Correctness gate before new agent deployment |

## Tracing (LangSmith Alternative)

Step traces stored via `claude-mem` per task; cross-session replay via `episodic-memory` search. Eval artifacts at `.claude/outputs/evals/` (JSONL + YAML). `statusline.sh` (R012) can surface live step counts.

## Related

- Skill: [[agent-eval-framework]] — executes this methodology
- Rule: [[R020]] — correctness check is R020's quantitative implementation
- Issue: #1025

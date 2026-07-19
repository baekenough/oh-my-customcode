---
title: Evaluator Optimizer
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/evaluator-optimizer/SKILL.md
related:
  - [[worker-reviewer-pipeline]]
  - [[pipeline-guards]]
  - [[reasoning-sandwich]]
  - [[agent-eval-framework]]
  - [[harness-eval]]
  - [[impeccable-design]]
---

# Evaluator Optimizer

Parameterized evaluator-optimizer loop for iterative quality improvement, generalized from [[worker-reviewer-pipeline]] beyond code review to any quality-critical domain (documentation, architecture, test plans, configs, UI generation).

## Overview

A generator agent produces output; an evaluator agent scores it against a configurable rubric (weighted criteria, quality-gate type: `all_pass` | `majority_pass` | `score_threshold`); the loop repeats until the gate passes or `max_iterations` (default 3, hard cap 5) is reached. Runs sequentially within the caller's context — this skill does NOT use `context: fork`. Generator and evaluator MUST be different agent invocations (no self-review), and the evaluator must receive the full rubric for consistent scoring. Iteration state (best score/output) is tracked by the orchestrator, not the skill.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Evaluator Leniency Counter-Measures

LLM evaluators default to generous scoring, especially same-model-family reviews. The skill prescribes: skepticism prompting ("default to fail when uncertain"), anti-self-praise bias instructions (credit execution not intent), and rubric `fail_example` fields — anchoring the scale reduces score inflation ~20%. An optional **pre-negotiation** phase (generator proposes rubric interpretation, evaluator adjusts) reduces wasted iterations for tasks needing 3+ rounds.

## Conditional Evaluator (Cost Optimization)

For tasks within the model's reliable capability range (low complexity, high generator confidence, historical pass rate ≥0.9), the evaluator can be skipped entirely — ~40% token savings. Complex/security-critical or previously-failed tasks always run the full loop; see the skill's decision matrix for the complexity/evaluator mapping.

## Efficiency Gate (added v0.113.0)

When multiple optimizer iterations produce passing variants (all meeting the rubric quality threshold), the [[agent-eval-framework]] 4-metric efficiency gate selects the winner:

1. **Quality phase** — existing rubric loop (unchanged)
2. **Efficiency phase** — among passing variants, prefer lower step_ratio + tool_call_ratio + latency_ratio

Apply when: multiple candidates pass the rubric, an objective tiebreaker is needed, or a cost/latency budget is active. Winner = variant with lowest weighted ratio sum.

## Domain Presets

Documented domain mappings (generator/evaluator/rubric focus) span code review, documentation, architecture, test plans/coverage, agent creation, and security audit. Two named presets: **UI generation** rubrics weight originality > craft > functionality (anti-AI-slop, works with [[impeccable-design]]); the **[[harness-eval]]** skill supplies a 15-task SE benchmark rubric (Test Coverage 30%, Architecture 25%, Error Handling 25%, Extensibility 20%) as a ready-made sprint contract.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[worker-reviewer-pipeline]], [[pipeline-guards]], [[reasoning-sandwich]], [[agent-eval-framework]], [[harness-eval]], [[impeccable-design]]
- **See also**: [[R009]] (sequential dependency — evaluator needs generator output), [[R010]] (orchestrator invokes agents via Agent tool)
- **Guide**: [Agent Eval guide](../guides/agent-eval.md)

## Sources

- `.claude/skills/evaluator-optimizer/SKILL.md` — skill definition

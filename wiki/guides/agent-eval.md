---
title: Agent Eval Guide
type: guide
updated: 2026-07-19
sources:
  - guides/agent-eval/README.md
related:
  - [[agent-eval-framework]]
  - [[harness-eval]]
  - [[evaluator-optimizer]]
  - [[deep-verify]]
  - [[worker-reviewer-pipeline]]
  - [[multi-model-verification]]
  - [[mgr-creator]]
  - [[monitoring-setup]]
  - [[R020]]
  - [[R009]]
---

# Agent Eval Guide

Measurement methodology for the 4-metric quantitative agent evaluation framework, adapted from [LangChain's Deep Agents evals post](https://www.langchain.com/blog/how-we-build-evals-for-deep-agents): "more evals ≠ better agents" — four reproducible metrics beat a large ad-hoc check suite. Metrics act as a **filter**: correctness gates before efficiency measurement runs, so measurement cost is not spent on agents that already fail the basics.

## Metrics in Detail

**correctness** — binary pass/fail on final state. Partial passes decompose into sub-goals; flaky tasks need 2/3 majority over 3 runs.

**step_ratio** — `actual_steps / ideal_steps`. Parallel tool calls in one turn count as 1 step (no R009 penalty); retries count separately.

**tool_call_ratio** — `actual_tool_calls / ideal_tool_calls`. Redundant re-reads count individually; parallel calls count individually. Guide: ≤1.0 re-check correctness, 1.0-1.3 acceptable, >1.5 inefficient.

**latency_ratio** — `actual_latency / ideal_latency`. Correct for cold-start overhead; median of 3 runs smooths network jitter; parallel ideal steps use max, not sum.

## Ideal Trajectory Annotation

Each task needs a `.claude/outputs/evals/{capability}/{task-id}.yaml` specifying `ideal_trajectory` steps (tool, target, rationale, estimated_ms), a `metrics` summary, and automatable `correctness_checks`. Anti-patterns: fixing step order when it doesn't matter, subjective correctness checks, mismatched trajectory/check pairs.

## Capability Taxonomy

Six capabilities classify tasks — `file_operations`, `retrieval`, `tool_use`, `memory`, `conversation`, `summarization` — each mapped to concrete tools/agents (file_operations → Write/Edit/lang-*-expert; memory → sys-memory-keeper). Cross-capability tasks pick a primary (most ideal-steps) and weight partial scores by step share.

## Integration with Existing Skills

| Skill | Integration |
|-------|-------------|
| [[harness-eval]] | Adds a 4-metric layer to each of its 15 benchmark tasks |
| [[evaluator-optimizer]] | Efficiency gate runs only after the rubric loop converges |
| [[worker-reviewer-pipeline]] | Review-fix loop exits on `correctness=pass` + `tool_call_ratio<=1.5`, else re-implements |
| [[deep-verify]] | Optional quantitative dimension — complements, not replaces, the security/UX checklist |
| [[multi-model-verification]] | Orthogonal: that skill checks output correctness across models, this framework checks trajectory efficiency |
| [[mgr-creator]] | New dynamic agents must clear `correctness=1` before routing registration |

## Tracing (LangSmith Alternative)

Step traces live under `.claude/outputs/evals/` (JSONL + YAML); `MEMORY.md` `## Metrics` lines double as a lightweight trace log. `/monitoring-setup trajectory-otel on` (#1035) exports the 4 metrics as [[monitoring-setup]] OTEL spans/events to any OTLP collector — independent of console monitoring, both can run together.

## Related

- Skill: [[agent-eval-framework]] — executes this methodology
- Rule: [[R020]] — correctness check is R020's quantitative implementation
- Issues: #1025 (origin), #1035 (OTEL export)

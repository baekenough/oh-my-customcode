---
title: Agent Eval Framework
type: skill
updated: 2026-04-26
sources:
  - .claude/skills/agent-eval-framework/SKILL.md
related:
  - [[harness-eval]]
  - [[evaluator-optimizer]]
  - [[deep-verify]]
  - [[multi-model-verification]]
  - [[mgr-creator]]
  - [[worker-reviewer-pipeline]]
---

# Agent Eval Framework

Quantitative, trajectory-based agent evaluation using a 4-metric framework.

## Overview

Fills the measurement gap in the existing evaluation stack: harness-eval covers SE task correctness, evaluator-optimizer handles qualitative rubric loops, but neither measures *how efficiently* an agent reached its answer. This skill adds trajectory comparison — correctness AND efficiency — relative to a hand-annotated ideal run.

## The 4-Metric Framework

| Metric | Formula | Direction |
|--------|---------|-----------|
| correctness | pass/fail per task | Phase 1 gate — must pass first |
| step_ratio | observed_steps / ideal_steps | lower is better |
| tool_call_ratio | observed_tool_calls / ideal_tool_calls | lower is better |
| latency_ratio | observed_latency / ideal_latency | lower is better |

Default thresholds: step_ratio ≤ 1.5, tool_call_ratio ≤ 1.3, latency_ratio ≤ 2.0.

## Phased Opt-in Gate

1. **Phase 1 — Correctness**: correctness ≥ 0.80 required before efficiency measurement. Failures are diagnosed and re-evaluated.
2. **Phase 2 — Efficiency**: step/tool_call/latency ratios computed, aggregated by capability category, compared to baseline. Regressions > 20% flagged.

> Note: renamed from "Phased Gate" to "Phased Opt-in Gate" in v0.114.0 (#1037) to clarify opt-in nature for new agents.

## Capability Taxonomy

Six categories map to oh-my-customcode tools: `file_operations` (Write/Edit), `retrieval` (Glob/Grep/Read), `tool_use` (Agent/Bash), `memory` (auto-memory/claude-mem), `conversation` (routing skills), `summarization` (result-aggregation). Aim for ≥ 3 tasks per category.

## Ideal Trajectories

Hand-annotated YAML files stored in `.claude/outputs/evals/trajectories/`, specifying `ideal_steps`, `ideal_tool_calls`, and `ideal_latency_seconds` per task.

## Usage

```
/omcustom:agent-eval-framework measure <agent> <task-id>
/omcustom:agent-eval-framework compare <variant-a> <variant-b>
/omcustom:agent-eval-framework gate <agent>   # correctness → efficiency
```

## Relationships

- **Complements**: [[harness-eval]] (adds efficiency layer to 15 SE tasks), [[evaluator-optimizer]] (efficiency gate after rubric pass)
- **Integrates with**: [[mgr-creator]] (Phase 1 gate before new agent deployment), [[worker-reviewer-pipeline]] (efficiency regression = re-review trigger)
- **Provides R020 evidence**: quantitative gate results as `[Done]` completion evidence
- **Guide**: [Agent Eval guide](../guides/agent-eval.md)

## Sources

- `.claude/skills/agent-eval-framework/SKILL.md` — skill definition
- `guides/agent-eval/README.md` — measurement methodology detail

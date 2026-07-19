---
title: Harness Eval
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/harness-eval/SKILL.md
related:
  - [[structured-dev-cycle]]
  - [[deep-verify]]
  - [[agent-eval-framework]]
  - [[evaluator-optimizer]]
  - [[multi-model-verification]]
---

# Harness Eval

Structured SE task benchmark suite for quantitative agent-quality scoring, adapted from [revfactory/claude-code-harness](https://github.com/revfactory/claude-code-harness) research that demonstrated a 60% quality gain (49.5 → 79.3 points) through structured pre-configuration.

## Overview

Runs 15 canonical software-engineering task definitions — API Design, Data Modeling, Authentication Flow, Test Suite Creation, Error Handler, Logging System, Configuration Manager, CLI Tool, Database Migration, Cache Layer, Queue Consumer, Middleware Chain, File Processor, Webhook Handler, Rate Limiter — each scored 0-100 across four weighted quality dimensions: Test Coverage (30%), Architecture Design (25%), Error Handling (25%), Extensibility (20%). Scores map to A-D grades (80+ production-ready, 0-39 significant structural issues). Two presets: `all` (full 15-task run, ~45min, default) and `quick` (top 5 high-impact tasks — API Design, Auth Flow, Test Suite Creation, Error Handler, Middleware Chain — ~15min).

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/harness-eval [--preset all|quick] [--task <name>]`
- **Effort**: high
- **Output**: `.claude/outputs/sessions/{YYYY-MM-DD}/harness-eval-{HHmmss}.md`, written directly under the R006/R010 `.claude/**` bypassPermissions convention (no `/tmp` wrapping, CC v2.1.121+)

## 4-Metric Quantitative Layer (added v0.113.0)

The 15 tasks measure correctness (pass/fail) only. [[agent-eval-framework]] layers efficiency metrics on top of each result — step_ratio, tool_call_ratio, latency_ratio (observed/ideal). Phase 1 gates on correctness; Phase 2 compares efficiency among passing variants against an ideal-trajectory YAML annotation defined per benchmark.

## Relationships

- **Feeds**: [[evaluator-optimizer]] — harness-eval rubric dimensions become `pre_negotiation` sprint-contract criteria (`/harness-eval → loads rubric → evaluator-optimizer executes → scoring → report`)
- **Related skills**: [[structured-dev-cycle]], [[deep-verify]], [[multi-model-verification]], [[agent-eval-framework]]
- **See also**: [[R020]] (completion verification — quantitative evidence attached to `[Done]` declarations)
- **Guides**: [Agent Eval](../guides/agent-eval.md) (4-metric measurement methodology), [Harness Engineering](../guides/harness-engineering.md) (benchmark evaluation layer placement)

## Sources

- `.claude/skills/harness-eval/SKILL.md` — skill definition

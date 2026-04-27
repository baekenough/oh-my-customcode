# deep-plan Guide

Companion documentation for `.claude/skills/deep-plan/SKILL.md`.

## Contents

- [phases.md](phases.md) — Phase-by-phase implementation detail (Phase 1 Discovery Research, Phase 2 Reality-Check Planning, Phase 3 Plan Verification)

## When to read this

The SKILL.md is intentionally thin — it carries only the workflow contract and inline directives that must survive Agent-tool prompt synthesis. Implementation detail is in this guide.

## Overview

Research-validated planning that eliminates the gap between research assumptions and actual code. Orchestrates a 3-phase cycle: Discovery Research → Reality-Check Planning → Plan Verification.

**Teams-compatible** — works both from the main conversation (R010) and inside Agent Teams members.

## Usage

```
/deep-plan <topic-or-issue>
/deep-plan "implement caching layer for API responses"
/deep-plan #325 new authentication system
/deep-plan Rust async runtime migration
```

## Problem Solved

Research-only analysis produces findings based on assumptions about the codebase. These assumptions often diverge from reality:

| Assumption | Reality | Impact |
|------------|---------|--------|
| "Feature X is missing" | Already implemented | Wasted effort on duplicate work |
| "Pattern Y is needed" | Partially exists | Over-engineering existing code |
| "Library Z is required" | Already a dependency | Unnecessary integration effort |

`/deep-plan` solves this by cross-referencing research findings against actual code before committing to a plan.

## Architecture

3-phase pipeline:

| Phase | Name | Key Activity | Model |
|-------|------|-------------|-------|
| 1 | Discovery Research | 10-team parallel via `/research` | sonnet + opus |
| 2 | Reality-Check Planning | 3 Explore agents + gap analysis | haiku + opus |
| 3 | Plan Verification | 3 focused verification teams | sonnet + opus |

## Differentiation

| Skill | Scope | Code Verification | Phases |
|-------|-------|-------------------|--------|
| `/research` | Analysis only | None — assumption-based | 1 |
| Plan mode | Planning only | Yes — code exploration | 1 |
| `/structured-dev-cycle` | Full implementation | Yes — stage-by-stage | 6 |
| **`/deep-plan`** | **Analysis + Planning + Verification** | **3-pass cross-verification** | **3** |

## Cost Profile

| Phase | Approximate Cost | Driver |
|-------|-----------------|--------|
| Phase 1 | High | Full 10-team `/research` invocation |
| Phase 2 | Low-Medium | Up to 3 Explore agents (haiku) + 1 opus synthesis |
| Phase 3 | Medium | 3 sonnet verification teams + 1 opus synthesis |
| **Total** | **High** | Dominated by Phase 1 research cost |

Designed for high-stakes decisions where plan quality justifies the cost. For quick planning, use `EnterPlanMode` directly.

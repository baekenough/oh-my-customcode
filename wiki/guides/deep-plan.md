---
title: Deep Plan Guide
type: guide
updated: 2026-04-27
sources:
  - guides/deep-plan/README.md
  - guides/deep-plan/phases.md
related:
  - [[skills/deep-plan]]
  - [[skills/research]]
  - [[skills/structured-dev-cycle]]
  - [[rules/r009]]
  - [[rules/r010]]
  - [[rules/r018]]
  - [[guides/harness-engineering]]
---

# Deep Plan Guide

Research-validated planning that eliminates the gap between research assumptions and actual code. Orchestrates a 3-phase cycle — Discovery Research → Reality-Check Planning → Plan Verification — before committing to an implementation plan.

## What this guide covers

- Phase-by-phase implementation detail for the `/deep-plan` skill
- Teams mode vs orchestrator mode differences (inline research vs `Skill(research)`)
- Deliverable dependency matrix construction and override semantics
- Sensitive-path artifact protocol for Phase 3 verification report
- REVISE loop limit (2 cycles before user escalation)

## 3-Phase Architecture

| Phase | Name | Key Activity | Model |
|-------|------|-------------|-------|
| 1 | Discovery Research | 10-team parallel via `/research` | sonnet + opus |
| 2 | Reality-Check Planning | Up to 3 Explore agents + gap analysis | haiku + opus |
| 3 | Plan Verification | 3 focused verification teams | sonnet + opus |

## Problem Solved

Research-only analysis produces assumptions that often diverge from reality (e.g., "Feature X is missing" when it already exists). Phase 2 cross-references every ADOPT/ADAPT/AVOID research finding against actual code before the plan is finalized — removing overestimates, adapting partial gaps, and keeping only real gaps.

## Differentiation

| Skill | Phases | Code Verification |
|-------|--------|-------------------|
| `/research` | 1 | None |
| Plan mode | 1 | Yes (single pass) |
| `/structured-dev-cycle` | 6 | Yes (stage-by-stage) |
| **`/deep-plan`** | **3** | **3-pass cross-verification** |

## Teams Mode

When running inside an Agent Teams member, Phase 1 executes the research workflow inline (NOT via `Skill(research)`) because fork context blocks sub-agent spawning. Phase 3 delivers the verified plan via `SendMessage` to the team lead instead of returning to the main conversation.

## Companion skill

`.claude/skills/deep-plan/SKILL.md` carries the workflow contract and inline directives that must survive Agent-tool prompt synthesis. This guide carries phase implementation detail.

## See also

- [[skills/deep-plan]] — workflow contract (thin SKILL.md)
- [[skills/research]] — Phase 1 research engine (10-team parallel)
- [[skills/structured-dev-cycle]] — next step after a PASS verdict for complex implementations
- [R009](../rules/r009.md) — parallel execution for Phase 2 Explore agents and Phase 3 teams
- [R018](../rules/r018.md) — Agent Teams preferred for Phase 3 (3-team threshold)

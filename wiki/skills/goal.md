---
title: Goal
type: skill
scope: core
updated: 2026-05-08
sources:
  - .claude/skills/goal/SKILL.md
related:
  - [[ambiguity-gate]]
  - [[idea]]
  - [[sdd-dev]]
  - [[deep-plan]]
  - [[result-aggregation]]
  - [[R020]]
---

# Goal

Disciplined goal-to-execution workflow — parses any user objective, gates on ambiguity, plans, executes, and verifies before reporting.

## Overview

A thin orchestrator skill that wires together the full task lifecycle in a fixed sequence: parse the objective, ask only for materially missing requirements (via ambiguity-gate), inspect the repo (via idea), choose the right planning path (sdd-dev or deep-plan), execute safely, verify completion per R020, and report. It is intentionally a wrapper — it adds no domain logic of its own, only sequencing and routing discipline.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/goal`
- **Argument hint**: `<objective or task description>`
- **Issue**: #1109

## Workflow

1. **Parse** — extract concrete objective and implicit constraints from user input
2. **Ambiguity Gate** — invoke [[ambiguity-gate]]; block only on materially missing requirements (scope ≥ 0.5); surface questions once
3. **Inspect** — invoke [[idea]] to analyze the repo: affected modules, feasibility, estimated issue count
4. **Plan** — choose planning path:
   - Simple / spec-driven tasks → [[sdd-dev]]
   - Complex / multi-domain tasks → [[deep-plan]]
5. **Execute** — delegate implementation to specialist agents per R010
6. **Verify** — apply R020 task-type completion matrix; do not declare done until criteria pass
7. **Report** — aggregate results via [[result-aggregation]] and present summary

## When to Use

- When a user provides a high-level objective and wants disciplined, end-to-end execution with no premature commitment
- When ambiguity risk is unknown and you want an automatic gate before planning begins
- When the objective spans multiple phases (planning + implementation + verification)

## When NOT to Use

- Single-step read-only tasks (use the target skill directly)
- Already-planned work with a concrete spec ready (skip to sdd-dev or deep-plan)
- Exploratory research without an execution target (use [[idea]] or [[deep-plan]] alone)

## Integration

| Partner | Role |
|---------|------|
| [[ambiguity-gate]] | Scores clarity; halts on score ≥ 0.5 until gaps are filled |
| [[idea]] | Repo analysis and feasibility assessment |
| [[sdd-dev]] | Spec-driven planning and implementation for well-scoped tasks |
| [[deep-plan]] | Multi-domain planning for complex or ambiguous objectives |
| [[result-aggregation]] | Aggregates multi-agent outputs into a single report |
| [R020](../rules/r020.md) | Completion verification gate before reporting done |

## Cross-References

- [wiki/skills/ambiguity-gate.md](ambiguity-gate.md)
- [wiki/skills/idea.md](idea.md)
- [wiki/skills/sdd-dev.md](sdd-dev.md)
- [wiki/skills/deep-plan.md](deep-plan.md)
- [wiki/rules/r020.md](../rules/r020.md)

## Sources

- `.claude/skills/goal/SKILL.md` — skill definition

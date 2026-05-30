---
title: Multi-Agent Debate Patterns
type: guide
updated: 2026-04-25
sources:
  - guides/multi-agent-debate-patterns/README.md
related:
  - [[roundtable-debate]]
  - [[adversarial-review]]
  - [[evaluator-optimizer]]
  - [[R009]]
  - [[R018]]
---

# Multi-Agent Debate Patterns

Reference guide for the three failure modes of multi-LLM debate and the structural mechanisms that prevent them.

## Overview

Multi-agent debate improves decision quality but introduces systematic failure modes absent in single-agent review. This guide describes the failure modes, the mechanisms that counter them, and a selection matrix for choosing the right debate skill.

## Three Failure Modes

| Mode | Description | Prevention |
|------|-------------|-----------|
| Anchoring Effect | First speaker constrains all subsequent reasoning | Round 0 — independent parallel analysis before peer exposure |
| Groupthink | Majority pressure silences critical views; LLMs prefer agreeable responses | Devil's Advocate slot — mandatory dissenter |
| Degeneration of Thought | Diversity decreases as round count increases (research-backed) | 2-round hard cap |

**Minority opinion protection:** any 1-agent view is preserved on a separate track; rejection requires 3 explicit justifications.

## Skill Selection Matrix

| Situation | Recommended | Reason |
|-----------|-------------|--------|
| Architecture tradeoff evaluation | [[roundtable-debate]] | Divergence preservation |
| Security audit (attacker viewpoint) | [[adversarial-review]] | Single-perspective adversary |
| Code quality improvement loop | [[evaluator-optimizer]] | Evaluate → improve cycle |
| Risk discovery (blind spots) | [[roundtable-debate]] | Multiple personas |
| Output validation (pass/fail) | [[multi-model-verification]] | Multiple Claude model tiers, single verdict |
| Spec finalization (single answer needed) | [[multi-model-verification]] | Parallel model convergence |

## Termination Conditions

| Skill | Termination | Output |
|-------|-------------|--------|
| [[multi-model-verification]] | All model tiers agree | Single consensus report |
| [[roundtable-debate]] | 2 rounds reached | Consensus + minority opinions + Devil's Advocate dissent |
| [[adversarial-review]] | Single round complete | Vulnerability list |
| [[evaluator-optimizer]] | Evaluation passes | Improved artifact |

## Research Basis

| Mechanism | Basis |
|-----------|-------|
| 2-round hard cap | Multi-LLM debate diversity studies (cc-roundtable attribution) |
| Devil's Advocate | Janis (1972) Groupthink theory |
| Independent-first analysis | Asch conformity studies — forming opinions before exposure reduces conformity |

## Attribution

Anchoring/Groupthink/Degeneration of Thought taxonomy and Devil's Advocate + minority protection mechanisms from [cc-roundtable](https://github.com/gaebalai/cc-roundtable) by gaebalai. R016 attribution policy observed.

## Sources

- `guides/multi-agent-debate-patterns/README.md` — primary guide
- `.claude/skills/roundtable-debate/SKILL.md` — implementation

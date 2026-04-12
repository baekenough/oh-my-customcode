---
title: Reasoning Sandwich
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/reasoning-sandwich/SKILL.md
related:
  - [[structured-dev-cycle]]
  - [[multi-model-verification]]
  - [[evaluator-optimizer]]
---

# Reasoning Sandwich

Template for pre-reasoning → action → post-reasoning agent pattern.

## Overview

Implements the reasoning sandwich pattern: an opus-class model reasons about the task (pre-reasoning), a sonnet-class model executes the action, and an opus/sonnet model verifies the result (post-reasoning). This pattern maximizes quality for high-stakes operations while keeping execution cost reasonable. Used by structured-dev-cycle (stages 1-2 use opus, stage 3 uses sonnet).

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[structured-dev-cycle]], [[multi-model-verification]], [[evaluator-optimizer]]
- **See also**: [[R006]]

## Sources

- `.claude/skills/reasoning-sandwich/SKILL.md` — skill definition

---
title: Multi-Model Verification
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/multi-model-verification/SKILL.md
related:
  - [[structured-dev-cycle]]
  - [[deep-plan]]
  - [[deep-verify]]
---

# Multi-Model Verification

Parallel code verification using multiple Claude models for higher confidence.

## Overview

Spawns multiple Claude instances with different models (haiku, sonnet, opus) to verify the same code or plan in parallel, then aggregates findings. Each model brings different reasoning depth and blind spots. Disagreements are flagged for human review. Used in structured-dev-cycle stages 2 and 4 for plan and implementation verification. Uses a single LLM provider (Claude) across multiple model tiers (haiku/sonnet/opus).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[structured-dev-cycle]], [[deep-plan]], [[deep-verify]], [[reasoning-sandwich]]
- **See also**: [[R009]], [[R018]]

## Sources

- `.claude/skills/multi-model-verification/SKILL.md` — skill definition

---
title: Multi-Model Verification
type: skill
updated: 2026-08-15
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

## Prerequisites — None

This skill has **no prerequisites** and runs fully without Agent Teams: the three reviewers spawn as parallel Agent tool calls (`[1] opus` architecture, `[2] sonnet` quality, `[3] haiku` style). Agent Teams is an optional alternate path, used only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **AND** `TeamCreate` is present in the tool list — the env var alone is not sufficient, and `SendMessage` presence is not evidence of Teams ([[R018]] Detection). In Teams mode the reviewers become team members exchanging cross-cutting findings via `SendMessage`; otherwise they are independent parallel agents whose findings the caller aggregates.

Earlier revisions described the non-Teams path as a fallback to **sequential** execution, which contradicted the skill's own Agent Tool Fallback section — the fallback has always spawned the three reviewers in parallel, so Teams affects only inter-reviewer communication, not parallelism or capability.

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
- Content-drift resync 2026-08-15 (v1.1.47, #1582): Prerequisites corrected — the source dropped "Agent Teams enabled … for full parallel execution / falls back to **sequential**" in favour of "None; runs fully without Agent Teams via parallel Agent tool calls", resolving a self-contradiction with the skill's Agent Tool Fallback section. Teams availability also tightened to env var **AND** `TeamCreate` present.

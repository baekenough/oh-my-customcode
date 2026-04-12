---
title: Model Escalation
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/model-escalation/SKILL.md
related:
  - [[stuck-recovery]]
  - [[pipeline-guards]]
  - [[R006]]
---

# Model Escalation

Advisory model escalation based on task outcome tracking.

## Overview

Tracks task outcomes per agent type and advises model upgrades when failures accumulate. Escalation path: `haiku → sonnet → opus`. Triggers: 2+ failures with same model for same agent type, or 3+ consecutive failures globally. De-escalates after sustained success. Advisory-only — orchestrator makes final decision (R010). Implemented via PostToolUse/PreToolUse hooks with PPID-scoped temp file for state.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator (via hooks)
- **Related skills**: [[stuck-recovery]], [[pipeline-guards]]
- **See also**: [[R006]], [[R010]], [[R021]]

## Sources

- `.claude/skills/model-escalation/SKILL.md` — skill definition

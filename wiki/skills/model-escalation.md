---
title: Model Escalation
type: skill
updated: 2026-07-29
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

Tracks task outcomes per agent type and advises model upgrades when failures accumulate. Escalation path: `haiku → sonnet → opus` (de-escalation: `opus → sonnet → haiku`; `opus` is the top tier, so no further escalation target exists above it). These are Tier-3 Agent-tool `model` param enum values (see [[wiki/rules/r006]] "3-tier model specification") — the advisory operates at spawn time, not frontmatter, so it uses the 4-value enum (`sonnet`\|`opus`\|`haiku`\|`fable`), not full model IDs or the deprecated `sonnet5`/`opus5` shorthand. Triggers: 2+ failures with same model for same agent type, or 3+ consecutive failures globally. De-escalates after sustained success. Advisory-only — orchestrator makes final decision (R010). Implemented via PostToolUse/PreToolUse hooks with PPID-scoped temp file for state.

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

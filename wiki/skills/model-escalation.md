---
title: Model Escalation
type: skill
updated: 2026-11-06
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

Tracks task outcomes per agent type and advises model upgrades when failures accumulate (wired status below). Escalation path: `haiku → sonnet → opus` (de-escalation: `opus → sonnet → haiku`; `opus` is the top tier, so no further escalation target exists above it). These are Tier-3 Agent-tool `model` param enum values (see [[wiki/rules/r006]] "3-tier model specification") — the advisory operates at spawn time, not frontmatter, so it uses the 4-value enum (`sonnet`\|`opus`\|`haiku`\|`fable`), not full model IDs or the deprecated `sonnet5`/`opus5` shorthand. Triggers: 2+ recorded failures for the same agent type (any model), or 3+ consecutive failures — both evaluated per spawn (not globally) and only for haiku/sonnet spawns. Thresholds are hard-coded in `model-escalation-advisor.sh`; there is no frontmatter or settings switch. De-escalation is opt-in via `OMCUSTOM_MODEL_DEESCALATION=on`. Each advisory is shown once per session (atomic marker dirs). Advisory-only — orchestrator makes final decision (R010). `task-outcome-recorder.sh` runs on SubagentStop only, which carries no failure signal, so as wired the ledger writer records success only and the escalation advisory is unreachable (the writer still has a failure branch that this wiring never reaches); the PreToolUse advisor delivers via `additionalContext`. De-escalation fires on consecutive success rows, since ledger rows carry model `inherit` and "after escalation" cannot be told apart. The advisory's cost multiplier comes from the model tier; ledger rows (PPID-scoped temp file) have no cost field.

## Advisory Format

The advisory block lists agent type, current model, the recommended next model, the cost impact per task, and a reason line; it no longer prints a recent-failures counter.

## Probe Record (#1912)

Measured on CC 2.1.318 with `claude -p` and a haiku model: `PostToolUseFailure` fired for a spawn error and for a subagent ended by an API error, but not when a subagent exceeded `maxTurns` (two runs). A failure after several successful turns and interactive sessions were not observed. Nothing writes these failures to the ledger; the failure-row writer proposal was closed without implementation.

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
- Content-drift resync 2026-11-06 (v2.0.16): ledger writer described as recording success only as wired (escalation advisory unreachable), de-escalation tied to consecutive success rows, cost multiplier derived from the model tier (no ledger cost field), corrected Advisory Format, and the #1912 Probe Record.

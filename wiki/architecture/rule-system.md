---
title: Rule Enforcement System
type: architecture
updated: 2026-08-29
sources:
  - .claude/rules/MUST-enforcement-policy.md
  - .claude/rules/MUST-continuous-improvement.md
  - CLAUDE.md
related:
  - [[overview]]
  - [[wiki/rules/r021]]
  - [[wiki/rules/r016]]
  - [[wiki/rules/r007]]
  - [[wiki/rules/r008]]
  - [[quality-workflow]]
---

# Rule Enforcement System

oh-my-customcode uses an **advisory-first enforcement model**: most behavioral rules are enforced through prompt engineering and PostCompact context injection rather than hard-blocking hooks. This preserves agent flexibility while maintaining behavioral standards.

## Overview

23 rules span three priority levels:

| Priority | Count | Enforcement Mechanism |
|----------|-------|-----------------------|
| **MUST** | 14 | Prompt + PostCompact hooks; selective hard blocks |
| **SHOULD** | 8 | Prompt injection only |
| **MAY** | 1 | Optional guidance |

Rules live in `.claude/rules/` and are auto-injected into the system prompt. After context compaction, critical MUST rules are re-injected via PostCompact hooks to combat "compaction amnesia." A newer complement, `claude-md-reinject.sh` (SessionStart, matcher `*`, #1617), re-injects the full project `CLAUDE.md` text on every session start (startup/resume/clear) and on compact-resume — closing the gap where PostCompact only re-injects rule *summaries*, not the CLAUDE.md original. Opt-out via `OMCUSTOM_CLAUDEMD_REINJECT=off`; degrades silently (no-op) if `CLAUDE.md` or `jq` is missing.

## Enforcement Tiers

| Tier | Mechanism | Rules Covered | Behavior |
|------|-----------|---------------|----------|
| **Hard Block** | PreToolUse hook, `exit 2` | `stage-blocker`, `dev-server-tmux`, `rule-deletion-guard` | Prevents tool execution entirely |
| **Soft Block** | Stop hook prompt | R011 session-end saves | Auto-performs required action, then approves |
| **Advisory** | PostToolUse hooks | R007, R008, R009, R010, R018 | Emits warning to stderr, never blocks |
| **Prompt-based** | CLAUDE.md + rules/ + PostCompact | All MUST rules | Behavioral guidance injected into model context |

### Why Advisory-First

1. **Agent flexibility**: Hard blocks can trap agents in unrecoverable states when dependencies (e.g., `jq`) are missing
2. **Graceful degradation**: Missing tools don't break sessions
3. **Composability**: External skills and internal rules can coexist without deadlocks
4. **PostCompact reinforcement**: R007/R008/R009/R010/R018 are re-injected after context compaction

## MUST Rules Reference

| ID | Rule | Core Requirement |
|----|------|-----------------|
| R000 | Language Policy | Korean I/O, English files |
| R001 | Safety | No destructive operations without approval |
| R002 | Permissions | Tool tier access control |
| R006 | Agent Design | Frontmatter standards, separation of concerns |
| R007 | Agent Identification | Every response starts with `┌─ Agent:` header |
| R008 | Tool Identification | Every tool call prefixed with `[agent][model]` |
| R009 | Parallel Execution | 2+ independent tasks must parallelize |
| R010 | Orchestrator Coordination | Orchestrator never writes files directly |
| R015 | Intent Transparency | Display routing decisions with confidence % |
| R016 | Continuous Improvement | Rule violations trigger rule updates |
| R017 | Sync Verification | mgr-sauron passes before any git push |
| R018 | Agent Teams | Required for qualifying tasks when enabled |
| R020 | Completion Verification | Verify actual outcomes before declaring done |
| R021 | Enforcement Policy | Advisory-first model |

## Continuous Improvement (R016)

When a rule violation is identified, the workflow is:
1. Acknowledge the violation
2. Identify which rule was weak or unclear
3. **Update the rule before continuing the original task**
4. **Rule Wiring Check** — confirm the new/edited clause is actually wired into an execution path (workflow step, hook, CI check), not just described in prose; if no execution path applies, state "wiring not required" explicitly (see [[wiki/rules/r016]] #1533)
5. Commit the rule change
6. Resume original work

Rule updates are never deferred to a TODO. They happen in the same session as the violation.

## Hard Enforcement Candidates

Rules that may be promoted to hard-block if advisory enforcement proves insufficient:

| Rule | Candidate Hook | Promotion Condition |
|------|---------------|---------------------|
| R010 | `git-delegation-guard.sh` | Orchestrator-direct-write violations > 3/session |
| R007/R008 | (new hook) | Identification omission rate > 20% |

## Relationships

- **Depends on**: [[wiki/rules/r021]] (enforcement policy), [[wiki/rules/r016]] (improvement loop)
- **Used by**: All agents operate within this rule system
- **See also**: [[quality-workflow]], [[wiki/rules/r017]] (sync verification)

## Sources

- `.claude/rules/MUST-enforcement-policy.md` — R021 full enforcement tiers
- `.claude/rules/MUST-continuous-improvement.md` — R016 improvement workflow
- `CLAUDE.md` — rule summary table
- Count resync 2026-08-05: rule count corrected 21→23, SHOULD count corrected 6→8 (measured: `ls .claude/rules/*.md` = 23 total, MUST=14, SHOULD=8, MAY=1). MUST/MAY counts were already accurate and left unchanged.
- Content-drift resync 2026-08-29 (v1.1.50, #1617): documented the new `claude-md-reinject.sh` SessionStart hook (full CLAUDE.md re-injection on startup/resume/clear/compact) alongside the existing PostCompact summary re-injection.

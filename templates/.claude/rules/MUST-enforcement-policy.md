# [MUST] Enforcement Policy

> **Priority**: MUST | **ID**: R021

## Core Policy

oh-my-customcode uses an **advisory-first enforcement model**. Most rules are enforced through prompt engineering (CLAUDE.md, rules/, PostCompact hook) rather than hard-blocking hooks. This is intentional — it preserves agent flexibility while maintaining behavioral standards.

## Enforcement Tiers

| Tier | Mechanism | Rules | Behavior |
|------|-----------|-------|----------|
| Hard Block | PreToolUse hook, exit 2 | stage-blocker, dev-server tmux, rule-deletion-guard | Prevents tool execution |
| Soft Block | Stop hook prompt | R011 session-end saves | Auto-performs then approves |
| Conversation Block | PostToolUse hook + `continueOnBlock` (CC v2.1.139+), exit 2 | stuck-detector, context-budget-advisor, cost-cap-advisor | Feeds rejection reason into conversation; Claude continues with awareness |
| Advisory | PostToolUse hooks | R007, R008, R009, R010, R018 | Warns via stderr, never blocks |
| Advisory (proactive) | UserPromptSubmit hook | R007, R008 (`r007-r008-drift-advisor.sh`, #1229) | Reads last assistant turn; emits stderr advisory before next response if header/prefix absent. Complements retroactive Stop-hook (`session-reflection.sh`, #1190). |
| Prompt-based | CLAUDE.md + rules/ + PostCompact | All MUST rules | Behavioral guidance in context |

## Why Advisory-First

1. **Agent flexibility**: Hard blocks can trap agents in unrecoverable states
2. **Graceful degradation**: Missing dependencies (jq, etc.) don't break the session
3. **Composability**: External skills and internal rules can coexist without deadlocks
4. **PostCompact reinforcement**: R007/R008/R009/R010/R018 are re-injected after context compaction

## Hard Enforcement Candidates — R010 git-delegation-guard (conditional), R007/R008 UserPromptSubmit advisory **implemented** (#1229, proactive) + retroactive Stop-hook (#1190); hard-block variant still candidate if advisory insufficient (#1096). Promoted: rule-deletion-guard.sh (2026-04-08). See details via Read tool.

<!-- DETAIL: Hard Enforcement Candidates (Future)
If advisory enforcement proves insufficient for specific rules, these are candidates for promotion to hard-block:

| Rule | Candidate Hook | Status | Condition for Promotion |
|------|---------------|--------|------------------------|
| R010 | git-delegation-guard.sh | Candidate | If orchestrator-direct-write violations exceed 3/session |
| R007/R008 | `r007-r008-drift-advisor.sh` (UserPromptSubmit, #1229) | **Advisory implemented** — proactive pre-response check; retroactive: `session-reflection.sh` (Stop, #1190). Two-layer drift detection: proactive (#1229) + retroactive (#1190). | Promote to hard-block if advisory proves insufficient (#1096) |

Promotion requires: (1) measured violation rate data, (2) user approval, (3) rollback plan.

### Promoted to Hard Block

| Hook | Date | Justification |
|------|------|---------------|
| `rule-deletion-guard.sh` | 2026-04-08 | User-requested: rule files must require individual confirmation before deletion. Prevents accidental bulk deletion of project rules. |
-->

## Integration

| Rule | Interaction |
|------|-------------|
| R010 | git-delegation-guard.sh is advisory; could promote to blocking |
| R016 | Violations trigger rule updates, not enforcement changes |
| PostCompact | Re-injects critical rules to combat context compaction amnesia |

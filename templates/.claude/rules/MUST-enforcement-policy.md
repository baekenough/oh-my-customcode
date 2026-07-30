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
| Advisory (proactive) | UserPromptSubmit + SubagentStop hooks | R007, R008 (`r007-r008-drift-advisor.sh`, #1229 UserPromptSubmit; #1545 added SubagentStop) | Reads last assistant turn; emits stderr advisory if header/prefix absent. SubagentStop wiring (#1545) closes a structural gap: UserPromptSubmit fires only on user input, so long-lived autonomous loops (e.g. `/fsd`) that re-enter via task notifications (no user input) never reached the advisor — measured 2026-07-30: 6 responses / 12 tool calls with missing R007/R008 and zero advisory fires. Complements retroactive Stop-hook (`session-reflection.sh`, #1190). **Delivery gap resolved (#1547, v1.1.40)**: stderr on exit 0 is never injected into model context by any hook event, so #1545's wiring fired without reaching the model. The advisory is now delivered via `hookSpecificOutput.additionalContext` (JSON stdout, exit 0) — the confirmed non-blocking context-injection path for both events; stderr is retained only as a human-visible audit trail. No top-level `decision`/`continue`/`stopReason` field is emitted, so the hook stays advisory (never blocks a Stop/SubagentStop). |
| Prompt-based | CLAUDE.md + rules/ + PostCompact | All MUST rules | Behavioral guidance in context |

<!--
> **v2.1.163+**: Stop and SubagentStop hooks can return `hookSpecificOutput.additionalContext` (JSON) to feed structured feedback back into Claude's context without triggering a hook error label. This enables advisory-style enforcement via Stop/SubagentStop hooks (e.g., `session-reflection.sh`, omcustom-loop SubagentStop) to pass richer context — replacing plain stderr text — without disrupting the turn continuation behavior that advisory-first enforcement relies on.

> **v2.1.199+**: SessionStart/Setup/SubagentStart hook이 exit code 2로 종료할 때 stderr를 조용히 숨기던 문제가 수정되어 이제 오류가 표시됩니다. Hard Block/Advisory 계층(위 Enforcement Tiers 표)의 훅 실패 관측성을 강화합니다 — cf. v2.1.163 `additionalContext` 구조화 피드백.
-->

> **v2.1.210+**: hook callback timeout이 모델에 user rejection으로 오보고되어 unattended 세션이 정지 대기하던 문제가 수정되었습니다. R021 advisory 훅(PostToolUse/UserPromptSubmit/Stop 등)이 매 턴 발화하고 /fsd 등 장기 무인 루프가 이에 의존하므로, hook timeout이 더 이상 phantom rejection으로 무인 세션을 중단시키지 않습니다 — cf. v2.1.199 훅 실패 관측성.

> **v2.1.211/212/214+**: 훅의 enforcement 결정이 auto/unattended 모드에서 안정적으로 존중되도록 세 건이 수정되었습니다 — (211) auto mode가 unsandboxed Bash에 대한 PreToolUse 훅의 `ask` 결정을 덮어쓰던 문제가 수정되어 훅 `ask`가 최소 prompt로 floor되고, (212) `continue:false` 훅의 halt가 도구 실패·중간 완료 시 누락되던 문제 및 훅 인프라 오류가 user rejection으로 오보고되던 문제가 수정되었으며, (214) 훅 stdout JSON이 스키마 검증에 실패할 때 exit code 2가 문서대로 차단하지 못하던 문제가 수정되었습니다. R021 Enforcement Tiers(Hard Block=exit 2, Conversation Block=continueOnBlock exit 2, Advisory)가 훅의 block/ask 결정 존중에 의존하므로, 세 수정 모두 hard-block·advisory 훅(stage-blocker, rule-deletion-guard, stuck-detector 등)의 강제 신뢰성을 강화합니다 — v2.1.210 훅 timeout phantom-rejection 수정의 연장선.

## Why Advisory-First

1. **Agent flexibility**: Hard blocks can trap agents in unrecoverable states
2. **Graceful degradation**: Missing dependencies (jq, etc.) don't break the session
3. **Composability**: External skills and internal rules can coexist without deadlocks
4. **PostCompact reinforcement**: R007/R008/R009/R010/R018 are re-injected after context compaction

## Hard Enforcement Candidates — R010 git-delegation-guard (conditional), R007/R008 advisory **implemented** (#1229 UserPromptSubmit, proactive) + **#1545 SubagentStop** (closes autonomous-loop gap) + retroactive Stop-hook (#1190); model-context delivery fixed via `hookSpecificOutput.additionalContext` (#1547, v1.1.40); hard-block variant still candidate if advisory insufficient (#1096). Promoted: rule-deletion-guard.sh (2026-04-08). See details via Read tool.

<!-- DETAIL: Hard Enforcement Candidates (Future)
If advisory enforcement proves insufficient for specific rules, these are candidates for promotion to hard-block:

| Rule | Candidate Hook | Status | Condition for Promotion |
|------|---------------|--------|------------------------|
| R010 | git-delegation-guard.sh | Candidate | If orchestrator-direct-write violations exceed 3/session |
| R007/R008 | `r007-r008-drift-advisor.sh` (UserPromptSubmit #1229 + SubagentStop #1545) | **Advisory implemented** — proactive pre-response check now wired to both UserPromptSubmit and SubagentStop; the SubagentStop leg (#1545) closes the no-user-input autonomous-loop gap (`/fsd` etc.). Retroactive: `session-reflection.sh` (Stop, #1190). Two-layer drift detection: proactive (#1229/#1545) + retroactive (#1190). **Delivery mechanism fixed (#1547, v1.1.40)** — stderr on exit 0 reaches only a human (transcript debug mode), never the model, so wiring alone did not prove advisory reach; the advisory now travels via `hookSpecificOutput.additionalContext` on JSON stdout with exit 0, and emits no top-level `decision`/`continue`/`stopReason` so it remains non-blocking. | Promote to hard-block if advisory proves insufficient (#1096) |

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

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
| Advisory (proactive) | UserPromptSubmit + SubagentStop + PostToolUse hooks | R007, R008 (`r007-r008-drift-advisor.sh` — #1229 UserPromptSubmit, #1545 SubagentStop, #1553 PostToolUse) | Reads last assistant turn; emits advisory if header/prefix absent. SubagentStop wiring (#1545) closes the no-user-input autonomous-loop gap (`/fsd`); PostToolUse (#1553) covers the orchestrator-only stretch before the first subagent spawn. Complements retroactive Stop-hook (`session-reflection.sh`, #1190). **v1.1.43부터 실제 발화 — 아래 각주 참조.** v1.1.49부터 역방향(announce > tool_use) 신호 포함, 기본 off 옵트인 (#1595 #6). |
| Advisory (telemetry) | PostToolUseFailure hook | — (계측 전용, 규칙 강제 없음) | `failure-ledger.sh` (#1561, v1.1.44) — 도구 실패를 JSONL 원장에 append. stdout/stderr 무출력이라 모델에 도달하지 않으며 절대 차단하지 않음 |
| Advisory (proactive) | UserPromptSubmit hook | R020 (원인 진단) | `fail-axis-cause-advisor.sh` (#1561, v1.1.44) — 원장에 실패 기록이 있는데 원인 진술 없는 재촉 프롬프트가 오면 `hookSpecificOutput.additionalContext`로 "원인 가설 되묻기" advisory 전달. 원장 부재 시 조용히 통과 |
| Prompt-based | CLAUDE.md + rules/ + PostCompact | All MUST rules | Behavioral guidance in context |

> **Advisory (proactive/retroactive) 발화 결함과 해소 (실측)**: `hookSpecificOutput.additionalContext` **전달 경로 자체는 #1547(v1.1.40)에서 구현**됐으나, 그 앞단 **파서 셀렉터 결함**으로 advisory가 **v1.1.42까지 한 번도 발화하지 못했다** — `jq -r '.role'`로 읽었으나 트랜스크립트 최상위에 `role` 키가 없어(실제는 `.message.role`) `last_assistant`가 항상 비고 즉시 `exit 0`으로 종료됐다. 당시 실측: 트랜스크립트 771개 전수에서 `"additionalContext":` 출현 0건, 라이브 프로브 stdout/stderr 각 0바이트. **proactive(`r007-r008-drift-advisor.sh`)와 retroactive(`session-reflection.sh`, 동일 결함) 두 계층 모두 미발화**였다. **v1.1.43에서 양 계층 파서 복구 + `PostToolUse` 배선을 완료했고, 라이브 프로브로 최초 발화를 확인했다(#1553).** 후속으로 v1.1.44에서 R008 판정을 블록 인접 비교 → 턴 단위 개수 비교로 전환(#1563), v1.1.45에서 Skill 도구 면제를 추가했다(#1569). **v1.1.49에서 역방향 신호**(announce > tool_use — 도구 호출을 예고해 놓고 tool_use 블록 없이 턴을 종료한 방향)**를 추가했다(#1595 #6)** — 기존 판정식 `max(0, tool_use − announce)`는 이 방향을 **구조적으로 0으로 처리**해 원리적으로 탐지 불가였다. 역방향은 **전용 앵커 정규식**(`$an_anchored`, 줄 시작 앵커 있음 — forward의 `$an_tool`에는 적용하지 않는다. forward는 announce를 덜 세면 위반이 **늘어나기** 때문)을 쓰고, **Skill 포함 전체 tool_use가 0건**일 때만 계상한다(Skill 제외 카운트를 쓰면 Skill만 호출한 준수 턴에서 오발화). 기본 off 옵트인(`OMCUSTOM_R008_REVERSE=on`으로 활성)이다 — 482턴 실측에서 순진한 `announce − ntools > 0` 구현은 36턴에 발화해 advisory 총량을 2배로 만들었고(16건은 Skill 제외 아티팩트, 15건은 앵커 없는 정규식의 산문 매칭), 협소화 후 3/3 진양성·오탐 0(앵커 비용은 실제 announce 969줄 중 1줄, 0.1%)이 되었으나 표본이 3건이라 기본 활성은 보류했다. **배선 구조상 예방 효과가 없다는 점도 보류 근거다** — 결함 턴은 tool_use가 0이라 `PostToolUse`·`SubagentStop`이 발화하지 않고, `UserPromptSubmit`은 사용자가 이미 개입한 뒤 발화한다. 정시에 발화하는 유일한 이벤트는 `Stop`이며 거기 걸린 훅은 `session-reflection.sh`다. 역방향은 그래서 **의도적으로 advisor 전용**이며 `session-reflection.sh`에는 복제하지 않았다(같은 결함을 두 번 보고하면서 교정 기회는 여전히 0이 되고, 되돌릴 지점만 두 곳이 된다).
>
> 교훈: **배선 확인 ≠ 전달 확인 ≠ 발화 확인** — R020 "actual outcome ≠ attempt"의 훅 도메인 재현 사례.

<!--
> **v2.1.163+**: Stop and SubagentStop hooks can return `hookSpecificOutput.additionalContext` (JSON) to feed structured feedback back into Claude's context without triggering a hook error label. This enables advisory-style enforcement via Stop/SubagentStop hooks (e.g., `session-reflection.sh`, omcustom-loop SubagentStop) to pass richer context — replacing plain stderr text — without disrupting the turn continuation behavior that advisory-first enforcement relies on.

> **v2.1.199+**: SessionStart/Setup/SubagentStart hook이 exit code 2로 종료할 때 stderr를 조용히 숨기던 문제가 수정되어 이제 오류가 표시됩니다. Hard Block/Advisory 계층(위 Enforcement Tiers 표)의 훅 실패 관측성을 강화합니다 — cf. v2.1.163 `additionalContext` 구조화 피드백.
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.210+**: hook callback timeout이 모델에 user rejection으로 오보고되어 unattended 세션이 정지 대기하던 문제가 수정되었습니다. R021 advisory 훅(PostToolUse/UserPromptSubmit/Stop 등)이 매 턴 발화하고 /fsd 등 장기 무인 루프가 이에 의존하므로, hook timeout이 더 이상 phantom rejection으로 무인 세션을 중단시키지 않습니다 — cf. v2.1.199 훅 실패 관측성. -->

> **v2.1.211/212/214+**: 훅의 enforcement 결정이 auto/unattended 모드에서 안정적으로 존중되도록 세 건이 수정되었습니다 — (211) auto mode가 unsandboxed Bash에 대한 PreToolUse 훅의 `ask` 결정을 덮어쓰던 문제가 수정되어 훅 `ask`가 최소 prompt로 floor되고, (212) `continue:false` 훅의 halt가 도구 실패·중간 완료 시 누락되던 문제 및 훅 인프라 오류가 user rejection으로 오보고되던 문제가 수정되었으며, (214) 훅 stdout JSON이 스키마 검증에 실패할 때 exit code 2가 문서대로 차단하지 못하던 문제가 수정되었습니다. R021 Enforcement Tiers(Hard Block=exit 2, Conversation Block=continueOnBlock exit 2, Advisory)가 훅의 block/ask 결정 존중에 의존하므로, 세 수정 모두 hard-block·advisory 훅(stage-blocker, rule-deletion-guard, stuck-detector 등)의 강제 신뢰성을 강화합니다 — v2.1.210 훅 timeout phantom-rejection 수정의 연장선.

> **v2.1.222+**: PreToolUse auto-allow 훅이 background agent task(summaries/compaction/renames)에서 tool restriction을 우회하던 문제가 수정되었습니다. 즉 위 Enforcement Tiers 표의 **Hard Block 계층(stage-blocker, dev-server tmux, rule-deletion-guard)이 background agent task 경로에서 우회될 수 있었다**는 뜻이며, background agent를 쓰는 장기 무인 루프에서 hard-block 훅이 실제로는 강제되지 않는 구간이 존재했습니다. v2.1.211/212/214 훅 결정 존중 체인의 연장선입니다.

> **v2.1.247+**: 훅 또는 background agent가 수 메가바이트의 error 출력을 찍어 대화를 overflow시켜 세션이 "Prompt is too long"으로 멈추던 결함이 수정되었습니다. 같은 릴리즈에서 hook/background task의 output file을 쓸 수 없을 때 무한 메모리 증가하던 문제도 수정되어, 이제 출력이 소실된 위치를 파일에 남깁니다. 이 저장소는 advisory 훅(`r007-r008-drift-advisor.sh`, `failure-ledger.sh`, `fail-axis-cause-advisor.sh` 등)을 다수 운용하므로, 훅 출력 폭주가 세션 자체를 wedge시키는 이 실패 클래스에 해당합니다 — v2.1.211/212/214/222 훅 신뢰성 계열의 연장선입니다.

> **v2.1.248+**: 훅 관측성이 두 건 강화되었습니다 — (a) `PermissionRequest`/`PreToolUse` 훅이 유효하지 않은 응답을 출력해 background session이 조용히 대기하던 결함이 수정되어, 이제 `claude agents` 행이 해당 훅 이름과 스키마 에러를 표시합니다. (b) 훅이 stdout으로 낸 `{…}` 객체가 유효한 JSON이 아닐 때 조용히 plain text로 처리하던 결함이 수정되어, 이제 parse 에러와 함께 훅 에러로 보고됩니다. 위 v2.1.214 "훅 stdout JSON이 스키마 검증에 실패할 때 exit code 2가 문서대로 차단하지 못하던 문제" 노트와 같은 계열 — 훅 실패가 무음에서 가시화되는 흐름의 연속입니다.

## Why Advisory-First

1. **Agent flexibility**: Hard blocks can trap agents in unrecoverable states
2. **Graceful degradation**: Missing dependencies (jq, etc.) don't break the session
3. **Composability**: External skills and internal rules can coexist without deadlocks
4. **PostCompact reinforcement**: R007/R008/R009/R010/R018 are re-injected after context compaction

## Hard Enforcement Candidates — R010 git-delegation-guard (conditional), R007/R008 advisory **implemented & firing** (#1229 UserPromptSubmit, proactive) + **#1545 SubagentStop** (closes autonomous-loop gap) + **#1553 PostToolUse** + retroactive Stop-hook (#1190); `additionalContext` 전달 경로는 #1547(v1.1.40)에서 구현됐으나 파서 셀렉터 결함으로 v1.1.42까지 **양 계층 모두 미발화**였고, **v1.1.43에서 수정 완료·발화 확인**(#1553); hard-block variant still candidate if advisory insufficient (#1096). Promoted: rule-deletion-guard.sh (2026-04-08). See details via Read tool.

<!-- DETAIL: Hard Enforcement Candidates (Future)
If advisory enforcement proves insufficient for specific rules, these are candidates for promotion to hard-block:

| Rule | Candidate Hook | Status | Condition for Promotion |
|------|---------------|--------|------------------------|
| R010 | git-delegation-guard.sh | Candidate | If orchestrator-direct-write violations exceed 3/session |
| R007/R008 | `r007-r008-drift-advisor.sh` (UserPromptSubmit #1229 + SubagentStop #1545 + PostToolUse #1553) | **Advisory implemented and firing** — proactive pre-response check wired to three trigger points; the SubagentStop leg (#1545) closes the no-user-input autonomous-loop gap (`/fsd` etc.), and the PostToolUse leg (#1553) covers the orchestrator-only stretch before the first subagent spawn. Retroactive: `session-reflection.sh` (Stop, #1190). Two-layer drift detection: proactive (#1229/#1545/#1553) + retroactive (#1190). **Historical defect (v1.1.40–v1.1.42): delivery path implemented but never fired** — #1547 (v1.1.40) switched delivery from stderr (never model-visible on exit 0) to `hookSpecificOutput.additionalContext` on JSON stdout, non-blocking (no top-level `decision`/`continue`/`stopReason`), but both scripts short-circuited BEFORE emitting: `jq -r '.role'` read a key absent at transcript top level (it is `.message.role`), so `last_assistant` was always empty and the script exited 0 silently. Measured then: 0 `"additionalContext":` occurrences across 771 transcripts; live probe emitted 0 bytes on both streams. **Resolved in v1.1.43** — parser fix on both layers + `PostToolUse` wiring, first fire confirmed by live probe (#1553). Follow-ups: v1.1.44 turn-level R008 prefix counting (#1563), v1.1.45 Skill-tool exemption (#1569), v1.1.49 reverse signal — announce > tool_use, own anchored regex, fires only when ALL tool_use blocks (Skill included) are 0, opt-in via `OMCUSTOM_R008_REVERSE=on` and NOT replicated into `session-reflection.sh` (#1595 #6). | Promote to hard-block if advisory proves insufficient (#1096) |

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

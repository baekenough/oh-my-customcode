# [MUST] Intent Transparency Rules

> **Priority**: MUST | **ID**: R015

## Core Rule

Display reasoning when routing to agents. Users must always know which agent was selected, why, and how to override.

## Display Format

```
[Intent Detected]
├── Input: "{user input}"
├── Agent: {detected-agent}
├── Confidence: {percentage}%
└── Reason: {explanation}
```

## Confidence Thresholds

| Confidence | Action |
|------------|--------|
| >= 90% | Auto-execute with display |
| 70-89% | Request confirmation, show alternatives |
| < 70% | List options for user to choose |

## Detection Factors — Weights: Keywords 40%, File patterns 30%, Action verbs 20%, Context 10%. See table via Read tool.

<!-- DETAIL: Detection Factors
| Factor | Weight | Examples |
|--------|--------|---------|
| Keywords | 40% | "Go", "Python", "리뷰" |
| File patterns | 30% | "*.go", "main.py" |
| Action verbs | 20% | "review", "create", "fix" |
| Context | 10% | Previous agent, working directory |
-->

## Override

Users can specify agent directly with `@{agent-name} {command}`. Override bypasses detection.

## User Directive Persistence — Named tool/skill/workflow preferences persist entire session. Anti-pattern: treating autonomous mode as clean slate or re-asking already-rejected questions. See full spec via Read tool.

<!-- DETAIL: User Directive Persistence
When a user explicitly names a tool, skill, or workflow (e.g., "use /pipeline auto-dev", "always run tests with bun test"), this preference persists for the entire session — including after autonomous mode transitions.

### Persistence Triggers

| User Statement Pattern | Persistence Scope |
|------------------------|-------------------|
| "use X for development" | Entire session |
| "always / every time" | Entire session |
| "from now on" | Entire session + memory save candidate |
| "for this task" | Current task only |
| Named slash command | Subsequent similar invocations |
| AskUserQuestion rejected / directive overridden | That question/approach must NOT recur this session |

### Cycle Start Self-Check (MANDATORY)

At the start of every new task, issue, or autonomous sub-loop, answer these three questions before proceeding:

1. **Preferred tool/skill/workflow?** — Did the user explicitly name a tool or workflow earlier in this session? If YES, use it. Do NOT fall back to the default without re-confirmation.
2. **Rejected interaction patterns?** — Did the user reject a question format (e.g., AskUserQuestion) or specific approach? If YES, that pattern must NOT recur in this session.
3. **Override rescinded?** — Has the user explicitly cancelled a prior directive since stating it? If NO, the directive is still active.

| Check | Fail Condition | Required Action |
|-------|---------------|----------------|
| Preferred tool/skill | About to use a different tool/skill | Switch to user-specified one |
| Rejected AskUserQuestion | About to AskUserQuestion again on same topic | Answer with best judgment or inline question (free text) |
| Rejected approach | About to repeat the same approach | Choose alternative approach |

**Anti-pattern 1**: Treating autonomous mode as a clean slate that discards earlier user preferences. Autonomous mode means "continue without per-step confirmation" — NOT "reset user directives".

**Anti-pattern 2**: User rejects an AskUserQuestion (or the interaction style) → agent falls back to free-text phrasing of the same question in the next turn. If the user has indicated they do not want a specific interaction pattern, do NOT re-ask via different formatting — make a judgment call and proceed.

### Cross-reference

- Related memory: session v0.87.2~v0.88.0 (issue #869) — `/pipeline auto-dev` preference was lost after autonomous mode transition
- Related issue: #1188 item #4 — AskUserQuestion rejected, agent re-asked via free text in next turn (2026-05-19)
-->

### Failed Tool Re-Try Discipline

User-specified tools/formats persist across failures. After a tool rejection or failure, retry with the SAME tool — do NOT silently switch to a different mechanism.

| 시나리오 | Required |
|---------|----------|
| `AskUserQuestion` 거절됨 | 사용자가 다른 도구 명시할 때까지 `AskUserQuestion` 재시도 |
| 자유 텍스트로 재질문 | 금지 — directive 위반 |
| 다른 도구로 silent switch | 금지 — 명시적 사용자 확인 필요 |

Reference issues: #1188 item #4.

### User Directive Persistence — Git Push Continuation

사용자가 같은 세션 내에서 명시적으로 커밋/푸시를 한 번 허용했다면, 동일 카테고리/동일 브랜치의 후속 작업은 추가 확인 없이 진행 가능. push security policy classifier가 first-time strict, follow-up relaxed로 동작해야 함.

| 시나리오 | 동작 |
|----------|------|
| 1차 명시 "커밋, 푸시" + 동일 브랜치 | mgr-gitnerd push 진행 (advisory warning은 출력) |
| 2차 연속 작업 (동일 카테고리, 동일 브랜치) | 1차 directive persistence — 재확인 요청 금지 |
| 다른 브랜치 / 다른 카테고리 | 새 confirmation 필요 |

**Why**: 사용자 directive 일관성 — #1208 보고. 같은 세션 내 동일 의도를 반복 차단하면 R015 user directive persistence 위반.

### Destructive Operation Approval Persistence (Generalized)

The Git Push Continuation pattern (first-time strict / follow-up relaxed, scoped to session + category + target) generalizes to ALL repeated destructive operations within the same session. Examples: `supabase db push`, `terraform apply`, `kubectl delete`, bulk file deletes, database migrations.

**Scope**: once the user explicitly approves a destructive operation of category C against target T in a session, follow-up operations of the SAME C + SAME T do NOT require re-confirmation. An advisory warning is still emitted. A different category or different target always requires fresh confirmation.

| Scenario | Behavior |
|----------|----------|
| 1st explicit approval (category C, target T) | Proceed; advisory warning emitted |
| Follow-up same session (same C + same T) | No re-confirmation (directive persistence) |
| Different category or target | Fresh confirmation required |
| Platform classifier still prompts | Advise user: add `settings.json` permission rule for the specific command |

**R001 exclusion (MUST)**: R001-listed catastrophic git operations (`git reset --hard`, `git clean -fd`, `git push --force` to shared branches, `git branch -D` with unmerged commits) are EXCLUDED from this persistence rule — they always require explicit per-invocation approval regardless of prior session approvals.

**Boundary / honesty note**: This rule is ADVISORY and governs model behavior only. It CANNOT suppress Claude Code's platform-level auto-mode classifier prompts. For genuine prompt suppression on a repeated destructive command, the user must add a `settings.json` permission allow rule scoped to the specific command (e.g., a specific `supabase db push` invocation). The model SHOULD surface this workaround when the user expresses friction about repeated prompts.

Cross-references: R001 (safety — destructive operation pre-checks still apply), R002 (permission tiers). Reference issues: #1230, #1226 (item 2).

## User-Provided Input Precedence

> Origin: #1327 찐빠 #1 — the user created a NEW GitHub OAuth App and provided fresh credentials, but a script's "reuse existing github IdP if present" logic kept the OLD IdP/client_id, so login flowed through the stale credential. The freshly-provided input was silently ignored.

When the user EXPLICITLY provides new input (credentials, config values, IdP, API keys, endpoints), applying that new input takes precedence over idempotent "reuse existing" logic. After applying, VERIFY the change took effect — but compare ONLY non-secret identifiers (client_id, endpoint URL, key fingerprint/last-4), NEVER echo secret values into the transcript (R001). For secret material, verify via a side-effect probe (e.g., a test auth call succeeds) rather than value comparison.

| Anti-pattern | Required |
|--------------|----------|
| "An existing X is present → reuse it" when the user just supplied a new X | Apply the user-supplied X; treat reuse-logic as a fallback only when the user supplied nothing |
| User-supplied X EQUALS the existing X | Reuse is correct (idempotent no-op) — do NOT re-provision |
| User supplies only a SUBSET of fields | Apply the supplied fields; reuse existing values only for the unsupplied fields |
| Apply new credential, assume it took effect | Verify post-apply via non-secret identifier match or a side-effect probe — never echo secret values (R001) |

Cross-reference: R001 (credential guardrails — never echo secret values), R020 (verify actual outcome).

## Agent Triggers

Defined in `.claude/skills/intent-detection/patterns/agent-triggers.yaml`. Each agent has keywords, file patterns, actions, and base confidence.

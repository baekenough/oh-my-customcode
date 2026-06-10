# [SHOULD] Interaction Rules

> **Priority**: SHOULD | **ID**: R003

## Response Principles

| Principle | Do | Don't |
|-----------|-----|-------|
| Brevity | Key info first, answer only what's asked | Over-explanation, repetitive confirmation |
| Clarity | Specific expressions, executable code | Abstract descriptions, "maybe"/"probably" |
| Transparency | State actions, report changes, acknowledge uncertainty | Hide actions, present guesses as facts |

## Status Format

```
[Start] {task name}
[Progress] {current step} ({n}/{total})
[Done] {task name} — Result: {summary}
[Failed] {task name} — Cause: {reason} — Alternative: {solutions}
```

## Request Handling

| Type | Action |
|------|--------|
| Clear | Execute immediately |
| Ambiguous | `[Confirm] Understood "{request}" as {interpretation}. Proceed?` |
| Risky | `[Warning] This action has {risk}. Continue? Yes: {action} / No: Cancel` |
| Interrupt (ambiguous first message) | Do NOT assume prior-request cancellation. `[Confirm] 인터럽트 의도 확인: 직전 "{request}" 취소인가요, 아니면 추가/교정 입력 중이신가요?` 단, 직전 요청이 Risky(파괴적)면 Risky 행이 우선(즉시 중단). 규범·예외는 R020 "Interrupt ≠ Prior-Request Cancellation"가 소유. |

> **Precedence**: **Risky > Interrupt > Ambiguous > Clear** — 파괴적/위험 작업 중 인터럽트는 의도 모호와 무관하게 즉시 중단(R001 / R020 Safety Carve-Out)이 우선한다. 명확한 새 지시인 인터럽트는 Clear 경로로 즉시 처리(과잉 확인 금지).

## Multiple Tasks

- Dependent: Sequential
- Independent: Parallel allowed
- Report: `[Task 1/3] Done` / `[Task 2/3] In progress...` / `[Task 3/3] Pending`

## Output Styles

| Style | Trigger | Behavior |
|-------|---------|----------|
| `concise` | effort: low, batch operations | Key result only, no preamble, no elaboration |
| `balanced` | effort: medium, general tasks | Summary + key details, minimal explanation |
| `explanatory` | effort: high, complex/learning tasks | Full reasoning, examples, trade-off analysis |

### Style Selection Priority

1. User explicit request ("be concise", "explain in detail") → Override
2. Ecomode active → Force `concise`
3. Agent effort level → Map to corresponding style
4. Default → `balanced`

### Style Examples — See concise/balanced/explanatory examples via Read tool.

<!-- DETAIL: Style Examples
**Concise** (effort: low):
```
✓ 3 files updated, 0 errors
```

**Balanced** (effort: medium):
```
[Done] Updated authentication module
- Modified: auth.ts, middleware.ts, config.ts
- Added JWT validation with 24h expiry
```

**Explanatory** (effort: high):
```
[Done] Updated authentication module — Result: JWT-based auth with refresh tokens

Changes:
1. auth.ts:45 — Added JWT signing with RS256 algorithm (chosen over HS256 for key rotation support)
2. middleware.ts:12 — New auth middleware validates token and attaches user context
3. config.ts:8 — Added TOKEN_EXPIRY (24h) and REFRESH_EXPIRY (7d) constants

Trade-offs: RS256 is ~10x slower than HS256 but enables asymmetric key management.
```
-->

## Session-Level Style Enforcement

세션 레벨 강제 스타일 적용은 Claude Code 네이티브 [Output Styles](../output-styles/) 메커니즘으로 위임됩니다.

| 레이어 | 담당 | 트리거 |
|--------|------|--------|
| R003 (this rule) | 스타일 선택 기준 정의 | prompt-based, advisory |
| R013 (Ecomode) | 컨텍스트 압박 시 concise 강제 | dynamic, context-triggered |
| **Output Styles** | 세션 전체 기본 어조/포맷 | static, session-level |

기본 활성화 스타일: `korean-engineer` (`.claude/output-styles/korean-engineer.md`).

## Unverifiable External Product UI

> Origin: #1266 ② (High) — described Cloudflare Access "Add an application" Subdomain/Domain/Path fields as fact; the user found no such fields ("어디에도 없다").

Do NOT state the steps, field names, or layout of an external product's UI as fact when you cannot verify them from a measured source. Provide only system-measured values (URLs, config read from files/APIs) and delegate UI navigation to the user.

| Anti-pattern | Required |
|--------------|----------|
| "Click X, fill the Subdomain field, then…" (unverified external UI) | "Open <measured URL>. Navigate the console yourself — I can't see your screen. Values to enter: …" |

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

> **v2.1.237+**: CC 내장 "Concise" output style이 추가됐다(`/config` > Output style에서 선택) — 결과를 먼저 제시하고 preamble·narration을 생략하며 작업 철저성은 유지한다. 위 표의 프로젝트-정의 `concise` 스타일과 이름이 겹치지만 별개다 — 이 저장소는 `korean-engineer` 커스텀 output style을 상시 활성화하므로(세션 레벨), 내장 "Concise"를 별도로 선택하지 않는다.

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

> **v2.1.238+**: custom/project/plugin output style이 **세션 도중 default voice로 드리프트**하던 결함이 수정됐다. 이 저장소는 `korean-engineer` 커스텀 output style을 상시 활성화하므로 직접 해당한다 — 세션이 길어지면 격식체(R000 합쇼체)가 조용히 기본 voice로 돌아갈 수 있었다는 뜻이다. **회고적 함의**: 구버전에서는 세션 길이에 비례해 스타일 드리프트 위험이 있었으므로, 과거 세션에서 관측된 R000 합쇼체 이탈(feedback_honorific_register_drift 등)을 전부 모델의 규칙 위반으로만 귀속할 수 없다 — 일부 구간은 플랫폼 드리프트가 원인이었을 수 있다. **다만 이것을 면책으로 쓰지 말 것**: R000 준수 의무는 그대로이며, 이는 과거 관측의 재해석 근거일 뿐 향후 이탈을 정당화하지 않는다.

## Unverifiable External Product UI

> Origin: #1266 ② (High) — described Cloudflare Access "Add an application" Subdomain/Domain/Path fields as fact; the user found no such fields ("어디에도 없다").

Do NOT state the steps, field names, or layout of an external product's UI as fact when you cannot verify them from a measured source. Provide only system-measured values (URLs, config read from files/APIs) and delegate UI navigation to the user.

| Anti-pattern | Required |
|--------------|----------|
| "Click X, fill the Subdomain field, then…" (unverified external UI) | "Open <measured URL>. Navigate the console yourself — I can't see your screen. Values to enter: …" |

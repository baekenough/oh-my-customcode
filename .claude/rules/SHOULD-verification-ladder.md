# [SHOULD] Verification Ladder Rules

> **Priority**: SHOULD | **ID**: R023

## Core Rule

검증은 비용/속도 ladder로 구성한다: **결정론적 검사 → cheap LLM → expensive LLM → human**. 가장 저렴한 tier가 먼저 통과해야 다음 tier로 진행한다. 더 낮은 tier에서 잡을 수 있는 문제를 더 비싼 tier에 보내지 않는다.

## Ladder Tiers

| Tier | 도구 | 비용 | 속도 | 적용 시점 |
|------|------|------|------|-----------|
| **1: Deterministic** | hooks, linters, type-check, JSON schema | $0 | <1s | Pre-write, write-time |
| **2: Cheap LLM** | haiku-based skills (`dev-review`, `action-validator`) | $ | <30s | Per-file review |
| **3: Expensive LLM** | sonnet/opus skills (`deep-verify`, `adversarial-review`, `multi-model-verification`, `evaluator-optimizer`) | $$$ | 1-5분 | Pre-commit, PR review |
| **4: Human** | maintainer review | time | hours-days | Final gate, contested decisions |

## Shift-left 원칙

결정론적 단계가 잡을 수 있는 문제는 LLM에 보내지 않는다. LLM 검증은 ambiguous/semantic 문제에 집중한다.

- **좋은 예**: JSON schema 오류 → Tier 1 hook이 차단 → LLM에 미전달
- **나쁜 예**: 탭/스페이스 혼용 오류 → sonnet으로 전달 → 불필요한 비용 발생

R013 (SHOULD-ecomode)의 "저렴한 검증 우선" 원칙과 정합: ecomode는 출력 토큰을 절약하고, R023은 검증 비용을 절약한다.

## 기존 자산 매핑

| Tier | 자산 | 역할 |
|------|------|------|
| **Tier 1** | `.claude/hooks/` (PreToolUse hooks) | 도구 호출 전 결정론적 차단 |
| **Tier 1** | `mgr-sauron` (R017 구조 검증) | 에이전트/스킬/가이드 frontmatter 검증 |
| **Tier 1** | pre-commit configs, linters | 코드 품질 정적 검사 |
| **Tier 2** | `dev-review` | 파일 단위 haiku 코드 리뷰 |
| **Tier 2** | `action-validator` | CI/CD 액션 구문 검증 |
| **Tier 2** | `pre-generation-arch-check` | 생성 전 아키텍처 lite 점검 |
| **Tier 3** | `deep-verify` | 다단계 품질 검증 (sonnet) |
| **Tier 3** | `adversarial-review` | 공격자 시각 보안 리뷰 (opus) |
| **Tier 3** | `multi-model-verification` | 복수 모델 교차 검증 |
| **Tier 3** | `evaluator-optimizer` | 평가-개선 반복 루프 |
| **Tier 3** | `worker-reviewer-pipeline` | 구현-리뷰 파이프라인 |
| **Tier 4** | maintainer manual review | PR approval, final gate |

## R021과의 관계

R021 (MUST-enforcement-policy)과 R023은 **직교**한다. 두 규칙은 서로 다른 차원을 다룬다:

| 규칙 | 질문 | 차원 |
|------|------|------|
| **R021** | "어떻게 강제할 것인가?" | Hard block / Soft block / Advisory |
| **R023** | "어떤 비용으로 검증할 것인가?" | Deterministic / Cheap LLM / Expensive LLM |

같은 도구가 두 규칙에 동시에 속할 수 있다:

- `mgr-sauron`: R021 관점에서 Advisory (PostToolUse hook), R023 관점에서 Tier 1 (구조 검증)
- `deep-verify`: R021 관점에서 Prompt-based (blocking 없음), R023 관점에서 Tier 3 (expensive LLM)
- `.claude/hooks/` stage-blocker: R021 관점에서 Hard Block, R023 관점에서 Tier 1

R021은 위반 시 어떻게 멈출지를, R023은 어떤 순서로 검증할지를 정의한다.

## Self-Check

새 검증 도구 추가 시:

- [ ] 어느 tier에 속하는지 명확한가?
- [ ] 같은 tier 내 중복 도구는 없는가?
- [ ] Tier 1에서 잡을 수 있는 문제를 다루는가? (상위 tier 대신 시프트 권고)
- [ ] Ladder 순서를 문서화했는가? (어떤 검사를 먼저 실행하는지)

## Safety-Signal Rule Authoring — Carve-Out Pre-Check (shift-left)

> Origin: #1353 (인터럽트 룰 #1341의 후속 회고에서 발견된 R001 carve-out 누락) — 인터럽트 룰(R003/R020)을 작성할 때 R001 파괴적-작업 carve-out을 1차 작성에서 빠뜨렸고, Tier 3 적대적 검증이 release-blocking으로 포착해 보정했다. Tier 3가 잡았으나, 같은 결함을 Tier 1(작성 시점 결정론적 점검)로 시프트하면 비용이 낮다.

런타임 안전-신호 동작을 정의하는 룰(인터럽트·취소·halt·중단·emergency-stop 등)을 추가/수정할 때, 작성 단계(Tier 1)에서 다음을 사전 점검한다 — Tier 3 적대적 검증에 의존하기 전에 (이 checklist 같은 메타-룰은 대상 아님):

- [ ] 이 룰이 R001 파괴적·비가역 작업(`git reset --hard`, `clean -fd`, `rm`, 터널/DNS/k8s/인프라 삭제) 컨텍스트에서도 안전한가? (fail-closed carve-out 필요 여부)
- [ ] "진행/계속(proceed)" 류 지시의 대상이 파괴적 작업의 계속으로 오독될 여지가 없는가?
- [ ] 안전-신호의 fail-safe 의미(emergency-halt)를 약화시키지 않는가? (stop-first ask-after 우선)
- [ ] 기존 안전 규칙(R001/R002)과의 우선순위가 명시되어 있는가?

하나라도 불확실하면 **먼저 carve-out을 명시(Tier 1 우선 해결)**하고, 그래도 불확실하면 Tier 3 적대적 검증(`adversarial-review`, `multi-model-verification`)을 통과시킨 뒤 release한다 (ladder 순서 유지). 이는 R023 shift-left 원칙(저렴한 tier 우선)을 룰 작성 자체에 적용한 것이며, R016 룰 작성 워크플로우의 Tier-1 품질 게이트로 동작한다 (R016은 위반 후 룰 업데이트 소유, R023 carve-out은 안전-신호 룰 작성 시 사전 점검 — 직교). Closes #1353.

## Deprecated-Platform-Feature Staleness Check (Origin: #1433 #3)

staleness/audit 검증은 model ID·placeholder·TBD뿐 아니라 **폐기된 플랫폼 기능·설정·절차 참조**도 스캔해야 한다. 실례: CC v2.1.121에서 폐기된 `/tmp/*.sh` script bypass 절차가 9개 에이전트 본문에 잔존했으나(v1.1.0에서 제거) 감사 staleness dimension이 model-ID/placeholder에만 한정해 이를 놓쳤다. 감사·staleness 체크리스트에 "CC 특정 버전에서 폐기된 기능/설정/절차를 현행처럼 참조하는가"를 항목으로 추가한다. 이는 R023 shift-left(저렴한 결정론적 grep으로 폐기 참조 조기 탐지)와 정합한다.

| Anti-pattern | Required |
|--------------|----------|
| staleness 스캔을 model ID/placeholder/TBD로만 한정 | 폐기된 플랫폼 기능/절차 참조(deprecated CC feature/procedure)도 grep 스캔 |

## Integration

| 규칙 | 상호작용 |
|------|---------|
| R009 (Parallel Execution) | Tier 1-2 검사는 독립 파일에 대해 병렬 실행 가능 |
| R013 (Ecomode) | 컨텍스트 압박 시 Tier 3를 Tier 2로 다운그레이드 고려 |
| R017 (Sync Verification) | Phase 1-3 검증 단계는 R023 Tier 1-3에 대응 |
| R021 (Enforcement Policy) | 직교: R021은 blocking 방식, R023은 검증 비용 순서 |

## Workflow Prompt & Verifier Ground-Truth

> Origin: #1266 ③ (High) — a Workflow built the agent prompt as `await agent(prompt) + FACTS`, concatenating the guardrail fact-sheet onto the RETURN VALUE instead of the prompt. The writer never received the facts, hallucinated an in-cluster hostname (`secretary-mcp`), and the adversarial verifier couldn't catch it (the fact was in no source it had).

### Prompt Completion Before Call

Workflow/agent prompts MUST be fully assembled into the prompt string **before** the `agent()` / Agent tool call. Post-call concatenation onto the return value is a footgun — the agent never sees the appended content.

| Anti-pattern | Required |
|--------------|----------|
| `const r = await agent(prompt) + FACTS` | `const r = await agent(prompt + FACTS)` — assemble first |

### Workflow Script Sanity Check

Before invoking a Workflow script, deterministically verify:

| Check | Why |
|-------|-----|
| No unresolved placeholders (`{phase1_summary}`, `TODO`, `<...>`, `{{ }}`) remain in any agent prompt string | An unfilled placeholder reaches the agent verbatim → garbled task |
| Template-literal / string concatenation produces the intended prompt (assemble-before-call, see above) | Post-call concatenation (`agent(prompt) + FACTS`) silently drops content |
| Script parses — balanced braces/quotes, valid JS | A syntax error aborts the entire run after partial work |

#### Common Violation (#1271)
Session 106 follow-up to #1266 ③: a Workflow authoring error recurred — the guardrail fact-sheet was concatenated onto the agent's RETURN VALUE instead of the prompt string, and a placeholder/assembly slip went uncaught because no pre-run sanity check existed. This check is the deterministic Tier-1 guard that catches such slips before the expensive run.

Origin: #1271 (Workflow authoring error recurrence, session 106).

### Verifier Ground-Truth for Cross-Cutting Facts

Cross-cutting facts not verifiable from the primary source (external URLs, in-cluster DNS/hostnames, infra topology) MUST be supplied to the verifier as explicit ground-truth. Otherwise an adversarial verifier cannot distinguish a hallucinated value from a correct one — a verification blind spot.

Cross-reference: R009 (giant-prompt decomposition), `worker-reviewer-pipeline` skill.

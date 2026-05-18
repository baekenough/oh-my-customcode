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

## Integration

| 규칙 | 상호작용 |
|------|---------|
| R009 (Parallel Execution) | Tier 1-2 검사는 독립 파일에 대해 병렬 실행 가능 |
| R013 (Ecomode) | 컨텍스트 압박 시 Tier 3를 Tier 2로 다운그레이드 고려 |
| R017 (Sync Verification) | Phase 1-3 검증 단계는 R023 Tier 1-3에 대응 |
| R021 (Enforcement Policy) | 직교: R021은 blocking 방식, R023은 검증 비용 순서 |

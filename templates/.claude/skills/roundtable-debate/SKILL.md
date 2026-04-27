---
name: roundtable-debate
description: Multi-agent structured debate with anti-groupthink mechanisms — Devil's Advocate, minority opinion protection, 2-round hard cap. Use when divergent perspectives matter more than consensus (architecture decisions, design tradeoffs, contested specifications).
scope: core
context: fork
version: 1.0.0
---

# roundtable-debate

발산 보존(divergence preservation)을 목표로 하는 다중 에이전트 구조화 토론 스킬. 기존 `agora`(수렴 목표)와 보완 관계.

## When to Use

| 상황 | 권장 스킬 |
|------|-----------|
| 만장일치 합의 필요 (스펙 확정) | `agora` |
| 다각적 평가 필요 (리스크 발굴) | `roundtable-debate` |
| 단일 결정 + 단일 답변 | `agora` |
| 의도적 발산 + 소수의견 보존 | `roundtable-debate` |

## Anti-Groupthink Mechanisms

다중 LLM 토론의 3대 고질병을 구조적으로 방지:

| 고질병 | 메커니즘 |
|--------|---------|
| 앵커링 효과 | Independent-first parallel analysis (라운드 0 — 다른 에이전트 의견 노출 전 독립 분석) |
| 집단사고 (Groupthink) | Devil's Advocate 강제 주입 (전담 페르소나 1명) |
| Degeneration of Thought | 2라운드 하드캡 (라운드 수 증가 시 다양성 감소 연구 기반) |
| 소수의견 묵살 | 기각 시 명시적 정당화 요구 프로토콜 |

## Workflow

### Phase 0: Independent Parallel Analysis

각 페르소나 에이전트가 다른 에이전트 의견을 보지 않고 **독립적으로** 분석. 앵커링 효과 차단.

```
TeamCreate("roundtable-{topic}")
  → Agent(architect): 독립 분석
  → Agent(critic-devil): 독립 분석 (Devil's Advocate)
  → Agent(implementer): 독립 분석
  → Agent(user-advocate): 독립 분석
  (R009 hard cap 5 준수)
```

각 에이전트는 자신의 분석을 artifact로 저장 (R006 Artifact Channel Protocol).

각 에이전트에게 위임 시 다음 directive를 prompt에 포함:

```
**Sensitive-path artifact protocol (mandatory for this task)**

If your task involves writing artifacts under `.claude/outputs/`:
1. Build script in /tmp: cat > /tmp/roundtable-<persona>-<timestamp>.sh << 'EOF' ... EOF
2. Script: mkdir -p .claude/outputs/sessions/<date>/ && cat > .claude/outputs/sessions/<date>/<artifact>.md << 'ARTIFACT' ... ARTIFACT
3. Execute: bash /tmp/roundtable-<persona>-<timestamp>.sh
4. Cleanup: rm /tmp/roundtable-<persona>-<timestamp>.sh
DO NOT use Write/Edit directly on `.claude/outputs/` — CC sensitive-path guard triggers regardless of bypassPermissions/allow rules.
```

### Phase 1: Round 1 — Discussion

모든 독립 분석 공개 후 라운드 1 토론. SendMessage로 peer 의견 교환.

규칙:
1. 다른 의견을 기각할 때 명시적 정당화 (3개 근거) 필수
2. Devil's Advocate는 합의에 동의하지 않음 — 항상 반대 입장 견지
3. 소수의견(1명만 주장)은 별도 트랙으로 보존

### Phase 2: Round 2 — Convergence Attempt (last round)

라운드 2가 마지막. 합의 도달 여부 무관하게 **종료**.

산출물:
1. 공통 합의 사항 (있을 경우)
2. 보존된 소수의견 + 정당화
3. Devil's Advocate 최종 반대 의견

### Phase 3: Synthesis

오케스트레이터가 3종 결과를 종합 보고. 합의가 없는 영역은 명시적으로 "합의 없음 — 사용자 결정 필요"로 표기.

## Persona Templates

기본 4 페르소나 (도메인에 따라 mgr-creator로 추가 가능):

| 페르소나 | 역할 |
|---------|------|
| architect | 구조적 일관성, R006 separation of concerns |
| critic-devil | Devil's Advocate — 모든 제안 반대 입장 |
| implementer | 구현 실현 가능성, 비용 |
| user-advocate | 사용자 경험, DX |

## Comparison with Existing Skills

| 스킬 | 목표 | 종료 조건 |
|------|------|----------|
| `agora` | 만장일치 수렴 | 모든 LLM 동의 |
| `roundtable-debate` | 발산 보존 | 2라운드 도달 |
| `adversarial-review` | 공격자 1인 시각 | 단일 라운드 |
| `evaluator-optimizer` | 평가-개선 루프 | 평가 통과 |

## Configuration

```yaml
# Skill arguments
personas: 4              # 기본 4명, 3-5명 권장
max_rounds: 2            # HARD CAP — 변경 금지 (research-based)
devil_advocate: required # Devil's Advocate 슬롯 강제
minority_protection: strict  # 기각 시 정당화 필수
```

## Integration

| Rule | How |
|------|-----|
| R009 | Phase 0 병렬 분석 (4-5 페르소나, hard cap 5 준수) |
| R010 | 오케스트레이터가 페르소나 dispatch, 페르소나 간 직접 파일 수정 금지 |
| R018 | Agent Teams 활성 시 자동 사용 (3+ 에이전트) |
| R006 | Phase 0/1/2 간 결과 핸드오프는 artifact channel 사용 |

## Attribution

Pattern source: [cc-roundtable](https://github.com/gaebalai/cc-roundtable) by gaebalai.

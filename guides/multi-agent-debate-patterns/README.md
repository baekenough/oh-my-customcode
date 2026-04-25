# 다중 에이전트 토론 패턴

> 다중 LLM/에이전트 토론에서 발생하는 **3대 고질병**과 이를 방지하는 구조적 메커니즘 가이드.

## 3대 고질병

### 1. 앵커링 효과 (Anchoring Effect)
첫 번째로 발화한 에이전트의 의견이 후속 에이전트의 사고를 제한하는 현상. 토론 참여자가 동시에 시작하지 않으면 발생.

**방지**: Round 0 — Independent Parallel Analysis (다른 의견 노출 전 독립 분석)

### 2. 집단사고 (Groupthink)
다수 의견에 합의 압력이 작용해 비판적 시각이 사라지는 현상. LLM은 "동의하기 쉬운" 응답을 선호하므로 특히 취약.

**방지**: Devil's Advocate 페르소나 강제 주입 — 전담 반대자가 합의에 동의하지 않음

### 3. Degeneration of Thought
토론 라운드가 증가할수록 의견 다양성이 감소하는 현상. 연구에 따르면 3라운드 이상에서 다양성이 급격히 떨어짐.

**방지**: 2라운드 하드캡 — 합의 도달 여부 무관하게 종료

## 추가 보호 메커니즘

### 소수의견 보호 프로토콜
- 1명만 주장하는 의견도 별도 트랙으로 보존
- 기각 시 명시적 정당화(3개 근거 이상) 필수

## agora vs roundtable-debate 선택 매트릭스

| 상황 | 권장 | 이유 |
|------|------|------|
| 스펙 최종 확정 (단일 답변 필요) | `agora` | 만장일치 수렴 |
| 아키텍처 결정 (트레이드오프 평가) | `roundtable-debate` | 발산 보존 |
| 보안 감사 (공격자 시각) | `adversarial-review` | 공격자 1인 시각 |
| 코드 품질 개선 루프 | `evaluator-optimizer` | 평가-개선 |
| 리스크 발굴 (블라인드 스폿) | `roundtable-debate` | 다양한 페르소나 |
| 산출물 검증 (통과/실패) | `agora` | 단일 결정 |

## 종료 조건 비교

| 스킬 | 종료 조건 | 산출물 |
|------|----------|--------|
| `agora` | 모든 LLM 동의 | 단일 합의안 |
| `roundtable-debate` | 2라운드 도달 | 합의 + 소수의견 + Devil's Advocate 반대 |
| `adversarial-review` | 단일 라운드 완료 | 취약점 목록 |
| `evaluator-optimizer` | 평가 통과 | 개선된 산출물 |

## 연구 근거

| 메커니즘 | 근거 |
|---------|------|
| 2-round hard cap | 다중 LLM 토론 라운드 수 증가 시 다양성 감소 연구 (cc-roundtable attribution) |
| Devil's Advocate | Janis (1972) Groupthink 이론 — "비판적 평가자" 역할 |
| Independent-first | Asch conformity studies — 독립 의견 형성 후 노출이 conformity 감소 |

## 구현 예시

`agora`(수렴):
```
사용자: "이 API 스펙이 안전한가?" → agora → "안전함 (3 LLM 만장일치)"
```

`roundtable-debate`(발산):
```
사용자: "OAuth vs JWT 어느 쪽이 적합?" → roundtable-debate →
  - 합의: "프로젝트 X는 OAuth 권장"
  - 소수의견 (architect): "JWT가 stateless 측면에서 우월" + 정당화
  - Devil's Advocate: "둘 다 부적합 — Session-based 고려해야"
```

## Attribution

cc-roundtable (https://github.com/gaebalai/cc-roundtable) 패턴에서 차용. R016 attribution 정책 준수.

## 관련 자료

- 스킬: `.claude/skills/roundtable-debate/SKILL.md`
- 스킬: `.claude/skills/agora/SKILL.md`
- 룰: R009 (병렬 실행), R018 (Agent Teams)

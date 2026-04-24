# PAL Router vs model-escalation — Cost Routing Analysis

> Source: #992 (ouroboros PAL Router internalization analysis)
> Date: 2026-04-24
> Release: v0.107.0

## Executive Summary

**Decision**: Option C — Defer + observe

Current model-escalation system's actual failure and escalation frequency is unmeasured. Premature PAL Router internalization without baseline data risks double-routing complexity without clear benefit. Introduce escalation metrics first, re-evaluate after 3 months of data collection.

## Background

### model-escalation (현재)
- 철학: reactive — 실패 후 상위 모델 재시도
- 트리거: 에이전트 실패 횟수 임계치 (기본 2회)
- 경로: haiku → sonnet → opus
- R016 연계: 연속 실패 패턴 감지 시 스킬 업데이트 후보

### PAL Router (ouroboros)
- 철학: proactive — 사전 복잡도 평가
- 트리거: 작업 입력의 복잡도 스코어 (프롬프트 길이, 키워드, 파일 범위)
- 비용 티어: 1x (haiku, $0.25/M) / 10x (sonnet, $3/M) / 30x (opus, $15/M)
- 장점: 오버킬/언더킬 최소화, 초기 티어 자동 선택

## Comparison Matrix

| 기준 | model-escalation (현재) | PAL Router (ouroboros) |
|------|------------------------|----------------------|
| 철학 | Reactive | Proactive |
| 실패 복구 | 자동 escalation | N/A (사전 선택) |
| 초기 비용 | 최저 (haiku) | 복잡도 맞춤 |
| 오버킬 위험 | 낮음 (점진 증가) | 중간 (threshold 민감) |
| 언더킬 위험 | 중간 (1회 실패 후 해결) | 낮음 (사전 적정) |
| 구현 복잡도 | 기존 활용 | 신규 복잡도 평가 로직 |
| 비용 효율 | 실패율 낮으면 최적 | 복잡도 예측 정확하면 최적 |
| 부작용 | 실패 시 재실행 오버헤드 | 오분류 시 과도한 비용 |
| 디버깅 | escalation trace 명확 | 복잡도 스코어 설명 필요 |

## Option A — pal-cost-routing 신설 스킬

**장점**:
- 명확한 관심사 분리 (proactive ≠ reactive, 독립)
- model-escalation과 orthogonal (양쪽 활성 가능)
- ouroboros 구현 참조 직접 활용

**단점**:
- 스킬 카운트 113 → 114 (context fork cap 12/12 포화 상태, fork 스킬 아니므로 무관하긴 함)
- 라우팅 결정 보드에 두 메커니즘 공존 → decision boundary 명시 필요
- 복잡도 스코어 튜닝 비용 (프로젝트마다 분포 다름)

## Option B — model-escalation 확장 (pre-assessment 추가)

**장점**:
- 단일 스킬에서 reactive + proactive 통합
- 사용자 단일 진입점
- 마이그레이션 불필요 (기존 호출부 유지)

**단점**:
- 스킬 스코프 확장 → 단일 책임 원칙 희석
- 기존 advisory-first 특성과 pre-assessment의 predictive 특성 충돌 가능
- 테스트 복잡도 증가 (두 플로우 경로)

## Option C — Defer + observe (권장)

**근거**:
1. **데이터 부재**: model-escalation 현재 실패율, escalation 빈도, 시간당 비용 메트릭이 없음
2. **선제 내재화의 함정**: 내재화 없이도 기존 시스템이 충분한지 증거 부재
3. **측정 가능성**: R012 HUD statusline에 escalation 카운터 추가는 경량 작업

**행동 계획**:
- Phase 1 (즉시): R012 statusline에 `ESC:{count}/{total}` 지표 추가
- Phase 2 (4주): model-escalation 스킬이 로그 파일에 escalation 기록 축적
- Phase 3 (3개월): 데이터 분석 — 실패 → escalation 빈도, 비용 절감률, 오버킬 패턴
- Phase 4 (결정): 데이터 기반으로 Option A vs B vs 현상 유지 재평가

## Recommendation

**Option C**로 진행. #992를 closed 처리 (분석 완료), Phase 1-2 구현은 별도 P3 이슈로 트래킹.

## Decision Record

To be created when implementation path is finalized (Phase 4):
- `sdd/decisions/2026-XX-XX-pal-router-internalization.md` (per #985 DR template)

## References

- #992 (source issue)
- #966 (ouroboros 저장소 재평가)
- `.claude/skills/model-escalation/SKILL.md`
- `.claude/rules/SHOULD-hud-statusline.md` (R012 statusline 통합 지점)
- ouroboros PAL Router docs (GitHub)

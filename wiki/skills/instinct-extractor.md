---
title: instinct-extractor
type: skill
updated: 2026-05-18
sources:
  - .claude/skills/instinct-extractor/SKILL.md
  - guides/skill-promotion/instinct-extraction.md
related:
  - [[skill-extractor]]
  - [[r016]]
  - [[mgr-creator]]
  - [[sys-memory-keeper]]
  - [[skill-promotion-instinct-extraction]]
---

# instinct-extractor

다중 세션 transcript 시계열에서 반복 실패 패턴(instinct)을 자동 채굴하여 신규 skill candidate를 생성하는 스킬.

## Overview

R016 연속 개선 루프의 cross-session 자동화 단계. 단일 세션 feedback memory를 분석하는 [[skill-extractor]]와 달리, 여러 세션을 가로질러 `~/.claude/projects/*/session-*.jsonl` transcript를 스캔하고 `(domain, action_verb, error_class)` 튜플로 클러스터링하여 반복 실패 패턴을 "instinct 후보"로 명명한다. 사용자 승인 후 [[mgr-creator]]에 위임하여 SKILL.md 생성. (#1175)

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Effort**: medium
- **Command**: `/instinct-extractor [--days <n>] [--min-repeat <n>] [--dry-run]`

## skill-extractor와의 차별점

| 속성 | `skill-extractor --mode failure` | `instinct-extractor` |
|------|----------------------------------|----------------------|
| scope | 단일 세션 | 다중 세션 시계열 (N일) |
| trigger | 명시 호출 | 자동 / [[r016]] 3회 반복 |
| input | feedback memory | session-*.jsonl |
| output | SKILL.md candidate | instinct 후보 클러스터 → SKILL.md candidate |

## 워크플로우

1. **Phase 1**: transcript 스캔 (error/correction/feedback/retry 이벤트 추출)
2. **Phase 2**: `(domain, action_verb, error_class)` 클러스터링, min-repeat 필터
3. **Phase 3**: instinct 후보 분류 (feedback memory 강화 / skill 섹션 추가 / 신규 SKILL.md / rule 강화)
4. **Phase 4**: 사용자 제시 + 승인 후 [[mgr-creator]] 위임

## R016 자동화 트리거

동일 도메인 feedback memory 3개 이상 → 오케스트레이터가 `instinct-extractor` 자동 실행 고려. [[skill-extractor]]와 순차 실행 후 교차 검증으로 confidence 판정.

## 한계

- transcript 형식(`session-*.jsonl`) 변경 시 파싱 재구현 필요
- 키워드 기반 클러스터링으로 의미적 동의어 처리 제한

## Sources

- `.claude/skills/instinct-extractor/SKILL.md` — 스킬 정의
- `guides/skill-promotion/instinct-extraction.md` — 사용 시나리오 및 confidence 매트릭스

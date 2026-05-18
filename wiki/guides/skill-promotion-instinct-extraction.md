---
title: Skill Promotion — Instinct Extraction Guide
type: guide
updated: 2026-05-18
sources:
  - guides/skill-promotion/instinct-extraction.md
  - .claude/skills/instinct-extractor/SKILL.md
related:
  - [[instinct-extractor]]
  - [[skill-extractor]]
  - [[r016]]
  - [[mgr-creator]]
  - [[sys-memory-keeper]]
---

# Skill Promotion — Instinct Extraction Guide

R016 연속 개선 루프의 Skill Promotion 단계를 위한 두 채굴 도구([[skill-extractor]], [[instinct-extractor]])의 비교 및 활용 가이드.

## Overview

oh-my-customcode는 실패 패턴을 영구 구조(skill)로 전환하는 두 개의 보완적 도구를 제공한다. 단일 세션 즉각 분석([[skill-extractor]])과 cross-session 시계열 채굴([[instinct-extractor]])로 서로 다른 범위에서 동일한 목표를 달성한다.

## 두 스킬 비교

| 속성 | `skill-extractor --mode failure` | `instinct-extractor` |
|------|----------------------------------|----------------------|
| scope | 단일 세션 | 다중 세션 시계열 (N일) |
| trigger | 명시 호출 | 자동 / [[r016]] 3회 반복 |
| input | feedback_*.md | session-*.jsonl |
| output | SKILL.md candidate | instinct 후보 → SKILL.md candidate |

## R016 권장 실행 순서

```
1. skill-extractor --mode failure   → 현재 세션 즉각 분석
2. instinct-extractor --days 14     → cross-session 검증
3. 교차 검증 → high confidence: mgr-creator 위임
               한쪽만 발견: 추가 관찰 권장
```

## Confidence 교차 검증 매트릭스

| skill-extractor | instinct-extractor | Confidence | 권장 행동 |
|-----------------|-------------------|------------|----------|
| 후보 있음 | 동일 패턴 발견 | **high** | [[mgr-creator]] 즉시 위임 |
| 후보 있음 | 패턴 없음 | medium | 추가 세션 관찰 |
| 후보 없음 | 패턴 발견 | medium | `--mode failure` 재실행 |
| 후보 없음 | 패턴 없음 | low | 현재 구조 유지 |

## 호출 빈도 권장

| 시나리오 | 스킬 | 주기 |
|----------|------|------|
| 세션 종료 | skill-extractor | 세션마다 |
| 주간 점검 | instinct-extractor --days 7 | 주 1회 |
| 릴리즈 전 | instinct-extractor --days 30 | 릴리즈마다 |
| R016 트리거 | 두 스킬 순차 | 즉시 |

## Sources

- `guides/skill-promotion/instinct-extraction.md` — 전체 가이드
- `.claude/skills/instinct-extractor/SKILL.md` — 스킬 정의
- `.claude/rules/MUST-continuous-improvement.md` — R016 Defect Response Matrix

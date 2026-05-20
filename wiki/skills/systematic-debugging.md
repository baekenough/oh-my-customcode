---
title: Systematic Debugging
type: skill
updated: 2026-05-20
sources:
  - .claude/skills/systematic-debugging/SKILL.md
  - .claude/skills/systematic-debugging/phases/timeline-correlation.md
  - .claude/skills/systematic-debugging/phases/retry-cache-timeout-audit.md
  - .claude/skills/systematic-debugging/phases/amplification-detection.md
  - .claude/skills/systematic-debugging/phases/fault-injection.md
related:
  - [[dev-review]]
  - [[adversarial-review]]
  - [[stuck-recovery]]
  - [[test-driven-development]]
---

# Systematic Debugging

Structured debugging workflow for any bug, test failure, or unexpected behavior.

## Overview

Provides a strict reproduce-first, root-cause-first, failing-test-first debugging workflow. The core phases are: (0) Blocker Triage, (1) Define the Problem, (2) Reproduce or Instrument, (3) Gather Evidence, (4) Isolate Root Cause, (5) Lock the Failure, (6) Implement a Single Fix, (7) Verify and Close. Prevents guess-and-check debugging.

## Hard Gates (v0.145.0+)

7개의 예외 없는 규칙:

1. 재현 또는 관측 가능 상태를 만들기 전에는 수정하지 않는다.
2. 원인 가설을 명시하기 전에는 수정하지 않는다.
3. 실패 테스트 또는 동등한 재현 장치를 만들기 전에는 수정하지 않는다.
4. 한 번에 하나의 가설만 검증한다.
5. 수정 시 "while I'm here" 리팩터링을 금지한다.
6. 수정 시도가 3번 실패하면 구조적 문제를 의심한다.
7. **[NEW]** retry/cache/timeout을 변경하기 전에 false-fix 가능성을 점검한다 — 에러율 감소가 원인 해소인지 증상 억제인지 구분하지 않은 수정은 유효하지 않다.

## Extended Phases (v0.145.0+)

장애 분석 및 운영 디버깅을 위한 확장 절차. 기본 Phase 0–7과 함께 사용한다.

| 상황 | 참조 파일 |
|------|----------|
| "언제부터 깨졌는가?" | `phases/timeline-correlation.md` |
| "retry/timeout 늘리면 되지 않나?" | `phases/retry-cache-timeout-audit.md` (Hard Gate #7 구현) |
| 에러가 여러 서비스로 퍼졌다 | `phases/amplification-detection.md` |
| 가설은 있지만 재현이 안 된다 | `phases/fault-injection.md` |

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Hard Gates**: 7개 (v0.145.0에서 Gate #7 추가)

## Relationships

- **Used by agents**: all agents when encountering bugs
- **Related skills**: [[dev-review]], [[adversarial-review]], [[stuck-recovery]], [[test-driven-development]]
- **See also**: [[R004]]

## Sources

- `.claude/skills/systematic-debugging/SKILL.md` — skill definition (Phase 0–7 + Hard Gates)
- `.claude/skills/systematic-debugging/phases/timeline-correlation.md` — 타임라인 상관관계 분석
- `.claude/skills/systematic-debugging/phases/retry-cache-timeout-audit.md` — Hard Gate #7 구현
- `.claude/skills/systematic-debugging/phases/amplification-detection.md` — retry storm 탐지
- `.claude/skills/systematic-debugging/phases/fault-injection.md` — 가설 검증용 장애 주입

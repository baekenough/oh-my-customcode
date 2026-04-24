---
title: Harness Engineering Guide
type: guide
updated: 2026-04-24
sources:
  - guides/harness-engineering/README.md
related:
  - [[skills/harness-synthesizer]]
  - [[skills/action-validator]]
  - [[skills/adaptive-harness]]
  - [[skills/harness-eval]]
  - [[R006]]
  - [[R021]]
  - [[guides/skill-bundle-design]]
  - [[guides/worktree-lifecycle]]
---

# Harness Engineering Guide

에이전트 행동 제어 + 인프라 격리를 설계 1급 시민으로 끌어올리는 실천 가이드. Deep Insight 3부작 (#973/#974/#976) 내재화 결과.

## Overview

하네스 엔지니어링은 에이전트가 (1) 자신의 능력을 선언하고 (2) 검증 가능한 경계 내에서 실행하며 (3) 상호 핸드오프할 수 있도록 하는 구조적 규율이다. 신규 프리미티브 도입이 아니라 기존 에이전트·스킬·규칙을 공통 언어로 연결하는 명문화다.

## 3-Layer Hierarchy

| 역할 | oh-my-customcode 매핑 |
|------|----------------------|
| **Coordinator** | 메인 대화 + routing skills (R010: 파일 수정 금지) |
| **Planner** | `deep-plan`, `release-plan`, `sdd-dev` |
| **Supervisor** | `mgr-sauron` (R017 구조 검증 관문) |
| **Executor** | 전문가 에이전트 (`lang-*`, `be-*`, `fe-*` 등) |

## Context Engineering

- Per-agent 컨텍스트 예산: R013 task-type-aware thresholds (research 40% / impl 50% / review 60% / management 70%)
- 아티팩트 핸드오프: `.claude/outputs/sessions/{날짜}/` 규약 (R006)
- PostCompact 규칙 재주입: R021 PostCompact hook → R007/R008/R009/R010/R018 재로드

## Harness Skill Stack

| 스킬 | 역할 |
|------|------|
| `harness-synthesizer` | YAML 하네스 자동 합성 (verifier/filter/policy 3-mode) |
| `action-validator` | 도구 호출 전 선언 범위 확인 (advisory, R021) |
| `adaptive-harness` | 실패 패턴 학습 → R016 규칙 업데이트 연동 |
| `harness-eval` | 15개 SE 벤치마크 기반 에이전트 품질 점수화 |

## Infrastructure Isolation

R006 `isolation: worktree | sandbox` + R002 Permission Tiers + `.claude/` 센시티브 경로 처리 (#960/#961).

## Relationships

- **Rules**: [[R002]] (Permission Tiers), [[R006]] (agent design), [[R009]] (parallel), [[R010]] (orchestrator), [[R013]] (ecomode), [[R021]] (advisory-first)
- **Skills**: [[skills/action-validator]], [[skills/harness-synthesizer]], [[skills/adaptive-harness]], [[skills/harness-eval]]
- **Guides**: [[guides/skill-bundle-design]], [[guides/worktree-lifecycle]], [[guides/multi-model-routing]]

## Sources

- `guides/harness-engineering/README.md` — 하네스 엔지니어링 통합 가이드

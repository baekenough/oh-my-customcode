---
title: Adversarial Review
type: skill
updated: 2026-05-18
sources:
  - .claude/skills/adversarial-review/SKILL.md
related:
  - [[dev-review]]
  - [[sec-codeql-expert]]
  - [[action-validator]]
  - [[crg-integration]]
  - [[token-efficiency-crg]]
---

# Adversarial Review

Adversarial code review using attacker mindset — trust boundary, attack surface, business logic, and defense evaluation.

## Overview

Reviews code from an attacker's perspective using STRIDE + OWASP frameworks across four phases: trust boundary analysis, attack surface mapping, business logic review, and defense evaluation. Two depth modes: `quick` (phases 1-2) and `thorough` (all 4 phases with detailed exploitation scenarios). Complements `dev-review` with an attacker perspective.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/adversarial-review`
- **Effort**: not specified
- **Argument hint**: `<file-or-directory> [--depth quick|thorough]`

## Relationships

- **Used by agents**: [[sec-codeql-expert]]
- **Related skills**: [[dev-review]], [[action-validator]]
- **See also**: [[R002]]

## CRG Integration

공격 표면 분석 시 `crg-integration` 스킬을 우선 호출하여 트러스트 boundary를 빠르게 매핑:

| Phase | CRG Tool | Purpose |
|-------|----------|---------|
| Attack surface | `get_impact_radius` | 보안 변경의 영향 추적 (recall-우선) |
| Caller analysis | `query_graph` | 신뢰 boundary 함수의 모든 caller 추적 |
| Diff focus | `get_minimal_context` | 보안 변경의 최소 review unit |
| Regression | `detect_changes` | 보안 의미 변경 감지 |

CRG 미연결 시 `sec-codeql-expert` + grep 조합으로 fallback. CRG의 recall-우선 특성을 sec-codeql-expert(precision-우선)로 보완하는 병행 전략 권장. 대규모 변경 PR (>50 lines) 또는 context >= 60% 시 CRG 우선 호출 (R013). Refs: #1171, #1180.

- [[crg-integration]] — wrapper 스킬 상세
- [[token-efficiency-crg]] — 설치·설정·워크플로우 통합 가이드

## Sources

- `.claude/skills/adversarial-review/SKILL.md` — skill definition

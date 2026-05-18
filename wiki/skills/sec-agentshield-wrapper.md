---
title: sec-agentshield-wrapper
type: skill
updated: 2026-05-18
sources:
  - .claude/skills/sec-agentshield-wrapper/SKILL.md
  - guides/security/agentshield-pre-flight.md
related:
  - [[sec-codeql-expert]]
  - [[adversarial-review]]
  - [[cve-triage]]
  - [[crg-integration]]
  - [[security-agentshield-pre-flight]]
---

# sec-agentshield-wrapper

코드 변경을 시작하기 전에 보안 위험을 사전 식별하는 pre-flight 보안 분석 스킬.

## Overview

변경 의도와 대상 파일/영역만으로 트러스트 경계, 위험 패턴, 권한 변경을 분석하여 proceed/caution/block advisory를 제공한다. 기존 보안 자산([[sec-codeql-expert]], [[adversarial-review]], [[cve-triage]])이 모두 post-write 단계에서 작동하는 반면, 이 스킬은 작성 전(pre-write) 단계에서 개입한다. ECC AgentShield 구현에서 흡수 (#1174).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Effort**: medium
- **Command**: `/sec-agentshield-wrapper "<파일/영역 설명> — <변경 의도>"`

## 보안 자산 타임라인

| 자산 | 실행 시점 | 역할 |
|------|-----------|------|
| **sec-agentshield-wrapper** | **pre-write** | 변경 의도 기반 위험 사전 식별 |
| adversarial-review | post-write | 공격자 마인드 4단계 리뷰 |
| sec-codeql-expert | post-write | CodeQL 정적 분석, CVE 매칭 |
| cve-triage | issue-triggered | CVE 평가, 재현 분석, 패치 검증 |

## 분석 단계

1. **트러스트 경계 식별** — 인증/인가, 외부 입력, API 호출, DB 쿼리 등 고위험 영역 분류. [[crg-integration]] `query_graph`로 caller 체인 추적 가능 (선택)
2. **위험 패턴 매칭** — token/jwt/session/upload/exec 등 키워드 기반 자동 트리거
3. **Advisory 출력** — PROCEED / CAUTION / BLOCK 3단계 + 체크리스트

## 권장 보안 파이프라인

```
sec-agentshield-wrapper (pre-write)
  → 구현
  → adversarial-review (post-write)
  → sec-codeql-expert (post-write)
```

## 한계

- 휴리스틱(키워드/영역 분류) 기반 — 100% recall 미보장
- 실제 코드 없으므로 로직 플로우 분석 불가
- 구현 후 [[adversarial-review]] + [[sec-codeql-expert]] 조합으로 보완 필수

## Sources

- `.claude/skills/sec-agentshield-wrapper/SKILL.md` — 스킬 정의
- `guides/security/agentshield-pre-flight.md` — 전체 사용 시나리오 및 패턴

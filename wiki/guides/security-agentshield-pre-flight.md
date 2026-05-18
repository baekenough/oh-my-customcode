---
title: Security — AgentShield Pre-flight Guide
type: guide
updated: 2026-05-18
sources:
  - guides/security/agentshield-pre-flight.md
  - .claude/skills/sec-agentshield-wrapper/SKILL.md
related:
  - [[sec-agentshield-wrapper]]
  - [[adversarial-review]]
  - [[sec-codeql-expert]]
  - [[cve-triage]]
  - [[crg-integration]]
---

# Security — AgentShield Pre-flight Guide

보안 사전 분석 패턴(AgentShield Pre-flight)의 레퍼런스 가이드. 코드 작성 전 위험을 식별하는 pre-write 보안 파이프라인의 전체 맥락을 다룬다.

## Overview

전통적인 보안 검토는 post-write 단계에서 이루어지므로 설계상 잘못된 방향을 발견했을 때 재작업 비용이 크다. Pre-flight 패턴은 변경 의도와 대상 파일만으로 트러스트 경계와 위험 패턴을 사전 식별하여 설계 단계에서 방향을 잡는다. [[sec-agentshield-wrapper]] 스킬의 배경 및 활용 시나리오를 제공한다.

## 보안 자산 전체 매트릭스

| 자산 | 유형 | 실행 시점 | 주요 역할 |
|------|------|-----------|-----------|
| [[sec-agentshield-wrapper]] | skill | pre-write | 변경 의도 기반 위험 사전 식별 |
| [[adversarial-review]] | skill | post-write | 공격자 마인드 4단계 리뷰 |
| [[sec-codeql-expert]] | agent | post-write | CodeQL 정적 분석, CVE 매칭 |
| [[cve-triage]] | skill | issue-triggered | CVE 평가, 재현 분석, 패치 검증 |

## 표준 보안 파이프라인

```
1. sec-agentshield-wrapper  ← 설계 전 위험 식별
2. 구현
3. adversarial-review       ← 공격자 관점 코드 리뷰
4. sec-codeql-expert        ← 정적 분석 (선택, CI에서도 가능)
```

## 주요 사용 시나리오

| 시나리오 | 예상 Advisory |
|----------|---------------|
| refresh token rotation 추가 | CAUTION/BLOCK (토큰 재사용, 경쟁 조건) |
| 파일 업로드 엔드포인트 신규 구현 | CAUTION (경로 탐색, 크기 제한) |
| 외부 웹훅 수신 처리 | CAUTION (서명 검증, 멱등성) |
| 로그 출력 포맷 변경 | PROCEED (단, PII 포함 여부 주의) |

## CRITICAL 트리거 키워드

`admin`, `bypass`, `skip auth`, `eval(`, `exec(`, `system(` — 즉시 BLOCK 고려

## [[crg-integration]] 연동

CRG `query_graph`로 변경 함수의 caller 체인을 추적하면 트러스트 경계 도달 여부 분석 정확도가 향상된다. CRG 미연결 시 Grep + Read fallback.

## Sources

- `guides/security/agentshield-pre-flight.md` — 전체 가이드
- `.claude/skills/sec-agentshield-wrapper/SKILL.md` — 스킬 정의

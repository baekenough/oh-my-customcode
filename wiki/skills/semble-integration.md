---
title: Semble Integration
type: skill
updated: 2026-06-26
sources:
  - .claude/skills/semble-integration/SKILL.md
  - guides/token-efficiency/semble.md
related:
  - [[crg-integration]]
  - [[r013]]
  - [[token-efficiency-crg]]
  - [[dev-review]]
  - [[adversarial-review]]
  - [[r001]]
  - [[token-efficiency]]
---

# Semble Integration

[MinishLab/semble](https://github.com/MinishLab/semble) MCP 서버의 의미 기반 코드 검색 도구를 노출하는 wrapper 스킬. 코드 인식 청킹 + 정적 임베딩 + BM25 + RRF 조합으로 ~98% 토큰 절감(grep+Read 대비)을 달성한다.

## Overview

Semble은 자연어 쿼리로 코드베이스 내 의미적으로 관련된 청크만 반환한다. 전체 파일 읽기 없이 컨텍스트를 주입할 수 있어 [[r013]] ecomode(context ≥ 60%) 구간에서 파일 직접 읽기 대안으로 사용한다.

- **~98% 토큰 절감**: grep+Read 패턴 대비
- **NDCG@10 = 0.854**: transformer 모델 수준 정확도를 CPU에서 달성
- **인덱싱**: ~250ms, 쿼리: ~1.5ms

> **정확도 축 caveat (#1349 검증):** `98% 토큰 절감`과 `NDCG@10=0.854`는 upstream(MinishLab) 벤더 벤치마크이지 본 프로젝트 자체 측정값이 아니다. grep+Read 대비 우위는 **토큰 비용 축 한정**이며, `NDCG@10=0.854`는 transformer-상대 retrieval 품질 지표로 **grep과의 정확도 비교가 아니다**. 연구(arxiv 2605.15184, scout #1346)는 정확 심볼/식별자 lookup 등에서 grep이 vector 검색보다 일반적으로 정확도가 높다(하니스 의존적)고 보고한다. 따라서 Semble은 **의미 검색 + 토큰 절감**에 사용하고, 정확 심볼 lookup은 grep을 우선한다.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Version**: 0.1.0
- **Effort**: low
- **MCP 의존**: `semble` MCP 서버 (수동 설치 필요)

## Exposed Tools

| 기능 | 설명 |
|------|------|
| 의미 검색 | 자연어 쿼리로 코드베이스 내 관련 청크 반환 |
| 인덱싱 | code-aware 청킹 + 정적 임베딩으로 코드베이스 인덱싱 (CPU ~250ms) |
| 결과 ranking | BM25 + RRF + embedding fusion 최종 랭킹 |

## CRG와의 보완 관계

[[crg-integration]](구조 기반)과 서로 다른 검색 축을 담당해 결합 시 시너지가 크다.

| 도구 | 검색 유형 | 강점 |
|------|----------|------|
| `semble-integration` | 의미 (임베딩) | 자연어 쿼리, 패턴 유사성 |
| [[crg-integration]] | 구조 (AST) | 호출 그래프, 영향 분석 |

**결합 패턴**: Semble로 관련 파일 식별 → CRG `get_impact_radius`로 영향 범위 확인

## Workflow Integration

- **[[dev-review]]와 조합**: Semble로 유사 패턴 사전 조사 → 범위를 좁힌 리뷰
- **[[adversarial-review]]와 조합**: Semble로 보안 패턴 수집 → adversarial-review 컨텍스트 보강
- **[[r013]] ecomode 활성 시**: grep+Read 조합 대신 Semble 의미 검색 단일 호출

## Installation

[[r001]] 정책에 따라 auto-install 금지 — 사용자가 직접 실행:

```bash
uv tool install semble
claude mcp add semble -- semble mcp
```

상세 절차 및 트러블슈팅은 `guides/token-efficiency/semble.md` 참조.

## Relationships

- **Complements**: [[crg-integration]], [[dev-review]], [[adversarial-review]]
- **Ecomode integration**: [[r013]]
- **Auto-install policy**: [[r001]]
- **See also**: [[token-efficiency]], [[token-efficiency-crg]]

## Sources

- `.claude/skills/semble-integration/SKILL.md` — skill definition, usage patterns, troubleshooting
- `guides/token-efficiency/semble.md` — detailed install guide, benchmarks, CRG comparison

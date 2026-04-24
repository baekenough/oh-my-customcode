# graphify Integration Reference

> 외부 도구 graphify의 개요 및 oh-my-customcode 스택 관계
> 내재화 배경: issue #977 (scout:integrate)

## graphify 개요

graphify는 code/docs/paper corpus를 queryable knowledge graph로 전환하는 외부 도구입니다. Python 기반, 로컬 실행, 그래프 DB 백엔드 옵션 제공.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 엔티티 추출 | 소스 파일에서 함수, 클래스, 모듈, 개념, 용어 등 구조적 엔티티를 자동으로 식별 및 추출 |
| 관계 그래프 구축 | 추출된 엔티티 간 의존 관계, 참조 관계, 의미적 유사성을 방향성 그래프(DAG)로 모델링 |
| 쿼리 인터페이스 | Cypher 또는 SPARQL 유사 질의 언어로 그래프를 탐색 — "A를 참조하는 모든 모듈", "B 개념과 가장 가까운 엔티티 5개" 등 구조화 질의 지원 |
| 다중 corpus 지원 | 코드 저장소, 마크다운 문서, arXiv PDF 등 이종 소스를 단일 그래프로 통합 가능 |
| 백엔드 선택 | 인메모리(소규모), Neo4j(중대형), SQLite 기반 lightweight 옵션 중 선택 가능 |

## oh-my-customcode 기존 자산과의 관계

| 기능 | 기존 자산 | graphify 차별점 |
|------|----------|----------------|
| 코드베이스 검색 | Grep, Glob, Explore agent | 구조화된 엔티티-관계 질의 — 키워드 매칭이 아닌 그래프 트래버설 |
| 문서 검색 | wiki-rag (wiki/index.yaml) | 자동 엔티티 추출 + 외부 corpus(arXiv 논문 등) 포함 가능 |
| 온톨로지 | ontology-rag MCP | 외부 corpus 포함, 대규모 이종 소스 통합에 특화 |
| RAG enrichment | R019 dual-layer (Layer-1: ontology-rag, Layer-2: wiki-rag) | Layer-3 후보로 식별됨 — 통합 deferred |

### 현재 스택 위치

```
사용자 질의
  ↓
[Layer-1] ontology-rag MCP  ← 내부 온톨로지 그래프 기반
  ↓
[Layer-2] wiki-rag (wiki/index.yaml)  ← 프로젝트 위키 인덱스 기반
  ↓
에이전트 라우팅 결정

[Layer-3 후보] graphify  ← 외부 corpus / 대규모 이종 소스 — 현재 deferred
```

## 통합 옵션

| 옵션 | 설명 | 상태 |
|------|------|------|
| A. 참고만 | graphify를 독립 도구로 유지, 필요 시 수동 활용 | 권고 (v0.105.0) |
| B. 외부 스킬 등록 | `scope: package` + `source.external`로 공식 통합 | v0.106.0+ 검토 |
| C. R019 Layer-3 통합 | ontology-rag/wiki-rag와 함께 라우팅 enrichment에 활용 | 별도 이슈 이관 |

### 옵션 B 스킬 등록 예시 (참고용)

```yaml
# .claude/skills/graphify-query/SKILL.md 예시 (미생성)
---
name: graphify-query
description: Query graphify knowledge graph for entity-relationship exploration
scope: package
source:
  type: external
  origin: github
  url: https://github.com/graphify/graphify
  version: stable
---
```

## 권고

**현재 (v0.105.0)**: 옵션 A — 이 가이드를 reference로만 유지. 실제 통합은 사용 케이스 축적 후.

**조건부 격상 (v0.106.0+)**: 다음 조건 중 하나 충족 시 옵션 B 검토:
- 프로젝트 내 corpus가 1,000+ 파일 규모로 성장
- wiki-rag/ontology-rag 한계가 명확히 드러남 (false positive율 상승, 다중 corpus 질의 실패 등)
- graphify 업스트림이 안정화 (major version 출시)

## Deferred

- 실제 graphify 스킬 등록 (옵션 B) — 사용 케이스 축적 후 재평가
- R019 Layer-3 라우팅 enrichment 통합 (옵션 C) — 별도 이슈 등록 예정
- graphify query interface를 MCP 도구로 래핑 — ontology-rag MCP 패턴 참고

## 참조

- `.claude/skills/wiki/SKILL.md` — 위키 생성/유지 스킬 (Karpathy LLM Wiki 패턴)
- `.claude/skills/wiki-rag/SKILL.md` — wiki/index.yaml 기반 RAG 조회 스킬
- `.claude/skills/ontology-rag/SKILL.md` — ontology-rag MCP 기반 라우팅 enrichment
- `.claude/rules/SHOULD-ontology-rag-routing.md` — R019 dual-layer enrichment 규칙
- 내재화 배경: issue #977

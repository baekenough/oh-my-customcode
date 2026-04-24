---
title: External Tools Guide
type: guide
updated: 2026-04-24
sources:
  - guides/external-tools/graphify-integration.md
related:
  - [[skills/wiki-rag]]
  - [[skills/ontology-rag]]
  - [[R019]]
  - [[guides/hook-data-flow]]
---

# External Tools Guide

oh-my-customcode 스택과 연동 가능한 외부 도구 참조 가이드. 현재 graphify 통합 레퍼런스 포함.

## graphify Integration

graphify는 code/docs/paper corpus를 queryable knowledge graph로 전환하는 외부 도구 (Python 기반, 로컬 실행).

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 엔티티 추출 | 소스 파일에서 함수, 클래스, 개념 등 구조적 엔티티 자동 식별 |
| 관계 그래프 | 엔티티 간 의존·참조·의미적 유사성을 방향성 그래프(DAG)로 모델링 |
| 쿼리 인터페이스 | Cypher/SPARQL 유사 질의 언어로 그래프 탐색 |
| 다중 corpus | 코드 저장소, 마크다운 문서, arXiv PDF 등 이종 소스 통합 |
| 백엔드 선택 | 인메모리 / Neo4j / SQLite lightweight 중 선택 가능 |

### 기존 RAG 스택과의 위치

```
[Layer-1] ontology-rag MCP  ← 내부 온톨로지 그래프
[Layer-2] wiki-rag (wiki/index.yaml)  ← 프로젝트 위키 인덱스
[Layer-3 후보] graphify  ← 외부 corpus / 대규모 이종 소스 — 현재 deferred
```

### 통합 옵션 (v0.105.0 권고)

- **옵션 A (현재)**: 독립 도구로 유지, 이 가이드를 reference로만 활용
- **옵션 B (v0.106.0+ 검토)**: `scope: package` 외부 스킬로 등록
- **옵션 C (별도 이슈)**: R019 Layer-3 라우팅 enrichment 통합

옵션 B 격상 조건: corpus 1,000+ 파일 성장 OR wiki-rag/ontology-rag 한계 명확 OR graphify 업스트림 major 버전 출시.

## Relationships

- **Rules**: [[R019]] (dual-layer enrichment — graphify는 Layer-3 후보)
- **Skills**: [[skills/wiki-rag]], [[skills/ontology-rag]]
- **Background**: issue #977 (scout:integrate)

## Sources

- `guides/external-tools/graphify-integration.md` — graphify 개요 및 스택 관계 레퍼런스

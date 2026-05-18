---
title: External Tools Guide
type: guide
updated: 2026-05-18
sources:
  - guides/external-tools/graphify-integration.md
  - guides/external-tools/ecc-absorption-decisions.md
related:
  - [[skills/wiki-rag]]
  - [[skills/ontology-rag]]
  - [[R019]]
  - [[R006]]
  - [[guides/hook-data-flow]]
  - [[concepts/compilation-metaphor]]
---

# External Tools Guide

oh-my-customcode 스택과 연동 가능한 외부 도구 참조 가이드. graphify 통합 레퍼런스 및 ECC 패턴 흡수 결정 아카이브 포함.

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

## ECC Absorption Decisions

ECC (Everything Claude Code) 패턴 흡수 결정 이력. v0.142.0–v0.143.0 기간 4개 패턴 검토.

### 흡수 기준

| 기준 | 설명 |
|------|------|
| metaphor 정합성 | [[concepts/compilation-metaphor]] (R006) 강화 여부 |
| single-maintainer 비용 | 외부 의존성 추적 부담 |
| 사용자 가치 | 기존 워크플로우 개선 |
| 차별점 영향 | ECC와 zero-sum 경쟁 여부 |

### 흡수된 패턴 (v0.142.0, #1170)

| 패턴 | 결정 | 이유 |
|------|------|------|
| `sec-agentshield-wrapper` (#1174) | ACCEPT | pre-flight 단계 — CodeQL post-write와 시점 분리, compilation pipeline 완성 |
| `instinct-extractor` (#1175) | ACCEPT | 누적 세션 패턴 채굴 — skill-extractor(단일)와 trigger 분리, R016 강화 |
| `manifest-install --profile` (#1177) | ACCEPT | 도메인별 설치 profile 5종 — deactivation 비용 해소, 진입 장벽 낮춤 |

### 거부된 패턴 — Cross-harness Export (#1176)

ECC의 8개 외부 harness(Cursor/Aider/Codex/Opencode 등) export 기능.

**REJECT** (3가지 이유):
1. compilation metaphor 순수성 보호 — single-target → multi-target 전환은 R006 핵심 훼손
2. ECC와 zero-sum 경쟁 회피 — 동일 기능 중복 시 차별화 희석
3. single-maintainer R016 부담 — 8개 harness 변동 추적이 core 개발과 경쟁

**대안**: `manifest-install --profile` (#1177)이 신규 진입 문제를 부분 해소. DEFER 재검토 조건: 외부 기여자 5명+ OR 한국어 사용자 50%+.

**포지셔닝 결과**:

| 도구 | 포지션 |
|------|--------|
| oh-my-customcode | compilation metaphor pure-play |
| ECC | cross-harness pragmatist |

### KPI 모니터링

내부 메트릭: `.claude/agent-memory/sys-memory-keeper/` → `[[project-ecc-kpi-internal-metrics]]`

- 외부 기여자 5명 이상 → DEFER 재검토
- cross-harness export 요청 30회 이상 → ACCEPT 재검토

## Sources

- `guides/external-tools/graphify-integration.md` — graphify 개요 및 스택 관계 레퍼런스
- `guides/external-tools/ecc-absorption-decisions.md` — ECC 패턴 흡수 결정 아카이브 (#1170, #1176)

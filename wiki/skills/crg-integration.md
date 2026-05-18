---
title: CRG Integration
type: skill
updated: 2026-05-18
sources:
  - .claude/skills/crg-integration/SKILL.md
  - guides/token-efficiency/crg.md
related:
  - [[dev-review]]
  - [[adversarial-review]]
  - [[r013]]
  - [[token-efficiency]]
  - [[token-efficiency-audit]]
---

# CRG Integration

code-review-graph(CRG) MCP 서버의 핵심 4개 도구를 노출하는 wrapper 스킬. AST 기반 지식 그래프로 전체 파일 대신 관련 노드만 추출해 토큰을 절감한다.

## Overview

CRG(code-review-graph)는 코드베이스를 AST 기반 지식 그래프로 변환하는 Python MCP 서버다. 전체 28개 도구 중 oh-my-customcode 워크플로우에 적합한 4개만 선별해 노출한다. 공식 벤치마크 기준 8.2× 토큰 절감(AST 검색 적합 작업 한정). [[r013]] ecomode가 context ≥ 60%에서 활성화될 때 파일 직접 읽기의 대안으로 사용한다.

**핵심 경고**: recall-우선 튜닝(precision 0.38, MRR 0.35) — 결과에 없다고 없는 것이 아니다. grep/semantic search와 병행 필수.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Version**: 0.1.0
- **Effort**: low
- **MCP 의존**: `code-review-graph` MCP 서버 (수동 설치 필요)

## Exposed Tools (4종)

| Tool | 용도 |
|------|------|
| `get_minimal_context` | 인접 함수/import 그래프만 추출 (전체 파일 대체) |
| `get_impact_radius` | 변경 영향 범위 dependency tree (recall-우선) |
| `query_graph` | AST 노드 자연어 쿼리 |
| `detect_changes` | 두 Git 시점 간 의미적 diff |

## Workflow Integration

- **[[dev-review]]와 조합**: `get_impact_radius` → 영향 범위 파악 → [[dev-review]] 범위 축소
- **[[adversarial-review]]와 조합**: `get_minimal_context` → 최소 컨텍스트 → [[adversarial-review]] 입력 최적화
- **R013 ecomode 활성 시**: 파일 직접 읽기 대신 `get_minimal_context`, grep 대신 `query_graph`

## Installation

R001 정책에 따라 auto-install 금지 — 사용자가 직접 실행:

```bash
pip install code-review-graph  # 또는 pipx / uvx
```

`.mcp.json`에 수동 등록 후 Claude Code 재시작. 상세 절차는 `guides/token-efficiency/crg.md` 참조.

## Relationships

- **Complements**: [[dev-review]], [[adversarial-review]]
- **Ecomode integration**: [[r013]]
- **Phase β migration target**: `claude-mem:smart-explore` → `query_graph`, `claude-mem:pathfinder` → `get_impact_radius` (#1169)
- **See also**: [[token-efficiency]], [[r001]]

## Sources

- `.claude/skills/crg-integration/SKILL.md` — skill definition, usage patterns
- `guides/token-efficiency/crg.md` — detailed install guide, benchmarks, troubleshooting

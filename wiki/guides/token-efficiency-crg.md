---
title: "Token Efficiency — CRG Integration Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/token-efficiency/crg.md
  - .claude/skills/crg-integration/SKILL.md
related:
  - [[token-efficiency]]
  - [[crg-integration]]
  - [[r013]]
  - [[r001]]
  - [[dev-review]]
  - [[adversarial-review]]
---

# Token Efficiency — CRG Integration Guide

code-review-graph(CRG) MCP 서버의 상세 설치·설정·워크플로우 통합 가이드. 기존 [[token-efficiency]] 3-layer stack에 CRG를 추가 절감 레이어로 통합하는 방법을 다룬다.

## CRG 개요

| 항목 | 값 |
|------|-----|
| 구현 | Python MCP server |
| 전체 도구 수 | ~28개 |
| oh-my-customcode 노출 | 4개 ([[crg-integration]] 스킬) |
| 토큰 절감 벤치마크 | **8.2×** (AST 검색 적합 작업 기준) |
| Precision | 0.38 (recall-우선 튜닝) |
| MRR | 0.35 |

**R001 정책**: auto-install 스크립트·hook 작성 금지. 아래 명령어는 개발자가 직접 실행한다.

## 설치

```bash
# 방법 A: pip
pip install code-review-graph

# 방법 B: pipx (격리 환경 권장)
pipx install code-review-graph
```

`.mcp.json` 수동 등록:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "code-review-graph",
      "args": []
    }
  }
}
```

초기 인덱싱: `code-review-graph index` (대용량 코드베이스 권장). `.gitignore`에 `.code-review-graph/` 추가.

## Ecomode 통합 ([[r013]])

context ≥ 60%에서 파일 직접 읽기 대신 CRG 우선 사용:

| 기존 방식 | CRG 대체 |
|----------|---------|
| `Read(entire_file)` | `get_minimal_context(file, line)` |
| `Grep(pattern, recursive)` | `query_graph("find all X")` |
| `Read(affected_files[])` | `get_impact_radius(changed)` |

## 절감 효과 — 작업 유형별

| 작업 유형 | 절감 효과 |
|----------|----------|
| 함수 호출 그래프 탐색 | 높음 |
| 의존성 영향 분석 | 높음 |
| 특정 패턴 코드 검색 | 중간 |
| UI 컴포넌트 리뷰 | 낮음 |
| 설정 파일(YAML, JSON) 분석 | 낮음 |

## 핵심 경고

CRG는 recall-우선 도구다. "결과에 없으면 없는 것"이 아니다. precision 0.38은 recall trade-off의 결과이며, 누락 가능성을 항상 고려하고 grep/semantic search와 병행한다.

## Cross-References

- [[crg-integration]] — wrapper 스킬 (4개 도구 상세, 사용 패턴)
- [[token-efficiency]] — 기존 3-layer defense stack (CRG는 추가 레이어)
- [[r013]] — ecomode spec (context budget, 자동 활성화 임계값)
- [[r001]] — auto-install 금지 정책
- [[dev-review]], [[adversarial-review]] — CRG와 조합하는 리뷰 스킬

## Sources

- `guides/token-efficiency/crg.md` — 원본 (설치, 벤치마크, 트러블슈팅 전체)
- `.claude/skills/crg-integration/SKILL.md` — 스킬 정의

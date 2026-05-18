---
title: "Token Efficiency — Semble Integration Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/token-efficiency/semble.md
  - .claude/skills/semble-integration/SKILL.md
related:
  - [[semble-integration]]
  - [[r013]]
  - [[r001]]
  - [[crg-integration]]
  - [[token-efficiency-crg]]
  - [[token-efficiency]]
  - [[dev-review]]
---

# Token Efficiency — Semble Integration Guide

MinishLab/semble MCP 서버를 통한 의미 기반 코드 검색 통합 가이드. grep+Read 대비 ~98% 토큰 절감을 제공하는 [[semble-integration]] 스킬의 설치·운용 레퍼런스.

## Overview

Semble은 Chonkie(code-aware chunking) + Model2Vec potion-code-16M(정적 임베딩) + BM25 + RRF 조합으로 transformer 수준 정확도(NDCG@10=0.854)를 CPU에서 달성한다.

| 항목 | 값 |
|------|-----|
| 토큰 절감 | **~98%** (grep+Read 대비) |
| CPU 인덱싱 | ~250ms |
| 쿼리 응답 | ~1.5ms |
| NDCG@10 | 0.854 |

## Semble vs CRG

| 항목 | Semble | [[crg-integration]] |
|------|--------|---------------------|
| 검색 방식 | 의미 기반 (임베딩) | 구조 기반 (AST) |
| 강점 | 자연어 쿼리, 패턴 유사성 | 호출 그래프, 의존성 분석 |
| 토큰 절감 | ~98% (grep+Read 대비) | 8.2× |
| 정확도 | NDCG@10 = 0.854 | precision 0.38 (recall-우선) |

두 도구는 서로 다른 축을 담당하며 결합 시 완전한 코드 이해가 가능하다.

## Installation

> [[r001]]: auto-install 스크립트 금지. 아래 명령어는 **사용자가 직접** 실행한다.

```bash
# 1. 패키지 설치
uv tool install semble

# 2. MCP 서버 등록 (방법 A: 권장)
claude mcp add semble -- semble mcp

# 3. 선택: 명시적 인덱싱
semble index
```

`.mcp.json` 수동 편집 방법:

```json
{
  "mcpServers": {
    "semble": {
      "command": "semble",
      "args": ["mcp"]
    }
  }
}
```

auto-install hook 또는 스크립트로 `.mcp.json`을 자동 수정하는 방식은 [[r001]] 위반이다.

## Usage Scenarios

### 의미 검색 → Semble

| 작업 | 도구 |
|------|------|
| "인증 관련 코드 전부 찾기" | Semble |
| "에러 핸들링 컨벤션 파악" | Semble |
| "이 로직과 비슷한 코드 찾기" | Semble |

### 구조 분석 → CRG

| 작업 | 도구 |
|------|------|
| "이 함수의 caller는?" | [[crg-integration]] `query_graph` |
| "변경 영향 범위 파악" | [[crg-integration]] `get_impact_radius` |

### 결합 패턴

```
1. Semble "authentication middleware" → 관련 파일 목록
2. CRG get_impact_radius(files) → 영향 범위
3. Semble "auth error handling" → 에러 처리 패턴
4. /dev-review {focused_files} → 좁혀진 범위 리뷰
```

## R013 Ecomode 통합

[[r013]] ecomode가 context ≥ 60%에서 자동 활성화될 때:

| 기존 방식 | Semble 대체 |
|----------|-----------|
| `Grep(pattern)` + `Read(file)` | Semble 의미 검색 단일 호출 |
| `Read(multiple_files[])` | Semble 쿼리 → 관련 청크만 수신 |

## Troubleshooting

| 증상 | 해결 |
|------|------|
| MCP 도구가 보이지 않음 | MCP 등록 확인, Claude Code 재시작 |
| `command not found: semble` | `uv tool install semble` 재실행, `which semble` 확인 |
| 첫 호출이 느림 | lazy 인덱싱 정상 동작. `semble index` 사전 인덱싱 권장 |
| 검색 결과 없음 | `semble index` 재실행, 쿼리 구체화 |

## Relationships

- **Skill**: [[semble-integration]]
- **Ecomode**: [[r013]]
- **Safety policy**: [[r001]] (auto-install 금지)
- **Complementary**: [[crg-integration]], [[token-efficiency-crg]]
- **Stack overview**: [[token-efficiency]]

## Sources

- `guides/token-efficiency/semble.md` — 원본 가이드 (설치, 벤치마크, CRG 비교)
- `.claude/skills/semble-integration/SKILL.md` — wrapper 스킬 정의

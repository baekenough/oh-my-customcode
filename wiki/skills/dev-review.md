---
title: Dev Review
type: skill
updated: 2026-05-18
sources:
  - .claude/skills/dev-review/SKILL.md
related:
  - [[dev-refactor]]
  - [[adversarial-review]]
  - [[crg-integration]]
  - [[token-efficiency-crg]]
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-typescript-expert]]
---

# Dev Review

Review code against language-specific best practices.

## Overview

Routes code review to the language-specific expert agent. Runs pre-flight guards: auto-generated code detection (WARN), formatting-only changes detection (INFO), single syntax error detection (INFO), and linter availability check (INFO). Selects the appropriate expert based on file extensions. Optionally persists findings to `.claude/outputs/sessions/`. Complements `adversarial-review` with best-practices coverage.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/dev-review`
- **Effort**: not specified
- **Argument hint**: `<file-or-directory> [--lang <language>]`

## Relationships

- **Used by agents**: [[lang-golang-expert]], [[lang-python-expert]], [[lang-typescript-expert]], [[lang-rust-expert]], [[lang-kotlin-expert]], [[be-springboot-expert]], [[fe-vercel-agent]]
- **Related skills**: [[dev-refactor]], [[adversarial-review]]
- **See also**: [[R010]]

## CRG Integration

`crg-integration` 스킬 (MCP `code-review-graph` 연결 시) 리뷰 전 선행 호출로 토큰 비용 절감:

| Phase | CRG Tool | Purpose |
|-------|----------|---------|
| Pre-review | `get_impact_radius` | 변경 영향 범위 사전 파악 |
| Search | `query_graph` | AST 기반 호출자/피호출자 추적 |
| Diff | `get_minimal_context` | 변경 코드 최소 컨텍스트 |
| Semantic | `detect_changes` | 두 시점 의미적 차이 |

CRG 미연결 시 grep/Grep으로 자동 fallback. context >= 60% 시 CRG 우선 권장 (R013). 벤치마크: 8.2× 토큰 절감 (AST 적합 작업 기준). Refs: #1171, #1180.

- [[crg-integration]] — wrapper 스킬 상세
- [[token-efficiency-crg]] — 설치·설정·워크플로우 통합 가이드

## Sources

- `.claude/skills/dev-review/SKILL.md` — skill definition

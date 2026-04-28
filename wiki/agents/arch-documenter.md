---
title: arch-documenter
type: agent
updated: 2026-04-28
sources:
  - .claude/agents/arch-documenter.md
related:
  - [[arch-speckit-agent]]
  - [[mgr-creator]]
  - [[mgr-sauron]]
  - [[r009]]
  - [[r018]]
---

# arch-documenter

Architecture documentation specialist for generating system design docs, API specifications (OpenAPI), Architecture Decision Records (ADRs), technical diagrams, and README maintenance.

## Overview

`arch-documenter` handles all software architecture documentation needs. It produces human-readable technical artifacts — from high-level system overviews to detailed API contracts — using standard formats like Markdown, Mermaid diagrams, and OpenAPI/Swagger specs. It cannot execute code or deploy systems; its role is purely documentation and specification.

The agent operates with `project`-scoped memory, meaning it retains knowledge about the project structure across sessions.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob (no Bash)
- **Memory**: project
- **Effort**: high
- **Limitations**: cannot execute commands, cannot deploy

## Document Types Produced

| Type | Format |
|------|--------|
| Architecture overview | Markdown + Mermaid/PlantUML diagrams |
| API specification | OpenAPI/Swagger |
| Architecture Decision Records | Markdown (ADR format) |
| README / developer guides | Markdown |

## Input Constraints (Plan Decomposition Threshold)

`arch-documenter`는 plan/spec 작성 작업에 대해 입력 크기를 검사하고 자동으로 halt 또는 경고를 반환한다 (#1085).

| 입력 크기 | 동작 |
|-----------|------|
| < 5000 tokens, single domain | 정상 진행 |
| 5000–8000 tokens 또는 2–3 domains | 경고 반환 — 도메인별 서브에이전트 호출 권장 |
| > 8000 tokens 또는 4+ domains | **Halt** — "This plan spans N domains; recommend invoking parallel arch-documenter agents per domain ([[r009]]) or Agent Teams with reviewer ([[r018]])" |

이 임계치는 단일 에이전트 거대 프롬프트가 유발하는 latency timeout과 context 낭비를 방지하기 위해 도입되었다. 8000+ 토큰 입력이 예상되면 호출 전에 도메인별로 분할해야 한다.

## Relationships

- **Depends on**: project source files (read-only), existing docs
- **Used by**: [[mgr-sauron]] (documentation accuracy verification), [[qa-writer]] (archive destination for QA docs)
- **See also**: [[arch-speckit-agent]] (spec-driven requirements), [[mgr-creator]] (new guides creation)
- **Governed by**: [[r009]] (parallel execution threshold), [[r018]] (Agent Teams for large multi-domain plans)

## Sources

- `.claude/agents/arch-documenter.md` — agent definition (Input Constraints section #1085)

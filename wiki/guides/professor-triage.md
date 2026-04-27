---
title: Professor Triage Guide
type: guide
updated: 2026-04-27
sources:
  - guides/professor-triage/README.md
  - guides/professor-triage/phases.md
related:
  - [[skills/professor-triage]]
  - [[agents/mgr-gitnerd]]
  - [[rules/r009]]
  - [[rules/r010]]
  - [[rules/r018]]
  - [[guides/harness-engineering]]
  - [[guides/agent-eval]]
---

# Professor Triage Guide

GitHub 이슈를 현재 코드베이스에 직접 대조 분석하는 5-phase 자동 트리아지 파이프라인. 이슈별 영향 범위, 해결 여부, 우선순위·규모 추정을 자동 생성하고 저위험 조치를 자동 실행한다.

## What this guide covers

- Phase-by-phase implementation detail for the `/professor-triage` skill
- Agent selection rationale (why `general-purpose` not `arch-documenter` for Phase 4)
- Parallelization strategy per R009/R018 for each phase
- Sensitive-path artifact protocol (`.claude/outputs/` via `/tmp/*.sh` bypass)
- Comment verification gate (Phase 4F) before GitHub actions

## 5-Phase Architecture

| Phase | Name | Owner | Model |
|-------|------|-------|-------|
| 1 | Gather | Orchestrator | — |
| 2 | Codebase Analysis | Explore agents | haiku |
| 3 | Cross-Analyze | Orchestrator (opus for >15 issues) | sonnet/opus |
| 4 | Multi-Perspective Analysis & Output | general-purpose agents | sonnet/opus |
| 5 | Act | mgr-gitnerd | — |

## Key Design Decision: Phase 4 Agent

Phase 4 uses `general-purpose` (NOT `arch-documenter`). `arch-documenter` has `disallowedTools: [Bash]` — it cannot execute the `/tmp/*.sh` sensitive-path bypass, falls back to `Write` directly on `.claude/outputs/`, and triggers the CC sensitive-path guard. `general-purpose` has Bash access and executes the bypass correctly. See #1043.

## Phase 4 Parallelization

- 4A (Architect Analysis) + 4B (Colleague Review): parallel — independent perspectives
- 4C (Professor Synthesis): after 4A + 4B — requires both inputs
- 4D (Triage Comment) + 4E (Artifact Report): parallel — both depend on 4C
- 4F (Comment Verification Gate): after all above — mandatory before Phase 5

## Companion skill

`.claude/skills/professor-triage/SKILL.md` carries the workflow contract and inline directives that must survive Agent-tool prompt synthesis. This guide carries phase implementation detail.

## See also

- [[skills/professor-triage]] — workflow contract (thin SKILL.md)
- [[agents/mgr-gitnerd]] — Phase 5 GitHub operations owner
- [[guides/harness-engineering]] — 3-layer hierarchy and artifact channel protocol
- [R009](../rules/r009.md) — parallel execution rules applied in Phase 2 and 4
- [R018](../rules/r018.md) — Agent Teams threshold (10+ issues in Phase 2)

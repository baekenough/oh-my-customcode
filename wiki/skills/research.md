---
title: Research
type: skill
updated: 2026-10-05
sources:
  - .claude/skills/research/SKILL.md
related:
  - [[deep-plan]]
  - [[result-aggregation]]
  - [[R018]]
---

# Research

10-team parallel deep analysis with cross-validation for complex research tasks.

## Overview

Spawns 10 parallel research agents (Agent Teams when available, R018) to analyze a topic from different angles simultaneously. Each team investigates a specific aspect (architecture, security, performance, ecosystem, etc.), then a synthesizer agent aggregates findings with cross-validation. Produces a comprehensive research report saved to `.claude/outputs/`. Designed for complex architectural decisions or technology evaluations. Team members use their own Agent tool access and deliver results via `SendMessage` only when their tool set includes them; otherwise they fall back to a file-channel handoff (artifact file path) relayed by the orchestrator ([[R018]] "멤버 도구 부재 시 대체 규약", #1817). Per-call `mode: "bypassPermissions"` is required on CC < 2.1.212 and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (agent frontmatter `permissionMode` may adjust it); verify the effective mode before unattended runs ([[r010]] "Universal bypassPermissions", #1818).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/research`
- **Effort**: not specified
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[deep-plan]], [[result-aggregation]], [[task-decomposition]]
- **See also**: [[R018]], [[R009]]

## Sources

- `.claude/skills/research/SKILL.md` — skill definition (teams-compatible flag added; sensitive-path bypass documented #1045)

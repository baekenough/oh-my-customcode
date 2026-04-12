---
title: QA Lead Routing
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/qa-lead-routing/SKILL.md
related:
  - [[qa-planner]]
  - [[qa-writer]]
  - [[qa-engineer]]
---

# QA Lead Routing

Coordinates QA workflow across planner, writer, and engineer agents.

## Overview

Routes QA-related tasks to the appropriate QA agent: `qa-planner` for test strategy and planning, `qa-writer` for test case authoring, and `qa-engineer` for test execution and CI integration. Determines the right specialist based on task type (planning vs. writing vs. executing). Supports R019 ontology-RAG enrichment and falls back to dynamic agent creation for novel QA scenarios.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[secretary-routing]], [[dev-lead-routing]], [[de-lead-routing]]
- **See also**: [[R010]], [[R015]], [[qa-planner]], [[qa-writer]], [[qa-engineer]]

## Sources

- `.claude/skills/qa-lead-routing/SKILL.md` — skill definition

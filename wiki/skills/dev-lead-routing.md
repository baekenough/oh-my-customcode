---
title: Dev Lead Routing
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/dev-lead-routing/SKILL.md
related:
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-typescript-expert]]
  - [[lang-rust-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java21-expert]]
  - [[fe-vercel-agent]]
---

# Dev Lead Routing

Routes development tasks to the correct language/framework expert agent.

## Overview

Routing skill for software development tasks. Detects the appropriate language or framework expert based on file extensions, keywords, and project context, then delegates via the Agent tool. Targets all language experts (Go, Python, TypeScript, Rust, Kotlin, Java21) and backend/frontend specialists. Supports R019 ontology-RAG enrichment for skill suggestions. Falls back to dynamic agent creation via `mgr-creator` when no specialist matches.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[secretary-routing]], [[de-lead-routing]], [[qa-lead-routing]], [[intent-detection]]
- **See also**: [[R010]], [[R015]], [[R019]]

## Sources

- `.claude/skills/dev-lead-routing/SKILL.md` — skill definition

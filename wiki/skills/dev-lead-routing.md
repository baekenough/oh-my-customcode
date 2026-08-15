---
title: Dev Lead Routing
type: skill
updated: 2026-08-15
sources:
  - .claude/skills/dev-lead-routing/SKILL.md
related:
  - [[lang-golang-expert]]
  - [[lang-python-expert]]
  - [[lang-typescript-expert]]
  - [[lang-rust-expert]]
  - [[lang-kotlin-expert]]
  - [[lang-java-expert]]
  - [[fe-vercel-agent]]
---

# Dev Lead Routing

Routes development tasks to the correct language/framework expert agent.

## Overview

Routing skill for software development tasks. Detects the appropriate language or framework expert based on file extensions, keywords, and project context, then delegates via the Agent tool. Targets all language experts (Go, Python, TypeScript, Rust, Kotlin, Java) and backend/frontend specialists. Supports R019 ontology-RAG enrichment for skill suggestions. Falls back to dynamic agent creation via `mgr-creator` when no specialist matches.

## Routing Order

Step 1 evaluates Agent Teams eligibility ([[R018]]), Step 2 selects the expert agent. Teams is available only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **AND** `TeamCreate` is present in the tool list — the env var alone is not sufficient, and `SendMessage` presence is not evidence of Teams. When that Detection resolves to **No**, Step 1 is skipped entirely and routing proceeds via the Agent tool under [[R009]]/[[R010]]; the skill loses no capability, since expert selection never depended on Teams. Teams is preferred for multi-language feature work, full-stack implementation, and cross-layer (FE + BE + DB) debugging; the Agent tool for single-language tasks and simple file search/validation.

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
- Content-drift resync 2026-08-15 (v1.1.47, #1582): documented the Step 1/Step 2 routing order and the tightened Agent Teams availability check — env var **AND** `TeamCreate` present (previously "env var or TeamCreate/SendMessage present"), plus the newly added explicit fallback that a **No** Detection skips Step 1 and routes via the Agent tool under [[R009]]/[[R010]].

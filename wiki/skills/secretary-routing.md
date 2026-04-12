---
title: Secretary Routing
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/secretary-routing/SKILL.md
related:
  - [[mgr-creator]]
  - [[mgr-updater]]
  - [[mgr-supplier]]
  - [[mgr-gitnerd]]
  - [[mgr-sauron]]
  - [[sys-memory-keeper]]
---

# Secretary Routing

Routes agent management tasks to the correct manager agent.

## Overview

Routes management tasks to the appropriate manager: `mgr-creator` (create), `mgr-updater` (update/sync), `mgr-supplier` (audit), `mgr-gitnerd` (git), `mgr-sauron` (verify), `mgr-claude-code-bible` (spec check), `sys-memory-keeper` (memory), `sys-naggy` (todos). Evaluates Agent Teams eligibility before spawning (R018). Supports `improve-report` and `auto-improve` keywords for skill invocation. Includes ontology-RAG enrichment (R019).

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Context**: fork

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dev-lead-routing]], [[de-lead-routing]], [[qa-lead-routing]], [[intent-detection]]
- **See also**: [[R010]], [[R015]], [[R018]], [[R019]]

## Sources

- `.claude/skills/secretary-routing/SKILL.md` — skill definition

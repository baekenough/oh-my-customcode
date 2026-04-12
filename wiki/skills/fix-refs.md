---
title: Fix Refs
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/fix-refs/SKILL.md
related:
  - [[audit-agents]]
  - [[sauron-watch]]
  - [[mgr-supplier]]
---

# Fix Refs

Fix broken references in agent definitions, skills, and routing tables.

## Overview

Repairs broken skill references, guide references, and routing table entries in `.claude/agents/`. Scans for dead skill paths, missing guide directories, and stale routing entries, then applies targeted fixes. Works alongside `audit-agents` (which detects) and `mgr-supplier` (which validates). Delegated from `mgr-supplier` or run directly as part of R017 verification.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:fix-refs`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-supplier]]
- **Related skills**: [[audit-agents]], [[sauron-watch]], [[update-docs]]
- **See also**: [[R017]], [[mgr-sauron]]

## Sources

- `.claude/skills/fix-refs/SKILL.md` — skill definition

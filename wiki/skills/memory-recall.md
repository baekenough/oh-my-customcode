---
title: Memory Recall
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/memory-recall/SKILL.md
related:
  - [[memory-save]]
  - [[memory-management]]
  - [[sys-memory-keeper]]
  - [[R011]]
---

# Memory Recall

Search and recall memories from claude-mem using semantic search.

## Overview

Searches claude-mem for relevant memories using semantic queries. Default bias favors recall over precision — cast a wide net, filter later. Supports `--recent` (latest memories), `--limit` (result count), `--date` (filter by date), and `--verbose` (full content). Always prefixes queries with the project name for proper scoping.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/memory-recall`
- **Effort**: not specified
- **Argument hint**: `<query> [--recent] [--limit <n>]`

## Relationships

- **Used by agents**: [[sys-memory-keeper]]
- **Related skills**: [[memory-save]], [[memory-management]]
- **See also**: [[R011]]

## Sources

- `.claude/skills/memory-recall/SKILL.md` — skill definition

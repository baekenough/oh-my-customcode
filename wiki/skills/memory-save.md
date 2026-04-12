---
title: Memory Save
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/memory-save/SKILL.md
related:
  - [[memory-recall]]
  - [[memory-management]]
  - [[sys-memory-keeper]]
  - [[R011]]
---

# Memory Save

Save current session context to claude-mem for persistence across context compaction.

## Overview

Collects the current session's completed tasks, decisions, and open items, then stores them in claude-mem with project metadata and optional user-specified tags. Supports `--tags`, `--include-code`, `--summary`, and `--verbose` options. Model invocation is disabled — runs as a direct skill execution. Returns the saved memory ID.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/memory-save`
- **Effort**: not specified
- **Argument hint**: `[--tags <tags>] [--include-code]`

## Relationships

- **Used by agents**: [[sys-memory-keeper]]
- **Related skills**: [[memory-recall]], [[memory-management]]
- **See also**: [[R011]]

## Sources

- `.claude/skills/memory-save/SKILL.md` — skill definition

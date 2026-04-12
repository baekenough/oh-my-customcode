---
title: Memory Management
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/memory-management/SKILL.md
related:
  - [[memory-save]]
  - [[memory-recall]]
  - [[sys-memory-keeper]]
  - [[R011]]
---

# Memory Management

Memory persistence operations using claude-mem for session context survival.

## Overview

Provides save, recall, and get operations for claude-mem (Chroma-based vector store). Save collects session data (tasks, decisions, open items), formats with metadata, and stores via `chroma_add_documents`. Recall performs semantic search prefixed with project name. Get retrieves by document ID. Used internally by `sys-memory-keeper`. Always prefix queries with project name for accurate retrieval.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[sys-memory-keeper]]
- **Related skills**: [[memory-save]], [[memory-recall]]
- **See also**: [[R011]]

## Sources

- `.claude/skills/memory-management/SKILL.md` — skill definition

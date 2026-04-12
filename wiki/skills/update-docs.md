---
title: Update Docs
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/update-docs/SKILL.md
related:
  - [[mgr-updater]]
  - [[sauron-watch]]
  - [[audit-agents]]
---

# Update Docs

Synchronize project structure documentation with the actual codebase state.

## Overview

Syncs CLAUDE.md and related documentation with actual agent/skill/guide counts and listings. Reads current file counts, compares against documentation, and updates CLAUDE.md agent table, skill list, and command table to match reality. Run as part of R017 verification workflow. Delegated to `mgr-updater`.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:update-docs`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-updater]]
- **Related skills**: [[sauron-watch]], [[audit-agents]], [[fix-refs]]
- **See also**: [[R017]]

## Sources

- `.claude/skills/update-docs/SKILL.md` — skill definition

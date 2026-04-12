---
title: Claude Native
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/claude-native/SKILL.md
related:
  - [[mgr-claude-code-bible]]
  - [[update-external]]
---

# Claude Native

Monitor Claude Code releases and automatically create issues for relevant changes.

## Overview

Monitors Claude Code GitHub releases, compares against current installed version, and automatically creates GitHub issues for breaking changes, new features, and deprecated APIs that affect oh-my-customcode agents or rules. Integrates with `mgr-claude-code-bible` to keep the spec reference current. Run periodically or triggered by release events.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:claude-native`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[update-external]], [[claude-code-bible]]
- **See also**: [[mgr-claude-code-bible]]

## Sources

- `.claude/skills/claude-native/SKILL.md` — skill definition

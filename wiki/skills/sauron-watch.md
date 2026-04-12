---
title: Sauron Watch
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/sauron-watch/SKILL.md
related:
  - [[mgr-sauron]]
  - [[audit-agents]]
  - [[fix-refs]]
  - [[R017]]
---

# Sauron Watch

Full R017 structural verification — the all-seeing eye for system integrity.

## Overview

Runs the complete R017 verification: Phase 1 (5 rounds of manager verification via mgr-supplier, mgr-updater, mgr-claude-code-bible), Phase 2 (3 rounds of deep review for workflow alignment, references, and philosophy compliance), and Phase 3 (fix all discovered issues). Must pass before any `git push`. Delegated to `mgr-sauron`. The name references the "all-seeing eye" metaphor for system integrity.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:sauron-watch`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-sauron]]
- **Related skills**: [[audit-agents]], [[fix-refs]], [[update-docs]]
- **See also**: [[R017]], [[R010]]

## Sources

- `.claude/skills/sauron-watch/SKILL.md` — skill definition

---
title: Omcustom Auto-Improve
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-auto-improve/SKILL.md
related:
  - [[omcustom-improve-report]]
  - [[sauron-watch]]
  - [[pr-auto-improve]]
---

# Omcustom Auto-Improve

Apply verified improvement suggestions from the improve-report to the codebase automatically.

## Overview

Reads improvement suggestions from the `omcustom-improve-report` output, applies verified improvements using worktree isolation, runs sauron verification after each batch of changes, and creates a PR with the results. Limited to max 20 improvement items per run (pipeline-guards). Skips items that fail sauron verification. Delegates all file writes to specialist agents per R010.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:auto-improve`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[omcustom-improve-report]], [[sauron-watch]], [[pr-auto-improve]]
- **See also**: [[R017]], [[R020]]

## Sources

- `.claude/skills/omcustom-auto-improve/SKILL.md` — skill definition

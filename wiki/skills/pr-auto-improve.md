---
title: PR Auto-Improve
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/pr-auto-improve/SKILL.md
related:
  - [[omcustom-auto-improve]]
  - [[pipeline-guards]]
  - [[deep-verify]]
---

# PR Auto-Improve

Opt-in post-PR analysis and improvement application based on review feedback.

## Overview

Monitors PR review comments (especially from omc_pr_analyzer bot), extracts actionable improvement items, and applies them to the branch. Limited to max 20 items per run (pipeline-guards). Runs sauron verification after applying changes. Creates a follow-up commit or PR with improvements. Opt-in — not automatic. Complements `omcustom-auto-improve` which operates on internal quality findings rather than PR feedback.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/pr-auto-improve`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[omcustom-auto-improve]], [[pipeline-guards]], [[deep-verify]]
- **See also**: [[R017]], [[mgr-gitnerd]]

## Sources

- `.claude/skills/pr-auto-improve/SKILL.md` — skill definition

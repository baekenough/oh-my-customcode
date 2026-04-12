---
title: Omcustom Feedback
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/omcustom-feedback/SKILL.md
related:
  - [[mgr-gitnerd]]
  - [[R016]]
---

# Omcustom Feedback

Submit user feedback as a GitHub Issue for tracking and improvement.

## Overview

Collects user feedback (bug reports, feature requests, improvement suggestions) and creates a formatted GitHub Issue with appropriate labels. Guides the user through providing structured feedback: title, description, reproduction steps (for bugs), and expected behavior. Delegates issue creation to `mgr-gitnerd` via `gh issue create`. Supports the R016 continuous improvement workflow.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom-feedback`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[R016]]
- **See also**: [[mgr-gitnerd]]

## Sources

- `.claude/skills/omcustom-feedback/SKILL.md` — skill definition

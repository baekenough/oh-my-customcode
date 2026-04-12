---
title: Post-Release Followup
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/post-release-followup/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[professor-triage]]
---

# Post-Release Followup

Analyze release workflow findings and recommend follow-up actions — execute immediately or register as issues.

## Overview

After PR creation in a release workflow, collects unaddressed findings from multiple sources (remaining open issues, deep-verify findings, triage deferred items, TODO markers in changed files, PR review feedback from omc_pr_analyzer). Deduplicates, categorizes by urgency, presents to user with action choices (execute now, register as issues, skip), then processes the choice. Interactive — requires user input.

## Key Details

- **Scope**: harness
- **User-invocable**: no
- **Effort**: medium

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[professor-triage]], [[omcustom-release-notes]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/post-release-followup/SKILL.md` — skill definition

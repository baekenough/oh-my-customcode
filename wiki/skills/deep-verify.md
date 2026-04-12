---
title: Deep Verify
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/deep-verify/SKILL.md
related:
  - [[release-plan]]
  - [[deep-plan]]
  - [[professor-triage]]
---

# Deep Verify

Multi-angle release quality verification before merge or deployment.

## Overview

Performs comprehensive multi-perspective verification of a release: code quality, test coverage, documentation accuracy, security posture, and release readiness. Spawns parallel reviewer agents across different quality dimensions. Findings are categorized by severity (CRITICAL/HIGH/MEDIUM/LOW) and output to `.claude/outputs/`. Used as the final gate before PR creation in release workflows.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/deep-verify`
- **Effort**: not specified

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[professor-triage]], [[post-release-followup]], [[multi-model-verification]]
- **See also**: [[R020]]

## Sources

- `.claude/skills/deep-verify/SKILL.md` — skill definition

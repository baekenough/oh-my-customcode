---
title: Adaptive Harness
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/adaptive-harness/SKILL.md
related:
  - [[analysis]]
  - [[r016]]
---

# Adaptive Harness

Auto-detect project context and optimize the oh-my-customcode harness — deactivate unused agents/skills, suggest missing experts, generate project profile.

## Overview

Scans project tech stack, maps detections to agents/skills, and generates a `.claude/project-profile.yaml`. Supports `--scan`, `--optimize`, `--learn`, `--export`, `--import`, and `--dry-run` modes.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Effort**: high
- **Command**: `/omcustom:adaptive-harness`

## Relationships

- **Integrates with**: [[analysis]], [[r016]]
- **Triggers**: SessionStart hook (adaptive-harness-scan.sh)
- **See also**: [[mgr-creator]], [[dynamic-creation]]

## Sources

- `.claude/skills/adaptive-harness/SKILL.md` — skill definition

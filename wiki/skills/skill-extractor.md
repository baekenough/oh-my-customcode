---
title: Skill Extractor
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/skill-extractor/SKILL.md
related:
  - [[mgr-creator]]
  - [[R016]]
---

# Skill Extractor

Analyze task trajectories to propose reusable SKILL.md candidates from successful patterns.

## Overview

Reads task outcome data (`/tmp/.claude-task-outcomes-$PPID`), groups by `(agent_type, skill)` pattern, and proposes new SKILL.md candidates for patterns with ≥3 successes and ≥80% success rate. Presents confidence-ranked proposals (low/medium/high) and delegates approved skill creation to `mgr-creator`. Never auto-creates without user approval. A Stop hook (`skill-extractor-analyzer.sh`) provides lightweight pre-analysis.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/skill-extractor`
- **Effort**: not specified
- **Argument hint**: `[--threshold <n>] [--dry-run]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[mgr-creator]], [[skills-sh-search]]
- **See also**: [[R016]], [[R006]]

## Sources

- `.claude/skills/skill-extractor/SKILL.md` — skill definition

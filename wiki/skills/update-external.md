---
title: Update External
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/update-external/SKILL.md
related:
  - [[mgr-updater]]
  - [[skills-sh-search]]
  - [[audit-agents]]
---

# Update External

Sync agents and skills sourced from external repositories with their latest versions.

## Overview

Checks all agents and skills with `source:` frontmatter fields against their origin (GitHub, npm, skills.sh) for available updates. Fetches changelogs, presents version diffs, and applies updates with user confirmation. Tracks source URLs and versions to enable `update-external` checks. Delegated to `mgr-updater`.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:update-external`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-updater]]
- **Related skills**: [[skills-sh-search]], [[audit-agents]], [[scout]]
- **See also**: [[R006]], [[mgr-updater]]

## Sources

- `.claude/skills/update-external/SKILL.md` — skill definition

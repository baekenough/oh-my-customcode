---
title: Skills.sh Search
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/skills-sh-search/SKILL.md
related:
  - [[skill-extractor]]
  - [[create-agent]]
  - [[update-external]]
---

# Skills.sh Search

Search and install skills from skills.sh marketplace when internal skills are insufficient.

## Overview

Searches [skills.sh](https://skills.sh/) (and optionally [agentskills.io](https://agentskills.io/)) for reusable agent skills via `npx --yes skills find "<query>"`. Presents results with install counts, checks for namespace conflicts, installs via `npx skills add`, and delegates SKILL.md frontmatter adaptation to `mgr-creator` for R006 compliance. `--install` flag required for installation; search is read-only by default.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/skills-sh-search`
- **Effort**: not specified
- **Argument hint**: `<query> [--install] [--global]`

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[skill-extractor]], [[create-agent]], [[update-external]]
- **See also**: [[mgr-creator]], [[R006]]

## Sources

- `.claude/skills/skills-sh-search/SKILL.md` — skill definition

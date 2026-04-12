---
title: Wiki
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/wiki/SKILL.md
related:
  - [[arch-documenter]]
  - [[update-docs]]
---

# Wiki

Generate and maintain a persistent wiki from agents, skills, rules, and guides.

## Overview

Generates and maintains the `wiki/` directory by reading agent definitions, skill SKILL.md files, rules, and guides, then producing structured markdown wiki pages. Each page follows a standard template with frontmatter, overview, key details, relationships, and sources sections. Supports incremental updates (only regenerate changed files) and cross-linking via wikilinks.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/wiki` (via skill invocation)
- **Effort**: not specified

## Relationships

- **Used by agents**: [[arch-documenter]], orchestrator
- **Related skills**: [[update-docs]], [[audit-agents]]
- **See also**: [[R006]]

## Sources

- `.claude/skills/wiki/SKILL.md` — skill definition

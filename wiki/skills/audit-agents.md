---
title: Audit Agents
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/audit-agents/SKILL.md
related:
  - [[mgr-supplier]]
  - [[fix-refs]]
  - [[sauron-watch]]
---

# Audit Agents

Audit agent dependencies and references for consistency and validity.

## Overview

Validates all agent definitions in `.claude/agents/` for frontmatter completeness, skill reference integrity, guide reference integrity, and routing table consistency. Used by `mgr-supplier` to catch broken references before commits. Reports missing skills, invalid model aliases, orphaned agents, and mismatched counts. Part of the R017 verification workflow.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:audit-agents`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-supplier]]
- **Related skills**: [[fix-refs]], [[sauron-watch]], [[update-docs]]
- **See also**: [[R017]], [[mgr-sauron]]

## Sources

- `.claude/skills/audit-agents/SKILL.md` — skill definition

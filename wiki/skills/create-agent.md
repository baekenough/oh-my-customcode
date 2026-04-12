---
title: Create Agent
type: skill
updated: 2026-04-12
sources:
  - .claude/skills/create-agent/SKILL.md
related:
  - [[mgr-creator]]
  - [[R006]]
  - [[R010]]
---

# Create Agent

Create a new agent definition with proper frontmatter and skill wiring.

## Overview

Guides the creation of a new agent file in `.claude/agents/`. Validates required frontmatter fields (name, description, model, tools), auto-discovers relevant skills and guides, writes the agent file via `mgr-creator`, and updates the routing table. Enforces R006 separation of concerns — agent body describes purpose and workflow, not detailed instructions. All file writes go through `mgr-creator` (R010 Protected Paths).

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:create-agent`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-creator]]
- **Related skills**: [[audit-agents]], [[update-docs]], [[sauron-watch]]
- **See also**: [[R006]], [[R010]], [[mgr-creator]]

## Sources

- `.claude/skills/create-agent/SKILL.md` — skill definition

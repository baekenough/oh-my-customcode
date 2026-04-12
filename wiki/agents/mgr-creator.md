---
title: mgr-creator
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-creator.md
related:
  - [[mgr-sauron]]
  - [[mgr-supplier]]
  - [[mgr-updater]]
  - [[arch-documenter]]
---

# mgr-creator

Agent creation specialist that follows R006 design guidelines, auto-researches authoritative references before creating agents, and supports dynamic agent creation as a routing fallback.

## Overview

`mgr-creator` is the **only** agent permitted to create files in `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, and `guides/*/` (new directories) per R010 Protected Paths. It operates in two modes:

- **Explicit mode** (`/omcustom:create-agent`): Follows a full research-driven 3-phase workflow (Research → Create → Auto-discover)
- **Dynamic mode** (routing fallback): When no existing agent matches a task, receives detected domain/keywords, auto-discovers relevant skills and guides, and creates a minimal viable agent immediately without user confirmation

The agent runs for up to 25 turns to allow thorough research and creation.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `create-agent`
- **Memory**: project
- **Effort**: high
- **Max Turns**: 25

## Creation Workflow

1. Research authoritative references (official docs, style guides)
2. Create `.claude/agents/{name}.md` with proper R006 frontmatter
3. Auto-discover and link relevant skills from `.claude/skills/`
4. Agent auto-discovered by routing; no registry update needed

## Relationships

- **Depends on**: `create-agent` skill, `.claude/skills/` and `guides/` for auto-discovery
- **Used by**: R010 (Protected Paths rule), routing skills (dynamic fallback), `/omcustom:create-agent` command
- **See also**: [[mgr-supplier]] (post-creation validation), [[mgr-sauron]] (structural integrity check), [[mgr-updater]] (external agent updates)

## Sources

- `.claude/agents/mgr-creator.md` — agent definition

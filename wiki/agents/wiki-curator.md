---
title: Wiki Curator
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/wiki-curator.md
related:
  - [[wiki]]
  - [[wiki-rag]]
  - [[r022]]
---

# Wiki Curator

Dedicated agent for wiki file operations — creates, updates, and maintains wiki/ markdown pages.

## Overview

All wiki/ directory writes go through this agent per R010 delegation rules. The orchestrator reads wiki pages freely but never writes them directly. wiki-curator handles page CRUD, index maintenance, cross-reference management, and lint fixes.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Memory**: project
- **Tools**: Read, Write, Edit, Glob, Grep, Bash

## Relationships

- **Used by**: [[wiki]], [[wiki-rag]]
- **Related rules**: [[r010]], [[r022]]
- **See also**: [[compilation-metaphor]]

## Sources

- `.claude/agents/wiki-curator.md` — agent definition

---
title: Wiki Curator
type: agent
updated: 2026-07-19
sources:
  - .claude/agents/wiki-curator.md
related:
  - [[wiki]]
  - [[wiki-rag]]
  - [[r022]]
  - [[r010]]
  - [[compilation-metaphor]]
---

# Wiki Curator

Dedicated agent for wiki file operations — creates, updates, and maintains wiki/ markdown pages.

## Overview

All wiki/ directory writes go through this agent per R010 delegation rules (Protected Paths excluded — wiki-curator is the standing specialist for the `wiki/` directory itself). The orchestrator reads wiki pages freely but never writes them directly. wiki-curator handles page CRUD, index.yaml/log.jsonl maintenance, cross-reference management ([[wikilink]] + standard markdown links), and lint fixes. It also generates synthesis pages (architecture, workflows, concepts) that summarize multiple sources rather than mirroring a single file.

## Workflow Patterns

| Pattern | Steps |
|---------|-------|
| Single Page Update | Read source → read existing page → diff → write with fresh `updated` date → propagate cross-refs |
| Batch Update (Category) | Glob category sources → compare mtimes vs page `updated` → write only changed/new → batch-update index.yaml |
| Lint Fix | Receive findings from orchestrator → remove orphans, repair broken refs, refresh stale pages → append to log.jsonl |

## Key Details

- **Model**: claude-sonnet-5 | **Domain**: universal | **Memory**: local (changed from `project` in v1.1.13, #1468)
- **Tools**: Read, Write, Edit, Glob, Grep, Bash
- **Effort**: medium
- **Quality bar**: valid frontmatter, 5-10 outbound cross-refs, 150-300 words (entity) / 200-400 (synthesis), purpose over enumeration
- **Limitations**: does not decide *what* to write (receives instructions from orchestrator/[[wiki]] skill), does not spawn subagents (leaf agent), never modifies source files — writes only to `wiki/`

## Relationships

- **Used by**: [[wiki]], [[wiki-rag]]
- **Related rules**: [[r010]] (delegation), [[r022]] (wiki sync)
- **See also**: [[compilation-metaphor]]

## Sources

- `.claude/agents/wiki-curator.md` — agent definition

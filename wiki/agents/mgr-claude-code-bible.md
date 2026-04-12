---
title: mgr-claude-code-bible
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-claude-code-bible.md
related:
  - [[mgr-sauron]]
  - [[mgr-creator]]
  - [[mgr-updater]]
---

# mgr-claude-code-bible

Authoritative source of truth for Claude Code specifications — fetches latest official docs from code.claude.com and validates agent/skill compliance against the official spec.

## Overview

`mgr-claude-code-bible` operates in two modes. In **Update mode**, it fetches and caches the latest Claude Code documentation (sub-agents.md, agent-teams.md, skills.md, hooks.md, plugins.md, settings.md, etc.) from `https://code.claude.com/docs/llms.txt`, skipping if updated within 24 hours. In **Verify mode**, it reads cached docs and scans all `.claude/agents/*.md` and `.claude/skills/*/SKILL.md` files, comparing frontmatter against official specs to generate ERROR/WARNING/INFO compliance reports.

This agent is invoked by [[mgr-sauron]] during Phase 1 verification (R017).

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Grep, Bash
- **Skills**: `claude-code-bible`
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20

## Verification Output

- **ERROR**: Missing required frontmatter fields
- **WARNING**: Missing recommended fields
- **INFO**: Non-standard or deprecated patterns

## Relationships

- **Depends on**: `claude-code-bible` skill, `~/.claude/references/claude-code/` cache
- **Used by**: [[mgr-sauron]] (Phase 1 official spec compliance check), R017 verification workflow
- **See also**: [[mgr-sauron]] (full system verification), [[mgr-creator]] (agent creation), [[mgr-updater]] (external sync)

## Sources

- `.claude/agents/mgr-claude-code-bible.md` — agent definition

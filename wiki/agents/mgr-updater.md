---
title: mgr-updater
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-updater.md
related:
  - [[mgr-creator]]
  - [[mgr-supplier]]
  - [[mgr-sauron]]
---

# mgr-updater

External source synchronization specialist for updating agents, skills, and guides from their upstream sources by checking versions and applying updates safely with backup/rollback.

## Overview

`mgr-updater` keeps externally-sourced components (agents/skills/guides with `source.type: external` in frontmatter) in sync with their upstream repositories. It scans for external sources, reads current version metadata, checks the upstream for newer versions, fetches and applies updates, and records the new version and timestamp. All updates are done with backup creation and rollback capability on failure.

Also handles documentation sync (`update-docs` skill) for the R017 verification workflow.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `update-external`, `update-docs`
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 20
- **Limitations**: cannot create new agents, cannot modify rules

## Relationships

- **Depends on**: `update-external` skill, `update-docs` skill, upstream source URLs in agent/skill frontmatter
- **Used by**: [[mgr-sauron]] (Phase 1 docs sync check), `/omcustom:update-external` command, `/omcustom:update-docs` command
- **See also**: [[mgr-creator]] (creates new external agents), [[mgr-supplier]] (post-update validation), [[mgr-sauron]] (verification pipeline)

## Sources

- `.claude/agents/mgr-updater.md` — agent definition

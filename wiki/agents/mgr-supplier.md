---
title: mgr-supplier
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/mgr-supplier.md
related:
  - [[mgr-creator]]
  - [[mgr-updater]]
  - [[mgr-sauron]]
---

# mgr-supplier

Dependency validation specialist for auditing agent skill/guide references, detecting missing or broken dependencies, and ensuring agents have all required resources properly linked.

## Overview

`mgr-supplier` validates the dependency graph of the agent ecosystem — scanning agent frontmatter for skill/guide references, checking that each referenced skill and guide exists on disk, detecting orphaned or broken links, and suggesting missing skills based on agent capabilities. It is intentionally lightweight (haiku model, read-only tools, low effort) to run quickly as part of the R017 verification pipeline.

Operates in three modes: Audit (scan and report), Supply (suggest missing skills), Fix (detect and recreate broken links).

## Key Details

- **Model**: haiku (fast, lightweight)
- **Domain**: universal
- **Tools**: Read, Grep, Glob (read-only, no Write/Edit/Bash)
- **Skills**: `audit-agents`
- **Memory**: local
- **Effort**: low
- **Max Turns**: 10
- **Limitations**: cannot modify agent files, cannot create new agents

## Relationships

- **Depends on**: `audit-agents` skill, filesystem (`.claude/agents/`, `.claude/skills/`, `guides/`)
- **Used by**: [[mgr-sauron]] (Phase 1 audit), [[mgr-creator]] (post-creation validation), [[mgr-updater]] (post-update re-validation)
- **See also**: [[mgr-creator]] (creates agents/skills), [[mgr-updater]] (updates external components), [[mgr-sauron]] (full verification)

## Sources

- `.claude/agents/mgr-supplier.md` — agent definition

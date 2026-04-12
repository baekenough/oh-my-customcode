---
title: sys-memory-keeper
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/sys-memory-keeper.md
related:
  - [[sys-naggy]]
  - [[mgr-sauron]]
---

# sys-memory-keeper

Session memory management specialist for saving/restoring context across compactions using native auto-memory (MEMORY.md), extracting behavioral patterns, maintaining user model, and aggregating agent performance metrics.

## Overview

`sys-memory-keeper` runs at session end to ensure context survives compaction. Its workflow: (1) collect session summary (tasks, decisions, open items), (2) extract user behavior patterns with confidence levels, (3) update native auto-memory MEMORY.md, (4) aggregate agent performance metrics, (5) update user model (skill preferences, correction patterns, expertise profile), and (6) return formatted summary to orchestrator for MCP persistence.

Important: MCP tools (claude-mem, episodic-memory) are orchestrator-scoped — `sys-memory-keeper` only handles MEMORY.md; the orchestrator handles MCP saves directly after receiving the summary.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Skills**: `memory-management`, `memory-save`, `memory-recall`
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 15
- **Limitations**: cannot modify source code, cannot execute tests

## Relationships

- **Depends on**: `memory-management` skill, `memory-save` skill, `memory-recall` skill, `.claude/agent-memory/sys-memory-keeper/MEMORY.md`
- **Used by**: Orchestrator (session-end signal), R011 session-end workflow, `/memory-save` and `/memory-recall` commands
- **See also**: [[sys-naggy]] (task tracking), R011 (memory integration rules)

## Sources

- `.claude/agents/sys-memory-keeper.md` — agent definition

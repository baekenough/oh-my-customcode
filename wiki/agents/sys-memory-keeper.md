---
title: sys-memory-keeper
type: agent
updated: 2026-05-29
sources:
  - .claude/agents/sys-memory-keeper.md
related:
  - [[sys-naggy]]
  - [[mgr-sauron]]
---

# sys-memory-keeper

Session memory management specialist for saving/restoring context across compactions using native auto-memory (MEMORY.md), extracting behavioral patterns, maintaining the user model, and aggregating agent performance metrics.

## Overview

`sys-memory-keeper` runs at session end to ensure context survives compaction. Its workflow: (1) collect session summary (tasks, decisions, open items), (2) extract user behavior patterns with confidence levels, (3) update native auto-memory MEMORY.md, (4) aggregate agent performance metrics, (5) update the user model (skill preferences, correction patterns, expertise profile), and (6) return a formatted summary to the orchestrator.

Native auto-memory (MEMORY.md) is the single persistence backend. The claude-mem and agentmemory MCP servers were permanently removed (#1253), so there is no MCP save step — `sys-memory-keeper` handles all persistence through MEMORY.md.

## Key Details

- **Model**: sonnet
- **Domain**: universal
- **Tools**: Read, Write, Edit, Grep, Glob, Bash
- **Memory**: project
- **Effort**: medium
- **Max Turns**: 15
- **Limitations**: cannot modify source code, cannot execute tests

## Relationships

- **Depends on**: `.claude/agent-memory/sys-memory-keeper/MEMORY.md` (native auto-memory)
- **Used by**: Orchestrator (session-end signal), R011 session-end workflow
- **See also**: [[sys-naggy]] (task tracking), R011 (memory integration rules)

## Sources

- `.claude/agents/sys-memory-keeper.md` — agent definition

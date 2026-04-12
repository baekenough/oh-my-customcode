---
title: Memory Workflow
type: workflow
updated: 2026-04-12
sources:
  - .claude/rules/SHOULD-memory-integration.md
  - CLAUDE.md
related:
  - [[wiki/rules/r011]]
  - [[wiki/agents/sys-memory-keeper]]
  - [[ecomode-and-context]]
  - [[orchestration]]
---

# Memory Workflow

Memory in oh-my-customcode operates on two levels: native auto-memory (MEMORY.md files per agent) for persistent behavioral patterns, and claude-mem MCP for cross-session searchable storage. Session-end auto-save is triggered by user signals and coordinated between `sys-memory-keeper` and the orchestrator.

## Overview

The rule is simple: **use native auto-memory first, claude-mem only when cross-session search is needed**. Native auto-memory is zero-dependency and always available; claude-mem requires the MCP server to be running.

## Native Auto-Memory

Agents opt into persistent memory via the `memory` frontmatter field:

| Scope | Location | Git Tracked | Use Case |
|-------|----------|-------------|---------|
| `user` | `~/.claude/agent-memory/<name>/` | No | Personal preferences, user model |
| `project` | `.claude/agent-memory/<name>/` | Yes | Project patterns, team knowledge |
| `local` | `.claude/agent-memory-local/<name>/` | No | Local experiments, sensitive data |

When enabled, the system loads the first 200 lines of `MEMORY.md` into the agent's system prompt at session start. Read/Write/Edit tools are auto-enabled for the memory directory.

Best practices:
- Keep MEMORY.md under 200 lines (only first 200 loaded)
- Do not store sensitive data
- Do not duplicate CLAUDE.md content
- Consult memory before starting work; update after discovering new patterns

## claude-mem MCP (Supplementary)

Use claude-mem when:
- Searching across sessions (temporal queries: "what did we decide last week?")
- Cross-agent knowledge sharing
- Episodic retrieval of past decisions

Install: `npm install -g claude-mem && claude-mem setup`. The MCP tool is `mcp__plugin_claude-mem_mcp-search__save_memory`.

Note: MCP tools are **orchestrator-scoped** — subagents cannot access them. Only the orchestrator can save to claude-mem.

## Session-End Auto-Save Workflow

Triggered by user signals: "끝", "종료", "마무리", "done", "wrap up", "end session".

### Responsibility Split

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
      sys-memory-keeper:
        1. Collect session summary (tasks, decisions, open items)
        2. Extract behavioral patterns with confidence levels
        3. Update MEMORY.md (native auto-memory)
        4. Aggregate agent performance metrics
        5. Return formatted summary to orchestrator

  → Orchestrator directly:
        1. claude-mem save (if MCP available)
        [episodic-memory auto-indexes — no action needed]

  → Orchestrator confirms to user
```

### Why Split?

`sys-memory-keeper` has Write access to `.claude/agent-memory*/`. The orchestrator has access to MCP tools. Neither can do the other's job.

## Session-End Self-Check

Before confirming session end to the user:

1. Did `sys-memory-keeper` update MEMORY.md? → YES required
2. Did the orchestrator attempt claude-mem save? → YES required (failure is OK, skipping is not)
3. Episodic-memory: no action needed (auto-indexed)

## Failure Policy

Memory saves are **non-blocking**. A claude-mem failure must not prevent session end. `sys-memory-keeper` failure is more critical (MEMORY.md is the primary persistence layer) but should still be logged and reported without blocking the user.

## Memory vs Context Pruning

Two distinct concepts:

| Concept | Rule | Scope | Mechanism |
|---------|------|-------|-----------|
| Memory (behavioral) | R011 | Cross-session | MEMORY.md files |
| Context pruning | R013 | Within-session | Drop/summarize retrieved chunks |

Context pruning (ecomode) manages the input token budget during a task. Memory manages behavioral knowledge across sessions. See [[ecomode-and-context]] for context pruning details.

## Relationships

- **Depends on**: [[wiki/agents/sys-memory-keeper]] (MEMORY.md writes), [[wiki/rules/r011]]
- **Used by**: Session end, `/memory-save`, `/memory-recall` commands
- **See also**: [[ecomode-and-context]], [[wiki/rules/r013]]

## Sources

- `.claude/rules/SHOULD-memory-integration.md` — R011 full architecture and session-end self-check
- `CLAUDE.md` — memory command descriptions, MCP server recommendations

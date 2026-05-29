---
title: Memory Workflow
type: workflow
updated: 2026-05-29
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

Memory in oh-my-customcode is built entirely on **native auto-memory** — per-agent `MEMORY.md` files that persist behavioral patterns and project knowledge across sessions. There are no external memory backends: the claude-mem and agentmemory MCP servers were permanently removed (#1253). Session-end auto-save is triggered by user signals and handled by `sys-memory-keeper`.

## Overview

The rule is simple: **native auto-memory is the single persistence mechanism**. It is zero-dependency and always available — the system loads the first 200 lines of an agent's `MEMORY.md` into its system prompt at session start.

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

## Session-End Auto-Save Workflow

Triggered by user signals: "끝", "종료", "마무리", "done", "wrap up", "end session".

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
      sys-memory-keeper:
        1. Collect session summary (tasks, decisions, open items)
        2. Extract behavioral patterns with confidence levels
        3. Update MEMORY.md (native auto-memory)
        4. Aggregate agent performance metrics
        5. Update user model (skill preferences, corrections, expertise)
        6. Return formatted summary to orchestrator

  → Orchestrator confirms to user
```

`sys-memory-keeper` has Write access to `.claude/agent-memory*/` and owns all native MEMORY.md writes. No MCP save step is involved — native auto-memory is the only backend.

## Mid-Session Immediate Save

Save memory IMMEDIATELY upon a surprising discovery — do not defer to session end. Triggers: a pattern observed a second time, unexpected tool behavior or a workaround, a subagent false-positive, or a user correction. Immediate saves preserve the exact trigger context that makes the memory actionable.

## Session-End Self-Check

Before confirming session end to the user:

1. Did `sys-memory-keeper` update MEMORY.md? → YES required
2. If `omcustom-feedback` is active and notable friction was observed → the model MAY draft a retrospective feedback issue (Phase 4A gate, user approves)

## Failure Policy

Memory saves are **non-blocking**. A `sys-memory-keeper` failure (MEMORY.md is the primary persistence layer) should be logged and reported without blocking the user.

## Memory vs Context Pruning

Two distinct concepts:

| Concept | Rule | Scope | Mechanism |
|---------|------|-------|-----------|
| Memory (behavioral) | R011 | Cross-session | MEMORY.md files |
| Context pruning | R013 | Within-session | Drop/summarize retrieved chunks |

Context pruning (ecomode) manages the input token budget during a task. Memory manages behavioral knowledge across sessions. See [[ecomode-and-context]] for context pruning details.

## Relationships

- **Depends on**: [[wiki/agents/sys-memory-keeper]] (MEMORY.md writes), [[wiki/rules/r011]]
- **Used by**: Session end auto-save workflow
- **See also**: [[ecomode-and-context]], [[wiki/rules/r013]]

## Sources

- `.claude/rules/SHOULD-memory-integration.md` — R011 full architecture and session-end self-check
- `CLAUDE.md` — native auto-memory architecture

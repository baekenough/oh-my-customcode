# [SHOULD] Memory Integration Rules

> **Priority**: SHOULD | **ID**: R011

## Architecture

**Primary**: Native auto memory (`memory` field in agent frontmatter). No external dependencies.
**Supplementary**: claude-mem MCP (optional, for cross-session search and temporal queries).

Rule: If native auto memory can handle it, do NOT use claude-mem.

## Native Auto Memory

Agent frontmatter `memory: project|user|local` enables persistent memory:
- System creates memory directory, loads first 200 lines of MEMORY.md into prompt
- Read/Write/Edit tools auto-enabled for memory directory

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

## When to Use claude-mem

| Scenario | Native | claude-mem |
|----------|--------|------------|
| Agent learns project patterns | Yes | |
| Search across sessions | | Yes |
| Temporal queries | | Yes |
| Cross-agent sharing | | Yes |

## Best Practices

- Consult memory before starting work
- Update after discovering patterns
- Keep MEMORY.md under 200 lines
- Do not store sensitive data or duplicate CLAUDE.md content
- Memory write failures should not block main task

## Session-End Auto-Save

### Trigger

Session-end detected when user says: "끝", "종료", "마무리", "done", "wrap up", "end session", or explicitly requests session save.

### Flow

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
    → sys-memory-keeper performs dual-system save:
       1. claude-mem save (if available)
       2. episodic-memory verification (if available)
    → Reports result to orchestrator
  → Orchestrator confirms to user
```

### Dual-System Save

| System | Tool | Action | Required |
|--------|------|--------|----------|
| claude-mem | `mcp__plugin_claude-mem_mcp-search__save_memory` | Save session summary with project, tasks, decisions | No (best-effort) |
| episodic-memory | `mcp__plugin_episodic-memory_episodic-memory__search` | Verify session is indexed for future retrieval | No (best-effort) |

### Failure Policy

- Both saves are **non-blocking**: memory failure MUST NOT prevent session from ending
- If claude-mem unavailable: skip, log warning
- If episodic-memory unavailable: skip, log warning
- If both unavailable: warn user, proceed with session end

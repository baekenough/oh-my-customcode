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

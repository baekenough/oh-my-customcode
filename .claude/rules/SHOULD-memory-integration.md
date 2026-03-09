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

## Confidence-Tracked Memory

Memory entries in MEMORY.md should include confidence annotations to distinguish verified facts from hypotheses.

### Confidence Levels

| Level | Tag | Meaning | Example |
|-------|-----|---------|---------|
| High | `[confidence: high]` | Verified across multiple sessions or confirmed by user | Architecture decisions, confirmed patterns |
| Medium | `[confidence: medium]` | Observed pattern, not yet fully verified | Code conventions seen in 2-3 files |
| Low | `[confidence: low]` | Single observation or hypothesis | First-time discovery, untested assumption |

### Format in MEMORY.md

```
### Key Patterns [confidence: high]
- `.claude/` files are gitignored → always use `git add -f`
- pre-commit hooks auto-detect README/manifest count mismatches

### Hypotheses [confidence: medium]
- Template sync might need CI enforcement (seen in 2 PRs)

### Unverified [confidence: low]
- Possible race condition in parallel hook execution (observed once)
```

### Confidence Lifecycle

```
[low] → observed again → [medium] → confirmed by user/testing → [high]
[any] → contradicted by evidence → demoted or removed
```

### Rules

| Rule | Detail |
|------|--------|
| New discoveries | Start at `[confidence: low]` unless user explicitly confirms |
| Cross-session verification | Promote to `[confidence: medium]` when seen in 2+ sessions |
| User confirmation | Promote to `[confidence: high]` when user confirms or tests pass |
| Contradiction | Demote or remove when contradicted by new evidence |
| Default | Entries without tags are treated as `[confidence: high]` (backward compatibility) |

### Integration with Session-End

When sys-memory-keeper updates MEMORY.md at session end:
1. New findings from this session → `[confidence: low]`
2. Findings that match existing entries → promote confidence
3. Findings that contradict existing entries → flag for review

## Session-End Auto-Save

### Trigger

Session-end detected when user says: "끝", "종료", "마무리", "done", "wrap up", "end session", or explicitly requests session save.

### Flow

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
    → sys-memory-keeper performs:
       1. Collect session summary (tasks, decisions, open items)
       2. Update native auto-memory (MEMORY.md)
       3. Return formatted summary to orchestrator
  → Orchestrator performs MCP saves directly:
       1. claude-mem save (if available via ToolSearch)
       2. episodic-memory verification (if available via ToolSearch)
  → Orchestrator confirms to user
```

### Responsibility Split

MCP tools (claude-mem, episodic-memory) are **orchestrator-scoped** and not inherited by subagents. Therefore:

| Responsibility | Owner | Reason |
|----------------|-------|--------|
| Session summary collection | sys-memory-keeper | Domain expertise in memory formatting |
| Native auto-memory (MEMORY.md) | sys-memory-keeper | Has Write access to memory directory |
| claude-mem MCP save | Orchestrator | MCP tools only available at orchestrator level |
| episodic-memory MCP verification | Orchestrator | MCP tools only available at orchestrator level |

### Dual-System Save

| System | Owner | Tool | Action | Required |
|--------|-------|------|--------|----------|
| Native auto-memory | sys-memory-keeper | Write | Update MEMORY.md with session learnings | Yes |
| claude-mem | Orchestrator | `mcp__plugin_claude-mem_mcp-search__save_memory` | Save session summary with project, tasks, decisions | No (best-effort) |
| episodic-memory | Orchestrator | `mcp__plugin_episodic-memory_episodic-memory__search` | Verify session is indexed for future retrieval | No (best-effort) |

### Session-End Self-Check (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE CONFIRMING SESSION-END TO USER:                          ║
║                                                                   ║
║  1. Did sys-memory-keeper update MEMORY.md?                      ║
║     YES → Continue                                               ║
║     NO  → Delegate to sys-memory-keeper first                    ║
║                                                                   ║
║  2. Did I attempt claude-mem save?                               ║
║     YES → Continue (even if it failed)                           ║
║     NO  → ToolSearch + save now                                  ║
║                                                                   ║
║  3. Did I attempt episodic-memory verification?                  ║
║     YES → Continue (even if it failed)                           ║
║     NO  → ToolSearch + verify now  ← THIS IS THE COMMONLY       ║
║           SKIPPED STEP. DO NOT SKIP IT.                          ║
║                                                                   ║
║  ALL THREE must be attempted before confirming to user.          ║
║  "Attempted" means called the tool — failure is OK, skipping     ║
║  is NOT.                                                          ║
╚══════════════════════════════════════════════════════════════════╝
```

### Failure Policy

- MCP saves are **non-blocking**: memory failure MUST NOT prevent session from ending
- If claude-mem unavailable: skip, log warning
- If episodic-memory unavailable: skip, log warning
- If both unavailable: warn user, proceed with session end

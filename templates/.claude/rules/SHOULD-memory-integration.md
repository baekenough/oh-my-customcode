# [SHOULD] Memory Integration Rules

> **Priority**: SHOULD - Recommended for context persistence
> **ID**: R011

## Purpose

Provide persistent memory for agents using Claude Code's native auto memory system.

## Architecture: Native First

```
Primary: Native Auto Memory (memory field in agent frontmatter)
  - Agent-specific persistent knowledge
  - Automatic system prompt injection (MEMORY.md)
  - No external dependencies

Supplementary: claude-mem MCP (optional)
  - Session-level temporal observations
  - Cross-agent semantic search
  - Only if installed and configured

RULE: If native auto memory can handle the task,
      DO NOT use claude-mem.
```

## Native Auto Memory

### How It Works

1. Agent frontmatter includes `memory` field:
   ```yaml
   memory: project  # or user, local
   ```

2. System automatically:
   - Creates memory directory for the agent
   - Loads first 200 lines of MEMORY.md into system prompt
   - Enables Read/Write/Edit tools for memory directory
   - Agent learns and records patterns across conversations

### Memory Scopes

| Scope | Location | Use Case | Git Tracked |
|-------|----------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | Cross-project patterns | No |
| `project` | `.claude/agent-memory/<name>/` | Project-specific patterns | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | Local-only knowledge | No |

### Current Agent Memory Map

| Scope | Agents | Count |
|-------|--------|-------|
| `project` | lang-*, be-*, fe-*, arch-*, tool-*, qa-*, mgr-creator, mgr-updater, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible, sys-memory-keeper | 28 |
| `user` | infra-docker-expert, infra-aws-expert, db-supabase-expert | 3 |
| `local` | mgr-supplier, mgr-sync-checker, sys-naggy | 3 |

### Memory Best Practices

```yaml
do:
  - Let agents consult memory before starting work
  - Update memory after discovering patterns or conventions
  - Keep MEMORY.md under 200 lines (auto-curate if exceeded)
  - Use separate topic files for detailed notes

dont:
  - Store sensitive data (API keys, credentials)
  - Duplicate information already in CLAUDE.md
  - Use memory for temporary session state
```

## Claude-mem (Optional Supplement)

claude-mem MCP provides session-level observations and semantic search.
It is NOT required for basic memory functionality.

### When to Use claude-mem

| Scenario | Use Native Memory | Use claude-mem |
|----------|------------------|---------------|
| Agent learns project patterns | Yes | |
| Record debugging insights | Yes | |
| Search across multiple sessions | | Yes |
| Temporal queries (date-based) | | Yes |
| Cross-agent knowledge sharing | | Yes |
| Basic context persistence | Yes | |

### claude-mem Integration (if installed)

```yaml
provider: claude-mem
collection: claude_memories
project_tag: my-project
status: optional
```

## Context Compaction

### Compaction Controls

```yaml
# Targeted compaction - preserve specific context
/compact focus on {topic}

# Examples
/compact focus on agent routing decisions
/compact focus on authentication implementation
/compact focus on test failures and fixes
```

### Best Practices

```
do:
  - Use /compact focus when nearing context limits
  - Focus on the most relevant topic for current work
  - Let auto-compaction handle routine cleanup

dont:
  - Manually compact when not near limits
  - Lose important decision context by unfocused compaction
```

## Error Handling

```yaml
on_memory_write_failure:
  - Log error
  - Continue without blocking main task
  - Memory is enhancement, not requirement
```

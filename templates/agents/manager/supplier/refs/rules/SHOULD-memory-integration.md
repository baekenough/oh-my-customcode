# [SHOULD] Memory Integration Rules

> **Priority**: SHOULD - Recommended for context persistence
> **ID**: R011

## Purpose

Integrate claude-mem for session context persistence across compaction.

## Requirements

### 1. Save Before Compaction
```yaml
trigger: PreCompact hook
action:
  - Collect session context (tasks, decisions, key info)
  - Format with project tag "baekgom-agents"
  - Store in claude-mem with metadata
```

### 2. Restore on Session Start
```yaml
trigger: SessionStart hook
action:
  - Build semantic query with project prefix
  - Search claude-mem for relevant context
  - Load and present context to agent
```

### 3. Project Isolation
```yaml
rule: Always include project name in queries
reason: Prevent cross-contamination between projects
```

## Storage Format

```yaml
project: baekgom-agents
session: {date}-{uuid}
tags: [session, task, decision]
content:
  summary: Brief description of session context
  tasks_completed: List of completed tasks
  decisions: Key decisions made
  open_items: Unfinished work
```

## Query Pattern

Always include project name in queries:
- `"baekgom-agents session authentication"`
- `"baekgom-agents 2025-01-24 bug fix"`
- `"baekgom-agents agent creation workflow"`

### Effective Queries
```yaml
good:
  - "baekgom-agents implementing oauth" (semantic, project-scoped)
  - "baekgom-agents 2025-01-24 memory system" (temporal)
  - "baekgom-agents decision agent architecture" (topic-based)

bad:
  - "implementing oauth" (missing project scope)
  - "session context" (too generic)
```

## Commands

| Command | Description |
|---------|-------------|
| `memory:save` | Save current context to claude-mem |
| `memory:recall` | Search and recall relevant memories |

## Integration with Agents

### memory-keeper Agent
```
Responsible for:
- Executing save/recall operations
- Managing session metadata
- Handling PreCompact and SessionStart hooks
```

### Other Agents
```
When to trigger memory:save:
- Before complex task completion
- When making significant decisions
- Before expected context compaction
```

## Storage Provider

```yaml
provider: claude-mem
collection: claude_memories
project_tag: baekgom-agents
archive_path: ~/.claude-mem/archives/
```

## Error Handling

```yaml
on_save_failure:
  - Log error
  - Continue without blocking main task
  - Notify user of memory save failure

on_recall_failure:
  - Log error
  - Continue with available context
  - Notify user that memory recall failed
```

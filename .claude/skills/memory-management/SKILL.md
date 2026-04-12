---
name: memory-management
description: Memory persistence operations using claude-mem
scope: core
user-invocable: false
---

## Purpose

Provide memory persistence operations using claude-mem for session context survival across compactions.

## Operations

### 1. Save Context

```yaml
operation: save
description: Store session context in claude-mem
steps:
  1. Collect session data:
     - Tasks completed
     - Decisions made
     - Open items
     - Key code changes
  2. Format document:
     - Add project tag: "my-project"
     - Add session ID: {date}-{uuid}
     - Add relevant tags
  3. Store in claude-mem:
     - Use chroma_add_documents
     - Include metadata
```

### 2. Recall Context

```yaml
operation: recall
description: Search and retrieve relevant memories
steps:
  1. Build query:
     - Always prefix with "my-project"
     - Add user-provided search terms
     - Include date for temporal searches
  2. Search claude-mem:
     - Use chroma_query_documents
     - Request top N results
  3. Format results:
     - Sort by relevance
     - Present summary
     - Provide access to full content
```

### 3. Get Specific Memory

```yaml
operation: get
description: Retrieve specific memory by ID
steps:
  1. Use chroma_get_documents with ID
  2. Return full document content
```

## Query Patterns

### Semantic Search (Primary)

```python
# Always include project name
chroma_query_documents(["my-project {search_terms}"])

# Examples:
chroma_query_documents(["my-project authentication flow"])
chroma_query_documents(["my-project 2025-01-24 memory system"])
```

### Get by ID

```python
# When you have a specific document ID
chroma_get_documents(ids=["document_id"])
```

## Document Format

### Save Format

```yaml
content: |
  ## Session Summary
  Date: {date}
  Session: {session_id}

  ### Tasks Completed
  - Task 1: Description
  - Task 2: Description

  ### Decisions Made
  - Decision 1: Rationale
  - Decision 2: Rationale

  ### Open Items
  - Item 1: Status
  - Item 2: Status

  ### Notes
  Additional context...

metadata:
  project: my-project
  session: {date}-{uuid}
  tags: [session, task, decision, ...]
  created_at: {timestamp}
```

### Recall Response Format

```yaml
results:
  - id: doc_1
    score: 0.95
    summary: "Authentication flow implementation"
    date: 2025-01-20
    tags: [authentication, oauth]
  - id: doc_2
    score: 0.87
    summary: "JWT token decision"
    date: 2025-01-18
    tags: [authentication, decision]
```

## Best Practices

### Query Tips

```yaml
do:
  - Always include "my-project" prefix
  - Use semantic, intent-based queries
  - Include dates for temporal searches
  - Use multiple queries for better coverage

dont:
  - Use complex where filters ($and, $or)
  - Omit project name
  - Use overly generic terms
  - Expect exact string matching
```

### Save Tips

```yaml
do:
  - Include meaningful tags
  - Write clear summaries
  - Capture decisions with rationale
  - Note open items for future reference

dont:
  - Save trivial conversations
  - Include sensitive data (API keys, etc.)
  - Create duplicate entries
```

## Integration

### With sys-memory-keeper Agent

```
sys-memory-keeper agent uses this skill for:
- sys-memory-keeper:save command
- sys-memory-keeper:recall command
- PreCompact hook
- SessionStart hook
```

### With Other Agents

```
Other agents can trigger memory operations via:
- Direct sys-memory-keeper:save/recall commands
- Delegating to sys-memory-keeper
```

## Error Handling

```yaml
save_errors:
  - Connection failure: Retry 3 times, then log and continue
  - Invalid format: Validate before save, report issues
  - Storage full: Archive old memories, then retry

recall_errors:
  - No results: Suggest alternative queries
  - Connection failure: Return empty with warning
  - Invalid query: Help user reformulate
```

## MemKraft Bridge (Optional)

> External integration: [MemKraft](https://github.com/seojoonkim/memkraft) — zero-dependency compound memory for AI agents.
> Install: `pipx install memkraft`

### When to Use

| Capability | claude-mem | MemKraft |
|-----------|-----------|----------|
| Session persistence | ✅ (Chroma) | ✅ (Markdown) |
| Entity tracking | ❌ | ✅ (person/org/concept) |
| Source attribution | ❌ | ✅ (`[Source: who, when, how]`) |
| Auto-maintenance | ❌ | ✅ (Dream Cycle) |
| CJK entity extraction | ❌ | ✅ (Korean/Chinese/Japanese) |
| Offline search | ❌ | ✅ (stdlib difflib) |

Use MemKraft when entity tracking or source attribution is needed. Use claude-mem for simple session persistence.

### Commands

```bash
# Extract entities from a document
memkraft extract <file>

# Get a brief on a topic
memkraft brief <topic>

# Run maintenance cycle (dedup, prune orphans)
memkraft dream
```

### Integration with sys-memory-keeper

At session end, sys-memory-keeper can optionally run MemKraft operations:

1. `memkraft extract` on session summary → builds entity graph
2. `memkraft dream` → prunes stale entries (run weekly, not every session)

### Prerequisites

- Python 3.9+
- `pipx install memkraft`
- No API keys required (offline-only)

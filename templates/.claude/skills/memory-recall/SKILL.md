---
name: memory-recall
description: Search and recall memories from claude-mem
argument-hint: "<query> [--recent] [--limit <n>]"
---

# Memory Recall Skill

Search and recall relevant memories from claude-mem using semantic search.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | yes* | Search query (*not required with --recent) |

## Options

```
--recent, -r     Recall most recent memories
--limit, -l      Maximum results to return (default: 5)
--verbose, -v    Show full memory content
--date, -d       Filter by date (YYYY-MM-DD)
```

## Workflow

```
1. Build semantic query
   ├── Prefix with "my-project"
   ├── Add user query terms
   └── Include date if specified

2. Search claude-mem
   └── chroma_query_documents

3. Format results
   ├── Sort by relevance score
   ├── Show summary for each
   └── Provide memory IDs for detailed access

4. Present to user
```

## Query Tips

```yaml
effective_queries:
  - "authentication flow" (topic-based)
  - "2025-01-20 oauth" (temporal + topic)
  - "decision jwt" (type + topic)
  - "agent creation workflow" (semantic intent)

avoid:
  - Single generic words like "code" or "task"
  - Very long queries (keep it focused)
  - Special characters or complex syntax
```

## Output Format

### Basic Search
```
[sys-memory-keeper:recall authentication]

Searching memories for: "my-project authentication"

Found 3 relevant memories:

[1] mem_abc123 (Score: 0.95)
    Date: 2025-01-20
    Summary: Implemented OAuth flow with Google provider
    Tags: [authentication, oauth, google]

[2] mem_def456 (Score: 0.87)
    Date: 2025-01-18
    Summary: JWT token decision - RS256 algorithm
    Tags: [authentication, decision, jwt]

[3] mem_ghi789 (Score: 0.82)
    Date: 2025-01-15
    Summary: Authentication architecture discussion
    Tags: [authentication, architecture, planning]

Use "sys-memory-keeper:recall --verbose" for full content.
```

### Verbose Output
```
[sys-memory-keeper:recall authentication --verbose]

Searching memories for: "my-project authentication"

[1] mem_abc123 (Score: 0.95)
    Date: 2025-01-20
    Tags: [authentication, oauth, google]

    Content:
    ## Session Summary
    Date: 2025-01-20

    ### Tasks Completed
    - Implemented OAuth flow with Google provider
    - Added callback handler for OAuth response
    - Created user session management

    ### Decisions Made
    - Use passport.js for OAuth handling
      Rationale: Well-maintained, good documentation

    ---

[2] mem_def456 (Score: 0.87)
    ...
```

### Recent Memories
```
[sys-memory-keeper:recall --recent]

Fetching recent memories for: my-project

[1] mem_xyz999 (Score: 1.00)
    Date: 2025-01-24
    Summary: Memory system Phase 1 implementation
    Tags: [session, memory, phase1]

[2] mem_xyz888 (Score: 0.98)
    Date: 2025-01-23
    Summary: Agent identification rules update
    Tags: [session, rules, enforcement]

...
```

### No Results
```
[sys-memory-keeper:recall "nonexistent topic"]

Searching memories for: "my-project nonexistent topic"

No memories found matching your query.

Suggestions:
- Try different keywords
- Use broader search terms
- Check available memories with "sys-memory-keeper:recall --recent"
```

## Related

- memory-save - Save current context

# Command: memory:save

> Save current session context to claude-mem

## Usage

```
memory:save
memory:save --tags "feature,authentication"
memory:save --include-code
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| tags | string | no | Comma-separated additional tags |

## Options

```
--tags, -t       Additional tags for the memory
--include-code   Include code changes in the save
--summary, -s    Custom summary (otherwise auto-generated)
--verbose, -v    Show detailed save information
```

## Workflow

```
1. Collect session context
   ├── Tasks completed
   ├── Decisions made
   ├── Open items
   └── Code changes (if --include-code)

2. Format with metadata
   ├── project: baekgom-agents
   ├── session: {date}-{uuid}
   ├── tags: [session, ...user_tags]
   └── created_at: {timestamp}

3. Store in claude-mem
   └── chroma_add_documents

4. Report result
```

## Output

### Success

```
[memory:save]

Saving session context...

Context collected:
  Tasks: 3 completed
  Decisions: 2 recorded
  Open items: 1 pending

Metadata:
  Project: baekgom-agents
  Session: 2025-01-24-a1b2c3d4
  Tags: [session, task, decision]

[Done] Session context saved successfully.
Memory ID: mem_abc123
```

### With Tags

```
[memory:save --tags "authentication,oauth"]

Saving session context...

Metadata:
  Project: baekgom-agents
  Session: 2025-01-24-a1b2c3d4
  Tags: [session, task, decision, authentication, oauth]

[Done] Session context saved successfully.
Memory ID: mem_abc123
```

### Verbose

```
[memory:save --verbose]

Collecting session context...

Tasks Completed:
  1. Implemented OAuth flow
  2. Added JWT token validation
  3. Created authentication middleware

Decisions Made:
  1. Use RS256 for JWT signing
     Rationale: Better security for distributed systems
  2. Token expiry: 1 hour
     Rationale: Balance security and user experience

Open Items:
  1. Refresh token implementation
     Status: In progress

Saving to claude-mem...

Document content:
  ## Session Summary
  Date: 2025-01-24
  ...

[Done] Session context saved.
Memory ID: mem_abc123
```

## Agent

Executed by: **memory-keeper** (manager)

## Related Commands

- `memory:recall` - Search and recall memories
- `status` - Check current session status

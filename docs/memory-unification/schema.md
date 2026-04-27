# Memory Unification Schema

> Epic: [#1047](https://github.com/baekenough/oh-my-customcode/issues/1047) — Local Memory Integration + Skill Context Budget  
> Related: [#1066](https://github.com/baekenough/oh-my-customcode/issues/1066) (skill budget), [#1067](https://github.com/baekenough/oh-my-customcode/issues/1067) (sensitivity), [#1065](https://github.com/baekenough/oh-my-customcode/issues/1065) (this schema)

---

## Overview

`MemoryRecord` is the normalized unit of memory across all four sources in oh-my-customcode:

| Source | Storage | Access mechanism |
|---|---|---|
| `native` | `.claude/agent-memory/<name>/MEMORY.md` | File read via R011 auto-inject |
| `claude-mem` | Chroma vector DB (MCP) | `mcp__plugin_claude-mem_mcp-search__*` |
| `episodic-memory` | Auto-indexed conversation log | Auto (no manual action) |
| `llm-memory` | In-context, session-scoped | Prompt injection |

Adapter implementations are tracked in sub-issues #3–#6 of #1047.

---

## Schema Definition

```typescript
interface MemoryRecord {
  /**
   * Stable unique identifier.
   * native:         SHA-256 of (source + device_id + project + timestamp)
   * claude-mem:     MCP-assigned UUID
   * episodic-memory: conversation-session-id + chunk index
   * llm-memory:     ephemeral UUID, valid only within the session
   */
  id: string;

  /** Memory source system. */
  source: 'native' | 'claude-mem' | 'episodic-memory' | 'llm-memory';

  /**
   * Machine or environment identifier.
   * Derived from $HOSTNAME or a stable fingerprint in settings.local.json.
   * Enables deduplication when the same project is open on multiple machines.
   */
  device_id: string;

  /**
   * Absolute project path or logical project slug.
   * native:   working directory at save time (e.g. /Users/sangyi/workspace/projects/oh-my-customcode)
   * others:   project tag passed to MCP save call
   */
  project: string;

  /**
   * Agent that produced or owns this memory.
   * Omit for session-wide memories not tied to a specific agent.
   * Example: "arch-documenter", "sys-memory-keeper"
   */
  agent?: string;

  /** ISO 8601 UTC timestamp of when the record was created or last updated. */
  timestamp: string;

  /**
   * Human-readable one-line summary.
   * Used for MEMORY.md index lines and search result display.
   * Max 150 characters.
   */
  summary: string;

  /**
   * Full body of the memory.
   * native:   entire Markdown file content (or the relevant frontmatter block)
   * claude-mem: content passed to save_memory
   * episodic-memory: extracted conversation chunk
   * llm-memory: plain text injected into the agent prompt
   */
  content: string;

  /**
   * Freeform tags for filtering and routing.
   * Convention: lowercase, hyphen-separated.
   * Examples: ["feedback", "sensitive-path", "release"], ["project", "agents"]
   */
  tags: string[];

  /**
   * Visibility and handling tier. See #1067 for enforcement details.
   *
   * public     — safe to log, share, or include in any prompt
   * project    — scoped to this project; do not send to external services
   * sensitive  — omit from logs; inject only when explicitly needed
   * secret     — never inject into prompts; read only via secure MCP tool
   */
  sensitivity: 'public' | 'project' | 'sensitive' | 'secret';

  /**
   * SHA-256 of (source + content) for deduplication across adapters.
   * Collision → keep record with later timestamp, merge tags.
   */
  hash: string;

  /**
   * Optional reference to a pre-computed embedding stored in the vector DB.
   * Format: "<collection>/<vector-id>" (e.g. "claude-mem/abc123")
   * Populated by the claude-mem adapter; omit for native and llm-memory.
   */
  embedding_ref?: string;
}
```

---

## Field Semantics

| Field | Required | Valid values / constraints | Notes |
|---|---|---|---|
| `id` | Yes | String, globally unique | Derivation rule per source above |
| `source` | Yes | `native` \| `claude-mem` \| `episodic-memory` \| `llm-memory` | Immutable after creation |
| `device_id` | Yes | Non-empty string | Defaults to `$HOSTNAME`; override in settings |
| `project` | Yes | Absolute path or slug | Normalise trailing slash before hashing |
| `agent` | No | kebab-case agent name | Omit for orchestrator-level memories |
| `timestamp` | Yes | ISO 8601 UTC (`2026-04-27T09:00:00Z`) | Set at creation; update on meaningful edit |
| `summary` | Yes | ≤150 chars, no newline | Used in MEMORY.md index and search preview |
| `content` | Yes | Any string | No enforced length limit; compress via R013 if needed |
| `tags` | Yes | String array, may be empty | Lowercase, hyphen-separated recommended |
| `sensitivity` | Yes | See tier table above | Default: `project` when source is `native` |
| `hash` | Yes | `sha256(source + content)` | Recompute on content change |
| `embedding_ref` | No | `"<collection>/<id>"` | Only claude-mem adapter populates this |

---

## Adapter Mapping Guide

### native (MEMORY.md)

| Schema field | Derived from |
|---|---|
| `id` | `sha256("native" + device_id + project + timestamp)` |
| `source` | `"native"` |
| `device_id` | `$HOSTNAME` at save time |
| `project` | Working directory passed by sys-memory-keeper |
| `agent` | Memory directory name: `.claude/agent-memory/<name>/` |
| `timestamp` | File mtime (ISO 8601 UTC) |
| `summary` | First non-blank line of MEMORY.md (after `#` heading stripped) |
| `content` | Full MEMORY.md content |
| `tags` | Extract from `## ` section headings (lowercase) |
| `sensitivity` | `"project"` (default; elevate to `"sensitive"` if file contains secrets) |
| `hash` | `sha256("native" + content)` |
| `embedding_ref` | Omit |

### claude-mem (Chroma MCP)

| Schema field | Derived from |
|---|---|
| `id` | MCP-returned UUID from `save_memory` response |
| `source` | `"claude-mem"` |
| `device_id` | `$HOSTNAME` at save time |
| `project` | `project` tag passed to `save_memory` |
| `agent` | `agent` tag if present in MCP metadata |
| `timestamp` | MCP `created_at` field |
| `summary` | First sentence of `content` (≤150 chars) |
| `content` | Full content string passed to `save_memory` |
| `tags` | MCP tags array |
| `sensitivity` | `"project"` default; map MCP `sensitivity` tag if present |
| `hash` | `sha256("claude-mem" + content)` |
| `embedding_ref` | `"claude-mem/" + vector_id` from MCP response |

### episodic-memory (auto-indexed)

| Schema field | Derived from |
|---|---|
| `id` | `session_id + "-" + chunk_index` |
| `source` | `"episodic-memory"` |
| `device_id` | `$HOSTNAME` |
| `project` | Project path active during the session |
| `agent` | Omit (whole-session scope) |
| `timestamp` | Session end time |
| `summary` | Auto-generated by episodic-memory indexer |
| `content` | Extracted conversation chunk |
| `tags` | `["episodic"]` + any topic tags from indexer |
| `sensitivity` | `"project"` |
| `hash` | `sha256("episodic-memory" + content)` |
| `embedding_ref` | Episodic index reference if available |

### llm-memory (in-context, session-scoped)

| Schema field | Derived from |
|---|---|
| `id` | Ephemeral UUID, regenerated each session |
| `source` | `"llm-memory"` |
| `device_id` | `$HOSTNAME` |
| `project` | Active working directory |
| `agent` | Injecting agent name |
| `timestamp` | Injection time |
| `summary` | Short label passed at injection |
| `content` | Injected text block |
| `tags` | `["llm-memory", "session-scoped"]` |
| `sensitivity` | `"public"` (already in prompt — no additional restriction) |
| `hash` | `sha256("llm-memory" + content)` |
| `embedding_ref` | Omit |

---

## Concrete Examples

### Example 1 — native record (arch-documenter feedback)

```json
{
  "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "source": "native",
  "device_id": "macbook-sangyi",
  "project": "/Users/sangyi/workspace/projects/oh-my-customcode",
  "agent": "arch-documenter",
  "timestamp": "2026-04-27T09:12:00Z",
  "summary": "arch-documenter has disallowedTools:[Bash] — avoid /tmp/*.sh bypass, delegate Bash tasks",
  "content": "# arch-documenter Memory\n\n...(full MEMORY.md)...",
  "tags": ["feedback", "arch-documenter", "sensitive-path"],
  "sensitivity": "project",
  "hash": "sha256:native+<content>",
  "embedding_ref": null
}
```

### Example 2 — claude-mem record (session summary)

```json
{
  "id": "f7e8d9c0-1a2b-3c4d-5e6f-7a8b9c0d1e2f",
  "source": "claude-mem",
  "device_id": "macbook-sangyi",
  "project": "oh-my-customcode",
  "agent": null,
  "timestamp": "2026-04-27T10:30:00Z",
  "summary": "Session 88: v0.116.1 bootstrap hotfix — professor-triage Phase 4 mismatch fixed",
  "content": "Tasks: #1043 arch-documenter Bash disallowedTools, #1046 inline directive loss. Decisions: general-purpose fallback for Phase 4. Open: #1048 #1047 #1045 #1041 #1035.",
  "tags": ["session-summary", "release", "hotfix"],
  "sensitivity": "project",
  "hash": "sha256:claude-mem+<content>",
  "embedding_ref": "claude-mem/f7e8d9c0vector"
}
```

### Example 3 — llm-memory record (injected skill budget)

```json
{
  "id": "ephemeral-uuid-abc123",
  "source": "llm-memory",
  "device_id": "macbook-sangyi",
  "project": "/Users/sangyi/workspace/projects/oh-my-customcode",
  "agent": "sys-memory-keeper",
  "timestamp": "2026-04-27T11:00:00Z",
  "summary": "Skill budget: research=40%, impl=50%, review=60%",
  "content": "Context budget thresholds injected for this session: research 40%, implementation 50%, review 60%, management 70%, general 80%.",
  "tags": ["llm-memory", "session-scoped", "skill-budget"],
  "sensitivity": "public",
  "hash": "sha256:llm-memory+<content>",
  "embedding_ref": null
}
```

---

## Cross-References

| Reference | Relationship |
|---|---|
| [#1047](https://github.com/baekenough/oh-my-customcode/issues/1047) | Parent epic — local memory integration + skill context budget |
| [#1065](https://github.com/baekenough/oh-my-customcode/issues/1065) | This document |
| [#1066](https://github.com/baekenough/oh-my-customcode/issues/1066) | Skill budget — `llm-memory` records for context thresholds |
| [#1067](https://github.com/baekenough/oh-my-customcode/issues/1067) | Sensitivity tier enforcement — governs `sensitivity` field values |
| `.claude/agent-memory/arch-documenter/MEMORY.md` | Example native source; see adapter mapping above |
| `.claude/rules/SHOULD-memory-integration.md` (R011) | Memory system architecture and session-end save protocol |
| `.claude/rules/SHOULD-ecomode.md` (R013) | Context budget management; informs `llm-memory` content compression |

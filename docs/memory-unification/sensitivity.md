# Memory Unification — Content Sensitivity Policy

> **Epic**: #1047 — Unified Memory System
> **Depends on**: #1065 (schema), #1066 (skill budget)
> **Implements**: #1067
> **Cross-reference**: R001 (Safety Rules)

---

## Sensitivity Tiers

| Tier | Description | Storage | Committed to Git? | Prompt Injection |
|------|-------------|---------|-------------------|-----------------|
| `public` | Non-sensitive project knowledge, architecture notes, workflow patterns | Any adapter | Yes | Full content |
| `project` | Default tier. Work-in-progress context, task state, routing decisions | Project-scoped adapter | Yes | Full content |
| `sensitive` | PII, user-provided credentials placeholders, personal identifiers | Local adapter only | No | Summary only (no raw content) |
| `secret` | API keys, tokens, passwords, private keys matching detection regexes | Rejected — never stored | Never | Excluded entirely |

**Default tier**: `project` (applied when no explicit tier is set — conservative choice that avoids accidental secret commits while preserving usefulness).

---

## Detection Rules

### `secret` — Regex Detection (auto-applied on every record before persist)

The following patterns trigger automatic `secret` classification and MUST cause the adapter to reject the persist with a warning:

| Pattern | Matches |
|---------|---------|
| `sk-[a-zA-Z0-9]{30,}` | OpenAI API keys |
| `ghp_[a-zA-Z0-9]{36}` | GitHub personal access tokens |
| `ghs_[a-zA-Z0-9]{36}` | GitHub OAuth app tokens |
| `AKIA[0-9A-Z]{16}` | AWS access key IDs |
| `xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+` | Slack bot tokens |
| `xoxp-[0-9]+-[0-9]+-[a-zA-Z0-9]+` | Slack user tokens |
| `-----BEGIN (RSA\|EC\|OPENSSH\|PGP) PRIVATE KEY-----` | Private keys |
| `[0-9a-f]{40}` (in key-named fields) | SHA-1 secrets (field-context check required) |
| `eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | JWT tokens |
| `[Pp]assword\s*[:=]\s*\S+` | Inline password assignments |

Detection runs against both the record `value` field and any string sub-fields recursively. A single match in any field is sufficient to classify the entire record as `secret`.

### `sensitive` — Explicit Metadata Required

Records are classified `sensitive` only through explicit declaration. There is no auto-detection for PII; callers must set `sensitivity: sensitive` in the record metadata. This prevents over-classification while maintaining a clear audit trail.

Examples of content that SHOULD be declared `sensitive`:
- User email addresses or names stored as project context
- Internal server hostnames or IP addresses
- Workspace paths that expose username (`/Users/johndoe/...`)

### Tier Precedence

```
secret (detected) > sensitive (explicit) > project (default) > public (explicit)
```

Detected `secret` always wins — explicit metadata cannot downgrade a detected secret to a lower tier.

---

## Storage Rules

| Tier | Storage Target | Git Committed | On Detect |
|------|---------------|---------------|-----------|
| `public` | Any adapter (project/user/local) | Yes | Store normally |
| `project` | Project or local adapter | Yes (project), No (local) | Store normally |
| `sensitive` | Local adapter only | No | Store with warning log |
| `secret` | **Not stored anywhere** | Never | Reject + emit warning |

### `secret` Handling Protocol

1. Run detection regex suite against record content
2. If any pattern matches → set `sensitivity: secret` internally
3. **Reject the persist call** — return error: `[Memory] REJECTED: secret-tier content detected in field '{field}'. Record not stored.`
4. Emit warning to stderr (not stdout, to avoid prompt contamination)
5. Redact matched value in the warning: show first 4 chars + `****` (e.g., `sk-Ab****`)
6. Do NOT log the full matched string anywhere

### PreWrite Hook Integration Point

Adapters implementing the unified memory interface MUST expose a `preWrite` scan step. The hook fires before any storage operation and receives the full record. The `secret` detection regex suite runs at this step.

```
preWrite(record) → scan(record) → {
  secret detected  → reject(record, warning)
  sensitive        → enforce local-only adapter routing
  project/public   → proceed to storage
}
```

The `.claude/hooks/` PreToolUse hook system MAY integrate this scan as an advisory check for the `Write` tool targeting memory paths, but the adapter-level scan is the authoritative gate (hooks are advisory per R021).

No existing redaction scripts are present in `.claude/hooks/scripts/` — this policy defines the first redaction contract in the project.

---

## Disclosure Rules

### Subagent Prompt Synthesis

When injecting memory records into a spawned agent's prompt:

| Tier | Injected Content |
|------|-----------------|
| `public` | Full content |
| `project` | Full content |
| `sensitive` | Summary only: `[sensitive record: {key}, created {date}]` — no raw value |
| `secret` | Never injected (records should not exist; skip if encountered) |

This ensures subagents receive the context they need without receiving raw credentials or PII.

### `/memory-recall` Tier Filter

The `/memory-recall` command MUST accept a `--tier` filter parameter:

```
/memory-recall [query] [--tier public|project|sensitive]
```

- Default (no `--tier`): returns `public` and `project` records only
- `--tier sensitive`: requires explicit invocation; returns `sensitive` records with a disclosure notice
- `secret` tier: never returned by any query path

### Export Safety

Any memory export operation (full dump, backup, share) MUST:

1. Verify zero `secret`-tier records in the export set (fail-stop if found)
2. Exclude `sensitive`-tier records unless the user explicitly opts in with `--include-sensitive`
3. Emit a pre-export summary: `Exporting {n} records: {public: x, project: y, sensitive: z (excluded)}`

---

## Implementation Contract for Adapters

Adapters implementing the unified memory schema (#1065) MUST satisfy the following sensitivity contract. This applies to all follow-up adapter issues (#3–#6 under epic #1047).

### Required Adapter Behaviors

1. **Secret detection on every record before persisting**
   - Run the full regex suite defined in [Detection Rules](#detection-rules) above
   - Apply to all string fields recursively (including nested metadata)
   - This is not optional — adapters that skip detection are non-compliant

2. **Tag with derived `sensitivity` field**
   - Every persisted record MUST carry a `sensitivity` field set to one of: `public | project | sensitive | secret`
   - If detection fires → set `secret` regardless of caller-supplied value
   - If caller supplied `sensitive` and no secret detected → honor it
   - Otherwise → default to `project`

3. **Reject persist if `secret` detected**
   - Return a structured error object, not an exception:
     ```
     { ok: false, error: "secret_detected", field: "<field_name>", hint: "<redacted_prefix>****" }
     ```
   - Do NOT swallow the error silently

4. **Local-only routing for `sensitive`**
   - If `sensitivity === "sensitive"`, adapter MUST route to local (non-git-tracked) storage
   - Raise an error if no local adapter is available: `"sensitive record requires local adapter — none configured"`

5. **Disclosure filter in read path**
   - Read operations MUST respect the tier filter contract described in [Disclosure Rules](#disclosure-rules)
   - Default read excludes `sensitive` unless caller passes `includeSensitive: true`

---

## Cross-References

| Reference | Relationship |
|-----------|-------------|
| R001 (MUST-safety.md) | Prohibits exposing API keys/secrets/passwords — this policy operationalizes that rule for memory storage |
| #1047 | Parent epic — Unified Memory System |
| #1065 | Memory schema — defines the `sensitivity` field this policy populates |
| #1066 | Skill budget — per-skill memory access controls interact with sensitivity tier (sensitive records excluded from skill context by default) |

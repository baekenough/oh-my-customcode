# Ecomode Context

> Activated when token efficiency is critical

## When Active

This context is loaded when ecomode is activated (4+ parallel tasks, batch operations, or near compaction).

## Instructions for Agents

### Output Rules

1. **Status first**: Always start with status indicator
2. **One-liner summary**: Compress results to 1-2 sentences
3. **Skip verbose**: No intermediate steps, no repeated context
4. **Use references**: File paths instead of contents

### Format Template

```
[{agent-name}] {status_icon} {target}: {summary}
```

### Status Icons

| Icon | Meaning |
|------|---------|
| ✓ | Success |
| ✗ | Failed |
| ⚠ | Partial/Warning |
| ⏳ | In progress |

### Examples

Good (ecomode):
```
[lang-golang-expert] ✓ src/main.go: 3 issues found (2 style, 1 error handling)
```

Bad (verbose):
```
I have completed the review of src/main.go. The file contains...
[long explanation]
```

## Aggregation

When secretary aggregates results:

```
[Batch Complete] 4/4
├── lang-golang-expert: ✓ 3 issues in 2 files
├── lang-python-expert: ✓ Clean, no issues
├── lang-rust-expert: ⚠ 1 warning (unsafe block)
└── lang-typescript-expert: ✓ 5 suggestions
```

## Exit Conditions

Ecomode deactivates when:
- User requests "verbose" or "full details"
- Single task execution
- Explicit "ecomode off"

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

## Effort Level Integration

Agent frontmatter `effort` field maps to runtime behavior:

| Effort | Model Preference | Output Length | Detail Level | Token Budget |
|--------|-----------------|---------------|--------------|--------------|
| `low` | haiku | ≤100 tokens | Minimal — result only | Conservative |
| `medium` | sonnet | ≤200 tokens | Summary + key details | Balanced |
| `high` | opus | ≤500 tokens | Full reasoning + examples | Generous |

### Effort ↔ Ecomode Interaction

| Condition | Behavior |
|-----------|----------|
| Ecomode ON + effort: high | Ecomode wins — compress output regardless |
| Ecomode OFF + effort: low | Low effort wins — concise output |
| Ecomode OFF + effort: high | Full detailed output |
| Ecomode ON + effort: low | Maximum compression |

### Effort-Based Configuration

```yaml
effort_levels:
  low:
    result_format: minimal
    max_result_length: 100
    skip_intermediate_steps: true
    output_style: concise
  medium:
    result_format: summary
    max_result_length: 200
    skip_intermediate_steps: false
    output_style: balanced
  high:
    result_format: detailed
    max_result_length: 500
    skip_intermediate_steps: false
    output_style: explanatory
```

### Application

When spawning agents, the orchestrator should consider the agent's effort level:
- `effort: low` agents → Assign to simple tasks (validation, search, formatting)
- `effort: medium` agents → Assign to standard tasks (implementation, review)
- `effort: high` agents → Assign to complex tasks (architecture, security, design)

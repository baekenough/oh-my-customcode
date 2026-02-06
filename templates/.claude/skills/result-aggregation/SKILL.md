---
name: result-aggregation
description: Aggregate parallel agent results into concise output
user-invocable: false
---

## Purpose

Aggregate and format results from multiple parallel agent executions into concise, scannable output.

## When to Use

- After parallel agent execution completes
- When ecomode is active
- For batch operation summaries
- When reporting multi-agent task results

## Aggregation Formats

### Standard Batch Format

```
[Batch Complete] {completed}/{total}
├── {agent}: {icon} {summary}
├── {agent}: {icon} {summary}
└── {agent}: {icon} {summary}
```

### Detailed Batch Format

```
[Batch Complete] {completed}/{total}

[1] {agent-name}
    Status: {success|failed|partial}
    Target: {file/path}
    Result: {summary}

[2] {agent-name}
    Status: {success|failed|partial}
    Target: {file/path}
    Result: {summary}
```

### Error Summary Format

```
[Batch Complete] {completed}/{total} ({failures} failed)

Failures:
├── {agent}: {error summary}
└── {agent}: {error summary}

Successes:
├── {agent}: ✓ {summary}
└── {agent}: ✓ {summary}
```

## Status Icons

| Icon | Status | Use When |
|------|--------|----------|
| ✓ | Success | Task completed successfully |
| ✗ | Failed | Task failed with error |
| ⚠ | Warning | Completed with warnings |
| ⏳ | Pending | Still in progress |
| ⊘ | Skipped | Task was skipped |

## Aggregation Rules

### 1. Ordering

```yaml
order:
  - Failed results first (need attention)
  - Warnings second
  - Successes last
  - Within category: alphabetical by agent
```

### 2. Summary Length

```yaml
ecomode_on:
  max_length: 50 characters
  truncate_with: "..."

ecomode_off:
  max_length: 200 characters
  allow_multiline: true
```

### 3. Grouping

```yaml
group_by:
  - status (success/failed/warning)
  - agent_type (when mixed types)
  - target_path (when same agent, different targets)
```

## Integration

### With Secretary

```
Secretary receives:
  - List of agent results
  - Ecomode status
  - User display preferences

Secretary outputs:
  - Aggregated summary using this skill
  - Individual details if requested
```

### With Ecomode

```
When ecomode active:
  - Use compact format
  - One line per agent
  - Icons for status
  - Truncate long summaries
```

## Examples

### Code Review Batch

```
[Batch Complete] 4/4

├── lang-golang-expert: ✓ src/main.go - 2 issues (1 naming, 1 error handling)
├── lang-python-expert: ✓ scripts/*.py - Clean
├── lang-rust-expert: ⚠ lib/core.rs - 1 unsafe block flagged
└── lang-typescript-expert: ✓ web/app.tsx - 3 suggestions
```

### Agent Creation Batch

```
[Batch Complete] 3/4 (1 failed)

✗ lang-kotlin-expert: Skill not found: kotlin-best-practices
✓ lang-golang-expert: Agent created at .claude/agents/lang-golang-expert.md
✓ lang-python-expert: Agent created at .claude/agents/lang-python-expert.md
✓ lang-rust-expert: Agent created at .claude/agents/lang-rust-expert.md
```

### Audit Batch

```
[Batch Complete] 5/5

Agents Audited:
├── mgr-creator: ✓ All refs valid
├── mgr-updater: ✓ All refs valid
├── mgr-supplier: ⚠ 1 deprecated ref
├── lang-golang-expert: ✓ All refs valid
└── lang-python-expert: ✓ All refs valid

Summary: 5 agents checked, 1 warning
```

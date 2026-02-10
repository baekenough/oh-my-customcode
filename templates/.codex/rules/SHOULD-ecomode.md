# [SHOULD] Ecomode Rules

> **Priority**: SHOULD - Recommended for token efficiency
> **ID**: R013

## Purpose

Reduce token usage and improve efficiency during batch operations and parallel execution.

## Activation Conditions

Ecomode is automatically activated when:

```yaml
conditions:
  - 4+ parallel tasks spawned
  - Batch operations requested
  - Near compaction threshold (80%+ context usage)
  - Explicit user request: "ecomode on"
```

## Behaviors

### 1. Compact Output Format

When ecomode is active, parallel agents return:

```yaml
format:
  - status: success | failed | partial
  - summary: 1-2 sentences max
  - key_data: essential results only

skip:
  - Intermediate steps
  - Verbose explanations
  - Repeated context
  - Full file contents (use paths instead)
```

### 2. Aggregation Format

Secretary aggregates results in compact format:

```
[Batch Complete] {n}/{total}
├── {agent}: {icon} {summary}
├── {agent}: {icon} {summary}
└── {agent}: {icon} {summary}
```

Icons:
- ✓ success
- ✗ failed
- ⚠ partial/warning

### 3. Result Compression

```yaml
compress:
  - File lists → count only unless < 5 files
  - Error traces → first and last 3 lines
  - Code snippets → path:line reference only
  - Long outputs → truncate with "[truncated]"
```

## Secretary Ecomode Config

```yaml
ecomode:
  enabled: true
  threshold: 4           # Activate when >= 4 parallel tasks
  result_format: summary # summary | full
  max_result_length: 200 # characters per result
```

## Examples

### Normal Mode Output

```
┌─ Agent: lang-golang-expert (sw-engineer)
├─ Skill: go-best-practices
└─ Task: Reviewing src/main.go

Reading file...
[lang-golang-expert → Read] src/main.go

Analyzing code structure...
Found 3 functions, 2 structs, 1 interface.

Checking naming conventions...
Function 'GetUser' follows Go naming conventions.
Function 'processData' follows Go naming conventions.
Function 'handle_error' VIOLATION: uses snake_case instead of camelCase.

[...]

Review Complete:
- 1 naming violation found
- 2 potential improvements suggested
- Overall code quality: Good
```

### Ecomode Output

```
[lang-golang-expert] ✓ src/main.go reviewed: 1 naming issue (handle_error → handleError)
```

## Implementation Notes

### For Orchestrator (Secretary)

```yaml
responsibilities:
  - Detect ecomode activation conditions
  - Instruct spawned agents to use compact format
  - Aggregate results in batch format
  - Track token savings
```

### For Worker Agents

```yaml
when_ecomode_active:
  - Return status + summary only
  - Skip intermediate progress updates
  - Use references instead of full content
  - Compress error messages
```

## Override

User can disable ecomode:
- "ecomode off"
- "verbose mode"
- "show full details"

## Benefits

1. **Token Efficiency**: 60-80% reduction in batch operations
2. **Faster Response**: Less output processing
3. **Better Overview**: Aggregated results at a glance
4. **Context Preservation**: More room for actual work

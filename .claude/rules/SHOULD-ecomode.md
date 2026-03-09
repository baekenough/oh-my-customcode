# [SHOULD] Ecomode Rules

> **Priority**: SHOULD | **ID**: R013

## Activation

Auto-activates when: 4+ parallel tasks, batch operations, 80%+ context usage, or explicit "ecomode on".

## Behaviors

**Compact Output**: Agents return `status + summary (1-2 sentences) + key_data only`. Skip intermediate steps, verbose explanations, repeated context, full file contents.

**Aggregation Format**:
```
[Batch Complete] {n}/{total}
├── {agent}: ✓/✗/⚠ {summary}
```

**Compression**: File lists -> count only (unless < 5), error traces -> first/last 3 lines, code -> path:line ref only.

## Config

```yaml
ecomode:
  threshold: 4
  result_format: summary
  max_result_length: 200
```

## Example

Normal: Full agent header + step-by-step analysis + detailed results.
Ecomode: `[lang-golang-expert] ✓ src/main.go reviewed: 1 naming issue (handle_error -> handleError)`

## Override

Disable with: "ecomode off", "verbose mode", or "show full details".

## Context Budget Management

Task-type-aware context thresholds that trigger ecomode earlier for context-heavy operations.

### Task Type Thresholds

| Task Type | Context Trigger | Rationale |
|-----------|----------------|-----------|
| Research (/research, multi-team) | 40% | High context consumption from parallel team results |
| Implementation (code generation) | 50% | Moderate context for code + test output |
| Review (code review, audit) | 60% | Moderate context for diff analysis |
| Management (git, deploy, CI) | 70% | Lower context needs |
| General (default) | 80% | Standard threshold |

### Detection

Task type is inferred from active context:
- **Research**: `/research` skill active, 4+ parallel agents
- **Implementation**: Write/Edit tools dominant, code files targeted
- **Review**: Read/Grep dominant, review/audit skill active
- **Management**: git/gh commands, CI/CD operations
- **General**: No specific pattern detected

### Budget Advisor Hook

The `context-budget-advisor.sh` hook monitors context usage and emits warnings when task-specific thresholds are approached:

```
[Context Budget] Task: research | Threshold: 40% | Current: 38%
[Context Budget] ⚠ Approaching budget limit — consider /compact or ecomode
```

### Integration

- Works with existing ecomode activation (R013)
- Does NOT override explicit user settings
- Advisory only — never blocks operations
- Context percentage from statusline data when available

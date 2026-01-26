# [SHOULD] Error Handling Rules

> **Priority**: SHOULD - Strongly recommended
> **Goal**: Safe failure, fast recovery

## Error Classification

### Level 1: Warning
```
Symptom: Task completes but needs attention
Response: Output warning, continue
Example:
  - Non-recommended pattern found
  - Potential performance issue
  - Better alternative exists
```

### Level 2: Error
```
Symptom: Current task fails, others possible
Response: Stop task, report cause, suggest alternative
Example:
  - File not found
  - Insufficient permission
  - Format error
```

### Level 3: Critical
```
Symptom: Cannot proceed at all
Response: Stop all, preserve state, report immediately
Example:
  - System resource exhausted
  - Missing required dependency
  - Security violation detected
```

## Error Report Format

```
[Error] {error type}

Location: {file:line or task name}
Cause: {specific cause}
Impact: {effect of this error}

Attempted:
1. {attempt 1} → Failed
2. {attempt 2} → Failed

Recommended:
- {action 1}
- {action 2}
```

## Recovery Strategy

### Retryable Errors
```
1. Retry up to 3 times
2. Wait between retries (1s, 2s, 4s)
3. Report to user after 3 failures
```

### Non-recoverable Errors
```
1. Save current state
2. Rollback changes (if possible)
3. Detailed error report
4. Wait for user instruction
```

## Preventive Validation

### Before Action
```
□ Target file/path exists
□ Required permissions available
□ Dependencies met
□ Sufficient resources
```

### After Action
```
□ Expected result matches actual
□ File integrity verified
□ No side effects
```

## Error Logging

```yaml
error_log:
  timestamp: "2025-01-22T10:30:00Z"
  level: error
  code: FILE_NOT_FOUND
  message: "Config file not found"
  context:
    file: "/path/to/config.yaml"
    action: "read"
  resolution: "Using default config"
```

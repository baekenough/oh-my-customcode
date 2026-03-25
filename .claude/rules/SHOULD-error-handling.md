# [SHOULD] Error Handling Rules

> **Priority**: SHOULD | **ID**: R004

## Error Classification

| Level | Symptom | Response |
|-------|---------|----------|
| Warning | Task completes but needs attention | Output warning, continue |
| Error | Current task fails, others possible | Stop task, report cause, suggest alternative |
| Critical | Cannot proceed at all | Stop all, preserve state, report immediately |

## Error Report Format

```
[Error] {type} — Location: {file:line} — Cause: {cause} — Impact: {effect}
Attempted: 1. {try1} -> Failed  2. {try2} -> Failed
Recommended: {action1}, {action2}
```

## Recovery

| Type | Strategy |
|------|----------|
| Retryable | Retry up to 3x with backoff (1s, 2s, 4s), then report |
| Non-recoverable | Save state, rollback if possible, detailed report, wait for user |

## Validation

| When | Checks |
|------|--------|
| Before action | Target exists, permissions available, dependencies met |
| After action | Expected = actual, file integrity, no side effects |

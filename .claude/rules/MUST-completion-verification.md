# [MUST] Completion Verification Rules

> **Priority**: MUST | **ID**: R020

## Core Rule

Before declaring any task `[Done]`, verify completion against task-type-specific criteria. False completion declarations erode trust and cause downstream failures.

## Task-Type Completion Matrix

| Task Type | REQUIRED Verification Before [Done] |
|-----------|-------------------------------------|
| Release | All issues closed, version bumped, PR merged, GitHub Release created |
| Implementation | Code compiles/passes lint, tests pass (if exist), no TODO markers left |
| Documentation | Links valid, counts accurate, cross-references updated |
| Git Operations | Operation succeeded (check exit code), working tree clean |
| Code Review | All findings addressed or explicitly deferred with justification |
| Agent/Skill Creation | Frontmatter valid, referenced skills exist, routing updated |

## Self-Check (Before Declaring Done)

Before [Done]: (1) Verify ACTUAL outcome not just attempt — "ran command" ≠ "succeeded". (2) Check task-type criteria above. (3) No unchecked items. (4) Would bet $100 it's complete.

<!-- DETAIL: Self-Check box
1. Did I verify ACTUAL outcome? "I ran the command" ≠ "the command succeeded" → YES: Continue / NO: Verify first
2. Does task type have specific criteria? YES: Check each / NO: Apply general verification
3. Any unchecked items? YES: Complete or defer with reason / NO: Proceed to [Done]
4. Would I bet $100 this is truly complete? YES: Declare [Done] / NO: Identify uncertain and verify
-->

## Common False Completion Patterns

| Pattern | Reality | Fix |
|---------|---------|-----|
| "Command executed" | Exit code not checked | Check `$?` or tool output |
| "File created" | Content not verified | Read file back, verify content |
| "PR created" | CI not checked | Wait for CI, verify green |
| "Issue closed" | Related issues not updated | Check parent epic, cross-refs |
| "Tests pass" | Only ran subset | Run full test suite |

## Completion Contract Format

For complex tasks, declare completion contract upfront:

```
[Contract] Task: {name}
├── Criterion 1: {specific, verifiable condition}
├── Criterion 2: {specific, verifiable condition}
└── Criterion N: {specific, verifiable condition}
```

Then at completion:

```
[Done] Task: {name}
├── ✓ Criterion 1: {evidence}
├── ✓ Criterion 2: {evidence}
└── ✓ Criterion N: {evidence}
```

## Integration

| Rule | Interaction |
|------|-------------|
| R003 | [Done] status format now requires verification evidence |
| R010 | Orchestrator verifies subagent completion claims |
| R017 | Structural changes require sauron verification before [Done] |

# [MUST] Continuous Improvement Rules

> **Priority**: MUST | **ID**: R016 | **Trigger**: User points out rule violation

## Core Rule

When user points out a violation: update the relevant rule → commit → then continue original task.

Update the relevant rule rather than just acknowledging the violation.

## Workflow

1. Acknowledge violation
2. Identify root cause (which rule was weak/unclear?)
3. Update the rule (add clarity, examples, self-checks)
4. Commit the change
5. Continue original task following updated rules

## Integration

| Situation | Action |
|-----------|--------|
| User points out violation | Update rule → Continue |
| Self-detected violation | Fix immediately, consider rule update |
| Ambiguous situation | Ask user, then update if needed |

## Defect Response Matrix

| Defect Type | Rule Update | Memory | Issue |
|-------------|:-----------:|:------:|:-----:|
| Rule violation (agent behavior) | ✅ | — | — |
| CI/infra defect | — | ✅ | ✅ |
| Process gap (workflow hole) | ✅ | ✅ | ✅ |
| Repeatable system bug | — | ✅ | ✅ |
| Agent selection failure (wrong agent routed) | — | ✅ | — |

When CI failure, process gap, or repeatable system defect is found:
1. Record feedback memory (defend current session)
2. Register GitHub issue (trackable improvement item)
3. Both required — memory alone is NOT sufficient for system-level defects

### Adaptive Harness Integration

When repeating agent failures or suboptimal routing is detected:
1. Record as feedback memory (immediate session defense)
2. Run `/omcustom:adaptive-harness --learn` to update project profile with failure patterns
3. Profile updates improve future agent selection and harness optimization

This connects R016's continuous improvement loop with the adaptive-harness skill's learning capability.

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Action |
|-------------|----------------|----------------|
| "I'll update the rule later" | Deferred fixes are forgotten | Update rule NOW, before continuing |
| "This is a one-time exception" | Exceptions become patterns | If the rule is wrong, fix it; if it's right, follow it |
| "The rule doesn't cover this case" | Missing coverage = rule gap | Add the case to the rule immediately |
| "Let me finish the task first" | Rule violations compound | Fix rule first (5 min), then continue (prevents N future violations) |

## Timing

Rule updates MUST happen:
- **Before** continuing the original task
- **In the same session** as the violation
- **Not** as a separate TODO or follow-up issue

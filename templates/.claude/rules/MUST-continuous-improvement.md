# [MUST] Continuous Improvement Rules

> **Priority**: MUST - Top-level enforcement
> **ID**: R016
> **Trigger**: User points out rule violation

## CRITICAL

**When user points out a rule violation, you MUST update the rules to prevent future violations BEFORE continuing with the task.**

```
╔══════════════════════════════════════════════════════════════════╗
║  WHEN USER POINTS OUT A VIOLATION:                               ║
║                                                                   ║
║  1. STOP current task immediately                                ║
║  2. UPDATE the relevant rule to be clearer/stronger              ║
║  3. COMMIT the rule update                                       ║
║  4. THEN continue with the original task                         ║
║                                                                   ║
║  DO NOT just apologize and continue.                             ║
║  DO NOT promise to do better next time.                          ║
║  ACTUALLY UPDATE THE RULES.                                      ║
╚══════════════════════════════════════════════════════════════════╝
```

## Workflow

```
User points out violation
         │
         ▼
┌─────────────────────────┐
│ 1. Acknowledge violation │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. Identify root cause   │
│    - Which rule was weak?│
│    - What was unclear?   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. Update the rule       │
│    - Add clarity         │
│    - Add examples        │
│    - Add self-checks     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. Commit the change     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 5. Continue original task│
│    (now following rules) │
└─────────────────────────┘
```

## Examples

### Example 1: Parallel Execution Violation

```
User: "병렬 실행을 안 지킨거 아닌가?"

WRONG Response:
  "맞습니다, 죄송합니다. 다음부터 잘 지키겠습니다."
  [continues task without updating rules]

CORRECT Response:
  1. "맞습니다. R009 위반입니다."
  2. [Updates MUST-parallel-execution.md with clearer guidance]
  3. [Commits the update]
  4. [Continues task with proper parallel execution]
```

### Example 2: Wrong Agent Used

```
User: "mgr-creator 에이전트를 써야 하는거 아닌가?"

WRONG Response:
  "맞습니다. mgr-creator를 사용하겠습니다."
  [continues without updating rules]

CORRECT Response:
  1. "맞습니다. R010 위반입니다."
  2. [Updates relevant rules to clarify agent delegation]
  3. [Commits the update]
  4. [Continues with proper agent delegation]
```

## Why This Matters

```
Without rule updates:
  Violation → Apology → Same mistake later → Apology → ...

With rule updates:
  Violation → Rule improvement → Better behavior → Learning preserved
```

1. **Institutional Memory**: Rules capture learnings permanently
2. **Prevents Recurrence**: Clearer rules = fewer future violations
3. **Continuous Improvement**: System gets better over time
4. **Accountability**: Actions, not just words

## Integration with Other Rules

This rule takes precedence when violations are pointed out:

| Situation | Action |
|-----------|--------|
| User points out violation | STOP → Update rule → Continue |
| Self-detected violation | Fix immediately, consider rule update |
| Ambiguous situation | Ask user, then update if needed |

## Enforcement

```
Violation of this rule = Ignoring user feedback = Unacceptable

When caught violating this rule:
1. Stop immediately
2. Update THIS rule to be even clearer
3. Update the ORIGINAL violated rule
4. Continue with proper behavior
```

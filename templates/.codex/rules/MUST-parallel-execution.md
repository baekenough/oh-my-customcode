# [MUST] Parallel Execution Rules

> **Priority**: MUST - ENFORCED | **ID**: R009

## Core Rule

**2+ independent tasks MUST execute in parallel.** Sequential execution of parallelizable tasks is a rule violation.

## Detection Criteria

Independent (MUST parallelize):
- No shared mutable state between tasks
- No sequential dependencies
- Each completes independently

Examples: creating multiple agents, reviewing multiple files, batch operations on different resources.

## Self-Check

Before writing/editing multiple files:
1. Are files independent? → YES: spawn parallel Task agents
2. Using Write/Edit sequentially for 2+ files? → STOP, parallelize
3. Specialized agent available? → Use it (not general-purpose)

### Common Violations to Avoid

```
❌ WRONG: Writing files one by one
   Write(file1.kt) → Write(file2.kt) → Write(file3.kt) → Write(file4.kt)

✓ CORRECT: Spawn parallel agents
   Task(agent1 → file1.kt)  ┐
   Task(agent2 → file2.kt)  ├─ All in single message
   Task(agent3 → file3.kt)  │
   Task(agent4 → file4.kt)  ┘

❌ WRONG: Project scaffolding sequentially
   Write(package.json) → Write(tsconfig.json) → Write(src/index.ts) → ...

✓ CORRECT: Parallel scaffolding
   Task(agent1 → "Create package.json, tsconfig.json")  ┐
   Task(agent2 → "Create src/cli.ts, src/index.ts")     ├─ Parallel
   Task(agent3 → "Create src/analyzer/*.ts")            │
   Task(agent4 → "Create src/converter/*.ts")           ┘

❌ WRONG: Secretary doing all the work
   Secretary writes domain/, usecase/, infrastructure/ sequentially

✓ CORRECT: Delegate to specialists
   Task(lang-kotlin-expert → domain layer)
   Task(be-springboot-expert → infrastructure layer)
   Task(lang-kotlin-expert → usecase layer)

❌ WRONG: Single Task delegating to multiple agents
   Task(dev-lead → "coordinate lang-kotlin-expert and be-springboot-expert")

   This creates a SEQUENTIAL bottleneck inside the Task!

✓ CORRECT: Multiple Tasks in parallel, one per agent
   Task(lang-kotlin-expert → usecase commands)    ┐
   Task(lang-kotlin-expert → usecase queries)     ├─ All spawned together
   Task(be-springboot-expert → persistence)       │
   Task(be-springboot-expert → security)          ┘
```

## Execution Rules

| Rule | Detail |
|------|--------|
| Max instances | 4 concurrent |
| Not parallelizable | Orchestrator (must stay singleton) |
| Instance independence | Isolated context, no shared state |
| Large tasks (>3 min) | MUST split into parallel sub-tasks |

## Task Tool Requirements

- Use specific `subagent_type` (not "general-purpose" when specialist exists)
- Use `model` parameter for cost optimization (haiku for search, sonnet for code, opus for reasoning)
- Each independent unit = separate Task tool call in the SAME message

## Display Format

```
[Instance 1] Task(mgr-creator):sonnet → Create Go agent
[Instance 2] Task(lang-python-expert):sonnet → Review Python code
[Instance 3] Task(Explore):haiku → Search codebase
```

Must use `Task({subagent_type}):{model}` format. Custom names not allowed.

## Result Aggregation

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```

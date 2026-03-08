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

## Agent Teams Gate (R018 Integration)

Before spawning parallel Agent instances, evaluate Agent Teams eligibility:

```
2+ independent tasks detected
  ↓
Is Agent Teams available? (env or tools check)
  ├─ NO → Proceed with Agent tool (standard R009)
  └─ YES → Check eligibility:
       ├─ 3+ agents needed? → Agent Teams (MUST)
       ├─ Review → fix cycle? → Agent Teams (MUST)
       └─ Neither → Agent tool (standard R009)
```

This gate is MANDATORY when Agent Teams is enabled. Skipping it is a violation of both R009 and R018.

## Self-Check

Before writing/editing multiple files:
1. Are files independent? → YES: spawn parallel agents
2. Using Write/Edit sequentially for 2+ files? → STOP, parallelize
3. Specialized agent available? → Use it (not general-purpose)
4. Agent Teams available + 3+ agents or review cycle? → YES: use Agent Teams instead of Agent tool
5. Agent Teams members? → ALL members MUST spawn in a single message (no partial spawning)

### Common Violations to Avoid

```
❌ WRONG: Writing files one by one
   Write(file1.kt) → Write(file2.kt) → Write(file3.kt) → Write(file4.kt)

✓ CORRECT: Spawn parallel agents
   Agent(agent1 → file1.kt)  ┐
   Agent(agent2 → file2.kt)  ├─ All in single message
   Agent(agent3 → file3.kt)  │
   Agent(agent4 → file4.kt)  ┘

❌ WRONG: Project scaffolding sequentially
   Write(package.json) → Write(tsconfig.json) → Write(src/index.ts) → ...

✓ CORRECT: Parallel scaffolding
   Agent(agent1 → "Create package.json, tsconfig.json")  ┐
   Agent(agent2 → "Create src/cli.ts, src/index.ts")     ├─ Parallel
   Agent(agent3 → "Create src/analyzer/*.ts")            │
   Agent(agent4 → "Create src/converter/*.ts")           ┘

❌ WRONG: Secretary doing all the work
   Secretary writes domain/, usecase/, infrastructure/ sequentially

✓ CORRECT: Delegate to specialists
   Agent(lang-kotlin-expert → domain layer)
   Agent(be-springboot-expert → infrastructure layer)
   Agent(lang-kotlin-expert → usecase layer)

❌ WRONG: Single Agent delegating to multiple agents
   Agent(dev-lead → "coordinate lang-kotlin-expert and be-springboot-expert")

   This creates a SEQUENTIAL bottleneck inside the Agent!

✓ CORRECT: Multiple Agents in parallel, one per agent
   Agent(lang-kotlin-expert → usecase commands)    ┐
   Agent(lang-kotlin-expert → usecase queries)     ├─ All spawned together
   Agent(be-springboot-expert → persistence)       │
   Agent(be-springboot-expert → security)          ┘

❌ WRONG: Agent Teams partial spawn (1 of N members)
   TeamCreate("feature-team")
   Message 1: Agent(member-1)  ← only 1/3 spawned, VIOLATION
   Message 2: Agent(member-2)  ← sequential, VIOLATION
   Message 3: Agent(member-3)  ← sequential, VIOLATION

✓ CORRECT: All Agent Teams members in single message
   TeamCreate("feature-team")
   Agent(member-1)  ┐
   Agent(member-2)  ├─ Single message, all at once
   Agent(member-3)  ┘
```

## Execution Rules

| Rule | Detail |
|------|--------|
| Max instances | 4 concurrent |
| Not parallelizable | Orchestrator (must stay singleton) |
| Instance independence | Isolated context, no shared state |
| Large tasks (>3 min) | MUST split into parallel sub-tasks |

## Agent Tool Requirements

- Use specific `subagent_type` (not "general-purpose" when specialist exists)
- Use `model` parameter for cost optimization (haiku for search, sonnet for code, opus for reasoning)
- Each independent unit = separate Agent tool call in the SAME message

## Display Format

```
[Instance 1] mgr-creator:sonnet → Create Go agent
[Instance 2] lang-python-expert:sonnet → Review Python code
[Instance 3] Explore:haiku → Search codebase
```

Must use `{subagent_type}:{model}` format. Custom names not allowed.

## Result Aggregation

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```

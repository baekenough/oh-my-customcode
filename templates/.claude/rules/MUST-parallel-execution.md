# [MUST] Parallel Execution Rules

> **Priority**: MUST | **ID**: R009

## Core Rule

**2+ independent tasks should execute in parallel.** Sequential execution of parallelizable tasks does not follow this rule.

## Detection Criteria

Independent (MUST parallelize):
- No shared mutable state between tasks
- No sequential dependencies
- Each completes independently

Examples: creating multiple agents, reviewing multiple files, batch operations on different resources.

## Agent Teams Gate (R018)

> Before spawning 2+ parallel agents, evaluate Agent Teams eligibility.
> Skipping this check does not follow R009 and R018.
>
> **See R018 (MUST-agent-teams.md) for the complete self-check and decision matrix.**
>
> Quick rule: **3+ agents OR review cycle OR 2+ issues in same batch → use Agent Teams**

## Self-Check

Before writing/editing multiple files:
1. Are files independent? → YES: spawn parallel agents
2. Using Write/Edit sequentially for 2+ files? → parallelize instead
3. Specialized agent available? → Use it (not general-purpose)
4. Agent Teams available? → **Check R018 criteria before spawning 2+ agents**

### Common Violations to Avoid

```
❌ WRONG: Write(file1.kt) → Write(file2.kt) → ... (sequential)
✓ CORRECT: Agent(agent1→file1.kt) + Agent(agent2→file2.kt) + ... (same message, parallel)
```

<!-- DETAIL: Full violation examples (4 pairs)
❌ WRONG: Writing files one by one
   Write(file1.kt) → Write(file2.kt) → Write(file3.kt) → Write(file4.kt)
✓ CORRECT: Spawn parallel agents — all in single message

❌ WRONG: Project scaffolding sequentially
   Write(package.json) → Write(tsconfig.json) → Write(src/index.ts) → ...
✓ CORRECT: Agent(agent1→"Create package.json, tsconfig.json") + Agent(agent2→"Create src/cli.ts, src/index.ts") parallel

❌ WRONG: Secretary writes domain/, usecase/, infrastructure/ sequentially
✓ CORRECT: Agent(lang-kotlin-expert→domain) + Agent(be-springboot-expert→infrastructure) + Agent(lang-kotlin-expert→usecase)

❌ WRONG: Agent(dev-lead → "coordinate lang-kotlin-expert and be-springboot-expert") — creates SEQUENTIAL bottleneck
✓ CORRECT: Agent(lang-kotlin-expert→usecase commands) + Agent(lang-kotlin-expert→usecase queries) + Agent(be-springboot-expert→persistence) + Agent(be-springboot-expert→security) — all spawned together
-->

> **Agent Teams partial spawn** → See R018 (MUST-agent-teams.md) "Spawn Completeness Check".

## Execution Rules

| Rule | Detail |
|------|--------|
| Max instances | 5 concurrent (soft default: 4) |
| Not parallelizable | Orchestrator (must stay singleton) |
| Instance independence | Isolated context, no shared state |
| Large tasks (>3 min) | MUST split into parallel sub-tasks |

## Stability Testing Protocol

When testing 5 concurrent agents (above the soft default of 4):

| Observation | Threshold | Action |
|-------------|-----------|--------|
| Response latency | > 2x normal | Reduce to 4 |
| Agent failure rate | > 10% | Reduce to 4 |
| Context errors | Any | Reduce to 4 |

5-agent concurrency is supported but should be monitored during initial adoption. Fall back to 4 if instability is observed.

## Agent Tool Requirements

- Use specific `subagent_type` (not "general-purpose" when specialist exists)
- Use `model` parameter for cost optimization (haiku for search, sonnet for code, opus for reasoning)
- Each independent unit = separate Agent tool call in the SAME message

## Display Format

```
[1] mgr-creator:sonnet → Create Go agent
[2] lang-python-expert:sonnet → Review Python code
[3] Explore:haiku → Search codebase
```

Must use `[N] {subagent_type}:{model}` format. `[N]` is 1-indexed and MUST match the `description` parameter prefix of the Agent tool call for Running display correlation.

Single agent spawns do NOT use the `[N]` prefix.

## Result Aggregation

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```

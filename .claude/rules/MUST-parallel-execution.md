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
5. Running agent stalled (2x+ duration)? → Spawn independent follow-up tasks immediately

### Common Violations to Avoid

```
❌ WRONG: Write(file1.kt) → Write(file2.kt) → ... (sequential)
✓ CORRECT: Agent(agent1→file1.kt) + Agent(agent2→file2.kt) + ... (same message, parallel)

❌ WRONG: Single agent receives massive multi-domain prompt (>5000 tokens, e.g., M2 plan with 12 tasks across 7 areas)
   → Latency timeout, user cancellation, context waste, no review loop
✓ CORRECT: Pre-decompose by domain, spawn parallel agents per area (R009) or use Agent Teams (R018)
```

> **Token threshold heuristic**: When a delegated agent prompt exceeds ~5000 tokens or spans 3+ unrelated domains, decompose by domain and spawn parallel agents. See R018 for Agent Teams criteria when review cycles are needed. Reference: #1085.

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

## Adaptive Parallel Splitting

Runtime detection and splitting of stalled parallel agents. Complements pre-execution parallelization.

See detection signals, splitting rules, and example via Read tool.

<!-- DETAIL: Adaptive Parallel Splitting — Detection, Splitting Rules, Example
### Detection

| Signal | Threshold | Action |
|--------|-----------|--------|
| Duration imbalance | Agent takes 2x+ longer than completed peers | Evaluate independent follow-up tasks |
| Task granularity | Agent assigned 10+ files | Consider layer-based splitting (domain → adapter → handler) |
| Pipeline bottleneck | One agent blocking subsequent phases | Spawn dependency-free next tasks immediately |

### Splitting Rules

1. **Dependency analysis first**: Only spawn tasks with NO dependency on the stalled agent
2. **Don't cancel the stalled agent**: Let it continue — spawn new agents for independent work
3. **Respect max instances**: New spawns still obey the 5 hard cap
4. **Report the split**: `[Split] Stalled: {agent} | Spawned: {new-agents} | Reason: {signal}`

### Example

```
Before (sequential bottleneck):
  P3 ████████████████████░░░░░░░░░░░░  (stalled, 10+ files)
  P4                                    (waiting — no P3 dependency)
  P5                                    (waiting — no P3 dependency)

After (adaptive split):
  P3 ████████████████████████████████  (continuing)
  P4 ████████████████████████████████  (spawned immediately)
  P5 ████████████████████████████████  (spawned immediately)
```
-->

## Stability Testing Protocol

Soft default: 4 concurrent agents; hard cap: 5. Reduce to 4 if latency >2x, failure rate >10%, or context errors. See full protocol via Read tool.

<!-- DETAIL: Stability Testing Protocol
When testing 5 concurrent agents (above the soft default of 4):

| Observation | Threshold | Action |
|-------------|-----------|--------|
| Response latency | > 2x normal | Reduce to 4 |
| Agent failure rate | > 10% | Reduce to 4 |
| Context errors | Any | Reduce to 4 |

5-agent concurrency is supported but should be monitored during initial adoption. Fall back to 4 if instability is observed.
-->

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

## Narrative Announcement Format (Before Spawn)

Use markdown list format (not inline comma-separated) for parallel dispatch announcements. See correct/incorrect examples via Read tool.

<!-- DETAIL: Narrative Announcement Format (Before Spawn)
When announcing a parallel dispatch in prose text (not the Agent tool call itself), use a markdown list rather than inline comma-separated description:

### Correct

```
병렬 실행:
- [1] {agent-a}: {task-a}
- [2] {agent-b}: {task-b}
```

### Incorrect

```
병렬 실행: [1] {agent-a}가 {task-a}, [2] {agent-b}가 {task-b}.
```

The list form mirrors the tool-call `[N]` prefix pattern and scales better to 3+ concurrent agents.
-->

## Result Aggregation

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```

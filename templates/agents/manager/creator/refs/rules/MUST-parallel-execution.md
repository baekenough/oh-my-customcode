# [MUST] Parallel Execution Rules

> **Priority**: MUST - ENFORCED for 2+ independent tasks
> **ID**: R009
> **Violation**: Sequential execution of parallelizable tasks = Rule violation

## CRITICAL

**When 2 or more tasks are INDEPENDENT, they MUST be executed in parallel.**

```
Detection criteria for parallel execution:
- Tasks don't share mutable state
- Tasks don't have sequential dependencies
- Tasks can complete independently

If ALL criteria met → MUST execute in parallel (max 4 instances)
```

### How to Detect Independent Tasks

```
Independent (MUST parallelize):
✓ "Create agents A, B, C" → 3 separate creations
✓ "Read files X, Y, Z" → 3 separate reads
✓ "Review code in src/, test/, docs/" → 3 separate reviews

Dependent (sequential OK):
✗ "Create agent then configure it" → depends on creation
✗ "Build then test" → test depends on build
✗ "Read file then edit it" → edit depends on read content
```

Failure to parallelize independent tasks = Rule violation = Must be corrected.

### Self-Check Before Every Multi-File Operation

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE writing/creating multiple files, ASK YOURSELF:          ║
║                                                                   ║
║  1. Are these files independent of each other?                   ║
║     → YES: Use Task tool to spawn parallel agents                ║
║     → NO: Sequential is OK                                       ║
║                                                                   ║
║  2. Am I using Write/Edit sequentially for 3+ files?            ║
║     → STOP. This is likely a violation.                         ║
║     → Spawn parallel agents instead.                             ║
║                                                                   ║
║  3. Are there domain-specific experts available?                 ║
║     → YES: Delegate to them (kotlin-expert, springboot-expert)  ║
║     → NO: Create general-purpose parallel agents                 ║
╚══════════════════════════════════════════════════════════════════╝
```

### Common Violations to Avoid

```
❌ WRONG: Writing files one by one
   Write(file1.kt) → Write(file2.kt) → Write(file3.kt) → Write(file4.kt)

✓ CORRECT: Spawn parallel agents
   Task(agent1 → file1.kt)  ┐
   Task(agent2 → file2.kt)  ├─ All in single message
   Task(agent3 → file3.kt)  │
   Task(agent4 → file4.kt)  ┘

❌ WRONG: Secretary doing all the work
   Secretary writes domain/, usecase/, infrastructure/ sequentially

✓ CORRECT: Delegate to specialists
   Task(kotlin-expert → domain layer)
   Task(springboot-expert → infrastructure layer)
   Task(kotlin-expert → usecase layer)

❌ WRONG: Single Task delegating to multiple agents
   Task(dev-lead → "coordinate kotlin-expert and springboot-expert")

   This creates a SEQUENTIAL bottleneck inside the Task!

✓ CORRECT: Multiple Tasks in parallel, one per agent
   Task(kotlin-expert → usecase commands)    ┐
   Task(kotlin-expert → usecase queries)     ├─ All spawned together
   Task(springboot-expert → persistence)     │
   Task(springboot-expert → security)        ┘
```

### Parallel Task Spawning Rule

```
╔══════════════════════════════════════════════════════════════════╗
║  PARALLEL MEANS PARALLEL AT THE TOOL CALL LEVEL                  ║
║                                                                   ║
║  When spawning Tasks for parallel work:                          ║
║  - Each independent unit of work = separate Task tool call       ║
║  - All Task calls in the SAME message = truly parallel           ║
║  - One Task that "coordinates" others = still sequential inside  ║
║                                                                   ║
║  Rule: If work can be split, split it into separate Tasks.       ║
╚══════════════════════════════════════════════════════════════════╝
```

### Large Task Decomposition (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  LARGE TASKS MUST BE SPLIT INTO PARALLEL SUB-TASKS               ║
║                                                                   ║
║  Before spawning a single large Task, ASK:                       ║
║                                                                   ║
║  1. Can this work be divided into independent parts?             ║
║     → Query tests, Security tests, Exception tests               ║
║     → Domain A, Domain B, Domain C                               ║
║     → Layer 1, Layer 2, Layer 3                                  ║
║                                                                   ║
║  2. How many parallel slots available? (max 4)                   ║
║     → If 3 slots free, split into 3 parallel Tasks              ║
║     → Maximize parallelism to minimize total time                ║
║                                                                   ║
║  3. Is estimated Task duration > 3 minutes?                      ║
║     → MUST split if work is decomposable                        ║
║     → 12 min single Task → 4 min with 3 parallel Tasks          ║
╚══════════════════════════════════════════════════════════════════╝

Example - WRONG:
  Task("Add tests for Query, Security, Exception, Domain")
  → Single agent works 12+ minutes sequentially

Example - CORRECT (3 parallel Tasks):
  Task(agent1 → "Add Query usecase tests")      ┐
  Task(agent2 → "Add Security tests")           ├─ ~4 min total
  Task(agent3 → "Add Exception + Domain tests") ┘
```

## Purpose

Enable parallel execution of agents as separate instances to improve throughput for batch operations and independent tasks.

## Core Concept

Each agent (except orchestrators) can be instantiated multiple times to work on independent tasks in parallel.

```
Agent (Template)
    │
    ├── Instance 1 → Task A
    ├── Instance 2 → Task B
    ├── Instance 3 → Task C
    └── Instance 4 → Task D
```

## Rules

### 1. Maximum Parallel Instances

```yaml
limit: 4
reason: Balance between throughput and resource usage
```

### 2. Exclusions

```yaml
not_parallelizable:
  - orchestrator/* (must remain singleton for coordination)

reason: |
  Orchestrator agents manage other agents and must maintain
  a single point of coordination to prevent conflicts.
```

### 3. Instance Independence

```yaml
requirements:
  - Tasks must be independent (no shared state)
  - No cross-instance communication required
  - Each instance has isolated context
```

## Instance Model

### Instantiation

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Template                         │
│  (agents/{type}/{name}/)                                │
├─────────────────────────────────────────────────────────┤
│  AGENT.md    - Role definition                          │
│  index.yaml  - Configuration                            │
│  refs/       - Skill/guide references                   │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Instance #1  │ │ Instance #2  │ │ Instance #3  │
│   Task: A    │ │   Task: B    │ │   Task: C    │
│ Context: ... │ │ Context: ... │ │ Context: ... │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Instance Properties

```yaml
instance:
  id: "{agent-name}-{uuid}"
  template: "{agent-path}"
  task: "{assigned-task}"
  context: "{isolated-context}"
  status: "pending|running|completed|failed"
```

## Usage Patterns

### Batch Agent Creation

```
User: "Create golang, python, rust, typescript expert agents"

Orchestrator (secretary):
  │
  ├── [golang-expert] creator instance #1
  ├── [python-expert] creator instance #2
  ├── [rust-expert] creator instance #3
  └── [typescript-expert] creator instance #4

Execution: Parallel (4 instances)
```

### Batch Code Review

```
User: "/dev:review src/*.go src/*.py src/*.ts"

Orchestrator:
  │
  ├── [src/*.go] golang-expert instance #1
  ├── [src/*.py] python-expert instance #2
  └── [src/*.ts] typescript-expert instance #3

Execution: Parallel (3 instances)
```

### Batch Audit

```
User: "Audit all agents"

Orchestrator (secretary):
  │
  ├── [agent-1] supplier instance #1
  ├── [agent-2] supplier instance #2
  ├── [agent-3] supplier instance #3
  └── [agent-4] supplier instance #4

Execution: Parallel (4 instances, batched if > 4)
```

## Coordination

### Task Distribution

```yaml
strategy: round_robin
max_instances: 4
queue: remaining tasks wait for available instance
```

### Result Aggregation

```
Instance Results:
  #1: ✓ Success (agent-a created)
  #2: ✓ Success (agent-b created)
  #3: ✗ Failed (agent-c: skill not found)
  #4: ✓ Success (agent-d created)

Aggregated Result:
  Total: 4 tasks
  Succeeded: 3
  Failed: 1
  Details: [...]
```

## Implementation Notes

### For Orchestrators

```yaml
responsibilities:
  - Identify parallelizable tasks
  - Spawn instances (max 4)
  - Monitor instance status
  - Aggregate results
  - Handle failures
```

### For Worker/Manager Agents

```yaml
requirements:
  - Stateless task execution
  - Isolated context per instance
  - No shared mutable state
  - Clear success/failure reporting
```

## Display Format

When parallel execution occurs:

```
┌─ Agent: secretary (orchestrator)
└─ Task: Batch agent creation

[Parallel] Spawning 4 instances...

[Instance 1] creator → golang-expert
[Instance 2] creator → python-expert
[Instance 3] creator → rust-expert
[Instance 4] creator → typescript-expert

[Progress] ████████░░░░ 2/4

[Instance 1] ✓ golang-expert created
[Instance 2] ✓ python-expert created
[Instance 3] ✓ rust-expert created
[Instance 4] ✓ typescript-expert created

[Summary] 4/4 tasks completed successfully
```

## Benefits

1. **Throughput**: N tasks complete in ~1/N time
2. **Efficiency**: Better resource utilization
3. **User Experience**: Faster batch operations
4. **Scalability**: Handles large workloads

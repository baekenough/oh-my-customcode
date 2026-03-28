---
name: task-decomposition
description: Auto-decompose large tasks into DAG-compatible parallel subtasks
scope: core
context: fork
user-invocable: false
---

# Task Decomposition Skill

Analyzes task complexity and decomposes large tasks into smaller, parallelizable subtasks compatible with the DAG orchestration skill. The orchestrator uses this as a planning frontend before execution.

## Trigger Conditions

Decomposition is **recommended** when any of these thresholds are met:

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| Estimated duration | > 30 minutes | Too long for single agent |
| Files affected | > 3 files | Parallelizable across files |
| Domains involved | > 2 domains | Requires multiple specialists |
| Agent types needed | > 2 types | Cross-specialty coordination |

### Step 0: Pattern Selection

Before decomposing, select the appropriate workflow pattern:

| Pattern | When to Use | Primitive |
|---------|-------------|-----------|
| Sequential | Steps must execute in order, each depends on previous | dag-orchestration (linear) |
| Parallel | Independent subtasks with no shared state | Agent tool (R009) or Agent Teams (R018) |
| Evaluator-Optimizer | Quality-critical output needing iterative refinement | worker-reviewer-pipeline |
| Orchestrator | Complex multi-step with dynamic routing | Routing skills (secretary/dev-lead/de-lead/qa-lead) |

**Decision**: If task has independent subtasks → Parallel. If quality-critical → add EO review cycle. If multi-step with dependencies → Sequential/Orchestrator.

## Decomposition Process

```
1. Analyze task scope
   ├── Estimate duration, file count, domains
   ├── Identify required agent types
   └── Check trigger thresholds

2. If thresholds met → decompose:
   ├── Break into atomic subtasks (single agent, single concern)
   ├── Identify dependencies between subtasks
   ├── Map subtasks to agents (use routing skills)
   └── Generate DAG workflow spec

3. Present plan to user (R015 transparency)
   ├── Show decomposed subtasks with agents
   ├── Show dependency graph
   ├── Show estimated parallel execution time
   └── Request confirmation before execution

4. Execute via dag-orchestration skill
```

## Decomposition Heuristics

### By File Independence
```
Task: "Update auth module across 5 files"
  ├── auth.ts → lang-typescript-expert
  ├── middleware.ts → lang-typescript-expert
  ├── config.ts → lang-typescript-expert (independent)
  ├── auth.test.ts → qa-engineer (depends: auth.ts)
  └── README.md → arch-documenter (depends: all above)

DAG: [auth.ts, middleware.ts, config.ts] → auth.test.ts → README.md
```

### By Domain Separation
```
Task: "Add user profile feature with API and UI"
  ├── API endpoint → be-express-expert
  ├── Database schema → db-postgres-expert
  ├── Frontend component → fe-vercel-agent
  └── Integration test → qa-engineer

DAG: [API, DB] → Frontend → Integration test
     (API and DB are independent, Frontend needs both)
```

### By Layer
```
Task: "Implement order processing in Spring Boot"
  ├── Domain model → lang-kotlin-expert
  ├── Repository → be-springboot-expert (depends: domain)
  ├── Service → be-springboot-expert (depends: domain, repository)
  ├── Controller → be-springboot-expert (depends: service)
  └── Tests → qa-engineer (depends: all)

DAG: domain → [repository] → service → controller → tests
```

## Output Format

### Decomposition Plan
```
[Task Decomposition]
├── Original: "Add user authentication with JWT"
├── Complexity: High (4 files, 3 domains, ~45 min)
├── Decomposed into 5 subtasks:
│
│   [1] analyze (Explore:haiku)
│       Scan codebase for existing auth patterns
│
│   [2] implement-auth (lang-typescript-expert:sonnet)
│       Implement JWT signing and validation
│       Depends: [1]
│
│   [3] implement-middleware (lang-typescript-expert:sonnet)
│       Create auth middleware
│       Depends: [1]
│
│   [4] write-tests (qa-engineer:sonnet)
│       Write auth tests
│       Depends: [2, 3]
│
│   [5] commit (mgr-gitnerd:sonnet)
│       Commit all changes
│       Depends: [4]
│
├── Parallel layers: 3 (max 2 concurrent in layer 2)
├── Estimated time: ~20 min (vs ~45 min sequential)
└── Proceed? [Y/n]
```

### Generated DAG Spec
```yaml
workflow:
  name: auto-decomposed-auth
  description: "Auto-decomposed: Add user authentication with JWT"

nodes:
  - id: analyze
    agent: Explore
    model: haiku
    prompt: "Scan codebase for existing auth patterns"
  - id: implement-auth
    agent: lang-typescript-expert
    model: sonnet
    prompt: "Implement JWT signing and validation"
    depends_on: [analyze]
  - id: implement-middleware
    agent: lang-typescript-expert
    model: sonnet
    prompt: "Create auth middleware"
    depends_on: [analyze]
  - id: write-tests
    agent: qa-engineer
    model: sonnet
    prompt: "Write auth tests"
    depends_on: [implement-auth, implement-middleware]
  - id: commit
    agent: mgr-gitnerd
    model: sonnet
    prompt: "Commit all changes"
    depends_on: [write-tests]

config:
  max_parallel: 4
  failure_strategy: stop
```

## Atomic Task Criteria

A subtask is **atomic** when it meets ALL of:
- Single agent can handle it
- Single concern (one logical change)
- Independently testable outcome
- < 15 minutes estimated duration
- < 3 files affected

If a subtask is not atomic → decompose further (max 2 levels deep).

## Skip Decomposition When

| Condition | Reason |
|-----------|--------|
| Single file edit | Already atomic |
| < 10 minutes estimated | Overhead not worth it |
| User explicitly requests "just do it" | User override |
| Single domain, single agent | No parallelization benefit |

## Integration

| Component | Integration |
|-----------|-------------|
| dag-orchestration | Generates DAG specs consumed by dag-orchestration |
| Routing skills | Uses dev-lead/de-lead/qa-lead routing for agent mapping |
| R009 | Maximizes parallelization within max-4 limit |
| R010 | Decomposition happens in orchestrator only |
| R015 | Plan displayed before execution for user approval |
| R018 | 3+ agents in plan → check Agent Teams eligibility |

---
name: dag-orchestration
description: YAML-based DAG workflow engine with topological execution and failure strategies
scope: core
context: fork
user-invocable: false
---

# DAG Orchestration Skill

Defines and executes directed acyclic graph (DAG) workflows. The orchestrator uses this skill to plan multi-step tasks with dependencies, execute them in topologically-sorted order, and handle failures.

**Orchestrator-only** — only the main conversation uses this skill (R010). Subagents execute individual nodes.

## Workflow Spec Format

```yaml
# .claude/workflows/<name>.yaml or inline in conversation
workflow:
  name: feature-implementation
  description: Implement a new feature with tests and docs

nodes:
  - id: analyze
    agent: Explore
    model: haiku
    prompt: "Analyze codebase for integration points"

  - id: implement
    agent: lang-typescript-expert
    model: sonnet
    prompt: "Implement the feature"
    depends_on: [analyze]

  - id: test
    agent: qa-engineer
    model: sonnet
    prompt: "Write and run tests"
    depends_on: [implement]

  - id: review
    agent: lang-typescript-expert
    model: opus
    prompt: "Code review"
    depends_on: [implement]

  - id: docs
    agent: arch-documenter
    model: sonnet
    prompt: "Update documentation"
    depends_on: [implement]

  - id: commit
    agent: mgr-gitnerd
    model: sonnet
    prompt: "Commit changes"
    depends_on: [test, review, docs]

config:
  max_parallel: 4          # R009 soft default (hard cap: 5)
  failure_strategy: stop   # stop | skip | retry
  retry_count: 2           # Max retries per node (if strategy=retry)
  timeout_per_node: 300    # Seconds per node (0 = no limit)
```

## Execution Algorithm — Kahn's Topological Sort

```
1. Parse workflow YAML
2. Build adjacency list and in-degree map
3. Validate: detect cycles (error if found)
4. Initialize queue with nodes where in-degree = 0
5. While queue is not empty:
   a. Dequeue up to max_parallel nodes
   b. Execute nodes in parallel via Task tool (R009)
   c. On completion:
      - Success → decrement in-degree of dependents
      - Failure → apply failure_strategy
   d. Stall check:
      - If running node duration > 2x average completed duration
      - AND pending nodes exist with in-degree = 0 (ignoring stalled node's edges)
      - THEN enqueue those independent nodes immediately (adaptive split)
   e. Enqueue newly-ready nodes (in-degree = 0)
6. Verify all nodes executed (detect unreachable nodes)
```

## Execution Rules

| Rule | Detail |
|------|--------|
| Max parallel | 5 concurrent nodes max, 4 default (R009) |
| Agent Teams gate | 3+ parallel nodes → check R018 eligibility |
| Orchestrator only | DAG scheduling runs in main conversation (R010) |
| Node execution | Each node = one Task tool call to specified agent |
| State tracking | `/tmp/.claude-dag-$PPID.json` |
| Stall detection | Running node > 2x avg completed duration → enqueue independent pending nodes early |

## Failure Strategies

| Strategy | Behavior |
|----------|----------|
| `stop` | Halt entire DAG on first failure (default) |
| `skip` | Mark failed node as skipped, continue dependents with warning |
| `retry` | Retry failed node up to `retry_count` times, then stop |

## State File Format

```json
{
  "workflow": "feature-implementation",
  "started_at": "2026-03-07T10:00:00Z",
  "status": "running",
  "nodes": {
    "analyze": {"status": "completed", "started": "...", "completed": "..."},
    "implement": {"status": "running", "started": "..."},
    "test": {"status": "pending"},
    "review": {"status": "pending"},
    "docs": {"status": "pending"},
    "commit": {"status": "blocked", "blocked_by": ["test", "review", "docs"]}
  },
  "execution_order": [["analyze"], ["implement"], ["test", "review", "docs"], ["commit"]]
}
```

## Display Format

```
[DAG] feature-implementation — 6 nodes
[Layer 0] analyze ← running
[Layer 1] implement ← pending (depends: analyze)
[Layer 2] test, review, docs ← pending (parallel, depends: implement)
[Layer 3] commit ← blocked (depends: test, review, docs)
```

Progress:
```
[DAG Progress] 3/6 nodes completed
  ✓ analyze (12s)
  ✓ implement (45s)
  → test (running)
  → review (running)
  → docs (running)
  ○ commit (blocked)
```

## Common Workflow Templates

### Feature Implementation
```yaml
nodes: [analyze → implement → [test, review, docs] → commit]
```

### Code Review + Fix
```yaml
nodes: [review → fix → re-review → commit]
failure_strategy: retry
```

### Multi-Language Project
```yaml
nodes: [
  analyze → [impl-frontend, impl-backend, impl-db] → integration-test → commit
]
```

### Refactoring
```yaml
nodes: [
  analyze → plan → [refactor-1, refactor-2, refactor-3] → test → review → commit
]
```

## Integration

| Rule | Integration |
|------|-------------|
| R009 | Max 4 parallel nodes; independent nodes MUST parallelize |
| R010 | DAG scheduler runs only in orchestrator |
| R015 | Display DAG plan before execution |
| R018 | 3+ parallel nodes → check Agent Teams eligibility |
| model-escalation | Node failures feed into task-outcome-recorder |
| stuck-recovery | Repeated node failures trigger stuck detection |

## Inline DAG

For ad-hoc workflows without a YAML file:

```
[DAG Plan]
1. analyze (Explore:haiku)
2. implement (lang-typescript-expert:sonnet) ← depends: 1
3. test (qa-engineer:sonnet) ← depends: 2
4. review (lang-typescript-expert:opus) ← depends: 2
5. commit (mgr-gitnerd:sonnet) ← depends: 3, 4

Execute? [Y/n]
```

The orchestrator builds the DAG from this inline format and executes using the same algorithm.

## State Management via tracker-checkpoint

Pipeline 상태는 `tracker-checkpoint` 에이전트로 위임됩니다.

### Flow

1. Pipeline 시작 → orchestrator가 tracker-checkpoint 호출 → 초기 state 파일 생성 (`/tmp/.claude-pipeline-{name}-{PPID}.json`)
2. 각 step 후 → tracker-checkpoint가 state 업데이트 (atomic write)
3. step 실패 → tracker-checkpoint가 halted 상태로 freeze
4. `/pipeline resume` → tracker-checkpoint가 state 로드 → orchestrator에 복원 옵션 제공

### Integration

- PPID-scoped state file 경로: `/tmp/.claude-pipeline-{name}-{PPID}.json`
- step 실행 전후로 tracker-checkpoint delegation
- resume 시 checkpoint → dag 재빌드 → 미완료 step부터 재개

See `.claude/agents/tracker-checkpoint.md` for agent spec.

## Limitations

- No cycles allowed (DAG = acyclic)
- Max 20 nodes per workflow (complexity guard)
- Nested DAGs not supported (flatten instead)
- Cross-workflow dependencies not supported

## External References

### Multica — Managed Agent Platform

> Reference: [Multica](https://github.com/multica-ai/multica) — managed agent platform for Claude Code/Codex.
> Verdict: INTEGRATE (external reference, not internalize)

Multica's task lifecycle pattern (enqueue → claim → start → complete/fail) is a useful reference for DAG node state management:

| Multica State | DAG Equivalent | Notes |
|---------------|---------------|-------|
| enqueue | pending | Node waiting for dependencies |
| claim | ready | Dependencies resolved, ready to execute |
| start | running | Agent spawned and executing |
| complete | completed | Node finished successfully |
| fail | failed | Node execution failed |

Consider this pattern when extending DAG node state tracking or implementing retry logic.

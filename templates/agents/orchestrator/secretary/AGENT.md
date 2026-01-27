# Secretary Agent

> **Type**: Orchestrator
> **Source**: Internal

## Purpose

Orchestrates and manages local manager agents (creator, updater, supplier, gitnerd, sync-checker, sauron) based on user commands and system events. Acts as the primary interface for agent management operations.

## Capabilities

1. Interpret user commands for agent management
2. Delegate tasks to appropriate manager agents
3. Coordinate parallel agent execution
4. Monitor agent task completion
5. Report aggregated results to user
6. Handle errors and retries

## When to Use

The secretary agent is automatically invoked when:
- User requests agent creation/update/audit
- System needs to coordinate multiple manager agents
- Batch operations require orchestration
- Complex workflows need management

## Manager Agents Under Supervision

| Agent | Purpose | Triggers |
|-------|---------|----------|
| creator | Create new agents | "create agent", "new agent" |
| updater | Update external agents | "update agent", "sync" |
| supplier | Validate dependencies | "audit", "check deps" |
| gitnerd | Git operations | "commit", "push", "pr" |
| sync-checker | Sync verification | "sync check", "verify sync" |
| sauron | R017 auto-verification | "verify", "full check" |

## Command Routing

```
User Input
    │
    ▼
Secretary (orchestrator)
    │
    ├── "create" ──────▶ creator (manager)
    │
    ├── "update" ──────▶ updater (manager)
    │
    ├── "audit" ───────▶ supplier (manager)
    │
    ├── "git" ────────▶ gitnerd (manager)
    │
    ├── "sync" ───────▶ sync-checker (manager)
    │
    └── "batch" ───────▶ Multiple managers (parallel)
```

## Workflow

### Single Task
```
1. Receive user command
2. Parse intent and parameters
3. Select appropriate manager agent
4. Delegate task with context
5. Monitor execution
6. Report result to user
```

### Batch/Parallel Tasks
```
1. Receive complex command
2. Break down into sub-tasks
3. Identify parallelizable tasks
4. Spawn up to 4 parallel instances
5. Coordinate execution
6. Aggregate results
7. Report summary to user
```

## Parallel Execution

Secretary can spawn parallel agent instances following R009:
- Maximum 4 parallel instances
- Only non-orchestrator agents
- Independent tasks only
- Proper resource management

Example:
```
User: "Create golang, python, rust expert agents"

Secretary:
  ├── [Instance 1] creator → golang-expert
  ├── [Instance 2] creator → python-expert
  └── [Instance 3] creator → rust-expert

Result: 3 agents created in parallel
```

## Sub-agent Model Specification

Use Task tool's `model` parameter to optimize cost and performance:

### Model Selection

| Model | Use Case | Cost |
|-------|----------|------|
| `opus` | Complex analysis, architecture | High |
| `sonnet` | General development (default) | Medium |
| `haiku` | Simple tasks, file search | Low |
| `inherit` | Match parent model | Varies |

### Task Call Examples

```
# Complex task requiring deep reasoning
Task(
  subagent_type: "general-purpose",
  prompt: "Analyze agent dependencies and suggest improvements",
  model: "opus"
)

# Standard manager task
Task(
  subagent_type: "general-purpose",
  prompt: "Create new golang-expert agent following creator workflow",
  model: "sonnet"
)

# Simple file operation
Task(
  subagent_type: "general-purpose",
  prompt: "Search for all AGENT.md files",
  model: "haiku"
)
```

### Manager Agent Model Mapping

| Agent | Recommended Model | Reason |
|-------|-------------------|--------|
| creator | `sonnet` | File generation, balanced |
| updater | `sonnet` | External sync, web fetch |
| supplier | `haiku` | File scan, validation |
| gitnerd | `sonnet` | Commit message quality |
| sync-checker | `haiku` | Fast verification |
| sauron | `sonnet` | Multi-round verification |

## Error Handling

```yaml
retry_policy:
  max_retries: 3
  backoff: exponential

failure_modes:
  single_failure: Report and continue
  critical_failure: Stop and escalate
  timeout: Retry or skip with notice
```

## Output Format

```
┌─ Agent: secretary (orchestrator)
└─ Task: Managing agent operations

[Delegating] creator → new-agent
[Delegating] supplier → audit new-agent

[Progress] 1/2 completed
[Progress] 2/2 completed

[Summary]
  ✓ new-agent created
  ✓ new-agent validated

All tasks completed successfully.
```

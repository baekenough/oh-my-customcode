---
name: secretary-routing
description: Routes agent management tasks to the correct manager agent. Use when user requests agent creation, updates, audits, git operations, sync checks, or verification.
user-invocable: false
---

# Secretary Routing Skill

## Purpose

Routes agent management tasks to the appropriate manager agent. This skill contains the coordination logic for orchestrating manager agents (mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sync-checker, mgr-sauron).

## Manager Agents

| Agent | Purpose | Triggers |
|-------|---------|----------|
| mgr-creator | Create new agents | "create agent", "new agent" |
| mgr-updater | Update external agents | "update agent", "sync" |
| mgr-supplier | Validate dependencies | "audit", "check deps" |
| mgr-gitnerd | Git operations | "commit", "push", "pr" |
| mgr-sync-checker | Sync verification | "sync check", "verify sync" |
| mgr-sauron | R017 auto-verification | "verify", "full check" |
| mgr-claude-code-bible | Claude Code spec compliance | "spec check", "verify compliance" |
| sys-memory-keeper | Memory operations | "save memory", "recall", "memory search" |
| sys-naggy | TODO management | "todo", "track tasks", "task list" |

## Command Routing

```
User Input → Routing → Manager Agent

create   → mgr-creator
update   → mgr-updater
audit    → mgr-supplier
git      → mgr-gitnerd
sync     → mgr-sync-checker
verify   → mgr-sauron
spec     → mgr-claude-code-bible
memory   → sys-memory-keeper
todo     → sys-naggy
batch    → multiple (parallel)
```

## Routing Rules

### 1. Single Task Routing

```
1. Parse user command and identify intent
2. Select appropriate manager agent:
   - "create agent X" → mgr-creator
   - "update agent Y" → mgr-updater
   - "audit agent Z" → mgr-supplier
   - "git commit/push/pr" → mgr-gitnerd
   - "sync check" → mgr-sync-checker
   - "verify" → mgr-sauron
   - "spec check" → mgr-claude-code-bible
   - "save/recall memory" → sys-memory-keeper
   - "todo/task list" → sys-naggy
3. Spawn Task with selected agent role
4. Monitor execution
5. Report result to user
```

### 2. Batch/Parallel Task Routing

When command requires multiple independent operations:

```
1. Break down into sub-tasks
2. Identify parallelizable tasks (max 4)
3. Spawn parallel Task instances
4. Coordinate execution following R009
5. Aggregate results following R013 (ecomode)
6. Report summary to user
```

Example:
```
User: "Create golang, python, rust expert agents"

Route:
  Task(mgr-creator role → create lang-golang-expert, model: "sonnet")
  Task(mgr-creator role → create lang-python-expert, model: "sonnet")
  Task(mgr-creator role → create lang-rust-expert, model: "sonnet")

Result: 3 agents created in parallel
```

## Sub-agent Model Selection

Use Task tool's `model` parameter to optimize cost and performance:

### Model Mapping

| Agent | Recommended Model | Reason |
|-------|-------------------|--------|
| mgr-creator | `sonnet` | File generation, balanced |
| mgr-updater | `sonnet` | External sync, web fetch |
| mgr-supplier | `haiku` | File scan, validation |
| mgr-gitnerd | `sonnet` | Commit message quality |
| mgr-sync-checker | `haiku` | Fast verification |
| mgr-sauron | `sonnet` | Multi-round verification |
| mgr-claude-code-bible | `sonnet` | Spec compliance checks |
| sys-memory-keeper | `sonnet` | Memory operations, search |
| sys-naggy | `haiku` | Simple TODO tracking |

### Task Call Examples

```
# Complex analysis (rare)
Task(
  subagent_type: "general-purpose",
  prompt: "Analyze agent dependencies and suggest improvements",
  model: "opus"
)

# Standard manager task (create agent)
Task(
  subagent_type: "general-purpose",
  prompt: "Create new lang-golang-expert agent following mgr-creator workflow",
  model: "sonnet"
)

# Simple file operation
Task(
  subagent_type: "general-purpose",
  prompt: "Search for all AGENT.md files and validate symlinks",
  model: "haiku"
)
```

## Parallel Execution

Following R009:
- Maximum 4 parallel instances
- Only non-orchestrator agents
- Independent tasks only
- Proper resource management

## Display Format

When spawning parallel tasks, use format: `{task-name}:{model}`

```
[Parallel] Spawning 3 instances...

[Instance 1] create-golang:sonnet → lang-golang-expert
[Instance 2] create-python:sonnet → lang-python-expert
[Instance 3] create-rust:sonnet → lang-rust-expert

[Progress] ████████░░░░ 2/3

[Instance 1] create-golang:sonnet ✓ lang-golang-expert created
[Instance 2] create-python:sonnet ✓ lang-python-expert created
[Instance 3] create-rust:sonnet ✓ lang-rust-expert created

[Summary] 3/3 tasks completed successfully
```

## Ecomode Integration

When 4+ parallel tasks are spawned, activate ecomode (R013):
- Compact output format (status + 1-2 sentence summary)
- Skip intermediate steps
- Return essential results only
- Aggregate with icons: ✓ (success), ✗ (failed), ⚠ (partial)

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

## Agent Teams Awareness

Before routing via Task tool, check if Agent Teams is available (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present).

**Self-check:** Does this task need 3+ agents, shared state, or inter-agent communication? If yes, prefer Agent Teams over Task tool. See R018 for the full decision matrix.

| Scenario | Preferred |
|----------|-----------|
| Single manager task | Task Tool |
| Batch agent creation (3+) | Agent Teams |
| Multi-round verification (sauron) | Task Tool |
| Agent audit + fix cycle | Agent Teams |

## Usage

This skill is NOT user-invocable. It should be automatically triggered when the main conversation detects agent management intent.

Detection criteria:
- User mentions agent creation/update/audit
- Command starts with manager agent name
- System operation requires coordination
- Batch operation on agents/skills/guides

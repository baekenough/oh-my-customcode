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
2. Select appropriate manager agent
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
4. Aggregate results
5. Report summary to user
```

## Sub-agent Model Selection

| Agent | Recommended Model | Reason |
|-------|-------------------|--------|
| mgr-creator | sonnet | File generation, balanced |
| mgr-updater | sonnet | External sync, web fetch |
| mgr-supplier | haiku | File scan, validation |
| mgr-gitnerd | sonnet | Commit message quality |
| mgr-sync-checker | haiku | Fast verification |
| mgr-sauron | sonnet | Multi-round verification |
| mgr-claude-code-bible | sonnet | Spec compliance checks |
| sys-memory-keeper | sonnet | Memory operations, search |
| sys-naggy | haiku | Simple TODO tracking |

## Usage

This skill is NOT user-invocable. It is automatically triggered when the main conversation detects agent management intent.

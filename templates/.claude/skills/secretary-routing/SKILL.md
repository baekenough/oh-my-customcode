---
name: secretary-routing
description: Routes agent management tasks to the correct manager agent. Use when user requests agent creation, updates, audits, git operations, or verification.
scope: core
user-invocable: false
context: fork
---

# Secretary Routing Skill

## Purpose

Routes agent management tasks to the appropriate manager agent. This skill contains the coordination logic for orchestrating manager agents (mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron).

## Manager Agents

| Agent | Purpose | Triggers |
|-------|---------|----------|
| mgr-creator | Create new agents | "create agent", "new agent" |
| mgr-updater | Update external agents | "update agent", "sync" |
| mgr-supplier | Validate dependencies | "audit", "check deps" |
| mgr-gitnerd | Git operations | "commit", "push", "pr" |
| mgr-sauron | R017 auto-verification | "verify", "full check" |
| mgr-claude-code-bible | Claude Code spec compliance | "spec check", "verify compliance" |
| sys-memory-keeper | Memory operations | "save memory", "recall", "memory search" |
| sys-naggy | TODO management | "todo", "track tasks", "task list" |

## Routing Decision (Priority Order)

Before routing via Task tool, evaluate Agent Teams eligibility first:

**Self-check:** Does this task need 3+ agents, shared state, or inter-agent communication? If yes, prefer Agent Teams over Task tool. See R018 for the full decision matrix.

| Scenario | Preferred |
|----------|-----------|
| Single manager task | Task Tool |
| Batch agent creation (3+) | Agent Teams |
| Multi-round verification (sauron) | Task Tool |
| Agent audit + fix cycle | Agent Teams |

## Command Routing

```
User Input → Routing → Manager Agent

create   → mgr-creator
update   → mgr-updater
audit    → mgr-supplier
git      → mgr-gitnerd
verify   → mgr-sauron
spec     → mgr-claude-code-bible
memory   → sys-memory-keeper
todo            → sys-naggy
improve-report  → omcustom-improve-report (skill invocation)
auto-improve    → omcustom-auto-improve (skill invocation)
batch           → multiple (parallel)
```

**improve-report keywords**: "improve-report", "improvement", "개선", "개선 리포트", "improve" → invoke `omcustom-improve-report` skill (read-only, no agent delegation needed)

**auto-improve keywords**: "auto-improve", "자동 개선", "개선 적용", "apply improvements", "improvement suggestions" → invoke `omcustom-auto-improve` skill (worktree isolation, sauron verification, PR creation)

### Ontology-RAG Enrichment (R019)

If `get_agent_for_task` MCP tool is available, call it with the original query and inject `suggested_skills` into the agent prompt. Skip silently on failure.

### Step 5: Soul Injection (R006)

If the selected agent has `soul: true` in frontmatter, read and prepend `.claude/agents/souls/{agent-name}.soul.md` content to the prompt. Skip silently if file doesn't exist.

## Routing Rules

### 1. Single Task Routing

```
1. Parse user command and identify intent
2. Select appropriate manager agent
3. Spawn Task with selected agent role
4. Monitor execution
5. Report result to user
```

> **Permission Mode**: When spawning agents, pass `mode: "bypassPermissions"` in the Agent tool call if the session uses bypassPermissions. Without explicit mode, CC defaults to `acceptEdits`.

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
| mgr-sauron | sonnet | Multi-round verification |
| mgr-claude-code-bible | sonnet | Spec compliance checks |
| sys-memory-keeper | sonnet | Memory operations, search |
| sys-naggy | haiku | Simple TODO tracking |

## No Match Fallback

When no manager agent matches the request but the task is clearly management-related:

```
User Input → No matching manager agent
  ↓
Evaluate: Is this a specialized management/tooling task?
  YES → Delegate to mgr-creator with context:
        domain: detected tool/technology
        type: manager
        skills: auto-discover from .claude/skills/
  NO  → Ask user for clarification
```

**Examples of dynamic creation triggers:**
- New CI/CD tool management (e.g., "ArgoCD 배포 관리해줘")
- New monitoring tool setup (e.g., "Grafana 대시보드 관리")
- Unfamiliar package manager operations

## Usage

This skill is NOT user-invocable. It is automatically triggered when the main conversation detects agent management intent.

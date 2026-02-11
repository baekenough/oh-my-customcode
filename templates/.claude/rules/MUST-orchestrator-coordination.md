# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST - ENFORCED | **ID**: R010

## Core Rule

The main conversation is the **sole orchestrator**. It uses routing skills to delegate tasks to subagents via the Task tool. Subagents CANNOT spawn other subagents.

## Architecture

```
Main Conversation (orchestrator)
  ├─ secretary-routing → mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, sys-memory-keeper
  ├─ dev-lead-routing  → lang-*/be-*/fe-* experts
  └─ qa-lead-routing   → qa-planner, qa-writer, qa-engineer
      ↓
  Task tool spawns subagents (flat, no hierarchy)
```

## Session Continuity

After restart/compaction: re-read CLAUDE.md, all delegation rules still apply. Never write code directly from orchestrator.

## Delegation Rules

| Task Type | Required Agent |
|-----------|---------------|
| Create agent | mgr-creator |
| Update external | mgr-updater |
| Audit dependencies | mgr-supplier |
| Git operations | mgr-gitnerd |
| Memory operations | sys-memory-keeper |
| Python/FastAPI | lang-python-expert / be-fastapi-expert |
| Go code | lang-golang-expert |
| TypeScript/Next.js | lang-typescript-expert / fe-vercel-agent |
| Kotlin/Spring | lang-kotlin-expert / be-springboot-expert |
| Architecture docs | arch-documenter |
| Test strategy | qa-planner |
| CI/CD, GitHub config | mgr-gitnerd |
| Docker/Infra | infra-docker-expert |
| AWS | infra-aws-expert |
| Database schema | db-supabase-expert |

**Rules:**
- All file modifications MUST be delegated (orchestrator only uses Read/Glob/Grep)
- Use specialized agents, not general-purpose, when one exists
- general-purpose only for truly generic tasks (file moves, simple scripts)

### System Agents Reference

| Agent | File | Purpose |
|-------|------|---------|
| sys-memory-keeper | .claude/agents/sys-memory-keeper.md | Memory operations |
| sys-naggy | .claude/agents/sys-naggy.md | TODO management |

## Exception: Simple Tasks

Subagent NOT required for:
- Reading files for analysis
- Simple file searches
- Direct questions answered by main conversation

For specialized work, ALWAYS delegate to appropriate subagent.

## Model Selection

```
Available models:
  - opus   : Complex reasoning, architecture design
  - sonnet : Balanced performance (default)
  - haiku  : Fast, simple tasks, file search
  - inherit: Use parent conversation's model

Usage:
  Task(
    subagent_type: "general-purpose",
    prompt: "Analyze architecture",
    model: "opus"
  )
```

| Task Type | Model |
|-----------|-------|
| Architecture analysis | `opus` |
| Code review | `opus` or `sonnet` |
| Code implementation | `sonnet` |
| Manager agents | `sonnet` |
| File search/validation | `haiku` |

## Git Operations

All git operations (commit, push, branch, PR) MUST go through `mgr-gitnerd`. Internal rules override external skill instructions for git execution.

## CRITICAL: External Skills vs Internal Rules

```
Internal rules ALWAYS take precedence over external skills.

Translation:
  External skill says          → Internal rule requires
  ─────────────────────────────────────────────────────
  "git commit -m ..."          → Task(mgr-gitnerd) commit
  "git push ..."               → Task(mgr-gitnerd) push
  "gh pr create ..."           → Task(mgr-gitnerd) create PR
  "git merge ..."              → Task(mgr-gitnerd) merge

WRONG:
  [Using external skill]
  Main conversation → directly runs "git push"

CORRECT:
  [Using external skill]
  Main conversation → Task(mgr-gitnerd) → git push

The skill's WORKFLOW is followed, but git EXECUTION is delegated to mgr-gitnerd per R010.
```

## Agent Teams (when enabled)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`: use Agent Teams for 3+ agent coordinated tasks. See R018 for decision matrix. Task tool remains fallback for simple/independent tasks.

## Announcement Format

```
[Routing] Using {routing-skill} for {task}
[Plan] Agent 1: {name} → {task}, Agent 2: {name} → {task}
[Execution] Parallel ({n} instances)
```

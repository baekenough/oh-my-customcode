# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST - ENFORCED for multi-agent tasks
> **ID**: R010
> **Violation**: Direct agent execution without orchestrator = Rule violation

## CRITICAL

**When a task requires multiple agents, the APPROPRIATE orchestrator MUST coordinate.**

### Session Continuity (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  AFTER SESSION RESTART / CONTEXT COMPACTION:                     ║
║                                                                   ║
║  1. Re-read CLAUDE.md and rules IMMEDIATELY                      ║
║  2. Agent delegation rules STILL APPLY                           ║
║  3. Orchestrator must NOT execute work directly                  ║
║  4. Must spawn Task agents for actual work                       ║
║                                                                   ║
║  WRONG after session restart:                                    ║
║    dev-lead → directly runs Bash/Edit/Write                     ║
║                                                                   ║
║  CORRECT after session restart:                                  ║
║    dev-lead → Task(springboot-expert) → runs Bash/Edit/Write    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Orchestrator Direct Action Prohibition (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  ORCHESTRATORS (secretary, dev-lead) MUST NOT:                   ║
║                                                                   ║
║  ✗ Directly run Bash commands for code/build tasks              ║
║  ✗ Directly Edit/Write source code files                        ║
║  ✗ Directly modify project configuration                        ║
║                                                                   ║
║  ORCHESTRATORS MUST:                                             ║
║                                                                   ║
║  ✓ Analyze task and identify required agents                    ║
║  ✓ Spawn Task agents with appropriate expert roles              ║
║  ✓ Aggregate results from spawned agents                        ║
║  ✓ Report summary to user                                       ║
║                                                                   ║
║  Only allowed direct tools: Read, Glob, Grep (for analysis)     ║
╚══════════════════════════════════════════════════════════════════╝
```

### Orchestrator Role Separation (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  WHICH ORCHESTRATOR TO USE?                                      ║
║                                                                   ║
║  Task Domain                    → Orchestrator                   ║
║  ─────────────────────────────────────────────────               ║
║  Agent creation/update/audit    → secretary                      ║
║  Code review/refactoring        → dev-lead                       ║
║  Feature implementation         → dev-lead                       ║
║  Multi-language development     → dev-lead                       ║
║  Manager agent coordination     → secretary                      ║
║  SW/Backend engineer tasks      → dev-lead                       ║
║                                                                   ║
║  WRONG: secretary directing kotlin-expert for code work         ║
║  RIGHT: dev-lead directing kotlin-expert for code work          ║
╚══════════════════════════════════════════════════════════════════╝
```

### Orchestrator Responsibilities

| Orchestrator | Supervises | Handles |
|--------------|------------|---------|
| **secretary** | manager/* (creator, updater, supplier, memory-keeper) | Agent management, system operations |
| **dev-lead** | sw-engineer/*, sw-engineer/backend/* | Development, code review, implementation |

```
Multi-agent detection:
- Task spans multiple domains (frontend + backend)
- Task requires different expertise (golang + python)
- Task involves batch operations on different resources

If multi-agent needed → secretary MUST coordinate
```

## Coordination Flow

```
CORRECT:
User Request
    │
    ▼
┌─────────────────────────────┐
│  secretary (orchestrator)    │
│  - Analyzes task             │
│  - Identifies required agents│
│  - Plans execution           │
└─────────────┬───────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
[Agent-1] [Agent-2] [Agent-3]
    │         │         │
    └─────────┼─────────┘
              ▼
┌─────────────────────────────┐
│  secretary (orchestrator)    │
│  - Aggregates results        │
│  - Reports to user           │
└─────────────────────────────┘

WRONG:
User Request
    │
    ▼
[Agent-1] → [Agent-2] → [Agent-3]
(No coordination, ad-hoc execution)
```

## Secretary Responsibilities

```yaml
before_execution:
  - Analyze user request
  - Identify required agents
  - Check agent availability
  - Plan execution order (parallel vs sequential)
  - Announce coordination plan

during_execution:
  - Spawn agent instances
  - Monitor progress
  - Handle failures
  - Coordinate dependencies

after_execution:
  - Aggregate results
  - Report summary to user
  - Clean up resources
```

## Announcement Format

Secretary MUST announce before delegating:

```
┌─ Agent: secretary (orchestrator)
└─ Task: Coordinating multi-agent task

[Plan]
├── Agent 1: golang-expert → Review Go code
├── Agent 2: python-expert → Review Python code
└── Agent 3: typescript-expert → Review TS code

[Execution] Parallel (3 instances)

Spawning agents...
```

## When to Use Orchestrator

| Scenario | Orchestrator Required |
|----------|----------------------|
| Single domain, single file | No |
| Single domain, multiple files | Maybe (if parallel) |
| Multiple domains | **Yes** |
| Batch operations | **Yes** |
| Complex workflow | **Yes** |

## Exception: Simple Tasks

Orchestrator NOT required for:
- Single file operations
- Single domain questions
- Direct tool usage (Read, Write, etc.)

These can be handled by the appropriate agent directly.

## CRITICAL: Use Specialized Manager Agents

**When a task matches a manager agent's purpose, you MUST delegate to that agent.**

```
╔══════════════════════════════════════════════════════════════════╗
║  MANAGER AGENT DELEGATION (MANDATORY)                            ║
║                                                                   ║
║  Task Type              → Required Agent                         ║
║  ─────────────────────────────────────────────────               ║
║  Create new agent       → creator                                ║
║  Update external agent  → updater                                ║
║  Audit dependencies     → supplier                               ║
║  Memory operations      → memory-keeper                          ║
║                                                                   ║
║  DO NOT use general-purpose agents for these tasks.              ║
║  DO NOT have secretary do the work directly.                     ║
╚══════════════════════════════════════════════════════════════════╝
```

### Correct Delegation Pattern

```
User: "java21-expert 에이전트를 만들어줘"

WRONG:
  secretary → Task(general-purpose) → creates files directly

CORRECT:
  secretary → Task(creator agent role) → follows creator workflow
```

### Manager Agents Reference

| Agent | Location | Purpose |
|-------|----------|---------|
| creator | agents/manager/creator/ | Create new agents |
| updater | agents/manager/updater/ | Update external sources |
| supplier | agents/manager/supplier/ | Audit dependencies |
| gitnerd | agents/manager/gitnerd/ | Git operations (commit, push, PR) |
| sync-checker | agents/manager/sync-checker/ | Documentation sync verification |

### System Agents Reference

| Agent | Location | Purpose |
|-------|----------|---------|
| memory-keeper | agents/system/memory-keeper/ | Memory operations |
| naggy | agents/system/naggy/ | TODO management |

## CRITICAL: Use Specialized Expert Agents for Code Work

```
╔══════════════════════════════════════════════════════════════════╗
║  CODE WORK MUST USE SPECIALIZED EXPERT AGENTS                    ║
║                                                                   ║
║  Language/Framework           → Required Agent                   ║
║  ─────────────────────────────────────────────────               ║
║  Python/FastAPI backend       → python-expert or fastapi-expert  ║
║  TypeScript/Next.js frontend  → typescript-expert or vercel-agent║
║  Go code                      → golang-expert                    ║
║  Kotlin/Spring                → kotlin-expert or springboot-expert║
║                                                                   ║
║  WRONG:                                                          ║
║    secretary → Task(general-purpose) → writes Python code        ║
║                                                                   ║
║  CORRECT:                                                        ║
║    secretary → Task(python-expert) → writes Python code          ║
║                                                                   ║
║  general-purpose should ONLY be used when:                       ║
║  - No specialized agent exists for the task                      ║
║  - Task is truly generic (file moves, simple scripts)            ║
╚══════════════════════════════════════════════════════════════════╝
```

## CRITICAL: Git Operations Delegation

```
╔══════════════════════════════════════════════════════════════════╗
║  GIT OPERATIONS MUST BE DELEGATED TO gitnerd                    ║
║                                                                   ║
║  WRONG:                                                          ║
║    secretary/dev-lead → directly runs git commit/push            ║
║                                                                   ║
║  CORRECT:                                                        ║
║    secretary → Task(gitnerd) → git commit/push                   ║
║                                                                   ║
║  gitnerd handles:                                                ║
║  ✓ git commit (with proper message format)                       ║
║  ✓ git push                                                      ║
║  ✓ git branch operations                                        ║
║  ✓ PR creation                                                   ║
║                                                                   ║
║  This ensures:                                                   ║
║  - Consistent commit message format                              ║
║  - Safety checks before destructive operations                  ║
║  - Proper Co-Authored-By attribution                            ║
╚══════════════════════════════════════════════════════════════════╝
```

## Enforcement

```
Violation examples:
✗ Reviewing Go + Python + TypeScript without secretary
✗ Creating multiple agents without coordination plan
✗ Running parallel tasks without announcing execution plan

Correct examples:
✓ Secretary announces plan, spawns agents, aggregates results
✓ Clear execution plan with agent assignments
✓ Progress updates during multi-agent execution
```

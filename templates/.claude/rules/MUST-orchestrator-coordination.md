# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST - ENFORCED for multi-agent tasks
> **ID**: R010
> **Violation**: Direct agent execution without orchestrator = Rule violation

## CRITICAL

**The MAIN CONVERSATION is the sole orchestrator. It uses routing skills to delegate tasks to specialized subagents.**

### Flat Architecture (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  NEW ARCHITECTURE: FLAT, NO HIERARCHY                            ║
║                                                                   ║
║  Main Conversation (orchestrator)                                ║
║       │                                                          ║
║       ├─ Uses routing skills:                                    ║
║       │  • secretary-routing (agent/system tasks)                ║
║       │  • dev-lead-routing (development tasks)                  ║
║       │  • qa-lead-routing (QA tasks)                            ║
║       │                                                          ║
║       └─ Spawns subagents (Task tool):                           ║
║          ├─ mgr-creator, mgr-updater, mgr-supplier (manager agents) ║
║          ├─ lang-golang-expert, lang-python-expert (language experts) ║
║          └─ be-springboot-expert, be-fastapi-expert (framework experts) ║
║                                                                   ║
║  IMPORTANT: Subagents CANNOT spawn other subagents               ║
║            Only main conversation can spawn subagents            ║
╚══════════════════════════════════════════════════════════════════╝
```

### Session Continuity (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  AFTER SESSION RESTART / CONTEXT COMPACTION:                     ║
║                                                                   ║
║  1. Re-read CLAUDE.md and rules IMMEDIATELY                      ║
║  2. Agent delegation rules STILL APPLY                           ║
║  3. Main conversation uses routing skills to identify agents     ║
║  4. Spawn subagents with Task tool for actual work               ║
║                                                                   ║
║  WRONG after session restart:                                    ║
║    Main conversation → directly writes code/runs builds          ║
║                                                                   ║
║  CORRECT after session restart:                                  ║
║    Main conversation → Task(be-springboot-expert) → code/build   ║
╚══════════════════════════════════════════════════════════════════╝
```

### Routing Logic (MANDATORY)

```
╔══════════════════════════════════════════════════════════════════╗
║  HOW TO ROUTE TASKS                                              ║
║                                                                   ║
║  Task Domain                    → Routing Skill → Agent          ║
║  ──────────────────────────────────────────────────────────────  ║
║  Agent creation/update/audit    → secretary-routing → mgr-creator ║
║  Code review/refactoring        → dev-lead-routing → expert-*    ║
║  Feature implementation         → dev-lead-routing → expert-*    ║
║  Multi-language development     → dev-lead-routing → multiple    ║
║  System operations              → secretary-routing → manager    ║
║  QA/Testing tasks               → qa-lead-routing → qa-*         ║
║                                                                   ║
║  Routing skills contain the logic for:                           ║
║  • Which agent to use for which task                             ║
║  • When to spawn multiple agents in parallel                     ║
║  • How to aggregate results                                      ║
╚══════════════════════════════════════════════════════════════════╝
```

### Routing Skills

| Routing Skill | Manages | Handles |
|---------------|---------|---------|
| **secretary-routing** | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, sys-memory-keeper | Agent management, system operations |
| **dev-lead-routing** | language/framework experts | Development, code review, implementation |
| **qa-lead-routing** | qa-planner, qa-writer, qa-engineer | Testing, quality assurance |

```
Multi-agent detection (handled by routing skills):
- Task spans multiple domains (frontend + backend)
- Task requires different expertise (lang-golang + lang-python)
- Task involves batch operations on different resources

If multi-agent needed → Spawn multiple subagents in parallel
```

## Coordination Flow

```
CORRECT (Flat Architecture):
User Request
    │
    ▼
┌─────────────────────────────────┐
│  Main Conversation               │
│  - Analyzes task via routing     │
│  - Identifies required agents    │
│  - Plans execution               │
└─────────────┬───────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
[Subagent-1] [Subagent-2] [Subagent-3]
(spawned via Task tool)
    │         │         │
    └─────────┼─────────┘
              ▼
┌─────────────────────────────────┐
│  Main Conversation               │
│  - Aggregates results            │
│  - Reports to user               │
└─────────────────────────────────┘

WRONG (Hierarchical):
User Request
    │
    ▼
[Subagent-1] → spawns → [Subagent-2] → spawns → [Subagent-3]
(Subagents cannot spawn other subagents)

WRONG (No coordination):
User Request
    │
    ▼
[Agent-1] → [Agent-2] → [Agent-3]
(Sequential execution without planning)
```

## Main Conversation Responsibilities

```yaml
before_execution:
  - Analyze user request
  - Apply routing skill (secretary/dev-lead/qa-lead)
  - Identify required agents
  - Plan execution order (parallel vs sequential)
  - Announce coordination plan

during_execution:
  - Spawn subagent instances via Task tool
  - Monitor progress
  - Handle failures
  - Coordinate dependencies

after_execution:
  - Aggregate results
  - Report summary to user
  - Clean up resources
```

## Announcement Format

Main conversation MUST announce before delegating:

```
[Routing] Using dev-lead-routing for code review

[Plan]
├── Agent 1: lang-golang-expert → Review Go code
├── Agent 2: lang-python-expert → Review Python code
└── Agent 3: lang-typescript-expert → Review TS code

[Execution] Parallel (3 instances)

Spawning subagents...
```

## When to Spawn Subagents

| Scenario | Spawn Subagents? |
|----------|------------------|
| Single domain, single file | Maybe (if specialized agent needed) |
| Single domain, multiple files | Yes (if parallel beneficial) |
| Multiple domains | **Yes** |
| Batch operations | **Yes** |
| Complex workflow | **Yes** |

## Exception: Simple Tasks

Subagent NOT required for:
- Reading files for analysis
- Simple file searches
- Direct questions answered by main conversation

For specialized work, ALWAYS delegate to appropriate subagent.

## CRITICAL: Use Specialized Manager Agents

**When a task matches a manager agent's purpose, you MUST delegate to that agent.**

```
╔══════════════════════════════════════════════════════════════════╗
║  MANAGER AGENT DELEGATION (MANDATORY)                            ║
║                                                                   ║
║  Task Type              → Required Agent                         ║
║  ─────────────────────────────────────────────────               ║
║  Create new agent       → mgr-creator                            ║
║  Update external agent  → mgr-updater                            ║
║  Audit dependencies     → mgr-supplier                           ║
║  Memory operations      → sys-memory-keeper                      ║
║                                                                   ║
║  DO NOT use general-purpose agents for these tasks.              ║
║  DO NOT have secretary do the work directly.                     ║
╚══════════════════════════════════════════════════════════════════╝
```

### Correct Delegation Pattern

```
User: "lang-java21-expert 에이전트를 만들어줘"

WRONG:
  secretary → Task(general-purpose) → creates files directly

CORRECT:
  secretary → Task(mgr-creator agent role) → follows creator workflow
```

### Manager Agents Reference

| Agent | File | Purpose |
|-------|------|---------|
| mgr-creator | .claude/agents/mgr-creator.md | Create new agents |
| mgr-updater | .claude/agents/mgr-updater.md | Update external sources |
| mgr-supplier | .claude/agents/mgr-supplier.md | Audit dependencies |
| mgr-gitnerd | .claude/agents/mgr-gitnerd.md | Git operations (commit, push, PR) |
| mgr-sync-checker | .claude/agents/mgr-sync-checker.md | Documentation sync verification |

### System Agents Reference

| Agent | File | Purpose |
|-------|------|---------|
| sys-memory-keeper | .claude/agents/sys-memory-keeper.md | Memory operations |
| sys-naggy | .claude/agents/sys-naggy.md | TODO management |

## CRITICAL: Use Specialized Expert Agents for Code Work

```
╔══════════════════════════════════════════════════════════════════╗
║  CODE WORK MUST USE SPECIALIZED EXPERT AGENTS                    ║
║                                                                   ║
║  Language/Framework           → Required Agent                   ║
║  ─────────────────────────────────────────────────               ║
║  Python/FastAPI backend       → lang-python-expert or be-fastapi-expert ║
║  TypeScript/Next.js frontend  → lang-typescript-expert or fe-vercel-agent ║
║  Go code                      → lang-golang-expert               ║
║  Kotlin/Spring                → lang-kotlin-expert or be-springboot-expert ║
║                                                                   ║
║  WRONG:                                                          ║
║    secretary → Task(general-purpose) → writes Python code        ║
║                                                                   ║
║  CORRECT:                                                        ║
║    secretary → Task(lang-python-expert) → writes Python code     ║
║                                                                   ║
║  general-purpose should ONLY be used when:                       ║
║  - No specialized agent exists for the task                      ║
║  - Task is truly generic (file moves, simple scripts)            ║
╚══════════════════════════════════════════════════════════════════╝
```

## CRITICAL: Use Specialized Agents for Documentation & Spec Writing

```
╔══════════════════════════════════════════════════════════════════╗
║  DOCUMENTATION/SPEC WORK MUST USE SPECIALIZED AGENTS             ║
║                                                                   ║
║  Document Type                → Required Agent                   ║
║  ─────────────────────────────────────────────────               ║
║  Architecture docs/ADR        → arch-documenter                  ║
║  API specification (OpenAPI)  → arch-documenter                  ║
║  Technical design docs        → arch-documenter                  ║
║  Frontend UI/page specs       → fe-vercel-agent / fe-* agents    ║
║  Component design specs       → fe-vercel-agent / fe-* agents    ║
║  CI/CD pipeline specs         → mgr-gitnerd                      ║
║  GitHub repository config     → mgr-gitnerd                      ║
║  Docker/infra specs           → infra-docker-expert              ║
║  AWS architecture specs       → infra-aws-expert                 ║
║  Database schema specs        → db-supabase-expert               ║
║  Test strategy/plans          → qa-planner                       ║
║  Test case documentation      → qa-writer                        ║
║                                                                   ║
║  WRONG:                                                          ║
║    orchestrator → Task(general-purpose) → writes API spec        ║
║                                                                   ║
║  CORRECT:                                                        ║
║    orchestrator → Task(arch-documenter) → writes API spec        ║
║                                                                   ║
║  general-purpose should ONLY be used when:                       ║
║  - No specialized agent exists for the document type             ║
║  - Document is truly generic (meeting notes, simple lists)       ║
║                                                                   ║
║  RULE: If the document requires domain expertise to write        ║
║        correctly, it MUST be delegated to the domain expert.     ║
╚══════════════════════════════════════════════════════════════════╝
```

## CRITICAL: Sub-agent Model Specification

```
╔══════════════════════════════════════════════════════════════════╗
║  TASK TOOL MODEL PARAMETER (RECOMMENDED)                         ║
║                                                                   ║
║  Claude Code Task tool supports `model` parameter to specify     ║
║  which model the sub-agent should use.                           ║
║                                                                   ║
║  Available models:                                                ║
║    - opus   : Complex reasoning, architecture design             ║
║    - sonnet : Balanced performance (default)                     ║
║    - haiku  : Fast, simple tasks, file search                    ║
║    - inherit: Use parent conversation's model                    ║
║                                                                   ║
║  Usage:                                                          ║
║    Task(                                                         ║
║      subagent_type: "general-purpose",                           ║
║      prompt: "Analyze architecture",                             ║
║      model: "opus"                                               ║
║    )                                                             ║
╚══════════════════════════════════════════════════════════════════╝
```

### Model Selection by Task Type

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Architecture analysis | `opus` | Deep reasoning required |
| Code review | `opus` or `sonnet` | Quality judgment |
| Code implementation | `sonnet` | Balanced performance |
| File search/read | `haiku` | Fast, simple operation |
| Simple validation | `haiku` | Low latency |

### Model Selection by Agent Type

| Agent Category | Model | Examples |
|----------------|-------|----------|
| Orchestrator judgment | `opus` | Complex routing decisions |
| Manager agents | `sonnet` | mgr-creator, mgr-updater, mgr-supplier |
| Simple utilities | `haiku` | File operations, search |
| Expert agents | `sonnet` | lang-golang-expert, lang-python-expert |

## CRITICAL: Git Operations Delegation

```
╔══════════════════════════════════════════════════════════════════╗
║  GIT OPERATIONS MUST BE DELEGATED TO mgr-gitnerd                 ║
║                                                                   ║
║  WRONG:                                                          ║
║    Main conversation → directly runs git commit/push             ║
║                                                                   ║
║  CORRECT:                                                        ║
║    Main conversation → Task(mgr-gitnerd) → git commit/push       ║
║                                                                   ║
║  mgr-gitnerd handles:                                            ║
║  ✓ git commit (with proper message format)                       ║
║  ✓ git push                                                      ║
║  ✓ git branch operations                                         ║
║  ✓ PR creation (gh pr create)                                    ║
║                                                                   ║
║  This ensures:                                                   ║
║  - Consistent commit message format                              ║
║  - Safety checks before destructive operations                   ║
║  - Proper Co-Authored-By attribution                             ║
╚══════════════════════════════════════════════════════════════════╝
```

## CRITICAL: External Skills vs Internal Rules

```
╔══════════════════════════════════════════════════════════════════╗
║  INTERNAL RULES ALWAYS TAKE PRECEDENCE OVER EXTERNAL SKILLS      ║
║                                                                   ║
║  External skills (e.g., finishing-a-development-branch) may      ║
║  instruct direct git operations. IGNORE those instructions and   ║
║  apply internal rules instead.                                   ║
║                                                                   ║
║  Translation:                                                    ║
║    External skill says          → Internal rule requires         ║
║  ─────────────────────────────────────────────────────────────   ║
║    "git commit -m ..."          → Task(mgr-gitnerd) commit       ║
║    "git push ..."               → Task(mgr-gitnerd) push         ║
║    "gh pr create ..."           → Task(mgr-gitnerd) create PR    ║
║    "git merge ..."              → Task(mgr-gitnerd) merge        ║
║                                                                   ║
║  WRONG:                                                          ║
║    [Using finishing-a-development-branch skill]                  ║
║    Main conversation → directly runs "git push" as skill says    ║
║                                                                   ║
║  CORRECT:                                                        ║
║    [Using finishing-a-development-branch skill]                  ║
║    Main conversation → Task(mgr-gitnerd) → git push              ║
║                                                                   ║
║  The skill's WORKFLOW is followed, but git EXECUTION is          ║
║  delegated to mgr-gitnerd per R010.                              ║
╚══════════════════════════════════════════════════════════════════╝
```

## Enforcement

```
Violation examples:
✗ Reviewing Go + Python + TypeScript without routing/delegation
✗ Creating multiple agents without coordination plan
✗ Running parallel tasks without announcing execution plan

Correct examples:
✓ Main conversation announces plan, spawns agents, aggregates results
✓ Clear execution plan with agent assignments
✓ Progress updates during multi-agent execution
```

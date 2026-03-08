# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST - ENFORCED | **ID**: R010

## Core Rule

The main conversation is the **sole orchestrator**. It uses routing skills to delegate tasks to subagents via the Agent tool (formerly Task tool). Subagents CANNOT spawn other subagents.

**The orchestrator MUST NEVER directly write, edit, or create files. ALL file modifications MUST be delegated to appropriate subagents.**

## Self-Check (Mandatory Before File Modification)

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE MODIFYING ANY FILE, ASK YOURSELF:                        ║
║                                                                   ║
║  1. Am I the orchestrator (main conversation)?                   ║
║     YES → I MUST NOT write/edit files directly                   ║
║     NO  → I am a subagent, proceed with task                    ║
║                                                                   ║
║  2. Have I identified the correct specialized agent?             ║
║     YES → Delegate via Agent tool                                ║
║     NO  → Check delegation table below                          ║
║                                                                   ║
║  3. Am I about to use Write/Edit tool from orchestrator?         ║
║     YES → STOP. This is a VIOLATION. Delegate instead.           ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  If ANY answer is wrong → DO NOT PROCEED                         ║
╚══════════════════════════════════════════════════════════════════╝
```

## Self-Check (Mandatory Before Delegating Tasks)

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE DELEGATING A TASK TO ANY AGENT, ASK YOURSELF:            ║
║                                                                   ║
║  1. Does the task prompt contain git commands?                   ║
║     (commit, push, revert, merge, rebase, checkout, branch,     ║
║      reset, cherry-pick, tag)                                    ║
║     YES → The git part MUST go to mgr-gitnerd                   ║
║     NO  → Proceed                                                ║
║                                                                   ║
║  2. Am I bundling git operations with file editing?              ║
║     YES → STOP. Split into separate delegations:                 ║
║           - File editing → appropriate specialist                ║
║           - Git operations → mgr-gitnerd                         ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  3. Is the target agent mgr-gitnerd for ALL git operations?     ║
║     YES → Good. Continue.                                        ║
║     NO  → STOP. This is a VIOLATION. Re-route to mgr-gitnerd.   ║
║                                                                   ║
║  If ANY answer is wrong → SPLIT THE TASK                         ║
╚══════════════════════════════════════════════════════════════════╝
```

## Architecture

```
Main Conversation (orchestrator)
  ├─ secretary-routing → mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, sys-memory-keeper
  ├─ dev-lead-routing  → lang-*/be-*/fe-* experts
  ├─ de-lead-routing   → de-* experts
  └─ qa-lead-routing   → qa-planner, qa-writer, qa-engineer
      ↓
  Agent tool spawns subagents (flat, no hierarchy)
```

## Common Violations

```
❌ WRONG: Orchestrator writes files directly
   Main conversation → Write("src/main.go", content)
   Main conversation → Edit("package.json", old, new)

✓ CORRECT: Orchestrator delegates to specialist
   Main conversation → Agent(lang-golang-expert) → Write("src/main.go", content)
   Main conversation → Agent(tool-npm-expert) → Edit("package.json", old, new)

❌ WRONG: Orchestrator runs git commands directly
   Main conversation → Bash("git commit -m 'fix'")
   Main conversation → Bash("git push origin main")

✓ CORRECT: Orchestrator delegates to mgr-gitnerd
   Main conversation → Agent(mgr-gitnerd) → git commit
   Main conversation → Agent(mgr-gitnerd) → git push

❌ WRONG: Using general-purpose when specialist exists
   Main conversation → Agent(general-purpose) → "Write Go code"

✓ CORRECT: Using the right specialist
   Main conversation → Agent(lang-golang-expert) → "Write Go code"

❌ WRONG: Orchestrator creates files "just this once"
   "It's just a small config file, I'll write it directly..."

✓ CORRECT: Always delegate, no matter how small
   Agent(appropriate-agent) → create config file

❌ WRONG: Bundling git operations with file editing in non-gitnerd agent
   Main conversation → Agent(general-purpose) → "git revert + edit file + git commit"
   Main conversation → Agent(lang-typescript-expert) → "fix bug and commit"

✓ CORRECT: Separate file editing from git operations
   Main conversation → Agent(lang-typescript-expert) → "fix bug" (file edit only)
   Main conversation → Agent(mgr-gitnerd) → "git commit" (git operation only)

❌ WRONG: Including git commands in non-gitnerd agent prompt for "convenience"
   Agent(general-purpose, prompt="revert the last commit, edit the file, then commit the fix")

✓ CORRECT: Split into separate delegations
   Agent(mgr-gitnerd, prompt="revert the last commit")
   Agent(appropriate-expert, prompt="edit the file to fix the issue")
   Agent(mgr-gitnerd, prompt="commit the fix")
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
| Unmatched specialized task | mgr-creator → dynamic agent creation |

**Rules:**
- All file modifications MUST be delegated (orchestrator only uses Read/Glob/Grep)
- Use specialized agents, not general-purpose, when one exists
- general-purpose only for truly generic tasks (file moves, simple scripts)
- NO EXCEPTIONS for "small" or "quick" changes

### System Agents Reference

| Agent | File | Purpose |
|-------|------|---------|
| sys-memory-keeper | .claude/agents/sys-memory-keeper.md | Memory operations |
| sys-naggy | .claude/agents/sys-naggy.md | TODO management |

## Exception: Simple Tasks

Subagent NOT required for:
- Reading files for analysis (Read, Glob, Grep only)
- Simple file searches
- Direct questions answered by main conversation

**IMPORTANT:** "Simple" means READ-ONLY operations. If the task involves ANY file creation, modification, or deletion, it MUST be delegated. There is no "too small to delegate" exception for write operations.

## Dynamic Agent Creation (No-Match Fallback)

When routing detects no matching agent for a specialized task:

1. **Evaluate**: Is this a specialized task requiring domain expertise?
   - YES → proceed to step 2
   - NO → use general-purpose agent
2. **Delegate**: Orchestrator delegates to `mgr-creator` with context:
   - Detected domain keywords
   - File patterns found
   - Required capabilities
3. **Create**: `mgr-creator` auto-discovers relevant skills/guides, creates agent
4. **Execute**: Orchestrator uses newly created agent for the original task

This is the core oh-my-customcode philosophy:
> "No expert? CREATE one, connect knowledge, and USE it."

## Model Selection

```
Available models:
  - opus   : Complex reasoning, architecture design
  - sonnet : Balanced performance (default)
  - haiku  : Fast, simple tasks, file search
  - inherit: Use parent conversation's model

Usage:
  Agent(
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
  "git commit -m ..."          → Agent(mgr-gitnerd) commit
  "git push ..."               → Agent(mgr-gitnerd) push
  "gh pr create ..."           → Agent(mgr-gitnerd) create PR
  "git merge ..."              → Agent(mgr-gitnerd) merge

WRONG:
  [Using external skill]
  Main conversation → directly runs "git push"

CORRECT:
  [Using external skill]
  Main conversation → Agent(mgr-gitnerd) → git push

The skill's WORKFLOW is followed, but git EXECUTION is delegated to mgr-gitnerd per R010.
```

## Agent Teams (MUST when enabled)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`: Agent Teams is **MANDATORY** for qualifying tasks per R018 (MUST-agent-teams.md).

### Architecture (Agent Teams enabled)

```
Main Conversation (orchestrator)
  ├─ Simple/independent tasks → Agent tool (R009)
  └─ Collaborative/iterative tasks → Agent Teams (R018)
      ├─ TeamCreate
      ├─ TaskCreate (shared tasks)
      ├─ Agent(spawn members)
      └─ SendMessage(coordinate)
```

### When to Use Agent Teams vs Agent Tool

| Criteria | Agent Tool | Agent Teams (MUST) |
|----------|-----------|-------------------|
| Agent count | 1-2 | 3+ |
| Coordination needed | No | Yes |
| Review/fix cycles | No | Yes |
| Shared state | No | Yes |

Using Agent tool when Agent Teams criteria are met is a **VIOLATION** of R018.

## Announcement Format

```
[Routing] Using {routing-skill} for {task}
[Plan] Agent 1: {name} → {task}, Agent 2: {name} → {task}
[Execution] Parallel ({n} instances)
```

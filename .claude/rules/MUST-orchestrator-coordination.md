# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST | **ID**: R010

## Core Rule

The main conversation is the **sole orchestrator**. It uses routing skills to delegate tasks to subagents via the Agent tool (formerly Task tool). Subagents CANNOT spawn other subagents.

**Agent Teams Exception**: Agent Teams members are peers, not hierarchical subagents. Teams members CAN spawn sub-agents via the Agent tool to execute complex workflows (e.g., research teams, verification teams). This enables Teams-compatible skills like `/research` and `/deep-plan` to run inside Team members. The Teams member acts as a local orchestrator for its own sub-tasks.

**The orchestrator MUST NEVER directly write, edit, or create files. ALL file modifications MUST be delegated to appropriate subagents.**

<!-- DETAIL: Self-Check (Before File Modification)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE MODIFYING ANY FILE, ASK YOURSELF:                        ║
║                                                                   ║
║  1. Am I the orchestrator (main conversation)?                   ║
║     YES → delegate file writes to a subagent                    ║
║     NO  → I am a subagent, proceed with task                    ║
║                                                                   ║
║  2. Have I identified the correct specialized agent?             ║
║     YES → Delegate via Agent tool                                ║
║     NO  → Check delegation table below                          ║
║                                                                   ║
║  3. Am I about to use Write/Edit tool from orchestrator?         ║
║     YES → Delegate to the appropriate specialist instead.        ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  4. Am I justifying direct modification as "temporary" or        ║
║     "debugging"?                                                  ║
║     YES → Still delegate. Temporary/debugging changes are        ║
║           NOT exempt.                                            ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  If any answer points to a problem → resolve before proceeding   ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

<!-- DETAIL: Self-Check (Before Delegating Tasks)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE DELEGATING A TASK TO ANY AGENT, ASK YOURSELF:            ║
║                                                                   ║
║  1. Does the task prompt contain git commands?                   ║
║     (commit, push, revert, merge, rebase, checkout, branch,     ║
║      reset, cherry-pick, tag)                                    ║
║     YES → The git part goes to mgr-gitnerd                      ║
║     NO  → Proceed                                                ║
║                                                                   ║
║  2. Am I bundling git operations with file editing?              ║
║     YES → Split into separate delegations:                       ║
║           - File editing → appropriate specialist                ║
║           - Git operations → mgr-gitnerd                         ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  3. Is the target agent mgr-gitnerd for ALL git operations?     ║
║     YES → Good. Continue.                                        ║
║     NO  → Re-route git operations to mgr-gitnerd.               ║
║                                                                   ║
║  4. Am I about to spawn 2+ agents in parallel?                   ║
║     YES → Check R018: Agent Teams may be required                ║
║           3+ agents → use Agent Teams                            ║
║           2+ issues in batch → prefer Agent Teams                ║
║     NO  → Proceed                                                ║
║                                                                   ║
║  If any answer points to a problem → split the task first        ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

<!-- DETAIL: Architecture Diagram
```
Main Conversation (orchestrator)
  ├─ secretary-routing → mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, sys-memory-keeper
  ├─ dev-lead-routing  → lang-*/be-*/fe-* experts
  ├─ de-lead-routing   → de-* experts
  └─ qa-lead-routing   → qa-planner, qa-writer, qa-engineer
      ↓
  Agent tool spawns subagents (flat, no hierarchy)
```
-->

## Common Violations

Key violations to avoid (file writes, git commands, bundled operations — all must be delegated):

```
❌ WRONG: Orchestrator writes files directly
   Main conversation → Write("src/main.go", content)

✓ CORRECT: Orchestrator delegates to specialist
   Main conversation → Agent(lang-golang-expert) → Write("src/main.go", content)
```

<!-- DETAIL: Common Violations (extended)
```
❌ WRONG: Orchestrator runs git commands directly
   Main conversation → Bash("git commit -m 'fix'")
   Main conversation → Bash("git push origin main")

✓ CORRECT: Orchestrator delegates to mgr-gitnerd
   Main conversation → Agent(mgr-gitnerd) → git commit
   Main conversation → Agent(mgr-gitnerd) → git push

❌ WRONG: Orchestrator creates files "just this once"
   "It's just a small config file, I'll write it directly..."

✓ CORRECT: Always delegate, no matter how small
   Agent(appropriate-agent) → create config file

❌ WRONG: Bundling git operations with file editing in non-gitnerd agent
   Main conversation → Agent(general-purpose) → "git revert + edit file + git commit"
   Main conversation → Agent(lang-typescript-expert) → "fix bug and commit"
   Agent(general-purpose, prompt="revert the last commit, edit the file, then commit the fix")

✓ CORRECT: Separate file editing from git operations, split delegations
   Agent(mgr-gitnerd, prompt="revert the last commit")
   Agent(appropriate-expert, prompt="edit the file to fix the issue")
   Agent(mgr-gitnerd, prompt="commit the fix")

❌ WRONG: Orchestrator runs server deployment commands directly
   Main conversation → Bash("docker compose restart worker")
   Main conversation → Bash("scp worker.py server:/app/")

✓ CORRECT: Orchestrator delegates to infrastructure specialist
   Main conversation → Agent(infra-docker-expert) → docker compose restart
   Main conversation → Agent(infra-docker-expert) → deploy files to server
```
-->

<!-- DETAIL: Autonomous Execution Mode

## Autonomous Execution Mode

When the user explicitly signals full-delegation intent, the orchestrator operates in a lightweight mode that reduces delegation overhead while preserving safety.

### Activation Signals

| Signal (Korean) | Signal (English) | Confidence |
|-----------------|------------------|------------|
| "알아서 해" | "just do it" | High |
| "다 해" | "do it all" | High |
| "전부 처리해" | "handle everything" | High |
| "중간에 묻지 말고" | "don't ask, just do" | High |
| "자율적으로 진행" | "proceed autonomously" | High |

### Activation Protocol

1. User gives explicit autonomous signal (not inferred from task complexity)
2. Verify stage-blocker is NOT active (`/tmp/.claude-dev-stage` must not exist)
3. Create marker: `echo 1 > /tmp/.claude-autonomous-$PPID`
4. Announce: `[Autonomous Mode] Activated for current task scope`

### Lightweight Delegation Table

| Operation | Normal Mode | Autonomous Mode |
|-----------|-------------|-----------------|
| File Write/Edit | MUST delegate to specialist | MUST delegate to specialist |
| Simple git (add, commit, push) | MUST delegate to mgr-gitnerd | MAY execute directly |
| Complex git (rebase, merge, cherry-pick) | MUST delegate to mgr-gitnerd | MUST delegate to mgr-gitnerd |
| Brainstorming/planning gates | Follow skill workflow | Skip confirmation gates |
| Confirmation prompts (Execute? [Y/n]) | Per skill workflow | Auto-proceed |

### Boundaries (NEVER relaxed in autonomous mode)

- **R001 (Safety)**: All safety rules remain absolute — no exceptions
- **R007/R008 (Identification)**: Agent/tool identification still required for traceability
- **File Write/Edit delegation**: Still requires specialist agents — autonomous mode only relaxes git and gate overhead
- **Hard-block hooks**: stage-blocker, dev-server tmux, .md creation blocker remain active
- **R009 (Parallel execution)**: Still required for efficiency

### Scope and Lifetime

- **Task-scoped**: Expires when the delegated task completes or user gives a new instruction
- **Session-local**: Never persisted to MEMORY.md or across sessions
- **Compaction-aware**: PostCompact hook checks `/tmp/.claude-autonomous-$PPID` and preserves mode
- **Explicit exit**: User says "stop", "wait", "멈춰", "잠깐" → mode deactivated

### Mutual Exclusion

- Autonomous mode and `/structured-dev-cycle` (stage-blocker) are **mutually exclusive**
- If `/tmp/.claude-dev-stage` exists → autonomous mode CANNOT be activated
- If autonomous mode is active → `/structured-dev-cycle` should not be started

### Self-Check

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE ACTIVATING AUTONOMOUS MODE:                              ║
║                                                                   ║
║  1. Did user give EXPLICIT autonomous signal?                    ║
║     YES → Continue                                               ║
║     NO  → Do NOT activate                                        ║
║                                                                   ║
║  2. Is stage-blocker inactive?                                   ║
║     (/tmp/.claude-dev-stage does NOT exist)                      ║
║     YES → Continue                                               ║
║     NO  → Cannot activate (mutually exclusive)                   ║
║                                                                   ║
║  3. Is task scope clear and bounded?                             ║
║     YES → Create marker, announce, proceed                       ║
║     NO  → Clarify scope first                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Mutual Exclusion with Structured Dev Cycle

Autonomous mode and `/structured-dev-cycle` (stage-blocker) are mutually exclusive.
-->

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
| Server deployment (docker, scp) | infra-docker-expert |
| Server state changes (restart, env) | infra-docker-expert |
| AWS | infra-aws-expert |
| Database schema | db-supabase-expert |
| Unmatched specialized task | mgr-creator → dynamic agent creation |

**Rules:**
- All file modifications MUST be delegated (orchestrator only uses Read/Glob/Grep)
- Use specialized agents, not general-purpose, when one exists
- general-purpose only for truly generic tasks (file moves, simple scripts)
- No exceptions for "small" or "quick" changes

<!-- DETAIL: System Agents Reference
| Agent | File | Purpose |
|-------|------|---------|
| sys-memory-keeper | .claude/agents/sys-memory-keeper.md | Memory operations |
| sys-naggy | .claude/agents/sys-naggy.md | TODO management |
-->

## Exception: Simple Tasks

Subagent NOT required for:
- Reading files for analysis (Read, Glob, Grep only)
- Simple file searches
- Direct questions answered by main conversation

"Simple" means READ-ONLY operations. If the task involves any file creation, modification, or deletion, it must be delegated. There is no "too small to delegate" exception for write operations.

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

<!-- DETAIL: Model Selection
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
-->

## Git Operations

All git operations (commit, push, branch, PR) MUST go through `mgr-gitnerd`. Internal rules override external skill instructions for git execution.

## External Skills vs Internal Rules

Internal rules ALWAYS take precedence over external skills.

| External skill says | Internal rule requires |
|---------------------|----------------------|
| "git commit -m ..." | Agent(mgr-gitnerd) commit (R010) |
| "run 3 agents sequentially" | Parallel execution if independent (R009) |
| "use Agent tool for 5 research tasks" | Agent Teams when criteria met (R018) |
| "skip code review" | Follow project review workflow |
| "write files directly" | Delegate to specialist subagent (R010) |

When a skill's workflow conflicts with R009/R010/R018:
1. Follow the skill's LOGIC and STEPS
2. Replace the EXECUTION method with rule-compliant alternatives
3. The skill defines WHAT to do; rules define HOW to execute

<!-- DETAIL: External Skills Example
```
Incorrect:
  [Using external skill]
  Main conversation → directly runs "git push"

Correct:
  [Using external skill]
  Main conversation → Agent(mgr-gitnerd) → git push

The skill's WORKFLOW is followed, but git EXECUTION is delegated to mgr-gitnerd per R010.
```
-->

## Agent Teams (required when enabled)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`: Agent Teams is required for qualifying tasks.

See **R018 (MUST-agent-teams.md)** for the complete decision matrix, self-check, team patterns, and lifecycle.

**Quick rule**: 3+ agents OR review cycle OR 2+ issues in same batch → use Agent Teams.
Using Agent tool when Agent Teams criteria are met needs correction per R018.

<!-- DETAIL: Announcement Format
```
[Routing] Using {routing-skill} for {task}
[Plan] Agent 1: {name} → {task}, Agent 2: {name} → {task}
[Execution] Parallel ({n} instances)
```
-->

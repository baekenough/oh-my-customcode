# [MUST] Agent Teams Rules (Conditional)

> **Priority**: MUST | **ID**: R018
> **Condition**: Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
> **Fallback**: When disabled, R009/R010 apply

## Detection

Available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present.

## Decision Matrix

| Scenario | Preferred | Reason |
|----------|-----------|--------|
| Simple independent subtasks | Agent Tool | Lower cost, no coordination overhead |
| Sequential-dependency init/scaffolding | Agent Tool | Blocked agents waste tokens polling; single agent faster |
| Multi-step with shared state | **Agent Teams** | Shared task list, peer messaging |
| Research requiring discussion | **Agent Teams** | Iterative discovery, synthesis |
| Cost-sensitive batch ops | Agent Tool | Minimal token overhead |
| Complex debugging across modules | **Agent Teams** | Cross-module state sharing |
| Code review + fix cycle | **Agent Teams** | Review → fix → re-review loop |
| Single file operations | Agent Tool | Overkill for simple tasks |
| Dynamic agent creation + usage | **Agent Teams** | Create → test → iterate cycle |
| Multi-issue release batch | **Agent Teams** | Shared task tracking, coordinated release |

**When Agent Teams is enabled and criteria are met, usage is required.**

### Scope: Intra-Session vs Cross-Session

| Scope | Tool | Protocol | Use Case |
|-------|------|----------|----------|
| Intra-session | `SendMessage` (Agent Teams) | Peer-to-peer within team | Multi-agent collaboration in one session |
| Cross-session | `send_message` (claude-peers-mcp) | Broker-mediated | Multi-terminal/project coordination |

These are distinct mechanisms. Agent Teams `SendMessage` requires `TeamCreate` and operates within a single Claude Code session. claude-peers-mcp `send_message` operates across separate Claude Code processes via a localhost broker.

## Self-Check (Before Agent Tool)

Before using Agent tool for 2+ agent tasks, complete this check:
Quick rule: 3+ agents OR review cycle → use Agent Teams. Sequential deps / scaffolding → Agent Tool. 2+ issues in same batch → prefer Agent Teams.

<!-- DETAIL: Self-Check (Before Agent Tool)
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE USING Agent TOOL FOR 2+ AGENTS:                          ║
║                                                                   ║
║  1. Is Agent Teams available?                                    ║
║     YES → check criteria #2-#4                                  ║
║     NO  → Proceed with Agent tool                               ║
║                                                                   ║
║  2. Will 3+ agents be involved?                                  ║
║     YES → use Agent Teams                                        ║
║     NO  → Check #3                                               ║
║                                                                   ║
║  3. Is there a review → fix → re-review cycle?                  ║
║     YES → use Agent Teams                                        ║
║     NO  → Check #4                                               ║
║                                                                   ║
║  4. Are 2+ issues being fixed in the same release batch?        ║
║     YES → prefer Agent Teams (coordination benefit)              ║
║     NO  → Check #5                                               ║
║                                                                   ║
║  5. Are tasks sequentially dependent (init/scaffold)?            ║
║     YES → prefer Agent Tool (single agent, no coordination)     ║
║     NO  → Continue with Agent Teams                              ║
║                                                                   ║
║  Simple rule: 3+ agents OR review cycle → use Agent Teams        ║
║  Sequential deps / scaffolding → Agent Tool (single agent)       ║
║  2+ issues in same batch → prefer Agent Teams                    ║
║  Everything else → Agent tool                                    ║
╚══════════════════════════════════════════════════════════════════╝
-->

### Spawn Completeness Check

All members must be spawned in a single message. Partial spawning needs correction per R018 and R009.

<!-- DETAIL: Self-Check (Spawn Completeness)
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE SPAWNING TEAM MEMBERS:                                   ║
║                                                                   ║
║  1. How many members does this team need?  N = ___               ║
║  2. Am I spawning ALL N members in THIS message?                 ║
║     YES → Good. Continue.                                        ║
║     NO  → Spawn all N members in this message before proceeding. ║
║                                                                   ║
║  Partial spawn (e.g., 1/3) = needs correction                    ║
║  Sequential spawn (one per message) = needs correction           ║
║  All at once in single message = correct                         ║
╚══════════════════════════════════════════════════════════════════╝
-->

<!-- DETAIL: External Skill Conflict Resolution
When an external skill instructs using Agent tool but R018 criteria are met:

| Skill says | R018 requires | Resolution |
|------------|--------------|------------|
| "Use Agent tool for N tasks" | 3+ agents → Teams | Use Agent Teams, follow skill logic |
| "Sequential agent spawning" | Independent tasks → parallel | Parallelize per R009 |
| "Skip coordination" | Shared state → Teams | Use Teams for coordination |

Rule: External skills define the WORKFLOW. R018 defines the EXECUTION METHOD.
The skill's steps are followed, but agent spawning uses Teams when criteria are met.
-->

## Common Violations

```
❌ WRONG: 3+ tasks using Agent tool instead of Agent Teams
   Agent(Explore):haiku → Analysis 1
   Agent(Explore):haiku → Analysis 2
   Agent(Explore):haiku → Analysis 3

✓ CORRECT: TeamCreate → spawn researchers → coordinate via shared task list
   TeamCreate("research-team") + Agent(researcher-1/2/3) + SendMessage(coordinate)
```

<!-- DETAIL: Common Violations (full examples)
❌ WRONG: Agent Teams enabled, 3+ research tasks using Agent tool
   Agent(Explore):haiku → Analysis 1
   Agent(Explore):haiku → Analysis 2
   Agent(Explore):haiku → Analysis 3

✓ CORRECT: TeamCreate → spawn researchers → coordinate via shared task list
   TeamCreate("research-team")
   Agent(researcher-1) → Analysis 1  ┐
   Agent(researcher-2) → Analysis 2  ├─ Spawned as team members
   Agent(researcher-3) → Analysis 3  ┘
   SendMessage(coordinate)

❌ WRONG: Code review + fix as independent Agents
   Agent(reviewer) → "Review code"
   (receive result)
   Agent(implementer) → "Fix issues"
   (receive result)
   Agent(reviewer) → "Re-review"

✓ CORRECT: Agent Teams for review-fix cycle
   TeamCreate("review-fix")
   Agent(reviewer) + Agent(implementer) → team members
   reviewer → SendMessage(implementer, "issues found")
   implementer → fixes → SendMessage(reviewer, "fixed")
   reviewer → re-reviews → done

❌ WRONG: Spawning team members one at a time
   TeamCreate("research-team")
   Message 1: Agent(researcher-1) → Analysis 1   (only 1/3 spawned)
   Message 2: Agent(researcher-2) → Analysis 2   (late spawn)
   Message 3: Agent(researcher-3) → Analysis 3   (late spawn)

✓ CORRECT: All members in a single message
   TeamCreate("research-team")
   Single message:
     Agent(researcher-1) → Analysis 1  ┐
     Agent(researcher-2) → Analysis 2  ├─ ALL spawned together
     Agent(researcher-3) → Analysis 3  ┘

❌ WRONG: Completed member modifies other member's files
   svelte-projects completes task → browses TaskList → edits agent-teams-advisor.sh (hook-fixer's scope)

✓ CORRECT: Completed member reports and waits
   svelte-projects completes task → SendMessage("Task complete") → waits silently
-->

## Cost Guidelines

| Criteria | Agent Tool | Agent Teams |
|----------|-----------|-------------|
| Agent count | 1-2 | 3+ |
| Inter-task dependency | None | Present |
| Iteration cycles | None | Present (review→fix→re-review) |
| Estimated duration | < 3 min | > 3 min |
| Shared state needed | No | Yes |

## Team Patterns

Standard: Research (researcher-1 + researcher-2 + synthesizer), Development (implementer + reviewer + tester), Debug (investigator-1 + investigator-2 + fixer).
Hybrid: Review+Fix, Create+Validate, Multi-Expert, Dynamic Creation, Codex Hybrid.

<!-- DETAIL: Team Patterns
### Standard Patterns
- Research: researcher-1 + researcher-2 + synthesizer
- Development: implementer + reviewer + tester
- Debug: investigator-1 + investigator-2 + fixer

### Hybrid Patterns
- Review+Fix: reviewer + implementer (reviewer finds issues → implementer fixes → reviewer re-checks)
- Create+Validate: mgr-creator + qa-engineer (create agent → validate → iterate)
- Multi-Expert: expert-1 + expert-2 + coordinator (cross-domain tasks requiring multiple specialties)

### Dynamic Patterns
- Dynamic Creation: mgr-creator + domain-expert (create new agent → immediately use for pending task)
- Codex Hybrid: codex-exec-agent + claude-reviewer (Codex generates → Claude reviews/refines)

### Codex-Exec Integration
When both Agent Teams and codex-exec are available:
  1. Claude agent analyzes requirements
  2. codex-exec generates implementation (Codex strength: code generation)
  3. Claude agent reviews and refines (Claude strength: reasoning, quality)
  4. Iterate via team messaging until quality meets standards

| Step | Agent | Model |
|------|-------|-------|
| Analysis | Claude team member | sonnet/opus |
| Generation | codex-exec | (Codex default) |
| Review | Claude team member | sonnet |
| Refinement | Appropriate expert | sonnet |

### Dynamic Agent Creation in Teams
When Agent Teams creates a new agent via mgr-creator:
1. Team lead identifies missing expertise
2. Spawns mgr-creator as team member
3. mgr-creator creates agent with auto-discovered skills
4. New agent joins team immediately
5. Team continues with expanded capabilities
-->

## Blocked Agent Behavior

When a team member is blocked: prefer Deferred spawn (no wasted tokens) > Silent wait (short waits) > Reassign (blocked >2 min).
Post-completion: report via SendMessage, wait silently. Do NOT browse TaskList or modify files outside scope.

<!-- DETAIL: Blocked Agent Behavior
| Strategy | When | Benefit |
|----------|------|---------|
| Deferred spawn | Dependency chain is clear | No wasted tokens; spawn after blocker completes |
| Silent wait | Agent already spawned, short wait expected | Minimal overhead |
| Reassign | Agent blocked >2 min with no progress | Reuse agent for unblocked work |

### Prompt Guidelines for Team Members
When spawning agents that may be blocked:
1. Include explicit instruction: "If your task is blocked, wait silently. Do NOT send periodic status messages."
2. Set check interval: "Check TaskList once per minute, not continuously."
3. Prefer deferred spawn when the dependency resolution time is unpredictable.
4. Post-completion instruction: "After completing your task, report via SendMessage and wait. Do NOT explore or modify files outside your scope."
5. Explicit scope boundary: "Your scope is limited to: {file list or directory}. Do NOT modify files outside this scope."

### Anti-Pattern: Idle Polling
❌ WRONG: Blocked agent sends repeated status messages
   docker-dev: "Task #1 still pending..."  (×5 messages, wasting tokens)

✓ CORRECT: Deferred spawn after dependency resolves
   (Task #1 completes) → then spawn docker-dev for Task #3

✓ ALSO CORRECT: Silent wait with infrequent checks
   docker-dev spawned with: "Wait silently if blocked. Check TaskList once per minute."

### Post-Completion Scope Constraint
| Behavior | Correct | Wrong |
|----------|---------|-------|
| Task completed | Report completion via SendMessage, wait silently | Browse TaskList for other work |
| No more tasks | Exit or wait for team shutdown | Explore/modify files outside original scope |
| See unfinished work | Report to team lead, do NOT self-assign | Edit files that belong to other members |

### Self-Check (After Task Completion)
╔══════════════════════════════════════════════════════════════════╗
║  AFTER COMPLETING YOUR ASSIGNED TASK:                            ║
║                                                                   ║
║  1. Did I complete ONLY my assigned task?                        ║
║     YES → Report completion                                      ║
║     NO  → Revert scope-violation changes                         ║
║                                                                   ║
║  2. Are there files modified outside my task scope?              ║
║     YES → This is a violation — revert                           ║
║     NO  → Good                                                    ║
║                                                                   ║
║  3. Am I about to explore/modify files for "other tasks"?        ║
║     YES → STOP. Report to team lead instead                      ║
║     NO  → Good. Wait silently or exit                            ║
╚══════════════════════════════════════════════════════════════════╝
-->

## Lifecycle

```
TeamCreate → TaskCreate → Agent(spawn members) → SendMessage(coordinate)
  → TaskUpdate(progress) → ... → shutdown members → TeamDelete
```

## Fallback

When Agent Teams unavailable: use Agent tool with R009/R010 rules.
When Agent Teams available: actively prefer it for qualifying tasks.

## Cost Awareness

Agent Teams actively preferred for qualifying collaborative tasks. Use Agent tool only when:
- 1-2 agents with no inter-dependency
- No review → fix cycles
- Simple independent subtasks

Do NOT avoid Agent Teams solely for cost reasons when criteria are met.

**Active preference rule**: When Agent Teams is available, default to using it for any multi-step or multi-issue work. Only fall back to Agent tool for truly simple, single-issue tasks with no verification needs.

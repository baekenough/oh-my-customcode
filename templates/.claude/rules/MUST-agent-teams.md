# [MUST] Agent Teams Rules (Conditional)

> **Priority**: MUST - ENFORCED | **ID**: R018
> **Condition**: Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
> **Fallback**: When disabled, R009/R010 apply

## Detection

Available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present.

## Decision Matrix

| Scenario | Preferred | Reason |
|----------|-----------|--------|
| Simple independent subtasks | Agent Tool | Lower cost, no coordination overhead |
| Multi-step with shared state | **Agent Teams** | Shared task list, peer messaging |
| Research requiring discussion | **Agent Teams** | Iterative discovery, synthesis |
| Cost-sensitive batch ops | Agent Tool | Minimal token overhead |
| Complex debugging across modules | **Agent Teams** | Cross-module state sharing |
| Code review + fix cycle | **Agent Teams** | Review → fix → re-review loop |
| Single file operations | Agent Tool | Overkill for simple tasks |
| Dynamic agent creation + usage | **Agent Teams** | Create → test → iterate cycle |

**When Agent Teams is enabled and criteria are met, usage is MANDATORY.**

## Self-Check (MANDATORY Before Agent Tool)

BEFORE using Agent tool for 2+ agent tasks, this check is **ENFORCED**:

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE USING Agent TOOL FOR 2+ AGENTS:                          ║
║                                                                   ║
║  1. Is Agent Teams available?                                    ║
║     YES → MUST check criteria #2-#5                              ║
║     NO  → Proceed with Agent tool                               ║
║                                                                   ║
║  2. Will 3+ agents be involved?                                  ║
║     YES → MUST use Agent Teams                                   ║
║     NO  → Check #3                                               ║
║                                                                   ║
║  3. Is there a review → fix → re-review cycle?                  ║
║     YES → MUST use Agent Teams                                   ║
║     NO  → Proceed with Agent tool                                ║
║                                                                   ║
║  Simple rule: 3+ agents OR review cycle → Agent Teams            ║
║  Everything else → Agent tool                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Spawn Completeness Check (MANDATORY)

When spawning Agent Teams members:

**ALL members MUST be spawned in a SINGLE message.** Partial spawning is a VIOLATION of both R018 and R009.

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE SPAWNING TEAM MEMBERS:                                   ║
║                                                                   ║
║  1. How many members does this team need?  N = ___               ║
║  2. Am I spawning ALL N members in THIS message?                 ║
║     YES → Good. Continue.                                        ║
║     NO  → STOP. This is a VIOLATION.                             ║
║           All N members MUST be in the same message.             ║
║                                                                   ║
║  Partial spawn (e.g., 1/3) = VIOLATION                           ║
║  Sequential spawn (one per message) = VIOLATION                  ║
║  All at once in single message = CORRECT                         ║
╚══════════════════════════════════════════════════════════════════╝
```

## Common Violations

```
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

❌ WRONG: Multi-expert task without coordination
   Agent(lang-typescript-expert) → "Implement frontend"
   Agent(be-express-expert) → "Implement API"
   (no shared state, results manually combined)

✓ CORRECT: Agent Teams for cross-domain work
   TeamCreate("fullstack")
   Agent(frontend-dev) + Agent(backend-dev) → team members
   Shared TaskList for interface contracts
   SendMessage for API schema coordination

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
```

## Cost Guidelines

| Criteria | Agent Tool | Agent Teams |
|----------|-----------|-------------|
| Agent count | 1-2 | 3+ |
| Inter-task dependency | None | Present |
| Iteration cycles | None | Present (review→fix→re-review) |
| Estimated duration | < 3 min | > 3 min |
| Shared state needed | No | Yes |

## Team Patterns

### Standard Patterns

- **Research**: researcher-1 + researcher-2 + synthesizer
- **Development**: implementer + reviewer + tester
- **Debug**: investigator-1 + investigator-2 + fixer

### Hybrid Patterns

- **Review+Fix**: reviewer + implementer (reviewer finds issues → implementer fixes → reviewer re-checks)
- **Create+Validate**: mgr-creator + qa-engineer (create agent → validate → iterate)
- **Multi-Expert**: expert-1 + expert-2 + coordinator (cross-domain tasks requiring multiple specialties)

### Dynamic Patterns

- **Dynamic Creation**: mgr-creator + domain-expert (create new agent → immediately use for pending task)
- **Codex Hybrid**: codex-exec-agent + claude-reviewer (Codex generates → Claude reviews/refines)

## Codex-Exec Integration

When both Agent Teams and codex-exec are available:

```
Hybrid Workflow:
  1. Claude agent analyzes requirements
  2. codex-exec generates implementation (Codex strength: code generation)
  3. Claude agent reviews and refines (Claude strength: reasoning, quality)
  4. Iterate via team messaging until quality meets standards
```

| Step | Agent | Model |
|------|-------|-------|
| Analysis | Claude team member | sonnet/opus |
| Generation | codex-exec | o3/o4-mini |
| Review | Claude team member | sonnet |
| Refinement | Appropriate expert | sonnet |

## Dynamic Agent Creation in Teams

When Agent Teams creates a new agent via mgr-creator:

1. Team lead identifies missing expertise
2. Spawns mgr-creator as team member
3. mgr-creator creates agent with auto-discovered skills
4. New agent joins team immediately
5. Team continues with expanded capabilities

## Lifecycle

```
TeamCreate → TaskCreate → Agent(spawn members) → SendMessage(coordinate)
  → TaskUpdate(progress) → ... → shutdown members → TeamDelete
```

## Fallback

When Agent Teams unavailable: use Agent tool with R009/R010 rules.
When Agent Teams available: actively prefer it for qualifying tasks. This is not optional.

## Cost Awareness

Agent Teams actively preferred for qualifying collaborative tasks. Use Agent tool only when:
- 1-2 agents with no inter-dependency
- No review → fix cycles
- Simple independent subtasks

Do NOT avoid Agent Teams solely for cost reasons when criteria are met.

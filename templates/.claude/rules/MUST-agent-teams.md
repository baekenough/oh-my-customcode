# [MUST] Agent Teams Rules (Conditional)

> **Priority**: MUST - ENFORCED | **ID**: R018
> **Condition**: Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
> **Fallback**: When disabled, R009/R010 apply

## Detection

Available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present.

## Decision Matrix

| Scenario | Preferred | Reason |
|----------|-----------|--------|
| Simple independent subtasks | Task Tool | Lower cost, no coordination overhead |
| Multi-step with shared state | **Agent Teams** | Shared task list, peer messaging |
| Research requiring discussion | **Agent Teams** | Iterative discovery, synthesis |
| Cost-sensitive batch ops | Task Tool | Minimal token overhead |
| Complex debugging across modules | **Agent Teams** | Cross-module state sharing |
| Code review + fix cycle | **Agent Teams** | Review → fix → re-review loop |
| Single file operations | Task Tool | Overkill for simple tasks |
| Dynamic agent creation + usage | **Agent Teams** | Create → test → iterate cycle |

**When Agent Teams is enabled and criteria are met, usage is MANDATORY.**

## Self-Check (MANDATORY Before Task Tool)

BEFORE using Task tool for 2+ agent tasks, this check is **ENFORCED**:

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE USING Task TOOL FOR 2+ AGENTS:                          ║
║                                                                   ║
║  1. Is Agent Teams available?                                    ║
║     YES → MUST check criteria #2-#5                              ║
║     NO  → Proceed with Task tool                                ║
║                                                                   ║
║  2. Do 2+ agents need to coordinate? → Agent Teams              ║
║  3. Is there a review/fix/iterate cycle? → Agent Teams          ║
║  4. Do agents need shared state? → Agent Teams                   ║
║  5. Is research requiring synthesis? → Agent Teams              ║
║                                                                   ║
║  If YES to #1 AND any of #2-#5:                                  ║
║  → MUST use Agent Teams                                          ║
║  → Using Task tool instead is a VIOLATION                        ║
║                                                                   ║
║  Exception: Cost-sensitive batch ops with no inter-agent need    ║
╚══════════════════════════════════════════════════════════════════╝
```

## Common Violations

```
❌ WRONG: Agent Teams enabled, 3+ research tasks using Task tool
   Task(Explore):haiku → Analysis 1
   Task(Explore):haiku → Analysis 2
   Task(Explore):haiku → Analysis 3

✓ CORRECT: TeamCreate → spawn researchers → coordinate via shared task list
   TeamCreate("research-team")
   Task(researcher-1) → Analysis 1  ┐
   Task(researcher-2) → Analysis 2  ├─ Spawned as team members
   Task(researcher-3) → Analysis 3  ┘
   SendMessage(coordinate)

❌ WRONG: Code review + fix as independent Tasks
   Task(reviewer) → "Review code"
   (receive result)
   Task(implementer) → "Fix issues"
   (receive result)
   Task(reviewer) → "Re-review"

✓ CORRECT: Agent Teams for review-fix cycle
   TeamCreate("review-fix")
   Task(reviewer) + Task(implementer) → team members
   reviewer → SendMessage(implementer, "issues found")
   implementer → fixes → SendMessage(reviewer, "fixed")
   reviewer → re-reviews → done

❌ WRONG: Multi-expert task without coordination
   Task(lang-typescript-expert) → "Implement frontend"
   Task(be-express-expert) → "Implement API"
   (no shared state, results manually combined)

✓ CORRECT: Agent Teams for cross-domain work
   TeamCreate("fullstack")
   Task(frontend-dev) + Task(backend-dev) → team members
   Shared TaskList for interface contracts
   SendMessage for API schema coordination
```

## Cost Guidelines

| Criteria | Task Tool | Agent Teams |
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
TeamCreate → TaskCreate → Task(spawn members) → SendMessage(coordinate)
  → TaskUpdate(progress) → ... → shutdown members → TeamDelete
```

## Fallback

When Agent Teams unavailable: use Task tool with R009/R010 rules. Both approaches produce results; Agent Teams adds coordination richness.

## Cost Awareness

Agent Teams uses more tokens (full context per member + message passing). Use Task tool when:
- Task takes < 3 minutes
- No inter-agent communication needed
- Simple independent subtasks only
- Cost is the primary concern

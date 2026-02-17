# [SHOULD] Agent Teams Rules

> **Priority**: SHOULD | **ID**: R018 | **Condition**: Agent Teams enabled locally

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

**ACTIVELY prefer Agent Teams for qualifying tasks.** The coordination richness justifies the token cost for complex work.

## Self-Check (Mandatory Before Task Tool)

BEFORE using Task tool for 2+ agent tasks, CHECK:

```
╔════════════════════════════════════════════════════════╗
║  AGENT TEAMS CHECK:                                    ║
║                                                        ║
║  1. Is Agent Teams available?                          ║
║  2. Does task need 3+ agents?                          ║
║  3. Do agents need shared state?                       ║
║  4. Is inter-agent communication needed?               ║
║  5. Is there a review/fix/iterate cycle?               ║
║                                                        ║
║  If YES to #1 AND any of #2-#5 → USE Agent Teams      ║
╚════════════════════════════════════════════════════════╝
```

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

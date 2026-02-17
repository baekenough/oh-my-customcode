# [SHOULD] Agent Teams Rules

> **Priority**: SHOULD | **ID**: R018 | **Condition**: Agent Teams enabled locally

## Detection

Available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present.

## Decision Matrix

| Scenario | Preferred |
|----------|-----------|
| Simple independent subtasks | Task Tool |
| Multi-step with shared state | Agent Teams |
| Research requiring discussion | Agent Teams |
| Cost-sensitive batch ops | Task Tool |
| Complex debugging across modules | Agent Teams |
| Code review + fix cycle | Agent Teams |
| Single file operations | Task Tool |

**Self-check before Task tool:** Is Agent Teams available? Does task need 3+ agents, shared state, or inter-agent communication? If yes, use Agent Teams.

## Team Patterns

- **Research**: researcher-1 + researcher-2 + synthesizer
- **Development**: implementer + reviewer + tester
- **Debug**: investigator-1 + investigator-2 + fixer

## Lifecycle

TeamCreate → TaskCreate → Task(spawn) → SendMessage(coordinate) → TaskUpdate → shutdown → cleanup

## Fallback

When Agent Teams unavailable: use Task tool with R009/R010 rules. Both approaches produce results; Agent Teams adds coordination richness.

## Cost

Agent Teams uses more tokens (full context per member + message passing). Use Task tool if task < 3 min or no inter-agent communication needed.

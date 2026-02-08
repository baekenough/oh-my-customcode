# [SHOULD] Agent Teams Rules

> **Priority**: SHOULD - Actively use when available
> **ID**: R018
> **Condition**: Agent Teams feature is enabled locally

## Purpose

When Claude Code's Agent Teams feature is enabled on the local machine, actively leverage it for tasks that benefit from multi-agent collaboration, shared state, and peer-to-peer communication.

## Detection

Agent Teams availability is determined by:
- Environment variable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- The presence of TeamCreate, SendMessage, TaskCreate/TaskList (team variants) tools

When detected, Agent Teams becomes the **preferred coordination method** for qualifying tasks.

## Decision Matrix

| Scenario | Task Tool | Agent Teams | Preferred |
|----------|-----------|-------------|-----------|
| Simple independent subtasks | Low cost | Overkill | **Task Tool** |
| Multi-step with shared state | Limited | Native support | **Agent Teams** |
| Research requiring discussion | No peer comm | Peer messaging | **Agent Teams** |
| Cost-sensitive batch ops | Lower tokens | Higher tokens | **Task Tool** |
| Complex debugging across modules | Isolated context | Shared context | **Agent Teams** |
| Code review + fix cycle | Sequential | Collaborative | **Agent Teams** |
| Single file operations | Fast | Overhead | **Task Tool** |

## When to Use Agent Teams

### SHOULD Use Agent Teams For

```
Tasks requiring 3+ agents that need to coordinate
Research tasks where agents need to share findings
Debugging sessions spanning multiple modules
Review + implementation cycles
Any task where inter-agent communication adds value
```

### SHOULD Keep Task Tool For

```
Independent parallel subtasks (no shared state)
Single-agent delegations
Cost-sensitive batch operations
Simple file operations
When Agent Teams is not available
```

## Team Composition Guidelines

### Standard Team Patterns

#### Research Team
```
TeamCreate("research-team")
+-- researcher-1: Explore codebase area A
+-- researcher-2: Explore codebase area B
+-- synthesizer: Aggregate findings
```

#### Development Team
```
TeamCreate("dev-team")
+-- implementer: Write code
+-- reviewer: Review changes
+-- tester: Validate changes
```

#### Debug Team
```
TeamCreate("debug-team")
+-- investigator-1: Trace issue in module A
+-- investigator-2: Trace issue in module B
+-- fixer: Apply fixes based on findings
```

### Team Lifecycle

```
1. TeamCreate        -> Create team with purpose
2. TaskCreate        -> Define tasks for team members
3. Task(team_name)   -> Spawn team members
4. SendMessage       -> Coordinate between members
5. TaskUpdate        -> Track progress
6. SendMessage(shutdown_request) -> Graceful shutdown
7. TeamDelete        -> Cleanup
```

## Fallback Behavior

When Agent Teams is NOT available:
- All team-qualifying tasks fall back to Task tool
- R009 (Parallel Execution) governs parallel spawning
- R010 (Orchestrator Coordination) governs delegation
- No degradation in capability, only in coordination richness

```
+------------------------------------------------------------------+
|  GRACEFUL DEGRADATION                                            |
|                                                                  |
|  Agent Teams Available:                                          |
|    Complex task -> TeamCreate -> coordinated agents              |
|                                                                  |
|  Agent Teams NOT Available:                                      |
|    Complex task -> Task tool -> parallel independent agents      |
|                                                                  |
|  Both approaches produce results.                                |
|  Agent Teams adds coordination, not capability.                  |
+------------------------------------------------------------------+
```

## Integration with Existing Rules

| Rule | Integration |
|------|-------------|
| R009 (Parallel) | Task tool parallel = fallback when no Agent Teams |
| R010 (Orchestrator) | Agent Teams = alternative coordination model |
| R012 (HUD) | Team status displayed in HUD |
| R013 (Ecomode) | Team communications respect ecomode |

## Cost Awareness

Agent Teams consume more tokens due to:
- Full context per team member
- Inter-agent message passing
- Shared task list overhead

```
Rule of thumb:
  If task takes < 3 minutes with Task tool -> Use Task tool
  If task needs inter-agent communication  -> Use Agent Teams
  If unsure -> Start with Task tool, escalate to Agent Teams if needed
```

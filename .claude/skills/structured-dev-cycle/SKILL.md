---
name: structured-dev-cycle
description: 6-stage structured development cycle with stage-based tool restrictions
scope: core
version: 1.0.0
user-invocable: true
---

# Structured Development Cycle

A disciplined 6-stage development cycle that enforces quality through stage-based tool restrictions. Prevents premature implementation by requiring planning and verification phases.

## Background

Inspired by Pi Coding Agent Workflow Extension's structured development approach. The core insight: restricting file modification tools during planning phases forces thorough analysis before code changes.

## Stages

| # | Stage | Allowed Tools | Blocked Tools | Purpose |
|---|-------|---------------|---------------|---------|
| 1 | **Plan** | Read, Glob, Grep, WebSearch, WebFetch | Write, Edit, Bash (modifying) | Define approach, analyze requirements |
| 2 | **Verify Plan** | Read, Glob, Grep | Write, Edit, Bash | Review plan from different perspective |
| 3 | **Implement** | All tools | None | Write code, create files |
| 4 | **Verify Implementation** | Read, Glob, Grep, Bash (tests only) | Write, Edit | Review code, run tests |
| 5 | **Compound** | Read, Bash (tests only) | Write, Edit | Integration testing, cross-module validation |
| 6 | **Done** | Read | Write, Edit, Bash | Summary and documentation |

### Stage Model Recommendations

Following the [reasoning-sandwich](/skills/reasoning-sandwich) pattern:

| Stage | Recommended Model | Rationale |
|-------|------------------|-----------|
| 1: Plan | opus | Architectural reasoning, requirement analysis |
| 2: Verify Plan | opus | Edge case detection, alternative evaluation |
| 3: Implement | sonnet | Code generation, file creation optimized |
| 4: Verify Implementation | sonnet | Test execution, structural review |
| 5: Compound | sonnet | Integration testing, cross-module validation |
| 6: Done | haiku | Checklist validation, summary generation |

Model selection is advisory — the orchestrator may override based on task complexity.

## Stage Tracking

Stage state is tracked via a marker file for hook enforcement:

```bash
# Set stage (used by orchestrator or skill)
echo "plan" > /tmp/.claude-dev-stage

# Valid stage values (all block Write/Edit except 'implement'):
# plan, verify-plan, implement, verify-impl, compound, done

# Clear stage (disable blocking)
rm -f /tmp/.claude-dev-stage
```

A PreToolUse hook in `.claude/hooks/hooks.json` checks this marker and blocks Write/Edit tools during non-implementation stages.

## Workflow

### Stage 1: Plan
```
[Stage 1/6: Plan]
├── Analyze requirements and constraints
├── Read existing code for context
├── Search for related patterns
├── Define approach with rationale
└── Output: Implementation plan document
```

**Exit criteria**: Clear plan with file list, approach description, and risk assessment.

### Stage 2: Verify Plan
```
[Stage 2/6: Verify Plan]
├── Review plan for completeness
├── Check for missing edge cases
├── Validate against existing patterns
├── Consider alternative approaches
└── Output: Plan approval or revision requests
```

**Exit criteria**: Plan verified by different perspective (ideally different model via multi-model-verification).

### Stage 3: Implement
```
[Stage 3/6: Implement]
├── Follow verified plan
├── Create/modify files as specified
├── Write tests alongside code
├── Track deviations from plan
└── Output: Implementation complete
```

**Codex-Exec Hybrid Option**: When entering Stage 3:
1. Check `/tmp/.claude-env-status-*` for codex CLI availability
2. If available AND task involves new file creation → automatically delegate scaffolding to `/codex-exec`:
   - Display: `[Codex Hybrid] Delegating scaffolding to codex-exec...`
   - codex-exec generates initial code (strength: fast generation)
   - Claude expert reviews and refines codex output (strength: reasoning, quality)
3. If unavailable → display `[Codex] Unavailable — proceeding with Claude experts directly` and proceed with standard implementation via Claude experts

Suitable for codex hybrid: new files, boilerplate, test stubs, scaffolding
Not suitable: modifying existing code, architecture-dependent changes

**Exit criteria**: All planned files created/modified, tests written.

### Stage 4: Verify Implementation
```
[Stage 4/6: Verify Implementation]
├── Run test suite
├── Review code quality
├── Check for plan deviations
├── Validate error handling
└── Output: Verification report
```

**Exit criteria**: All tests pass, no critical issues found. If issues found, return to Stage 3.

### Stage 5: Compound
```
[Stage 5/6: Compound]
├── Run integration tests
├── Cross-module validation
├── Check for side effects
├── Verify documentation accuracy
└── Output: Integration report
```

**Exit criteria**: No integration issues. If issues found, return to Stage 3.

### Stage 6: Done
```
[Stage 6/6: Done]
├── Summarize changes made
├── List files modified
├── Note any deviations from plan
├── Suggest follow-up tasks
└── Output: Completion summary
```

## Integration

### With EnterPlanMode
Stage 1 (Plan) maps to Claude Code's `EnterPlanMode`. When the structured cycle is active:
- EnterPlanMode triggers Stage 1
- ExitPlanMode transitions to Stage 2 (Verify Plan), not directly to implementation

### With Multi-Model Verification
Stage 2 (Verify Plan) and Stage 4 (Verify Implementation) can invoke the `multi-model-verification` skill for comprehensive review.

### With PreToolUse Hooks
The stage marker file (`/tmp/.claude-dev-stage`) is read by a PreToolUse hook that enforces tool restrictions. This provides a safety net beyond instruction-based compliance.

### With Agent Teams
For complex tasks, Agent Teams is **preferred** when available (R018):
- Plan: architect agent
- Verify: reviewer agent(s) — multi-model-verification via Agent Teams
- Implement: domain expert agent (+ codex-exec hybrid if available)
- Compound: QA agent

When Agent Teams is enabled AND task involves 3+ agents or review→fix cycles, using Agent Teams is MANDATORY per R018.

## When to Use

| Task Complexity | Recommended Cycle |
|----------------|-------------------|
| Simple fix (< 3 files) | Skip — direct implementation |
| Medium feature (3-10 files) | Stages 1, 3, 4, 6 (skip verify plan, compound) |
| Complex feature (10+ files) | Full 6-stage cycle |
| Architecture change | Full 6-stage cycle with multi-model verification |
| Security-critical code | Full 6-stage cycle (mandatory) |

## Stage Transition Commands

```bash
# Orchestrator manages transitions:
echo "plan" > /tmp/.claude-dev-stage           # Enter planning
echo "verify-plan" > /tmp/.claude-dev-stage     # Enter plan verification
echo "implement" > /tmp/.claude-dev-stage       # Enter implementation
echo "verify-impl" > /tmp/.claude-dev-stage     # Enter impl verification
echo "compound" > /tmp/.claude-dev-stage        # Enter compound testing
echo "done" > /tmp/.claude-dev-stage            # Mark done
rm -f /tmp/.claude-dev-stage                    # Clear (disable blocking)
```

## Limitations

- **Single session**: The fixed path `/tmp/.claude-dev-stage` does not support concurrent Claude Code sessions. Running multiple sessions simultaneously may cause stage state conflicts.
- **World-writable path**: The `/tmp/` directory is accessible to all users. For multi-user environments, consider using a user-scoped path like `/tmp/.claude-dev-stage-$(id -u)`.

## Display Format

```
═══ Structured Dev Cycle ═══════════════════════════
 [■■□□□□] Stage 2/6: Verify Plan
 Files planned: 5 | Risks identified: 2
═════════════════════════════════════════════════════
```

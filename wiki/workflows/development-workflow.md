---
title: Development Workflow
type: workflow
updated: 2026-04-12
sources:
  - CLAUDE.md
  - .claude/rules/MUST-parallel-execution.md
  - .claude/rules/MUST-orchestrator-coordination.md
  - .claude/rules/MUST-intent-transparency.md
related:
  - [[quality-workflow]]
  - [[release-workflow]]
  - [[orchestration]]
  - [[wiki/rules/r009]]
  - [[wiki/rules/r010]]
  - [[wiki/rules/r015]]
---

# Development Workflow

Code gets written through a five-stage pipeline: intent detection → routing → agent spawn → implementation → verification. The orchestrator coordinates but never writes; all file operations flow through specialist subagents.

## Overview

The development workflow is the most common path through the system. A user request is classified by intent detection, routed to the appropriate language or framework expert, executed in parallel where possible, then verified before completion is declared.

## Stage 1: Intent Detection

The orchestrator applies [[wiki/skills/intent-detection]] to classify the incoming request. Detection weighs four factors:

| Factor | Weight | Examples |
|--------|--------|---------|
| Keywords | 40% | "Go", "FastAPI", "refactor" |
| File patterns | 30% | `*.go`, `main.py`, `*.kt` |
| Action verbs | 20% | "review", "create", "fix" |
| Context | 10% | Previous agent, working directory |

Per [[wiki/rules/r015]]:
- **≥90% confidence** → auto-execute with display
- **70–89%** → request confirmation, show alternatives
- **<70%** → list options for user to choose

## Stage 2: Routing

`dev-lead-routing` selects the specialist agent. If no existing agent matches the domain, the no-match fallback triggers dynamic creation via [[wiki/agents/mgr-creator]]. See [[dynamic-creation]] for that path.

## Stage 3: Agent Spawn and Parallel Execution

[[wiki/rules/r009]] requires 2+ independent tasks to run in parallel. For multi-file implementations:

```
❌ Sequential: Write(file1.go) → Write(file2.go) → Write(file3.go)
✓ Parallel: Agent(lang-golang-expert→file1) +
            Agent(lang-golang-expert→file2) +
            Agent(lang-golang-expert→file3)   [same message]
```

Maximum 4 concurrent agents (soft default; 5 supported with monitoring). When Agent Teams is enabled and the task involves 3+ agents or review cycles, [[wiki/rules/r018]] requires Agent Teams instead.

## Stage 4: Implementation

The specialist agent executes using its configured skills and tools. Language agents apply best-practice skills (`go-best-practices`, `python-best-practices`, etc.). Backend agents compose language skills with framework-specific patterns.

Key constraint from [[wiki/rules/r010]]: the orchestrator cannot write files. All implementation work happens inside the spawned agent.

## Stage 5: Verification

Per [[wiki/rules/r020]], completion is not declared until verified:

| Check | Requirement |
|-------|-------------|
| Code compiles/lints | Pass |
| Tests pass (if exist) | Pass |
| No TODO markers left | Confirmed |

For structural changes (new agents, skills, guides), [[quality-workflow]] adds an additional R017 sauron verification pass.

## Pipeline Execution

Complex multi-step workflows can be encoded as YAML pipelines and executed via `/pipeline auto-dev`. The `pipeline` skill supports resumption after interruption via `/pipeline resume`.

The `structured-dev-cycle` skill encodes a 6-stage loop: Plan → Verify → Implement → Verify → Compound → Done.

## Ecomode Activation

For implementation tasks, ecomode activates at 50% context usage (lower than the 80% general default). Agents return `status + summary` only; intermediate steps are suppressed. See [[ecomode-and-context]].

## Relationships

- **Depends on**: [[orchestration]], [[wiki/rules/r009]], [[wiki/rules/r010]], [[wiki/rules/r015]]
- **Used by**: All code creation and modification tasks
- **See also**: [[quality-workflow]], [[release-workflow]], [[ecomode-and-context]]

## Sources

- `.claude/rules/MUST-parallel-execution.md` — R009 parallelism requirements
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 delegation model
- `.claude/rules/MUST-intent-transparency.md` — R015 confidence thresholds

---
title: Orchestration Model
type: architecture
updated: 2026-08-15
sources:
  - CLAUDE.md
  - .claude/rules/MUST-orchestrator-coordination.md
  - .claude/rules/MUST-agent-teams.md
  - .claude/rules/MUST-intent-transparency.md
related:
  - [[overview]]
  - [[rule-system]]
  - [[dynamic-creation]]
  - [[development-workflow]]
  - [[wiki/rules/r010]]
  - [[wiki/rules/r018]]
---

# Orchestration Model

The main Claude Code conversation is the **sole orchestrator**. It never writes files directly; instead it detects intent, selects a routing skill, and delegates all work to specialist subagents via the Agent tool.

## Overview

Orchestration follows a strict hierarchical model: one orchestrator, many subagents, no transitive delegation. Subagents **must not** spawn other subagents. As of CC v2.1.217+ (default changed) and v2.1.219+ (default nesting depth raised to 3), the platform itself permits nested sub-agent spawning — this is now a **project policy prohibition**, not a platform limitation. oh-my-customcode deliberately retains flat sole-orchestrator delegation to keep the delegation graph shallow and auditable and to preserve predictable [[wiki/rules/r009]] parallelism (see [[wiki/rules/r010]] for the full rationale).

The orchestrator's role is exclusively coordination: read files for analysis, select routing paths, spawn agents with explicit tasks, and aggregate results. Any write operation — including file creation, git commits, or code changes — must go through a specialist.

## Routing Skills

Four routing skills handle intent classification and agent selection:

| Skill | Domain | Agents Managed |
|-------|--------|---------------|
| `secretary-routing` | Management tasks | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron |
| `dev-lead-routing` | Code development | lang-*, be-*, fe-*, db-*, tool-* agents |
| `de-lead-routing` | Data engineering | de-airflow, de-dbt, de-spark, de-kafka, de-snowflake, de-pipeline |
| `qa-lead-routing` | Quality assurance | qa-planner, qa-writer, qa-engineer |

Routing is enhanced by [[wiki/rules/r015]] intent transparency: the orchestrator displays its routing decision (agent selected, confidence %, reason) before executing. Confidence below 70% prompts user confirmation.

## Agent Teams

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, qualifying tasks must use Agent Teams instead of sequential Agent tool calls. The decision matrix from [[wiki/rules/r018]]:

- **3+ agents OR review cycle OR 2+ issues in same batch** → Agent Teams required
- **Simple independent subtasks, 1–2 agents** → Agent tool sufficient

Agent Teams members communicate peer-to-peer via `SendMessage` and share a task list. They differ from subagents in that Teams members can spawn their own sub-agents for local workflows (e.g., a research team member running a deep-plan workflow).

> **Dormant on current models (v2.1.233+).** `TeamCreate` is not registered on the models this repo's agents run on, so there is no way to create a team — the env var above no longer makes Agent Teams reachable, and delegation falls back to [[wiki/rules/r009]]/[[wiki/rules/r010]] Agent tool calls. `TaskList` is gone with it, so the shared task list that underpins the coordination model is unavailable too. Measured tool inventory: [[wiki/rules/r002]]; fallback protocol: [[wiki/rules/r018]].

## Dynamic Agent Creation

When routing detects no matching specialist:

1. Routing skill identifies domain keywords and file patterns
2. Orchestrator delegates to [[wiki/agents/mgr-creator]] with detected context
3. `mgr-creator` auto-discovers relevant skills and guides
4. New agent is created with valid R006 frontmatter
5. Orchestrator immediately uses the new agent

This is the system's core philosophy: **"No expert? Create one, connect knowledge, and use it."**

## Protected Paths

Certain paths require routing through `mgr-creator` exclusively:

| Path | Reason |
|------|--------|
| `.claude/agents/*.md` | R006 frontmatter validation |
| `.claude/skills/*/SKILL.md` | Skill scope classification |
| `guides/*/` (new directories) | Cross-reference integrity |

Other agents handle their own paths: `sys-memory-keeper` manages `.claude/agent-memory*/`, `mgr-gitnerd` handles git operations.

## Relationships

- **Depends on**: [[wiki/rules/r010]] (delegation rule), [[wiki/rules/r015]] (intent transparency), [[wiki/rules/r018]] (Agent Teams)
- **Used by**: All workflows route through the orchestration model
- **See also**: [[dynamic-creation]], [[development-workflow]], [[release-workflow]]

## Sources

- `CLAUDE.md` — routing skill descriptions, dynamic creation workflow
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 full rule
- `.claude/rules/MUST-agent-teams.md` — R018 decision matrix
- Content-drift resync 2026-08-15 (#1582): recorded that Agent Teams is dormant on current models — `TeamCreate`/`TaskList` are unregistered (v2.1.233), so the env var no longer makes teams reachable and coordination falls back to Agent tool delegation.
- Content-drift resync 2026-07-29 (v1.1.34): reworded "Subagents cannot spawn other subagents" from a platform-capability claim to a project-policy statement — CC v2.1.217+ changed the nesting default and v2.1.219+ raised the default nested-spawn depth to 3, so the platform itself now permits nesting; oh-my-customcode's flat delegation model remains a deliberate policy choice. See [[wiki/rules/r010]] for the full rationale.

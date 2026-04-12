---
title: Orchestration Model
type: architecture
updated: 2026-04-12
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

Orchestration follows a strict hierarchical model: one orchestrator, many subagents, no transitive delegation. Subagents cannot spawn other subagents. This constraint prevents uncontrolled agent proliferation and keeps the delegation graph shallow and auditable.

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

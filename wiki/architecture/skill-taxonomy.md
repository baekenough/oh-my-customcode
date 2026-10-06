---
title: Skill Taxonomy
type: architecture
updated: 2026-10-06
sources:
  - .claude/rules/MUST-agent-design.md
  - CLAUDE.md
  - .claude/skills/
related:
  - [[overview]]
  - [[agent-taxonomy]]
  - [[separation-of-concerns]]
  - [[wiki/rules/r006]]
---

# Skill Taxonomy

114 skills are the "source code" of the system — reusable, composable instruction sets that agents reference. Skills are organized by scope (core/harness/package) and functional type (routing, best-practice, workflow, utility).

## Overview

Skills live at `.claude/skills/{name}/SKILL.md`. They define HOW to perform tasks, while agents define WHAT role performs them. The same skill can be referenced by multiple agents. Skills evolve independently of agents — changing a skill immediately updates all agents that reference it.

## Scope Classification

| Declared Scope | Count | Purpose | Deployed via init? | Example Skills |
|----------------|-------|---------|--------------------|----------------|
| `core` | 82 | Universal development tools | Yes | `dev-review`, `research`, `deep-plan` |
| `harness` | 25 | Agent/skill/rule maintenance | Yes | `sauron-watch`, `create-agent`, `audit-agents` |
| `package` | 6 | Package-specific workflows | No | `npm-publish`, `npm-version`, `npm-audit` |
| Omitted | 1 | No declared scope | Not inferred from this inventory | `systematic-debugging` |

The counts describe current SKILL.md frontmatters and sum to 114. The omitted field is recorded separately from explicit `core` declarations. R006 documents `core` as the omitted-field default; this inventory does not measure runtime deployment. The `core` and `harness` scopes form the documented deployed baseline. `package` skills are opt-in for specific project types.

## Functional Types

### Routing Skills
These orchestrate agent selection and are invoked by the main conversation:
- `secretary-routing` — management task routing
- `dev-lead-routing` — development task routing
- `de-lead-routing` — data engineering routing
- `qa-lead-routing` — QA workflow coordination
- `intent-detection` — pre-routing ambiguity analysis

The four routing skills declare `context: fork`; `intent-detection` does not. Ten skills in total declare forked context, within the R006 cap of 12. The other six are `dag-orchestration`, `task-decomposition`, `worker-reviewer-pipeline`, `deep-plan`, `professor-triage`, and `roundtable-debate`.

### Best-Practice Skills
Domain knowledge encoded as instructions. Named `{language/framework}-best-practices`:
`go-best-practices`, `python-best-practices`, `typescript-best-practices`, `rust-best-practices`, `kotlin-best-practices`, `java-best-practices`, `fastapi-best-practices`, `springboot-best-practices`, `react-best-practices`, and more.

These skills are the primary knowledge inputs when agents are "compiled" — mgr-creator auto-discovers them based on domain keywords.

### Workflow Skills
Multi-step process orchestration:
- `deep-plan` — research → plan → verify cycle
- `research` — 10-team parallel analysis
- `structured-dev-cycle` — 6-stage development loop
- `release-plan` — release unit planning
- `professor-triage` — issue cross-analysis
- `pipeline` — YAML-defined pipeline execution
- `worker-reviewer-pipeline` — iterative work/review loop

### Quality and Verification Skills
- `dev-review` — code review against language-specific best practices
- `dev-refactor` — code refactoring
- `adversarial-review` — security-focused adversarial review
- `deep-verify` — multi-angle release quality verification
- `sauron-watch` — R017 structural verification
- `action-validator` — pre-action boundary checking

### Memory and Session Skills
Memory persistence uses native auto-memory (per-agent MEMORY.md files) handled by the `sys-memory-keeper` agent. There are no dedicated memory skills — the claude-mem and agentmemory MCP backends were permanently removed (#1253).

### Utility Skills
- `result-aggregation` — parallel agent result synthesis
- `model-escalation` — advisory model escalation
- `task-decomposition` — large task splitting
- `reasoning-sandwich` — pre/post reasoning template
- `ecomode` contexts — token efficiency management

## Skill-Agent-Guide Triad Pattern

Each domain typically forms a triad:

```
Guide (guides/{domain}/)        ← reference documentation
    ↓ referenced by
Skill (.claude/skills/{domain}-best-practices/)  ← how-to instructions
    ↓ referenced by
Agent (.claude/agents/{domain}-expert.md)        ← executable specialist
```

This triad is the unit of "compilation." When `mgr-creator` builds a new agent, it auto-discovers the relevant skill and guide to form the complete triad.

## Frontmatter Key Fields

Skills support optional fields that control behavior:
- `scope` — `core` | `harness` | `package`
- `context: fork` — isolated context for orchestration skills
- `effort` — overrides agent effort level when invoked
- `model` — override spawned model
- `agent` — preferred agent to execute the skill
- `paths` — conditional loading based on open file patterns

## Relationships

- **Depends on**: [[wiki/rules/r006]] (skill frontmatter standards), [[separation-of-concerns]]
- **Used by**: [[agent-taxonomy]] (agents reference skills), [[orchestration]] (routing skills)
- **See also**: [[compilation-metaphor]], [[dynamic-creation]]

## Sources

- `.claude/rules/MUST-agent-design.md` — R006 skill frontmatter, scope table, context fork criteria
- `CLAUDE.md` — slash command list reflects available skills

- `.claude/skills/*/SKILL.md` — current scope declarations and ten fork declarations, counted 2026-10-06

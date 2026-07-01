---
title: System Architecture Overview
type: architecture
updated: 2026-07-01
sources:
  - CLAUDE.md
  - .claude/rules/MUST-agent-design.md
  - .claude/rules/MUST-orchestrator-coordination.md
related:
  - [[orchestration]]
  - [[rule-system]]
  - [[agent-taxonomy]]
  - [[skill-taxonomy]]
  - [[compilation-metaphor]]
---

# System Architecture Overview

oh-my-customcode is a meta-layer for Claude Code that structures AI agent behavior through a compilation-inspired architecture: rules define constraints, skills encode reusable knowledge, agents compose skills into specialists, and guides provide reference documentation.

## Overview

The system contains **49 agents**, **118 skills**, **23 rules**, and **57 guides** organized across four directories under `.claude/` and `guides/`. Every component has a single clear responsibility, and interactions between them are governed by explicit delegation rules.

The core philosophy is the **compilation metaphor**: skills are source code, agents are build artifacts, rules are the compiler spec, routing skills are the linker, and guides are the standard library. This isn't merely decorative — it drives every architectural decision about where knowledge lives and how components evolve.

## Three-Layer Structure

| Layer | Contents | Purpose |
|-------|----------|---------|
| **Rules** (`.claude/rules/`) | R000–R021 | Immutable behavioral constraints |
| **Skills** (`.claude/skills/`) | 103 workflow definitions | Reusable, composable instructions |
| **Agents** (`.claude/agents/`) | 47 specialist definitions | Skills composed into executable experts |

Supporting this structure are `guides/` (36 reference documents) and `.claude/hooks/` (enforcement scripts).

## Component Roles

**Rules** enforce system-wide behavior. They are classified MUST/SHOULD/MAY and enforced through a combination of prompt injection, PostCompact hooks, and a small number of hard-blocking PreToolUse hooks. See [[rule-system]] for the enforcement model.

**Skills** are the "source code" of the system. A skill lives at `.claude/skills/{name}/SKILL.md` and contains reusable workflow instructions. Skills are stateless and domain-specific. Agents reference skills by name; the same skill can be used by multiple agents.

**Agents** are "compiled" specialists. An agent at `.claude/agents/{name}.md` declares its model, tools, skills, memory scope, and domain. Agents do not contain detailed workflow instructions — those live in skills. This separation allows skills to evolve without rebuilding agents.

**Guides** are reference documentation in `guides/`. They correspond to the compiler's standard library: stable, broadly referenced, not tied to any single agent.

## Orchestration Layer

The main Claude Code conversation acts as the **sole orchestrator**. It uses four routing skills — `secretary-routing`, `dev-lead-routing`, `de-lead-routing`, and `qa-lead-routing` — to delegate tasks to specialist agents. No subagent spawns other subagents. See [[orchestration]] for the full model.

## File System Map

```
.claude/
├── agents/          # 47 agent definitions
├── skills/          # 103 skill directories (each with SKILL.md)
├── rules/           # R000-R021 rule files
├── hooks/           # PreToolUse/PostToolUse enforcement scripts
├── contexts/        # Ecomode context files
└── agent-memory*/   # Per-agent persistent memory

guides/              # 33 reference topic directories
```

## Relationships

- **Depends on**: [[compilation-metaphor]] (design philosophy), [[rule-system]] (constraints)
- **Used by**: All agents and skills operate within this structure
- **See also**: [[orchestration]], [[agent-taxonomy]], [[skill-taxonomy]]

## Sources

- `CLAUDE.md` — architecture philosophy, agent summary, component counts
- `.claude/rules/MUST-agent-design.md` — R006 separation of concerns
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 delegation model

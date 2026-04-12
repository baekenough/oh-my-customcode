---
title: Separation of Concerns
type: concept
updated: 2026-04-12
sources:
  - .claude/rules/MUST-agent-design.md
  - .claude/rules/MUST-orchestrator-coordination.md
related:
  - [[compilation-metaphor]]
  - [[dynamic-creation]]
  - [[skill-taxonomy]]
  - [[agent-taxonomy]]
  - [[wiki/rules/r006]]
  - [[wiki/rules/r010]]
---

# Separation of Concerns

The most critical design principle in oh-my-customcode is that skills, agents, and guides serve different purposes and must not conflate them. This separation enables components to evolve independently and prevents knowledge decay.

## Overview

[[wiki/rules/r006]] codifies three distinct locations with distinct purposes:

| Location | Purpose | Contains |
|----------|---------|----------|
| `.claude/agents/` | WHAT the agent does | Role declaration, capability overview, tool list, skill references |
| `.claude/skills/` | HOW to do tasks | Step-by-step instructions, decision rules, workflow logic |
| `guides/` | Reference documentation | Best practices, tutorials, authoritative external references |

Violating this separation causes structural rot: knowledge embedded in agents becomes stale when the underlying library evolves; workflow logic embedded in guides is invisible to agents; reference docs embedded in skills inflate token usage unnecessarily.

## The Three Layers in Practice

### Agents: Role Declarations

An agent file declares identity, not knowledge. A well-formed agent body contains:
- What this agent specializes in (1–2 sentences)
- What tools it uses
- What skills it references
- Workflow summary (not detailed steps — those are in skills)

What an agent body must NOT contain:
- Detailed implementation instructions (those go in skills)
- Reference documentation (that goes in guides)
- Hardcoded best practices (those go in best-practice skills)

### Skills: Executable Knowledge

A skill file at `.claude/skills/{name}/SKILL.md` is the system's knowledge unit. It is:
- **Stateless**: no per-session state
- **Composable**: multiple agents can reference the same skill
- **Versioned**: skills can evolve independently; agents pick up changes immediately
- **Scoped**: `core`, `harness`, or `package` — controls deployment and visibility

A skill contains everything needed to accomplish its task: steps, decision trees, templates, validation rules.

### Guides: Reference Material

Guides in `guides/` are documentation, not instructions. They are analogous to a textbook: authoritative, stable, and referenced by skills when citing external standards. A guide does not tell an agent what to do — it provides the authoritative source that a skill's instructions are grounded in.

## Why Independent Evolution Matters

Consider a language upgrade: Python 3.12 adds new syntax. With separation:
1. Update `python-best-practices` skill — one file change
2. All agents that reference this skill (`lang-python-expert`, `be-fastapi-expert`, `be-django-expert`) automatically benefit
3. No agent files need to change

Without separation, every agent file would need to be updated independently, creating a maintenance burden and risk of inconsistency.

## Enforcement Points

Three mechanisms enforce this separation:

**R006 (Agent Design)**: Defines what belongs where. mgr-sauron (R017) verifies compliance before every push.

**R010 Protected Paths**: `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, and `guides/*/` (new directories) can only be created or structurally modified by `mgr-creator`. This prevents ad-hoc creation that bypasses frontmatter validation.

**mgr-creator auto-discovery**: When creating a new agent, mgr-creator automatically searches `.claude/skills/` and `guides/` for relevant materials. This enforces the pattern by making the "right" path the easy path.

## The Skill-Agent-Guide Triad

The canonical structure for a domain is the triad:

```
guides/{domain}/           ← authoritative reference
    ↓ grounds
.claude/skills/{domain}-best-practices/  ← executable instructions
    ↓ referenced by
.claude/agents/{domain}-expert.md        ← role definition
```

When you add a new domain, you add all three. When you remove a domain, removing any one element without the others creates orphaned references (caught by mgr-sauron).

## Relationships

- **Depends on**: [[wiki/rules/r006]] (the rule that enforces this), [[compilation-metaphor]] (the metaphor that motivates it)
- **Used by**: [[dynamic-creation]] (creates compliant triads), [[quality-workflow]] (verifies triad integrity)
- **See also**: [[skill-taxonomy]], [[agent-taxonomy]]

## Sources

- `.claude/rules/MUST-agent-design.md` — R006 separation of concerns table and enforcement
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 Protected Paths

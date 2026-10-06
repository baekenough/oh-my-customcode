---
title: Skills
type: architecture
updated: 2026-10-06
sources:
  - .claude/skills/
  - .claude/rules/MUST-agent-design.md
  - CLAUDE.md
related:
  - [[skill-taxonomy]]
  - [[Agents]]
  - [[Built-in Commands]]
  - [[orchestration]]
  - [[compilation-metaphor]]
---

# Skills

oh-my-customcode includes **114 skills**. Skills hold reusable instructions for development, review, research, orchestration, and maintenance. Agents compose these instructions into specialist roles; a skill can serve several agents.

## Scope Inventory

| Declared scope | Current SKILL.md files | Purpose |
|----------------|------------------------|---------|
| `core` | 82 | Universal development tools |
| `harness` | 25 | Agent, skill, and rule maintenance |
| `package` | 6 | Package-specific workflows |
| Omitted | 1 | `systematic-debugging` has no declared scope |

The rows sum to 114. R006 documents `core` as the omitted-field default, but this inventory separates explicit declarations from an absent field. These are repository metadata counts, not measurements of runtime availability or deployment.

Ten skills declare `context: fork`, within the documented limit of 12. Functional groupings such as routing, best practices, workflows, and utilities overlap; the [Skill Taxonomy](architecture/skill-taxonomy.md) explains them without an unsupported count breakdown.

## Finding a Skill

Use `/omcustom:lists` for the live command catalog and `/omcustom:help` for guidance. Skills with `user-invocable: false` are not ordinary user slash commands, so the total skill count is not a command count.

## Relationships

- **Depends on**: [[skill-taxonomy]] — [Skill Taxonomy](architecture/skill-taxonomy.md)
- **Used by**: [[Agents]] — [Agents](Agents.md)
- **See also**: [[Built-in Commands]] — [Built-in Commands](Built-in-Commands.md), [[orchestration]] — [Orchestration](architecture/orchestration.md), [[compilation-metaphor]] — [Compilation Metaphor](concepts/compilation-metaphor.md)

## Sources

- `.claude/skills/*/SKILL.md` — scope and context declarations, counted 2026-10-06
- `.claude/rules/MUST-agent-design.md` — scope semantics and fork limit
- `CLAUDE.md` — skill and command navigation

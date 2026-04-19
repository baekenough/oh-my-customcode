---
title: Design Shotgun
type: skill
updated: 2026-04-19
sources:
  - .claude/skills/design-shotgun/SKILL.md
related:
  - [[impeccable-design]]
  - [[web-design-guidelines]]
  - [[product-strategy]]
  - [[R009]]
  - [[agents/fe-design-expert]]
---

# Design Shotgun

Generate 4–6 parallel design mockups for rapid visual comparison — adapted from gstack /design-shotgun pattern.

## Overview

Generates 4 independent design variations simultaneously (Minimal, Data-dense, Visual, Conventional), then presents them side-by-side with a comparison matrix for readability, visual impact, information density, and accessibility. Prevents premature convergence on a single design direction. Each variation is a self-contained HTML mockup with inline CSS, design rationale, and accessibility notes.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/design-shotgun <component/page description>`
- **Effort**: high
- **Version**: 1.0.0

## Workflow Phases

- **Phase 1 — Brief Analysis**: Extract component type, brand constraints, and target platform.
- **Phase 2 — Parallel Generation (R009)**: 4 agents spawned simultaneously, each generating one style direction.
- **Phase 3 — Comparison Board**: Side-by-side display with star-rating matrix across 4 criteria.
- **Phase 4 — Selection & Refinement**: User selects; hand off to [[agents/fe-design-expert]] for production.

## Relationships

- **Related skills**: [[impeccable-design]], [[web-design-guidelines]], [[product-strategy]]
- **Agents**: [[agents/fe-design-expert]] (production refinement after selection)
- **Rules**: [[R009]] (4 parallel agents), [[R002]] (bypassPermissions for unattended spawning)
- **Source**: Adapted from [garrytan/gstack](https://github.com/garrytan/gstack) /design-shotgun pattern

## Sources

- `.claude/skills/design-shotgun/SKILL.md` — skill definition

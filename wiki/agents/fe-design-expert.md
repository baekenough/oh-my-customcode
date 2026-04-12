---
title: fe-design-expert
type: agent
updated: 2026-04-12
sources:
  - .claude/agents/fe-design-expert.md
related:
  - [[fe-vercel-agent]]
  - [[fe-vuejs-agent]]
  - [[fe-svelte-agent]]
  - [[tool-optimizer]]
---

# fe-design-expert

Frontend design specialist focused on visual quality, aesthetic craft, and eliminating "AI slop" from production UI — covering typography, color, motion, layout, and UX writing.

## Overview

`fe-design-expert` is an external agent derived from the [Impeccable](https://github.com/pbakaus/impeccable) AI design language (v1.0.0). It evaluates and improves the *aesthetic* dimensions of user interfaces using 10 Impeccable commands (critique, audit, typeset, colorize, animate, normalize, polish, clarify, arrange, adapt).

A critical feature is the **AI Slop Test** — a checklist of common AI-generated design anti-patterns (overused fonts, gradient blobs, uniform spacing, generic card nesting) that must pass before declaring design "done". Note: this agent handles AESTHETIC quality; for technical compliance (accessibility, performance), use `web-design-guidelines` skill or [[fe-vercel-agent]].

## Key Details

- **Model**: sonnet
- **Domain**: frontend
- **Tools**: Read, Write, Edit, Grep, Glob (no Bash)
- **Skills**: `impeccable-design`, `web-design-guidelines`
- **Memory**: project
- **Effort**: medium
- **Source**: external from https://github.com/pbakaus/impeccable (v1.0.0)

## Relationships

- **Depends on**: `impeccable-design` skill, `web-design-guidelines` skill, `guides/impeccable-design/`
- **Used by**: `dev-lead-routing` skill (frontend design review tasks)
- **See also**: [[fe-vercel-agent]] (technical compliance, accessibility), [[tool-optimizer]] (performance), [[fe-vuejs-agent]], [[fe-svelte-agent]]

## Sources

- `.claude/agents/fe-design-expert.md` — agent definition

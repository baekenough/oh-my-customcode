---
title: "Claude Design Handoff Guide"
type: guide
updated: 2026-04-18
sources:
  - guides/claude-design/index.md
related:
  - [[fe-design-expert]]
  - [[fe-vercel-agent]]
  - [[impeccable-design]]
  - [[web-design-guidelines]]
  - [[impeccable-design-guide]]
---

# Claude Design Handoff Guide

Reference documentation for connecting Claude Design (Anthropic's conversational design tool) outputs to the `fe-design-expert` implementation workflow.

## Overview

Claude Design is Anthropic's conversational design tool that produces structured design artifacts — design token JSON and component specifications — through natural language dialogue. The guide defines a five-step handoff workflow: export from Claude Design, validate token structure, convert tokens to CSS custom properties, implement component specs as framework components, and run the AI Slop Test. It bridges the gap between *design intent* and production code, with `fe-design-expert` as the primary consumer and `fe-vercel-agent` handling accessibility compliance downstream.

## Key Topics

- Design token JSON format: color (OKLCH), spacing, typography, radius
- Component specification format: variants, motion, state definitions
- Token validation checklist: OKLCH color, consistent spacing multiplier, no pure neutrals
- CSS custom properties conversion pattern
- AI Slop Test integration and common handoff failure modes
- `prefers-reduced-motion` requirement for all motion specs
- Escalation path from `fe-design-expert` to `fe-vercel-agent` for semantic HTML and WCAG compliance

## Relationships

- **Primary consumer**: [[fe-design-expert]] — receives handoff, validates, implements
- **Downstream agent**: [[fe-vercel-agent]] — accessibility and semantic HTML pass
- **Related skills**: [[impeccable-design]], [[web-design-guidelines]]
- **See also**: [[impeccable-design-guide]], [[web-design]]

## Sources

- `guides/claude-design/index.md` — handoff workflow, token formats, validation checklist, common issues

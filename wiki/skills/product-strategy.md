---
title: Product Strategy
type: skill
updated: 2026-04-19
sources:
  - .claude/skills/product-strategy/SKILL.md
related:
  - [[deep-plan]]
  - [[design-shotgun]]
  - [[release-plan]]
  - [[R010]]
  - [[R015]]
---

# Product Strategy

YC-style product strategy assessment with forced questions and CEO scope modes — adapted from gstack /office-hours pattern.

## Overview

Forces rigorous product thinking by applying YC's 6 mandatory questions before any major feature decision. Prevents the "build first, think later" anti-pattern. After answering all 6 questions (Phase 1), the skill categorizes the feature using a 4-mode CEO Scope assessment (Phase 2) and outputs a structured Go/No-Go recommendation (Phase 3).

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/product-strategy [product/feature name]`
- **Effort**: high
- **Version**: 1.0.0

## Workflow Phases

- **Phase 1 — YC Forced Questions**: Who is the user? What problem? How do they solve it today? Why is this better? Smallest MVP? How will you know it worked? All 6 must be answered before Phase 2.
- **Phase 2 — CEO Scope Mode**: Expansion / Selective / Hold / Reduction — based on signal strength and demand evidence.
- **Phase 3 — Output**: Structured markdown assessment with Go / No-Go / Needs more data recommendation.

## Relationships

- **Related skills**: [[deep-plan]], [[design-shotgun]], [[release-plan]]
- **Rules**: [[R010]] (orchestrator invokes, no file writes), [[R015]] (transparent assessment)
- **Source**: Adapted from [garrytan/gstack](https://github.com/garrytan/gstack) /office-hours + /plan-ceo-review patterns

## Sources

- `.claude/skills/product-strategy/SKILL.md` — skill definition

---
title: Grill With Docs
type: skill
updated: 2026-07-01
sources:
  - .claude/skills/grill-with-docs/SKILL.md
related:
  - [[deep-plan]]
  - [[ambiguity-gate]]
  - [[brainstorming]]
---

# Grill With Docs

Domain-model grilling — interviews a plan one question at a time against the codebase's `CONTEXT.md` glossary and `docs/adr/` ADRs, captures confirmed domain language inline, and proposes ADRs only for decisions that are hard to reverse, surprising, or carry significant trade-offs.

## Overview

Takes a plan or feature proposal and subjects it to a persistent, one-question-at-a-time interview (grilling) using the project's own domain model as the frame. Each answer is evaluated against `CONTEXT.md` (terminology/glossary) and existing `docs/adr/` records before the next question is asked. When an answer confirms or refines a domain term, the skill captures it inline into `CONTEXT.md`. When a decision is irreversible, surprising, or involves meaningful trade-offs, the skill drafts an ADR stub for author review. Inspired by Matt Pocock's grill-with-docs pattern; packaged for w00ing/skills.

## Key Details

- **Scope**: core
- **Version**: 1.0.0
- **User-invocable**: yes
- **Command**: `/grill-with-docs`
- **Argument hint**: `[plan or proposal text to grill]`

## Workflow

| Step | Name | Activity |
|------|------|----------|
| 1 | Load domain model | Read `CONTEXT.md` glossary + scan `docs/adr/` for existing decisions |
| 2 | One question | Ask exactly one focused question derived from a gap between the plan and the domain model |
| 3 | Codebase-first answer | If the answer exists in code or docs, explore the codebase before accepting the user's narrative |
| 4 | Capture | Confirmed domain terms → inline update to `CONTEXT.md`; confirmed decisions → continue |
| 5 | ADR gate | If the decision is irreversible, surprising, or has real trade-offs → draft ADR stub |
| 6 | Repeat | Return to step 2 until all major domain gaps are resolved |

## Differentiation

| Skill | Domain grounding | Doc output | Question cadence |
|-------|-----------------|------------|-----------------|
| `/ambiguity-gate` | None (request scoring) | None | One-shot score |
| `superpowers:brainstorming` | None (idea expansion) | None | Free-form |
| `/deep-plan` | Codebase cross-check | Plan doc | Parallel research phases |
| `/grill-with-docs` | `CONTEXT.md` + ADRs | `CONTEXT.md` + ADR stubs | One question at a time |

The unique value of `grill-with-docs` is the grilling cadence combined with inline `CONTEXT.md` capture and ADR gating — no external skill dependency required.

## Self-Contained Formats

The skill ships its own `CONTEXT.md` glossary entry format and ADR stub template so it does not depend on any other skill's output format.

## Relationships

- **Related skills**: [[deep-plan]], [[ambiguity-gate]]
- **Overlapping community skills**: `superpowers:brainstorming` (idea expansion without domain grounding)
- **Inspiration**: Matt Pocock grill-with-docs, w00ing/skills packaging

## Sources

- `.claude/skills/grill-with-docs/SKILL.md` — skill definition

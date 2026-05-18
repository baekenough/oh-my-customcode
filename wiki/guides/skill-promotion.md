---
title: "Skill Promotion Guide"
type: guide
updated: 2026-05-18
sources:
  - guides/skill-promotion/instinct-extraction.md
related:
  - [[skill-promotion-instinct-extraction]]
  - [[skill-extractor]]
  - [[instinct-extractor]]
  - [[R016]]
  - [[R006]]
---

# Skill Promotion Guide

Reference documentation for promoting recurring failure patterns and successful workflows into permanent skill definitions. The core mechanism of R016 Continuous Improvement.

## Contents

| File | Description |
|------|-------------|
| [instinct-extraction.md](../skill-promotion/instinct-extraction.md) | Comparison guide for `skill-extractor` vs `instinct-extractor` — when to use each and how they work together |

## Two Mining Tools

oh-my-customcode provides two complementary skill mining tools:

| Tool | Scope | Trigger | Input |
|------|-------|---------|-------|
| `skill-extractor --mode failure` | Single session | Explicit call | `feedback_*.md` in agent-memory |
| `instinct-extractor` | Multi-session timeline | Auto / R016 3x repeat | `session-*.jsonl` transcripts |

Both tools target the same goal — converting failure patterns into permanent SKILL.md structures — but operate at different time scales.

## Promotion Workflow

1. Feedback memory accumulates (`feedback_*.md`) via R016 violation responses
2. After 3+ repeated patterns, R016 triggers skill promotion evaluation
3. Run `skill-extractor --mode failure` (single session) or `instinct-extractor` (cross-session)
4. Review proposed SKILL.md candidates — user approval required
5. Check `context: fork` cap (max 12) before creating orchestration skills
6. Delegate creation to `mgr-creator` (R010 Protected Paths)

## Cross-References

- [instinct-extraction guide](skill-promotion-instinct-extraction.md) — confidence cross-validation matrix and invocation frequency
- [[skill-extractor]] — single-session pattern extraction skill
- [[instinct-extractor]] — multi-session transcript mining skill
- [[R016]] — Continuous Improvement rule that triggers promotion
- [[R006]] — Agent/skill design rules governing new SKILL.md format

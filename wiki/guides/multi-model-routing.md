---
title: "Multi-Model Routing Guide"
type: guide
updated: 2026-07-29
sources:
  - guides/multi-model-routing/README.md
related:
  - [[r006]]
  - [[r008]]
  - [[skill-bundle-design]]
---

# Multi-Model Routing Guide

Role-based model selection strategy that maps agent task types to cost-appropriate model tiers. Consolidates routing conventions from R006, R008, and agent frontmatter into a single reference.

## Overview

Three model tiers serve distinct roles: `haiku` for retrieval and search, `sonnet` for general code generation (default), and `opus` for complex reasoning and architecture. `opusplan` adds plan-mode approval gates on top of opus. The `[1m]` suffix enables 1M token extended context on any tier.

The base `sonnet` and `opus` aliases stay pinned to `claude-sonnet-4-6` and `claude-opus-4-6` respectively for stability — existing agents keep their behavior unchanged. CC's own platform defaults have since moved ahead of these pins: `claude-sonnet-5` (v2.1.197+) and `claude-opus-5` (v2.1.219+, native 1M context, fast mode at $10/$50 per Mtok) are opt-in via the explicit `sonnet5` / `opus5` aliases. `opus48` (`claude-opus-4-8`) is now the previous-generation Opus tier. Fable 5 (`fable`) remains a tier above Opus 4.8, but its relative standing versus Opus 5 is not officially confirmed and is not asserted here.

## Role-Based Routing

| Role | Model | Rationale |
|------|-------|-----------|
| File discovery / search | haiku | Fast, cheap, sufficient |
| Code review / generation | sonnet | Balance of quality and speed |
| Bug fix (complex), architecture | opus | Deep cross-module reasoning |
| Release verification, orchestration | opus | Holistic validation |

## Escalation Pattern

When a lower-tier model fails, escalate: `haiku → sonnet → opus`. Configured in agent frontmatter via the `escalation` field with a `threshold` (failures before advisory).

## PROJECT Override

A `MODEL_ROUTING.md` file in the project root or `.claude/` directory can override default routing per agent pattern:

```markdown
| Agent Pattern | Model | Override Reason |
|---------------|-------|-----------------|
| lang-*-expert | sonnet | Default sufficient |
| mgr-sauron    | opus  | Deep verification |
```

## Fast Mode Interaction

Fast Mode (`/fast`) uses the same model tier at ~2.5x output speed by reducing reasoning depth. It does NOT switch to a cheaper model.

## Relationships

- **Rules**: [[r006]] (model aliases, frontmatter), [[r008]] (agent:model format in tool identification)
- **See also**: [[skill-bundle-design]], model-escalation skill

## Sources

- `guides/multi-model-routing/README.md` — routing table, cost-quality matrix, escalation config, Fast Mode interaction, Opus 5 / Fable 5 alias and hierarchy notes

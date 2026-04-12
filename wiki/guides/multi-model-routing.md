---
title: "Multi-Model Routing Guide"
type: guide
updated: 2026-04-12
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

- `guides/multi-model-routing/README.md` — routing table, cost-quality matrix, escalation config, Fast Mode interaction

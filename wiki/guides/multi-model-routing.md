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

Model specification is 3-tier — see [[r006]] "3-tier model specification" (the canonical definition). WHERE a value is placed determines whether it is valid, and a single string can be correct in one position and rejected in another:

| Tier | Where valid | Values |
|------|-------------|--------|
| 1. CC native alias | Frontmatter `model:` AND Agent tool `model` param | `sonnet` \| `opus` \| `haiku` \| `opusplan` \| `inherit` — resolved by CC itself |
| 2. Full model ID | Frontmatter `model:` only (recommended) | `claude-sonnet-5` \| `claude-opus-5` \| `claude-haiku-4-5` \| `claude-opus-4-6` \| `claude-opus-4-8` \| `claude-fable-5` (+ optional `[1m]` suffix) |
| 3. Agent tool `model` param (enum) | Agent tool call only | `sonnet` \| `opus` \| `haiku` \| `fable` — exactly these 4 |

The Tier-1 base `sonnet` and `opus` aliases are **resolved by CC itself, not pinned by this project** — a spawn using the bare alias runs whatever CC currently maps that alias to, and this can and does drift as CC ships new defaults (measured: a frontmatter `model: sonnet` agent executed as `claude-sonnet-5`, CC's v2.1.197+ default, not a project-fixed `claude-sonnet-4-6`). Documentation claiming otherwise does not change what CC actually runs — see [[r006]] Tier 1. `claude-sonnet-5` (v2.1.197+) and `claude-opus-5` (v2.1.219+, native 1M context, fast mode at $10/$50 per Mtok) are the current CC defaults for `sonnet`/`opus`; agents that need a version-stable model regardless of future CC default changes MUST opt in via the explicit Tier-2 full ID in frontmatter — **not** via `sonnet5`/`opus5` shorthand aliases, which CC does not interpret (a spawn using them fails; this was confirmed by a same-session incident). `opus48`/`claude-opus-4-8` is now the previous-generation Opus tier. Fable 5 (`fable`) remains a tier above Opus 4.8, but its relative standing versus Opus 5 is not officially confirmed and is not asserted here.

## Role-Based Routing (frontmatter, Tier 2)

| Role | Model (frontmatter) | Rationale |
|------|----------------------|-----------|
| File discovery / search | `haiku` | Fast, cheap, sufficient |
| Code review / generation | `claude-sonnet-5` | Balance of quality and speed (CC default model, v2.1.197+) |
| Bug fix (complex), architecture | `claude-opus-5` | Deep cross-module reasoning (CC default Opus, v2.1.219+) |
| Release verification, orchestration | `claude-opus-5` | Holistic validation |

## Escalation Pattern (Agent-tool spawn, Tier 3)

When a lower-tier model fails, escalate: `haiku → sonnet → opus` (de-escalation: `opus → sonnet → haiku`; `opus` is the top tier, so no further escalation target exists above it). This operates at Agent-tool spawn time, so it uses the Tier-3 enum (`sonnet`\|`opus`\|`haiku`\|`fable`) — not full model IDs, and not `sonnet5`/`opus5`. Configured in agent frontmatter via the `escalation` field with a `threshold` (failures before advisory); see [[model-escalation]] skill.

## PROJECT Override (frontmatter, Tier 2)

A `MODEL_ROUTING.md` file in the project root or `.claude/` directory can override default routing per agent pattern:

```markdown
| Agent Pattern | Model | Override Reason |
|---------------|-------|-----------------|
| lang-*-expert | claude-sonnet-5 | Default sufficient |
| mgr-sauron    | claude-opus-5   | Deep verification |
```

## Fast Mode Interaction

Fast Mode (`/fast`) uses the same model tier at ~2.5x output speed by reducing reasoning depth. It does NOT switch to a cheaper model.

## Relationships

- **Rules**: [[r006]] (model aliases, frontmatter), [[r008]] (agent:model format in tool identification)
- **See also**: [[skill-bundle-design]], model-escalation skill

## Sources

- `guides/multi-model-routing/README.md` — routing table, cost-quality matrix, escalation config, Fast Mode interaction, Opus 5 / Fable 5 alias and hierarchy notes
- Content-drift resync 2026-07-29 (false-green fix): removed the retracted claim that the Tier-1 base `sonnet`/`opus` aliases "stay pinned" to `claude-sonnet-4-6`/`claude-opus-4-6` — this contradicted the Tier table three lines above it ("resolved by CC itself"), and the source guide explicitly retracts the pin claim. Alias resolution is CC-controlled and drifts with platform defaults; version stability requires the Tier-2 full model ID.

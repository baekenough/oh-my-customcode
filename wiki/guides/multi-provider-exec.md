---
title: "Multi-Provider Exec Guide"
type: guide
updated: 2026-05-30
sources:
  - guides/multi-provider-exec/README.md
related:
  - [[multi-model-routing]]
  - [[skill-bundle-design]]
  - [[r006]]
  - [[r009]]
---

# Multi-Provider Exec Guide

Unified reference for executing prompts through external LLM providers via exec skills. Complements the [[multi-model-routing]] guide (Claude model selection) with cross-provider execution capabilities, inspired by OpenHarness's provider profile switching pattern.

## Overview

`rtk-exec` extends oh-my-customcode with a configurable proxy that compresses verbose CLI output before returning it to the model. Requires RTK CLI installed; opt-in with no automatic fallback.

## Provider Matrix

| Provider | Skill | CLI | Strengths |
|----------|-------|-----|-----------|
| RTK (proxy) | `rtk-exec` | `rtk` | Compressed output, cost reduction |

## Provider Selection

| Task | Recommended | Rationale |
|------|-------------|-----------|
| Token-heavy batch operations | rtk-exec | Compressed output lowers context cost |
| Multi-model verification | `multi-model-verification` | Orchestrates multiple Claude model tiers |

## Design Decisions

Cross-provider results are advisory — Claude remains the primary execution engine. Missing CLIs are silently skipped; providers are opt-in.

## Relationships

- **Complement**: [[multi-model-routing]] — Claude model tier selection (haiku/sonnet/opus)
- **Integration**: [[skill-bundle-design]] — exec skills compose with `reasoning-sandwich`, `multi-model-verification`
- **Rules**: [[r006]] (agent design, tool constraints), [[r009]] (parallel exec)

## Sources

- `guides/multi-provider-exec/README.md` — provider matrix, availability detection, usage patterns, configuration

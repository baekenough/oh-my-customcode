---
title: "Multi-Provider Exec Guide"
type: guide
updated: 2026-04-18
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

Three provider-backed exec skills extend oh-my-customcode beyond Claude: `codex-exec` (GPT-5.4, code generation), `gemini-exec` (Gemini 2.5 Pro, long context and multimodal), and `rtk-exec` (configurable proxy, token-optimized output). Each maps to a CLI dependency auto-detected at session start by `session-env-check.sh`.

## Provider Matrix

| Provider | Skill | CLI | Strengths |
|----------|-------|-----|-----------|
| OpenAI (Codex) | `codex-exec` | `codex` | Code generation, independent review |
| Google (Gemini) | `gemini-exec` | `gemini` | 1M+ context, multimodal |
| RTK (proxy) | `rtk-exec` | `rtk` | Compressed output, cost reduction |

## Provider Selection

| Task | Recommended | Rationale |
|------|-------------|-----------|
| Second opinion on code review | codex-exec | Different training data, reduces bias |
| Long document analysis | gemini-exec | 1M+ token context window |
| Token-heavy batch operations | rtk-exec | Compressed output lowers context cost |
| Multi-model verification | All three | `multi-model-verification` skill orchestrates |

## Design Decisions

Cross-provider results are advisory — Claude remains the primary execution engine. There is no automatic fallback between providers (explicit selection preferred). Missing CLIs are silently skipped; providers are opt-in.

## Relationships

- **Complement**: [[multi-model-routing]] — Claude model tier selection (haiku/sonnet/opus)
- **Integration**: [[skill-bundle-design]] — exec skills compose with `reasoning-sandwich`, `multi-model-verification`
- **Rules**: [[r006]] (agent design, tool constraints), [[r009]] (parallel exec across providers)

## Sources

- `guides/multi-provider-exec/README.md` — provider matrix, availability detection, usage patterns, configuration

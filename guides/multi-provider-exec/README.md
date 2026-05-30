# Multi-Provider Exec

## Overview

Unified reference for executing prompts through external LLM providers via exec skills. Complements the [Multi-Model Routing](../multi-model-routing/README.md) guide (Claude model selection) with cross-provider execution capabilities.

Inspired by OpenHarness's provider profile switching pattern, adapted for oh-my-customcode's skill-based architecture.

## Provider Matrix

| Provider | Skill | CLI Dependency | Model | Strengths |
|----------|-------|---------------|-------|-----------|
| RTK (proxy) | `rtk-exec` | `rtk` CLI | Configurable | Token-optimized output, cost reduction |

## Availability Detection

The `session-env-check.sh` hook (SessionStart) auto-detects available providers:

```
[SessionStart] Checking external CLI availability...
  rtk: ✓ available
```

Providers are opt-in — missing CLIs are silently skipped.

## Usage Patterns

### Direct Invocation

```
/rtk-exec "List files matching pattern X"
```

### Provider Selection Guide

| Task | Recommended Provider | Rationale |
|------|---------------------|-----------|
| Token-heavy batch operations | rtk-exec | Compressed output reduces context cost |

### Integration with Existing Skills

| Skill | Uses Provider | How |
|-------|--------------|-----|
| `reasoning-sandwich` | Any exec skill | Pre/post reasoning with different models |
| `model-escalation` | Claude models only | Internal escalation (haiku→sonnet→opus), not cross-provider |

## Relationship to Multi-Model Routing

| Aspect | Multi-Model Routing | Multi-Provider Exec |
|--------|--------------------|--------------------|
| Scope | Claude model selection | Cross-provider execution |
| Models | haiku / sonnet / opus | RTK proxy |
| Mechanism | `model` frontmatter field | Exec skill invocation |
| Use case | Cost/quality optimization within Claude | Token-optimized output via RTK proxy |
| Guide | `guides/multi-model-routing/` | `guides/multi-provider-exec/` |

## Configuration

No global configuration required. Each exec skill reads its own CLI configuration:

| Skill | Config Source |
|-------|-------------|
| rtk-exec | RTK proxy running on localhost |

## Limitations

- Provider availability depends on user's CLI installations
- Cross-provider results are advisory — Claude remains the primary execution engine
- No automatic fallback between providers (by design — explicit selection preferred)
- Rate limits and costs are provider-specific and not tracked by oh-my-customcode

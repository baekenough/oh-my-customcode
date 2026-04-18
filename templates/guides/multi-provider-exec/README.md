# Multi-Provider Exec

## Overview

Unified reference for executing prompts through external LLM providers via exec skills. Complements the [Multi-Model Routing](../multi-model-routing/README.md) guide (Claude model selection) with cross-provider execution capabilities.

Inspired by OpenHarness's provider profile switching pattern, adapted for oh-my-customcode's skill-based architecture.

## Provider Matrix

| Provider | Skill | CLI Dependency | Model | Strengths |
|----------|-------|---------------|-------|-----------|
| OpenAI (Codex) | `codex-exec` | `codex` CLI | GPT-5.4 | Code generation, broad knowledge |
| Google (Gemini) | `gemini-exec` | `gemini` CLI | Gemini 2.5 Pro | Long context, multimodal |
| RTK (proxy) | `rtk-exec` | `rtk` CLI | Configurable | Token-optimized output, cost reduction |

## Availability Detection

The `session-env-check.sh` hook (SessionStart) auto-detects available providers:

```
[SessionStart] Checking external CLI availability...
  codex: ✓ available
  gemini: ✗ not found
  rtk: ✓ available
```

Providers are opt-in — missing CLIs are silently skipped.

## Usage Patterns

### Direct Invocation

```
/codex-exec "Review this function for security issues"
/gemini-exec "Analyze this architecture diagram"
/rtk-exec "List files matching pattern X"
```

### Provider Selection Guide

| Task | Recommended Provider | Rationale |
|------|---------------------|-----------|
| Second opinion on code review | codex-exec | Independent model reduces confirmation bias |
| Long document analysis | gemini-exec | 1M+ context window |
| Token-heavy batch operations | rtk-exec | Compressed output reduces context cost |
| Security audit cross-check | codex-exec | Different training data catches different patterns |
| Multi-model verification | All three | `/multi-model-verification` skill orchestrates this |

### Integration with Existing Skills

| Skill | Uses Provider | How |
|-------|--------------|-----|
| `multi-model-verification` | codex-exec + gemini-exec | Parallel verification with severity classification |
| `reasoning-sandwich` | Any exec skill | Pre/post reasoning with different models |
| `model-escalation` | Claude models only | Internal escalation (haiku→sonnet→opus), not cross-provider |

## Relationship to Multi-Model Routing

| Aspect | Multi-Model Routing | Multi-Provider Exec |
|--------|--------------------|--------------------|
| Scope | Claude model selection | Cross-provider execution |
| Models | haiku / sonnet / opus | GPT-5.4 / Gemini 2.5 / RTK proxy |
| Mechanism | `model` frontmatter field | Exec skill invocation |
| Use case | Cost/quality optimization within Claude | Independent verification, specialized tasks |
| Guide | `guides/multi-model-routing/` | `guides/multi-provider-exec/` |

## Configuration

No global configuration required. Each exec skill reads its own CLI configuration:

| Skill | Config Source |
|-------|-------------|
| codex-exec | `~/.codex/config` or CODEX_API_KEY env |
| gemini-exec | `~/.gemini/config` or GEMINI_API_KEY env |
| rtk-exec | RTK proxy running on localhost |

## Limitations

- Provider availability depends on user's CLI installations
- Cross-provider results are advisory — Claude remains the primary execution engine
- No automatic fallback between providers (by design — explicit selection preferred)
- Rate limits and costs are provider-specific and not tracked by oh-my-customcode

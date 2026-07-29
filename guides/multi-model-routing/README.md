# Multi-Model Routing

## Overview

Role-based model selection strategy for AI agent workflows. Consolidates model routing conventions from R006 (agent design), R008 (tool identification), and agent frontmatter into a single reference.

This project uses a **3-tier model specification system** — the same-looking string means a different thing depending on where it is placed. Read "Model Specification — 3 Tiers" below before choosing a value for frontmatter vs. an Agent tool spawn.

## Model Specification — 3 Tiers

### Tier 1 — CC Native Alias

Values: `sonnet` | `opus` | `haiku` | `opusplan` | `inherit`

Valid in BOTH agent frontmatter `model:` AND the Agent tool `model` parameter. **CC resolves these, not this project** — documentation claiming a pin (e.g. "the `sonnet` alias is pinned to 4-6") does not change what CC actually runs underneath. In practice, an agent with `model: sonnet` in frontmatter has been observed running as `claude-sonnet-5`.

### Tier 2 — Full Model ID (frontmatter only)

Values: `claude-sonnet-5` | `claude-opus-5` | `claude-haiku-4-5` | `claude-opus-4-6` | `claude-opus-4-8` | `claude-fable-5`, etc.

Valid ONLY in frontmatter `model:` — the Agent tool `model` parameter does NOT accept full model IDs. Use a Tier 2 ID when you want the agent pinned to a specific model regardless of any future drift in what CC's Tier 1 aliases resolve to.

### Tier 3 — Agent Tool `model` Parameter (enum)

Values: `sonnet` | `opus` | `haiku` | `fable` — **only these four**. Does NOT accept full model IDs, and does NOT accept `sonnet5`/`opus5`-style names. Any spawn-time model escalation or routing table that dispatches via the Agent tool MUST use one of these four values.

### Deprecated / Invalid Names

`sonnet5`, `opus5`, and `opus48` are **not recognized by CC in any context** (neither frontmatter nor the Agent tool parameter) — they were project-invented names previously documented in this repo as aliases, but the platform does not interpret them; using them causes an immediate spawn/resolution failure. Bare `fable` (without the `claude-` prefix) is valid ONLY as a Tier 3 Agent tool parameter value — it is NOT a valid frontmatter alias; use the full ID `claude-fable-5` in frontmatter instead.

## Model Catalog (Tier 2 full IDs)

| Full Model ID | Cost | Speed | Use Case |
|---------------|------|-------|----------|
| `claude-haiku-4-5` | $ | Fast | Search, simple edits, file discovery |
| `claude-sonnet-4-6` | $$ | Moderate | Code generation, general tasks — historically what the Tier 1 `sonnet` alias resolved to; CC's actual resolution target can drift (see Tier 1 above) |
| `claude-sonnet-5` | $$ | Moderate | Native 1M context; use as an explicit frontmatter pin |
| `claude-opus-4-6` | $$$ | Slower | Complex reasoning, architecture, planning |
| `claude-opus-5` | $$$ | Fast mode available | Native 1M context, fast mode at $10/$50 per Mtok |
| `claude-opus-4-8` | $$$ | Slower | Previous-generation Opus; supports xhigh effort |
| `claude-fable-5` | $$$$ | Slower | Mythos-class; use the full ID in frontmatter (bare `fable` is Tier 3 Agent-tool-only) |

Extended context: `[1m]` suffix enables 1M token context (e.g., `claude-opus-4-6[1m]`). Sonnet 5, Opus 5, and Fable 5 include 1M context by default — no `[1m]` suffix needed.

> Relative standing of Fable 5 vs Opus 5 is not officially confirmed — do not assert an ordering.

## Role-Based Routing Table

This table recommends **frontmatter (Tier 2) full model IDs** for pinning an agent's default model. When dispatching the same role via the Agent tool `model` parameter (Tier 3) instead — e.g. a routing skill spawning a one-off agent — use the alias equivalent in the last column.

| Role | Recommended Frontmatter ID (Tier 2) | Agent-Tool Equivalent (Tier 3) | Rationale |
|------|--------------------------------------|----------------------------------|-----------|
| Code search / file discovery | `claude-haiku-4-5` | `haiku` | Fast, cheap, sufficient for retrieval |
| Code review | `claude-sonnet-5` | `sonnet` | Needs understanding, not deep reasoning |
| Code generation | `claude-sonnet-5` | `sonnet` | Good balance of quality and speed |
| Bug fix (simple) | `claude-sonnet-5` | `sonnet` | Pattern recognition sufficient |
| Bug fix (complex) | `claude-opus-5` | `opus` | Needs deep reasoning across modules |
| Architecture design | `claude-opus-5` / `opusplan` | `opus` | Requires holistic thinking |
| Test generation | `claude-sonnet-5` | `sonnet` | Template-driven, moderate complexity |
| Documentation | `claude-sonnet-5` | `sonnet` | Straightforward generation |
| Release verification | `claude-opus-5` | `opus` | Cross-cutting validation |
| Orchestration | `claude-opus-5` | `opus` | Routing decisions need broad context |

## Cost-Quality Tradeoff Matrix

```
Quality ▲
        │  ┌─────────┐
        │  │  opus    │ Complex reasoning
        │  └────┬────┘
        │       │
        │  ┌────┴────┐
        │  │ sonnet   │ General purpose (default)
        │  └────┬────┘
        │       │
        │  ┌────┴────┐
        │  │  haiku   │ Retrieval, simple tasks
        │  └─────────┘
        └──────────────────────► Cost
```

## MODEL_ROUTING.md Convention

Projects can declare a `MODEL_ROUTING.md` file to override default routing. This convention sets a persistent per-agent frontmatter override, so use Tier 2 full model IDs:

```markdown
# Model Routing

| Agent Pattern | Model | Override Reason |
|---------------|-------|-----------------|
| lang-*-expert | claude-sonnet-5 | Default sufficient for code generation |
| mgr-sauron | claude-opus-5 | Verification requires deep analysis |
| Explore | claude-haiku-4-5 | Search-only, no generation needed |
```

Place in project root or `.claude/` directory.

## Agent Frontmatter Integration

```yaml
# .claude/agents/example.md
name: example-agent
model: claude-sonnet-5  # Tier 2 full model ID (recommended) — see Model Specification — 3 Tiers above
```

The `model` field in agent frontmatter accepts EITHER a Tier 1 alias (`sonnet`/`opus`/`haiku`/`opusplan`/`inherit`) OR a Tier 2 full model ID, and sets the agent's default. The Agent tool's `model` parameter at spawn time accepts ONLY the Tier 3 enum (`sonnet`/`opus`/`haiku`/`fable`) and overrides the frontmatter default when supplied.

## Escalation Pattern

When a task fails at a lower model tier, escalate. Escalation is executed by re-spawning via the Agent tool, so the path MUST use Tier 3 aliases — the Agent tool parameter does not accept full model IDs or `sonnet5`/`opus5`-style names:

```
haiku → sonnet → opus
```

Configuration in agent frontmatter:
```yaml
escalation:
  enabled: true
  path: haiku → sonnet → opus
  threshold: 2  # failures before escalation advisory
```

## Fast Mode Interaction

Fast Mode (`/fast` toggle) uses the same model with faster output (~2.5x). It does NOT change the model — it reduces reasoning depth while maintaining the configured model tier.

## Related

- R006 — Agent design rules (model tiers, frontmatter format)
- R008 — Tool identification (model in agent:model format)
- `guides/skill-bundle-design/` — Skill architecture patterns

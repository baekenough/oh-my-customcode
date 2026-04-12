# Multi-Model Routing

## Overview

Role-based model selection strategy for AI agent workflows. Consolidates model routing conventions from R006 (agent design), R008 (tool identification), and agent frontmatter into a single reference.

## Model Aliases

| Alias | Full ID | Cost | Speed | Use Case |
|-------|---------|------|-------|----------|
| `haiku` | claude-haiku-4-5 | $ | Fast | Search, simple edits, file discovery |
| `sonnet` | claude-sonnet-4-6 | $$ | Moderate | Code generation, general tasks (default) |
| `opus` | claude-opus-4-6 | $$$ | Slower | Complex reasoning, architecture, planning |
| `opusplan` | claude-opus-4-6 + plan mode | $$$ | Slower | Architecture with approval gates |

Extended context: `[1m]` suffix enables 1M token context (e.g., `claude-opus-4-6[1m]`).

## Role-Based Routing Table

| Role | Recommended Model | Rationale |
|------|------------------|-----------|
| Code search / file discovery | haiku | Fast, cheap, sufficient for retrieval |
| Code review | sonnet | Needs understanding, not deep reasoning |
| Code generation | sonnet | Good balance of quality and speed |
| Bug fix (simple) | sonnet | Pattern recognition sufficient |
| Bug fix (complex) | opus | Needs deep reasoning across modules |
| Architecture design | opus / opusplan | Requires holistic thinking |
| Test generation | sonnet | Template-driven, moderate complexity |
| Documentation | sonnet | Straightforward generation |
| Release verification | opus | Cross-cutting validation |
| Orchestration | opus | Routing decisions need broad context |

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

Projects can declare a `MODEL_ROUTING.md` file to override default routing:

```markdown
# Model Routing

| Agent Pattern | Model | Override Reason |
|---------------|-------|-----------------|
| lang-*-expert | sonnet | Default sufficient for code generation |
| mgr-sauron | opus | Verification requires deep analysis |
| Explore | haiku | Search-only, no generation needed |
```

Place in project root or `.claude/` directory.

## Agent Frontmatter Integration

```yaml
# .claude/agents/example.md
name: example-agent
model: sonnet  # Use alias from table above
```

The `model` field in agent frontmatter sets the default. The Agent tool's `model` parameter overrides at spawn time.

## Escalation Pattern

When a task fails at a lower model tier, escalate:

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

- R006 — Agent design rules (model aliases, frontmatter format)
- R008 — Tool identification (model in agent:model format)
- `guides/skill-bundle-design/` — Skill architecture patterns

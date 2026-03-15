---
name: reasoning-sandwich
description: Template for pre-reasoning → action → post-verification model allocation
scope: core
user-invocable: false
---

# Reasoning Sandwich Pattern

## Purpose

A model allocation pattern that wraps implementation actions with stronger-model reasoning phases. The "sandwich" structure ensures complex tasks get proper analysis before and verification after the core action.

## Pattern

```
[Pre-reasoning] → stronger model (opus)
  ├── Analyze requirements
  ├── Identify edge cases
  └── Define success criteria

[Action] → balanced model (sonnet)
  ├── Implement solution
  ├── Generate code/content
  └── Execute plan

[Post-verification] → balanced or lighter model (sonnet/haiku)
  ├── Verify against criteria
  ├── Check for regressions
  └── Validate completeness
```

## Model Allocation Table

| Phase | Recommended Model | Rationale |
|-------|------------------|-----------|
| Pre-reasoning (analyze/plan) | opus | Complex architectural reasoning, edge case detection |
| Action (implement/generate) | sonnet | Optimized for code generation, balanced cost |
| Post-verification (review/test) | sonnet or haiku | Structural verification, checklist validation |

## When to Apply

| Scenario | Apply Sandwich? | Reason |
|----------|----------------|--------|
| New feature implementation | Yes | Needs analysis → code → verification |
| Bug fix with clear root cause | No | Direct action sufficient |
| Architecture decision | Yes | Heavy pre-reasoning, lighter action |
| Batch file edits | No | Mechanical action, no reasoning needed |
| Security-sensitive changes | Yes | Extra verification phase critical |

## Integration

This pattern is used by:
- `structured-dev-cycle` — stages map to sandwich phases
- `evaluator-optimizer` — generator/evaluator model selection guidance
- `deep-plan` — research (pre) → plan (action) → verify (post)

## Anti-patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Opus for everything | Wasteful, slow | Reserve opus for reasoning-heavy phases |
| Haiku for planning | Insufficient depth | Use opus for complex analysis |
| Skipping verification | False completion risk | Always include post-verification phase |

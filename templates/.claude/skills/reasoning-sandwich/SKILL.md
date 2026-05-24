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
| Pre-reasoning (Opus 4.7) | opus47 | Opus 4.7 makes fewer tool calls and reasons more deeply; pre-reasoning phase should include explicit tool batch planning |
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
| Forcing frequent tool calls on Opus 4.7 | Fights model's natural reasoning-first tendency | Let Opus 4.7 reason; batch tool calls in pre-reasoning |

## Opus 4.7 Considerations

Opus 4.7 exhibits a distinct behavioral pattern: fewer tool calls with deeper reasoning per call. This affects how the sandwich pattern is applied:

| Aspect | Opus 4.6 | Opus 4.7 |
|--------|----------|----------|
| Tool call frequency | Moderate | Lower |
| Reasoning depth per call | Standard | Deeper |
| Pre-reasoning benefit | Plan what to check | Plan explicit tool batch — model will under-call if not guided |

### Pre-reasoning Adjustment for Opus 4.7

When using Opus 4.7 in the pre-reasoning phase:
1. **Explicitly enumerate tools needed** — Opus 4.7 may skip tool calls it deems unnecessary
2. **Batch tool-call plans upfront** — structure the action phase with a concrete tool sequence
3. **Prefer fewer, richer tool calls** — align with the model's natural tendency

Reference: [Best practices for using Claude Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)

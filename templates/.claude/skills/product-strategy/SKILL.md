---
name: product-strategy
description: YC-style product strategy assessment with forced questions and CEO scope modes — adapted from gstack /office-hours pattern
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "[product/feature name]"
effort: high
---

# Product Strategy Assessment

## Purpose

Forces rigorous product thinking by applying YC's 6 mandatory questions before any major feature decision. Prevents "build first, think later" anti-pattern.

## Usage

```
/product-strategy "new authentication system"
/product-strategy "API rate limiting redesign"
```

## Workflow

### Phase 1: YC Forced Questions

Before any implementation planning, answer ALL 6 questions. Incomplete answers block Phase 2.

| # | Question | Must Answer |
|---|----------|-------------|
| 1 | **Who is the user?** | Specific persona, not "everyone" |
| 2 | **What problem does this solve?** | Observable behavior, not assumed need |
| 3 | **How do they solve it today?** | Current workaround — if none exists, question the need |
| 4 | **Why is this solution better?** | Measurable improvement, not "it's newer" |
| 5 | **What's the smallest version that validates the hypothesis?** | MVP scope — ruthlessly cut |
| 6 | **How will you know it worked?** | Success metric, measurable within 2 weeks |

### Phase 2: CEO Scope Mode Assessment

Categorize the feature into one of 4 modes:

| Mode | Signal | Action |
|------|--------|--------|
| **Expansion** | Strong user signal + clear gap | Full implementation, invest aggressively |
| **Selective** | Mixed signals, some demand | Targeted implementation, measure before expanding |
| **Hold** | Low signal, maintenance only | Keep working, no new investment |
| **Reduction** | Negative signal, cost > value | Phase out, redirect resources |

### Phase 3: Output

Generate structured assessment:

```markdown
## Product Strategy: {feature}

### YC Assessment
1. User: {answer}
2. Problem: {answer}
3. Current solution: {answer}
4. Why better: {answer}
5. MVP: {answer}
6. Success metric: {answer}

### Scope Mode: {Expansion|Selective|Hold|Reduction}
Rationale: {why this mode}

### Recommendation
{Go / No-Go / Needs more data}
Next step: {specific action}
```

## Integration

| Rule | Interaction |
|------|-------------|
| R010 | Orchestrator invokes skill; no file writes |
| R015 | Transparent assessment — user sees all reasoning |

## Source

Adapted from [garrytan/gstack](https://github.com/garrytan/gstack) /office-hours + /plan-ceo-review patterns.

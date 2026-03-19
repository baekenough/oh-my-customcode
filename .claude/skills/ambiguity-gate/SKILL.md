---
name: ambiguity-gate
description: Pre-routing ambiguity analysis — scores request clarity and asks clarifying questions when needed (inspired by ouroboros)
scope: core
user-invocable: true
argument-hint: "[request to analyze for ambiguity]"
---

# Ambiguity Gate

## Purpose

Analyze a user request for ambiguity before routing to implementation. Inspired by the [ouroboros](https://github.com/Q00/ouroboros) Socratic interviewer pattern, this skill measures request clarity on a 0.0–1.0 scale and asks targeted clarifying questions when needed.

## Ambiguity Scoring

| Score Range | Verdict | Action |
|-------------|---------|--------|
| ≤ 0.2 | Clear | Proceed with implementation |
| 0.2–0.5 | Moderate | Suggest clarifications but allow proceeding |
| > 0.5 | High | Require clarification before proceeding |

## Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Scope clarity | 30% | Is the scope of work well-defined? |
| Technical specificity | 25% | Are technical requirements clear? |
| Acceptance criteria | 20% | Can we determine when the task is done? |
| Constraint clarity | 15% | Are constraints and limitations specified? |
| Context sufficiency | 10% | Is there enough context to proceed? |

**Composite score** = weighted sum of individual factor scores (each 0.0–1.0, inverted: 0.0 = clear, 1.0 = ambiguous).

## Output Format

```
[Ambiguity Analysis]
├── Score: {0.0-1.0}
├── Verdict: {Clear | Moderate | High}
├── Breakdown:
│   ├── Scope: {score} — {reason}
│   ├── Technical: {score} — {reason}
│   ├── Acceptance: {score} — {reason}
│   ├── Constraints: {score} — {reason}
│   └── Context: {score} — {reason}
└── Suggestions: {clarifying questions if score > 0.2}
```

## Workflow

1. Receive the request to analyze (from `$ARGUMENTS` or conversation context)
2. Score each factor independently
3. Compute weighted composite score
4. Determine verdict based on threshold
5. If score > 0.2: generate targeted clarifying questions (max 3, prioritized by highest-weight ambiguous factors)
6. If score > 0.5: do NOT proceed to implementation; present analysis and wait for clarification
7. If score ≤ 0.2: output analysis and proceed

## Clarifying Question Guidelines

- Ask **one question per ambiguous factor** (max 3 total)
- Order by factor weight (scope → technical → acceptance criteria)
- Make questions specific and answerable
- Avoid yes/no questions; prefer open-ended with examples

**Example questions:**
- Scope: "Should this change affect all environments or only development?"
- Technical: "What language/framework should this be implemented in?"
- Acceptance: "What would a passing test look like for this feature?"
- Constraints: "Are there performance or memory constraints to consider?"
- Context: "Is this a new feature or modifying existing behavior?"

## Integration

This skill can be:
- **Invoked manually**: `/ambiguity-gate [request]` — analyze a specific request
- **Integrated into routing skills**: Insert as a pre-check step before agent delegation when request complexity warrants it

Routing skill integration example:
```
1. Run ambiguity-gate on user request
2. If score > 0.5: surface questions, wait for response, re-run gate
3. If score ≤ 0.5: proceed with normal routing
```

## When NOT to Use

Skip this skill for:
- Simple, one-line questions ("What does X do?")
- One-line fixes with clear scope ("Fix the typo in line 42")
- Well-defined bug reports with reproduction steps and expected behavior
- Requests with explicit acceptance criteria already stated
- Follow-up requests that clarify a previous ambiguous request

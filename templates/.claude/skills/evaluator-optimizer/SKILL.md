---
name: evaluator-optimizer
description: Parameterized evaluator-optimizer loop for quality-critical output with configurable rubrics
scope: core
user-invocable: false
---

# Evaluator-Optimizer Skill

## Purpose

General-purpose iterative refinement loop. A generator agent produces output, an evaluator agent scores it against a configurable rubric, and the loop continues until the quality gate is met or max iterations are reached.

This skill generalizes the worker-reviewer-pipeline pattern beyond code review to any domain requiring quality-critical output: documentation, architecture decisions, test plans, configurations, and more.

## Configuration Schema

```yaml
evaluator-optimizer:
  generator:
    agent: {subagent_type}       # Agent that produces output
    model: sonnet                 # Default model
  evaluator:
    agent: {subagent_type}       # Agent that reviews output
    model: opus                   # Evaluator benefits from stronger reasoning
  rubric:
    - criterion: {name}
      weight: {0.0-1.0}
      description: {what to evaluate}
  quality_gate:
    type: all_pass | majority_pass | score_threshold
    threshold: 0.8                # For score_threshold type
  max_iterations: 3               # Default, hard cap: 5
```

### Pre-Negotiation (Sprint Contract Pattern)

Optional phase where generator and evaluator agree on rubric interpretation before the first iteration. Inspired by Anthropic's harness design for long-running applications.

```yaml
evaluator-optimizer:
  pre_negotiation:
    enabled: true              # Default: false
    rounds: 1                  # Negotiation rounds (1-2)
  generator:
    agent: fe-design-expert
    ...
```

When enabled:
1. Generator receives the rubric and proposes its interpretation + planned approach
2. Evaluator reviews and may adjust rubric weights or add clarifications
3. Both proceed with aligned expectations, reducing wasted iterations

Use when: tasks requiring 3+ iterations consistently, or when generator-evaluator score disagreements exceed 0.3.

### Evaluator Calibration

Anthropic's harness design research identifies evaluator leniency as a key failure mode: LLMs default to generous scoring, especially when evaluating output from the same model family. Counter-measures:

**Skepticism Prompting**: Include explicit instructions in the evaluator prompt:
- "Default to skepticism. A 'pass' should require clear evidence, not absence of issues."
- "Score as if you are reviewing code that will run in production with real users."
- "When uncertain between pass and fail, choose fail and explain what evidence would change your mind."

**Anti-Self-Praise Bias**: When generator and evaluator share the same model family (e.g., both Claude), add:
- "You are reviewing another agent's work, not your own. Do not give credit for intent — only for execution."
- "Identify at least one concrete improvement, even for high-quality output."

**Calibration via Rubric Examples**: Each rubric criterion SHOULD include a `fail_example` alongside the description:

```yaml
rubric:
  - criterion: error_handling
    weight: 0.25
    description: "All error paths handled with meaningful messages"
    fail_example: "Generic try/catch with console.log(error) — no recovery, no user-facing message"
```

Adding `fail_example` anchors the evaluator's scale, reducing score inflation by ~20% (based on Anthropic's internal testing).

### Conditional Evaluator (Cost Optimization)

Not every task justifies evaluator overhead. Skip the evaluator loop for tasks within the model's reliable capability range. From Anthropic's research: "Worth cost when tasks sit beyond baseline model capability; unnecessary overhead for problems within model's reliable range."

```yaml
evaluator-optimizer:
  conditional:
    enabled: true
    skip_when:
      - task_complexity: low        # Simple, well-defined tasks
      - generator_confidence: high  # Generator self-reports high confidence
      - historical_pass_rate: 0.9   # Same task type historically passes first try
```

When `conditional.enabled: true` and ANY `skip_when` condition is met, the evaluator is skipped and the generator's first output is returned directly. This reduces token cost by ~40% for straightforward tasks.

**Decision matrix**:

| Task Type | Complexity | Evaluator? |
|-----------|-----------|------------|
| Simple file rename, config change | Low | Skip |
| Standard CRUD implementation | Medium | Run |
| Complex architecture, security-critical | High | Run with pre-negotiation |
| Previously failed task retry | Any | Always run |

### Parameter Details

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `generator.agent` | Yes | — | Subagent type that produces output |
| `generator.model` | No | `sonnet` | Model for generation |
| `evaluator.agent` | Yes | — | Subagent type that evaluates output |
| `evaluator.model` | No | `opus` | Model for evaluation (stronger reasoning preferred) |
| `rubric` | Yes | — | List of evaluation criteria with weights |
| `quality_gate.type` | No | `score_threshold` | Gate strategy |
| `quality_gate.threshold` | No | `0.8` | Score threshold (for `score_threshold` type) |
| `max_iterations` | No | `3` | Max refinement loops (hard cap: 5) |

### Model Selection Guidance

For model selection within the evaluator-optimizer loop, follow the [reasoning-sandwich](/skills/reasoning-sandwich) pattern:

- **Generator**: Use `sonnet` (default) — optimized for content generation
- **Evaluator**: Use `opus` (default) — benefits from stronger reasoning for quality assessment
- **Override**: For simpler domains, `sonnet`/`sonnet` is acceptable; for critical domains, consider `opus`/`opus`

## Quality Gate Types

| Type | Behavior |
|------|----------|
| `all_pass` | Every rubric criterion must pass |
| `majority_pass` | >50% of weighted criteria pass |
| `score_threshold` | Weighted average score >= threshold |

### Gate Evaluation Logic

- **all_pass**: Each criterion scored individually. All must receive `pass: true`.
- **majority_pass**: Sum weights of passing criteria. If > 0.5 of total weight, gate passes.
- **score_threshold**: Compute weighted average: `sum(score_i * weight_i) / sum(weight_i)`. Compare against threshold.

## Workflow

```
1. Generator produces output
   → Orchestrator spawns generator agent with task prompt
   → Generator returns output artifact

2. Evaluator scores against rubric
   → Orchestrator spawns evaluator agent with:
     - The output artifact
     - The rubric criteria
     - Instructions to produce verdict JSON
   → Evaluator returns structured verdict

3. Quality gate check:
   - PASS → return output + final verdict
   - FAIL → extract feedback, append to generator prompt → iteration N+1

4. Max iterations reached → return best output + warning
   → "Best" = output from iteration with highest weighted score
```

### Iteration Flow Diagram

```
┌─────────────────────────────────────────────────┐
│                  Orchestrator                    │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Generate  │───→│ Evaluate │───→│  Gate    │  │
│  │ (iter N)  │    │          │    │  Check   │  │
│  └──────────┘    └──────────┘    └────┬─────┘  │
│       ↑                               │         │
│       │         ┌──────────┐    FAIL  │  PASS   │
│       └─────────│ Feedback │←────────┘    │     │
│                 └──────────┘              ↓     │
│                                     Return      │
└─────────────────────────────────────────────────┘
```

## Stopping Criteria Display

```
[Evaluator-Optimizer]
├── Generator: {agent}:{model}
├── Evaluator: {agent}:{model}
├── Max iterations: {max_iterations} (hard cap: 5)
├── Quality gate: {type} (threshold: {threshold})
└── Rubric: {N} criteria
```

Display this at the start of the loop to provide transparency into the refinement configuration.

## Verdict Format

The evaluator MUST return a structured verdict in this format:

```json
{
  "status": "pass | fail",
  "iteration": 2,
  "score": 0.85,
  "rubric_results": [
    {"criterion": "clarity", "pass": true, "score": 0.9, "feedback": "Clear structure and logical flow"},
    {"criterion": "accuracy", "pass": true, "score": 0.8, "feedback": "All facts verified, one minor imprecision in section 3"}
  ],
  "improvement_summary": "Section 3 terminology tightened. Examples added to section 2."
}
```

### Verdict Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | `pass` or `fail` | Overall quality gate result |
| `iteration` | number | Current iteration number (1-indexed) |
| `score` | number (0.0-1.0) | Weighted average score across all criteria |
| `rubric_results` | array | Per-criterion evaluation details |
| `improvement_summary` | string | Summary of changes from previous iteration (empty on iteration 1) |

## Domain Examples

| Domain | Generator | Evaluator | Rubric Focus |
|--------|-----------|-----------|--------------|
| Code review | `lang-*-expert` | opus reviewer | Correctness, style, security |
| Documentation | `arch-documenter` | opus reviewer | Completeness, clarity, accuracy |
| Architecture | Plan agent | opus reviewer | No SPOFs, no circular deps |
| Test plans | `qa-planner` | `qa-engineer` | Coverage, edge cases, feasibility |
| Test coverage | `qa-writer` | `qa-engineer` + coverage tool | `coverage >= target%` |
| Agent creation | `mgr-creator` | opus reviewer | Frontmatter validity, R006 compliance |
| Security audit | `sec-codeql-expert` | opus reviewer | Vulnerability coverage, false positive rate |

### Example: Documentation Review

```yaml
evaluator-optimizer:
  generator:
    agent: arch-documenter
    model: sonnet
  evaluator:
    agent: general-purpose
    model: opus
  rubric:
    - criterion: completeness
      weight: 0.3
      description: All sections present, no gaps in coverage
    - criterion: clarity
      weight: 0.3
      description: Clear language, no ambiguity, proper examples
    - criterion: accuracy
      weight: 0.25
      description: All technical details correct and verifiable
    - criterion: consistency
      weight: 0.15
      description: Consistent terminology, formatting, and style
  quality_gate:
    type: score_threshold
    threshold: 0.8
  max_iterations: 3
```

### Example: Code Implementation

```yaml
evaluator-optimizer:
  generator:
    agent: lang-typescript-expert
    model: sonnet
  evaluator:
    agent: general-purpose
    model: opus
  rubric:
    - criterion: correctness
      weight: 0.35
      description: Code compiles, logic is correct, edge cases handled
      fail_example: "Missing null check on user input causes runtime crash"
    - criterion: style
      weight: 0.2
      description: Follows project conventions, clean and readable
    - criterion: security
      weight: 0.25
      description: No injection risks, proper input validation
    - criterion: performance
      weight: 0.2
      description: No unnecessary allocations, efficient algorithms
  quality_gate:
    type: all_pass
  max_iterations: 3
```

### Domain: Test Coverage Optimization

```yaml
evaluator-optimizer:
  generator:
    agent: qa-writer
    model: sonnet
  evaluator:
    agent: qa-engineer
    model: sonnet
  rubric:
    - criterion: line_coverage
      weight: 0.4
      description: "Percentage of code lines exercised by tests"
    - criterion: branch_coverage
      weight: 0.3
      description: "Percentage of conditional branches tested"
    - criterion: edge_cases
      weight: 0.2
      description: "Critical edge cases explicitly tested"
    - criterion: test_quality
      weight: 0.1
      description: "Tests are meaningful, not just hitting lines"
  quality_gate:
    type: score_threshold
    threshold: 0.8
  max_iterations: 5
  parameters:
    target_coverage: 80        # Minimum coverage percentage
    max_iterations: 5          # Hard cap (matches skill-level cap)
```

**Workflow**:
1. qa-writer generates test cases targeting uncovered code
2. qa-engineer runs tests and measures coverage
3. If coverage < target: qa-writer generates additional tests for uncovered paths
4. Repeat until target reached or max_iterations exhausted

**Parameters**:
| Parameter | Default | Description |
|-----------|---------|-------------|
| `target_coverage` | 80% | Minimum acceptable coverage |
| `max_iterations` | 5 | Hard cap on refinement loops |

## Integration

| Rule | Integration |
|------|-------------|
| R009 | Generator and evaluator run sequentially (dependent — evaluator needs generator output) |
| R010 | Orchestrator configures and invokes the loop; generator and evaluator agents execute via Agent tool |
| R007 | Each iteration displays agent identification for both generator and evaluator |
| R008 | Tool calls within generator/evaluator follow tool identification rules |
| R013 | Ecomode: return verdict summary only, skip per-criterion details |
| R015 | Display configuration block at loop start for intent transparency |

## Ecomode Behavior

When ecomode is active (R013), compress output:

**Normal mode:**
```
[Evaluator-Optimizer] Iteration 2/3
├── Generator: lang-typescript-expert:sonnet → produced 45-line module
├── Evaluator: general-purpose:opus → scored 0.85
├── Rubric: correctness ✓(0.9), style ✓(0.8), security ✓(0.85), performance ✓(0.8)
└── Gate: score_threshold(0.8) → PASS
```

**Ecomode:**
```
[EO] iter 2/3 → 0.85 → PASS
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Generator fails to produce output | Retry once with simplified prompt; if still fails, abort with error |
| Evaluator returns malformed verdict | Retry once; if still malformed, treat as fail with score 0.0 |
| Max iterations reached without passing | Return best-scored output with warning: "Quality gate not met after {N} iterations" |
| Rubric has zero total weight | Reject configuration, report error before starting loop |
| Hard cap exceeded in config | Clamp `max_iterations` to 5, emit warning |

## Constraints

- This skill does NOT use `context: fork` — it operates within the caller's context
- Generator and evaluator MUST be different agent invocations (no self-review)
- The evaluator prompt MUST include the full rubric to ensure consistent scoring
- Iteration state (best score, best output) is tracked by the orchestrator
- The hard cap of 5 iterations prevents runaway refinement loops
- For multi-sprint runs (5+ iterations), consider context reset: spawn a fresh evaluator agent rather than continuing with degraded context. The pipeline skill supports this via `context: fork` on individual steps. Anthropic's research confirms "context resets provide clean slates superior to compaction" for long-running evaluation.

## Domain Examples

### UI Generation (Anti-AI-Slop)

For UI/design generation tasks, use weighted rubrics that penalize generic AI patterns:

```yaml
evaluator-optimizer:
  generator:
    agent: fe-design-expert
    model: sonnet
  evaluator:
    agent: fe-design-expert
    model: opus
  rubric:
    - criterion: originality
      weight: 0.40
      description: "No stock patterns (centered hero + 3-card grid). Unique layout, typography choices, color relationships."
    - criterion: craft
      weight: 0.35
      description: "Intentional spacing, consistent type scale, purposeful color usage. Details that show care."
    - criterion: functionality
      weight: 0.25
      description: "Accessibility (WCAG 2.1 AA), responsive behavior, interaction states."
  quality_gate:
    type: score_threshold
    threshold: 0.85
  pre_negotiation:
    enabled: true
```

Weight ordering (originality > craft > functionality) follows Anthropic's anti-slop principle: functionality is table stakes, but originality and craft distinguish quality output from generic AI generation.

Integration: Works with [impeccable-design](/skills/impeccable-design) skill for design language enforcement.

### Harness Eval Preset

The `harness-eval` skill provides a structured 15-task SE benchmark rubric that can be used as a preset for the evaluator-optimizer pipeline. When invoked via `/omcustom:harness-eval`, the harness rubric dimensions (Test Coverage 30%, Architecture 25%, Error Handling 25%, Extensibility 20%) are loaded as the sprint contract criteria.

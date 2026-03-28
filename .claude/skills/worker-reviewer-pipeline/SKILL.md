---
name: worker-reviewer-pipeline
description: Worker-Reviewer iterative pipeline for quality-critical code with review cycles
scope: core
context: fork
user-invocable: false
---

# Worker-Reviewer Pipeline Skill

Defines an iterative Worker→Reviewer pipeline where one agent implements changes and another reviews them. The cycle repeats until quality criteria are met or max iterations reached.

**Orchestrator-only** — only the main conversation activates this pipeline (R010). Worker and Reviewer are subagents.

## When to Activate

| Condition | Activate? |
|-----------|-----------|
| Quality-critical code changes (auth, security, payments) | Yes |
| Complex refactoring touching 5+ files | Yes |
| User explicitly requests review cycle | Yes |
| Simple file edits, config changes | No |
| Documentation-only changes | No |

## Pipeline Spec Format

```yaml
pipeline:
  name: feature-review
  description: Implement and review a feature

worker:
  agent: lang-typescript-expert    # or appropriate specialist
  model: sonnet
  prompt: "Implement the feature based on requirements"

reviewer:
  agent: lang-typescript-expert    # can be same or different specialist
  model: opus                      # often higher model for review
  prompt: "Review implementation for correctness, security, performance"

config:
  max_iterations: 3          # Max review cycles (default: 3)
  quality_gate: all_pass     # all_pass | majority_pass | custom
  auto_commit: false         # Auto-commit on quality pass (via mgr-gitnerd)
```

## Execution Flow

```
1. Orchestrator activates pipeline
2. Worker agent implements changes
3. Reviewer agent reviews Worker's output
4. Reviewer produces verdict:
   - PASS → Pipeline complete, proceed to next step
   - FAIL(issues) → Worker receives feedback, re-implements
5. Repeat 3-4 until PASS or max_iterations reached
6. If max_iterations reached without PASS:
   - Report partial results to user
   - Recommend manual review
```

## Review Verdict Format

Reviewer MUST output a structured verdict:

```
[Review Verdict]
├── Status: PASS | FAIL
├── Iteration: {n}/{max}
├── Issues Found: {count}
│   ├── [Critical] {description} — {file:line}
│   ├── [Major] {description} — {file:line}
│   └── [Minor] {description} — {file:line}
└── Summary: {one-line}
```

## Quality Gates

| Gate | Criteria |
|------|----------|
| `all_pass` | Zero Critical or Major issues (default) |
| `majority_pass` | Zero Critical, ≤2 Minor issues allowed |
| `custom` | User-defined in pipeline spec |

## Integration with Agent Teams (R018)

When Agent Teams is enabled, the pipeline SHOULD use Agent Teams:

```
TeamCreate("review-pipeline")
  Worker (team member) ←→ Reviewer (team member)
  SendMessage for feedback exchange
  Shared TaskList for tracking issues
```

When Agent Teams is NOT available, falls back to sequential Agent tool calls:
```
Agent(worker) → result → Agent(reviewer) → verdict → Agent(worker) → ...
```

## Stopping Criteria Display

Before execution, display:
```
[Worker-Reviewer Pipeline]
├── Max iterations: {max_iterations} (default: 3, hard cap: 5)
├── Quality gate: {pass_threshold}% approval required
└── Early stop: All reviewers approve → stop immediately
```

## Display Format

```
[Pipeline] feature-review — Worker: lang-typescript-expert, Reviewer: lang-typescript-expert
[Iteration 1/3] Worker implementing...
[Iteration 1/3] Reviewer reviewing...
[Review] FAIL — 2 issues (1 Major, 1 Minor)
[Iteration 2/3] Worker fixing issues...
[Iteration 2/3] Reviewer re-reviewing...
[Review] PASS — 0 issues
[Pipeline Complete] 2 iterations, quality gate passed
```

## Common Pipeline Templates

### Security-Critical Feature
```yaml
worker: {agent: lang-typescript-expert, model: sonnet}
reviewer: {agent: lang-typescript-expert, model: opus}
config: {max_iterations: 3, quality_gate: all_pass}
```

### Cross-Language Integration
```yaml
worker: {agent: lang-golang-expert, model: sonnet}
reviewer: {agent: be-go-backend-expert, model: opus}
config: {max_iterations: 2, quality_gate: all_pass}
```

### Quick Review
```yaml
worker: {agent: lang-python-expert, model: sonnet}
reviewer: {agent: lang-python-expert, model: sonnet}
config: {max_iterations: 1, quality_gate: majority_pass}
```

## Integration

| Rule | Integration |
|------|-------------|
| R009 | Worker and Reviewer can run in parallel with other pipelines |
| R010 | Pipeline orchestration runs only in main conversation |
| R015 | Display pipeline plan and review verdicts transparently |
| R018 | Agent Teams preferred when available for Worker↔Reviewer messaging |
| pipeline-guards | Max iterations and timeout enforced by pipeline-guards |
| model-escalation | Worker failures feed into escalation tracking |
| stuck-recovery | Repeated FAIL verdicts trigger stuck detection advisory |

## Limitations

- Max 3 iterations by default (configurable, hard cap at 5 via pipeline-guards)
- Worker and Reviewer must be different agent instances (same type allowed)
- Nested pipelines not supported (use dag-orchestration for complex flows)
- Pipeline does not auto-commit; orchestrator decides post-pipeline actions

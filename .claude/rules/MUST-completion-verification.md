# [MUST] Completion Verification Rules

> **Priority**: MUST | **ID**: R020

## Core Rule

Before declaring any task `[Done]`, verify completion against task-type-specific criteria. False completion declarations erode trust and cause downstream failures.

## Task-Type Completion Matrix

| Task Type | REQUIRED Verification Before [Done] |
|-----------|-------------------------------------|
| Release | All issues closed, version bumped, PR merged, GitHub Release created; **External automation verified**: `.github/workflows/` listed AND `gh run list --limit 10` checked for auto-publish workflows |
| Implementation | Code compiles/passes lint, tests pass (if exist), no TODO markers left |
| Documentation | Links valid, counts accurate, cross-references updated |
| Git Operations | Operation succeeded (check exit code), working tree clean |
| Code Review | All findings addressed or explicitly deferred with justification |
| Agent/Skill Creation | Frontmatter valid, referenced skills exist, routing updated |
| UI/Frontend | Browser render verified (dev server running + page loaded), no console errors, visual output matches intent; **CSS/style changes**: capture before/after visual diff or screenshot; type-check passing alone is NOT sufficient |

## Optional: Quantitative Evidence (advisory, added v0.114.0, #1034)

For complex agent invocations or multi-step workflows, attach 4-metric evidence to [Done] declarations as supplementary evidence (NOT a binary gate):

| Metric | Source | Format |
|--------|--------|--------|
| correctness | task-type matrix above | pass/fail |
| step_ratio | observed/ideal step count | ratio (lower better) |
| tool_call_ratio | observed/ideal tool calls | ratio (lower better) |
| latency_ratio | observed/ideal latency | ratio (lower better) |

### When to Apply
- Dynamic agent variants comparison (e.g., mgr-creator output validation)
- Long-running workflows where efficiency regression matters
- A/B testing of agent prompts or configurations

### Workflow
1. Run task → collect trajectory (steps, tool_calls, latency)
2. Compare to ideal trajectory annotation (see `agent-eval-framework` skill)
3. Attach metric values to [Done] contract as evidence

### Cross-references
- Skill: `agent-eval-framework` (4-metric framework + ideal trajectory schema)
- Guide: `guides/agent-eval/README.md` (measurement methodology)
- Issue: #1034

## Self-Check (Before Declaring Done)

Before [Done]: (1) Verify ACTUAL outcome not just attempt — "ran command" ≠ "succeeded". (2) Check task-type criteria above. (3) No unchecked items. (4) Would bet $100 it's complete.

<!-- DETAIL: Self-Check box
1. Did I verify ACTUAL outcome? "I ran the command" ≠ "the command succeeded" → YES: Continue / NO: Verify first
2. Does task type have specific criteria? YES: Check each / NO: Apply general verification
3. Any unchecked items? YES: Complete or defer with reason / NO: Proceed to [Done]
4. Would I bet $100 this is truly complete? YES: Declare [Done] / NO: Identify uncertain and verify
-->

## Subagent Self-Report Verification — Verify "pre-existing" claims against base branch before acceptance. See details via Read tool.

<!-- DETAIL: Subagent Self-Report Verification

Subagents often report failures as "pre-existing", "baseline", or "unchanged". These claims MUST be verified against the base branch before acceptance.

| Subagent Claim | Required Verification |
|----------------|----------------------|
| "X test already failing on base" | `git stash && git checkout {base} && run test X && compare` |
| "This warning is pre-existing" | `git log -S "warning-text" {base}` or run on clean checkout |
| "File was unchanged" | `git diff {base}..HEAD -- {file}` |
| "Dependency issue not from this PR" | `git show {base}:package.json` compare |

Never accept "pre-existing" without direct base-branch evidence. A false "pre-existing" claim can mask a regression introduced by the current change.
-->

## Common False Completion Patterns — 8 anti-patterns including "Command executed" without exit code check, "Waiting for manual publish" when CI auto-publishes, "UI changes done" without browser render. See full table via Read tool.

<!-- DETAIL: Common False Completion Patterns

| Pattern | Reality | Fix |
|---------|---------|-----|
| "Command executed" | Exit code not checked | Check `$?` or tool output |
| "File created" | Content not verified | Read file back, verify content |
| "PR created" | CI not checked | Wait for CI, verify green |
| "Issue closed" | Related issues not updated | Check parent epic, cross-refs |
| "Tests pass" | Only ran subset | Run full test suite |
| "Waiting for manual publish" | External CI/CD auto-publishes on merge | Check `.github/workflows/` BEFORE assuming manual step |
| "Subagent said pre-existing" | Claim not verified against base branch | Run test on base branch, compare directly |
| "UI changes done" / "CSS updated" | type-check passes but browser render not verified; visual output unknown | Start dev server, open browser, confirm visual output; capture screenshot or describe what was seen |
-->

## Completion Contract Format — [Contract] + [Done] with criterion/evidence pairs. See template via Read tool.

<!-- DETAIL: Completion Contract Format

For complex tasks, declare completion contract upfront:

```
[Contract] Task: {name}
├── Criterion 1: {specific, verifiable condition}
├── Criterion 2: {specific, verifiable condition}
└── Criterion N: {specific, verifiable condition}
```

Then at completion:

```
[Done] Task: {name}
├── ✓ Criterion 1: {evidence}
├── ✓ Criterion 2: {evidence}
└── ✓ Criterion N: {evidence}
```
-->

## Autonomous Mode Entry Checklist — 5-step inventory (workflows, runs, publish targets, manual points, cross-reference). See full checklist via Read tool.

<!-- DETAIL: Autonomous Mode Entry Checklist

When entering autonomous mode (user grants extended execution without per-step confirmation), perform this inventory BEFORE first action:

1. **Workflow inventory**: `ls .github/workflows/` — identify auto-publish, auto-tag, release, docs-sync, CI workflows
2. **Recent runs**: `gh run list --limit 10` — check success/failure patterns of automated workflows
3. **External publish targets**: Check if npm/PyPI/Docker Hub/GitHub Releases are auto-triggered on merge
4. **Manual intervention points**: Identify which steps require human approval vs. fully automated
5. **Cross-reference with task**: Which workflows will the planned work trigger?

Record findings in session context. Failure to inventory automation is a R020 violation (unknown external state = unverifiable completion).

### Cross-reference

Related memory records:
- `feedback_github_workflows_inventory.md` — original incident (v0.87.2~v0.88.0 session)
- `feedback_subagent_pre_existing_claims.md` — subagent false-positive pattern
-->

## Integration

| Rule | Interaction |
|------|-------------|
| R003 | [Done] status format now requires verification evidence |
| R010 | Orchestrator verifies subagent completion claims |
| R017 | Structural changes require sauron verification before [Done] |

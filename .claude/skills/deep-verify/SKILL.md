---
name: deep-verify
description: Multi-angle release quality verification using parallel expert review teams
scope: core
version: 1.1.0
user-invocable: true
effort: high
---

# /deep-verify — Multi-Angle Release Quality Verification

## Purpose

Performs deep cross-iterative verification of code changes before release, using multiple independent review perspectives to catch issues that single-pass review misses.

## Usage

```
/deep-verify [branch|PR]
```

If no argument, verifies current branch against its base (usually `develop`).

## Workflow

### Round 1: Baseline Assessment
- Gather the full diff (`git diff develop...HEAD`)
- Run test suite, lint, and type check
- Collect results as baseline

### Round 2: Parallel Expert Review (6 agents)
Spawn 6 parallel review agents, each with a different focus:

1. **Correctness Reviewer** — Logic errors, edge cases, off-by-one, null handling
2. **Security Reviewer** — Injection, auth bypass, data exposure, OWASP top 10
3. **Performance Reviewer** — O(n^2) loops, unbounded queries, memory leaks, missing indexes
4. **Integration Reviewer** — API contract breaks, migration safety, cross-module side effects
5. **Philosophy Reviewer** — Project concept/metaphor alignment, separation of concerns (R006), orchestrator rules (R010), advisory-first enforcement (R021), compilation metaphor integrity
6. **Regression & Performance Reviewer** — Feature regression risk, API contract preservation, query performance impact, index effectiveness, algorithm complexity at realistic scale

Each agent receives the full diff and returns findings as structured JSON:
```json
{
  "severity": "HIGH|MEDIUM|LOW",
  "file": "path/to/file",
  "line": 42,
  "finding": "description",
  "suggestion": "fix suggestion"
}
```

### Round 3: Cross-Verification
- Merge all findings from Round 2
- Deduplicate (same file+line+similar finding = 1 entry)
- For each HIGH finding: spawn a verification agent to confirm or dismiss as FALSE POSITIVE
- Evidence-based: each confirmation must include proof (e.g., `toQuery()` output, test result)

### Round 4: FALSE POSITIVE Filter
- Remove confirmed false positives with evidence
- Remaining findings are CONFIRMED issues

### Round 5: Fix Application
- For each CONFIRMED HIGH/MEDIUM finding: spawn fix agent
- Run tests after fixes
- If tests fail: revert fix, report as "needs manual review"

### Round 6: Final Verification
- Re-run full test suite
- Re-run lint and type check
- Generate summary report

### Round 7: Philosophy & Regression Gate
- Verify all changes align with project's compilation metaphor (Skills=source, Agents=artifacts, Rules=spec)
- Check separation of concerns: no agents containing skill logic, no skills with agent definitions
- Verify orchestrator rules: no new file writes from orchestrator context
- Check advisory-first: no new hard-blocking hooks introduced
- Confirm no feature regressions: existing APIs preserved, test coverage maintained
- Performance sanity: no O(n^2) on large datasets, no missing indexes for new queries
- If any CONCERN or VIOLATION found: report for manual review before release

## Output Format

```
╔══════════════════════════════════════════════════════╗
║  Deep Verification Report                            ║
╠══════════════════════════════════════════════════════╣
║  Branch: {branch}                                    ║
║  Commits: {count}                                    ║
║  Files changed: {count}                              ║
╠══════════════════════════════════════════════════════╣
║  Findings:                                           ║
║    HIGH:   {n} ({confirmed} confirmed, {fp} FP)      ║
║    MEDIUM: {n} ({confirmed} confirmed, {fp} FP)      ║
║    LOW:    {n}                                       ║
╠══════════════════════════════════════════════════════╣
║  Fixes Applied: {n}                                  ║
║  Tests: {pass}/{total} passing                       ║
║  Verdict: READY / NEEDS REVIEW / BLOCKED             ║
║  Philosophy: ALIGNED / {n} CONCERNS                  ║
║  Regression: CLEAN / {n} RISKS                       ║
╚══════════════════════════════════════════════════════╝
```

## Notes

- Round 2 agents use `model: sonnet` for cost efficiency
- Round 3 verification agents use `model: opus` for reasoning depth
- FALSE POSITIVE filtering is critical — previous releases showed 80%+ FP rate on automated review
- This skill replaces ad-hoc cross-verification with a repeatable process
- Round 7 philosophy check references CLAUDE.md architecture section and R006/R010/R021 rules
- Regression check compares function signatures, export lists, and test counts against develop baseline

---
name: omcustom:goal
description: Disciplined goal-to-execution workflow for any user task. Parses objective, asks only for materially missing requirements via ambiguity-gate, inspects repo via idea, plans via sdd-dev or deep-plan, executes safely under project conventions, verifies completion per R020, and reports changed files with evidence. Use when user invokes /goal <task>.
version: 1.0.0
scope: core
---

# /goal — Disciplined Goal-to-Execution Workflow

Apply project discipline (planning, verification, cleanup, review) to any user-provided task. Acts as a thin orchestrator that routes to existing oh-my-customcode skills rather than duplicating logic.

## Usage

```
/goal <task description>
```

Example: `/goal Add a /weekly-summary command that aggregates last 7 days of git activity`

## Workflow

1. **Parse objective**: Treat `<task>` as the concrete goal. Do NOT expand scope beyond what was asked.
2. **Gap detection**: Invoke `ambiguity-gate` skill. Ask only for materially missing or risky requirements — no over-clarification on details that can be inferred.
3. **Repo inspection**: Invoke `idea` skill (NL-intent codebase analysis) to identify relevant files, dependencies, and existing assets.
4. **Plan generation** (scope-dependent):
   - Trivial scope (single file, <30 LOC, no API design): proceed with brief inline plan.
   - Non-trivial scope: invoke `sdd-dev` or `deep-plan` for research-validated planning.
5. **Safe execution**: Follow R001 (safety), R009 (parallel), R010 (delegation). Delegate ALL file modifications to specialist agents.
6. **Completion verification**: Apply R020 — verify ACTUAL outcome before declaring `[Done]`. Run task-type-specific checks (lint, build, test).
7. **Report**: Output changed files, verification evidence, and remaining risks.

## Output Format

```
[Goal] {original task verbatim}
[Plan] {brief plan or reference to deep-plan/sdd-dev output}
[Changes] {file list with paths}
[Verified] {evidence — exit codes, test counts, build output}
[Risks] {remaining concerns or "none"}
```

## When to Use

- Generic multi-step task without obvious specialist routing
- User wants a single, memorable entry point for "do this task with full discipline"
- Work that benefits from planning + verification + structured reporting

## When NOT to Use

| Scenario | Use Instead |
|----------|-------------|
| Pure research/analysis | `research`, `idea` |
| Specialist domain task | Routing skills (`dev-lead-routing`, `de-lead-routing`, `qa-lead-routing`) |
| Trivial single-file edit | Delegate directly to specialist agent |
| Bug debugging | `superpowers:systematic-debugging` |

## Integration with Existing Skills

| Stage | Skill | Role |
|-------|-------|------|
| Gap detection | `ambiguity-gate` | Score request clarity, ask only critical gaps |
| Repo inspection | `idea` | NL-intent codebase analysis |
| Planning (research-validated) | `deep-plan` | research → plan → verify cycle |
| Planning (SDD discipline) | `sdd-dev` | Stage gates with planning-first workflow |
| Verification | `superpowers:verification-before-completion` | Evidence before assertions |
| Reporting | `result-aggregation` | Concise output composition |

## Design Notes

This skill is intentionally a **thin wrapper / orchestrator**. It does NOT duplicate planning, gap-detection, or verification logic. Its value:

- Single memorable command for the disciplined workflow
- Stable entry point that routes to whichever underlying skills are best at the moment
- Documented contract that callers can rely on regardless of internal skill evolution

If a future skill replaces `idea` or `sdd-dev`, only the integration table updates — `/goal` remains stable.

## Cross-References

- Issue: #1109 — Port /goal workflow to Claude Code skill surface
- Rules: R001 (safety), R003 (response style), R010 (delegation), R020 (completion verification)
- Original Codex /goal workflow this ports from: discipline-first goal execution

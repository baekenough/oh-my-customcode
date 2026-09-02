---
title: FSD (Full Self Driving)
type: skill
scope: harness
updated: 2026-09-03
sources:
  - .claude/skills/fsd/SKILL.md
related:
  - [[goal]]
  - [[pipeline]]
  - [[homework]]
  - [[omcustom-loop]]
  - [[mgr-gitnerd]]
  - [[R001]]
  - [[R009]]
  - [[R010]]
  - [[R015]]
  - [[R017]]
  - [[R020]]
---

# FSD (Full Self Driving)

Autonomous release loop — processes all auto-dev-eligible GitHub issues **and open PRs** until both are exhausted, by repeatedly running `/pipeline auto-dev`, `/homework`, and open PR processing.

## Overview

Thin alias / orchestrator skill. FSD expands into:

```
/goal "모든 이슈와 PR이 처리될 때까지" /loop "/pipeline auto-dev -> /homework -> open PR processing"
```

It does not implement loop logic, issue-polling, release steps, or verification itself — it delegates entirely to [[goal]], [[pipeline]], [[homework]], and [[mgr-gitnerd]]. The loop converges naturally when the auto-dev-eligible issue set reaches zero **and** all open PRs are merged or deferred.

Extracted from the manual pattern used in Session 114 (2026-06-09), which ran 2 iterations (v0.177.0 and v0.178.0) before converging.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:fsd`
- **Argument hint**: `[<max-releases>]`
- **Version**: 0.1.0
- **Effort**: high

## Usage

```bash
/omcustom:fsd        # Run until all eligible issues and open PRs are exhausted
/omcustom:fsd 3      # Optional: cap at N releases (default: unlimited)
```

## Iteration Flow

Each FSD iteration:

```
[FSD Iteration N]
├── /pipeline auto-dev     → one release (PR → merge → npm publish → milestone close)
├── /homework              → retrospective 찐빠 audit gate (pauses for user confirmation if needed)
├── Open PR processing     → handle all open PRs (dependabot included)
└── Check: eligible issues = 0 AND open PRs = 0?
    ├── YES → [FSD Done] converged naturally
    └── NO  → next iteration
```

Issue eligibility follows `/pipeline auto-dev` label selection exactly — **included**: `verify-ready`, unlabeled candidates; **excluded**: `verify-done`, `needs-review`, `decision-needed`.

## Open PR Processing Rules

After each `/homework` gate, FSD processes all open PRs before checking convergence:

| PR State | Action |
|----------|--------|
| CI passing | Delegate merge to [[mgr-gitnerd]]; verify via `gh pr view` (R020) |
| Dependabot frozen-lockfile cascade (CI failing) | Run `bun install` to regenerate lockfile → merge after CI passes |
| Requires design judgment | Defer + surface to user; continue loop |
| User explicitly skipped | Respect skip per [R015](../rules/r015.md) directive persistence |

PR merge execution is always delegated to [[mgr-gitnerd]] ([R010](../rules/r010.md)). Post-merge ground-truth verification uses `gh pr view` ([R020](../rules/r020.md)).

## Loop Convergence

FSD converges when **both** conditions are met:

1. Auto-dev-eligible issue set = 0 (no `verify-ready` or unlabeled candidates)
2. Open PR set = 0 (all PRs merged or explicitly deferred)

Checking only issue eligibility and ignoring open PRs is insufficient for convergence.

## Safety and Discipline

FSD operates under full project rules without relaxation:

| Rule | Constraint |
|------|------------|
| [R001](../rules/r001.md) | Destructive ops require explicit approval; credential guardrails always active |
| [R009](../rules/r009.md) | Independent subtasks within each iteration run in parallel |
| [R010](../rules/r010.md) | All file modifications delegated to specialist subagents; mgr-gitnerd for git and PR merges |
| [R015](../rules/r015.md) | User directive persistence — explicitly skipped PRs are not retried |
| [R017](../rules/r017.md) | mgr-sauron must pass before any commit/push |
| [R020](../rules/r020.md) | Each release and PR merge verified via ground-truth checks before `[Done]` |

`/homework` is a mandatory retrospective gate between iterations — it is NOT skipped in automated mode. If homework requires user confirmation (e.g., to file a feedback issue), the loop pauses and waits.

### Pre-Flight and Commit Timeout Guardrails (#1644, #1645)

Two operational warnings were added to the skill body ahead of unattended loop entry:

- **Effective permission mode (#1644)**: the `mode: "bypassPermissions"` instruction on every Agent tool call is stated per [[r010]] Universal bypassPermissions, but that per-call parameter has been a no-op since CC v2.1.212, and project-scope `permissions.defaultMode` is now **ignored** as of CC v2.1.257 — so stating the instruction proves nothing about whether the loop will actually run unattended. Before entering the loop, FSD measures the effective mode: `jq -r '.permissions.defaultMode // "unset"' ~/.claude/settings.json`. If it is not `bypassPermissions`, the loop can stall mid-run on a permission prompt — relaunch with `--permission-mode bypassPermissions` or assume a human is watching. The corresponding [[pipeline]] `auto-dev` wiring is the pre-triage Phase 0.5 advisory gate (does not halt, only warns).
- **Commit delegation timeout (#1645)**: on the main worktree, `.husky/pre-commit` runs the full test suite (~165s measured) plus typecheck, lint, and CLAUDE.md count verification before a commit lands. The Bash tool's default 120000ms timeout kills a `git commit` delegation mid-hook with exit 143 (SIGTERM). FSD-driven commit delegations must specify Bash `timeout: 400000` (≈6.7 min); `--no-verify` is never an acceptable workaround for the timeout (R010 quality-gate bypass prohibition). See [[mgr-gitnerd]] "Commit Timeout Budget" for the full worktree-vs-main-checkout distinction.

### `.claude/hooks/**` Issues — Unattended-Loop Scope Split (v1.1.58)

Because FSD is an unattended loop with no live user to answer approval prompts, when [[pipeline]] `auto-dev`'s scope-selection R010 approval-required path pre-check finds an issue touching `.claude/hooks/**`, FSD does not request immediate approval mid-iteration. Instead the issue is **split off and deferred** from the current scope, the loop continues on the remaining eligible issues, and the deferred hooks issues are batched into a **single** approval question at the next `/homework` repeat-boundary gate. Once approved, [[r015]] directive persistence applies for the rest of the session for the same category. See [[pipeline]] "scope-selection Step 3: unattended-mode hooks-path deferral" for the pipeline-side half of this split.

## When to Use / Avoid

| Scenario | Use FSD? |
|----------|----------|
| Multiple eligible issues and/or open PRs, "let it run" autonomously | YES |
| Single targeted fix | NO — use `/pipeline auto-dev` directly |
| Issues require design decisions or stakeholder approval | NO |
| Only `decision-needed` / `needs-review` issues remain and no open PRs | NO — loop converges immediately |
| Cost-sensitive, large backlog | Inspect eligible set first |

## Relationships

- **Delegates to**: [[goal]] (objective wrapper + R020 verification), [[pipeline]] (auto-dev release pipeline per iteration), [[homework]] (retrospective gate per iteration), [[mgr-gitnerd]] (git operations and PR merges)
- **Session continuity**: [[omcustom-loop]] (SubagentStop hook keeps session alive during background agent work)
- **Rules**: [R001](../rules/r001.md), [R009](../rules/r009.md), [R010](../rules/r010.md), [R015](../rules/r015.md), [R017](../rules/r017.md), [R020](../rules/r020.md)

## Sources

- `.claude/skills/fsd/SKILL.md` — skill definition
- Content-drift resync 2026-09-03 (v1.1.59, #1644, #1645): added the Pre-Flight and Commit Timeout Guardrails subsection — effective permission mode must be measured before unattended entry (project-scope `defaultMode` ignored on CC v2.1.257+, cross-ref [[r010]]) and commit delegations require Bash `timeout: 400000` due to the main-worktree pre-commit hook's ~165s full test suite (cross-ref [[mgr-gitnerd]]).
- Content-drift resync 2026-09-03 (v1.1.60): added "`.claude/hooks/**` Issues — Unattended-Loop Scope Split" — FSD defers `.claude/hooks/**`-touching issues instead of interrupting the loop, batching a single approval question at the `/homework` gate (cross-ref [[pipeline]] scope-selection Step 3).

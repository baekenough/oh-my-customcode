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
[FSD Entry]              → write marker /tmp/.claude-fsd-$PPID
[FSD Iteration N]
├── /pipeline auto-dev     → one release (PR → merge → npm publish → milestone close)
├── /homework              → retrospective 찐빠 audit gate (pauses for user confirmation if needed)
├── Open PR processing     → handle all open PRs (dependabot included)
└── Check convergence: eligible issues = 0 AND open PRs = 0?
    ├── YES → [FSD Done] converged naturally → rm -f /tmp/.claude-fsd-$PPID
    └── NO  → cap reached or classifier block? → YES → [FSD Stop] → rm -f /tmp/.claude-fsd-$PPID
                                                → NO  → next iteration (re-write marker first)
```

Issue eligibility follows `/pipeline auto-dev` label selection exactly — **included**: `verify-ready`, unlabeled candidates; **excluded**: `verify-done`, `needs-review`, `decision-needed`.

### Unattended-Mode Marker — Deterministic Detection Signal (#1650 C)

`[[pipeline]]` `auto-dev`'s scope-selection Step 3 needs to know whether the run is unattended (to defer `.claude/hooks/**` approval requests). Until v1.1.60 this was decided by prose inference ("entered via `/fsd`"), which is not measurable. FSD now writes a marker file at entry:

```bash
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "/tmp/.claude-fsd-$PPID"
```

`$PPID` inside the Bash tool is the Claude Code process and is stable across calls (measured: identical across two calls). The marker is runtime state scoped by process ID under `/tmp` outside the project tree, so it falls under [[r010]]'s "Exception: Simple Tasks" **PPID-scoped `/tmp` runtime state marker carve-out** — the orchestrator writes/removes it directly, not via delegation. It is a distinct class from structured pipeline state (`/tmp/.claude-pipeline-{name}-{PPID}.json`), which remains delegated to `tracker-checkpoint` because its content requires validation rather than being a one-line signal.

`pipeline auto-dev`'s pre-triage Phase 0.6 measures the marker (or the `OMCUSTOM_UNATTENDED=1` env fallback for paths like `claude -p`/scheduled runs where a marker can't be pre-written) to derive `unattended_mode` state; scope-selection Step 3 uses that state to decide hooks-path deferral.

**Re-written every iteration + 6-hour stale guard:** at the start of every iteration FSD re-runs the same `printf` command to refresh the marker's mtime. Phase 0.6 treats a marker older than 360 minutes (6 hours) as **absent**, not present — a guard against a marker surviving a process crash or PID reuse and causing a later *manual* `/pipeline auto-dev` invocation in the same session to be misclassified as unattended.

**Cleared on every exit path:** `command rm -f "/tmp/.claude-fsd-$PPID"` runs regardless of how the loop ends — natural convergence (`[FSD Done]`), the release cap being reached, a safety-classifier block, or a user interrupt (`[FSD Stop]`). Leaving the marker behind on any of these paths would misclassify a later manual `/pipeline auto-dev` in the same session as unattended. `command` is prefixed because a shell with `rm` aliased to `trash` rejects `rm -f` (R005, measured).

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
| Cost-cap advisory | `CLAUDE_COST_CAP`-driven cost-cap advisory is a **notification, not a loop-stop signal** — when the gate surfaces it, FSD reports it and continues the loop rather than halting on it |

`/homework` is a mandatory retrospective gate between iterations — it is NOT skipped in automated mode. If homework requires user confirmation (e.g., to file a feedback issue), the loop pauses and waits.

**Homework submission-gate bundling (opt-in, #1652 #4):** the default contract presents the gate **every iteration**, as above. Only when the user explicitly instructs it during the session (e.g., "bundle the homework gate at convergence") or declares an unattended run with bundling specified may the loop record the homework artifact (`homework-{HHmmss}.md`) each iteration while presenting the `omcustom-feedback` Phase 4A submission gate just **once**, at convergence (or release-cap) time — alongside any deferred `.claude/hooks/**` approval question. Whether to bundle is a user decision, not something the orchestrator selects unilaterally — a v1.1.59/60 session where the orchestrator bundled on its own was retrospectively flagged as a skill-contract deviation. **Bundling is never derived from `unattended_mode`** (the marker/env state above) — the deterministic marker signal is used solely for `.claude/hooks/**` issue deferral in scope-selection; the sole trigger for homework-gate bundling is an explicit user instruction. Once instructed, [[r015]] directive persistence keeps the bundling choice for the rest of the session.

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
- Content-drift resync 2026-09-03 (v1.1.60, #1650 C / #1652 #4): added the "Unattended-Mode Marker — Deterministic Detection Signal" subsection (a `/tmp/.claude-fsd-$PPID` marker written at entry and removed at convergence replaces prose inference for `unattended_mode`, feeding [[pipeline]] pre-triage Phase 0.6), the `[FSD Entry]`/`rm -f` marker lines in Iteration Flow, and the "Homework submission-gate bundling" paragraph (opt-in only on explicit user instruction — bundling it unilaterally was retrospectively flagged as a contract deviation in the v1.1.59/60 sessions).
- Content-drift resync 2026-09-03 (v1.1.61, #1650 C): grounded the marker section explicitly in [[r010]]'s new PPID-scoped `/tmp` runtime state marker carve-out (vs. `tracker-checkpoint`-delegated structured pipeline state); documented the every-iteration re-write + 360-minute (6h) stale guard that treats an old marker as absent; enumerated all four exit paths that clear the marker (convergence, release cap, safety-classifier block, user interrupt); added the `[FSD Stop]` branch to the Iteration Flow diagram (cap/classifier-block vs. next-iteration re-write); and stated explicitly that homework-gate bundling is never derived from `unattended_mode` — only an explicit user instruction triggers it.
- Content-drift resync 2026-09-03: added a cost-cap advisory row to Safety and Discipline — `CLAUDE_COST_CAP`-driven cost-cap advisory is a notification surfaced at the gate, not a loop-stop signal; FSD reports and continues.

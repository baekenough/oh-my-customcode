---
title: FSD (Full Self Driving)
type: skill
scope: harness
updated: 2026-06-21
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

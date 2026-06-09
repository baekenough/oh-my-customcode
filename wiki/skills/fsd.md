---
title: FSD (Full Self Driving)
type: skill
scope: harness
updated: 2026-06-10
sources:
  - .claude/skills/fsd/SKILL.md
related:
  - [[goal]]
  - [[pipeline]]
  - [[homework]]
  - [[omcustom-loop]]
  - [[R001]]
  - [[R009]]
  - [[R010]]
  - [[R017]]
  - [[R020]]
---

# FSD (Full Self Driving)

Autonomous release loop — processes all auto-dev-eligible GitHub issues until none remain, by repeatedly running `/pipeline auto-dev` then `/homework`.

## Overview

Thin alias / orchestrator skill. FSD expands into:

```
/goal "모든 이슈가 처리될 때까지" /loop "/pipeline auto-dev -> /homework"
```

It does not implement loop logic, issue-polling, release steps, or verification itself — it delegates entirely to [[goal]], [[pipeline]], and [[homework]]. The loop converges naturally when the auto-dev-eligible issue set reaches zero.

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
/omcustom:fsd        # Run until all auto-dev-eligible issues are exhausted
/omcustom:fsd 3      # Optional: cap at N releases (default: unlimited)
```

## Iteration Flow

Each FSD iteration:

```
[FSD Iteration N]
├── /pipeline auto-dev   → one release (PR → merge → npm publish → milestone close)
├── /homework            → retrospective 찐빠 audit gate (pauses for user confirmation if needed)
└── Check: any eligible issues remain?
    ├── YES → next iteration
    └── NO  → [FSD Done] converged naturally
```

Issue eligibility follows `/pipeline auto-dev` label selection exactly — **included**: `verify-ready`, unlabeled candidates; **excluded**: `verify-done`, `needs-review`, `decision-needed`.

## Safety and Discipline

FSD operates under full project rules without relaxation:

| Rule | Constraint |
|------|------------|
| [R001](../rules/r001.md) | Destructive ops require explicit approval; credential guardrails always active |
| [R009](../rules/r009.md) | Independent subtasks within each iteration run in parallel |
| [R010](../rules/r010.md) | All file modifications delegated to specialist subagents; mgr-gitnerd for git |
| [R017](../rules/r017.md) | mgr-sauron must pass before any commit/push |
| [R020](../rules/r020.md) | Each release verified via `npm view` + `gh release view` + closed issues before `[Done]` |

`/homework` is a mandatory retrospective gate between iterations — it is NOT skipped in automated mode. If homework requires user confirmation (e.g., to file a feedback issue), the loop pauses and waits.

## When to Use / Avoid

| Scenario | Use FSD? |
|----------|----------|
| Multiple eligible issues, "let it run" autonomously | YES |
| Single targeted fix | NO — use `/pipeline auto-dev` directly |
| Issues require design decisions or stakeholder approval | NO |
| Only `decision-needed` / `needs-review` issues remain | NO — loop converges immediately |
| Cost-sensitive, large backlog | Inspect eligible set first |

## Relationships

- **Delegates to**: [[goal]] (objective wrapper + R020 verification), [[pipeline]] (auto-dev release pipeline per iteration), [[homework]] (retrospective gate per iteration)
- **Session continuity**: [[omcustom-loop]] (SubagentStop hook keeps session alive during background agent work)
- **Rules**: [R001](../rules/r001.md), [R009](../rules/r009.md), [R010](../rules/r010.md), [R017](../rules/r017.md), [R020](../rules/r020.md)

## Sources

- `.claude/skills/fsd/SKILL.md` — skill definition

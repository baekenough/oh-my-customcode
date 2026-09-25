---
title: Professor Triage
type: skill
updated: 2026-09-25
sources:
  - .claude/skills/professor-triage/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[post-release-followup]]
  - [[pipeline]]
  - [[r009]]
  - [[r010]]
  - [[r018]]
---

# Professor Triage

Codebase-driven GitHub issue triage — 5-phase pipeline producing prioritized triage reports with automated low-risk actions.

## Overview

Analyzes GitHub issues directly against the current codebase. For each issue, searches relevant code, assesses impact and blast radius, determines whether the issue is already resolved, and performs automated triage with priority and size estimation. Produces a cross-analysis report and executes low-risk triage actions automatically (close resolved, label duplicates, assign P1/P2/P3). Full phase detail in `guides/professor-triage/phases.md`.

## Key Details

- **Scope**: harness
- **Version**: 2.3.0
- **User-invocable**: yes
- **Command**: `/professor-triage`
- **Effort**: high
- **Context**: fork

## Workflow Contract

5-phase pipeline:

| Phase | Name | Owner | Model |
|-------|------|-------|-------|
| 1 | Gather | Orchestrator | — |
| 2 | Codebase Analysis | Explore agents | haiku |
| 3 | Cross-Analyze | Orchestrator | sonnet/opus |
| 4 | Multi-Perspective Output | general-purpose agents | sonnet/opus |
| 5 | Act | mgr-gitnerd | — |

Phase 4 uses `general-purpose` (NOT `arch-documenter`) — `arch-documenter` has `disallowedTools: [Bash]` and cannot run the `gh`/shell commands these phases require. See #1043.

## Lightweight Mode (Cross-Tier Substitution, v1.1.81)

Independent of the `auto-dev` compression tier selected, Phase 1-4 may be replaced by a lightweight orchestrator analysis instead of a full skill spawn — but only when the conditions in `auto-dev.yaml`'s `## Cross-tier — Lightweight Skill-Mode Substitution` section are met (scope ≤3 issues, code evidence or a measured root cause with the command used, and a mandatory justification log entry; see [[pipeline]] "Cross-tier — Lightweight Skill-Mode Substitution"). This skill does not duplicate those conditions — that section is the authoritative gate. When lightweight mode is used, the triage output (Phase 4E artifact and/or Phase 4D comment) MUST state which mode produced it: `mode: full` or `mode: lightweight`.

## Parallelization

- 1-3 issues: single Explore agent per issue in parallel
- 4-10 issues: max 4 concurrent Explore agents
- 10+ issues: Agent Teams per [[r018]]

## Phase 5 Action Policy

**Automatic**: close resolved issues, close N/A issues, close duplicates, add `triage-complete` label (label renamed v1.1.83, #1734 — meaning: triaged but not selected into an auto-dev scope, standalone triage or deferred, collected by [[release-plan]]), assign P-labels.

**Auto-dev manifest detection (v1.1.83, #1734):** when the caller supplies a release manifest — the issue numbers `pipeline auto-dev`'s scope-selection step selected — as this skill's issue-number argument, the skill treats it as auto-dev context and labels those manifest issues `verify-ready` instead of `triage-complete`. With no manifest supplied (standalone `/professor-triage`, `--label`, `--state`, or `--since` invocation), the default `triage-complete` label applies.

**Requires confirmation**: reopen, new issue creation, epic linking, body modification.

## Artifact Output (R006/R010)

Under `mode: "bypassPermissions"`, Phase 4 agents write directly to `.claude/outputs/` with the Write/Edit tools — no `/tmp/*.sh` temp-script wrapping is needed (CC v2.1.121+, #1101). Every Agent tool call MUST pass `mode: "bypassPermissions"` (the Agent tool default `acceptEdits` overrides agent frontmatter `permissionMode`); include this directive inline in agent prompts when spawning Phase 4 agents — NOT in SKILL.md body alone.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[post-release-followup]]
- **See also**: [[R009]], [[R010]], [[R018]], [[R020]]

## Sources

- `.claude/skills/professor-triage/SKILL.md` — skill definition (restructured v2.3.0, #1054: 16KB→6KB, phase detail moved to guides/professor-triage/phases.md)
- Content-drift resync 2026-09-24 (v1.1.81): added "Lightweight Mode (Cross-Tier Substitution)" — cross-references the `auto-dev.yaml` gate rather than duplicating its conditions; requires the output to state which mode produced it.
- Content-drift resync 2026-09-25 (v1.1.83, #1734): renamed the Phase 5 completed-triage label to `triage-complete` (meaning: triaged but not selected this cycle); added "Auto-dev manifest detection" — when `pipeline auto-dev`'s triage step invokes this skill with a scope-selection-supplied manifest, manifest issues get `verify-ready` instead.

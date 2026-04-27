---
title: Professor Triage
type: skill
updated: 2026-04-27
sources:
  - .claude/skills/professor-triage/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[post-release-followup]]
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

Phase 4 uses `general-purpose` (NOT `arch-documenter`) — `arch-documenter` has `disallowedTools: [Bash]` and cannot execute `/tmp/*.sh` bypass required for `.claude/outputs/` writes. See #1043.

## Parallelization

- 1-3 issues: single Explore agent per issue in parallel
- 4-10 issues: max 4 concurrent Explore agents
- 10+ issues: Agent Teams per [[r018]]

## Phase 5 Action Policy

**Automatic**: close resolved issues, close N/A issues, close duplicates, add `verify-done` label, assign P-labels.

**Requires confirmation**: reopen, new issue creation, epic linking, body modification.

## Sensitive-Path Artifact Protocol

ALL `.claude/outputs/` writes MUST use `/tmp/*.sh` Bash bypass (R010 #1052). Direct Write/Edit on `.claude/` triggers CC sensitive-path guard regardless of `bypassPermissions`. This directive MUST be included inline in agent prompts when spawning Phase 4 agents — NOT in SKILL.md body alone.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[post-release-followup]]
- **See also**: [[R009]], [[R010]], [[R018]], [[R020]]

## Sources

- `.claude/skills/professor-triage/SKILL.md` — skill definition (restructured v2.3.0, #1054: 16KB→6KB, phase detail moved to guides/professor-triage/phases.md)

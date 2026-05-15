---
title: Pipeline
type: skill
updated: 2026-05-15
sources:
  - .claude/skills/pipeline/SKILL.md
  - .claude/skills/pipeline/workflows/auto-dev.yaml
related:
  - [[dag-orchestration]]
  - [[pipeline-guards]]
  - [[task-decomposition]]
  - [[professor-triage]]
  - [[deep-verify]]
---

# Pipeline

Invoke and resume YAML-defined pipelines — `/pipeline auto-dev` runs the full release pipeline.

## Overview

YAML-based pipeline executor. In list mode, scans `workflows/*.yaml` and displays available pipelines. In run mode, loads and validates a pipeline YAML, then executes steps sequentially (skill steps via Skill tool, prompt steps via agent delegation, parallel steps via Agent tool). Tracks state per step in `/tmp/.claude-pipeline-{name}-{PPID}.json`. Resume mode re-executes from the failed step. Max 4 concurrent parallel steps (pipeline-guards).

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/pipeline`
- **Effort**: high
- **Argument hint**: `<pipeline-name> | resume | (no args to list available)`
- **Source**: external (github: baekenough/baekenough-skills v1.0.0)

## auto-dev Pipeline Steps

The `auto-dev` workflow runs a full release cycle: `pre-triage → scope-selection → triage → plan → deep-plan → implement → verify-build → deep-verify → release → ci-check → post-release-followup`.

### Phase 0: Sync (G1 — #1159, v0.137.0)

`pre-triage` now begins with a mandatory local-remote sync before scanning issues:

1. `git fetch --all --tags --prune` — pull all remote state
2. Detect `behind` count vs `origin/<current_branch>`
3. If behind > 0 AND working tree **clean** → `git pull --ff-only` and report synced commits
4. If behind > 0 AND working tree **dirty** → **HALT** with manual reconcile required message
5. Report: latest tag, local HEAD SHA, behind state, and flag any tag/context version mismatch

**Purpose**: Prevents stale session memory (from previous session's git state) from causing incorrect version selection or duplicate issue processing. Resolves the pattern where pipeline memory held an old version while git HEAD had already advanced.

### verify-build: bun test with Baseline Delta Guard (G2 — #1160, #1156, v0.137.0)

`verify-build` now mandates `bun test` with dynamic baseline tracking:

1. `bun install` — lockfile sync check (halt on drift)
2. `bun run lint` (if script exists)
3. `bun run typecheck` (if available)
4. **`bun test` — MANDATORY, no silent skip**
   - Baseline: adopt prior version's pass/fail count (dynamic, not hardcoded)
   - Historical note: #1156 documented 86 failures; v0.136.2 resolved them → current baseline = 0
   - If current FAIL count **>** baseline → new regression detected → halt + report failure list
   - If current FAIL count **≤** baseline → continue with advisory `"X failures (baseline {n}, delta {d})"`
5. Build script (if exists)

**Halt conditions**: lint errors, typecheck errors, NEW test failures (regression from baseline), build failure, lockfile drift.

**Purpose**: Catches unit test regressions that static checks miss. Addresses the v0.133.0 pattern where hook script exit code changes introduced test regressions not detected by lint/typecheck alone.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dag-orchestration]], [[pipeline-guards]], [[task-decomposition]], [[professor-triage]], [[deep-verify]]
- **See also**: [[R009]], [[R010]]

## Sources

- `.claude/skills/pipeline/SKILL.md` — skill definition
- `.claude/skills/pipeline/workflows/auto-dev.yaml` — auto-dev workflow YAML (G1/G2 added v0.137.0)

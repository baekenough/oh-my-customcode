---
title: Pipeline
type: skill
updated: 2026-08-10
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

### release: PR-body Closes-keyword requirement (#1531)

`auto-tag.yml` closes issues by grep'ing `Closes|Fixes|Resolves #N` keywords in the **merged PR body** — NOT by milestone membership. The `release` step's PR-creation instruction now mandates a `Closes #N` line for every issue the release resolves; omitting it lets the workflow report `success` while closing zero issues. After merge, the step verifies each targeted issue is actually `CLOSED` (`gh issue view`) rather than trusting workflow conclusion alone — v1.1.34 omitted the keyword and left 5 issues open despite a green run.

### scope-selection: milestone 3-branch state machine + docs-only/lite side-effect discipline (#1553 찐빠 #3)

`scope-selection` Step 0 is explicitly documented as a **3-branch state machine**, not a gate-only pre-check: `closed → HALT` / `open → reuse` / `absent → CREATE` (`gh api .../milestones --method POST`). The `absent → create` branch is a STATE CHANGE, so it is **never** skipped by `docs-only`/`lite` compression. After the create branch, a **mandatory post-condition re-query** (`gh api ... --paginate --jq ...`) confirms the milestone actually exists and is open before proceeding — `--paginate` is required because a 100+ milestone repo can silently drop the newest entry on a single unpaginated page, making a just-created milestone read back as absent. If the re-query returns nothing, the step HALTs rather than proceeding on an unverified milestone.

`compression-mode-eval` now carries an explicit **"Cross-tier — State-Change Side Effects Are NEVER Compressed"** section: `docs-only`/`lite` compression substitutes ANALYSIS ARTIFACTS ONLY (skip the professor-triage/deep-plan skill spawn, use integrated analysis instead) — it never authorizes skipping a step's `gh` state mutations (milestone create/assign, label add/remove, issue assign/comment/close). A per-step side-effect inventory table lists which steps carry mandatory state changes (`pre-triage`, `scope-selection`, `implement`, `release`, `post-release-followup`) vs. which are pure analysis and therefore compressible (`triage`, `plan`, `deep-plan`, `deep-verify`). Both the `docs-only` and `lite` tier sections now point back to this Cross-tier section explicitly.

Origin: #1553 찐빠 #3 — v1.1.41 릴리즈에서 `lite` 압축이 `scope-selection`의 "마일스톤 미존재 → 생성" 분기까지 함께 생략해 마일스톤이 만들어지지 않았다. 압축 대상은 분석 산출물이었으나 상태 변경 분기가 동반 생략됐다.

### scope-selection Step 3: approval-required path pre-check (#1574)

`scope-selection` now ends with an R010 Protected-Paths pre-check that runs **before the pipeline enters `implement`**. For each scoped issue it extracts target file/directory paths from the title and body (explicit paths, backtick-quoted paths, or clearly named targets) and classifies them against [[r010]] "Protected Paths":

| Path class | Handling |
|------------|----------|
| `.claude/hooks/**` | Excluded from mgr-creator routing — requires **explicit user approval** (security-critical). Approval is requested for the FULL scoped set at this point |
| `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `guides/*/` (new dirs) | Routed to `mgr-creator` at implement time — a delegation requirement, not a HALT |

The point of doing this at scope time is timing, not classification: the classification rules already existed in [[r010]], but nothing consulted them until a later step tripped over them. Discovering a hooks-path issue mid-run (e.g. at `compression-mode-eval`) means asking for approval **after scope is already committed**, so the run stalls on an interactive prompt in what is meant to be an unattended loop. Batching the request up front means one approval covers the whole scoped set. Approvals already granted this session for the same category+target are not re-requested ([[r015]] directive persistence). The step emits `approval_required_paths` (possibly empty) as pipeline state for downstream steps.

Origin: #1574 찐빠 #5.

### release: branch-before-bump ordering (#1542)

The `release` step's version-bump sub-steps were reordered so the `release/v{NEW}` branch is created **before** any bump edit (previously the branch was created afterwards, in step 3.a, from an already-bumped `develop`). Pushing the bump commit to `develop` first leaves `develop` and `release/v{NEW}` at the same commit → PR diff=0 → `gh pr create` fails with `GraphQL: No commits between develop and release/v{NEW}` (observed v1.1.38).

The reordering preserves every prior guard: Pre-Branch Freshness Gate (`git pull develop`), `bun run build` + full tracked-drift staging (`.omcustom.lock.json`, #1531), and the mandatory `verify-version-sync.sh` halt.

Additionally, close keywords are now forbidden in commit messages — the `implement` step uses a `Refs #N` trailer, since a `Fixes #N` trailer on a develop-bound commit auto-closes the issue before tag/publish. The PR body remains the only place a close keyword belongs.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dag-orchestration]], [[pipeline-guards]], [[task-decomposition]], [[professor-triage]], [[deep-verify]]
- **See also**: [[R009]], [[R010]], [[r015]]

## Sources

- `.claude/skills/pipeline/SKILL.md` — skill definition
- `.claude/skills/pipeline/workflows/auto-dev.yaml` — auto-dev workflow YAML (G1/G2 added v0.137.0; release step PR-body Closes-keyword requirement added v1.1.35 / #1531; branch-before-bump reordering added v1.1.39 / #1542; scope-selection 3-branch state machine + `--paginate` post-condition + compression-mode-eval Cross-tier State-Change Side Effects inventory added v1.1.42 / #1553 찐빠 #3; scope-selection Step 3 approval-required path pre-check added v1.1.45 / #1574 찐빠 #5)
- Issue #1531 — PR-body Closes-keyword omission left 5 issues open despite green workflow (v1.1.34)
- Issue #1542 — bump pushed to develop before branching produced a diff=0 release PR (v1.1.38)
- Issue #1553 — lite compression silently skipped the milestone-create state-change branch alongside the compressible analysis step, leaving v1.1.41 without a milestone (v1.1.41 retrospective)
- Issue #1574 — an approval-required `.claude/hooks/**` path surfaced mid-run instead of at scope time, stalling an unattended run on an interactive approval after scope was already committed (v1.1.44 retrospective)

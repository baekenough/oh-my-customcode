---
title: Pipeline
type: skill
updated: 2026-09-25
sources:
  - .claude/skills/pipeline/SKILL.md
  - .claude/skills/pipeline/workflows/auto-dev.yaml
related:
  - [[dag-orchestration]]
  - [[pipeline-guards]]
  - [[task-decomposition]]
  - [[professor-triage]]
  - [[deep-plan]]
  - [[deep-verify]]
  - [[r010]]
  - [[r020]]
  - [[r022]]
  - [[r023]]
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

### Cross-tier: pre-existing converged artifact substitution — anchor re-location for same-session deep-plan substitution (#1652 #3-1/#3-2)

Independent of the compression tier, an individual planning/verification step (triage / plan / deep-plan / deep-verify) may be satisfied by a pre-existing converged artifact instead of a fresh skill spawn, under the existing 3-condition substitution rule (converged artifact exists, covers scope, planning/verification step only). A 4th condition was added: when the substituting artifact is a **same-session** triage/plan output standing in for `deep-plan` (or `plan`), every implement-stage delegation prompt MUST instruct the agent to re-locate targets by **anchor** (function name / unique string), treating any line numbers cited in the issue body or artifact as reference only. Line numbers go stale across release commits — v1.1.60 measured: `#1647` cited lines 346-348 from the v1.1.59 state, but the script had grown to 608→733 lines by the time implement ran, forcing two agents to re-search. The substitution justification log must name the artifact AND state that anchor-based re-measurement was included in the delegation prompts.

### Cross-tier: Lightweight Skill-Mode Substitution (v1.1.81, #1721/#1727)

Independent of the compression tier selected, the `triage` / `plan` / `deep-plan` skill spawns MAY be replaced by orchestrator-integrated analysis — a lightweight mode — even in `standard` mode, ONLY when ALL of the following hold. `deep-verify` is NOT eligible for this substitution — it remains eligible only for the separate pre-existing-converged-artifact substitution above (a full prior skill spawn's output reused, not orchestrator-integrated shortcutting).

1. Scope size ≤3 issues (user decision, #1721 제안 4: 상한 3건).
2. For EVERY scoped issue in the substitution, EITHER the issue body cites concrete code evidence (a file path AND an anchor — function name / unique string, not just a claim), OR the orchestrator has recorded the measured root cause together with the exact command used to measure it (#1727 찐빠 #1).
3. A mandatory justification log line is emitted naming the step and the evidence basis: `"[compression-mode] lightweight skill-mode substitution — step '{step}', scope={n}, evidence={file:anchor or measured-cause+command}"`.
4. The resulting artifact explicitly states its own mode (`mode: full` or `mode: lightweight`) so downstream steps and reviewers can tell it apart from a full skill spawn (#1721 제안 4).

This substitution is NEVER available for `implement`, `verify-build`, `release`, `ci-check`, or `deep-verify`. It replaces analysis output only — every step's state-change side effect still runs in full regardless of substitution (see "Cross-tier — State-Change Side Effects Are NEVER Compressed" below). If any condition above cannot be concretely asserted, the step does not substitute — it spawns the skill. See [[deep-plan]] and [[professor-triage]] for the skill-side cross-references to this gate.

**Security/availability carve-out for `deep-plan` (v1.1.83, #1733 찐빠 #9)**: if ANY scoped issue carries the `security` label, OR its title/body explicitly states a security/availability concern (rate limiting, resource exhaustion, injection, denial-of-service — this repo has no separate `availability` label, so an availability concern must be asserted in the issue text, not inferred from a label), the lightweight substitution above is FORBIDDEN for `deep-plan` on that issue, and it stays forbidden even under the `lite` compression tier's own integrated-analysis substitution. Because `deep-plan` runs once per release (not per issue), a single qualifying issue in scope forces the whole release's `deep-plan` step to run as a full skill spawn. The entry-point audit for such an issue must include an "executions per request (amplification)" check — how many downstream operations a single request can trigger (e.g. GraphQL alias batching, N+1 fan-out) — not only a per-call timeout/rate-limit check.

### deep-verify: lite-tier split standard (#1652 #3-4)

The `lite` compression tier's `deep-verify` substitution ("mgr-sauron R017 + core self-check instead of the full skill spawn") is now split into two standing single-goal delegations rather than one combined pass: (1) an mgr-sauron [[r017]] structural-verification delegation, and (2) a change-type-appropriate adversarial-review delegation — execution-reproduction-based `adversarial-review` for script changes, wording/wiring review for rule/skill/yaml text changes. Rationale: in the v1.1.59 and v1.1.60 sessions, the adversarial-review pass caught a genuinely new regression via execution reproduction in **two consecutive** iterations (M-3/M-4, a forged heredoc) — a single combined self-check pass would likely have missed both.

### Multi-Phase skill steps must be split before dispatch (#1595 #4)

`deep-plan` (research → plan → verify) and `deep-verify` (multi-angle verification) are **multi-Phase** steps. Do NOT spawn them as a single skill call: a Phase boundary is exactly where a delegated agent is tempted to end its turn ([[r020]] 「위임 경계를 Phase 개수로 설계」). Read the skill's Phases first, split them into **single-goal delegations**, and dispatch sequentially. A `skill:` value in the workflow names **the definition that justifies the split** — it is not an instruction to call the skill once.

Measured (v1.1.48): spawning `skill: deep-plan` as-is ended at 6.9 seconds with `tool_uses=0` and zero artifacts; redesigned as a single-goal Plan agent it completed 1/1. Both step descriptions in `auto-dev.yaml` now carry the split instruction inline, and the file header states the design rule (the four mirrored copies are kept identical by CI).

### semver: skill/agent addition is patch, not minor (v1.1.49)

The release step's version-selection rule now defines **minor** as a new user-facing capability that changes *how the harness is used* — a new workflow axis, a new command surface users must learn, or a contract other components depend on — explicitly **not** "a file appeared under `.claude/skills/` or `.claude/agents/`".

Counter-example recorded in the workflow: adding one skill plus one agent (agora — skills 114→115, agents 49→50) was initially scoped as a v1.2.0 minor by reading the old wording literally. That was wrong. This repo adds skills routinely, and the skill count reached 115 while the version stayed at v1.1.48, so skill/agent addition is **established as patch** (the target was corrected to v1.1.49). Count growth is this repo's baseline rate of change, not a minor signal — if a version bump would follow mechanically from "a new file exists", it is patch. The deciding question is whether a user's workflow changes.

### Phase 0: label bootstrap must run literally, not as a loop (#1743)

`pre-triage`'s label-bootstrap block (`gh label create in-progress|verify-ready|needs-review ...`, three `gh label create` calls) now carries an explicit inline instruction: run the three commands literally as written — do NOT rewrite them as a shell loop over an array of label names. Reason: zsh does not word-split an unquoted `$var`, so a loop iterating a label-name variable can silently create a malformed label (one combined string) instead of three separate labels, with no error surfaced. See the labels reference for the matching rename-verification pitfall (`.claude/skills/pipeline/labels.md` "Rename Verification" — a label rename must be confirmed absent via `gh label list`, not via an issue count filtered on the old label name, since GitHub resolves the old name to the renamed label and still returns matching issues).

### Phase 0: Sync (G1 — #1159, v0.137.0)

`pre-triage` now begins with a mandatory local-remote sync before scanning issues:

1. `git fetch --all --tags --prune` — pull all remote state
2. Detect `behind` count vs `origin/<current_branch>`
3. If behind > 0 AND working tree **clean** → `git pull --ff-only` and report synced commits
4. If behind > 0 AND working tree **dirty** → **HALT** with manual reconcile required message
5. Report: latest tag, local HEAD SHA, behind state, and flag any tag/context version mismatch

**Purpose**: Prevents stale session memory (from previous session's git state) from causing incorrect version selection or duplicate issue processing. Resolves the pattern where pipeline memory held an old version while git HEAD had already advanced.

### Phase 0.5: Effective permission mode pre-flight (advisory, #1644)

`pre-triage` now includes a Phase 0.5 that measures the **effective** permission mode before the pipeline runs unattended — advisory only, never halts. Motivation: CC v2.1.257 stopped honoring project-scope `permissions.defaultMode` (`.claude/settings.json` / `.claude/settings.local.json`); only user/managed scope or an explicit `--permission-mode` flag takes effect. [[r010]] "Universal bypassPermissions" assumes the parent session runs unattended under `bypassPermissions` — if that assumption is silently false, the pipeline stalls mid-run on a permission prompt with no diagnostic.

1. Read the user-scope setting (project scope is not authoritative on v2.1.257+): `jq -r '.permissions.defaultMode // "unset"' ~/.claude/settings.json`.
2. The `--permission-mode` launch flag cannot be read from inside the session — treat it as unknown, never infer it was passed.
3. Report `bypassPermissions` as a one-line confirmation; otherwise emit a stderr warning naming the effective mode and that project-scope `defaultMode` is ignored on v2.1.257+, with the remediation (`--permission-mode bypassPermissions` or user-scope settings). Never halt — a prompted run still completes with a human present.
4. Only the single `permissions.defaultMode` field is read — no credential material is echoed (R001).

### Phase 0.6: unattended-mode detection (deterministic, #1650 C)

`pre-triage` now runs a Phase 0.6 after the permission pre-flight — it decides `unattended_mode` for scope-selection Step 3's hooks-path deferral (see below). Until v1.1.60 that decision was prose inference ("entered via `/fsd` or the session says autonomous"), which is not measurable. [[fsd]] now writes a marker at entry (`/tmp/.claude-fsd-$PPID`, see [[fsd]] "Unattended-Mode Marker") and removes it at convergence.

1. Measure both signals — either is sufficient. The marker check has **three** possible states, not just present/absent: `marker_state=absent` by default; if the marker file exists, `command find "$marker" -mmin +360` decides between `stale` (older than 360 minutes / 6 hours) and `present`. Only `marker_state=present` OR `OMCUSTOM_UNATTENDED=1` sets `unattended_mode=true` — a `stale` marker is treated the same as `absent`, guarding against a crash/PID-reuse leftover misclassifying a later manual run. `$PPID` inside the Bash tool is the Claude Code process and is stable across calls, so a marker written by an earlier `/fsd` call is visible here.
2. The snippet is wrapped in `if`/`fi` blocks and always exits 0 via its final `echo`, regardless of which branch fired — a `false` measurement result is a valid outcome, not a measurement failure, so this step never halts the pipeline.
3. Report `[pre-triage] unattended_mode=<true|false> (marker /tmp/.claude-fsd-$PPID: <present|stale|absent>; OMCUSTOM_UNATTENDED=<value|unset>)`.
4. Output `unattended_mode` as pipeline state for scope-selection Step 3. Do NOT infer unattended mode from prose or from the fact that this pipeline was invoked by a skill — only the two measured signals (marker state, env var) count.

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
6. **Coverage threshold check (v1.1.81)** — equivalent to `.husky/pre-commit`'s coverage gate, added so a deferred implement-stage commit (see the `implement` step's "deferred combined commit" option below) is still coverage-gated before release even though the hook has not run yet: run `bun test --coverage` standalone (no pipe, exit code read directly), extract Function/Line coverage from the "All files" summary line, and read the CURRENT threshold value and the new-source-file relaxation rule directly from `.husky/pre-commit` at run time rather than hardcoding a number — the hook's threshold can change independently of this workflow file. If either Function or Line coverage falls below the threshold `.husky/pre-commit` currently applies (accounting for its dynamic relaxation for commits containing newly added `src/**/*.ts`/`.tsx` files), the step halts and reports the shortfall.

**Halt conditions**: lint errors, typecheck errors, NEW test failures (regression from baseline), coverage below the threshold `.husky/pre-commit` currently applies, build failure, lockfile drift.

**Purpose**: Catches unit test regressions that static checks miss. Addresses the v0.133.0 pattern where hook script exit code changes introduced test regressions not detected by lint/typecheck alone.

### release: PR-body Closes-keyword requirement (#1531)

`auto-tag.yml` closes issues by grep'ing `Closes|Fixes|Resolves #N` keywords in the **merged PR body** — NOT by milestone membership. The `release` step's PR-creation instruction now mandates a `Closes #N` line for every issue the release resolves; omitting it lets the workflow report `success` while closing zero issues. After merge, the step verifies each targeted issue is actually `CLOSED` (`gh issue view`) rather than trusting workflow conclusion alone — v1.1.34 omitted the keyword and left 5 issues open despite a green run.

### scope-selection Step 3: unattended-mode hooks-path deferral (v1.1.58; deterministic signal added v1.1.60, #1650 C)

Step 3's R010 approval-required path pre-check now branches on whether the run is unattended. As of v1.1.58 this was decided by prose ("`/fsd` or an autonomous-session directive" — no deterministic signal, flagged as a follow-up item); v1.1.60 closes that gap by consuming the `unattended_mode` state that pre-triage Phase 0.6 measured from the `/tmp/.claude-fsd-$PPID` marker or `OMCUSTOM_UNATTENDED=1` env — the step no longer infers unattended-ness from prose ("looks like it entered via /fsd"). In an unattended loop, an issue touching `.claude/hooks/**` is no longer surfaced for immediate approval mid-run; it is **split off and deferred** from the current scope, and the run continues on the remaining eligible issues. Deferred hooks issues are batched into a **single** approval question at the next iteration boundary (the `/homework` gate) rather than interrupting the loop per-issue. Once approved, [[r015]] directive persistence applies for the rest of the session for the same category. In attended (interactive) mode, the pre-check behaves as before — immediate approval request. See [[fsd]] "Unattended-Mode Marker — Deterministic Detection Signal" for the skill-side half of this split.

### deep-verify: mgr-sauron carve-out inside docs-only compression (v1.1.58)

The `docs-only` compression tier's `deep-verify` substitution ("skip the deep-verify skill; perform self-review checklist instead") now carries an explicit carve-out: if the changed-file set includes `.claude/rules/**` (or agent/skill frontmatter — structural surface), self-review substitution is **not** used — mgr-sauron [[r017]] verification runs as a **mandatory single-goal delegation** instead, the same principle already applied in the `lite` tier's R017 clause. Origin: a v1.1.58 session ran the `docs-only` tier on a rule-file change and mgr-sauron caught an R002/R010 contradiction advisory that self-review would have missed.

### scope-selection: milestone 3-branch state machine + docs-only/lite side-effect discipline (#1553 찐빠 #3)

`scope-selection` Step 0 is explicitly documented as a **3-branch state machine**, not a gate-only pre-check: `closed → HALT` / `open → reuse` / `absent → CREATE` (`gh api .../milestones --method POST`). The `absent → create` branch is a STATE CHANGE, so it is **never** skipped by `docs-only`/`lite` compression. After the create branch, a **mandatory post-condition re-query** (`gh api ... --paginate --jq ...`) confirms the milestone actually exists and is open before proceeding — `--paginate` is required because a 100+ milestone repo can silently drop the newest entry on a single unpaginated page, making a just-created milestone read back as absent. If the re-query returns nothing, the step HALTs rather than proceeding on an unverified milestone.

`compression-mode-eval` now carries an explicit **"Cross-tier — State-Change Side Effects Are NEVER Compressed"** section: `docs-only`/`lite` compression substitutes ANALYSIS ARTIFACTS ONLY (skip the professor-triage/deep-plan skill spawn, use integrated analysis instead) — it never authorizes skipping a step's `gh` state mutations (milestone create/assign, label add/remove, issue assign/comment/close). A per-step side-effect inventory table lists which steps carry mandatory state changes (`pre-triage`, `scope-selection`, `implement`, `release`, `post-release-followup`) vs. which are pure analysis and therefore compressible (`triage`, `plan`, `deep-plan`, `deep-verify`). Both the `docs-only` and `lite` tier sections now point back to this Cross-tier section explicitly.

**Excluded triage label renamed to `triage-complete` (v1.1.83, #1734)**: the label excluded from `scope-selection`'s filter (`labels ∩ {decision-needed, needs-review, triage-complete, manual-action, in-progress} ≠ ∅`) was renamed, meaning unchanged — triaged but not selected into an auto-dev scope. The side-effect inventory's `triage` row was clarified: when `professor-triage` runs inside this step against a scope-selection manifest, manifest issues get `verify-ready`, NOT `triage-complete` — the label side effect is not compressible even when triage analysis is (skipped for docs-only, substituted under lite/lightweight mode); when triage is skipped or substituted, the `implement` step's own per-issue success path already adds `verify-ready` before the release completes, so no separate label action is required. The `ci-check` row gained a matching state change: `gh issue edit <N> --remove-label in-progress` for stale labels, and `--remove-label verify-ready` scoped to THIS release's CLOSED issues only (past closed issues excluded, user decision). See [[professor-triage]] and [[fsd]] for the skill-side rename.

Origin: #1553 찐빠 #3 — v1.1.41 릴리즈에서 `lite` 압축이 `scope-selection`의 "마일스톤 미존재 → 생성" 분기까지 함께 생략해 마일스톤이 만들어지지 않았다. 압축 대상은 분석 산출물이었으나 상태 변경 분기가 동반 생략됐다.

### scope-selection Step 3: approval-required path pre-check (#1574)

`scope-selection` now ends with an R010 Protected-Paths pre-check that runs **before the pipeline enters `implement`**. For each scoped issue it extracts target file/directory paths from the title and body (explicit paths, backtick-quoted paths, or clearly named targets) and classifies them against [[r010]] "Protected Paths":

| Path class | Handling |
|------------|----------|
| `.claude/hooks/**` | Excluded from mgr-creator routing — requires **explicit user approval** (security-critical). Approval is requested for the FULL scoped set at this point |
| `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `guides/*/` (new dirs) | Routed to `mgr-creator` at implement time — a delegation requirement, not a HALT |

The point of doing this at scope time is timing, not classification: the classification rules already existed in [[r010]], but nothing consulted them until a later step tripped over them. Discovering a hooks-path issue mid-run (e.g. at `compression-mode-eval`) means asking for approval **after scope is already committed**, so the run stalls on an interactive prompt in what is meant to be an unattended loop. Batching the request up front means one approval covers the whole scoped set. Approvals already granted this session for the same category+target are not re-requested ([[r015]] directive persistence). The step emits `approval_required_paths` (possibly empty) as pipeline state for downstream steps.

Origin: #1574 찐빠 #5.

**Existing-file `git ls-files` check (v1.1.81, #1725 찐빠 #4)**: the path extraction that feeds this pre-check now measures each extracted path with `git ls-files` immediately, before scope is committed (not deferred to implement time) — but ONLY for a target the issue treats as an EXISTING file (an edit/refactor of a path the issue claims already exists). If such a path is absent from this repo (e.g. it belongs to a different repository), the issue is routed to `decision-needed` or excluded from scope immediately. For a target the issue is CREATING (a new file), this absence check does not apply — a new file is by definition untracked ([[r010]] "Required Checks": new-creation targets are excluded from path-existence checks); instead the parent directory's existence is confirmed, and the issue is not excluded solely because the new file path itself is absent.

### release step 0a: user-execution constraint check (v1.1.83, #1733 찐빠 #2)

Before step 0 (the stale-local-`release`-branch pre-check), the `release` step now runs a mandatory **step 0a**: read CLAUDE.md, session memory, and the entry card (if the environment provides one) for any user-execution constraint (e.g. "merge/tag/publish must be run by the user, not the agent"). For each command the release step is about to run: if it is COVERED by a found constraint (merge, tag, publish), the step does NOT execute it — it presents the exact command(s) to the user and STOPS this step; if NOT covered (branch creation, version bump, PR creation — coverage is judged by the scope of the constraint text actually found, not by this example list), the step proceeds normally. No matching constraint found → unchanged behavior. User decision (recorded): in an unattended run (`/fsd`, etc.), the step STOPS at the first covered command, presents it, and HOLDS the convergence declaration until the user runs it and confirms — see [[fsd]] "Convergence hold on a pending user-execution constraint".

### release: branch-before-bump ordering (#1542)

The `release` step's version-bump sub-steps were reordered so the `release/v{NEW}` branch is created **before** any bump edit (previously the branch was created afterwards, in step 3.a, from an already-bumped `develop`). Pushing the bump commit to `develop` first leaves `develop` and `release/v{NEW}` at the same commit → PR diff=0 → `gh pr create` fails with `GraphQL: No commits between develop and release/v{NEW}` (observed v1.1.38).

The reordering preserves every prior guard: Pre-Branch Freshness Gate (`git pull develop`), `bun run build` + full tracked-drift staging (`.omcustom.lock.json`, #1531), and the mandatory `verify-version-sync.sh` halt.

Additionally, close keywords are now forbidden in commit messages — the `implement` step uses a `Refs #N` trailer, since a `Fixes #N` trailer on a develop-bound commit auto-closes the issue before tag/publish. The PR body remains the only place a close keyword belongs.

### release step 1.e: corrected lockfile-generation mechanism + step 1.j 3-way assertion (#1593)

Step 1.e's comment now documents the **actual** mechanism (previously undocumented, corrected 2026-08-15): `bun run build` invokes `scripts/sync-source-lockfile.ts` (a thin wrapper with no version literals of its own), which calls `generateAndWriteLockfileForDir` (`src/core/lockfile.ts`). That function reads `generatorVersion` from `package.json` and `templateVersion` from `templates/manifest.json` via `loadVersions()` (`src/core/sync.ts`) and writes both into `.omcustom.lock.json`. If step 1.d (`templates/manifest.json` bump) has not yet landed when step 1.e runs, the lockfile **silently records the previous `templateVersion`** — no warning, no error. Observed contamination: v1.1.47 shipped `generatorVersion=1.1.47` / `templateVersion=1.1.46` because the bump commit created `package.json` + the lockfile together while `manifest.json` was bumped in a later commit. Step 1.e is now explicitly gated on both step 1.c (`package.json`) and step 1.d (`templates/manifest.json`) having landed first.

Step 1.i's `verify-version-sync.sh` check is a **2-way** comparison and misses exactly this contamination pattern (package.json vs manifest.json, not the lockfile). A new step **1.j** closes the gap with a standalone (no-pipe) 3-way assertion run on `release/v{NEW}`:

```
jq -e --arg v "<NEW>" '.generatorVersion==$v and .templateVersion==$v' .omcustom.lock.json
```

Failure halts the `release` step — the cause is almost always step 1.e having run before step 1.d landed; the fix is to re-run 1.d then 1.e, re-stage, and re-run the 1.j assertion.

### implement step 5: commit trailer restriction + deferred combined-commit option (v1.1.81)

The `implement` step's per-issue commit instruction now states that commit trailers MUST use ONLY the exact trailer text the orchestrator supplies in the delegation prompt — the agent MUST NOT add or rewrite any other trailer. This closed a gap observed in another project's session: a subagent added an unapproved model-attribution trailer to 4 local commits, citing the repo's own past-commit convention as justification; the trailer did not survive because the squash-merge specified the PR body separately (#1728 찐빠 #6). The same restriction is echoed on the `release` step's version-bump commit instruction.

A new OPTION allows deferring the implement-stage commit until AFTER `deep-verify` corrections have landed, combining the implement changes and the deep-verify corrections into ONE commit (정정 커밋 추가 비용 절감, #1727 찐빠 #4) — allowed ONLY before any push to `develop`, and MUST be announced to the user. The deferred commit still carries the `Refs #<N>` trailer and the 400000ms timeout (see below). Risk: `verify-build` and `deep-verify` then run against an uncommitted working tree until the combined commit lands (this is why `verify-build`'s new coverage-threshold check above exists — it re-covers ground the pre-commit hook would otherwise have gated). DEADLINE: the combined commit MUST land — with the `.husky/pre-commit` gate passing — before the `release` step begins; `release` step 1.a requires a clean working tree, so a deferred commit cannot cross into `release`.

### implement/release commit steps: Bash timeout for pre-commit hook (#1645)

Both the `implement` step's per-issue commit and the `release` step's version-bump commit now carry an explicit warning: the main-worktree `.husky/pre-commit` hook runs typecheck + `bun run lint` + the **full** `bun test --coverage` suite (~165s measured) plus coverage-threshold and CLAUDE.md count checks before the commit lands. The Bash tool's default timeout (120000ms) kills a `git commit` delegation mid-hook with exit 143 (SIGTERM), so both steps now instruct delegating the commit with an explicit `timeout: 400000` (≈6.7 min). `--no-verify` is never an acceptable workaround — it is a standing-prohibition quality-gate bypass per [[r010]]. Git worktrees are unaffected (the pre-commit hook branches on `[ -f .git ]` and runs typecheck only there, exiting 0 — the full suite is CI's job on that path). See [[mgr-gitnerd]] "Commit Timeout Budget" for the full breakdown, and the reminder that exit 143 is not evidence of commit failure — `git log -1` ground-truth is required before retrying.

### ci-check: auto-tag `run.headSha` may lag the PR head (#1655)

The `ci-check` step's auto-tag verification (`gh run list`/`gh run view` on the auto-tag workflow) must not assume `run.headSha` equals the just-merged PR's head commit — the auto-tag run's recorded `headSha` can reflect an earlier commit than the PR's actual head, depending on when the workflow run was triggered relative to the merge landing. Compare against `gh pr view <n> --json mergeCommit` (or the post-merge `develop` HEAD) rather than assuming `run.headSha` is authoritative for "which commit this run covers."

| Anti-pattern | Required |
|--------------|----------|
| Treat `run.headSha` as the merged PR's head commit without cross-checking | Cross-check `run.headSha` against `gh pr view --json mergeCommit` / post-merge HEAD before drawing conclusions from the run |

Origin: #1655.

### ci-check: bounded CI polling + issue label/state lifecycle fix step (v1.1.81)

`ci-check`'s CI-wait instruction now requires polling WITHIN the Bash timeout budget (loop_count × sleep_interval + command time ≤ timeout, with margin), or preferring a single bounded call — `gh run watch <run-id> --exit-status` (optionally `run_in_background`) — over an unbounded manual poll loop (#1711 찐빠 #6).

A new final step verifies every scoped issue's label/state lifecycle actually landed: `in-progress` removed and the issue CLOSED for each issue in this release's scope — checked directly with `gh issue view <N> --json state,labels` rather than trusting that the `implement` step ran the lifecycle transition (#1722 찐빠 #6, closes a gap where CLOSED issues retained a stale `in-progress` label). This step finds AND fixes, not verify-only: a stale `in-progress` label is removed and the fix reported; an issue still OPEN is NOT closed here — closing stays with `auto-tag.yml` unless it failed to close that issue, in which case the open issue is reported for manual close per the `release` step's closing mechanism (#1722 하네스 제안 4).

### deep-verify: standard delegation wording — do not re-run pre-measured items (#1655)

`deep-verify`'s delegation prompt now carries standard wording aligned with [[r023]] "상한선 — 오케스트레이터 사전 실측 항목은 재실행 금지": the prompt must enumerate which items the orchestrator has already measured before delegation (e.g. file existence, counts, branch-protection scope) and instruct the agent NOT to re-verify those — verification effort goes only to items not yet measured. Re-including pre-measured items in the completion criteria wastes turn budget and, measured on a paired mgr-sauron delegation, was the difference between a 25-turn truncation and a 16-turn completion.

Cross-reference: [[r023]] Delegated Verification Floor (ceiling half), [[r020]] maxTurns Truncation (turn-budget sizing).

**Verification delegations also require turn-arithmetic sizing (v1.1.81, #1722 찐빠 #2)**: verification delegations must compute turn arithmetic (target file count × judgment-item count) the same way editing delegations do and state it in the delegation prompt, splitting by file group when the budget is exceeded. A v1.1.77 first-pass mgr-sauron delegation put 30+ files and 4 judgment items into a single delegation and was truncated at 25 turns with no verdict.

### Wiki resync/reseed ordering — dispatch after deep-verify, not alongside it (#1688)

Wiki resync and the `wiki/.source-hashes.json` manifest reseed for the changed rules/skills are now dispatched **only after** the deep-verify findings for this run have been applied — never in parallel with deep-verify. This is a per-compression-tier ordering rule:

| Tier | What "deep-verify" means here | Wiki dispatch point |
|------|-------------------------------|----------------------|
| `docs-only` | The self-review checklist substitute, plus the mandatory mgr-sauron [[r017]] delegation when `.claude/rules/**` is in scope | After the checklist/R017 findings and any resulting corrections have landed |
| `lite` | The 2-delegation split (mgr-sauron R017 + change-type-appropriate adversarial review, see "deep-verify: lite-tier split standard" above) | After the adversarial-review findings are applied |
| Uncompressed | The full `deep-verify` skill spawn | After the spawn's findings are applied |

Rationale: wiki pages summarize the rules, so a review-driven rule fix invalidates any wiki page written before the review lands. v1.1.66 dispatched wiki resync in parallel with review and had to rework 3 pages after review findings changed the rules; v1.1.67 switched to review-first ordering and needed 0 rework (#1688 Iteration 3 #2).

The `implement` step's CI-mimic block (the pre-commit `verify-*.sh` script pass that includes `verify-wiki-sync.sh`) carries a matching **EXCEPTION**: when the changed set is rules/skills **TEXT only** (no new or renamed entity), the step does NOT fix wiki drift there — it records the drift and defers the wiki resync + manifest reseed until after deep-verify findings are applied, then re-runs `verify-wiki-sync.sh` before release. Missing PAGES for newly created entities are still generated at this point regardless of tier — CI blocks on missing pages, so page creation is not deferred, only the resync/reseed of already-existing pages against text-only rule/skill edits.

Cross-reference: [[r022]] wiki sync (the two-stage "page update + manifest reseed" requirement this ordering rule sequences relative to deep-verify), [[r017]] (the mgr-sauron delegation whose findings can invalidate an already-written wiki page).

### release step 3.a–3.c: `--admin` removed from the PR-merge instruction (#1591)

Step 3.c's merge instruction was corrected from `gh pr merge {n} --merge --delete-branch --admin` to a **plain merge, explicitly annotated "NOT --admin"**. Ground-truth measurement (`gh api repos/{owner}/{repo}/branches/develop/protection`, 2026-08-15) found `develop` protection requires exactly **6** status checks (`Test`, `Lint`, `Template Sync`, `Version Sync`, `Dependency Security Audit`, `Rust Tests`), `enforce_admins=false`, and **no** `required_pull_request_reviews` block — there is no reviewer-approval gate to bypass in the first place. v1.1.47 merged cleanly via `gh pr merge 1585 --merge --delete-branch` with no `--admin`. The step now instructs: attempt the plain merge once all 6 checks are green; if merge is rejected, re-run the protection query to re-measure the actual blocker rather than reflexively adding `--admin` ([[r010]] bypass-flag pre-check — name what a bypass flag bypasses, measured, before using it).

### deep-plan: research-conclusion figures must be recomputed from the artifact table (#1707 #4)

The `deep-plan` step description now adds: a research/measurement delegation's completion criteria must require every number appearing in the conclusion sentence to be recomputed from the artifact's own table (jq/awk) and paired alongside it. Cross-ref [[r023]] 「리서치 위임의 결론 수치는 표에서 재계산해 병기」.

### implement step: Anti-pattern 1:1 comparison + a fixed constraint block for text-editing delegations (#1707, expanded v1.1.81)

Two new standing bullets were added to the `implement` step's rules/gates block:

- **Anti-pattern 1:1 comparison** — before dispatching any delegation prompt in an iteration that created or reinforced a rule clause, the orchestrator MUST compare that clause's Anti-pattern table rows 1:1 against the delegation prompt's sentences and rewrite any match. Cause: [[r016]] 「신설 조항의 동일 반복 self-check」 was known as text but not executed as a procedure (#1707 #1).
- **Fixed constraint block** — every rule/skill/guide TEXT-editing delegation prompt must now include a standing block, expanded from 5 to 8 items:
  - (a) Korean 합쇼체 for new sentences, do not imitate adjacent 반말. As of v1.1.81 the completion criteria MUST include THREE deterministic checks, scoped to edited text files (md/yaml) and restricted to added lines only (`git diff -U0 -- <edited md/yaml files> | grep '^+'`): a family-word check, a line-final auxiliary check, and a line-final noun-ending check (added because 반말/명사 종결 endings such as 확인함·정정 필요·완료됨 fall entirely outside the 다-ending regexes, #1728 찐빠 #2 residual). Even with all three checks a residual gap remains for 반말/명사 종결 variants the patterns don't enumerate, so the agent MUST also read the newly added lines directly as a final check, not rely on regex alone. When an edit re-emits a pre-existing line unchanged in meaning (e.g. reformatting), only the newly added span is judged, not the whole re-emitted line.
  - (b) locate by anchor strings, never line numbers;
  - (c) copy quotations from `gh issue view --json body` output and verify with `grep -F`;
  - (d) a ±1 heading check including re-binding of relative references ("위 표"/"아래 표"/"직전 조항");
  - (e) copy to the `templates/` mirror and confirm `md5 -q` equality (#1707 #3);
  - (f) **[new, v1.1.81]** when paraphrasing a quoted source, preserve its result word, subject, and causal direction (결과어·주체·인과 방향 보존) — checked SEPARATELY from the `grep -F` lexical match, by placing the paraphrase and the original sentence side by side in the completion report (#1711 찐빠 #1);
  - (g) **[new, v1.1.81]** version/count example values written into rule/skill text use placeholders, never real literals — the rule corpus is itself a grep target, and a real literal can contaminate the very command a clause cites (#1711 찐빠 #2);
  - (h) **[new, v1.1.81]** any temporary file the delegation creates MUST live under a per-agent-unique path (`$TMPDIR` or the session scratchpad), never a fixed shared path (#1722 찐빠 #7). The orchestrator MUST confirm with `git status --short` after such a delegation that no stray file was left in the repo (#1721 찐빠 #7).

Additional standing bullets added to the same rules/gates block (v1.1.81):

- **Guard/classifier bypass prohibition** — every delegation prompt (not only rule/skill/guide TEXT edits) MUST instruct the agent that if a guard, classifier, or permission check blocks an action, it MUST NOT route around it (e.g. via a shell glob or path rewrite) — it MUST stop and report the block verbatim ([[r010]] 「품질 게이트 우회 금지 — 훅 차단은 보고 대상」, extended here from git hooks to guards/classifiers/permissions generally, #1728 찐빠 #1).
- **Forwarded number/identifier re-verification** — when forwarding a number OR an identifier (file path, rule number, issue number) an agent reported into a subsequent delegation prompt, the orchestrator recomputes the number once via diff/ls AND re-checks the identifier once via a corpus-wide grep of the reported CONTENT key, not the reported identifier itself (e.g. if an agent reports "rule N covers content key X", grep for X, not N) and compares the file/rule where that content actually lives against the reported identifier before restating either ([[r023]] 「리서치 위임의 결론 수치는 표에서 재계산해 병기」 확장, #1709 #5 확장, #1722 찐빠 #3).
- **Harness/production-path delegation bidirectional proof** — delegations that build or replace an evaluation/test harness or a production code path (fixtures, ablation lanes, scoring/oracle logic) MUST require bidirectional proof, not a single-direction pass: (a) positive AND negative fixtures, including invalid-input fixtures compared against the original's rc/stderr for a replaced code path, not just valid-input stdout parity; (b) a mandatory control — the change measured before AND after together with the SAME harness (대조군, #1721 찐빠 #1) — reverting the change to confirm the result flips, or a synthetic positive-control input, are additional proof means, not substitutes for the before/after measurement; (c) no working around a discovered product/measurement defect to force a pass — halt and report instead ([[r023]] 「Conditional-Output Verification」 확장, #1721 찐빠 #1, #1727 찐빠 #2, #1728 찐빠 #2).
- **CC-note correction ground truth** — delegations correcting a CC release note (a note the issue claims is wrong) MUST enclose the upstream CHANGELOG lines (measured with `grep -nF`) and the original target paragraph as ground truth; if the issue's premise differs from the primary source, the primary source wins and the discrepancy is reported rather than silently inherited into the corrected wording (#1730 찐빠 #1).
- **Split-delegation full findings list** — when review-correction work is split across file-ownership delegations (one file per agent), every split delegation prompt MUST carry the FULL list of review findings (not only the subset touching that agent's file) as a self-check list, so a fix in one file does not reintroduce a defect the review flagged in a sibling file (#1730 찐빠 #2).
- **DETAIL-wrap visible-sentence preservation check** — any delegation that compresses or conceals rule text (DETAIL-wrapping, retirement) MUST deterministically confirm that every visible approval/prohibition/MUST sentence present in the file at HEAD is semantically still present in the new visible text afterwards — a visible-text-to-visible-text comparison, not a summary-vs-summary one, using per-sentence `grep -F` of key phrases from each of HEAD's visible sentences against the new comment-stripped text (#1722 찐빠 #1).

Additional standing bullets added to the same rules/gates block (v1.1.83, #1735/#1737/#1733):

- **Labeled non-issue source blocks** — non-issue sources brought into an orchestrator-authored delegation prompt (더루키 회상, memory, observations from another project) MUST sit in a separate block labeled with its source (e.g. `[출처: 더루키 회상 — <project>]`) and MUST NOT be mixed into issue-quote sentences; completion criteria must state this separation explicitly. Applies to every orchestrator-authored delegation, all tiers — extends [[r010]] 「출처 인용과 인접 문구 점검」 (#1735 찐빠 #1).
- **Application-boundary table for bundled feedback proposals** — a release bundling ≥2 `feedback`-type issue proposals must produce a per-proposal application-boundary table (exceptions, deadlines, tiers/steps) during `plan`/`deep-plan` or its lightweight substitute, applying to `lite` and `standard` tiers; `implement`-stage delegation prompts must carry the relevant boundary row for each edit (#1735 찐빠 #4).
- **No success-looking `||` fallback on state-changing commands** — no state-changing command (`gh issue create/edit/close`, `gh pr create/edit/close/merge`, `git push`, label changes), including the orchestrator's own direct commands, MAY use a `||` fallback that prints success-looking output. Observed failure mode: a failed `gh issue create` followed by a `||` fallback that printed a DIFFERENT issue's URL, briefly read as a successful create. Exceptions: a `||` fallback explicitly marked as failure (`|| echo "::warning::…"`, a literal `MISS` token) and idempotent bootstrap commands with no success masking (`gh label create --force 2>/dev/null`) (#1735 찐빠 #2).
- **Batched-verification turn term** — any edit delegation requiring verification of N quotations or identifiers (not only `claude-code-release` CC-note delegations) must perform that verification with batched command(s) (a single loop or combined `grep -F` pass over all N items), never per-item invocations; the turn arithmetic (files × 3 + edit_items × 2 ≤ 16, [[r020]] item 9) must add a batched-verification term — ⌈N/batch⌉ — still an upper-bound guide that may still truncate, not a truncation guarantee (#1737 찐빠 #1).
- **Artifact-creating delegation measured reporting** — delegations that create files, binaries, worktrees, or branches (artifact-creating only; text-only edits excluded) must include measured output in their completion report — `file <bin>` for binaries, `ls -la <path>` for created paths, `git worktree list` for worktrees, `git branch --list` for branches — and the orchestrator must confirm architecture/path from that measured output before using the artifact, not from the agent's self-report alone ([[r020]] Subagent Self-Report Verification, #1733 찐빠 #1).
- **Fault-injection backup requirement** — delegations that inject faults / modify-then-restore files (not limited to harness builds) must back up the original file under `bak/<repo-relative-path>` (full path, not filename-only) nested under the session scratchpad or `$TMPDIR` (not inside the repo, per constraint (h) above), with a mandatory checksum comparison after restore; a `git diff`-based patch approach is also allowed. `git stash` remains allowed EXCEPT when parallel delegations share the working tree ([[r009]] "File-disjoint ≠ independent for local git state"), where it MUST NOT be used (#1733 코멘트 찐빠 #8).

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[dag-orchestration]], [[pipeline-guards]], [[task-decomposition]], [[professor-triage]], [[deep-verify]]
- **See also**: [[R009]], [[R010]], [[r015]]

## Sources

- `.claude/skills/pipeline/SKILL.md` — skill definition
- `.claude/skills/pipeline/workflows/auto-dev.yaml` — auto-dev workflow YAML (G1/G2 added v0.137.0; release step PR-body Closes-keyword requirement added v1.1.35 / #1531; branch-before-bump reordering added v1.1.39 / #1542; scope-selection 3-branch state machine + `--paginate` post-condition + compression-mode-eval Cross-tier State-Change Side Effects inventory added v1.1.42 / #1553 찐빠 #3; scope-selection Step 3 approval-required path pre-check added v1.1.45 / #1574 찐빠 #5; step 1.e lockfile-generation mechanism corrected + step 1.j 3-way assertion added 2026-08-15 / #1593; step 3.a–3.c `--admin` removed, ground-truth branch-protection measurement added 2026-08-15 / #1591)
- Content-drift resync 2026-08-17 (v1.1.49): added the multi-Phase split requirement for the `deep-plan`/`deep-verify` steps ([[r020]] wiring per #1595 #4 — measured `tool_uses=0` / 6.9s / zero artifacts when spawned as one skill call) and the corrected semver minor definition with its agora counter-example (skill/agent addition is established as patch in this repo).
- Content-drift resync 2026-09-03 (v1.1.59, #1644, #1645): added the "Phase 0.5: Effective permission mode pre-flight" subsection (advisory, never halts — project-scope `permissions.defaultMode` ignored on CC v2.1.257+, cross-ref [[r010]]) and the "implement/release commit steps: Bash timeout for pre-commit hook" subsection (main-worktree `.husky/pre-commit` runs the full ~165s test suite; commit delegations require `timeout: 400000`, `--no-verify` remains prohibited).
- Content-drift resync 2026-09-03 (v1.1.60): added "scope-selection Step 3: unattended-mode hooks-path deferral" (`/fsd`-style unattended runs defer `.claude/hooks/**` approval requests instead of interrupting per-issue, batching them at the `/homework` gate — cross-ref [[fsd]]) and "deep-verify: mgr-sauron carve-out inside docs-only compression" (rule-file/structural changes force mandatory [[r017]] verification even under `docs-only` compression).
- Content-drift resync 2026-09-03 (v1.1.60, #1650 C / #1652): added "Phase 0.6: unattended-mode detection" to pre-triage (consumes the [[fsd]] `/tmp/.claude-fsd-$PPID` marker or `OMCUSTOM_UNATTENDED=1` env, replacing prose inference), upgraded scope-selection Step 3's hooks-path deferral to use that deterministic signal, added the 4th substitution condition requiring anchor-based re-location in implement prompts when a same-session artifact substitutes for `deep-plan` (line numbers cited in an issue/artifact go stale across release commits), and added the `lite`-tier `deep-verify` 2-delegation split standard (mgr-sauron R017 + change-type-appropriate adversarial review), which caught a genuine regression via execution reproduction in two consecutive v1.1.59/60 iterations.
- Content-drift resync 2026-09-03 (v1.1.61, #1650 C): corrected Phase 0.6's marker check to its actual three-state form (`present`/`stale`/`absent`, not a binary present/absent) with the 360-minute (6h) stale threshold explicitly stated; noted the snippet's `if`/`fi` + trailing `echo` structure always exits 0, so a `false` result is a valid measurement outcome and never halts the pipeline.
- Content-drift resync 2026-09-03 (#1655): added "ci-check: auto-tag `run.headSha` may lag the PR head" (cross-check against `gh pr view --json mergeCommit` rather than trusting `run.headSha` as the merged commit) and "deep-verify: standard delegation wording — do not re-run pre-measured items" (aligned with [[r023]]'s new verification-floor ceiling — a paired mgr-sauron delegation measured 25-turn truncation with a re-verified pre-measured item vs. 16-turn completion without it).
- Content-drift resync 2026-09-18 (v1.1.69, #1688): added "Wiki resync/reseed ordering — dispatch after deep-verify, not alongside it" — the `docs-only`/`lite`/uncompressed tiers all now dispatch wiki resync and the `wiki/.source-hashes.json` reseed only after that tier's deep-verify substitute (self-review/R017, or the R017+adversarial-review split, or the full skill) has landed, with a matching EXCEPTION in the `implement` step's CI-mimic block that defers wiki drift fixes for rules/skills TEXT-only changes (page generation for newly created entities is not deferred). v1.1.66 reworked 3 wiki pages after parallel-dispatched review changed the rules; v1.1.67's review-first ordering needed 0 rework (#1688 Iteration 3 #2).
- Content-drift resync 2026-09-19 (v1.1.72, #1698): the `implement` step's rules/gates block now adds a standing instruction — when a delegation edits rule/skill/guide TEXT, the orchestrator must NOT author the final committed wording; the subagent writes it directly from the issue body (`gh issue view <N> --json body`), and the delegation prompt supplies only pointers, insertion anchors, constraints, and verbatim quoted facts. Cross-ref [[r010]] 「출처 인용과 인접 문구 점검도 같은 규율」 보강 2항목 (#1698 #1) — the same 3rd-recurrence citation-accuracy defect that motivated that R010 addition (v1.1.69 session number → v1.1.70 "and marketplace" → v1.1.71 "High 2건") traced back to the orchestrator hand-authoring rule prose instead of the subagent quoting the issue.
- Content-drift resync 2026-09-19 (v1.1.73, #1701): extended that same `implement` step bullet — the orchestrator's own requirement/scope summary counts as final wording too; copy the issue's proposal sentence from `gh issue view` output verbatim, and tag any orchestrator paraphrase "[요약 — 원문 우선]" (#1701 #1). Cross-ref [[r010]] 보강 2항목's new #1701 #1 item.
- Content-drift resync 2026-09-19 (v1.1.74, #1704): extended that same `implement` step bullet a third time — the orchestrator's own wiring judgement (e.g. "the existing implement-step bullet already covers this") also counts as final wording; the prompt supplies candidate files/anchors only, and the subagent decides coverage by quoting the covering sentence (#1704 #1). Cross-ref [[r010]] 보강 2항목's new #1704 #1 item.
- Content-drift resync 2026-09-19 (v1.1.74, #1703): the `deep-verify` step description now adds a completion condition when the change is a hook/advisor option — count real-transcript matches (not just synthetic fixtures) for at least one transcript from this project (#1703 권장 2). Cross-ref [[r023]] 「훅 옵션 검증은 합성 픽스처 + 실 트랜스크립트 1건」.
- Content-drift resync 2026-09-19 (v1.1.75, #1707): added "deep-plan: research-conclusion figures must be recomputed from the artifact table" (#1707 #4) and "implement step: Anti-pattern 1:1 comparison + a fixed constraint block for text-editing delegations" (#1707 #1, #1707 #3) — the latter closes the gap where a rule-authoring/wiring self-check was known as text but never executed as a checklist against the delegation prompt itself, and standardizes a 5-item (a)–(e) constraint block on every rule/skill/guide TEXT-editing delegation prompt. Cross-ref [[r023]] and [[r016]] Rule Wiring Check.
- Issue #1531 — PR-body Closes-keyword omission left 5 issues open despite green workflow (v1.1.34)
- Issue #1542 — bump pushed to develop before branching produced a diff=0 release PR (v1.1.38)
- Issue #1553 — lite compression silently skipped the milestone-create state-change branch alongside the compressible analysis step, leaving v1.1.41 without a milestone (v1.1.41 retrospective)
- Issue #1574 — an approval-required `.claude/hooks/**` path surfaced mid-run instead of at scope time, stalling an unattended run on an interactive approval after scope was already committed (v1.1.44 retrospective)
- Issue #1591 — release-PR merge instruction carried an unverified `--admin` flag across sessions; ground-truth measurement found no reviewer-approval gate exists and a plain merge succeeds (2026-08-15)
- Issue #1593 — step 1.e's lockfile mechanism was undocumented and silently recorded a stale `templateVersion` when run before step 1.d landed; step 1.j 3-way assertion added to close the gap step 1.i's 2-way check misses (2026-08-15)
- Content-drift resync 2026-09-24 (v1.1.77, #1717): added an `implement`-step description bullet for `claude-code-release` issues — CC release knowledge goes to `guides/claude-code/15-version-compatibility.md` per rule (+ templates mirror); a rule file gets at most ONE behavioral line, and only when agent behavior must change. Delegations adding visible text to `CLAUDE.md`/`.claude/rules/*.md` must keep the comment-stripped total ≤140,000 chars (hard cap 150,000, `validate-docs --programmatic-only`) — retire/DETAIL-wrap another clause in the same change if needed. Cross-ref [[r016]]'s new instruction-budget policy.
- Content-drift resync 2026-09-24 (v1.1.81, #1721/#1722/#1725/#1727/#1728/#1730): added "Cross-tier: Lightweight Skill-Mode Substitution" (triage/plan/deep-plan may run as orchestrator-integrated analysis under a 4-condition gate — scope ≤3 issues, code evidence or measured root cause, mandatory justification log, mode-labeled output; cross-ref [[deep-plan]], [[professor-triage]]); the scope-selection existing-file `git ls-files` check (excludes the new-creation carve-out already in [[r010]] "Required Checks"); "implement step 5: commit trailer restriction + deferred combined-commit option" (trailers limited to the exact text supplied, and an implement-stage commit may be deferred to combine with deep-verify corrections before any push to develop); the `verify-build` coverage-threshold check (reads the live `.husky/pre-commit` threshold rather than hardcoding one — exists specifically to cover the deferred-commit gap); expanded the fixed constraint block from 5 to 8 items ((f) result-word/subject/causal-direction preservation, (g) placeholders not real literals in rule examples, (h) unique temp-file paths + post-delegation `git status --short` check) and added six new standing implement-step bullets (guard/classifier bypass prohibition, forwarded number/identifier re-verification, harness/production-path bidirectional-proof requirement, CC-note correction ground truth, split-delegation full findings list, DETAIL-wrap visible-sentence preservation check); added verification-delegation turn-arithmetic sizing to the `deep-verify` standard-delegation-wording section; and added "ci-check: bounded CI polling + issue label/state lifecycle fix step" (`gh run watch --exit-status` over unbounded polling, plus a find-and-fix pass for stale `in-progress` labels on closed issues).
- Content-drift resync 2026-09-25 (v1.1.83, #1733/#1734/#1735/#1737): renamed the excluded triage label to `triage-complete` (meaning unchanged) across scope-selection's filter and the side-effect inventory, clarifying that manifest-selected issues inside `auto-dev`'s triage step still get `verify-ready`; added a `ci-check` state change removing `verify-ready` from THIS release's closed scoped issues only. Added "Security/availability carve-out for `deep-plan`" — a scoped security/availability issue forces a full `deep-plan` skill spawn for the whole release (lightweight/lite substitution forbidden), with a mandatory "executions per request (amplification)" entry-point-audit item. Added "release step 0a: user-execution constraint check" — reads CLAUDE.md/session memory/entry card for a "user must run this" constraint before merge/tag/publish commands; an unattended run HOLDS convergence at the first covered command (cross-ref [[fsd]]). Added six standing implement-step-gates bullets: labeled non-issue source blocks (extends [[r010]]), a per-proposal application-boundary table for bundled feedback-issue releases, a ban on success-looking `||` fallbacks on state-changing commands, a batched-verification ⌈N/batch⌉ turn-arithmetic term (extends [[r020]] item 9), measured-output reporting for artifact-creating delegations (extends [[r020]] Subagent Self-Report Verification), and a fault-injection backup/checksum requirement (cross-ref [[r009]] File-disjoint ≠ independent).
- Content-drift resync 2026-09-25 (#1743): added "Phase 0: label bootstrap must run literally, not as a loop" — the pre-triage label-bootstrap block's three `gh label create` calls must be run exactly as written, not rewritten as a shell loop over a variable, because zsh does not word-split an unquoted `$var` and a loop can silently produce a malformed combined label name with no error. Cross-references the sibling `.claude/skills/pipeline/labels.md` "Rename Verification" note (#1740) — a label rename must be confirmed absent via `gh label list`, not via an issue count on the old label name, since GitHub still resolves the old name to the renamed label.

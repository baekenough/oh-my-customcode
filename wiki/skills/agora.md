---
title: Agora
type: skill
updated: 2026-11-23
sources:
  - .claude/skills/agora/SKILL.md
related:
  - [[agora-runner]]
  - [[adversarial-review]]
  - [[multi-model-verification]]
  - [[evaluator-optimizer]]
  - [[worker-reviewer-pipeline]]
  - [[r009]]
  - [[r010]]
  - [[r020]]
  - [[r021]]
---

# Agora

Multi-round anonymized adversarial consensus review across three independent model vendors, judged by a rotating model (when `AGORA_AGY_ENABLE=1`), producing a consensus report. The `agy` vendor is off by default.

## Overview

`agora` runs a design/decision topic through 3 independent vendor CLIs (`claude -p`, `omx exec`, `agy -p`) under anonymous A/B/C labels, judged each round by a rotating judge (rotation holds only with `AGORA_AGY_ENABLE=1`). Label-to-vendor mapping is sealed under `SEALED/` and, by convention, is kept off the judge's input path; vendor disclosure happens only at final report generation.

**The design does NOT claim deterministic anonymity.** The goal is not "vendor unidentifiable" but "vendor identification is not on the judge's default observation path." See [Trust Boundary](#trust-boundary) for the residual leakage channels this does not close.

Round 1 runs from a blank slate (topic + attachments only) to get genuinely independent opinions; rounds 2+ carry forward the prior judge's `agenda[]` and `prior_rounds[]` to drive convergence.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/agora <topic> [--attach <path>] [--max-rounds <N>] [--auto]`
- **Round pipeline**: `reviewers.sh` → `anonymize.sh` → `judge.sh` → `agora.sh --decide-stop`
- **Default mode**: `gated` — user reviews each round via `[c]ontinue / [s]top / [e]xtra-agenda`
- **`--auto`**: skips per-round gates; worst case ~600k tokens and ~2h across 5 rounds

## A/B/C Are Per-Round Labels, Not Vendors

A/B/C are re-shuffled every round from the seed `agora-<epoch>-r<N>`, so **no fixed "reviewer A" vendor exists**. The gate line `리뷰어: A BUILD_WITH_CHANGES · B BUILD · C REDESIGN` must not be read as a vendor verdict — the next round's `A` is a different vendor, and cross-round label comparison is invalid. Label-to-vendor correspondence is disclosed only in `report.md`. When a vendor is missing, the gate line shows only two labels.

## Vendor/Judge Non-Overlap — Scoped to Model ID Only

Reviewer vendors and judge rotation slots do NOT overlap at the model-ID level, but DO overlap at other axes (spec REQ-3). The table names reviewers by **vendor slug**, not by A/B/C:

| Axis | Overlap |
|------|---------|
| Model ID | None — reviewers use `claude-opus-4-8` (`claude`) / omx default (`omx`) / `gemini-4-neon-high` (`agy`); judges use `claude-opus-5-5` (`claude`) / `claude-sonnet-5-5-high` (`agy`) / `gpt-oss-120b-medium` (`agy`) |
| CLI binary | **Yes** — the `claude` binary backs the `claude` reviewer and judge slot 1; `agy` backs the `agy` reviewer and judge slots 2-3 (agy off by default) |
| Model family | **Yes** — 2 of 3 judge slots (`claude-opus-5-5`, `claude-sonnet-5-5-high`) are Claude-family, same family as the `claude` reviewer |

"No cross-contamination between review and verdict" holds only at the model-ID granularity — shared pretraining bias within a model family is not removed by this separation.

## CLI Entry Points and Channel Contract

| Entry point | Writes files | Run by |
|-------------|:---:|--------|
| `--decide-stop` | no | [[agora-runner]] |
| `--start` | **yes** | [[agora-runner]] |
| `--round <N>` | **yes** | [[agora-runner]] |
| `--gate` | no | orchestrator (user interaction) |
| `--set-stop <CODE>` | **yes** | [[agora-runner]] |
| `--report` | **yes** | [[agora-runner]] |

`--start` puts **only the session directory absolute path on stdout** so the documented idiom `dir=$(bash agora.sh --start ...)` stays usable; in gated mode the round-1 gate block goes to **stderr** instead. The standalone `--gate` subcommand does print its block to stdout. Since a runner's stderr never reaches the return contract, the orchestrator re-renders the gate with `--gate --session-dir <dir> --round 1` after `--start` returns.

`--set-stop <CODE>` is the **only** writer of `.stop` (= `report.md`'s `종료 사유`) from round 2 onward. Skip it and even a cleanly finished session reports `종료 사유: UNKNOWN`. Accepted: `CONSENSUS` / `STALLED` / `MAX_ROUNDS` / `USER`; `CONTINUE` and unknown codes exit 64. `--start --auto` and gated `--start`'s round 1 record it internally.

## Exit Codes

`agora.sh` propagates sub-script codes unchanged (68 gains one diagnostic line), so `--round` can surface any of these:

| Code | From | Meaning |
|------|------|---------|
| `1` | `anonymize.sh` | Fingerprint detected — hard stop; nothing written to `SEALED/mapping/` or `anon/` |
| `3` | `reviewers.sh` · `anonymize.sh` | **Fewer than 2 valid reviewers** — two-stage floor (CLI response, then response-schema validity); distinguish via stderr |
| `4` | `judge.sh` | All attempted judge slots failed — all 3 when agy is enabled, slot 1 only by default (CLI failure, timeout, parse failure, schema violation) |
| `64` | all | Usage error — unknown option, missing flag, non-array `--extra-agenda`, bad `--set-stop` code |
| `65` | `anonymize.sh` | Prior-round sealed data present but unparseable, or unknown vendor id — deliberately distinct from `1` |
| `66` | `agora.sh` · `judge.sh` | Missing session directory / missing `--anon-file` |
| `68` | `judge.sh` | Config error — `verdict-schema.json` unreadable/unparseable; a retry fails identically |
| `73` | `agora.sh` | **Write failure after the round already ran and billed** — do not consume artifacts, do not re-run; report the stderr diagnostic |

## Judge Verdict Validation

`judge.sh` checks required-field presence, **declared type match**, and enum values (`consensus`, `verdict`) against `verdict-schema.json` — all read from the schema file, so schema changes propagate. Any violation fails that slot and advances the rotation; exhausting the attempted slots is exit `4`. Type checking matters most because a string where the schema declares an array (`agenda`) would survive, break the next round's `jq '. + $extra'` merge, and collapse the agenda to empty only after all 3 vendors were called and billed.

## Permission-Bypass Flags (asymmetric)

Only one reviewer CLI is invoked with a permission-skipping flag, automatically and without operator approval:

| Call | CLI | Flag |
|------|-----|------|
| Reviewer | `claude` | `--enable-auto-mode` (follow-up #1994) |
| Reviewer | `omx` | none |
| Reviewer | `agy` | **none** — runs in an empty temp cwd and is off by default |
| Judge slot 1 | `claude` | **none** |
| Judge slots 2-3 | `agy` | **none** — empty temp cwd, off by default |

The `claude` reviewer gets the flag because `claude` is a user-shell **alias** carrying it, and aliases do not expand under non-interactive `bash script.sh`. `agy` is also an alias whose definition carries a permission-bypass flag, but the script deliberately does not pass it (#1985). `judge.sh` omits the flag for both judge CLIs, so the `claude` reviewer/judge asymmetry is real; a judge that hits a permission prompt times out and advances the rotation. Do not add the flag — check the CLI's own permission state instead.

## agy Is Off by Default

The `agy` reviewer and `agy` judge slots 2-3 start only when `AGORA_AGY_ENABLE` is **exactly `1`** (`true`, `0`, empty, ` 1`, `yes` all mean off). Why: in an agy 1.5.15 probe without bypass flags, `gemini-4-neon-high` and `claude-sonnet-5-5-high` each wrote a file to an absolute path outside the empty cwd, read a file outside it, and ran a shell command, with no approval prompt (one non-deterministic sample per model and capability). The empty cwd and env stripping reduce location hints but are **not a sandbox**.

When on, identities are reviewer `agy:gemini-4-neon-high`, judge slot 2 `agy:claude-sonnet-5-5-high`, slot 3 `agy:gpt-oss-120b-medium`. When off:

- **Reviewer** — `agy` is not started and counts as missing, so one more missing `claude`/`omx` reviewer aborts the round with exit `3`.
- **Judge** — both `agy` slots are skipped and only slot 1 (`claude-opus-5-5`) judges; if it fails the round exits `4`. The per-round model rotation (REQ-3) holds only when agy is enabled.

The limitations of the enabled path are deferred to issue #1994 (see SKILL.md `### agy는 기본으로 꺼져 있습니다`).

## Trust Boundary

Anonymity is maintained by directory boundary, not prompt instruction. Note that **two subjects read `SEALED/`**:

| Subject | `SEALED/` | `anon/` |
|---------|:---:|:---:|
| Orchestrator (main conversation) | forbidden | allowed |
| [[agora-runner]] | forbidden | allowed |
| Reviewer CLIs (3; `agy` only when enabled) | forbidden | forbidden |
| Judge CLI | forbidden | allowed (the anonymous bundle is its only input) |
| `anonymize.sh` | **allowed** — reads `SEALED/raw/` and `SEALED/mapping/`, and seals this round's mapping | allowed (it produces `anon/round-N.json`) |
| `report.md` generation step | **allowed** — reads `SEALED/mapping/` | allowed (de-anonymization is its purpose) |

Reading the seal and breaking the seal are distinct: `anonymize.sh` reads sealed originals and mappings but emits only labels into `anon/`. De-anonymization happens only at `report.md` generation.

**Limit 1 — leakage that survives perfect isolation** (spec §6): three channels still leak vendor signal to the judge.
1. **Within-round consistency** — one label's response is internally coherent across a round (e.g. "A's 5 findings all cluster on performance").
2. **Cross-round consistency** — `prior_rounds[]` re-labels past rounds into the current mapping. An intentional trade-off: preventing "A changed its position" misreads outweighs the added inference risk.
3. **Argumentation-style fingerprint** — format normalization reduces prose-style fingerprints but not a model's tendency to repeatedly probe a specific axis.

So the design achieves "vendor identification is not on the judge's default observation path," not "vendor identification is impossible."

**Limit 2 — isolation is convention, not hard-blocked**: the orchestrator and the judge CLI retain the raw file-read capability to reach `SEALED/` — they are designed not to, not incapable of it. A PreToolUse hook hard-blocking `SEALED/` reads was considered and deferred (hooks affect the whole project; a candidate for [[r021]] Hard Enforcement Candidates promotion if a violation rate is observed). The real defense is the fingerprint check below, which detects leakage after the fact rather than preventing an attempt.

**Limit 3 — child CLIs inherit cwd**: vendor and judge CLIs run with `AGORA_*` variables stripped, but the working directory is inherited. Because the default `AGORA_OUTPUT_ROOT` is the relative path `.claude/outputs/sessions`, walking that tree from the inherited cwd reaches the session tree — `SEALED/` included. Sanitization guarantees the session coordinates are not *handed over*, not that they cannot be *found*. An absolute `AGORA_OUTPUT_ROOT` outside the session tree narrows this, but cwd inheritance remains. An enabled `agy` child starts in an empty temp cwd, which reduces that path but is not a boundary: it can still write, read, and run shell commands at absolute paths (see [agy Is Off by Default](#agy-is-off-by-default)).

### Fingerprint Check

The check does **not** scan `anon/round-N.json` as a whole. `anonymize.sh` first builds a derived document containing only vendor-authored text and scans that:

| Field | Scanned | Why |
|-------|:---:|-----|
| `reviewers[]` (this round) | **yes** | reviewer-authored — the subject of anonymization |
| `prior_rounds[].reviewers[]` | **yes** | re-labeled reviewer text forwarded to the next judge |
| `prior_rounds[].draft` · `.verdict` | **yes** (after operator-vocabulary removal) | judge-authored, but forwarded via `relabel_prior` to the *next* judge — an attribution guess ("A looks Claude-family") must not pass through unchecked |
| `topic` · `agenda` · `attachments` | no | operator-authored — deliberately exempt (Ruling 10); a topic may legitimately name a vendor |
| `round` and other metadata | no | not vendor-derived |

Judge-authored fields are filtered word-by-word (tokenize → drop operator words → rejoin, whole words only, with `/ - . _` treated as word characters) so the judge can legitimately quote the topic. Reviewer text is **not** filtered — a reviewer echoing the topic still counts as leakage.

Patterns are case-insensitive (`grep -Eiq`) in three layers: (1) explicit vendor/product tokens (`codex`, `omx`, `gpt`, `claude`, `gemini`, `antigravity`, `anthropic`, `openai` + Korean transliterations) matched as bare substrings; (1') `agy` with word boundaries (3 letters, collides with `stagy`/`cagy`); (2) family names overlapping English words (`opus`, `sonnet`, `haiku`, `flash`) only when version-adjacent or non-ASCII-adjacent; (3) sealed path shapes (`SEALED/`, `/mapping/`, `raw/round-`). Accepted false negative: a bare family name in English prose (`Sonnet would argue`). Accepted false positive: `flash 메모리`. Over-blocking is preferred because a false positive is loud and recoverable while a false negative silently breaks anonymity.

### Vendor-Call Environment Sanitization

`reviewers.sh` and `judge.sh` strip **every environment variable prefixed `AGORA_`** before exec'ing a child CLI (`env -u`, with names collected at runtime via `compgen -e` rather than hardcoded). Without this, an operator shell exporting `AGORA_OUTPUT_ROOT` would hand every vendor CLI the path one level above the session tree. Non-`AGORA_` variables (`PATH`, `HOME`, vendor auth tokens, proxy settings) are untouched, and the scripts themselves keep using `AGORA_TIMEOUT_SECS` etc. as ordinary shell variables. This does not cover cwd — see Limit 3.

## R010 Delegation Structure

The orchestrator cannot write files directly ([[r010]]). The four file-writing entry points (`--start`, `--round`, `--set-stop`, `--report`) all go to [[agora-runner]] — one delegation = one round, to avoid Phase-boundary mid-step termination ([[r020]] "위임 경계를 Phase 개수로 설계"). The pure-output `--gate` stays with the orchestrator, which also owns all user gate interaction; `agora-runner` never talks to the user and returns only a verdict summary (never reviewer text, vendor attribution, or `SEALED/` paths).

## Relationships

- **Executed by**: [[agora-runner]] (one round or one session step per delegation)
- **Related skills**: [[adversarial-review]] (single-agent attacker-perspective review), [[multi-model-verification]], [[evaluator-optimizer]], [[worker-reviewer-pipeline]]
- **Governed by**: [[r009]] (parallel/decomposition boundaries), [[r010]] (orchestrator file-write delegation), [[r020]] (single-goal delegation unit), [[r021]] (advisory-first enforcement — why `SEALED/` is convention, not a hard block)

## Sources

- `.claude/skills/agora/SKILL.md` — skill definition

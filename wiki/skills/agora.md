---
title: Agora
type: skill
updated: 2026-08-15
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
---

# Agora

Multi-round anonymized adversarial consensus review across three independent model vendors, judged by a rotating model, producing a consensus report.

## Overview

`agora` runs a design/decision topic through 3 independent vendor CLIs (`claude -p`, `omx exec`, `agy -p`) under anonymous A/B/C labels, judged each round by a rotating judge. Label-to-vendor mapping is isolated in `SEALED/` and never enters the judge's input path; vendor disclosure happens only at final report generation.

**The design does NOT claim deterministic anonymity.** The goal is not "vendor unidentifiable" but "vendor identification is not on the judge's default observation path." See [Trust Boundary](#trust-boundary) for the residual leakage channels this does not close.

Round 1 runs from a blank slate (topic + attachments only) to get genuinely independent opinions; rounds 2+ carry forward the prior judge's `agenda[]` and `prior_rounds[]` to drive convergence.

## Key Details

- **Scope**: core
- **User-invocable**: yes
- **Command**: `/agora <topic> [--attach <path>] [--max-rounds <N>] [--auto]`
- **Round pipeline**: `reviewers.sh` → `anonymize.sh` → `judge.sh` → `agora.sh --decide-stop`
- **Default mode**: `gated` — user reviews each round via `[c]ontinue / [s]top / [e]xtra-agenda`
- **`--auto`**: skips per-round gates; worst-case ~600k tokens across 5 rounds
- **Exit codes**: `4` = judge rotation exhausted (no retry); `68` = verdict schema config error (no retry)

## Vendor/Judge Non-Overlap — Scoped to Model ID Only

Reviewer vendors and judge rotation slots do NOT overlap at the model-ID level, but DO overlap at other axes (spec REQ-3):

| Axis | Overlap |
|------|---------|
| Model ID | None — reviewers use `claude-opus-4-8` / omx default / `gemini-3.1-pro-high`; judges use `claude-opus-5` / `claude-opus-4-6-thinking` / `gpt-oss-120b-medium` |
| CLI binary | **Yes** — `claude` binary backs reviewer A and judge slot 1; `agy` backs reviewer C and judge slots 2-3 |
| Model family | **Yes** — 2 of 3 judge slots are Claude-family, same family as reviewer A |

"No cross-contamination between review and verdict" holds only at the model-ID granularity — shared pretraining bias within a model family is not removed by this separation.

## Trust Boundary

Anonymity is maintained by directory boundary, not prompt instruction: `SEALED/` (raw reviewer output + label mapping) is inaccessible to the orchestrator, `agora-runner`, and all reviewer/judge CLIs; only the final `report.md` generation step may read it.

**Limit 1 — leakage that survives perfect isolation** (spec §6): even if the boundary above holds perfectly, three channels still leak vendor signal to the judge:
1. **Within-round consistency** — one label's response is internally coherent across a round, letting the judge observe stylistic patterns (e.g. "A's 5 findings all cluster on performance").
2. **Cross-round consistency** — `prior_rounds[]` re-labels past rounds into the current mapping, making cross-round consistency observable too. This is an intentional trade-off: preventing the judge from misreading "A changed its position" outweighs the added vendor-inference risk.
3. **Argumentation-style fingerprint** — format normalization reduces prose-style fingerprints but does NOT remove argumentation-style fingerprints (a model's tendency to repeatedly probe a specific axis).

So the design achieves "vendor identification is not on the judge's default observation path," not "vendor identification is impossible" — a judge that actively tries to infer vendor may partially succeed.

**Limit 2 — isolation is convention, not hard-blocked**: the `SEALED/` boundary is a design convention, not an enforced barrier. The orchestrator and judge CLI retain the raw file-read capability to access `SEALED/` — they are designed not to, not incapable of it. A PreToolUse hook hard-blocking `SEALED/` reads was considered and deferred (hooks affect the whole project; candidate for [[r021]] Hard Enforcement Candidates promotion if violation rate is observed). The actual defense is a deterministic anonymous-bundle check — scanning `anon/round-N.json` for vendor fingerprints (CLI names, model names, `SEALED`/`mapping`/`raw/` path strings) — which detects leakage after the fact, not prevents an attempt.

## R010 Delegation Structure

The orchestrator cannot write files directly ([[r010]]). Round execution (writing artifacts) delegates to [[agora-runner]] — one delegation = one round, to avoid Phase-boundary mid-step termination ([[r020]] "위임 경계를 Phase 개수로 설계"). The pure-output `--gate` command (no file writes) is run directly by the orchestrator, which also owns all user gate interaction — `agora-runner` never talks to the user and returns only a verdict summary (never reviewer text, vendor attribution, or `SEALED/` paths).

## Relationships

- **Executed by**: [[agora-runner]] (round execution, one round per delegation)
- **Related skills**: [[adversarial-review]] (single-agent attacker-perspective review), [[multi-model-verification]], [[evaluator-optimizer]], [[worker-reviewer-pipeline]]
- **Governed by**: [[r009]] (parallel/decomposition boundaries), [[r010]] (orchestrator file-write delegation), [[r020]] (single-goal delegation unit, mid-step termination avoidance)

## Sources

- `.claude/skills/agora/SKILL.md` — skill definition

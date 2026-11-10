---
title: Sauron Watch
type: skill
updated: 2026-11-10
sources:
  - .claude/skills/sauron-watch/SKILL.md
related:
  - [[mgr-sauron]]
  - [[audit-agents]]
  - [[fix-refs]]
  - [[update-docs]]
  - [[R017]]
  - [[R010]]
  - [[R023]]
---

# Sauron Watch

Full R017 structural verification — the all-seeing eye for system integrity.

## Overview

Runs the complete R017 verification before any commit/push: Phase 1 (5 rounds of manager verification via `mgr-supplier:audit` and `mgr-updater:docs`), Phase 2 (3 rounds of deep review — workflow alignment, reference verification, philosophy compliance), Phase 2.5 (documentation accuracy), Phase 3 (fix issues), Phase 4 (commit ready). Delegated to `mgr-sauron`. The name references the "all-seeing eye" metaphor for system integrity.

The skill applies R023 shift-left to avoid redundant LLM re-spawns: Round 3-4 (re-verify) is **conditionally skipped** when Round 1-2 returned 0 issues, and Round 5's count/sync checks are **substituted by deterministic scripts** (`verify-template-sync.sh`, `verify-wiki-sync.sh`, `verify-version-sync.sh`, `validate-docs.ts`, pre-commit count-coverage hook, `omcustom doctor`) instead of re-deriving the same check via an LLM.

Two Round 5 criteria were tightened. Memory checks follow R006: `memory` is an optional frontmatter field, its value (project|user|local) is validated only when present, and a missing field is not a finding. A new `[script]` item checks for template orphans in installed projects by consuming the `Orphans` result of `omcustom doctor`; "lock N/N match" alone is not evidence of no leftovers, since owned leftovers show up as matching lock entries. In the source repo this item is covered by `verify-template-sync.sh` mirror parity.

Phase 2 also runs four structural lints — Routing Coverage, Orphan Skill Detection, Circular Dependency Check, and Context Fork Cap Verification (ERROR at >12, WARN at ≥8) — plus an advisory Spec Density Check (agent body LOC vs referenced skill LOC ratio; WARN above 0.5). Lints are advisory except circular-dependency and fork-cap-exceeded, which are ERROR-level and should block commit.

## Key Details

- **Scope**: harness
- **User-invocable**: yes
- **Command**: `/omcustom:sauron-watch`
- **Effort**: not specified

## Relationships

- **Used by agents**: [[mgr-sauron]]
- **Related skills**: [[audit-agents]], [[fix-refs]], [[update-docs]]
- **See also**: [[R017]] (verification phases this skill implements), [[R010]] (commit/push gating), [[R023]] (shift-left conditional-skip and deterministic-script substitution)

## Sources

- `.claude/skills/sauron-watch/SKILL.md` — skill definition

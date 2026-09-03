---
title: Post-Release Followup
type: skill
updated: 2026-09-03
sources:
  - .claude/skills/post-release-followup/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[professor-triage]]
---

# Post-Release Followup

Analyze release workflow findings and auto-register defects as GitHub issues; seek confirmation only for immediate code-changing actions.

## Overview

After PR creation in a release workflow, collects unaddressed findings from multiple sources (remaining open issues, deep-verify findings, triage deferred items, TODO markers in changed files, PR review feedback from omc_pr_analyzer). Deduplicates, categorizes by urgency, then applies a two-track processing model:

- **Auto-Register Genuine Defects (no-ask)**: Real defects, process gaps, and coverage gaps are registered as GitHub issues automatically without asking the user. This includes bugs, missing tests, documentation holes, and workflow gaps. When ambiguous whether something qualifies, the skill leans toward registering. Authority: user directive (session 102) + [[R016]] Defect Response Matrix.
- **Anchor-based code locations in issue bodies (#1652 #3-2)**: an issue's `## 컨텍스트` section cites code locations by **function name or a unique anchor string**, not by line number — line numbers go stale by the next release commit. In the v1.1.60 session, `#1647`'s cited lines 346-348 reflected the v1.1.59 state; the script had grown 608→733 lines by the time two implementation agents tried to use them, forcing a re-search. If a line number is included as a convenience, it must be paired with the base commit SHA and marked "reference only" — downstream delegations are written assuming line numbers are stale and re-location is anchor-based (cross-ref [[pipeline]] auto-dev.yaml substitution condition 4).
- **User Confirmation (A–C menu)**: Required only for "즉시 실행" (immediate, code-changing) items — actions that modify source code, configs, or other files in the current session. The A–C menu presents: (A) execute now, (B) register as issue instead, (C) skip.
- **Excluded from auto-registration**: Pure cosmetic notes and personal preference observations that carry no actionable defect signal.

## Key Details

- **Scope**: harness
- **User-invocable**: no
- **Effort**: medium

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[professor-triage]], [[omcustom-release-notes]]
- **See also**: [[R020]], [[R016]]

## Artifact Output

Results written to `.claude/outputs/sessions/{date}/`. Auto-registered GitHub issues are created via `gh issue create` during the skill run; no separate user prompt precedes issue creation for defect/gap items.

## Sources

- `.claude/skills/post-release-followup/SKILL.md` — skill definition; auto-register behavior added #1238
- Content-drift resync 2026-09-03 (v1.1.60, #1652 #3-2): added the anchor-based code-location convention for auto-registered issue bodies — cite function names/unique strings instead of line numbers, since line numbers went stale by the next release commit and cost two implementation agents a re-search.

---
title: Post-Release Followup
type: skill
updated: 2026-10-06
sources:
  - .claude/skills/post-release-followup/SKILL.md
related:
  - [[release-plan]]
  - [[deep-verify]]
  - [[skills/professor-triage|professor-triage]]
  - [[r020]]
---

# Post-Release Followup

Analyze release workflow findings and auto-register defects as GitHub issues; seek confirmation only for immediate code-changing actions.

## Overview

After PR creation in a release workflow, collects unaddressed findings from multiple sources (remaining open issues, deep-verify findings, triage deferred items, TODO markers in changed files, PR review feedback from omc_pr_analyzer). Deduplicates, categorizes by urgency, then applies a two-track processing model:

- **Auto-Register Genuine Defects (no-ask)**: Real defects, process gaps, and coverage gaps are registered as GitHub issues automatically without asking the user. This includes bugs, missing tests, documentation holes, and workflow gaps. When ambiguous whether something qualifies, the skill leans toward registering. Authority: user directive (session 102) + [[R016]] Defect Response Matrix.
- **Anchor-based code locations in issue bodies (#1652 #3-2)**: an issue's `## 컨텍스트` section cites code locations by **function name or a unique anchor string**, not by line number — line numbers go stale by the next release commit. In the v1.1.60 session, `#1647`'s cited lines 346-348 reflected the v1.1.59 state; the script had grown 608→733 lines by the time two implementation agents tried to use them, forcing a re-search. If a line number is included as a convenience, it must be paired with the base commit SHA and marked "reference only" — downstream delegations are written assuming line numbers are stale and re-location is anchor-based (cross-ref [[pipeline]] auto-dev.yaml substitution condition 4).
- **User Confirmation (A–C menu)**: Required only for "즉시 실행" (immediate, code-changing) items — actions that modify source code, configs, or other files in the current session. The A–C menu presents: (A) execute now, (B) register as issue instead, (C) skip.
- **Excluded from auto-registration**: Pure cosmetic notes and personal preference observations that carry no actionable defect signal.
- **`[가설]` tag required for unverified fixes in `## 권장 조치` (v1.1.81)**: When the proposed fix written into `{권장 사항}` has not been verified by execution/testing, the sentence must be prefixed with a `[가설]` tag and state what would confirm it. Tagging only the root-cause diagnosis while leaving the proposed fix asserted as settled fact carries the risk that applying that fix as-is fails into a later session ([[r020]] Diagnostic Hypothesis Verification, Origin: #1725).

## Key Details

- **Scope**: harness
- **User-invocable**: no
- **Effort**: medium

## Registration Boundary

제목·본문 파일 작성과 제출을 [[agents/mgr-gitnerd|mgr-gitnerd]] 한 위임으로 묶으십시오. Write로 완성 제목과 본문을 위임 고유의 git-ignored 파일에 쓰고 외부 문구를 셸 소스로 입력하지 마십시오. 세 생성 예시는 각각 같은 자급 가능한 preflight를 사용합니다. 제목 raw bytes에서 NUL·CR·내부/추가 LF·빈 값·space/tab-only를 거부하고 마지막 LF 0개/1개와 의미 있는 공백을 유지하십시오. 본문 regular file 읽기·NUL 부재를 확인한 뒤 quoted title argv/body-file로 제출하십시오. Write-produced UTF-8 텍스트의 구조 검사이며 범용 UTF-8 검증은 아닙니다.

위임에 auto-dev Standard delegation-prompt block을 포함하십시오. 기존 urgency·dedup·source-risk gate, 즉시 code-changing A–C 확인, genuine defect no-ask 등록 및 최대 한 건의 통합 잔여 이슈 규율을 유지하십시오. 기존 경로는 tracked 여부를 확인하고 신규 생성 대상은 해당 carve-out을 유지하십시오. 도구·읽기·금지 구조 오류는 중단하고 자기 문안 파일만 정리하십시오. [source How to auto-register 및 세 예시](../../.claude/skills/post-release-followup/SKILL.md)와 [[r010]]을 참고하십시오.

## Relationships

- **Used by agents**: orchestrator
- **Related skills**: [[release-plan]], [[deep-verify]], [[skills/professor-triage|professor-triage]], [[omcustom-release-notes]]
- **See also**: [[R020]], [[R016]]

## Artifact Output

Results written to `.claude/outputs/sessions/{date}/`. Auto-registered GitHub issues are created via `gh issue create` during the skill run; no separate user prompt precedes issue creation for defect/gap items.

## Sources

- `.claude/skills/post-release-followup/SKILL.md` — skill definition; auto-register behavior added #1238
- Content-drift resync 2026-09-03 (v1.1.60, #1652 #3-2): added the anchor-based code-location convention for auto-registered issue bodies — cite function names/unique strings instead of line numbers, since line numbers went stale by the next release commit and cost two implementation agents a re-search.
- Content-drift resync 2026-09-24 (v1.1.81, #1725): added the `[가설]` tag requirement for unverified proposed fixes in `## 권장 조치` — tagging only the root-cause diagnosis while leaving the proposed fix stated as settled fact was found to carry forward unverified-fix risk into a later session.

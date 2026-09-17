---
title: Homework
type: skill
updated: 2026-09-18
sources:
  - .claude/skills/homework/SKILL.md
related:
  - [[omcustom-feedback]]
  - [[R011]]
  - [[R016]]
  - [[R020]]
---

# Homework

On session cleanup ("세션 정리") or `/homework` invocation, analyze the current and linked previous sessions, extract mistakes (찐빠), and report them via `omcustom-feedback` with a confirmation gate.

## Overview

Dedicated entry point for [[R011]]'s "Session-End Retrospective Feedback (Model-Drafted)" pattern. Analyzes the current (and optionally previous) session transcripts to identify rule violations, scope-creep, hallucinations, premature hypotheses, and missed conventions. Categorizes findings by severity and drafts a structured feedback issue via [[omcustom-feedback]]'s Phase 4A preview + confirmation gate. The model can draft but cannot publish without explicit user approval.

Formalizes the retrospective workflow that produced issue #1266.

## Usage

```
/homework                          # Analyze current session, report findings
/homework --dry-run                # Analyze only, no omcustom-feedback invocation
/homework --days 3                 # Include linked sessions from last N days
/homework --severity high          # Filter to critical/high findings only
```

Activated by: "세션 정리" / "숙제" / "회고" / "homework" / "session cleanup" / "wrap up" / session-end signals ("끝", "종료", "마무리", "done", "end session").

Runs **before** `sys-memory-keeper`'s MEMORY.md update at session end (R011 order: homework → memory save).

## Key Details

- **Scope**: harness
- **User-invocable**: yes (`/homework`)
- **Version**: 0.1.0
- **Effort**: medium
- **Context fork**: no (single-agent orchestration, does not use `context: fork`)

## Workflow Phases

| Phase | Action |
|-------|--------|
| 1: Trigger Parsing | Parse `--dry-run`, `--days`, `--severity` arguments |
| 2: Session Gathering | Extract current session transcript; optionally scan linked sessions (`--days`) |
| 3: Mistake Analysis | Categorize findings: severity × category (rule violation, scope-creep, hallucination, premature hypothesis, missed convention, over-claim completion) |
| 4: Draft Feedback Issue | Assemble Korean-language issue using #1266 format |
| 5: Report via omcustom-feedback | Phase 4A preview gate — user confirms before any GitHub issue is created |
| 6: Output Summary | Report N findings, submission URL or dry-run status |

**R020 read-before-characterize applies to the analysis itself**: do not characterize mistakes before reading the transcript evidence.

**Phase 2a now leads with an advisor-reuse counting script (#1683 #2)**: when the transcript path is known, homework first runs `bash scripts/count-r007-r008.sh "$TRANSCRIPT" --json`, which drives `.claude/hooks/scripts/r007-r008-drift-advisor.sh` turn-by-turn so self-counted R007/R008 findings reproduce the hook's own verdict instead of a separately re-implemented regex. This follows [[R020]]'s "self-counting reproduces the advisor's judgment formula" principle — v1.1.64 saw self-counting fail three sessions in a row from ad-hoc method errors (record-boundary confusion, merge-key mismatch, nested double-counting) before this script was introduced. The prior sources (rule-violation-marker grep, JSONL transcript scan, model recall) are renumbered 2–4 and remain the fallback chain when the script is unavailable or fails — in which case the retrospective must explicitly note that advisor-reuse counting was not performed.

## Severity Scale

| Level | Criteria |
|-------|----------|
| Critical | Safety classifier trip, credential exposure, scope-creep into privileged domains, working-tree loss |
| High | Rule violation with downstream impact, hallucinated fact acted upon, premature hypothesis causing permanent change |
| Medium | Process gap, missed convention, advisory rule ignored |
| Low | Minor style drift, non-impactful oversight |

## Cross-Project Import Compatibility

When `homework` is imported into a project where `omcustom-feedback` has model invocation **disabled** (`disable-model-invocation`), Phase 5's automatic filing fails. Fall back to **manual submission**: present the drafted findings to the user and ask them to file or run `omcustom-feedback` manually.

| Condition | Behavior |
|-----------|----------|
| `omcustom-feedback` model-invocable (default in oh-my-customcode) | Auto-invoke files the retrospective normally |
| `omcustom-feedback` model invocation DISABLED in importing project | Fall back to manual: present draft, ask user to file |

Origin: #1336 — second-brain project had model invocation disabled; retrospective was filed manually. Ensures cross-project imports degrade gracefully rather than silently failing Phase 5.

## Relationships

- **Used by**: orchestrator (session-end retrospective)
- **Related skills**: [[omcustom-feedback]] (reporting channel, Phase 5 — requires model-invocable), instinct-extractor (multi-session pattern mining), sys-memory-keeper (runs after homework at session end)
- **Rules**: [[R011]] (dedicated entry point), [[R020]] (read-before-characterize), [[R016]] (continuous improvement loop), R010 (orchestrator coordination), R001 (no credential dumps)

## Sources

- `.claude/skills/homework/SKILL.md` — skill definition
- Content-drift resync 2026-09-18 (v1.1.67, #1683): Phase 2a gained the advisor-reuse counting script (`scripts/count-r007-r008.sh`) as its first source, renumbering prior sources 2–4, and Limitations gained a "Count fidelity" note that only the advisor-reuse script reproduces the hook verdict.

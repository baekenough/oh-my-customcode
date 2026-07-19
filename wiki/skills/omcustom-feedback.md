---
title: Omcustom Feedback
type: skill
updated: 2026-07-19
sources:
  - .claude/skills/omcustom-feedback/SKILL.md
related:
  - [[mgr-gitnerd]]
  - [[R016]]
  - [[R011]]
---

# Omcustom Feedback

Submit feedback about oh-my-customcode as a GitHub Issue directly from the CLI — invocable by both user and model, with an offline-safe local fallback.

## Overview

`/omcustom-feedback` collects feedback (bug, feature, improvement, question), auto-detects category from inline content or asks interactively via `AskUserQuestion`, and files a GitHub Issue directly to `baekenough/oh-my-customcode` by running `gh issue create` (Bash, `--body-file` for safe markdown) — the skill executes this itself; it does **not** delegate through [[mgr-gitnerd]]. `--anonymous` submissions prefix `[Anonymous Feedback]` on the title, add an `anonymous` label, omit the project name, and make environment info opt-in. Supports the [[R016]] continuous improvement workflow, since feedback issues are the trigger for rule/skill updates.

As of #1226/#1227 (v0.152.0), `disable-model-invocation: true` was removed — the skill is invocable by both user and model. The primary model use case is [[R011]]'s session-end retrospective feedback drafting: the model analyzes session friction/learnings and drafts an issue proposal. The Phase 4A "Preview + confirmation" gate remains the abuse-mitigation safety boundary — the model can draft but never auto-creates a public issue without explicit user confirmation.

As of #1469 (v1.1.10), the documented invocation examples were corrected from a stale `/omcustom:feedback` namespace form to the actual `/omcustom-feedback` command (a skill-name-vs-documented-command mismatch affecting 5 skills).

## Workflow (4 phases)

| Phase | Action |
|-------|--------|
| 1. Input Parsing | Strip `--anonymous`, auto-detect category from content or ask interactively |
| 2. Route Decision | Check `gh` CLI availability + auth → Route A (create issue) vs Fallback |
| 3. Environment Collection | omcustom version, Claude Code version, OS, project name (opt-in when anonymous) |
| 4A. GitHub Issue Creation | Preview + confirm → `gh issue create --body-file` |
| 4D. Local Fallback | Save JSON to `~/.omcustom/feedback/{timestamp}.json` when `gh` unavailable/unauthenticated |

## Key Details

- **Scope**: harness
- **User-invocable**: yes (`/omcustom-feedback`)
- **Model-invocable**: yes (via Skill tool — since #1226/#1227)
- **Category → label**: bug→bug, feature/improvement→enhancement, question→question
- **Safety boundary**: Phase 4A Preview + confirmation gate (model cannot publish without user approval)
- **Fallback**: local JSON save when `gh` is unavailable or unauthenticated — feedback is never silently lost offline
- **Target repo**: hardcoded to `baekenough/oh-my-customcode`
- **Effort**: not specified

## Relationships

- **Invoked by**: user (slash command) and orchestrator (model, via Skill tool for [[R011]] session-end retrospectives)
- **Related rules**: [[R016]] (continuous improvement — feedback is the trigger mechanism), [[R011]] (session-end retrospective drafting)
- **See also**: [[mgr-gitnerd]] (project's canonical git/GitHub delegation agent — this skill deliberately bypasses it and runs `gh issue create` directly)

## Sources

- [`.claude/skills/omcustom-feedback/SKILL.md`](../../.claude/skills/omcustom-feedback/SKILL.md) — skill definition

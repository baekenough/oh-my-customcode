---
title: Hada Scout
type: skill
updated: 2026-11-23
sources:
  - .claude/skills/hada-scout/SKILL.md
related:
  - [[scout]]
  - [[R009]]
  - [[R010]]
  - [[R015]]
---

# Hada Scout

In-session pipeline that monitors the hada.io feedburner RSS feed, pre-scores article titles with a single haiku batch call, and dispatches full `/scout` analysis only for high-scoring candidates.

## Overview

hada-scout replaces the v1.0 keyword-regex filter with context-aware LLM pre-scoring. The source SKILL.md states that scoring all feed titles in one haiku call lowers the false-positive rate from about 30-40% to about 5-10%. It is user-invoked inside a session, so no external scheduler is involved. Tracked in GitHub Issue #841.

## Key Details

- **Scope**: core
- **Version**: 2.0.0
- **User-invocable**: yes (`/hada-scout`)
- **Arguments**: `[--limit N] [--threshold N]`

## Pipeline: 3 Phases

1. **Fetch and parse** - WebFetch the feed (`https://feeds.feedburner.com/geeknews-feed`), parse title, URL and date, default to the latest 50 items (`--limit` or `HADA_SCOUT_LIMIT`).
2. **Pre-scout (haiku batch)** - one haiku agent receives all titles, judges each against the project's domains (agent orchestration, harness/eval, Claude Code and MCP, workflow automation), and returns a 0-100 score with a one-line reason. Items scoring 60 or more pass (`--threshold` or `HADA_SCOUT_THRESHOLD`).
3. **Scout dispatch** - deduplicate against existing `hada-scout` issues, then run `/scout` on each passing item (max 5 per run, `MAX_SCOUT_PER_RUN`), up to 4 in parallel ([[R009]]). Scores and reasons are shown before dispatch ([[R015]]).

## Label Scheme

| Label | Purpose |
|-------|---------|
| `hada-scout` | Source identification for all created issues |
| `scout:internalize` | Verdict: adopt into project |
| `scout:integrate` | Verdict: use as external dependency |
| `scout:skip` | Verdict: not relevant |

## Cost Controls

Pre-scout costs about USD 0.01-0.05 per run (50 items, haiku). Each full `/scout` costs about USD 0.5-1.5 (sonnet), capped at 5 per run, for a stated maximum of about USD 8 per invocation. The orchestrator manages phases and delegates analysis to haiku/sonnet agents ([[R010]]).

## History

The v1.0 design ran as an external K8s CronJob with a keyword-regex layer. That deployment under `infra/hada-scout/` was removed in v2.0.27 (#1982); the skill is now invoked only by the user.

## Sources

- `.claude/skills/hada-scout/SKILL.md` - skill definition
- Related: [[scout]] performs the per-article analysis in phase 3.

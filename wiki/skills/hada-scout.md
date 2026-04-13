---
title: Hada Scout
type: skill
updated: 2026-04-13
sources:
  - .claude/skills/hada-scout/SKILL.md
related:
  - [[scout]]
  - [[geeknews-scout]]
  - [[infra-docker-expert]]
  - [[R009]]
  - [[R010]]
---

# Hada Scout

Automated pipeline that monitors hada.io (via feedburner RSS) for AI agent, harness, benchmark, and eval-related articles, then runs `/scout` analysis on each match.

## Overview

hada-scout complements [[geeknews-scout]] with harness/eval-focused coverage from hada.io. While geeknews-scout casts a broad net over AI agent news, hada-scout narrows to benchmark and evaluation framework content — the domain most relevant to oh-my-customcode's harness and agent-eval subsystems. Tracked in GitHub Issue #841.

## Key Details

- **Scope**: package
- **Version**: 1.0.0
- **User-invocable**: no
- **Infrastructure**: `infra/hada-scout/`

## Architecture: 2-Layer Hybrid

### Layer 1 — check-feed.sh (feed → issues)

Fetches hada.io feedburner RSS, filters entries by keyword regex, deduplicates against existing `hada-scout` issues, and creates a GitHub issue per match with labels `hada-scout` + `pending-scout`.

### Layer 2 — scout-runner.sh (issues → /scout)

Finds open issues with `pending-scout` label, extracts source URL from issue body, runs `claude -p "/scout {url}"` (max 5 per run), parses verdict, applies verdict label, and removes `pending-scout`.

## Keyword Strategy

hada-scout uses harness/benchmark/eval focused keywords, distinct from geeknews-scout's broader AI agent coverage:

```
harness|benchmark|eval|evaluation framework|agent framework|코드 리뷰 자동화|하네스|벤치마크|평가
```

geeknews-scout handles: `Claude|Anthropic|MCP|AI agent|에이전트|agentic|multi-agent|...`

## Label Scheme

| Label | Purpose |
|-------|---------|
| `hada-scout` | Source identification — all hada-scout created issues |
| `pending-scout` | Awaiting /scout analysis (Layer 1 sets, Layer 2 clears) |
| `scout:internalize` | /scout verdict: adopt into project |
| `scout:integrate` | /scout verdict: use as external dependency |
| `scout:skip` | /scout verdict: not relevant |

## Cost Controls

Layer 2 runs at most **5 /scout executions per cron invocation**. Each /scout call costs ~$0.5–1.5 (sonnet). Remaining `pending-scout` issues are processed in the next scheduled run.

## Deployment

Same K8s CronJob structure as `infra/geeknews-scout/`, hosted on the `ubuntu-ext` cluster. Infrastructure files in `infra/hada-scout/`: `check-feed.sh`, `scout-runner.sh`, `Dockerfile`, `cronjob.template.yaml`, `deploy.sh`, `.env.example`.

## Sources

- `.claude/skills/hada-scout/SKILL.md` — skill definition
- `infra/hada-scout/` — K8s deployment manifests

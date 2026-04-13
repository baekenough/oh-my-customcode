---
name: hada-scout
description: hada.io RSS feed monitoring for AI agent/harness articles with automated /scout analysis
scope: package
version: 1.0.0
user-invocable: false
---

# hada-scout

Automated pipeline that monitors hada.io (via feedburner RSS) for AI agent, harness, benchmark, and eval-related articles, then runs `/scout` analysis on each match.

## Purpose

Complement geeknews-scout with harness/eval-focused coverage from hada.io. While geeknews-scout casts a broad net over AI agent news, hada-scout narrows to benchmark/evaluation framework content — the domain most relevant to oh-my-customcode's harness and agent-eval subsystems.

## Architecture: 2-Layer Hybrid

### Layer 1 — check-feed.sh (feed → issues)

1. Fetch hada.io feedburner RSS
2. Filter entries by keyword regex (case-insensitive)
3. Dedup against existing `hada-scout` issues
4. Create GitHub issue per match with labels `hada-scout` + `pending-scout`

### Layer 2 — scout-runner.sh (issues → /scout)

1. Find open issues with `pending-scout` label
2. Extract source URL from issue body
3. Run `claude -p "/scout {url}"` (max 5 executions per run)
4. Parse verdict from /scout output
5. Apply verdict label, remove `pending-scout`

## Keyword Strategy

hada-scout uses harness/benchmark/eval focused keywords, distinct from geeknews-scout's broader AI agent coverage:

```
harness|benchmark|eval|evaluation framework|agent framework|코드 리뷰 자동화|하네스|벤치마크|평가
```

Geeknews-scout handles: `Claude|Anthropic|MCP|AI agent|에이전트|agentic|multi-agent|...`

## Label Scheme

| Label | Purpose |
|-------|---------|
| `hada-scout` | Source identification — all hada-scout created issues |
| `pending-scout` | Awaiting /scout analysis (set by Layer 1, cleared by Layer 2) |
| `scout:internalize` | /scout verdict: adopt into project |
| `scout:integrate` | /scout verdict: use as external dependency |
| `scout:skip` | /scout verdict: not relevant |

## Cost Controls

- Layer 2 runs at most **5 /scout executions per cron invocation**
- Each /scout call costs ~$0.5–1.5 (sonnet)
- Remaining `pending-scout` issues are processed in the next scheduled run

## Deployment

- Pattern: same K8s CronJob structure as `infra/geeknews-scout/`
- Host: `ubuntu-ext` cluster
- Infrastructure files: `infra/hada-scout/`
  - `check-feed.sh` — Layer 1 feed poller
  - `scout-runner.sh` — Layer 2 /scout executor
  - `Dockerfile`
  - `cronjob.template.yaml`
  - `deploy.sh`
  - `.env.example`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GH_TOKEN` | (required) | GitHub PAT for issue creation |
| `REPO` | `baekenough/oh-my-customcode` | Target repo |
| `FEED_URL` | `http://feeds.feedburner.com/geeknews-feed` | hada.io RSS feed |
| `KEYWORDS` | (see above) | Pipe-separated keyword regex |
| `MAX_SCOUT_PER_RUN` | `5` | Max /scout executions per Layer 2 run |

## Integration

| Rule | How |
|------|-----|
| R009 | Layer 1 and Layer 2 run as independent CronJobs |
| R010 | Skill defines the architecture; implementation delegated to infra-docker-expert for K8s manifests |
| scout skill | Layer 2 invokes `/scout` via `claude -p` subprocess |

## Tracking Issue

GitHub Issue #841

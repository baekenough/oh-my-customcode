# hada-scout

Kubernetes CronJob pair that monitors [GeekNews (news.hada.io)](https://news.hada.io) for articles about AI agent harnesses, benchmarks, and evaluation frameworks, then runs automated `/scout` analysis on matches.

**Layer 1** (`check-feed.sh`) runs daily at **09:00 UTC** — fetches the RSS feed, filters by harness/eval keywords, creates GitHub issues with `pending-scout` label.
**Layer 2** (`scout-runner.sh`) runs daily at **10:00 UTC** — picks up `pending-scout` issues and runs `/scout` analysis via Claude CLI, then updates each issue with a verdict label.

## Quick Start

```bash
cp .env.example .env
# Edit .env with your settings
./deploy.sh deploy
./deploy.sh test feed    # Test Layer 1 only
./deploy.sh test scout   # Test Layer 2 only
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `K3S_SERVER` | Yes | — | SSH target for k3s server |
| `GH_TOKEN` | Yes | — | GitHub PAT (repo + issues:write) |
| `TARGET_REPO` | Yes | — | Repo for issue creation |
| `K8S_NAMESPACE` | No | `omcustom` | Kubernetes namespace |
| `IMAGE_NAME` | No | `hada-scout` | Docker image name |
| `IMAGE_TAG` | No | `latest` | Docker image tag |
| `KEYWORDS` | No | `harness\|benchmark\|eval\|evaluation framework\|agent framework\|...` | Pipe-separated keyword regex (harness/eval focused) |
| `FEED_URL` | No | feedburner URL | hada.io RSS feed |
| `MAX_SCOUT_ENTRIES` | No | `5` | Max issues created per Layer 1 run (cost control) |
| `CRON_SCHEDULE_FEED` | No | `0 9 * * *` | Layer 1 schedule (UTC) |
| `CRON_SCHEDULE_SCOUT` | No | `0 10 * * *` | Layer 2 schedule (UTC) |
| `MAX_SCOUT_PER_RUN` | No | `5` | Max `/scout` executions per Layer 2 run |
| `CLAUDE_PROJECT_DIR` | No | `/workspace/oh-my-customcode` | Working directory for claude CLI on host |

## Commands

```bash
./deploy.sh deploy          # Build + deploy both CronJobs
./deploy.sh build           # Build image only
./deploy.sh test feed       # One-off test of Layer 1 (check-feed.sh)
./deploy.sh test scout      # One-off test of Layer 2 (scout-runner.sh)
./deploy.sh status          # Check CronJob and recent job status
./deploy.sh teardown        # Remove CronJobs (namespace and secret left intact)
```

## Architecture

```
Layer 1 — Daily 09:00 UTC
  [CronJob: hada-scout-feed]
    → fetch hada.io RSS feed
    → filter by harness/benchmark/eval keywords
    → deduplicate against existing issues
    → create GitHub issue (labels: automated, hada-scout, pending-scout)

Layer 2 — Daily 10:00 UTC
  [CronJob: hada-scout-runner]
    → fetch open issues with pending-scout label
    → for each: extract Source URL → run `claude -p "/scout <url>"`
    → extract verdict (internalize / integrate / skip)
    → remove pending-scout label, add scout:<verdict> label
    → post analysis comment to issue
```

## Label Scheme

| Label | Purpose | Color |
|---|---|---|
| `hada-scout` | Source identification | `#5319e7` |
| `pending-scout` | Awaiting `/scout` analysis | `#FBCA04` |
| `scout:internalize` | Verdict: pull into project | `#0E8A16` |
| `scout:integrate` | Verdict: keep as external dependency | `#1D76DB` |
| `scout:skip` | Verdict: not relevant | `#D4C5F9` |

Labels are auto-created by `check-feed.sh` and `scout-runner.sh` on first run.

## Files

| File | Purpose |
|---|---|
| `check-feed.sh` | Layer 1: RSS feed fetcher, keyword filter, issue creator |
| `scout-runner.sh` | Layer 2: pending-scout issue processor, `/scout` runner |
| `Dockerfile` | Alpine + gawk + gh CLI image (< 50MB target) |
| `cronjob.template.yaml` | Dual CronJob template (envsubst) |
| `deploy.sh` | Build, deploy, test, status, teardown automation |
| `.env.example` | Configuration template |

## Background (formerly geeknews-scout)

hada-scout's predecessor was `geeknews-scout`, which has since been removed. hada-scout
keeps a **harness/eval-focused keyword scope** (harness, benchmark, eval framework, etc.),
in contrast to the broad AI-agent keyword scope (Claude, MCP, agent, etc.) of the removed
predecessor. hada-scout also runs two CronJobs — issue creation plus automated `/scout`
analysis — and applies verdict labels (`scout:internalize`, `scout:integrate`, `scout:skip`),
which the predecessor did not.

It uses the hada.io feedburner RSS URL and the `omcustom` namespace.

## Prerequisites

- SSH access to the k3s server
- `docker` on the remote server
- `envsubst` locally (part of `gettext`)
- GitHub PAT with `repo` + `issues:write` scopes
- Shared `github-token` secret in the `omcustom` namespace
- `claude` CLI installed on the host at `CLAUDE_PROJECT_DIR` (Layer 2 only)

## Issue Format

Each issue created by Layer 1 (`check-feed.sh`) looks like:

```
Title: [hada-scout] <article title>

Body:
  # hada-scout: <article title>

  **Source:** <article URL>
  **Published:** <date>
  **Found by:** hada-scout CronJob
  **Status:** Pending /scout analysis

  ## Matched Keywords
  - harness
  - benchmark

  ## Action Items
  - [ ] /scout analysis (automated via scout-runner.sh)
  - [ ] Review /scout verdict
  - [ ] If relevant: create implementation issue or integrate learnings
  - [ ] If not relevant: close with comment

Labels: automated, hada-scout, pending-scout
```

After Layer 2 runs, the issue gains a `/scout` verdict comment and the `pending-scout` label is replaced with `scout:internalize`, `scout:integrate`, or `scout:skip`.

## Cost Estimates

- Layer 1 (`check-feed.sh`): ~$0/day — shell only, no model calls
- Layer 2 (`scout-runner.sh`): ~$1/run per `/scout` call × up to 5 = ~$5/day max
- Monthly (Layer 2): ~$150 at full capacity

# geeknews-scout

Kubernetes CronJob that monitors [GeekNews (news.hada.io)](https://news.hada.io) for articles relevant to oh-my-customcode and creates GitHub issues for keyword matches.

Runs every **6 hours**. Filters articles by configurable keywords, deduplicates against existing issues, and creates new ones for matches.

## Quick Start

```bash
cp .env.example .env
# Edit .env with your settings
./deploy.sh deploy
./deploy.sh test
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `K3S_SERVER` | Yes | — | SSH target for k3s server |
| `GH_TOKEN` | Yes | — | GitHub PAT (repo + issues:write) |
| `TARGET_REPO` | Yes | — | Repo for issue creation |
| `K8S_NAMESPACE` | No | `omcustom` | Kubernetes namespace |
| `IMAGE_NAME` | No | `geeknews-scout` | Docker image name |
| `IMAGE_TAG` | No | `latest` | Docker image tag |
| `KEYWORDS` | No | (see .env.example) | Pipe-separated keyword regex |
| `FEED_URL` | No | feedburner URL | GeekNews RSS feed |
| `CRON_SCHEDULE` | No | `0 */6 * * *` | Check interval (UTC) |

## Commands

```bash
./deploy.sh deploy    # Build + deploy
./deploy.sh build     # Build image only
./deploy.sh test      # One-off test run
./deploy.sh status    # Check status
./deploy.sh teardown  # Remove
```

## Files

| File | Purpose |
|---|---|
| `check-feed.sh` | Feed fetcher and keyword matcher |
| `Dockerfile` | Alpine + gawk + gh CLI image |
| `cronjob.template.yaml` | CronJob template (envsubst) |
| `deploy.sh` | Deployment automation |
| `.env.example` | Configuration template |

## Prerequisites

- SSH access to the k3s server
- `docker` on the remote server
- `envsubst` locally (part of `gettext`)
- GitHub PAT with `repo` + `issues:write` scopes
- Shared `github-token` secret in the `omcustom` namespace

## Issue Format

Each created issue looks like:

```
Title: [GeekNews] <article title>

Body:
  Source: <article URL>
  Published: <date>
  Found by: geeknews-scout CronJob

  ## Matched Keywords
  - Claude
  - MCP

  ## Action Items
  - [ ] Review article for applicability to oh-my-customcode
  - [ ] If relevant: create implementation issue or integrate learnings
  - [ ] If not relevant: close with comment

Labels: automated, geeknews-scout
```

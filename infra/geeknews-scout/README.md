# geeknews-scout

> **⚠️ DEPRECATED (v0.177.0, #1323)** — daily-scout(`.github/workflows/daily-scout.yml`, GitHub Actions + LLM pre-score, multi-source)로 기능 대체됨. 이 컴포넌트(k8s CronJob, keyword-regex, hada.io 단일)는 k8s에 배포된 적 없음(pending-deploy). **삭제는 daily-scout cron 첫 non-dry 실행 안정화 증명 후로 보류.** 삭제 전 README/ARCHITECTURE/deploy 스크립트의 참조 확인 필수 (R020 directory-context). 관련: #1289(eraser.yaml deprecation 선례).

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

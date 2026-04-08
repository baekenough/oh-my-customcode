# cc-release-collector

Kubernetes CronJob that watches for new Claude Code releases and creates GitHub issues.

## Quick Start

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your settings (server, token, repo)

# 2. Deploy
./deploy.sh deploy

# 3. Test
./deploy.sh test

# 4. Check status
./deploy.sh status
```

## Configuration

All settings are in `.env` (copied from `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `K3S_SERVER` | Yes | — | SSH target for k3s server |
| `GH_TOKEN` | Yes | — | GitHub PAT (repo + issues:write) |
| `TARGET_REPO` | Yes | — | Repo for issue creation |
| `K8S_NAMESPACE` | No | `omcustom` | Kubernetes namespace |
| `IMAGE_NAME` | No | `cc-release-collector` | Docker image name |
| `IMAGE_TAG` | No | `latest` | Docker image tag |
| `MIN_VERSION` | No | `2.1.86` | Min CC version to track |
| `CRON_SCHEDULE` | No | `0 9 * * *` | Cron schedule (UTC) |
| `SOURCE_REPO` | No | `anthropics/claude-code` | Source repo to watch |

## Commands

```bash
./deploy.sh deploy    # Build + deploy everything
./deploy.sh build     # Build and import image only
./deploy.sh test      # Run a one-off test job
./deploy.sh status    # Show CronJob and job status
./deploy.sh teardown  # Remove CronJob and secret
```

## Files

| File | Purpose |
|---|---|
| `check-releases.sh` | Release checker script |
| `Dockerfile` | Alpine + gh CLI image |
| `cronjob.template.yaml` | CronJob template (envsubst) |
| `deploy.sh` | Deployment automation |
| `.env.example` | Configuration template |

## Prerequisites

- SSH access to the k3s server
- `docker` on the remote server
- `envsubst` locally (part of `gettext`)
- GitHub PAT with `repo` + `issues:write` scopes

## Issue Format

Each created issue looks like:

```
Title: Claude Code vX.Y.Z

Body:
  Release: vX.Y.Z
  Published: <date>
  Link: <GitHub release URL>

  ## Release Summary
  <truncated release notes — max 2000 chars>

  ## Action Items
  - [ ] Review release notes for impact on oh-my-customcode
  - [ ] Update agent definitions if new Claude Code features affect agents
  - [ ] Test compatibility with current oh-my-customcode version
  - [ ] Update CLAUDE.md if new capabilities are relevant

Labels: automated, claude-code-release
```

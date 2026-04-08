# cc-release-collector

Kubernetes CronJob that watches for new Claude Code releases and creates GitHub issues in `baekenough/oh-my-customcode`.

Runs daily at **09:00 UTC (18:00 KST)**. Creates one issue per new release >= `MIN_VERSION`, idempotent on repeated runs.

## Files

| File | Purpose |
|---|---|
| `check-releases.sh` | Main script — fetch releases, diff against existing issues, create new ones |
| `Dockerfile` | Alpine-based image with `gh`, `jq`, `bash`, `curl` |
| `cronjob.yaml` | k8s CronJob manifest (namespace: `omcustom`) |
| `secret.yaml` | Secret template — **edit before applying, do not commit with real token** |

## Deployment

### 1. Build and import image

```bash
# Build locally
docker build -t cc-release-collector:latest .

# Export and import into k3s containerd runtime
docker save cc-release-collector:latest -o cc-release-collector.tar
sudo k3s ctr images import cc-release-collector.tar

# Verify import
sudo k3s ctr images ls | grep cc-release-collector
```

### 2. Create namespace

```bash
kubectl create namespace omcustom --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Create GitHub token secret

**Option A — Edit secret.yaml (replace token, then delete the file after applying):**
```bash
# Edit secret.yaml, replace REPLACE_WITH_GITHUB_TOKEN
kubectl apply -f secret.yaml -n omcustom
```

**Option B — Imperative creation (recommended, token never touches disk):**
```bash
kubectl create secret generic github-token \
  --from-literal=token=YOUR_TOKEN_HERE \
  --namespace omcustom
```

### 4. Deploy CronJob

```bash
kubectl apply -f cronjob.yaml
```

### 5. Verify

```bash
kubectl get cronjob -n omcustom
```

## Manual Test Run

```bash
# Trigger a one-off job from the CronJob spec
kubectl create job --from=cronjob/cc-release-collector test-run -n omcustom

# Stream logs
kubectl logs -n omcustom job/test-run -f

# Delete test job when done
kubectl delete job test-run -n omcustom
```

## Configuration

Override defaults via environment variables in `cronjob.yaml`:

| Variable | Default | Description |
|---|---|---|
| `GH_TOKEN` | _(from secret)_ | GitHub PAT — requires `repo` + `issues:write` scopes |
| `REPO` | `baekenough/oh-my-customcode` | Target repo for issue creation |
| `MIN_VERSION` | `2.1.86` | Minimum Claude Code version to track (inclusive) |

## Troubleshooting

```bash
# Check CronJob status and last schedule
kubectl describe cronjob cc-release-collector -n omcustom

# List all jobs (success + failed history)
kubectl get jobs -n omcustom

# View logs for most recent job
kubectl logs -n omcustom \
  $(kubectl get pods -n omcustom -l app=cc-release-collector \
    --sort-by=.metadata.creationTimestamp -o name | tail -1)

# Check secret exists
kubectl get secret github-token -n omcustom
```

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

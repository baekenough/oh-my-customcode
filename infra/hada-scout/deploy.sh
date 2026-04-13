#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "Error: .env file not found. Copy .env.example to .env and configure."
    exit 1
fi
source "$SCRIPT_DIR/.env"

# Validate required vars
for var in K3S_SERVER GH_TOKEN TARGET_REPO; do
    if [ -z "${!var:-}" ]; then
        echo "Error: $var is not set in .env"
        exit 1
    fi
done

# Defaults
K8S_NAMESPACE="${K8S_NAMESPACE:-omcustom}"
IMAGE_NAME="${IMAGE_NAME:-hada-scout}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FEED_URL="${FEED_URL:-http://feeds.feedburner.com/geeknews-feed}"
KEYWORDS="${KEYWORDS:-harness|benchmark|eval|evaluation framework|agent framework|코드 리뷰 자동화|하네스|벤치마크|평가}"
MAX_SCOUT_ENTRIES="${MAX_SCOUT_ENTRIES:-5}"
CRON_SCHEDULE_FEED="${CRON_SCHEDULE_FEED:-0 9 * * *}"
CRON_SCHEDULE_SCOUT="${CRON_SCHEDULE_SCOUT:-0 10 * * *}"
MAX_SCOUT_PER_RUN="${MAX_SCOUT_PER_RUN:-5}"
CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/workspace/oh-my-customcode}"

IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"

cmd_build() {
    echo "[build] Building ${IMAGE_FULL}..."
    echo "[build] Copying files to ${K3S_SERVER}..."
    ssh "$K3S_SERVER" "mkdir -p ~/hada-scout"
    scp "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/check-feed.sh" "$SCRIPT_DIR/scout-runner.sh" "${K3S_SERVER}:~/hada-scout/"
    echo "[build] Building on remote server..."
    ssh "$K3S_SERVER" "cd ~/hada-scout && docker build -t '${IMAGE_FULL}' ."
    echo "[build] Importing to k3s..."
    ssh "$K3S_SERVER" "docker save '${IMAGE_FULL}' | sudo k3s ctr images import -"
    echo "[build] Done."
}

cmd_deploy() {
    cmd_build

    echo "[deploy] Creating namespace ${K8S_NAMESPACE}..."
    ssh "$K3S_SERVER" "sudo kubectl create namespace '${K8S_NAMESPACE}' --dry-run=client -o yaml | sudo kubectl apply -f -"

    echo "[deploy] Creating secret..."
    printf '%s' "${GH_TOKEN}" | ssh "$K3S_SERVER" "sudo kubectl create secret generic github-token \
        --from-file=token=/dev/stdin \
        --namespace '${K8S_NAMESPACE}' \
        --dry-run=client -o yaml | sudo kubectl apply -f -"

    echo "[deploy] Generating and applying CronJob manifests..."
    export K8S_NAMESPACE IMAGE_FULL TARGET_REPO FEED_URL KEYWORDS MAX_SCOUT_ENTRIES \
           CRON_SCHEDULE_FEED CRON_SCHEDULE_SCOUT MAX_SCOUT_PER_RUN CLAUDE_PROJECT_DIR
    tmpfile=$(mktemp)
    trap 'rm -f "$tmpfile"' EXIT
    envsubst < "$SCRIPT_DIR/cronjob.template.yaml" > "$tmpfile"
    scp "$tmpfile" "${K3S_SERVER}:~/hada-scout-cronjob.yaml"
    ssh "$K3S_SERVER" "sudo kubectl apply -f ~/hada-scout-cronjob.yaml"

    echo "[deploy] Done. Verify with: $0 status"
}

cmd_test() {
    local layer="${2:-feed}"
    case "$layer" in
        feed)
            local cronjob="hada-scout-feed"
            ;;
        scout)
            local cronjob="hada-scout-runner"
            ;;
        *)
            echo "Usage: $0 test [feed|scout]"
            exit 1
            ;;
    esac

    local job_name="test-${layer}-$(date +%s)"
    echo "[test] Creating test job ${job_name} from ${cronjob}..."
    ssh "$K3S_SERVER" "sudo kubectl create job --from=cronjob/${cronjob} '${job_name}' -n '${K8S_NAMESPACE}' 2>/dev/null || true"
    echo "[test] Waiting for completion (timeout 120s)..."
    ssh "$K3S_SERVER" "sudo kubectl wait --for=condition=complete 'job/${job_name}' -n '${K8S_NAMESPACE}' --timeout=120s"
    echo "[test] Logs:"
    ssh "$K3S_SERVER" "sudo kubectl logs -n '${K8S_NAMESPACE}' 'job/${job_name}'"
    ssh "$K3S_SERVER" "sudo kubectl delete job '${job_name}' -n '${K8S_NAMESPACE}'"
    echo "[test] Done."
}

cmd_status() {
    echo "[status] CronJobs:"
    ssh "$K3S_SERVER" "sudo kubectl get cronjob -n '${K8S_NAMESPACE}' -l app=hada-scout"
    echo ""
    echo "[status] Recent jobs:"
    ssh "$K3S_SERVER" "sudo kubectl get jobs -n '${K8S_NAMESPACE}' -l app=hada-scout --sort-by=.metadata.creationTimestamp"
}

cmd_teardown() {
    echo "[teardown] Removing CronJobs..."
    ssh "$K3S_SERVER" "sudo kubectl delete cronjob hada-scout-feed hada-scout-runner -n '${K8S_NAMESPACE}' --ignore-not-found"
    echo "[teardown] Done. Namespace ${K8S_NAMESPACE} and github-token secret left intact."
}

# Main
case "${1:-deploy}" in
    deploy)   cmd_deploy ;;
    build)    cmd_build ;;
    test)     cmd_test "$@" ;;
    status)   cmd_status ;;
    teardown) cmd_teardown ;;
    *)        echo "Usage: $0 [deploy|build|test [feed|scout]|status|teardown]"; exit 1 ;;
esac

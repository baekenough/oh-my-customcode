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
IMAGE_NAME="${IMAGE_NAME:-cc-release-collector}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
MIN_VERSION="${MIN_VERSION:-2.1.86}"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 9 * * *}"
SOURCE_REPO="${SOURCE_REPO:-anthropics/claude-code}"

IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"

cmd_build() {
    echo "[build] Building ${IMAGE_FULL}..."
    # Try building on remote server (avoids ARM/x86 mismatch)
    echo "[build] Copying files to ${K3S_SERVER}..."
    ssh "$K3S_SERVER" "mkdir -p ~/cc-release-collector"
    scp "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/check-releases.sh" "${K3S_SERVER}:~/cc-release-collector/"
    echo "[build] Building on remote server..."
    ssh "$K3S_SERVER" "cd ~/cc-release-collector && docker build -t ${IMAGE_FULL} ."
    echo "[build] Importing to k3s..."
    ssh "$K3S_SERVER" "docker save ${IMAGE_FULL} | sudo k3s ctr images import -"
    echo "[build] Done."
}

cmd_deploy() {
    cmd_build

    echo "[deploy] Creating namespace ${K8S_NAMESPACE}..."
    ssh "$K3S_SERVER" "sudo kubectl create namespace ${K8S_NAMESPACE} --dry-run=client -o yaml | sudo kubectl apply -f -"

    echo "[deploy] Creating secret..."
    ssh "$K3S_SERVER" "sudo kubectl create secret generic github-token \
        --from-literal=token=${GH_TOKEN} \
        --namespace ${K8S_NAMESPACE} \
        --dry-run=client -o yaml | sudo kubectl apply -f -"

    echo "[deploy] Generating and applying CronJob manifest..."
    export K8S_NAMESPACE IMAGE_FULL TARGET_REPO MIN_VERSION CRON_SCHEDULE
    envsubst < "$SCRIPT_DIR/cronjob.template.yaml" > "/tmp/cc-release-collector-cronjob.yaml"
    scp "/tmp/cc-release-collector-cronjob.yaml" "${K3S_SERVER}:~/cronjob.yaml"
    ssh "$K3S_SERVER" "sudo kubectl apply -f ~/cronjob.yaml"
    rm -f "/tmp/cc-release-collector-cronjob.yaml"

    echo "[deploy] Done. Verify with: $0 status"
}

cmd_test() {
    echo "[test] Creating test job..."
    ssh "$K3S_SERVER" "sudo kubectl create job --from=cronjob/cc-release-collector test-run -n ${K8S_NAMESPACE} 2>/dev/null || true"
    echo "[test] Waiting for completion (timeout 120s)..."
    ssh "$K3S_SERVER" "sudo kubectl wait --for=condition=complete job/test-run -n ${K8S_NAMESPACE} --timeout=120s"
    echo "[test] Logs:"
    ssh "$K3S_SERVER" "sudo kubectl logs -n ${K8S_NAMESPACE} job/test-run"
    ssh "$K3S_SERVER" "sudo kubectl delete job test-run -n ${K8S_NAMESPACE}"
    echo "[test] Done."
}

cmd_status() {
    echo "[status] CronJob:"
    ssh "$K3S_SERVER" "sudo kubectl get cronjob -n ${K8S_NAMESPACE}"
    echo ""
    echo "[status] Recent jobs:"
    ssh "$K3S_SERVER" "sudo kubectl get jobs -n ${K8S_NAMESPACE} --sort-by=.metadata.creationTimestamp"
}

cmd_teardown() {
    echo "[teardown] Removing CronJob and secret..."
    ssh "$K3S_SERVER" "sudo kubectl delete cronjob cc-release-collector -n ${K8S_NAMESPACE} --ignore-not-found"
    ssh "$K3S_SERVER" "sudo kubectl delete secret github-token -n ${K8S_NAMESPACE} --ignore-not-found"
    echo "[teardown] Done. Namespace ${K8S_NAMESPACE} left intact."
}

# Main
case "${1:-deploy}" in
    deploy)   cmd_deploy ;;
    build)    cmd_build ;;
    test)     cmd_test ;;
    status)   cmd_status ;;
    teardown) cmd_teardown ;;
    *)        echo "Usage: $0 [deploy|build|test|status|teardown]"; exit 1 ;;
esac

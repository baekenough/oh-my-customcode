#!/usr/bin/env bash
# scripts/verify-version-sync.sh
# Verify version consistency across package.json and templates/manifest.json
# Used by release pipeline to prevent npm publish failures (issue #1154)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PACKAGE_JSON="${REPO_ROOT}/package.json"
MANIFEST_JSON="${REPO_ROOT}/templates/manifest.json"

if [ ! -f "${PACKAGE_JSON}" ]; then
  echo "::error::package.json not found at ${PACKAGE_JSON}"
  exit 1
fi

if [ ! -f "${MANIFEST_JSON}" ]; then
  echo "::error::templates/manifest.json not found at ${MANIFEST_JSON}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::warning::jq not installed — version sync verification skipped"
  echo "Install jq: apt-get install -y jq | brew install jq | https://stedolan.github.io/jq/download/"
  exit 0
fi

PKG_VERSION=$(jq -r '.version' "${PACKAGE_JSON}")
MANIFEST_VERSION=$(jq -r '.version' "${MANIFEST_JSON}")

if [ "${PKG_VERSION}" != "${MANIFEST_VERSION}" ]; then
  echo "::error::Version mismatch:"
  echo "  package.json:            ${PKG_VERSION}"
  echo "  templates/manifest.json: ${MANIFEST_VERSION}"
  echo ""
  echo "These must match for npm publish (#1154 prevention)."
  echo "Run version bump in both files atomically:"
  echo "  jq '.version = \"<NEW>\"' package.json > package.json.tmp && mv package.json.tmp package.json"
  echo "  jq '.version = \"<NEW>\"' templates/manifest.json > templates/manifest.json.tmp && mv templates/manifest.json.tmp templates/manifest.json"
  exit 1
fi

echo "[OK] Version sync verified: ${PKG_VERSION}"
exit 0

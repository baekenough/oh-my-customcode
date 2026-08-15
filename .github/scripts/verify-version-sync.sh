#!/usr/bin/env bash
# verify-version-sync.sh
# Verify version consistency across package.json and templates/manifest.json
# Used by release pipeline to prevent npm publish failures (issue #1154)
# Mirrored at scripts/verify-version-sync.sh and .github/scripts/verify-version-sync.sh
# — keep both copies byte-identical (#1476). REPO_ROOT is resolved via git so the
# script works unmodified regardless of which copy's directory depth invokes it.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

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
  echo "templates/manifest.json structure: {version, lastUpdated, omcustomMinClaudeCode, components[]} — preserve it."
  echo "Edit ONLY the .version field with jq; never overwrite the file with a path→hash map (#1423)."
  echo "Recover a corrupted manifest: git show HEAD:templates/manifest.json | jq '.version=\"<NEW>\"' > templates/manifest.json"
  echo "Run version bump in both files atomically:"
  echo "  jq '.version = \"<NEW>\"' package.json > package.json.tmp && mv package.json.tmp package.json"
  echo "  jq '.version = \"<NEW>\"' templates/manifest.json > templates/manifest.json.tmp && mv templates/manifest.json.tmp templates/manifest.json"
  exit 1
fi

# Lockfile 3-way check (#1593 제안3) — .omcustom.lock.json's generatorVersion/templateVersion are
# written by `bun run build` (scripts/sync-source-lockfile.ts → generateAndWriteLockfileForDir →
# loadVersions() in src/core/sync.ts), which reads generatorVersion from package.json and
# templateVersion from templates/manifest.json AT BUILD TIME. If the build runs before BOTH
# version files are bumped, the lockfile silently records a stale value — no warning, no error.
# Observed: v1.1.47 shipped generatorVersion=1.1.47 / templateVersion=1.1.46 (manifest bumped in a
# later commit than the build). This is a 2-way check above (package.json vs manifest.json only) —
# it structurally cannot catch lockfile drift, hence this separate 3-way assertion.
LOCKFILE="${REPO_ROOT}/.omcustom.lock.json"
if [ ! -f "${LOCKFILE}" ]; then
  echo "::warning::.omcustom.lock.json not found — lockfile version check skipped"
else
  LOCK_GEN=$(jq -r '.generatorVersion // empty' "${LOCKFILE}")
  LOCK_TPL=$(jq -r '.templateVersion // empty' "${LOCKFILE}")
  if [ -z "${LOCK_GEN}" ] || [ -z "${LOCK_TPL}" ]; then
    echo "::error::.omcustom.lock.json missing generatorVersion/templateVersion"
    exit 1
  fi
  if [ "${LOCK_GEN}" != "${PKG_VERSION}" ] || [ "${LOCK_TPL}" != "${PKG_VERSION}" ]; then
    echo "::error::Lockfile version mismatch (3-way): pkg=${PKG_VERSION} manifest=${MANIFEST_VERSION} lock.gen=${LOCK_GEN} lock.tpl=${LOCK_TPL}"
    echo "Cause: 'bun run build' ran before BOTH version bumps landed."
    echo "Fix: bump package.json AND templates/manifest.json first, then re-run 'bun run build' and stage the lockfile."
    exit 1
  fi
  echo "[OK] Lockfile version sync verified: generatorVersion=${LOCK_GEN} templateVersion=${LOCK_TPL}"
fi

echo "[OK] Version sync verified: ${PKG_VERSION}"
exit 0

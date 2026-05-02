#!/usr/bin/env bash
# verify-version-sync.sh — validates package.json version matches templates/manifest.json
# Mirrors the ci.yml version-sync job for use as a pre-publish gate in release.yml.
# Idempotent, read-only. Works on macOS and Linux.
set -euo pipefail

pkg_version=$(node -p "require('./package.json').version")
manifest_version=$(node -p "require('./templates/manifest.json').version")

echo "package.json version:          $pkg_version"
echo "templates/manifest.json version: $manifest_version"

if [ "$pkg_version" != "$manifest_version" ]; then
  echo ""
  echo "❌ Version mismatch: package.json=$pkg_version, templates/manifest.json=$manifest_version" >&2
  echo "Fix: update templates/manifest.json version to match package.json before tagging." >&2
  exit 1
fi

echo "✓ Version sync OK: $pkg_version"

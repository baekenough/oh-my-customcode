#!/bin/bash
# Verify R006 Context Fork Criteria count matches actual SKILL.md frontmatter
# Usage: bash .github/scripts/verify-fork-list.sh
# Exit 0: match. Exit 1: drift detected.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RULE_FILE="${ROOT}/.claude/rules/MUST-agent-design.md"

if [[ ! -f "${RULE_FILE}" ]]; then
    echo "error: ${RULE_FILE} not found"
    exit 1
fi

DOC_COUNT=$(grep -oE 'Current: [0-9]+/12' "${RULE_FILE}" | grep -oE '[0-9]+' | head -1)
ACTUAL_SKILLS=$(grep -l '^context: fork$' "${ROOT}/.claude/skills/"*/SKILL.md 2>/dev/null | xargs -I{} dirname {} | xargs -I{} basename {} | sort)
ACTUAL_COUNT=$(echo "${ACTUAL_SKILLS}" | grep -c . || true)

echo "R006 documented count: ${DOC_COUNT}"
echo "Actual fork skill count: ${ACTUAL_COUNT}"
echo ""
echo "Actual fork skills:"
echo "${ACTUAL_SKILLS}" | sed 's/^/  - /'

if [[ "${DOC_COUNT}" != "${ACTUAL_COUNT}" ]]; then
    echo ""
    echo "✗ DRIFT: R006 claims ${DOC_COUNT} fork skills, actual filesystem has ${ACTUAL_COUNT}"
    echo "  Fix: update Context Fork Criteria section in ${RULE_FILE}"
    exit 1
fi

echo ""
echo "✓ R006 fork count matches actual SKILL.md frontmatter (${ACTUAL_COUNT}/12)"

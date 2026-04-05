#!/bin/bash
# skill-extractor-analyzer.sh — Stop hook for skill candidate detection
# Advisory-only: exit 0 always. Emits stderr message if candidates found.

set -euo pipefail

OUTCOMES_FILE="/tmp/.claude-task-outcomes-${PPID}"
PROPOSALS_FILE="/tmp/.claude-skill-proposals-${PPID}"

# Early exit if no outcomes
if [ ! -f "$OUTCOMES_FILE" ] || [ ! -s "$OUTCOMES_FILE" ]; then
  exit 0
fi

# Count qualifying patterns (3+ successes with 80%+ rate)
# Group by agent_type+skill, count successes
CANDIDATES=0

if command -v jq &>/dev/null; then
  # Parse JSONL and group by agent_type+skill
  CANDIDATES=$(cat "$OUTCOMES_FILE" | \
    jq -s '
      group_by(.agent_type + "|" + (.skill // "none"))
      | map({
          key: .[0].agent_type + "|" + (.[0].skill // "none"),
          total: length,
          successes: [.[] | select(.outcome == "success")] | length
        })
      | map(select(.successes >= 3 and (.successes / .total) >= 0.8))
      | length
    ' 2>/dev/null || echo "0")
fi

if [ "$CANDIDATES" -gt 0 ] 2>/dev/null; then
  echo "[skill-extractor] ${CANDIDATES} skill candidate(s) detected from session outcomes" >&2
  echo "[skill-extractor] Run /skill-extractor to review and create" >&2

  # Save proposal count for Stop prompt hook to pick up
  echo "{\"candidates\": $CANDIDATES, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$PROPOSALS_FILE"
fi

exit 0

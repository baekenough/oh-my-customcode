#!/usr/bin/env bash
# scout-runner.sh — hada-scout Layer 2: process pending-scout issues
# Finds GitHub issues labeled `pending-scout`, runs /scout analysis via `claude -p`,
# and updates each issue with the verdict.
#
# Layer 1 (check-feed.sh) creates issues with `hada-scout` + `pending-scout` labels.
# Layer 2 (THIS script) processes those pending issues.
#
# Env vars:
#   GH_TOKEN               GitHub personal access token (required; gh CLI reads this automatically)
#   REPO                   Target repo (default: baekenough/oh-my-customcode)
#   CLAUDE_PROJECT_DIR     Working directory for claude CLI (default: /workspace/oh-my-customcode)
#   MAX_SCOUT_PER_RUN      Max issues to process per run (default: 5)
#   SCOUT_TIMEOUT          Timeout in seconds for each claude invocation (default: 120)
#   RETRY_COUNT            Max retries per issue on failure (default: 3)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO="${REPO:-baekenough/oh-my-customcode}"
CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/workspace/oh-my-customcode}"
MAX_SCOUT_PER_RUN="${MAX_SCOUT_PER_RUN:-5}"
SCOUT_TIMEOUT="${SCOUT_TIMEOUT:-120}"
RETRY_COUNT="${RETRY_COUNT:-3}"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
warn() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] WARN: $*" >&2; }
err()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

# ---------------------------------------------------------------------------
# Ensure required tools are available
# ---------------------------------------------------------------------------
check_deps() {
    local missing=0
    for cmd in gh jq timeout; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            err "Required command not found: $cmd"
            missing=1
        fi
    done

    if ! command -v claude >/dev/null 2>&1; then
        err "Claude CLI not found. Install from: https://docs.anthropic.com/en/docs/claude-code"
        err "scout-runner requires 'claude' to run /scout analysis."
        missing=1
    fi

    [ "$missing" -eq 0 ] || exit 1
}

# ---------------------------------------------------------------------------
# Ensure scout verdict labels exist in target repo
# ---------------------------------------------------------------------------
ensure_labels() {
    local labels=(
        "scout:internalize|0E8A16|Scout: should be internalized"
        "scout:integrate|1D76DB|Scout: keep as external"
        "scout:skip|D4C5F9|Scout: skip"
    )

    for entry in "${labels[@]}"; do
        IFS='|' read -r name color desc <<< "$entry"
        if ! gh label list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null \
                | grep -qxF "$name"; then
            log "Creating label: $name"
            gh label create "$name" \
                --repo "$REPO" \
                --color "$color" \
                --description "$desc" \
                --force \
                || warn "Could not create label '$name' — continuing"
        fi
    done
}

# ---------------------------------------------------------------------------
# Extract source URL from issue body
# Expects: **Source:** <url>
# ---------------------------------------------------------------------------
extract_source_url() {
    local body="$1"
    local url

    # Match **Source:** followed by a URL
    url=$(echo "$body" | grep -oP '\*\*Source:\*\*\s*\K(https?://[^\s]+)' 2>/dev/null || true)

    # Fallback: try without bold markers
    if [ -z "$url" ]; then
        url=$(echo "$body" | grep -oP 'Source:\s*\K(https?://[^\s]+)' 2>/dev/null || true)
    fi

    echo "$url"
}

# ---------------------------------------------------------------------------
# Run /scout via claude CLI and capture output
# $1 = url to scout
# Returns: claude JSON output on stdout, exit code on failure
# ---------------------------------------------------------------------------
run_scout() {
    local url="$1"
    local output

    output=$(timeout "${SCOUT_TIMEOUT}" claude -p \
        "In this project, /scout ${url}" \
        --cwd "${CLAUDE_PROJECT_DIR}" \
        --output-format json 2>/dev/null) || return $?

    echo "$output"
}

# ---------------------------------------------------------------------------
# Extract verdict from /scout output
# Looks for verdict patterns in the claude response
# Returns: internalize, integrate, or skip
# ---------------------------------------------------------------------------
extract_verdict() {
    local output="$1"

    # Try to extract from JSON result field first
    local result_text
    result_text=$(echo "$output" | jq -r '.result // .content // .message // empty' 2>/dev/null || echo "$output")

    # If result_text is empty, use raw output
    if [ -z "$result_text" ]; then
        result_text="$output"
    fi

    # Search for verdict patterns (case-insensitive)
    local verdict
    if echo "$result_text" | grep -qiE '(verdict|판정)[: \t]*internalize'; then
        verdict="internalize"
    elif echo "$result_text" | grep -qiE '(verdict|판정)[: \t]*integrate'; then
        verdict="integrate"
    elif echo "$result_text" | grep -qiE '(verdict|판정)[: \t]*skip'; then
        verdict="skip"
    elif echo "$result_text" | grep -qiE 'scout:internalize'; then
        verdict="internalize"
    elif echo "$result_text" | grep -qiE 'scout:integrate'; then
        verdict="integrate"
    elif echo "$result_text" | grep -qiE 'scout:skip'; then
        verdict="skip"
    else
        # Default conservative verdict
        warn "No clear verdict found in output — defaulting to skip"
        verdict="skip"
    fi

    echo "$verdict"
}

# ---------------------------------------------------------------------------
# Extract a brief summary from /scout output (max 500 chars)
# ---------------------------------------------------------------------------
extract_summary() {
    local output="$1"

    # Try to get the result text from JSON
    local result_text
    result_text=$(echo "$output" | jq -r '.result // .content // .message // empty' 2>/dev/null || echo "$output")

    if [ -z "$result_text" ]; then
        result_text="$output"
    fi

    # Truncate to 500 characters
    local summary
    summary=$(echo "$result_text" | cut -c1-500)

    # If truncated, add ellipsis
    if [ "${#result_text}" -gt 500 ]; then
        summary="${summary}..."
    fi

    echo "$summary"
}

# ---------------------------------------------------------------------------
# Post success comment to issue
# ---------------------------------------------------------------------------
post_success_comment() {
    local issue_num="$1"
    local verdict_upper="$2"
    local summary="$3"

    local comment_body
    comment_body=$(cat <<EOF
## /scout Analysis

**Verdict:** ${verdict_upper}

${summary}

---
_Automated analysis by hada-scout scout-runner._
EOF
)

    gh issue comment "$issue_num" \
        --repo "$REPO" \
        --body "$comment_body"
}

# ---------------------------------------------------------------------------
# Post failure comment to issue
# ---------------------------------------------------------------------------
post_failure_comment() {
    local issue_num="$1"
    local attempts="$2"
    local error_msg="$3"

    local comment_body
    comment_body=$(cat <<EOF
## /scout Analysis — Failed

**Attempts:** ${attempts}/${RETRY_COUNT}
**Error:** ${error_msg}

Will retry on next scheduled run.

---
_Automated analysis by hada-scout scout-runner._
EOF
)

    gh issue comment "$issue_num" \
        --repo "$REPO" \
        --body "$comment_body"
}

# ---------------------------------------------------------------------------
# Process a single issue
# $1 = issue number
# $2 = issue body
# Returns 0 on success, 1 on failure
# ---------------------------------------------------------------------------
process_issue() {
    local issue_num="$1"
    local issue_body="$2"

    # Extract source URL
    local url
    url=$(extract_source_url "$issue_body")

    if [ -z "$url" ]; then
        warn "Issue #${issue_num}: could not extract source URL from body"
        post_failure_comment "$issue_num" "0" "Could not extract source URL from issue body"
        return 1
    fi

    log "Issue #${issue_num}: source URL = ${url}"

    # Validate URL format before passing to claude
    local url_pattern='^https?://[a-zA-Z0-9._~:/?#@!$&*+,;=%-]+'
    if [[ ! "$url" =~ $url_pattern ]]; then
        warn "Invalid URL format for issue #${issue_num}: ${url}"
        post_failure_comment "$issue_num" "0" "Invalid URL format: ${url}"
        return 1
    fi

    # Run /scout with retries
    local attempt=0
    local scout_output=""
    local last_error=""

    while [ "$attempt" -lt "$RETRY_COUNT" ]; do
        attempt=$((attempt + 1))
        log "Issue #${issue_num}: attempt ${attempt}/${RETRY_COUNT}"

        if scout_output=$(run_scout "$url"); then
            if [ -n "$scout_output" ]; then
                log "Issue #${issue_num}: scout succeeded on attempt ${attempt}"
                break
            else
                last_error="Empty response from claude"
                warn "Issue #${issue_num}: empty response on attempt ${attempt}"
            fi
        else
            local exit_code=$?
            if [ "$exit_code" -eq 124 ]; then
                last_error="Timeout after ${SCOUT_TIMEOUT}s"
            else
                last_error="claude exited with code ${exit_code}"
            fi
            warn "Issue #${issue_num}: ${last_error} on attempt ${attempt}"
            scout_output=""
        fi
    done

    # Check if all retries exhausted
    if [ -z "$scout_output" ]; then
        err "Issue #${issue_num}: all ${RETRY_COUNT} attempts failed"
        post_failure_comment "$issue_num" "$RETRY_COUNT" "$last_error"
        return 1
    fi

    # Extract verdict and summary
    local verdict
    verdict=$(extract_verdict "$scout_output")
    local verdict_upper
    verdict_upper=$(echo "$verdict" | tr '[:lower:]' '[:upper:]')
    local summary
    summary=$(extract_summary "$scout_output")

    log "Issue #${issue_num}: verdict = ${verdict_upper}"

    # Update labels: remove pending-scout, add verdict label
    gh issue edit "$issue_num" \
        --repo "$REPO" \
        --remove-label "pending-scout" \
        --add-label "scout:${verdict}" \
        || warn "Issue #${issue_num}: failed to update labels"

    # Post analysis comment
    post_success_comment "$issue_num" "$verdict_upper" "$summary"

    log "Issue #${issue_num}: updated with verdict scout:${verdict}"
    return 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    log "=== hada-scout scout-runner starting ==="
    log "Repo: ${REPO}"
    log "Claude project dir: ${CLAUDE_PROJECT_DIR}"
    log "Max per run: ${MAX_SCOUT_PER_RUN}"
    log "Timeout: ${SCOUT_TIMEOUT}s"
    log "Retries: ${RETRY_COUNT}"

    check_deps

    if [ ! -d "${CLAUDE_PROJECT_DIR}" ]; then
        warn "CLAUDE_PROJECT_DIR not found: ${CLAUDE_PROJECT_DIR} — scout execution may fail"
    fi

    if [ -z "${GH_TOKEN:-}" ]; then
        err "GH_TOKEN is not set"
        exit 1
    fi

    ensure_labels

    # Fetch open issues with pending-scout label
    log "Fetching pending-scout issues..."
    local issues_json
    issues_json=$(gh api \
        --method GET \
        --field "per_page=${MAX_SCOUT_PER_RUN}" \
        --field "state=open" \
        --field "labels=pending-scout,hada-scout" \
        "repos/${REPO}/issues" 2>/dev/null) || {
        err "Failed to fetch issues from ${REPO}"
        exit 1
    }

    local total
    total=$(echo "$issues_json" | jq 'length')
    log "Found ${total} pending-scout issue(s)"

    if [ "$total" -eq 0 ]; then
        log "[Summary] processed=0 succeeded=0 failed=0 remaining=0"
        exit 0
    fi

    # Count total remaining (may be more than MAX_SCOUT_PER_RUN)
    local remaining_total
    remaining_total=$(gh issue list --repo "$REPO" --label "pending-scout" --label "hada-scout" --state open --json number --jq 'length' 2>/dev/null || echo "0")

    local processed=0
    local succeeded=0
    local failed=0

    # Process each issue
    for i in $(seq 0 $((total - 1))); do
        local issue_num
        issue_num=$(echo "$issues_json" | jq -r ".[$i].number")
        local issue_title
        issue_title=$(echo "$issues_json" | jq -r ".[$i].title")
        local issue_body
        issue_body=$(echo "$issues_json" | jq -r ".[$i].body")

        log "Processing issue #${issue_num}: ${issue_title}"
        processed=$((processed + 1))

        if process_issue "$issue_num" "$issue_body"; then
            succeeded=$((succeeded + 1))
        else
            failed=$((failed + 1))
        fi
    done

    local remaining=$((remaining_total - succeeded))
    if [ "$remaining" -lt 0 ]; then
        remaining=0
    fi

    log "[Summary] processed=${processed} succeeded=${succeeded} failed=${failed} remaining=${remaining}"
}

main "$@"

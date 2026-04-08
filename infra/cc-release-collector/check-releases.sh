#!/usr/bin/env bash
# check-releases.sh — Claude Code release collector
# Fetches new Claude Code releases and creates GitHub issues for untracked versions.
#
# Env vars:
#   GH_TOKEN     GitHub personal access token (required; gh CLI reads this automatically)
#   REPO         Target repo for issue creation (default: baekenough/oh-my-customcode)
#   MIN_VERSION  Minimum version to track, inclusive (default: 2.1.86)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO="${REPO:-baekenough/oh-my-customcode}"
MIN_VERSION="${MIN_VERSION:-2.1.86}"
SOURCE_REPO="anthropics/claude-code"
ISSUE_LABEL_AUTOMATED="automated"
ISSUE_LABEL_RELEASE="claude-code-release"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
warn() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] WARN: $*" >&2; }
err()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

# ---------------------------------------------------------------------------
# Semver comparison: returns 0 if $1 >= $2, non-zero otherwise
# Accepts versions with or without leading 'v'
# ---------------------------------------------------------------------------
semver_gte() {
    local a="${1#v}"
    local b="${2#v}"

    local a_major a_minor a_patch
    local b_major b_minor b_patch

    a_major="${a%%.*}"; a="${a#*.}"
    a_minor="${a%%.*}"; a="${a#*.}"
    a_patch="${a%%.*}"

    b_major="${b%%.*}"; b="${b#*.}"
    b_minor="${b%%.*}"; b="${b#*.}"
    b_patch="${b%%.*}"

    # Strip pre-release suffixes (e.g. -rc1) from patch
    a_patch="${a_patch%%-*}"
    b_patch="${b_patch%%-*}"

    if   [ "$a_major" -gt "$b_major" ]; then return 0
    elif [ "$a_major" -lt "$b_major" ]; then return 1
    elif [ "$a_minor" -gt "$b_minor" ]; then return 0
    elif [ "$a_minor" -lt "$b_minor" ]; then return 1
    elif [ "$a_patch" -ge "$b_patch" ]; then return 0
    else return 1
    fi
}

# ---------------------------------------------------------------------------
# Ensure required tools are available
# ---------------------------------------------------------------------------
check_deps() {
    local missing=0
    for cmd in gh jq; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            err "Required command not found: $cmd"
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] || exit 1
}

# ---------------------------------------------------------------------------
# Ensure labels exist in target repo; create if missing
# ---------------------------------------------------------------------------
ensure_label() {
    local label="$1"
    local color="${2:-"0075ca"}"
    local description="${3:-""}"

    if ! gh label list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null \
            | grep -qxF "$label"; then
        log "Creating label: $label"
        gh label create "$label" \
            --repo "$REPO" \
            --color "$color" \
            --description "$description" \
            --force \
            || warn "Could not create label '$label' — continuing"
    fi
}

# ---------------------------------------------------------------------------
# Fetch existing issues that track a Claude Code version
# Returns a newline-separated list of version strings already tracked
# ---------------------------------------------------------------------------
fetch_tracked_versions() {
    local page=1
    local per_page=100
    local versions=""

    while true; do
        local batch
        batch=$(gh api \
            --method GET \
            --field "per_page=${per_page}" \
            --field "page=${page}" \
            --field "state=all" \
            --field "labels=${ISSUE_LABEL_RELEASE}" \
            "repos/${REPO}/issues" \
            --jq '.[].title' 2>/dev/null || echo "")

        # Handle GitHub API rate limit (gh exits non-zero and prints to stderr)
        if [ $? -ne 0 ]; then
            warn "GitHub API error while listing issues — skipping tracked-version check"
            echo ""
            return
        fi

        [ -z "$batch" ] && break

        # Extract version from title "Claude Code vX.Y.Z"
        # Use -oE (POSIX extended) instead of -oP (Perl) for Alpine BusyBox grep compatibility
        local found
        found=$(echo "$batch" | grep -oE 'Claude Code v[0-9]+\.[0-9]+\.[0-9]+' \
            | sed 's/Claude Code v//' || true)
        versions="${versions}${found}
"

        local count
        count=$(echo "$batch" | wc -l)
        [ "$count" -lt "$per_page" ] && break
        page=$((page + 1))
    done

    echo "$versions"
}

# ---------------------------------------------------------------------------
# Build issue body for a release
# $1 = version (without leading v)
# $2 = published_at
# $3 = html_url
# $4 = body (release notes, raw)
# ---------------------------------------------------------------------------
build_issue_body() {
    local version="$1"
    local published_at="$2"
    local html_url="$3"
    local release_body="$4"

    # Truncate release body to 2000 chars to stay within issue size limits
    local truncated_body
    truncated_body="$(echo "$release_body" | head -c 2000)"
    if [ "${#release_body}" -gt 2000 ]; then
        truncated_body="${truncated_body}

..._(truncated — see full release notes at ${html_url})_"
    fi

    cat <<EOF
# Claude Code v${version}

**Release:** v${version}
**Published:** ${published_at}
**Link:** ${html_url}

## Release Summary

${truncated_body}

---

## Action Items

- [ ] Review release notes for impact on oh-my-customcode
- [ ] Update agent definitions if new Claude Code features affect agents
- [ ] Test compatibility with current oh-my-customcode version
- [ ] Update CLAUDE.md if new capabilities are relevant

---

_This issue was auto-created by cc-release-collector CronJob._
EOF
}

# ---------------------------------------------------------------------------
# Create a GitHub issue for the given release
# ---------------------------------------------------------------------------
create_issue() {
    local version="$1"
    local published_at="$2"
    local html_url="$3"
    local release_body="$4"

    local title="Claude Code v${version}"
    local body
    body="$(build_issue_body "$version" "$published_at" "$html_url" "$release_body")"

    log "Creating issue: ${title}"
    gh issue create \
        --repo "$REPO" \
        --title "$title" \
        --body "$body" \
        --label "${ISSUE_LABEL_AUTOMATED},${ISSUE_LABEL_RELEASE}" \
        >/dev/null

    log "Issue created: ${title}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    log "=== cc-release-collector starting ==="
    log "Source: ${SOURCE_REPO}"
    log "Target repo: ${REPO}"
    log "Minimum version: ${MIN_VERSION}"

    check_deps

    # Validate GH_TOKEN is set (gh CLI uses it implicitly)
    if [ -z "${GH_TOKEN:-}" ]; then
        err "GH_TOKEN is not set"
        exit 1
    fi

    # Ensure required labels exist
    ensure_label "$ISSUE_LABEL_AUTOMATED" "e4e669" "Automatically created by a bot"
    ensure_label "$ISSUE_LABEL_RELEASE"   "0075ca" "Claude Code release tracking"

    # Fetch all releases from the source repo
    log "Fetching releases from ${SOURCE_REPO}..."
    local releases_json
    if ! releases_json=$(gh api \
            --method GET \
            --field "per_page=100" \
            "repos/${SOURCE_REPO}/releases" 2>&1); then
        # Detect rate limit
        if echo "$releases_json" | grep -qi "rate limit"; then
            warn "GitHub API rate limit hit — exiting gracefully (exit 0)"
            exit 0
        fi
        err "Failed to fetch releases: ${releases_json}"
        exit 1
    fi

    # Parse releases: filter by MIN_VERSION, extract fields
    # Use grep -E (POSIX extended) for Alpine BusyBox grep compatibility (no -P Perl support)
    local candidate_versions
    candidate_versions=$(echo "$releases_json" | jq -r \
        '.[] | select(.draft == false and .prerelease == false) | .tag_name' \
        | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+$' || true)

    # Also check versions with leading 'v'
    local candidate_versions_v
    candidate_versions_v=$(echo "$releases_json" | jq -r \
        '.[] | select(.draft == false and .prerelease == false) | .tag_name' \
        | sed 's/^v//' | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+$' || true)

    # Merge and deduplicate
    local all_candidates
    all_candidates=$(echo -e "${candidate_versions}\n${candidate_versions_v}" \
        | sort -uV)

    # Filter to versions >= MIN_VERSION
    local eligible_versions=""
    while IFS= read -r ver; do
        [ -z "$ver" ] && continue
        if semver_gte "$ver" "$MIN_VERSION"; then
            eligible_versions="${eligible_versions}${ver}
"
        fi
    done <<< "$all_candidates"

    if [ -z "$eligible_versions" ]; then
        log "No eligible releases found (>= v${MIN_VERSION})"
        log "=== Summary: checked=0 created=0 skipped=0 ==="
        exit 0
    fi

    local checked=0
    for ver in $(echo "$eligible_versions" | sort -V); do
        [ -z "$ver" ] && continue
        checked=$((checked + 1))
    done
    log "Eligible releases (>= v${MIN_VERSION}): ${checked}"

    # Fetch already-tracked versions from existing issues
    log "Fetching already-tracked versions from ${REPO}..."
    local tracked_versions
    tracked_versions="$(fetch_tracked_versions)"

    # Process each eligible version
    local created=0
    local skipped=0

    while IFS= read -r ver; do
        [ -z "$ver" ] && continue

        # Check if already tracked
        if echo "$tracked_versions" | grep -qxF "$ver"; then
            log "Skipping v${ver} — issue already exists"
            skipped=$((skipped + 1))
            continue
        fi

        # Fetch release details for this version (try both with and without 'v' prefix)
        local release_detail
        release_detail=$(echo "$releases_json" | jq --arg ver "$ver" \
            '.[] | select((.tag_name == $ver) or (.tag_name == ("v" + $ver)))' \
            | head -1)

        if [ -z "$release_detail" ]; then
            warn "Could not find release details for v${ver} — skipping"
            skipped=$((skipped + 1))
            continue
        fi

        local published_at html_url release_body
        published_at=$(echo "$release_detail" | jq -r '.published_at // "unknown"')
        html_url=$(echo "$release_detail" | jq -r '.html_url // ""')
        release_body=$(echo "$release_detail" | jq -r '.body // "(No release notes provided)"')

        create_issue "$ver" "$published_at" "$html_url" "$release_body"
        created=$((created + 1))

    done <<< "$eligible_versions"

    log "=== Summary: checked=${checked} created=${created} skipped=${skipped} ==="
}

main "$@"

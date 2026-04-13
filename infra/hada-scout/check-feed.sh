#!/usr/bin/env bash
# check-feed.sh — hada-scout RSS feed scanner
# Fetches hada.io feed, filters by harness/benchmark/eval keywords,
# creates GitHub issues for matches with pending-scout label for /scout analysis.
#
# Env vars:
#   GH_TOKEN   GitHub personal access token (required; gh CLI reads this automatically)
#   REPO       Target repo for issue creation (default: baekenough/oh-my-customcode)
#   FEED_URL   RSS/Atom feed URL (default: feedburner geeknews-feed — hada.io uses same feed)
#   KEYWORDS   Pipe-separated keyword regex (case-insensitive)
#   MAX_SCOUT_ENTRIES  Max issues to create per run (default: 5, cost control)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO="${REPO:-baekenough/oh-my-customcode}"
FEED_URL="${FEED_URL:-http://feeds.feedburner.com/geeknews-feed}"
KEYWORDS="${KEYWORDS:-\\bharness\\b|\\bbenchmark\\b|\\beval\\b|evaluation framework|agent framework|코드 리뷰 자동화|하네스|벤치마크|평가}"
ISSUE_LABEL_AUTOMATED="automated"
ISSUE_LABEL_HADA="hada-scout"
ISSUE_LABEL_PENDING="pending-scout"
MAX_SCOUT_ENTRIES="${MAX_SCOUT_ENTRIES:-5}"

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
    for cmd in gh jq curl; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            err "Required command not found: $cmd"
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] || exit 1
}

# ---------------------------------------------------------------------------
# Ensure label exists in target repo; create if missing
# ---------------------------------------------------------------------------
ensure_label() {
    local label="$1"
    local color="${2:-0075ca}"
    local description="${3:-}"

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
# Fetch and parse Atom/RSS feed
# Returns one JSON object per line: {"title":"...","link":"...","published":"..."}
# Handles both Atom 1.0 (<entry>) and RSS 2.0 (<item>) formats
# ---------------------------------------------------------------------------
fetch_feed() {
    local feed_xml
    feed_xml=$(curl -sL --max-time 30 "$FEED_URL" 2>/dev/null) || {
        err "Failed to fetch feed from ${FEED_URL}"
        exit 1
    }

    if [ -z "$feed_xml" ]; then
        err "Empty response from feed"
        exit 1
    fi

    # Detect format: Atom uses <entry>, RSS uses <item>
    local entry_tag="entry"
    if echo "$feed_xml" | grep -q '<item>'; then
        entry_tag="item"
    fi

    # Parse using gawk — split on entry/item boundaries
    echo "$feed_xml" | gawk -v tag="$entry_tag" '
    BEGIN {
        RS = ""
        FS = "\n"
        in_entry = 0
        entry_buf = ""
    }
    {
        # Join all lines in this paragraph-block
        block = $0
        # Find each <entry> or <item> in the block
        while (match(block, "<" tag ">")) {
            before = substr(block, 1, RSTART - 1)
            block = substr(block, RSTART)
            end_pos = index(block, "</" tag ">")
            if (end_pos == 0) break
            entry = substr(block, 1, end_pos + length("</" tag ">") - 1)
            block = substr(block, end_pos + length("</" tag ">"))
            process_entry(entry)
        }
    }

    function process_entry(entry,    title, link, published) {
        title = extract_tag(entry, "title")
        published = extract_tag(entry, "published")
        if (published == "") published = extract_tag(entry, "pubDate")

        # Atom: <link href="..."/> or <link rel="alternate" href="..."/>
        # Try href attribute first
        link = extract_attr(entry, "link", "href")
        # RSS: <link>url</link>
        if (link == "") link = extract_tag(entry, "link")

        # Clean up CDATA wrappers
        gsub(/^[[:space:]]*<!\[CDATA\[/, "", title)
        gsub(/\]\]>[[:space:]]*$/, "", title)
        gsub(/^[[:space:]]+/, "", title)
        gsub(/[[:space:]]+$/, "", title)

        if (title != "" && link != "") {
            # Escape backslashes and double-quotes for JSON
            gsub(/\\/, "\\\\", title)
            gsub(/"/, "\\\"", title)
            gsub(/\\/, "\\\\", link)
            gsub(/"/, "\\\"", link)
            gsub(/\\/, "\\\\", published)
            gsub(/"/, "\\\"", published)
            printf "{\"title\":\"%s\",\"link\":\"%s\",\"published\":\"%s\"}\n", title, link, published
        }
    }

    function extract_tag(text, tag,    pattern, val, start, end) {
        # Match <tag ...>content</tag> — handles attributes on opening tag
        pattern = "<" tag "[^>]*>"
        start = match(text, pattern)
        if (start == 0) return ""
        val = substr(text, start + RLENGTH)
        end = index(val, "</" tag ">")
        if (end == 0) return ""
        val = substr(val, 1, end - 1)
        gsub(/^[[:space:]]+/, "", val)
        gsub(/[[:space:]]+$/, "", val)
        return val
    }

    function extract_attr(text, tag, attr,    pattern, val, rest) {
        # Match <tag ... attr="value" ...> or attr='"'"'value'"'"'
        # Look for the tag element
        pattern = "<" tag "[^>]*>"
        if (!match(text, pattern)) return ""
        val = substr(text, RSTART, RLENGTH)
        # Try attr="value"
        if (match(val, attr "=\"[^\"]*\"")) {
            rest = substr(val, RSTART + length(attr) + 2)
            sub(/".*/, "", rest)
            return rest
        }
        # Try attr='"'"'value'"'"'
        if (match(val, attr "='"'"'[^'"'"']*'"'"'")) {
            rest = substr(val, RSTART + length(attr) + 2)
            sub(/'"'"'.*/, "", rest)
            return rest
        }
        return ""
    }
    '
}

# ---------------------------------------------------------------------------
# Check if an article link is already tracked in existing issues
# $1 = link URL
# Uses global $tracked_issue_bodies
# ---------------------------------------------------------------------------
is_tracked() {
    local link="$1"
    echo "$tracked_issue_bodies" | grep -qF "$link"
}

# ---------------------------------------------------------------------------
# Build issue body
# ---------------------------------------------------------------------------
build_issue_body() {
    local title="$1"
    local link="$2"
    local published="$3"

    # Extract matched keywords for display
    local matched_keywords
    matched_keywords=$(echo "$title" | grep -oEi "$KEYWORDS" | sort -u | sed 's/^/- /' || echo "- (see title)")

    cat <<EOF
# hada-scout: ${title}

**Source:** ${link}
**Published:** ${published}
**Found by:** hada-scout CronJob
**Status:** Pending /scout analysis

## Matched Keywords

${matched_keywords}

---

## Action Items

- [ ] /scout analysis (automated via scout-runner.sh)
- [ ] Review /scout verdict
- [ ] If relevant: create implementation issue or integrate learnings
- [ ] If not relevant: close with comment

---

_This issue was auto-created by hada-scout CronJob. /scout analysis will run automatically._
EOF
}

# ---------------------------------------------------------------------------
# Create a GitHub issue for a matched article
# ---------------------------------------------------------------------------
create_issue() {
    local title="$1"
    local link="$2"
    local published="$3"

    local body
    body="$(build_issue_body "$title" "$link" "$published")"

    log "Creating issue: [hada-scout] ${title}"
    gh issue create \
        --repo "$REPO" \
        --title "[hada-scout] ${title}" \
        --body "$body" \
        --label "${ISSUE_LABEL_AUTOMATED},${ISSUE_LABEL_HADA},${ISSUE_LABEL_PENDING}" \
        >/dev/null

    log "Issue created: [hada-scout] ${title}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    log "=== hada-scout starting ==="
    log "Feed: ${FEED_URL}"
    log "Target repo: ${REPO}"
    log "Keywords: ${KEYWORDS}"
    log "Max entries per run: ${MAX_SCOUT_ENTRIES}"

    check_deps

    if [ -z "${GH_TOKEN:-}" ]; then
        err "GH_TOKEN is not set"
        exit 1
    fi

    ensure_label "$ISSUE_LABEL_AUTOMATED" "e4e669" "Automatically created by a bot"
    ensure_label "$ISSUE_LABEL_HADA" "5319e7" "hada-scout article scanner"
    ensure_label "$ISSUE_LABEL_PENDING" "FBCA04" "Pending /scout analysis"

    log "Fetching feed..."
    local entries
    entries=$(fetch_feed)

    local total=0
    if [ -n "$entries" ]; then
        total=$(echo "$entries" | grep -c '^{' || true)
    fi
    log "Feed entries found: ${total}"

    if [ "$total" -eq 0 ]; then
        log "No entries parsed from feed — check feed URL or format"
        log "=== Summary: checked=0 matched=0 created=0 skipped=0 ==="
        exit 0
    fi

    # Fetch existing hada-scout issues to avoid duplicates
    log "Fetching already-tracked articles from ${REPO}..."
    local tracked_issue_bodies
    tracked_issue_bodies=$(gh api \
        --method GET \
        --field "per_page=100" \
        --field "state=all" \
        --field "labels=${ISSUE_LABEL_HADA}" \
        "repos/${REPO}/issues" \
        --jq '.[].body' 2>/dev/null || echo "")

    local checked=0 created=0 skipped=0 matched=0

    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        # Skip non-JSON lines
        [[ "$entry" == "{"* ]] || continue

        local title link published
        title=$(echo "$entry" | jq -r '.title // ""' 2>/dev/null) || continue
        link=$(echo "$entry"  | jq -r '.link // ""'  2>/dev/null) || continue
        published=$(echo "$entry" | jq -r '.published // ""' 2>/dev/null) || continue

        [ -z "$title" ] && continue
        [ -z "$link"  ] && continue

        checked=$((checked + 1))

        # Keyword filter (case-insensitive, POSIX extended regex)
        if ! echo "$title" | grep -qEi "$KEYWORDS"; then
            continue
        fi
        matched=$((matched + 1))

        # Dedup: check if this link appears in any existing issue body
        if is_tracked "$link"; then
            log "Skipping (already tracked): ${title}"
            skipped=$((skipped + 1))
            continue
        fi

        # Cost control: stop after MAX_SCOUT_ENTRIES new issues per run
        if [ "$created" -ge "$MAX_SCOUT_ENTRIES" ]; then
            log "Reached MAX_SCOUT_ENTRIES cap (${MAX_SCOUT_ENTRIES}) — stopping issue creation"
            break
        fi

        create_issue "$title" "$link" "$published"
        created=$((created + 1))

    done <<< "$entries"

    log "=== Summary: checked=${checked} matched=${matched} created=${created} skipped=${skipped} ==="
}

main "$@"

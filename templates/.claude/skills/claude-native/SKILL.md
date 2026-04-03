---
name: claude-native
description: Monitor Claude Code releases and auto-generate GitHub issues for each new version
scope: core
user-invocable: true
argument-hint: "[--backfill] [--dry-run]"
version: 1.0.0
---

# Claude Native Skill

Monitor Claude Code (the CLI tool) release history and auto-generate GitHub issues for each new version that has not yet been tracked. Replaces the deprecated customclaw Airflow-based monitoring (deprecated 2026-03-18).

## Options

```
--backfill    Process ALL versions >= v2.1.86 (default behavior when flag is present)
              Without flag: only check the latest 5 releases
--dry-run     Show what issues would be created without actually creating them
```

## Workflow

### Phase 1: Fetch CC Releases

Fetch all Claude Code releases from the GitHub API:

```bash
gh api repos/anthropics/claude-code/releases \
  --paginate \
  --jq '.[] | {tag_name: .tag_name, published_at: .published_at, html_url: .html_url, body: .body}'
```

- Without `--backfill`: fetch only the latest 5 releases (`--limit 5` or first 5 results)
- With `--backfill`: fetch all releases (use `--paginate`)
- Filter: only process versions >= v2.1.86 (monitoring stopped after v2.1.85 / issue #683)

### Phase 2: Check Existing Issues

Search for existing tracking issues to avoid duplicates:

```bash
gh issue list \
  --state all \
  --search "[Claude Code v" \
  --json number,title \
  --limit 100
```

Build a set of already-tracked versions by extracting version strings from issue titles matching the pattern `[Claude Code v{version}]`.

### Phase 3: Dedup

For each fetched release version:
- Parse the version string from `tag_name` (e.g., `v2.1.86`)
- If a matching issue title already exists → skip (already tracked)
- If no matching issue → add to "needs issue" list

### Phase 4: Create Issues (or Dry-Run Report)

#### Dry-Run Mode (`--dry-run`)

Print a report of what would be created:

```
[Dry Run] Would create issues for:
  - v2.1.86 (published: 2026-01-15)
  - v2.1.87 (published: 2026-01-22)
  ...
No issues were created.
```

#### Live Mode

For each version in the "needs issue" list, create a GitHub issue:

```bash
gh issue create \
  --title "[Claude Code v{version}] New release detected" \
  --label "automated,claude-code-release" \
  --body "{body}"
```

Issue body format (matching the pattern established by issue #683):

```markdown
# Claude Code v{version}

**Release:** v{version}
**Published:** {published_at}
**Link:** {html_url}

## Release Summary

{release_notes_body — truncated to first 2000 chars if too long}

---

## Action Items

- [ ] Review release notes for impact on oh-my-customcode
- [ ] Update agent definitions if new Claude Code features affect agents
- [ ] Test compatibility with current oh-my-customcode version
- [ ] Update CLAUDE.md if new capabilities are relevant

---

_This issue was created by the `/omcustom:claude-native` skill._
```

**Notes:**
- If `body` from the release is empty, use `_No release notes provided._`
- Truncate release body at 2000 characters and append `... (truncated)` if needed
- The `automated` and `claude-code-release` labels must exist in the repository; create them if missing:
  ```bash
  gh label create "automated" --color "#0075ca" --description "Automated issue" 2>/dev/null || true
  gh label create "claude-code-release" --color "#e4e669" --description "Claude Code release tracking" 2>/dev/null || true
  ```

### Phase 5: Report Results

After processing all versions:

```
[claude-native] Scan complete

Versions checked: {N}
New issues created: {M}

Created:
  - #1234 [Claude Code v2.1.86] New release detected
  - #1235 [Claude Code v2.1.87] New release detected

Already tracked (skipped):
  - v2.1.85 → #683
```

If no new releases found:

```
[claude-native] No new releases found. All versions >= v2.1.86 are already tracked.
```

## Version Filtering Logic

```
MIN_VERSION = "2.1.86"

For each release:
  version = strip_v_prefix(tag_name)   # "v2.1.86" → "2.1.86"
  parts = split(version, ".")           # ["2", "1", "86"]
  if compare_semver(version, MIN_VERSION) >= 0:
    include
  else:
    skip
```

Semver comparison: major → minor → patch (all numeric). Pre-release suffixes (e.g., `-beta`) are included and compared lexicographically after numeric parts.

## Error Handling

| Error | Action |
|-------|--------|
| `gh` not authenticated | Report: "Error: gh CLI not authenticated. Run `gh auth login` first." |
| Rate limit hit | Report current status, list remaining versions |
| Label creation fails | Warn and continue (issue created without label) |
| Release body parse error | Use empty body fallback, continue |

## Integration Options

### Manual

```
/omcustom:claude-native
/omcustom:claude-native --backfill
/omcustom:claude-native --dry-run
```

### Automatic (SessionStart Hook)

Can be integrated into the SessionStart hook to check for new releases at session start:

```json
{
  "SessionStart": [
    {
      "command": "bash .claude/hooks/scripts/claude-native-check.sh"
    }
  ]
}
```

A lightweight wrapper script can run a `--dry-run` check and notify if new releases exist.

### Scheduled (CronCreate)

Can be set up as a scheduled remote agent using `/schedule`:

```
/schedule "daily at 9am: /omcustom:claude-native"
```

Or via CronCreate MCP tool for programmatic scheduling.

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`)
- Repository: `baekenough/oh-my-customcode` (default, detected from git remote)
- Labels `automated` and `claude-code-release` (auto-created if missing)

## Background

- Last manually tracked release: v2.1.85 (issue #683)
- Monitoring gap: v2.1.86 onwards (customclaw deprecated 2026-03-18)
- This skill fills the monitoring gap and provides ongoing tracking

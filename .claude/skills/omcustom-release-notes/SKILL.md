---
name: omcustom-release-notes
description: Generate structured release notes from git history and closed issues within Claude Code session
scope: harness
user-invocable: true
argument-hint: "<version> [--previous-tag <tag>] | --backfill <range>"
---

# Release Notes Generator

Generate structured release notes directly within the Claude Code session, using git history and GitHub issues. No external API calls needed — Claude Code itself analyzes and generates the notes.

## Purpose

Replaces the CI-based `release-notes.yml` workflow that previously used Claude API (`ANTHROPIC_API_KEY`). The release notes are now generated in-session and written to a notes file and passed to `gh release create --notes-file`.

## Usage

```
/omcustom-release-notes 0.36.0
/omcustom-release-notes 0.36.0 --previous-tag v0.35.3
/omcustom-release-notes --backfill v0.36.0..v0.127.0
```

## Workflow

### Phase 1: Gather Context

```bash
# 1. Determine previous tag
PREV_TAG=$(git tag --sort=-version:refname | grep -v "^v${VERSION}$" | head -1)

# 2. Get commit history
git log ${PREV_TAG}..HEAD --pretty=format:"%h %s"

# 3. Get changed files
git diff --name-status ${PREV_TAG}..HEAD

# 4. Get closed issues since previous tag
gh issue list --state closed --search "closed:>$(git log -1 --format=%ci ${PREV_TAG} | cut -d' ' -f1)" --json number,title,labels
```

### Phase 2: Classify Changes

Categorize commits using Conventional Commits:

| Prefix | Category | Emoji |
|--------|----------|-------|
| feat: | Features | :rocket: |
| fix: | Bug Fixes | :bug: |
| docs: | Documentation | :books: |
| refactor: | Refactoring | :recycle: |
| test: | Tests | :test_tube: |
| chore: | Chores | :wrench: |
| security | Security | :lock: |

### Phase 3: Generate Notes

Output format:

```markdown
# Release v{VERSION}

## Highlights
(1-3 key features/changes)

## :rocket: Features
- **{title}** (#{issue}): {description}

## :bug: Bug Fixes
- **{title}** (#{issue}): {description}

## :lock: Security
- {security changes}

## :books: Documentation
- {doc changes}

## :recycle: Other Changes
- {other changes}

## Resource Changes
| Resource | Before | After | Delta |
|----------|--------|-------|-------|
| Rules | {n} | {n} | {delta} |
| Skills | {n} | {n} | {delta} |
| Agents | {n} | {n} | {delta} |

## Breaking Changes
{if any, otherwise omit section}

---
_Release notes generated with Claude Code_
```

### Phase 4: Apply

The generated notes can be:
1. **Direct**: Write the notes to a git-ignored notes file (for example `.claude/outputs/sessions/{date}/release-notes-{VERSION}.md`) with the Write tool, then run `gh release create v{VERSION} --notes-file <notes-file>`. Do not inline the notes text in the command line, because `$(…)` and backticks inside the notes would be executed by the shell. `release_notes.md` is a tracked file and is not used as the `--notes-file` input.
2. **File**: Written to `release_notes.md` for review before use
3. **Update**: Write the notes to the same kind of git-ignored notes file, then run `gh release edit v{VERSION} --notes-file <notes-file>` (again, `release_notes.md` is not used as the `--notes-file` input)

### Phase 5: Promote `## [Unreleased]` in CHANGELOG.md (Optional but Recommended)

After generating release notes, promote any pending `## [Unreleased]` entries to a versioned section so `release.yml` (awk extract at line ~217) finds the authored notes instead of falling back to GitHub auto-generated content.

```bash
# Promote [Unreleased] to [VERSION] with today's date
DATE=$(date -u +%Y-%m-%d)
python3 - "$VERSION" "$DATE" <<'PY'
import sys, re, pathlib
version, date = sys.argv[1], sys.argv[2]
path = pathlib.Path("CHANGELOG.md")
text = path.read_text()
header = f"## [{version}] - {date}"
if re.search(rf"^## \[{re.escape(version)}\]", text, flags=re.M):
    print(f"[skip] [{version}] section already exists — manual reconciliation needed")
    sys.exit(0)
new = re.sub(
    r"^## \[Unreleased\]\s*\n",
    f"## [Unreleased]\n\n{header}\n",
    text,
    count=1,
    flags=re.M,
)
if new == text:
    print("[error] [Unreleased] section not found — CHANGELOG.md format unexpected")
    sys.exit(1)
path.write_text(new)
print(f"[ok] promoted [Unreleased] -> [{version}]")
PY
```

Behavior:
- If `## [Unreleased]` content is empty, the promoted `## [VERSION]` will also be empty — `release.yml` falls back to auto-generated notes (existing behavior preserved).
- If `## [VERSION]` already exists (re-run, manual edit), the script skips with a log message — no overwrite.
- The skill caller commits the change: `git add CHANGELOG.md && git commit -m "chore(changelog): promote [Unreleased] to [VERSION]"`

This is **optional** — the skill's release-notes generation (Phases 1-4) works independently. Phase 5 only ensures CHANGELOG consistency for projects that maintain Keep a Changelog format.

## Backfill Mode

For projects with historical CHANGELOG.md gaps (releases shipped without `[Unreleased]` promotion), the skill provides a deterministic batch backfill.

### Usage

```bash
python3 scripts/backfill_changelog.py <START_TAG>..<END_TAG> [--output FILE]
```

Or invoked via skill: `/omcustom-release-notes --backfill v0.36.0..v0.127.0`

### Behavior

For each tag in range (in reverse semver order), the script:

1. Determines previous tag (semver-immediately-before)
2. Reads `git log <prev>..<tag> --pretty=%s --no-merges` to extract commit subjects
3. Maps Conventional Commits prefix to Keep a Changelog category:
   - `feat` → Added
   - `fix` → Fixed
   - `security` → Security
   - `perf`, `refactor`, `chore`, `build`, `deps`, `revert` → Changed
   - `docs`, `test`, `ci`, `style` → SKIPPED (internal-only, unless `!` breaking marker)
   - Non-conventional → Changed (full subject as message)
4. Special handling for `release:` / `chore(release):` commits — extracts description after version (e.g., `release: v0.127.0 — DESC` → DESC under Changed)
5. Extracts issue refs (`#NNN`) and appends as `(#1, #2)` suffix
6. Renders per-version section with categories sorted: Added, Changed, Fixed, Security, Removed, Deprecated
7. Empty sections (zero qualifying commits) render as `_No user-visible changes (internal only)._`

### Output

Markdown text suitable for prepending to CHANGELOG.md between `## [Unreleased]` and the first existing version section.

### When to Use

- Adopting Keep a Changelog format on an existing project with N historical releases
- Recovering after a CHANGELOG drift period
- One-time bulk operation — afterward, use Phase 5 promotion (forward-looking) for ongoing maintenance

### Limitations

- Only as good as commit message quality. Squash-merge release commits typically contain only the PR title — backfill produces 1-2 lines per version, not exhaustive change lists
- Non-conventional or pre-Conventional Commits adoption commits land in Changed
- Manual curation may improve specific entries; the script provides the baseline

### Tests

`tests/scripts/test_backfill_changelog.py` covers parser correctness, semver sorting, category mapping, edge cases (40 tests).

## Integration

This skill is designed to be used during the release process:

```
/omcustom:npm-version patch|minor|major  ->  version bump
/omcustom-release-notes {version}         ->  generate notes + promote [Unreleased] (Phase 5)
mgr-gitnerd: gh release create           ->  create release with notes
```

## Notes

- No external API keys required
- Uses git history and gh CLI for data gathering
- Claude Code analyzes and generates notes in-context
- Resource count changes auto-detected from CLAUDE.md history
- Phase 5 promotion is idempotent — safe to re-run; skips if `## [VERSION]` exists
- See `CONTRIBUTING.md` for [Unreleased] entry guidance during PR authoring
- For one-time historical backfill, see Backfill Mode above (script: `scripts/backfill_changelog.py`)

## Permission Mode

Pass `mode: "bypassPermissions"` on Agent calls for compatibility: it is required on CC < 2.1.212 (the per-call default, `acceptEdits`, overrides agent frontmatter `permissionMode`) and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (adjustable via agent frontmatter `permissionMode`). Verify the effective mode before unattended runs: see R010 "Universal bypassPermissions".

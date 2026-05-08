---
name: omcustom-release-notes
description: Generate structured release notes from git history and closed issues within Claude Code session
scope: harness
user-invocable: true
argument-hint: "<version> [--previous-tag <tag>]"
---

# Release Notes Generator

Generate structured release notes directly within the Claude Code session, using git history and GitHub issues. No external API calls needed — Claude Code itself analyzes and generates the notes.

## Purpose

Replaces the CI-based `release-notes.yml` workflow that previously used Claude API (`ANTHROPIC_API_KEY`). The release notes are now generated in-session and passed directly to `gh release create --notes`.

## Usage

```
/omcustom-release-notes 0.36.0
/omcustom-release-notes 0.36.0 --previous-tag v0.35.3
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
1. **Direct**: Passed to `gh release create --notes "{notes}"`
2. **File**: Written to `release_notes.md` for review before use
3. **Update**: Used with `gh release edit v{VERSION} --notes "{notes}"`

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

## Permission Mode

When spawning agents via the Agent tool during this skill's execution, always pass `mode: "bypassPermissions"`. The Agent tool default (`acceptEdits`) overrides agent frontmatter `permissionMode`, causing permission prompts during unattended execution.

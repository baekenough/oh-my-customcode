# Scout Skill Design Spec

## Overview

`scout` — Analyze external URLs (tech blogs, tools, libraries, methodologies) to evaluate fit with the current project and auto-create a GitHub issue with a structured verdict. Works with any project by dynamically reading project context.

Installation: `npx skills add baekenough/baekenough-skills --skill scout`

## Commands

| Command | Description |
|---------|-------------|
| `/scout <url>` | Analyze URL and create issue with verdict |
| `/scout init` | Force regenerate project fingerprint |

## Verdict Taxonomy

| Verdict | Meaning | Label | Follow-up |
|---------|---------|-------|-----------|
| INTERNALIZE | Aligns with project; should become part of codebase | `scout:internalize` + `P1`/`P2`/`P3` | Direct implementation or deep research |
| INTEGRATE | Useful but best kept as external dependency | `scout:integrate` + `P2`/`P3` | Integration review |
| SKIP | Irrelevant or duplicates existing functionality | `scout:skip` | Issue created then auto-closed |

## Project Fingerprint

### Purpose

Instead of reading the full codebase each time (50K+ tokens for large projects), scout maintains a lightweight fingerprint file that captures the project's essence in ~3KB (~1K tokens).

### Location

`.scout/fingerprint.json` — gitignored by default, local to each developer.

### Content

```json
{
  "git_hash": "abc1234",
  "generated_at": "2026-04-02T10:00:00Z",
  "project": {
    "name": "my-project",
    "description": "extracted from README first line"
  },
  "tech_stack": {
    "primary_languages": ["TypeScript", "Python"],
    "language_distribution": {"TypeScript": 65, "Python": 30, "Shell": 5},
    "frameworks": ["Next.js", "FastAPI"],
    "package_managers": ["npm", "pip"]
  },
  "dependencies": {
    "key_deps": ["react", "next", "fastapi", "sqlalchemy"],
    "dev_deps_count": 45,
    "prod_deps_count": 23
  },
  "structure": {
    "total_files": 342,
    "total_dirs": 48,
    "top_level_dirs": ["src", "tests", "docs", "scripts"],
    "test_framework": "jest",
    "ci_system": "github-actions"
  },
  "skills_and_agents": {
    "has_claude_md": true,
    "skills_count": 5,
    "skills_list": ["dev-review", "commit", "deploy"],
    "agents_count": 3,
    "agents_list": ["backend-expert", "frontend-expert"]
  },
  "philosophy_summary": "Extracted from CLAUDE.md — 2-3 sentence summary of project's guiding principles"
}
```

### Generation (Phase 0)

On first `/scout` run or `/scout init`, generate fingerprint using zero-token tool calls:

1. `git rev-parse HEAD` → git_hash
2. `find . -type f | head -1000 | awk -F. '{print $NF}' | sort | uniq -c | sort -rn` → language distribution
3. Parse `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, etc. → dependencies
4. `find . -type d -maxdepth 1` → top-level dirs
5. `ls .claude/skills/*/SKILL.md 2>/dev/null` → skills inventory
6. `ls .claude/agents/*.md 2>/dev/null` → agents inventory
7. Read first 50 lines of CLAUDE.md → philosophy summary (LLM summarizes, ~500 tokens)
8. Read first 10 lines of README.md → project name/description

Total LLM cost for generation: ~3K tokens (only the philosophy summary needs LLM).

### Refresh Strategy (git hash based)

```bash
LAST_HASH=$(jq -r '.git_hash' .scout/fingerprint.json 2>/dev/null)
CURRENT_HASH=$(git rev-parse HEAD)
```

| Condition | Action | Token Cost |
|-----------|--------|-----------|
| Same hash | Use cached fingerprint | 0 |
| Different hash, < 20 changed files | Patch fingerprint (update changed sections only) | ~500 |
| Different hash, >= 20 changed files | Full regeneration | ~3K |
| No fingerprint file | Full generation | ~3K |

Patch logic: `git diff --name-only $LAST_HASH $CURRENT_HASH` to identify what changed:
- `package.json` / `requirements.txt` changed → regenerate dependencies section
- Files added/removed → update structure section
- `CLAUDE.md` changed → regenerate philosophy summary
- Other files → update language distribution counts only

## Workflow

### Pre-flight Guards

#### Guard 1: URL Validity (GATE)
Validate URL syntax (`^https?://`). Invalid → abort.

#### Guard 2: Duplicate Scout (WARN)
Search existing issues for prior scout reports on same URL domain:
```bash
DOMAIN=$(echo "$URL" | sed 's|https\?://||' | cut -d'/' -f1)
gh issue list --state all --label "scout:internalize,scout:integrate,scout:skip" \
  --json number,title,body --jq ".[] | select(.body | contains(\"$DOMAIN\"))"
```
If found → warn, ask to proceed.

### Phase 0: Ensure Fingerprint

1. Check if `.scout/fingerprint.json` exists
2. If not → generate (see Generation section above)
3. If exists → check git hash for staleness (see Refresh Strategy)
4. Load fingerprint into context (~1K tokens)

### Phase 1: Fetch & Summarize

1. `WebFetch(url)` — retrieve page content
2. Extract: title, purpose, key technology, approach
3. If fetch fails → abort with error

### Phase 2: Load Project Context

1. Read `.scout/fingerprint.json` (generated/refreshed in Phase 0)
2. Read CLAUDE.md first 100 lines (if exists) for detailed philosophy
3. Total context: ~3K tokens

### Phase 3: Fit Analysis

Agent analyzes the external content against project context:

**Analysis dimensions:**

| Dimension | Question |
|-----------|----------|
| Project alignment | Does it match the project's philosophy and goals? |
| Technical fit | Does it complement or overlap with existing tech stack/dependencies? |
| Integration effort | How much work to adopt? (XS/S/M/L) |
| Value proposition | What concrete benefit does it bring? |

**Output:** Structured verdict with rationale.

### Phase 4: Issue Creation

1. Ensure scout labels exist (idempotent):
```bash
gh label create "scout:internalize" --color "0E8A16" --description "Scout: should be internalized" 2>/dev/null || true
gh label create "scout:integrate" --color "1D76DB" --description "Scout: keep as external" 2>/dev/null || true
gh label create "scout:skip" --color "D4C5F9" --description "Scout: skip" 2>/dev/null || true
```

2. Create issue in current project's repo (gh auto-detects repo from cwd):
```bash
gh issue create --title "[scout:{verdict}] {title}" --label "scout:{verdict},P{n}" --body "{body}"
```

3. If SKIP → auto-close the issue.

### Issue Body Template

```markdown
## Scout Report: {title}

**Source**: {url}
**Verdict**: {INTERNALIZE / INTEGRATE / SKIP}
**Priority**: {P1 / P2 / P3}

## Summary
{2-3 sentence summary}

## Project Alignment
| Criterion | Fit | Rationale |
|-----------|-----|-----------|
| Philosophy alignment | ✓/✗ | {explanation} |
| Technical fit | ✓/✗ | {explanation} |
| Existing overlap | ✓/✗ | {overlapping tools/deps} |
| Integration effort | XS/S/M/L | {explanation} |

## Recommendation
{Specific adoption plan or skip reason}

## Next Steps
- [ ] {action 1}
- [ ] {action 2}

---
Generated by `/scout`
```

## Escalation

When verdict is INTERNALIZE and integration effort is M or L:
```
[Advisory] Deep analysis recommended for this integration.
```

## Display Format

```
[Scout] {url}
├── Phase 0: Project Fingerprint (cached/refreshed)
├── Phase 1: Fetch & Summarize
├── Phase 2: Load Project Context
├── Phase 3: Fit Analysis
└── Phase 4: Issue Creation

Execute? [Y/n]
```

## Result Display

```
[Scout Complete] {title}
├── Verdict: {INTERNALIZE / INTEGRATE / SKIP}
├── Priority: {P1 / P2 / P3}
├── Issue: #{number}
└── Fingerprint: cached (hash abc1234)
```

## File Structure (baekenough-skills)

```
scout/
├── SKILL.md        # Main skill (fingerprint + workflow + issue creation)
├── README.md       # English docs
└── README_ko.md    # Korean docs
```

## Differences from oh-my-customcode Version

| Aspect | omcustom version | Standalone version |
|--------|-----------------|-------------------|
| Project context | Hardcoded oh-my-customcode philosophy | Dynamic fingerprint from any project |
| Issue target | oh-my-customcode repo | Current project repo (gh auto-detects) |
| Rule references | R006, R009, R010, R015 | Removed |
| Codebase analysis | CLAUDE.md + README only | Fingerprint (file tree, deps, tech stack, skills) |
| Token efficiency | ~2K per run | ~1K cached, ~3K on regeneration |
| Analysis dimensions | Compilation metaphor, R006, dynamic agents | Generic: alignment, tech fit, effort, value |

## Design Decisions

1. **Project Fingerprint over full scan** — ~1K tokens vs 50K+ for large projects
2. **Git hash based refresh** — No time-based expiry, refresh only when code changes
3. **Delta patching** — < 20 file changes patch fingerprint sections, not full regen
4. **Zero-token collection** — Bash/Glob/Grep for data, LLM only for philosophy summary
5. **Same labels** — `scout:internalize/integrate/skip` kept from omcustom version
6. **gh auto-detect repo** — No repo configuration needed, works in any git project

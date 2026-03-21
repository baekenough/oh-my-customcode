---
name: scout
description: Analyze external URL to evaluate fit with oh-my-customcode project and auto-create GitHub issue with verdict
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<url>"
---

# /scout — External Link Analysis

Analyze an external URL (tech blog, tool, library, methodology) to evaluate its fit with the oh-my-customcode project and auto-create a GitHub issue with a structured verdict.

## Usage

```
/scout <url>
/scout https://news.hada.io/topic?id=27673
/scout https://github.com/user/repo
```

## Verdict Taxonomy

| Verdict | Meaning | Label | Follow-up |
|---------|---------|-------|-----------|
| **INTERNALIZE** | Aligns with project philosophy; should become a skill/agent/guide | `scout:internalize` + `P1`/`P2`/`P3` | `/research` or direct implementation |
| **INTEGRATE** | Useful but best kept as external dependency | `scout:integrate` + `P2`/`P3` | Plugin/MCP integration review |
| **SKIP** | Irrelevant or duplicates existing functionality | `scout:skip` | Issue created then closed |

## Pre-flight Guards

### Guard 1: URL Validity (GATE)

Before any work, validate the URL:

```bash
# Check URL is syntactically valid
echo "$URL" | grep -qE '^https?://'
```

If invalid: `[Pre-flight] GATE: Invalid or unreachable URL. Please check and retry.` — abort.

### Guard 2: Duplicate Scout (WARN)

Search existing GitHub issues for prior scout reports on the same URL domain:

```bash
DOMAIN=$(echo "$URL" | sed 's|https\?://||' | cut -d'/' -f1)
gh issue list --state all --label "scout:internalize,scout:integrate,scout:skip" \
  --json number,title,body --jq ".[] | select(.body | contains(\"$DOMAIN\"))" 2>/dev/null
```

If found: `[Pre-flight] WARN: Similar URL already scouted in issue #N. Proceed anyway? [Y/n]`

## Display Format

Before execution, show the plan:

```
[Scout] {url}
├── Phase 1: Fetch & Summarize
├── Phase 2: Load Project Philosophy
├── Phase 3: Fit Analysis (sonnet)
└── Phase 4: Issue Creation

Estimated: ~1 min | Cost: ~$0.5-1.5
Execute? [Y/n]
```

## Workflow

### Phase 1: Fetch & Summarize

1. `WebFetch(url)` — retrieve page content
2. Extract core information:
   - Title and purpose
   - Key technology / methodology
   - Approach and principles
3. If fetch fails — report error, abort

### Phase 2: Load Project Philosophy

1. `Read(CLAUDE.md)` — extract architecture philosophy:
   - Compilation metaphor (source -> build -> artifact)
   - Separation of concerns (R006)
   - Dynamic agent creation ("no expert? create one")
   - Skill/agent/guide/rule structure
2. `Read(README.md)` — extract project overview and component inventory
3. `Glob(.claude/skills/*/SKILL.md)` — list existing skills for overlap detection

### Phase 3: Fit Analysis

Spawn 1 sonnet agent with the following analysis prompt.

**Inputs**:
- Fetched content summary (Phase 1)
- Project philosophy context (Phase 2)
- Existing skill list (Phase 2)

**Analysis dimensions**:

| Dimension | Question |
|-----------|----------|
| Philosophy alignment | Does it match the compilation metaphor, separation of concerns, "create experts on demand"? |
| Technical fit | Does it complement or overlap with existing skills/agents/guides? |
| Integration effort | How much work to internalize vs. use externally? |
| Value proposition | What concrete benefit does it bring to the project? |

**Agent prompt template**:

```
You are a project fit analyst. Given:

1. External content summary:
{phase1_summary}

2. Project philosophy:
{phase2_philosophy}

3. Existing skills ({skill_count} total):
{skill_list}

Analyze the external content against the project philosophy across 4 dimensions:
- Philosophy alignment
- Technical fit (overlap with existing skills?)
- Integration effort (XS/S/M/L)
- Value proposition

Return a structured verdict:
- verdict: INTERNALIZE | INTEGRATE | SKIP
- priority: P1 | P2 | P3
- rationale: 2-3 sentences
- philosophy_table: criterion/fit/rationale for each dimension
- recommendation: specific integration plan or skip reason
- next_steps: 2-3 actionable items
- escalation: true/false (INTERNALIZE + M/L effort = true)
```

**Output**: Structured verdict with rationale.

### Phase 4: Issue Creation

1. Ensure scout labels exist (defensive, idempotent):
```bash
gh label create "scout:internalize" --color "0E8A16" --description "Scout: should be internalized" 2>/dev/null || true
gh label create "scout:integrate" --color "1D76DB" --description "Scout: keep as external" 2>/dev/null || true
gh label create "scout:skip" --color "D4C5F9" --description "Scout: skip" 2>/dev/null || true
```

2. Create GitHub issue:
```bash
gh issue create \
  --title "[scout:{verdict}] {content_title}" \
  --label "scout:{verdict},P{n}" \
  --body "{issue_body}"
```

3. If verdict is `SKIP`: auto-close the issue:
```bash
gh issue close {number} -c "Auto-closed: scout verdict is SKIP"
```

### Issue Body Template

```markdown
## Scout Report: {title}

**Source**: {url}
**Verdict**: {INTERNALIZE / INTEGRATE / SKIP}
**Priority**: {P1 / P2 / P3}

## Summary
{2-3 sentence summary of the external content}

## Philosophy Alignment
| Criterion | Fit | Rationale |
|-----------|-----|-----------|
| Compilation metaphor | {check/cross} | {explanation} |
| Separation of concerns (R006) | {check/cross} | {explanation} |
| Dynamic agent creation | {check/cross} | {explanation} |
| Existing skill overlap | {check/cross} | {overlapping skills list} |

## Recommendation
{Specific integration plan — which skill/agent/guide to create, or why to skip}

## Next Steps
- [ ] {follow-up action 1}
- [ ] {follow-up action 2}

---
Generated by `/scout`
```

## Escalation

When verdict is `INTERNALIZE` and integration effort is M or L:

```
[Advisory] Deep analysis recommended.
└── Consider running: /research {url}
```

## Result Display

```
[Scout Complete] {title}
├── Verdict: {INTERNALIZE / INTEGRATE / SKIP}
├── Priority: {P1 / P2 / P3}
├── Issue: #{number}
└── Escalation: {/research recommended | none}
```

## Model Selection

| Phase | Model | Rationale |
|-------|-------|-----------|
| Phase 1 (Fetch) | orchestrator | Simple WebFetch, no agent needed |
| Phase 2 (Load) | orchestrator | Simple Read/Glob, no agent needed |
| Phase 3 (Analysis) | sonnet | Balanced reasoning for fit analysis |
| Phase 4 (Issue) | orchestrator | gh issue create via Bash |

## Integration

| Rule | How |
|------|-----|
| R009 | Single agent in Phase 3 — no parallelism needed |
| R010 | Orchestrator manages phases 1/2/4; analysis delegated to sonnet agent in Phase 3 |
| R015 | Display scout plan before execution (Display Format section) |

## When NOT to Use

| Scenario | Better Alternative |
|----------|--------------------|
| Deep multi-source research | `/research <url>` |
| Internal project analysis | `/omcustom:analysis` |
| Known tool evaluation | Direct agent conversation |
| Bulk URL analysis (5+) | `/research` with URL list |

## Differences from /research

| Aspect | /scout | /research |
|--------|--------|-----------|
| Purpose | Quick fit evaluation | Deep multi-dimensional analysis |
| Teams | 1 agent | 10 teams |
| Cost | ~$0.5-1.5 | ~$8-15 |
| Duration | 1-2 min | 10-20 min |
| Output | Issue with verdict | Full report with ADOPT/ADAPT/AVOID |
| When | First contact with new link | Deep dive after scout recommends |

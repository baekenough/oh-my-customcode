---
name: professor-triage
description: Analyze GitHub issues against current codebase and perform automated triage with priority assessment
scope: harness
version: 2.1.0
user-invocable: true
effort: high
context: fork
argument-hint: "[issue-numbers...] [--label <label>] [--state <state>] [--since <date>]"
---

# /professor-triage — Codebase-Driven Issue Triage

## Purpose

Analyzes GitHub issues directly against the current codebase. For each issue, searches relevant code, assesses impact and blast radius, determines whether the issue has already been resolved, and performs automated triage with priority and size estimation. Produces a cross-analysis report and executes low-risk triage actions automatically.

## Usage

```
/professor-triage                          # Default: --state open (excludes verify-done)
/professor-triage 587 589 590 591 592      # Direct issue numbers
/professor-triage --label codex-release    # Custom label filter
/professor-triage --since 2026-03-20       # Date filter
```

## Workflow

### Phase 1: Gather

1. Parse arguments to determine target issues:
   - If issue numbers provided: use those directly
   - If `--label` provided: `gh issue list --label <label> --state <state> --json number`
   - Default: `gh issue list --state open --json number` + exclude issues with `verify-done` label
   - If `--since` provided: add `--search "created:>YYYY-MM-DD"` filter

2. For each issue, fetch full details:
```bash
gh issue view NNN --json number,title,body,comments,labels,createdAt
```

3. For batches >20 issues, prefer `gh api graphql` for batch fetching to respect GitHub API rate limits (5000/hour authenticated).

4. If filter returns 0 results: if `--label` was used, check label existence via `gh label list`. Report if label missing. If default filter, report "No open issues without verify-done label found."

### Phase 2: Codebase Analysis

For each issue, perform direct codebase analysis:

**2A: Context Extraction** — From issue title and body, extract:
- File paths mentioned (regex: backtick-wrapped paths, `:\d+` line refs, `(L\d+)`, `(lines \d+-\d+)`)
- Error messages or stack traces
- Keywords (function names, class names, config keys, module names)
- Component areas mentioned (e.g., "auth", "CI", "hooks")

**2B: Codebase Search** — Delegate to Explore agent(s):
- Search for extracted keywords using Grep across the codebase
- Find related files using Glob patterns derived from keywords
- For explicitly mentioned files, verify existence and read relevant sections
- For error messages, trace to source location
- Map import/dependency relationships for affected files

**2C: Impact Assessment** — For each relevant file found:
- Read current state of the code
- Check recent changes: `git log --since=<issue_created_date> --oneline -- <file>`
- Determine if the issue has already been addressed by recent commits
- Assess blast radius (what depends on this code, what does this code depend on)

**2D: Structured Finding** — Produce per-issue analysis:

| Field | Content |
|-------|---------|
| Affected files | List with status: `exists` ✅ / `missing` ❌ / `changed-since-issue` ⚠️ |
| Architecture impact | Breaking changes, dependency effects, scope of change |
| Implementation path | Concrete steps with file:line references from current codebase |
| Risk level | P1 (critical/security/breaking) / P2 (moderate/compat) / P3 (nice-to-have) |
| Size estimate | XS (<1h) / S (1-3h) / M (3-8h) / L (1-3d) / XL (>3d) |
| Already resolved? | Yes / No / Partial — with git evidence (commit hash, PR number) |

**Parallelization (R009/R018):**
- 1-3 issues → single Explore agent per issue (parallel per R009)
- 4-10 issues → parallel Explore agents, max 4 concurrent (R009)
- 10+ issues or 3+ Explore agents needed → Agent Teams per R018

**Delegation**: All codebase search delegated to Explore agent(s) with `model: haiku`. Orchestrator collects and synthesizes results.

### Phase 3: Cross-Analyze

**R010 note**: This is a read-only analytical step — no file writes. Per R010 exception, the orchestrator may perform this directly. For batches >15 issues, delegate to a dedicated cross-analysis agent with model: opus.

Perform deep cross-analysis with full context from all issues:

1. **Common patterns** — Identify findings that appear across multiple issues (e.g., same file referenced, same recommendation theme)
2. **Duplicate/merge candidates** — Detect issues tracking the same underlying change:
   - Same release series (e.g., alpha.3/5/6)
   - Same upstream dependency
   - Same affected component
3. **Conflicting findings** — Where findings disagree across issues, resolve based on:
   - Codebase evidence (Phase 2 results)
   - Specificity (concrete code-level finding > abstract observation)
   - Recency (newer findings > older ones)
4. **Priority matrix** — Unified priority ranking:
   - P1: Breaking changes, security issues, blocking bugs
   - P2: Documentation gaps, compatibility updates, medium-risk items
   - P3: Nice-to-have improvements, future considerations
5. **Action determination** — Per-issue decision:
   - `Close (Already Resolved)`: Phase 2 found issue already fixed by recent commits
   - `Close (Not Applicable)`: Issue is irrelevant (internal dependency tag, no impact)
   - `Close (Duplicate of #NNN)`: Superseded by another issue in the batch
   - `Open — action required`: Real work needed
   - `Open — monitoring`: Waiting for external trigger (e.g., stable release)
   - `New issue needed`: Cross-analysis discovered issue not yet tracked

### Phase 4: Multi-Perspective Analysis & Output

For each analyzed issue, generate multi-perspective analysis comments and artifacts.

**Parallelization (R009):**
- Phase 4A + 4B: parallel (independent perspectives)
- Phase 4C: after 4A + 4B complete (synthesis requires both inputs)
- Phase 4D + 4E: parallel (independent outputs, both depend on 4C)
- Phase 4F: after all above (verification gate)

**4A: 🏛️ Senior Architect Analysis** — Delegate to arch-documenter (model: sonnet) to post GitHub comment:

```
## 🏛️ Senior Architect Analysis

### Architecture Impact
| Component | Impact | Risk |
|-----------|--------|------|
| {component} | {description} | {High/Medium/Low} |

### Code-Level Analysis
{Specific file:line references from Phase 2 codebase analysis}

### Strategic Assessment
- **Feasibility**: {assessment with evidence}
- **Priority recommendation**: {P1/P2/P3 with rationale}

### Risk & Considerations
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| {risk} | {High/Medium/Low} | {mitigation} |

**Estimated effort**: {XS/S/M/L/XL}

---
_🏛️ Senior Architect perspective — `/professor-triage` v2.1.0_
```

**4B: 🤝 Project Colleague Review** — Delegate to arch-documenter (model: sonnet) to post GitHub comment:

```
## 🤝 Project Colleague Review

### Implementation Ideas
{Concrete code locations and change suggestions with file:line references}

### Easy-to-Miss Details
- {Name collisions, validation bypasses, race conditions, edge cases}

### Suggested Next Steps
1. {Actionable step with specific file/function reference}
2. {Actionable step}
3. {Actionable step}

---
_🤝 Project Colleague perspective — `/professor-triage` v2.1.0_
```

Note: Do NOT include a "First Impressions" (첫인상) section in the Colleague Review — this was explicitly excluded per user feedback.

**4C: 🎓 Professor Synthesis** — Delegate to arch-documenter (model: opus) to post GitHub comment. This phase requires 4A and 4B results as input:

```
## 🎓 Professor Synthesis

### Codebase Verification
| Claim (from Architect/Colleague) | Verified | Evidence |
|----------------------------------|----------|----------|
| {claim} | ✅/⚠️/❌ | {file:line or git evidence} |

### Consensus & Divergence
| Topic | Architect | Colleague | Verdict |
|-------|-----------|-----------|---------|
| {topic} | {position} | {position} | {synthesized judgment} |

### Priority Matrix
| Dimension | Assessment |
|-----------|-----------|
| Urgency | {High/Medium/Low} |
| Importance | {High/Medium/Low} |
| Size | {XS/S/M/L/XL} |
| Recommended order | {N of M in batch} |

### Missed Perspectives
{Considerations neither Architect nor Colleague raised}

### Execution Roadmap
| Phase | Task | Files | Depends on |
|-------|------|-------|-----------|
| 1 | {task} | {files} | — |
| 2 | {task} | {files} | Phase 1 |

### Final Conclusion
{2-3 sentence synthesis with definitive recommendation}

---
_🎓 Professor Synthesis — `/professor-triage` v2.1.0_
```

**4D: Issue Triage Comment (MANDATORY)** — Every analyzed issue MUST receive a triage comment. This is not optional — even for issues created in the same session or with existing analysis. Skipping comments breaks the triage audit trail. Delegate to mgr-gitnerd to post on each analyzed issue:

```
## 🔬 Professor Triage — Codebase Analysis Result

**Decision**: {Close (Already Resolved) | Close (Not Applicable) | Close (Duplicate of #NNN) | Open — action required | Open — monitoring}
**Rationale**: {1-2 line summary based on codebase findings}
**Affected files**: {N} analyzed — {N}✅ {N}⚠️ {N}❌
**Risk**: {P1/P2/P3} | **Size**: {XS/S/M/L/XL}
**Full report**: {artifact path}

---
_Analyzed by `/professor-triage` v2.1.0 against current codebase with {N} related issues_
```

**4E: Artifact Report** — Delegate to arch-documenter to write:

Path: `.claude/outputs/sessions/YYYY-MM-DD/professor-triage-HHmmss.md`

Timestamps use local machine time (consistent with other artifact skills).

Template:
```
# Professor Triage Report — YYYY-MM-DD

## Analysis Target
| # | Title | Labels | Created |
|---|-------|--------|---------|

## Per-Issue Analysis
### #NNN — title
- **Affected files**: N analyzed — N✅ N⚠️ N❌
- **Architecture impact**: ...
- **Implementation path**: ...
- **Risk/Priority**: P1/P2/P3
- **Size**: XS/S/M/L/XL
- **Already resolved?**: Yes/No/Partial — evidence
- **Recommended action**: ...

## Cross-Analysis
### Common Patterns
### Duplicate/Merge Candidates
### Conflicting Findings Resolution
### Priority Matrix

## Multi-Perspective Summary
### Architect Highlights
### Colleague Highlights
### Professor Synthesis Key Points

## Executed Actions
| Issue | Action | Status |

## Pending Actions (Confirmation Required)
```

### Phase 4F: Comment Verification Gate

Before proceeding to Phase 5, verify ALL analyzed issues received the full set of comments (Architect + Colleague + Professor Synthesis + Triage):
```bash
# For each issue NNN in the batch:
gh issue view NNN --json comments --jq '.comments | map(select(.body | contains("Professor Triage"))) | length'
# Must be >= 1 for every issue. If any is 0, go back and post.

# Also verify multi-perspective comments:
gh issue view NNN --json comments --jq '.comments | map(select(.body | contains("Senior Architect"))) | length'
gh issue view NNN --json comments --jq '.comments | map(select(.body | contains("Project Colleague"))) | length'
gh issue view NNN --json comments --jq '.comments | map(select(.body | contains("Professor Synthesis"))) | length'
# All must be >= 1. If any is 0, the corresponding Phase 4A/4B/4C was skipped — go back and post.
```

### Phase 5: Act

Delegate ALL GitHub operations to mgr-gitnerd.

**Automatic (low-risk, reversible):**

| Condition | Action |
|-----------|--------|
| Phase 2 found issue already resolved (with commit evidence) | `gh issue close --reason "completed"` + comment with resolving commit |
| Cross-analysis concludes "Not Applicable" / "no action needed" | `gh issue close --reason "not planned"` |
| Cross-analysis detects same-series duplicates | Keep latest, close others + `duplicate` label |
| All analysis complete | Add `verify-done` label |
| Priority assigned | Add `P1`/`P2`/`P3` label |

**Confirmation required (high-risk):**

Present to user and wait for approval before executing:

| Condition | Action | Reason |
|-----------|--------|--------|
| Reopen a closed issue | Propose reopen | Unintended notifications |
| New issue creation needed | Present draft title/body | Noise prevention |
| Epic/milestone linking | Propose link | Project structure change |
| Issue body modification | Present edit draft | Respect original author intent |

**Ensure `verify-done` label exists**: If not, create with `gh label create "verify-done" --color "0E8A16"`.

## Notes

- Phase 1: Orchestrator fetches issues directly (no agent needed)
- Phase 2: Explore agents with `model: haiku` for codebase search; orchestrator synthesizes findings
- Phase 3: Orchestrator directly (read-only, R010 exception); opus agent for >15 issues
- Phase 4A/4B: `arch-documenter` (sonnet) for Architect/Colleague analysis comments (parallel)
- Phase 4C: `arch-documenter` (opus) for Professor Synthesis comment (requires 4A+4B)
- Phase 4D: `mgr-gitnerd` for triage comment; Phase 4E: `arch-documenter` for artifact report (parallel)
- Phase 4F: Verification gate for all 4 comment types
- Phase 5: `mgr-gitnerd` for all GitHub operations
- No external dependencies (omc_issue_analyzer removed in v2.0.0, multi-perspective analysis restored in v2.1.0)

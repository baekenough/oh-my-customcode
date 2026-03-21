---
name: professor-triage
description: Cross-analyze GitHub issues with omc_issue_analyzer comments, verify against codebase, and perform automated triage
scope: harness
version: 1.0.0
user-invocable: true
effort: high
context: fork
argument-hint: "[issue-numbers...] [--label <label>] [--state <state>] [--since <date>]"
---

# /professor-triage — Cross-Analysis Issue Triage

## Purpose

Cross-analyzes GitHub issues containing `omc_issue_analyzer` comments (Architect, Colleague, Professor analyses). Verifies claims against the current codebase, produces a cross-analysis report, and performs automated triage actions.

## Usage

```
/professor-triage                          # Default: --label professor --state open
/professor-triage 587 589 590 591 592      # Direct issue numbers
/professor-triage --label codex-release    # Custom label filter
/professor-triage --since 2026-03-20       # Date filter
```

## Workflow

### Phase 1: Gather

1. Parse arguments to determine target issues:
   - If issue numbers provided: use those directly
   - If `--label` provided: `gh issue list --label <label> --state <state> --json number`
   - Default: `gh issue list --label professor --state open --json number`
   - If `--since` provided: add `--search "created:>YYYY-MM-DD"` filter

2. For each issue, fetch full details:
```bash
gh issue view NNN --json number,title,body,comments,labels,createdAt
```

3. For batches >20 issues, prefer `gh api graphql` for batch fetching to respect GitHub API rate limits (5000/hour authenticated).

4. If `--label` returns 0 results, check label existence via `gh label list`. Report if label missing.

### Phase 2: Parse

Extract structured data from omc_issue_analyzer comments by matching these headers:

| Header | Section |
|--------|---------|
| `## 🏛️ Senior Architect Analysis` | Architecture impact, code-level analysis, strategy, risk assessment |
| `## 🤝 Project Colleague Review` | Implementation ideas, blind spots, next steps |
| `## 🎓 Professor Synthesis` | Verification results, consensus, disagreements, priority matrix, missed perspectives, roadmap |

For each issue, extract:
- **File paths and line references** mentioned in any analysis (regex: backtick-wrapped paths, `(L\d+)`, `(lines \d+-\d+)`, `:\d+` suffixes)
- **Priority/size assessments** from Professor synthesis
- **Recommended actions** from all three analyses
- **Risk levels** and breaking change assessments
- **Consensus points** where all 3 analyses agree
- **Disagreement points** where analyses differ

If an issue has no omc_issue_analyzer comments (no matching headers), skip with warning and include in report as "no analysis available".

### Phase 3: Verify

Verify ALL file paths and line references extracted in Phase 2 against the current codebase.

**Verification levels:**

| Level | Check | Tool |
|-------|-------|------|
| Existence | File currently exists | Glob |
| Content | Referenced line contains expected code | Read |
| Freshness | Changed since comment was written | `git log --since=<comment_date> -- <file>` |

**Result classification:**

| Status | Meaning | Marker |
|--------|---------|--------|
| `verified` | File exists + content matches | ✅ |
| `stale-still-valid` | File changed but recommendation still applies | ⚠️ |
| `stale-invalidated` | File changed and recommendation is moot | ⚠️❌ |
| `missing` | File/path not found | ❌ |
| `unchecked` | No specific path to verify | ➖ |

**No limits**: All mentioned file paths are verified exhaustively. Quality over token cost.

**Shared verification**: If the same file is mentioned across multiple issues, verify once and share the result.

**Parallelization (R009/R018):**
- ≤20 unique file references → single Explore agent
- 21-80 file references → 2-4 parallel Explore agents (R009)
- 80+ file references or 3+ verification agents needed → Agent Teams per R018

**Delegation**: Delegate verification to Explore agent(s). Orchestrator collects results.

### Phase 4: Cross-Analyze

**R010 note**: This is a read-only analytical step — no file writes. Per R010 exception, the orchestrator may perform this directly. For batches >15 issues, delegate to a dedicated cross-analysis agent with model: opus.

Perform deep cross-analysis with full context from all issues:

1. **Common patterns** — Identify findings that appear across multiple issues (e.g., same file referenced, same recommendation theme)
2. **Duplicate/merge candidates** — Detect issues tracking the same underlying change:
   - Same release series (e.g., alpha.3/5/6)
   - Same upstream dependency
   - Same affected component
3. **Conflicting recommendations** — Where analyses disagree across issues, resolve based on:
   - Codebase verification evidence (Phase 3 results)
   - Specificity (concrete code-level analysis > abstract strategy)
   - Recency (newer analyses > older ones)
4. **Priority matrix** — Unified priority ranking:
   - P1: Breaking changes, security issues, blocking bugs
   - P2: Documentation gaps, compatibility updates, medium-risk items
   - P3: Nice-to-have improvements, future considerations
5. **Action determination** — Per-issue decision:
   - `Close (Not Applicable)`: Issue is irrelevant (internal dependency tag, no impact)
   - `Close (Duplicate of #NNN)`: Superseded by another issue in the batch
   - `Open — action required`: Real work needed
   - `Open — monitoring`: Waiting for external trigger (e.g., stable release)
   - `New issue needed`: Cross-analysis discovered issue not yet tracked

### Phase 5: Output

**5A: Artifact report** — Delegate to arch-documenter to write:

Path: `.claude/outputs/sessions/YYYY-MM-DD/professor-triage-HHmmss.md`

Timestamps use local machine time (consistent with other artifact skills).

Template:
```
# Professor Triage Report — YYYY-MM-DD

## Analysis Target
| # | Title | Labels | Analysis Comments |
|---|-------|--------|-------------------|

## Per-Issue Summary
### #NNN — title
- Core conclusion:
- Verification status: N✅ N⚠️ N❌
- Recommended action:

## Cross-Analysis
### Common Patterns
### Duplicate/Merge Candidates
### Conflicting Recommendations Resolution
### Priority Matrix

## Executed Actions
| Issue | Action | Status |

## Pending Actions (Confirmation Required)
```

**5B: Issue comments** — Delegate to mgr-gitnerd to post on each analyzed issue:

```
## 🔬 Professor Triage — Cross-Analysis Result

**Decision**: {Close (Not Applicable) | Close (Duplicate of #NNN) | Open — action required}
**Rationale**: {1-2 line summary}
**Verification**: {N}✅ {N}⚠️ {N}❌
**Full report**: {artifact path}

---
_Cross-analyzed by `/professor-triage` with {N} related issues_
```

### Phase 6: Act

Delegate ALL GitHub operations to mgr-gitnerd.

**Automatic (low-risk, reversible):**

| Condition | Action |
|-----------|--------|
| Professor synthesis concludes "Not Applicable" / "no action needed" | `gh issue close --reason "not planned"` |
| Cross-analysis detects same-series duplicates | Keep latest, close others + `duplicate` label |
| All analysis complete | Add `verify-done` label |
| Professor synthesis assigns priority | Add `P1`/`P2`/`P3` label |

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

- Phase 2 agents: not needed (orchestrator parses text directly)
- Phase 3 agents: `Explore` with `model: haiku` for file verification
- Phase 4: orchestrator directly (read-only, R010 exception)
- Phase 5: `arch-documenter` for artifact, `mgr-gitnerd` for comments
- Phase 6: `mgr-gitnerd` for all GitHub ops

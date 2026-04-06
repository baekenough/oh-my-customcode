# Agora Skill Internalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Internalize agora skill from baekenough-skills into oh-my-customcode as /omcustom:agora (v0.76.1)

**Architecture:** Direct skill copy with source frontmatter tracking, following the established pipeline/scout internalization pattern.

**Tech Stack:** Markdown, YAML frontmatter, bun (build/lockfile)

---

## Task 1: Create agora skill directory

**Files:**
- CREATE: `.claude/skills/agora/SKILL.md`
- CREATE: `templates/.claude/skills/agora/SKILL.md`

Both files have identical content. The content is the original `../baekenough-skills/agora/SKILL.md` with the `source:` frontmatter block already included in the frontmatter.

- [ ] Create directory `.claude/skills/agora/`
- [ ] Create directory `templates/.claude/skills/agora/`
- [ ] Write `.claude/skills/agora/SKILL.md` with the full content below
- [ ] Write `templates/.claude/skills/agora/SKILL.md` with identical content
- [ ] Verify both files are identical: `diff .claude/skills/agora/SKILL.md templates/.claude/skills/agora/SKILL.md`

### Full SKILL.md content (write verbatim to both paths):

````markdown
---
name: agora
description: "Multi-LLM adversarial consensus loop — 3+ LLMs compete to find flaws in designs/specs until unanimous agreement is reached"
user-invocable: true
argument-hint: "<document-path> [--rounds N] [--severity-threshold HIGH]"
effort: max
scope: core
version: 1.0.0
source:
  type: external
  origin: github
  url: https://github.com/baekenough/baekenough-skills
  version: 1.0.0
---

# Agora: Multi-LLM Adversarial Consensus

3개 이상의 LLM(Claude, Codex/GPT, Gemini)이 경쟁적으로 설계/문서의 결함을 찾고, 만장일치 합의에 도달할 때까지 반복하는 적대적 교차 검증 스킬.

## Prerequisites

- `codex-exec` skill (Codex/GPT 호출)
- `gemini-exec` skill (Gemini 호출)
- Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) or Agent tool available

## Usage

```
/agora docs/design.md                          # Default: 3 LLMs, unlimited rounds
/agora docs/design.md --rounds 10              # Max 10 rounds
/agora docs/design.md --severity-threshold HIGH # Exit when no HIGH+ findings
/agora docs/design.md --models claude,codex     # 2 LLMs only
```

## Workflow

### Phase 1: Setup
1. Read the target document
2. Create Agent Team: `TeamCreate("agora-review")`
3. Create review tasks per focus area

### Phase 2: Spawn Reviewers (parallel)
Spawn 3 reviewers as Agent Team members:

```
Agent(name: "claude-critic", model: opus, effort: max)
  → 20-point deep adversarial review
  
Agent(name: "codex-critic", model: opus)
  → Invoke Skill(codex-exec) for GPT perspective + independent Claude analysis
  
Agent(name: "gemini-critic", model: opus)  
  → Invoke Skill(gemini-exec) for Gemini perspective + independent Claude analysis
```

### Phase 3: Independent Review
Each reviewer performs adversarial review with this template:

```
For EACH review point:
### Round N: [Topic]
**Severity**: CRITICAL / HIGH / MEDIUM / LOW
**Flaw**: [Specific, concrete problem description]
**Evidence**: [Why this is real, not theoretical]
**Impact**: [What happens if not addressed]
**Counter-argument**: [Best case FOR the current design]
**Verdict**: KEEP / MODIFY / REJECT
```

Review areas (adapt to document type):
- Architecture fundamentals
- Component/service design
- Data architecture
- Security & resilience
- Feasibility & deployment
- Testing strategy
- Operational complexity

### Phase 4: Cross-Review (Peer-to-Peer)
Each reviewer sends findings to the other two via `SendMessage`.

Counter-review template:
1. Which findings do you **AGREE** with? (and why)
2. Which findings do you **DISAGREE** with? (evidence-based rebuttal)
3. What did they **MISS** that you caught?
4. What did they catch that you **MISSED**?
5. **SEVERITY** adjustments — upgrade or downgrade with justification

### Phase 5: Synthesis
Team lead aggregates all findings:

```
UNANIMOUS CRITICAL: [findings all 3 agreed on]
STRONG AGREEMENT:   [findings 2/3 agreed on]
SPLIT DECISIONS:    [findings with disagreement + resolution]
```

Determine verdict:
- **BUILD**: No CRITICAL, no unresolved HIGH
- **BUILD WITH CHANGES**: No CRITICAL, HIGH findings have accepted mitigations
- **REDESIGN**: Any unresolved CRITICAL findings
- **ABANDON**: Fundamental concept is flawed

### Phase 6: Loop (if REDESIGN)
1. Team lead produces/delegates redesign addressing ALL critical findings
2. New version sent to ALL reviewers: `SendMessage(to: "*")`
3. Reviewers re-review → GOTO Phase 4
4. Repeat until EXIT criteria met

### Phase 7: Exit (consensus reached)
When ALL reviewers agree BUILD or BUILD WITH CHANGES:
1. Produce final consensus report
2. Write to `.claude/outputs/sessions/{date}/agora-{topic}-{time}.md`
3. Shut down team: `SendMessage(to: "*", message: {type: "shutdown_request"})`

## Reviewer Principles

1. **NEUTRAL** — no reviewer has home team advantage
2. **COMPETITIVE** — find flaws others missed
3. **CRITICAL** — "fewer than 5 CRITICAL flaws = not looking hard enough"
4. **EVIDENCE-BASED** — every finding cites specific evidence
5. **CONSTRUCTIVE** — every flaw includes recommended fix
6. **CONVERGENT** — goal is consensus, not endless disagreement

## Consensus Criteria

| Condition | Required |
|-----------|----------|
| CRITICAL findings resolved | ALL |
| HIGH findings resolved or accepted | ALL |
| All reviewers rate BUILD or BUILD WITH CHANGES | YES |
| Cross-review disagreements resolved | ALL |

## Output Format

```markdown
# Agora Consensus Report

## Document: [path]
## Rounds: [N]
## Reviewers: [list with LLM models used]

## Verdict: [BUILD / BUILD WITH CHANGES / REDESIGN]

## Unanimous Findings
| # | Finding | Severity | All 3 Agree |
|---|---------|----------|-------------|

## Required Changes Before Build
1. [change with source reviewer]
2. ...

## Accepted Risks
- [finding accepted with justification]

## Unique Contributions Per Reviewer
| Reviewer | Findings Others Missed |
|----------|----------------------|

## Process Metrics
- Rounds: N
- Total findings: N
- Cross-adopted: N
- Severity upgrades: N
- Severity downgrades: N
- Disagreements raised: N
- Disagreements resolved: N/N
```

## Configuration

```yaml
# Default settings
agora:
  max_rounds: unlimited       # Set --rounds to limit
  severity_threshold: HIGH    # EXIT when no findings >= threshold
  models:
    - claude (opus, max effort)
    - codex (via codex-exec skill)
    - gemini (via gemini-exec skill)
  review_points: 20           # Per reviewer
  cross_review: true          # Peer-to-peer sharing
  auto_redesign: true         # Auto-produce redesign on REDESIGN verdict
```

## Anti-Patterns

| Anti-Pattern | Why Wrong | Correct |
|-------------|-----------|---------|
| Single LLM review | Misses blind spots | 3+ LLMs find complementary flaws |
| No cross-review | Reviewers don't challenge each other | Peer-to-peer sharing surfaces disagreements |
| Accepting first BUILD | May miss edge cases | Loop until ALL agree |
| Ignoring split decisions | Unresolved disagreements fester | Resolve every split with evidence |
| Push for consensus too fast | Premature agreement | Let reviewers challenge freely |
````

---

## Task 2: Update CLAUDE.md command tables

**Files:**
- EDIT: `CLAUDE.md`
- EDIT: `templates/CLAUDE.md`

### 2a. Add command row to `CLAUDE.md`

- [ ] Add `/omcustom:agora` row after `/adversarial-review` row

**Edit tool parameters:**

```
file: CLAUDE.md
old_string: | `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |
new_string: | `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |
| `/omcustom:agora` | Multi-LLM 적대적 합의 루프 (설계/스펙 교차 검증) |
```

### 2b. Add command row to `templates/CLAUDE.md`

- [ ] Add `/omcustom:agora` row after `/adversarial-review` row

**Edit tool parameters:**

```
file: templates/CLAUDE.md
old_string: | `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |
new_string: | `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |
| `/omcustom:agora` | Multi-LLM 적대적 합의 루프 (설계/스펙 교차 검증) |
```

### 2c. Update skill count in `CLAUDE.md` project structure

- [ ] Update skill directory count from 100 to 101

**Edit tool parameters:**

```
file: CLAUDE.md
old_string: |   +-- skills/                  # 스킬 (100 디렉토리)
new_string: |   +-- skills/                  # 스킬 (101 디렉토리)
```

### 2d. Update skill count in `templates/CLAUDE.md` project structure

- [ ] Update skill directory count from 99 to 100

**Edit tool parameters:**

```
file: templates/CLAUDE.md
old_string: |   +-- skills/                  # 스킬 (99 디렉토리)
new_string: |   +-- skills/                  # 스킬 (100 디렉토리)
```

### 2e. Verify command tables

- [ ] Run: `grep -n "omcustom:agora" CLAUDE.md templates/CLAUDE.md` — expect 2 matches
- [ ] Run: `grep -n "스킬 (" CLAUDE.md templates/CLAUDE.md` — expect 101 and 100 respectively

---

## Task 3: Update manifest.json

**Files:**
- EDIT: `templates/manifest.json`

Note: There is only one manifest.json at `templates/manifest.json`. No root-level manifest.json exists.

### 3a. Bump version

- [ ] Update version from 0.76.0 to 0.76.1

**Edit tool parameters:**

```
file: templates/manifest.json
old_string: "version": "0.76.0",
new_string: "version": "0.76.1",
```

### 3b. Update skills count

- [ ] Update skills files count from 100 to 101

**Edit tool parameters:**

```
file: templates/manifest.json
old_string: "files": 100
new_string: "files": 101
```

Note: The `"files": 100` string appears only once in manifest.json (in the skills component block), so this edit is unambiguous.

### 3c. Verify manifest.json

- [ ] Run: `cat templates/manifest.json | grep -E '"version"|"files": 101'` — expect version 0.76.1 and files 101

---

## Task 4: Version bump and build

**Files:**
- EDIT: `package.json`
- REGENERATE: `bun.lock`
- REGENERATE: `dist/`

### 4a. Bump package.json version

- [ ] Update version from 0.76.0 to 0.76.1

**Edit tool parameters:**

```
file: package.json
old_string: "version": "0.76.0",
new_string: "version": "0.76.1",
```

### 4b. Sync lockfile

- [ ] Run: `bun install`
- [ ] Expected: lockfile updated, exit code 0

### 4c. Build dist

- [ ] Run: `bun run build`
- [ ] Expected: dist/ regenerated, exit code 0

### 4d. Verify versions match

- [ ] Run: `grep '"version"' package.json templates/manifest.json` — both should show 0.76.1

---

## Task 5: Git operations

**Files:** All changes from Tasks 1-4

### 5a. Create release branch

- [ ] Run: `git checkout -b release/v0.76.1`
- [ ] Expected: new branch created from current `release/v0.76.0`

### 5b. Stage all changes

- [ ] Run: `git add -f .claude/skills/agora/SKILL.md` (gitignored, needs -f)
- [ ] Run: `git add templates/.claude/skills/agora/SKILL.md` (templates not gitignored)
- [ ] Run: `git add CLAUDE.md templates/CLAUDE.md`
- [ ] Run: `git add templates/manifest.json`
- [ ] Run: `git add package.json bun.lock`
- [ ] Run: `git add dist/`
- [ ] Verify: `git status` shows all expected files staged, nothing unexpected

### 5c. Commit

- [ ] Run:
```bash
git commit -m "feat: v0.76.1 — agora multi-LLM adversarial consensus skill (#TBD)"
```
- [ ] Expected: commit succeeds, pre-commit hooks pass (coverage >= 98%, README counts match)

### 5d. Push and create PR

- [ ] Run: `git push -u origin release/v0.76.1`
- [ ] Run:
```bash
gh pr create --base develop --title "feat: v0.76.1 — agora multi-LLM adversarial consensus skill" --body "$(cat <<'EOF'
## Summary
- Internalize agora skill from baekenough-skills into oh-my-customcode
- agora: Multi-LLM adversarial consensus loop — 3+ LLMs (Claude, Codex/GPT, Gemini) compete to find flaws in designs/specs until unanimous agreement
- Skills count: 100 → 101

## Changes
- NEW: `.claude/skills/agora/SKILL.md` + template mirror
- EDIT: CLAUDE.md + templates/CLAUDE.md (command table + skill count)
- EDIT: templates/manifest.json (version + skills count)
- EDIT: package.json (version bump 0.76.0 → 0.76.1)
- REBUILD: bun.lock, dist/

## Test plan
- [ ] Pre-commit hooks pass (coverage, README count sync)
- [ ] CI 7/7 green
- [ ] Skill count verification: `find .claude/skills -name "SKILL.md" | wc -l` = 101
- [ ] `/omcustom:agora` appears in command listings
EOF
)"
```
- [ ] Expected: PR created, CI starts, record PR number

### 5e. Post-PR

- [ ] Wait for CI 7/7 green
- [ ] Replace `#TBD` in commit message with actual issue number if applicable (or leave as-is if no issue)
- [ ] Merge PR to develop
- [ ] Verify auto-tag.yml creates v0.76.1 tag
- [ ] Verify release.yml publishes npm 0.76.1

---

## Parallelization Notes

Tasks 1, 2, 3, and 4a can execute in parallel (4 independent agents per R009):
- Agent 1: Task 1 (create skill files)
- Agent 2: Task 2 (update CLAUDE.md files)
- Agent 3: Task 3 (update manifest.json)
- Agent 4: Task 4a (bump package.json)

Tasks 4b-4c (bun install, bun run build) must run after 4a completes.
Task 5 must run after all other tasks complete.

---

## Estimated Duration

| Task | Time |
|------|------|
| Tasks 1-4a (parallel) | ~2 min |
| Tasks 4b-4c (sequential) | ~1 min |
| Task 5 (git + PR) | ~3 min |
| CI wait | ~5 min |
| **Total** | **~11 min** |

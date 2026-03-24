---
name: post-release-followup
description: Analyze release workflow findings and recommend follow-up actions — execute immediately or register as issues
scope: harness
user-invocable: false
effort: medium
---

# Post-Release Follow-up

## Purpose

After PR creation in the auto-dev release workflow, collect unaddressed findings and present actionable follow-up recommendations. The user chooses: execute now, register as issues, or skip.

## Workflow

### 1. Collect Follow-up Candidates

Gather unfinished work from multiple sources:

**Source A — Remaining open issues**:
- Run: `gh issue list --label verify-done --state open --json number,title,labels`
- These are triaged issues NOT included in the current release

**Source B — Deep-verify findings**:
- Read the latest deep-verify output from `.claude/outputs/sessions/{today}/`
- Extract any MEDIUM or LOW severity findings that were flagged but not fixed

**Source C — Triage deferred items**:
- Read the latest professor-triage output from `.claude/outputs/sessions/{today}/`
- Extract items explicitly marked as deferred or P3

**Source D — TODO markers in changed files**:
- Run: `git diff develop...HEAD --name-only` to get changed files
- Search changed files for `TODO`, `FIXME`, `HACK` markers added in this release

**Source E — PR review feedback**:
- Run: `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments` and `gh api repos/{owner}/{repo}/issues/{pr_number}/comments`
- Parse omc_pr_analyzer bot comments (Senior Architect, Project Colleague, Professor Synthesis)
- Extract findings categorized as Critical, High, Medium
- Identify: required fixes, recommended improvements, structural concerns

### 2. Deduplicate and Categorize

Remove duplicates (same issue referenced from multiple sources). Categorize:

| Category | Criteria | Default Action |
|----------|----------|----------------|
| **Immediate** | P1/P2 remaining issues, MEDIUM+ verify findings, Critical/High PR review findings | Execute now |
| **Trackable** | P3 issues, LOW verify findings, new TODOs, Medium PR review findings | Register as issue |
| **Informational** | Already-tracked issues, cosmetic notes | Skip |

### 3. Present to User

Display follow-up summary:

```
[Follow-up] {n}개 후속 작업 발견

━━━ 즉시 실행 추천 ({count}개) ━━━
  1. {description} — 출처: {source}
  2. {description} — 출처: {source}

━━━ 이슈 등록 추천 ({count}개) ━━━
  3. {description} — 출처: {source}
  4. {description} — 출처: {source}

━━━ 참고 사항 ({count}개) ━━━
  5. {description} — 이미 #{issue_number}로 추적 중

선택:
  [A] 추천대로 실행 (즉시 실행 + 이슈 등록)
  [B] 모두 즉시 실행
  [C] 모두 이슈 등록
  [D] 개별 선택 (항목별로 질문)
  [E] 건너뛰기
```

Use AskUserQuestion (or equivalent user prompt) to get the choice.

### 4. Process User Choice

**Option A (추천대로)**:
- "Immediate" items → delegate to appropriate specialist agents for execution
- "Trackable" items → create GitHub issues via `gh issue create`
- "Informational" items → skip

**Option B (모두 즉시 실행)**:
- All Immediate + Trackable items → delegate to specialist agents
- Follow implementation patterns from the release workflow

**Option C (모두 이슈 등록)**:
- All Immediate + Trackable items → `gh issue create` with appropriate labels
- Label: `professor` for auto-triage in next workflow run

**Option D (개별 선택)**:
- For each item, ask: `[{n}] {description} — 실행(E) / 이슈(I) / 건너뛰기(S)?`
- Process each per user choice

**Option E (건너뛰기)**:
- Skip all follow-up actions
- Complete workflow

### 5. Report

```
[Follow-up Complete]
├── 즉시 실행: {n}개 완료
├── 이슈 등록: {n}개 (#{numbers})
├── 건너뛰기: {n}개
└── 총 처리: {total}개
```

## Issue Creation Template

When creating follow-up issues:

```bash
gh issue create \
  --title "{concise description}" \
  --body "## Source\n\nDiscovered during v{version} release workflow.\n\n## Context\n\n{detailed context from triage/verify}\n\n## Suggested Action\n\n{recommendation}" \
  --label "professor"
```

Add priority label (`P1`, `P2`, `P3`) based on categorization.

## Notes

- This skill runs in the main conversation context (via workflow skill step)
- User interaction is expected — this is NOT a fully automated step
- All file modifications delegated to specialist subagents per R010
- Issue creation uses `gh` CLI directly (read-only operation pattern)
- If no follow-up candidates found, report "No follow-up actions needed" and complete
- PR review feedback is available shortly after PR creation — the omc_pr_analyzer bot comments automatically

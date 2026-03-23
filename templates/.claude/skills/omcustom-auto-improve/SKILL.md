---
name: omcustom:auto-improve
description: Apply verified improvement suggestions from eval-core analysis to omcustom configuration
scope: harness
user-invocable: true
effort: high
---

# /omcustom:auto-improve — Automated Improvement Workflow

## Purpose

Reads improvement suggestions from eval-core analysis, lets the user select which to apply, applies changes in an isolated worktree with sauron verification, and creates a PR for review.

## Usage

```
/omcustom:auto-improve              # Interactive selection from pending suggestions
```

## Prerequisites

- eval-core analysis data exists (run `/omcustom:improve-report` first if empty)
- Pending improvement suggestions in `proposed` status

## Workflow

### Step 1: Read Suggestions

1. Run `bun run packages/eval-core/src/cli/index.ts analyze --format json --save` via Bash
2. Parse JSON output for improvement suggestions
3. If no suggestions: display "No improvement suggestions available" and exit

### Step 2: Display & Select

Display numbered list:
```
[Auto-Improve] Available suggestions:
  1. [HIGH] agent:lang-golang-expert — Escalate model sonnet→opus (3 failures in 5 uses)
  2. [MED]  routing:dev-lead-routing — Add Flutter keyword mapping (2 routing misses)
  3. [LOW]  skill:systematic-debugging — Add timeout guard (1 timeout in 10 uses)

Select items: [1,2,3] / "all" / "cancel"
```

**Self-reference filter**: Exclude items where targetName matches:
- `omcustom-auto-improve`, `auto-improve`
- `pipeline-guards`, `evaluator-optimizer`
- Any item targeting this skill itself

### Step 3: Approve (State Transition)

For each selected item:
1. Call eval-core API: transition `proposed` → `approved`
2. Display: `[Approved] {N} items selected for application`

### Step 4: Worktree Isolation

- Use `EnterWorktree` tool with name `auto-improve-{YYYYMMDD}`
- Creates isolated branch from HEAD

### Step 5: Apply Changes

Map each approved item to the appropriate subagent by `targetType`:

| targetType | Agent | Action |
|------------|-------|--------|
| agent | mgr-creator | Modify agent frontmatter/body |
| skill | Matching domain expert | Revise skill SKILL.md |
| routing | general-purpose | Update routing patterns |
| model-escalation | general-purpose | Update model field in agent frontmatter |

Spawn agents in parallel (max 4 per R009). Each agent receives:
- Action description and evidence data
- Target file path
- Specific modification instructions

### Step 6: Verification

1. Delegate to mgr-sauron: full R017 verification
2. If **PASS**: proceed to Step 7
3. If **FAIL**: display failures, offer options:
   - `fix` → re-apply with sauron feedback (max 2 cycles)
   - `reject` → transition all to `rejected`, ExitWorktree(remove)
   - `manual` → keep worktree for user inspection

### Step 7: PR & Finalize

1. Delegate to mgr-gitnerd: commit + create PR
   - Title: `chore(auto-improve): apply {N} improvement suggestions`
   - Body: table of applied items with evidence
2. Transition all items to `applied` with `appliedAt` timestamp and PR URL
3. `ExitWorktree(action: "keep")` — keep branch for PR
4. Display PR URL to user

## Safety Guards

| Guard | Implementation |
|-------|---------------|
| Self-reference prevention | Blocklist filter in Step 2 |
| User approval gate | Step 2 interactive selection |
| Worktree isolation | Step 4 EnterWorktree |
| Sauron verification | Step 6 mandatory pass |
| PR-based merge | Step 7 — no direct push to develop |
| Max items per run | 20 default, 50 hard cap |
| Max fix cycles | 2 retries before rejection |
| Rollback | `git revert` via mgr-gitnerd post-merge |

## Error Handling

| Scenario | Action |
|----------|--------|
| No suggestions available | Display message, exit |
| User cancels selection | Exit, no state changes |
| Sauron verification fails 2x | Reject all, cleanup worktree |
| Agent application error | Mark individual item as rejected, continue others |
| EnterWorktree fails | Report error, exit |

## Display Format

```
[Auto-Improve] Starting improvement workflow
├── Suggestions: {N} available ({high}H/{medium}M/{low}L confidence)
├── Self-reference filtered: {count} items excluded
└── Select items to apply: [1,2,3] or "all" or "cancel"

[Auto-Improve] Applying {N} improvements in worktree
├── Worktree: auto-improve-{date}
├── Agents: {count} parallel
└── Pipeline guards: max 20 items, 2 retry cycles

[Auto-Improve] Verification
├── Sauron: {PASS|FAIL}
├── PR: #{number} created
└── Status: {N} items → applied
```

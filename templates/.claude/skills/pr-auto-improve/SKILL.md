---
name: pr-auto-improve
description: Opt-in post-PR analysis and improvement suggestions for code quality enhancement
scope: core
user-invocable: false
---

# PR Auto-Improvement Skill

Analyzes pull requests after creation and suggests targeted improvements. **Strictly opt-in** — never runs automatically. User must explicitly request PR improvement.

**Advisory-only** — suggests improvements, never force-pushes or modifies PRs without approval (R010).

## Activation

| Trigger | Behavior |
|---------|----------|
| User says "improve this PR" | Activate analysis |
| User says "review PR #N" | Activate analysis |
| PR created automatically | Do NOT activate (opt-in only) |
| CI fails on PR | Suggest activation, do not auto-run |

## Analysis Pipeline

```
1. Fetch PR diff (gh pr diff)
2. Categorize changes by type:
   - New code → check patterns, naming, structure
   - Modified code → check consistency, regression risk
   - Deleted code → check for orphaned references
3. Run improvement checks (see checklist below)
4. Generate improvement report
5. User approves → create follow-up commit(s)
```

## Improvement Checklist

| Category | Checks |
|----------|--------|
| **Code Quality** | Naming consistency, dead code, duplication, complexity |
| **Type Safety** | Missing types, `any` usage, assertion safety |
| **Error Handling** | Unhandled promises, missing try-catch, error propagation |
| **Testing** | Missing test coverage for new functions, edge cases |
| **Documentation** | Missing JSDoc for public APIs, outdated README refs |
| **Security** | Hardcoded values, injection risks, permission checks |
| **Performance** | Unnecessary re-renders, N+1 queries, missing indexes |

## Report Format

```
[PR Auto-Improve] PR #{number} — {title}
├── Files analyzed: {count}
├── Improvements found: {count}
│
├── [Code Quality] ({count} items)
│   ├── {file:line} — {description}
│   └── {file:line} — {description}
│
├── [Testing] ({count} items)
│   └── {file} — Missing test for {function}
│
├── [Documentation] ({count} items)
│   └── {file:line} — {description}
│
└── Estimated effort: {low|medium|high}

Apply improvements? [Y/n/select]
```

## Improvement Modes

| Mode | Behavior |
|------|----------|
| `all` | Apply all suggested improvements |
| `select` | User picks which improvements to apply |
| `report` | Report only, no changes (default) |

## Implementation Flow

```
User: "improve PR #215"
  → Orchestrator activates pr-auto-improve
  → Fetch PR diff via mgr-gitnerd
  → Analyze with appropriate expert agent(s)
  → Generate report
  → User selects improvements
  → Delegate fixes to specialist agents (R010)
  → mgr-gitnerd creates follow-up commit
```

## Agent Selection for Fixes

| File Type | Agent |
|-----------|-------|
| *.ts, *.tsx | lang-typescript-expert |
| *.py | lang-python-expert |
| *.go | lang-golang-expert |
| *.kt | lang-kotlin-expert |
| *.java | lang-java21-expert |
| *.rs | lang-rust-expert |
| Test files | qa-engineer |
| Docs, README | arch-documenter |
| Mixed | Multiple agents in parallel (R009) |

## Integration

| Rule | Integration |
|------|-------------|
| R009 | Multiple file fixes execute in parallel |
| R010 | Orchestrator coordinates analysis and fix delegation |
| R015 | Full transparency on what improvements are suggested and why |
| R018 | 3+ fix agents → Agent Teams for coordination |
| worker-reviewer-pipeline | Can chain: auto-improve → worker-reviewer for critical fixes |
| pipeline-guards | Improvement count capped by guard limits |

## Opt-In Safeguards

- **NEVER** auto-activates on PR creation
- **NEVER** pushes changes without user approval
- **NEVER** modifies PR description or labels without approval
- Report mode is default; changes require explicit "apply" command
- All git operations go through mgr-gitnerd (R010)

## Limitations

- Analyzes only the PR diff, not the entire codebase
- Cannot detect architectural issues (use dev-review for that)
- Max 50 files per analysis (skip larger PRs with warning)
- Does not run tests (delegates to qa-engineer if needed)

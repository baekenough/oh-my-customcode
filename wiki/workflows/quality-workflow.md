---
title: Quality Workflow
type: workflow
updated: 2026-04-12
sources:
  - .claude/rules/MUST-sync-verification.md
  - .claude/rules/MUST-completion-verification.md
  - CLAUDE.md
related:
  - [[development-workflow]]
  - [[release-workflow]]
  - [[wiki/rules/r017]]
  - [[wiki/rules/r020]]
  - [[wiki/agents/mgr-sauron]]
---

# Quality Workflow

Quality in oh-my-customcode is enforced at three levels: structural integrity (R017 sauron), completion verification (R020), and code quality (dev-review + adversarial-review). Each level has defined triggers, agents, and pass/fail criteria.

## Overview

Quality is not a final gate — it is woven into every workflow. Structural verification runs after any agent/skill/guide change. Completion verification runs before any `[Done]` declaration. Code review runs on implementation output.

## Level 1: Structural Integrity (R017)

[[wiki/agents/mgr-sauron]] is the "all-seeing eye" that verifies the consistency of the agent/skill/guide ecosystem. It must pass before any `git push`.

### Trigger Conditions

Any change to:
- Agent definitions (`.claude/agents/*.md`)
- Skills (`.claude/skills/*/SKILL.md`)
- Guides (`guides/*/`)
- Routing patterns
- Rule files

### Verification Protocol

**Phase 1 — Manager Verification (5 rounds)**:

| Round | Actions |
|-------|---------|
| 1–2 | `mgr-supplier:audit` + `mgr-updater:docs` sync check |
| 3–4 | Re-verify both, fix remaining issues |
| 5 | Final: all counts match, frontmatter valid, skill refs exist, memory scopes valid |

Also runs: `mgr-claude-code-bible:verify` (official spec compliance).

**Phase 2 — Deep Review (3 rounds)**:

| Round | Focus |
|-------|-------|
| 1 | Workflow alignment: routing skills have complete agent mappings |
| 2 | References: no orphans, no circular refs, valid skill/memory refs |
| 3 | Philosophy: R006 separation, R009 parallel, R010 delegation, R007/R008 identification |

**Phase 3**: Fix all discovered issues.
**Phase 4**: Commit via `mgr-gitnerd`.
**Phase 5**: Push via `mgr-gitnerd`.

### Quick Verification Commands

```bash
# Agent count
ls .claude/agents/*.md | wc -l

# Skill count
find .claude/skills -name "SKILL.md" | wc -l

# Guide count
find guides -mindepth 1 -maxdepth 1 -type d | wc -l
```

## Level 2: Completion Verification (R020)

Before declaring `[Done]`, verify actual outcomes (not just attempts):

| Task Type | Required Checks |
|-----------|----------------|
| Implementation | Compiles, lint passes, tests pass, no TODOs |
| Documentation | Links valid, counts accurate, cross-refs updated |
| Git Operations | Exit code checked, working tree clean |
| Agent/Skill Creation | Frontmatter valid, skill refs exist, routing updated |
| Release | Issues closed, version bumped, PR merged, GitHub Release created |

The distinction: "ran the command" ≠ "succeeded." Check `$?` or tool output.

## Level 3: Code Review

### Standard Review
`/dev-review` invokes the `dev-review` skill, which routes to the appropriate language expert based on file type. Reviews check against language-specific best practices (`go-best-practices`, `python-best-practices`, etc.).

### Security Review
`/adversarial-review` uses attacker-perspective analysis. Targets authentication flows, input handling, secret exposure, and dependency vulnerabilities.

### Multi-Model Verification
The `multi-model-verification` skill runs parallel code verification using different models. Useful for high-stakes changes where consensus across models reduces false-negative risk.

## CI Workflows

GitHub Actions workflows provide automated quality gates:

| Workflow | Trigger | Checks |
|----------|---------|--------|
| `ci.yml` | Push / PR | Build, test, lint |
| `wiki-sync.yml` | Agent/skill changes | Wiki consistency check |

## Continuous Improvement (R016)

Quality failures feed back into rule improvements. When a violation is found:
1. Fix the immediate issue
2. Identify the rule gap
3. Update the rule before continuing
4. For CI/process failures: also file a GitHub issue

## Relationships

- **Depends on**: [[wiki/agents/mgr-sauron]] (R017 verification), [[wiki/rules/r020]] (completion criteria), [[wiki/rules/r016]]
- **Used by**: [[development-workflow]] and [[release-workflow]] both depend on quality workflow
- **See also**: [[wiki/rules/r017]], [[wiki/agents/mgr-claude-code-bible]]

## Sources

- `.claude/rules/MUST-sync-verification.md` — R017 full verification protocol
- `.claude/rules/MUST-completion-verification.md` — R020 task-type matrix
- `CLAUDE.md` — review command descriptions

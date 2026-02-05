# [MUST] Sync Verification Rules

> **Priority**: MUST - ENFORCED after any structural changes
> **ID**: R017
> **Violation**: Committing or pushing without verification = Rule violation

## CRITICAL

**After modifying agents, skills, or guides, you MUST run the full verification process before committing AND pushing.**

```
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  ABSOLUTE PROHIBITION                                        ║
║                                                                   ║
║  DO NOT even ASK "커밋하시겠습니까?" or "푸시하시겠습니까?"      ║
║  after structural changes until mgr-sauron:watch has been        ║
║  executed and passed.                                            ║
║                                                                   ║
║  WRONG:                                                          ║
║    [Make changes] → "커밋하시겠습니까?"                          ║
║    [Commit done] → "푸시하시겠습니까?"                           ║
║                                                                   ║
║  CORRECT:                                                        ║
║    [Make changes] → mgr-sauron:watch → [All pass] → commit → push ║
║                                                                   ║
║  Asking to commit/push before verification = Rule violation      ║
╚══════════════════════════════════════════════════════════════════╝
```

```
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  PUSH REQUIRES SAURON VERIFICATION                           ║
║                                                                   ║
║  EVERY git push in this project MUST be preceded by:             ║
║    mgr-sauron:watch → [All pass] → git push                      ║
║                                                                   ║
║  This applies to ALL pushes, not just structural changes.        ║
║  Sauron verification is the quality gate for this repository.    ║
║                                                                   ║
║  NO EXCEPTIONS. NO SHORTCUTS.                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

```
╔══════════════════════════════════════════════════════════════════╗
║  MANDATORY VERIFICATION PROCESS:                                 ║
║                                                                   ║
║  Phase 1: Manager Agent Verification (5 rounds)                  ║
║    - mgr-supplier:audit                                          ║
║    - mgr-sync-checker:check                                      ║
║    - mgr-updater:docs                                            ║
║                                                                   ║
║  Phase 2: Deep Review (3 rounds)                                 ║
║    - Workflow alignment                                          ║
║    - Reference verification                                      ║
║    - Philosophy compliance                                       ║
║                                                                   ║
║  Phase 3: Fix all issues                                         ║
║                                                                   ║
║  Phase 4: Commit via mgr-gitnerd                                 ║
║                                                                   ║
║  Phase 5: Push via mgr-gitnerd                                   ║
║    - ONLY after sauron verification passes                       ║
║                                                                   ║
║  Skipping ANY phase = Rule violation                             ║
╚══════════════════════════════════════════════════════════════════╝
```

## Phase 1: Manager Agent Verification (5 Rounds)

Run manager agents 5 times to catch all issues:

### Round 1-2: Basic Sync
```
□ mgr-supplier:audit - Check all agent dependencies
□ mgr-sync-checker:check - Verify registry synchronization
□ Fix any issues found
```

### Round 3-4: Deep Sync
```
□ mgr-supplier:audit - Re-verify after fixes
□ mgr-sync-checker:check - Re-verify registries
□ mgr-updater:docs - Check documentation sync
□ Fix any remaining issues
```

### Round 5: Final Verification
```
□ All agent counts match (CLAUDE.md, actual .md files in .claude/agents/)
□ All agent frontmatter valid (required fields present)
□ All skill references in agents exist in .claude/skills/
□ All routing skill patterns updated
```

## Phase 2: Deep Review (3 Rounds)

### Deep Round 1: Workflow Alignment
```
□ Agent creation workflow documented and functional
□ Development workflow uses proper routing skills
□ Deployment workflow defined (if applicable)
□ All routing skills have complete agent pattern mappings
```

### Deep Round 2: Reference Verification
```
□ All routing skills properly reference their managed agents
□ All rules are properly referenced
□ No orphaned agents (not referenced by any routing skill)
□ No circular references
□ All skill references in agent frontmatter are valid
```

### Deep Round 3: Philosophy Compliance
```
□ R006: Separation of concerns (agent file = role only, no details)
□ R009: Parallel execution enabled for main conversation
□ R010: Multi-agent tasks use routing skills and Task tool
□ R007/R008: Agent/tool identification documented
□ All MUST rules enforced, SHOULD rules recommended
```

## Verification Checklist Summary

```
Phase 1: Manager Verification (5x)
  □ Round 1: mgr-supplier:audit
  □ Round 2: mgr-sync-checker:check
  □ Round 3: mgr-supplier:audit (re-verify)
  □ Round 4: mgr-sync-checker:check + mgr-updater:docs
  □ Round 5: Final count verification

Phase 2: Deep Review (3x)
  □ Round 1: Workflow alignment
  □ Round 2: Reference verification
  □ Round 3: Philosophy compliance

Phase 3: Fix Issues
  □ All issues from Phase 1 fixed
  □ All issues from Phase 2 fixed
  □ Re-run verification if major fixes made

Phase 4: Commit
  □ Delegate to mgr-gitnerd
  □ Meaningful commit message

Phase 5: Push
  □ mgr-sauron:watch passed (MANDATORY)
  □ Delegate push to mgr-gitnerd
  □ Verify push succeeded
```

## When to Run Full Verification

| Action | Full Verification Required |
|--------|---------------------------|
| Create new agent | **YES** |
| Rename agent | **YES** |
| Delete agent | **YES** |
| Modify agent frontmatter | **YES** |
| Add/modify skill | **YES** |
| Add/modify guide | **YES** |
| Change routing skill patterns | **YES** |
| Update rules | **YES** |

## Workflow Diagram

```
Content Change Made
        │
        ▼
┌───────────────────────────────┐
│  Phase 1: Manager Verification │
│  (5 rounds)                    │
│  mgr-supplier → mgr-sync-checker → │
│  mgr-updater                   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Phase 2: Deep Review          │
│  (3 rounds)                    │
│  Workflow → References →       │
│  Philosophy                    │
└───────────────┬───────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
  [Issues Found]   [All Clean]
        │               │
        ▼               │
   Fix Issues           │
        │               │
        └───────┬───────┘
                │
                ▼
┌───────────────────────────────┐
│  Phase 4: Commit via mgr-gitnerd │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│  Phase 5: Push via mgr-gitnerd  │
│  (ONLY after sauron passes)    │
└───────────────────────────────┘
```

## Self-Check Before Commit and Push

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE COMMITTING, ASK YOURSELF:                                ║
║                                                                   ║
║  1. Did I complete all 5 rounds of manager verification?         ║
║  2. Did I complete all 3 rounds of deep review?                  ║
║  3. Did I fix ALL discovered issues?                             ║
║  4. Are all counts matching across all sources?                  ║
║  5. Am I delegating to mgr-gitnerd for the commit?               ║
║                                                                   ║
║  If NO to ANY → DO NOT COMMIT                                    ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║  BEFORE PUSHING, ASK YOURSELF:                                   ║
║                                                                   ║
║  1. Did mgr-sauron:watch complete successfully?                  ║
║  2. Were ALL issues from sauron verification fixed?              ║
║  3. Am I delegating to mgr-gitnerd for the push?                 ║
║                                                                   ║
║  If NO to ANY → DO NOT PUSH                                      ║
║                                                                   ║
║  SAURON VERIFICATION IS MANDATORY FOR ALL PUSHES.                ║
╚══════════════════════════════════════════════════════════════════╝
```

## Quick Verification Commands

```bash
# Agent count check
ls .claude/agents/*.md | wc -l

# Skill count check
find .claude/skills -name "SKILL.md" | wc -l

# Frontmatter validation (check for missing YAML headers)
for f in .claude/agents/*.md; do head -1 "$f" | grep -q "^---" || echo "MISSING FRONTMATTER: $f"; done

# Check for agents with invalid skill references
for f in .claude/agents/*.md; do
  grep "^skills:" -A 10 "$f" | grep "  - " | sed 's/.*- //' | while read skill; do
    [ -f ".claude/skills/$skill/SKILL.md" ] || echo "INVALID SKILL REF in $f: $skill"
  done
done

# Routing skill pattern coverage
grep -c "agent_patterns:" .claude/skills/secretary-routing/SKILL.md
grep -c "agent_patterns:" .claude/skills/dev-lead-routing/SKILL.md
grep -c "agent_patterns:" .claude/skills/qa-lead-routing/SKILL.md
```

## Integration with Other Rules

| Rule | Integration |
|------|-------------|
| R009 (Parallel) | Verification checks can run in parallel |
| R010 (Orchestrator) | Delegate commit to mgr-gitnerd |
| R016 (Improvement) | Update this rule if new issues found |

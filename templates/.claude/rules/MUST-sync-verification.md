# [MUST] Sync Verification Rules

> **Priority**: MUST - ENFORCED after any structural changes
> **ID**: R017
> **Violation**: Committing without verification = Rule violation

## CRITICAL

**After modifying agents, skills, guides, commands, or pipelines, you MUST run the full verification process before committing.**

```
╔══════════════════════════════════════════════════════════════════╗
║  MANDATORY VERIFICATION PROCESS:                                 ║
║                                                                   ║
║  Phase 1: Manager Agent Verification (5 rounds)                  ║
║    - supplier:audit                                              ║
║    - sync-checker:check                                          ║
║    - updater:docs                                                ║
║                                                                   ║
║  Phase 2: Deep Review (3 rounds)                                 ║
║    - Workflow alignment                                          ║
║    - Reference verification                                      ║
║    - Philosophy compliance                                       ║
║                                                                   ║
║  Phase 3: Fix all issues                                         ║
║                                                                   ║
║  Phase 4: Commit via gitnerd                                     ║
║                                                                   ║
║  Skipping ANY phase = Rule violation                             ║
╚══════════════════════════════════════════════════════════════════╝
```

## Phase 1: Manager Agent Verification (5 Rounds)

Run manager agents 5 times to catch all issues:

### Round 1-2: Basic Sync
```
□ supplier:audit - Check all agent dependencies
□ sync-checker:check - Verify registry synchronization
□ Fix any issues found
```

### Round 3-4: Deep Sync
```
□ supplier:audit - Re-verify after fixes
□ sync-checker:check - Re-verify registries
□ updater:docs - Check documentation sync
□ Fix any remaining issues
```

### Round 5: Final Verification
```
□ All agent counts match (CLAUDE.md, index.yaml, actual files)
□ All symlinks valid
□ All command registries updated
□ All intent-detection triggers present
```

## Phase 2: Deep Review (3 Rounds)

### Deep Round 1: Workflow Alignment
```
□ Agent creation workflow documented and functional
□ Development workflow uses proper orchestrators
□ Deployment workflow defined (if applicable)
□ All orchestrators have complete `manages:` sections
```

### Deep Round 2: Reference Verification
```
□ All orchestrators properly reference their managed agents
□ All rules are properly referenced
□ No orphaned agents (not managed by any orchestrator)
□ No circular references
```

### Deep Round 3: Philosophy Compliance
```
□ R006: Separation of concerns (AGENT.md = role only, no details)
□ R009: Parallel execution enabled for orchestrators
□ R010: Multi-agent tasks use orchestrators
□ R007/R008: Agent/tool identification documented
□ All MUST rules enforced, SHOULD rules recommended
```

## Verification Checklist Summary

```
Phase 1: Manager Verification (5x)
  □ Round 1: supplier:audit
  □ Round 2: sync-checker:check
  □ Round 3: supplier:audit (re-verify)
  □ Round 4: sync-checker:check + updater:docs
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
  □ Delegate to gitnerd
  □ Meaningful commit message
```

## When to Run Full Verification

| Action | Full Verification Required |
|--------|---------------------------|
| Create new agent | **YES** |
| Rename agent | **YES** |
| Move agent | **YES** |
| Delete agent | **YES** |
| Modify agent structure | **YES** |
| Add/modify skill | **YES** |
| Add/modify guide | **YES** |
| Add/modify command | **YES** |
| Add/modify pipeline | **YES** |
| Change orchestrator manages section | **YES** |
| Update rules | **YES** |

## Workflow Diagram

```
Content Change Made
        │
        ▼
┌───────────────────────────────┐
│  Phase 1: Manager Verification │
│  (5 rounds)                    │
│  supplier → sync-checker →     │
│  updater                       │
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
│  Phase 4: Commit via gitnerd   │
└───────────────────────────────┘
```

## Self-Check Before Commit

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE COMMITTING, ASK YOURSELF:                                ║
║                                                                   ║
║  1. Did I complete all 5 rounds of manager verification?         ║
║  2. Did I complete all 3 rounds of deep review?                  ║
║  3. Did I fix ALL discovered issues?                             ║
║  4. Are all counts matching across all sources?                  ║
║  5. Am I delegating to gitnerd for the commit?                   ║
║                                                                   ║
║  If NO to ANY → DO NOT COMMIT                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

## Quick Verification Commands

```bash
# Agent count check
find agents -name "AGENT.md" | wc -l

# Broken symlinks
find agents -type l ! -exec test -e {} \; -print

# Index registry count
grep -c "name:" agents/index.yaml

# Intent trigger coverage
grep -c "keywords:" skills/orchestration/intent-detection/patterns/agent-triggers.yaml
```

## Integration with Other Rules

| Rule | Integration |
|------|-------------|
| R009 (Parallel) | Verification checks can run in parallel |
| R010 (Orchestrator) | Delegate commit to gitnerd |
| R016 (Improvement) | Update this rule if new issues found |

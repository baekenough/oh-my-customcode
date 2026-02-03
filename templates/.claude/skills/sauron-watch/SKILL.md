---
name: sauron-watch
description: Full R017 verification (5+3 rounds) before commit
disable-model-invocation: true
---

# Sauron Watch Skill

Execute full R017 verification process with 5 rounds of manager agent verification and 3 rounds of deep review.

## Purpose

Ensure complete synchronization of agents, commands, documentation, and project structure before committing changes.

## Workflow

### Phase 1: Manager Agent Verification (5 rounds)

#### Round 1-2: Basic Sync
```
□ /audit-agents - Check all agent dependencies
□ /sync-check - Verify registry synchronization
□ Fix any issues found
```

#### Round 3-4: Deep Sync
```
□ /audit-agents - Re-verify after fixes
□ /sync-check - Re-verify registries
□ /update-docs - Check documentation sync
□ Fix any remaining issues
```

#### Round 5: Final Verification
```
□ All agent counts match (CLAUDE.md, index.yaml, actual files)
□ All symlinks valid
□ All command registries updated
□ All intent-detection triggers present
```

### Phase 2: Deep Review (3 rounds)

#### Deep Round 1: Workflow Alignment
```
□ Agent creation workflow documented and functional
□ Development workflow uses proper orchestrators
□ Deployment workflow defined (if applicable)
□ All orchestrators have complete `manages:` sections
```

#### Deep Round 2: Reference Verification
```
□ All orchestrators properly reference their managed agents
□ All rules are properly referenced
□ No orphaned agents (not managed by any orchestrator)
□ No circular references
```

#### Deep Round 3: Philosophy Compliance
```
□ R006: Separation of concerns (AGENT.md = role only, no details)
□ R009: Parallel execution enabled for orchestrators
□ R010: Multi-agent tasks use orchestrators
□ R007/R008: Agent/tool identification documented
□ All MUST rules enforced, SHOULD rules recommended
```

### Phase 3: Fix Issues
```
□ All issues from Phase 1 fixed
□ All issues from Phase 2 fixed
□ Re-run verification if major fixes made
```

### Phase 4: Commit Ready
```
□ All verification passed
□ Ready to delegate to mgr-gitnerd for commit
```

## Output Format

```
[mgr-sauron:watch]

Starting full R017 verification...

═══════════════════════════════════════════════════════════
 PHASE 1: Manager Agent Verification (5 rounds)
═══════════════════════════════════════════════════════════

[Round 1/5] Basic sync - /audit-agents
  ✓ All agents have valid dependencies

[Round 2/5] Basic sync - /sync-check
  ✓ All registries synchronized

[Round 3/5] Deep sync - /audit-agents
  ✓ Dependencies verified after fixes

[Round 4/5] Deep sync - /sync-check + /update-docs
  ✓ Registries verified
  ✓ Documentation synchronized

[Round 5/5] Final verification
  ✓ Agent counts match across all sources
  ✓ All symlinks valid
  ✓ Command registries updated
  ✓ Intent triggers present

═══════════════════════════════════════════════════════════
 PHASE 2: Deep Review (3 rounds)
═══════════════════════════════════════════════════════════

[Round 1/3] Workflow alignment
  ✓ Agent creation workflow documented
  ✓ Development workflow uses orchestrators
  ✓ Orchestrators have complete manages sections

[Round 2/3] Reference verification
  ✓ All orchestrator references valid
  ✓ All rules referenced
  ✓ No orphaned agents

[Round 3/3] Philosophy compliance
  ✓ R006 separation enforced
  ✓ R009 parallel execution enabled
  ✓ R010 orchestrator coordination documented
  ✓ R007/R008 identification rules present

═══════════════════════════════════════════════════════════
 VERIFICATION COMPLETE
═══════════════════════════════════════════════════════════

Status: ✓ ALL CHECKS PASSED

Ready to commit. 커밋할까요?
```

## Related

- R017: Sync Verification Rules
- mgr-gitnerd: Git operations agent

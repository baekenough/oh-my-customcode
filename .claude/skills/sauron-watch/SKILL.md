---
name: sauron-watch
description: Full R017 verification (5+3 rounds) before commit
scope: harness
disable-model-invocation: true
---

# Sauron Watch Skill

Execute full R017 verification process with 5 rounds of manager agent verification and 3 rounds of deep review.

## Purpose

Ensure complete synchronization of agents, skills, documentation, and project structure before committing changes.

## Workflow

### Phase 1: Manager Agent Verification (5 rounds)

#### Round 1-2: Basic Checks
```
□ mgr-supplier:audit - Check all agent dependencies and skill refs
□ mgr-updater:docs - Verify documentation sync
□ Fix any issues found
```

#### Round 3-4: Re-verify + Update
```
□ mgr-supplier:audit - Re-verify after fixes
□ mgr-updater:docs - Re-run and apply any detected changes
□ Fix any remaining issues
```

#### Round 5: Final Count Verification
```
□ Agent count matches: CLAUDE.md vs actual .md files
□ Skill count matches: CLAUDE.md vs actual SKILL.md files
□ Memory field distribution correct
□ Hook/context/guide/rule counts match
□ All frontmatter valid
□ All skill refs exist
□ All memory scopes valid (project|user|local)
□ Routing patterns updated
```

### Phase 2: Deep Review (3 rounds)

#### Deep Round 1: Workflow Alignment
```
□ Agent workflows match purpose
□ Command definitions match implementations
□ Routing skill patterns are valid
□ All routing skills have complete agent mappings
```

#### Deep Round 2: Reference Verification
```
□ All skill references exist
□ All agent frontmatter valid
□ memory field values valid (user | project | local)
□ No orphaned agents
□ No circular references
```

#### Deep Round 3: Philosophy Compliance
```
□ R006: Agent design rules (including memory field spec)
□ R007: Agent identification rules
□ R008: Tool identification rules
□ R009: Parallel execution rules
□ R010: Orchestrator coordination rules
□ R011: Memory integration (native-first architecture)
□ All MUST rules enforced, SHOULD rules recommended
```

### Phase 2.5: Documentation Accuracy
```
□ Every agent name in CLAUDE.md matches actual filename
□ All counts cross-verified against filesystem
□ Every slash command has corresponding skill
□ Every agent reachable through routing skills
```

### Phase 3: Fix Issues
```
□ Auto-fix: count mismatches, missing fields, outdated refs
□ Report: missing files, invalid scopes, philosophy violations
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

[Round 1/5] mgr-supplier:audit
  ✓ 41 agents checked, 0 issues

[Round 2/5] mgr-updater:docs
  ✓ Documentation sync: OK

[Round 3/5] Re-verify: mgr-supplier:audit
  ✓ All dependencies valid

[Round 4/5] Re-verify: mgr-updater:docs
  ✓ No changes needed

[Round 5/5] Final count verification
  ✓ Agents: 41/41 match
  ✓ Skills: 55/55 match
  ✓ All frontmatter valid
  ✓ All skill refs valid
  ✓ All memory scopes valid

═══════════════════════════════════════════════════════════
 PHASE 2: Deep Review (3 rounds)
═══════════════════════════════════════════════════════════

[Round 1/3] Workflow alignment
  ✓ All routing skills have complete agent mappings
  ✓ Command definitions match implementations

[Round 2/3] Reference verification
  ✓ All skill references valid
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

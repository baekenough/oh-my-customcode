---
name: omcustom:sauron-watch
description: Full R017 verification (5+3 rounds) before commit
scope: harness
disable-model-invocation: true
user-invocable: true
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

#### Structural Lint Rules

In addition to workflow alignment checks, verify these structural invariants:

**Lint 1: Routing Coverage**
```
For each agent in .claude/agents/*.md:
  Check if agent name appears in at least one routing skill:
    - secretary-routing/SKILL.md
    - dev-lead-routing/SKILL.md
    - de-lead-routing/SKILL.md
    - qa-lead-routing/SKILL.md

  If not found in any routing skill:
    WARN: "{agent} is unreachable — not referenced in any routing skill"
```

**Lint 2: Orphan Skill Detection**
```
For each skill in .claude/skills/*/SKILL.md:
  Check if skill name appears in:
    - Any agent's skills: [] frontmatter field
    - Any routing skill's content
    - CLAUDE.md command table (for user-invocable skills)

  If not referenced anywhere:
    WARN: "{skill} is orphaned — not referenced by any agent or routing skill"
```

**Lint 3: Circular Dependency Check**
```
Build dependency graph:
  For each agent → extract skills: [] references
  For each skill → extract agent references in body

  Detect cycles: agent-A → skill-X → agent-A
  If cycle found:
    ERROR: "Circular dependency: {cycle path}"
```

**Lint 4: Context Fork Cap Verification**
```
Count skills with context: fork in frontmatter:
  grep "context: fork" .claude/skills/*/SKILL.md

  If count > 10:
    ERROR: "Context fork cap exceeded: {count}/10"
  If count >= 8:
    WARN: "Context fork usage high: {count}/10 — only {10-count} slots remaining"
```

All structural lints are **advisory** (WARN level) except circular dependencies and fork cap exceeded (ERROR level — should block commit).

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

#### Spec Density Check (Advisory)

Check each agent's body-to-skill ratio to detect agents with too much inline implementation detail:

```
For each agent in .claude/agents/*.md:
  agent_body_LOC = count non-frontmatter, non-blank lines in agent body
  referenced_skills = extract skills from frontmatter skills: field
  total_skill_LOC = sum of LOC in each referenced SKILL.md

  if total_skill_LOC > 0:
    spec_density = agent_body_LOC / total_skill_LOC
    if spec_density > 0.5:
      WARN: "{agent} has spec density {spec_density:.2f} — consider extracting inline details to skills"
  else:
    if agent_body_LOC > 50:
      INFO: "{agent} has {agent_body_LOC} LOC with no skill references — consider creating skills"
```

**Thresholds**:
| Density | Status | Meaning |
|---------|--------|---------|
| ≤ 0.3 | Good | Agent properly delegates to skills |
| 0.3-0.5 | OK | Acceptable inline detail |
| > 0.5 | WARNING | Too much implementation in agent body |

This check is **advisory only** — it does not block commits.

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

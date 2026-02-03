---
name: fix-refs
description: Fix broken agent references and symlinks
argument-hint: "[agent-name] [--all] [--dry-run]"
disable-model-invocation: true
---

# Fix References Skill

Fix broken references, missing symlinks, and other agent dependency issues.

## Options

```
--all, -a        Fix all agents
--dry-run        Show what would be fixed
--verbose, -v    Show detailed actions
```

## Workflow

```
1. Run mgr-supplier:audit to identify issues

2. Fix issues:
   ├── Missing skill references → Add
   ├── Missing guide references → Add
   ├── Broken paths → Update
   └── Invalid references → Remove

3. Validate fixes
   └── Re-run mgr-supplier:audit
```

## Fixable Issues

| Issue | Action |
|-------|--------|
| Missing skill ref | Add to agent .md file |
| Missing guide ref | Add to agent .md file |
| Broken path | Update path in agent .md file |
| Invalid reference | Remove from agent .md file |

## Output Format

### Dry Run
```
[mgr-supplier:fix lang-kotlin-expert --dry-run]

Analyzing: lang-kotlin-expert

Issues found:
  1. Missing guide reference: kotlin

Proposed fixes:
  1. Add guide reference to .claude/agents/lang-kotlin-expert.md

No changes made (dry-run mode).
Run without --dry-run to apply fixes.
```

### Fix Mode
```
[mgr-supplier:fix lang-kotlin-expert]

Fixing: lang-kotlin-expert

[1/2] Adding missing reference...
  Updating: .claude/agents/lang-kotlin-expert.md
  ✓ Guide reference added

[2/2] Validating...
  Running mgr-supplier:audit...
  ✓ All dependencies valid

Summary:
  Fixed: 1 issue
  Status: HEALTHY

Agent lang-kotlin-expert is now healthy.
```

### Fix All
```
[mgr-supplier:fix --all]

Scanning all agents for issues...

Found issues in 2 agents:
  - lang-kotlin-expert: 1 issue
  - new-agent: 2 issues

Fixing lang-kotlin-expert...
  ✓ Added guide reference: kotlin

Fixing new-agent...
  ✓ Added skill reference: skill-a
  ✓ Added skill reference: skill-b

Validating all agents...
  ✓ mgr-supplier:audit --all passed

Summary:
  Agents fixed: 2
  Issues resolved: 3
  All agents healthy.
```

# [MUST] Sync Verification Rules

> **Priority**: MUST - ENFORCED | **ID**: R017

## Core Rule

After modifying agents, skills, or guides: run full verification before committing AND pushing. Never ask to commit/push before `mgr-sauron:watch` passes.

Every `git push` requires: `mgr-sauron:watch` → all pass → `git push`

## Verification Phases

### Phase 1: Manager Verification (5 rounds)

| Round | Actions |
|-------|---------|
| 1-2 | mgr-supplier:audit, mgr-sync-checker:check, fix issues |
| 3-4 | Re-verify + mgr-updater:docs, fix remaining |
| 5 | Final: all counts match, frontmatter valid, skill refs exist, memory scopes valid, routing patterns updated |

Also run: mgr-claude-code-bible:verify (official spec compliance)

### Phase 2: Deep Review (3 rounds)

| Round | Focus |
|-------|-------|
| 1 | Workflow alignment: routing skills have complete agent mappings |
| 2 | References: no orphans, no circular refs, valid skill/memory refs |
| 3 | Philosophy: R006 separation, R009 parallel, R010 delegation, R007/R008 identification |

### Phase 3: Fix all discovered issues

### Phase 4: Commit via mgr-gitnerd

### Phase 5: Push via mgr-gitnerd (only after sauron passes)

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

## When Required

Any change to: agents, agent frontmatter, skills, guides, routing patterns, rules.

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

# Memory field validation
for f in .claude/agents/*.md; do
  mem=$(grep "^memory:" "$f" | awk '{print $2}')
  if [ -n "$mem" ] && [ "$mem" != "project" ] && [ "$mem" != "user" ] && [ "$mem" != "local" ]; then
    echo "INVALID MEMORY SCOPE in $f: $mem"
  fi
done

# Hook count check
ls .claude/hooks/*.json 2>/dev/null | wc -l

# Context count check
ls .claude/contexts/*.md 2>/dev/null | wc -l

# Guide count check
find guides -mindepth 1 -maxdepth 1 -type d | wc -l

# Agent name accuracy (compare CLAUDE.md table with actual files)
# Extract agent names from files
ls .claude/agents/*.md | xargs -I{} basename {} .md | sort > /tmp/actual-agents.txt

# Slash command skill existence
for cmd in $(grep "^| \`/" CLAUDE.md | sed 's/.*`\///' | sed 's/`.*//' | sed 's/ .*//')
do
  [ -d ".claude/skills/$cmd" ] || echo "MISSING SKILL: $cmd"
done

# Routing skill completeness check
ls -d .claude/skills/*-routing 2>/dev/null | xargs -I{} basename {} | sort

# Verify routing skill names in CLAUDE.md
grep -oP '(secretary|dev-lead|de-lead|qa-lead)-routing' CLAUDE.md | sort -u
```

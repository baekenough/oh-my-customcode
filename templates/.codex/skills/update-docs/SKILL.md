---
name: update-docs
description: Sync documentation with project structure
argument-hint: "[--check] [--target <path>]"
disable-model-invocation: true
---

# Update Documentation Skill

Ensures all documentation (AGENT.md, SKILL.md, index.yaml, AGENTS.md) accurately reflects the current project state and that agents work together organically.

## Options

```
--check, -c      Check only, don't modify
--verbose, -v    Show detailed changes
--target, -t     Specific target to update
```

## Workflow

```
1. Scan project structure
   ├── .codex/agents/
   ├── .codex/skills/
   ├── guides/
   └── commands/

2. Validate consistency
   ├── Check agent files exist
   ├── Check skill references exist
   ├── Check guide references exist
   └── Check command definitions match files

3. Update documentation
   ├── Verify all .codex/agents/*.md files
   ├── Verify all .codex/skills/*/SKILL.md files
   ├── Update AGENTS.md summary
   └── Update inter-agent references

4. Ensure organic integration
   ├── Verify agent → skill mappings
   ├── Verify agent → guide mappings
   ├── Verify command → agent mappings
   └── Check for orphaned resources
```

## What Gets Updated

### Agent Files
- All .codex/agents/*.md files exist and are valid
- No orphaned or missing agents
- Metadata is consistent

### Skill Files
- All .codex/skills/*/SKILL.md files exist
- Skill categories reflect actual structure
- References are valid

### AGENTS.md
- Project structure diagram
- Agent/skill/guide counts
- Command list
- Summary tables

### Individual Agent/Skill Files
- Skill references in agent files
- Guide references in agent files
- Cross-agent references

## Organic Integration Checks

```yaml
agent_skill_mapping:
  - Each agent declares valid skills
  - Skills are in correct category
  - No duplicate skill declarations

agent_guide_mapping:
  - Each agent declares valid guides
  - Guides exist in guides/
  - Paths are relative and correct

command_agent_mapping:
  - Commands reference valid agents
  - Agent capabilities match commands
  - Workflow is documented
```

## Output Format

### Check Mode
```
[/update-docs --check]

Scanning project structure...

Agents:
  ✓ 15 agents found in .codex/agents/
  ✗ Missing: lang-java21-expert.md (referenced but not found)

Skills:
  ✓ 13 skills found in .codex/skills/
  ✓ All SKILL.md files valid

Guides:
  ✓ 12 guides declared
  ✗ Orphan: guides/old-guide/ (exists but not referenced)

AGENTS.md:
  ✗ Agent count outdated (shows 14, actual 15)

Issues Found: 3
Run "/update-docs" to fix.
```

### Update Mode
```
[/update-docs]

Syncing documentation with project structure...

[1/3] Verifying agents
  - Removed reference: lang-java21-expert (not found)
  ✓ 15 → 14 agents

[2/3] Verifying skills
  ✓ No changes needed

[3/3] Updating AGENTS.md
  - Updated agent count: 14 → 15
  - Updated summary table
  ✓ Synced

Summary:
  Modified: 1 file
  Removed: 1 reference

All documentation synced successfully.
```

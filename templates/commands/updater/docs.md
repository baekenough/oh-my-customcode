# Command: updater:docs

> Sync documentation with project structure

## Purpose

Ensures all documentation (AGENT.md, SKILL.md, index.yaml, CLAUDE.md) accurately reflects the current project state and that agents work together organically.

## Usage

```
updater:docs
updater:docs --check
updater:docs --target <path>
```

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| target | string | no | Specific path to update |

## Options

```
--check, -c      Check only, don't modify
--verbose, -v    Show detailed changes
--target, -t     Specific target to update
```

## Workflow

```
1. Scan project structure
   ├── agents/
   ├── skills/
   ├── guides/
   └── commands/

2. Validate consistency
   ├── Check agent index.yaml matches folder structure
   ├── Check skill references exist
   ├── Check guide references exist
   └── Check command definitions match files

3. Update documentation
   ├── Sync agents/index.yaml
   ├── Sync skills/index.yaml
   ├── Sync guides/index.yaml
   ├── Update CLAUDE.md summary
   └── Update inter-agent references

4. Ensure organic integration
   ├── Verify agent → skill mappings
   ├── Verify agent → guide mappings
   ├── Verify command → agent mappings
   └── Check for orphaned resources
```

## Output

### Check Mode

```
[updater:docs --check]

Scanning project structure...

agents/index.yaml:
  ✓ 15 agents declared
  ✓ All paths valid
  ✗ Missing: agents/sw-engineer/java-expert (declared but not found)

skills/index.yaml:
  ✓ 13 skills declared
  ✓ All paths valid

guides/index.yaml:
  ✓ 12 guides declared
  ✗ Orphan: guides/old-guide/ (exists but not declared)

CLAUDE.md:
  ✗ Agent count outdated (shows 14, actual 15)

Issues Found: 3
Run "updater:docs" to fix.
```

### Update Mode

```
[updater:docs]

Syncing documentation with project structure...

[1/4] Updating agents/index.yaml
  - Removed: java-expert (not found)
  ✓ 15 → 14 agents

[2/4] Updating skills/index.yaml
  ✓ No changes needed

[3/4] Updating guides/index.yaml
  - Added: old-guide (found in filesystem)
  ✓ 12 → 13 guides

[4/4] Updating CLAUDE.md
  - Updated agent count: 14 → 15
  - Updated summary table
  ✓ Synced

Summary:
  Modified: 3 files
  Added: 1 entry
  Removed: 1 entry

All documentation synced successfully.
```

## What Gets Updated

### agents/index.yaml
- Agent list matches actual folders
- Paths are correct
- Metadata is consistent

### skills/index.yaml
- Skill categories reflect actual structure
- All skills in folders are listed
- References are valid

### guides/index.yaml
- All guide folders are listed
- Sources are documented
- Cross-references work

### CLAUDE.md
- Project structure diagram
- Agent/skill/guide counts
- Command list
- Summary tables

### Individual Agent/Skill Files
- Skill references in agent index.yaml
- Guide references in agent index.yaml
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

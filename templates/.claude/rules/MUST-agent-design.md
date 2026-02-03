# [MUST] Agent Design Rules

> **Priority**: MUST - Never violate
> **ID**: R006

## Agent Structure

### Single File Format
```
.claude/agents/{name}.md

Format:
---
name: agent-name
description: Brief agent description
model: sonnet | opus | haiku
tools:
  - Read
  - Write
  - Bash
skills:
  - skill-name-1
  - skill-name-2
---

# Agent Content

Agent purpose and role description...
```

### Frontmatter Fields (REQUIRED)
```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: sonnet             # Default model (sonnet | opus | haiku)
tools: [Read, Write, ...]  # Allowed tools
skills: [skill-1, ...]     # Required skill names
```

### Agent Content Must NOT Contain
```
✗ Detailed skill instructions (use .claude/skills/ instead)
✗ Reference documentation (use guides/ instead)
✗ Implementation scripts (use .claude/skills/{name}/scripts/ instead)
```

### Agent Content Should Contain
```
✓ Agent purpose and role
✓ Capabilities overview (not details)
✓ Required skills (by name reference)
✓ Workflow description
✓ Source info (if external)
```

## External Agent Requirements

External agents (from GitHub, npm, etc.) MUST include source information in frontmatter:

### Frontmatter Source Fields
```yaml
source:
  type: external
  origin: github | npm | other
  url: https://github.com/org/repo
  version: 1.0.0
  last_updated: 2025-01-22
  update_command: "npx add-skill org/repo"
```

### Update Tracking
```
- version: Current version installed
- last_updated: Date of last sync
- update_command: Command to update
- changelog_url: Where to check updates
```

## Separation of Concerns

### .claude/agents/
```
Purpose: Define WHAT the agent does
Content: Role, capabilities, workflow
Format: Single .md file with YAML frontmatter
NOT: How to do it (that's skills/)
```

### .claude/skills/
```
Purpose: Define HOW to do tasks
Content: Instructions, scripts, rules
Location: .claude/skills/{name}/SKILL.md
```

### guides/
```
Purpose: Reference documentation
Content: Best practices, tutorials
Location: guides/{topic}/
```

## Agent → Skill References

### In Frontmatter
```yaml
---
name: agent-name
skills:
  - react-best-practices
  - web-design-guidelines
---
```

Skills are referenced by name only. The system automatically discovers skills in `.claude/skills/` by scanning for `SKILL.md` files.

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `.claude/agents/fe-vercel-agent.md` |
| Skill directory | `kebab-case/` | `.claude/skills/react-best-practices/` |
| Guide directory | `kebab-case/` | `guides/web-design/` |
| Agent filename | lowercase | `{name}.md` |
| Skill file | UPPERCASE | `SKILL.md` |

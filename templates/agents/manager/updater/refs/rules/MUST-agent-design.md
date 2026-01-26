# [MUST] Agent Design Rules

> **Priority**: MUST - Never violate
> **ID**: R006

## Agent Structure

### Required Files
```
agents/{type}/{name}/
├── AGENT.md          # Agent definition (REQUIRED)
├── index.yaml        # Agent metadata (REQUIRED)
└── refs/             # Symlinks to guides/skills (OPTIONAL)
```

### AGENT.md Must NOT Contain
```
✗ Detailed skill instructions (use skills/ instead)
✗ Reference documentation (use guides/ instead)
✗ Implementation scripts (use skills/scripts/ instead)
```

### AGENT.md Should Contain
```
✓ Agent purpose and role
✓ Capabilities overview (not details)
✓ Required skills (by reference)
✓ Workflow description
✓ Source info (if external)
```

## External Agent Requirements

External agents (from GitHub, npm, etc.) MUST include:

### index.yaml Fields
```yaml
metadata:
  name: agent-name
  type: worker | orchestrator
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

### agents/
```
Purpose: Define WHAT the agent does
Content: Role, capabilities, workflow
NOT: How to do it (that's skills/)
```

### skills/
```
Purpose: Define HOW to do tasks
Content: Instructions, scripts, rules
Location: skills/{category}/{name}/
```

### guides/
```
Purpose: Reference documentation
Content: Best practices, tutorials
Location: guides/{topic}/
```

## Linking

### Agent → Skills
```yaml
# In AGENT.md or index.yaml
skills:
  - category: development
    name: react-best-practices
    path: ../../../../skills/development/react-best-practices
```

### Agent → Guides
```bash
# Symlink in refs/
ln -s ../../../../guides/web-design refs/web-design
```

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Agent folder | `kebab-case` | `vercel-agent` |
| Skill folder | `kebab-case` | `react-best-practices` |
| Guide folder | `kebab-case` | `web-design` |
| AGENT.md | UPPERCASE | `AGENT.md` |
| SKILL.md | UPPERCASE | `SKILL.md` |
| index.yaml | lowercase | `index.yaml` |

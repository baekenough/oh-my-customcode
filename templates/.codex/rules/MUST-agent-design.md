# [MUST] Agent Design Rules

> **Priority**: MUST - Never violate
> **ID**: R006

## Agent Structure

### Single File Format
```
.codex/agents/{name}.md

Format:
---
name: agent-name
description: Brief agent description
model: sonnet | opus | haiku
memory: project            # Optional
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
memory: project           # Persistent memory scope (user | project | local)
effort: high              # Effort level (low | medium | high)
tools: [Read, Write, ...]  # Allowed tools
skills: [skill-1, ...]     # Required skill names
```

### Memory Scope Reference
| Scope | Location | Use Case |
|-------|----------|----------|
| `user` | `~/.codex/agent-memory/<name>/` | Cross-project learnings (infra, db) |
| `project` | `.codex/agent-memory/<name>/` | Project-specific, versioned |
| `local` | `.codex/agent-memory-local/<name>/` | Project-specific, not versioned |

### Effort Level Reference
| Level | Use Case | Agents |
|-------|----------|--------|
| `high` | Complex reasoning, design decisions | lang-*, be-*, arch-*, qa-planner |
| `medium` | Routine operations, structured work | fe-*, tool-*, mgr-gitnerd |
| `low` | Simple validation, file scanning | mgr-supplier, mgr-sync-checker, sys-naggy |

### Agent Content Must NOT Contain
```
✗ Detailed skill instructions (use .codex/skills/ instead)
✗ Reference documentation (use guides/ instead)
✗ Implementation scripts (use .codex/skills/{name}/scripts/ instead)
```

### Agent Content Should Contain
```
✓ Agent purpose and role
✓ Capabilities overview (not details)
✓ Required skills (by name reference)
✓ Workflow description
✓ Source info (if external)
```

## Memory Scope (OPTIONAL)

Agents can have persistent memory that survives across conversations.

| Scope | Location | Use Case | Git Tracked |
|-------|----------|----------|-------------|
| `user` | `~/.codex/agent-memory/<name>/` | Cross-project learnings (infra, DB patterns) | No |
| `project` | `.codex/agent-memory/<name>/` | Project-specific patterns | Yes |
| `local` | `.codex/agent-memory-local/<name>/` | Local-only knowledge | No |

When enabled:
- First 200 lines of MEMORY.md loaded into agent's system prompt
- Read/Write/Edit tools automatically enabled for memory directory
- Agent builds knowledge across conversations

Agents that should NOT have memory (stateless by design):
- Manager agents for one-time operations (mgr-creator, mgr-updater, mgr-supplier)
- Validation agents (mgr-sync-checker, mgr-claude-code-bible)
- Meta-agents (sys-memory-keeper, sys-naggy)

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

### .codex/agents/
```
Purpose: Define WHAT the agent does
Content: Role, capabilities, workflow
Format: Single .md file with YAML frontmatter
NOT: How to do it (that's skills/)
```

### .codex/skills/
```
Purpose: Define HOW to do tasks
Content: Instructions, scripts, rules
Location: .codex/skills/{name}/SKILL.md
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

Skills are referenced by name only. The system automatically discovers skills in `.codex/skills/` by scanning for `SKILL.md` files.

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `.codex/agents/fe-vercel-agent.md` |
| Skill directory | `kebab-case/` | `.codex/skills/react-best-practices/` |
| Guide directory | `kebab-case/` | `guides/web-design/` |
| Agent filename | lowercase | `{name}.md` |
| Skill file | UPPERCASE | `SKILL.md` |

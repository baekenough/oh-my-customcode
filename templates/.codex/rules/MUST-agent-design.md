# [MUST] Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Agent File Format

Location: `.codex/agents/{name}.md` (single file, kebab-case)

### Required Frontmatter

```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: balanced              # balanced | reasoning | fast
tools: [Read, Write, ...]  # Allowed tools
```

### Optional Frontmatter

```yaml
memory: project            # user | project | local
effort: high               # low | medium | high
skills: [skill-1, ...]     # Skill name references
source:                    # For external agents
  type: external
  origin: github | npm
  url: https://...
  version: 1.0.0
```

## Memory Scopes

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.codex/agent-memory/<name>/` | No |
| `project` | `.codex/agent-memory/<name>/` | Yes |
| `local` | `.codex/agent-memory-local/<name>/` | No |

When enabled: first 200 lines of MEMORY.md loaded into system prompt.

## Separation of Concerns

| Location | Purpose | Contains |
|----------|---------|----------|
| `.codex/agents/` | WHAT the agent does | Role, capabilities, workflow |
| `.codex/skills/` | HOW to do tasks | Instructions, scripts, rules |
| `guides/` | Reference docs | Best practices, tutorials |

Agent body: purpose, capabilities overview, workflow. NOT detailed instructions or reference docs.

## Naming

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `fe-vercel-agent.md` |
| Skill dir | `kebab-case/` | `react-best-practices/` |
| Skill file | UPPERCASE | `SKILL.md` |

# [MUST] Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Agent File Format

Location: `.claude/agents/{name}.md` (single file, kebab-case)

### Required Frontmatter

```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: sonnet              # sonnet | opus | haiku
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
escalation:              # Model escalation policy (optional)
  enabled: true          # Enable auto-escalation advisory
  path: haiku → sonnet → opus  # Escalation sequence
  threshold: 2           # Failures before advisory
isolation: worktree        # Run in isolated git worktree
background: true           # Run in background
maxTurns: 10               # Max conversation turns
mcpServers: [server-1]     # MCP servers available
hooks:                     # Agent-specific hooks
  PreToolUse:
    - matcher: "Edit"
      command: "echo hook"
permissionMode: bypassPermissions  # Permission mode
disallowedTools: [Bash]    # Tools to disallow
```

> **Note**: `isolation`, `background`, `maxTurns`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools` are supported in Claude Code v2.1.63+.

### Escalation Policy

When `escalation.enabled: true`, the model-escalation hooks will track outcomes for this agent type and advise escalation when failures exceed the threshold. This is advisory-only — the orchestrator decides whether to accept the recommendation.

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | false | Enable escalation tracking for this agent |
| `path` | haiku → sonnet → opus | Model upgrade sequence |
| `threshold` | 2 | Failure count before escalation advisory |

## Memory Scopes

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

When enabled: first 200 lines of MEMORY.md loaded into system prompt.

## Separation of Concerns

| Location | Purpose | Contains |
|----------|---------|----------|
| `.claude/agents/` | WHAT the agent does | Role, capabilities, workflow |
| `.claude/skills/` | HOW to do tasks | Instructions, scripts, rules |
| `guides/` | Reference docs | Best practices, tutorials |

Agent body: purpose, capabilities overview, workflow. NOT detailed instructions or reference docs.

## Naming

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `fe-vercel-agent.md` |
| Skill dir | `kebab-case/` | `react-best-practices/` |
| Skill file | UPPERCASE | `SKILL.md` |

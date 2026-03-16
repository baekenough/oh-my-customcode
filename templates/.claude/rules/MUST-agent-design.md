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
soul: true                 # Enable SOUL.md identity injection
isolation: worktree | sandbox  # worktree = git worktree, sandbox = restricted bash
background: true           # Run in background
maxTurns: 10               # Max conversation turns
maxTokens: 100000          # Per-turn token ceiling
mcpServers: [server-1]     # MCP servers available
hooks:                     # Agent-specific hooks
  PreToolUse:
    - matcher: "Edit"
      command: "echo hook"
permissionMode: bypassPermissions  # Permission mode
disallowedTools: [Bash]    # Tools to disallow
limitations:               # Negative capability declarations
  - "cannot execute tests"
  - "cannot modify code"
domain: backend              # backend | frontend | data-engineering | devops | universal
```

> **Note**: `isolation`, `background`, `maxTurns`, `maxTokens`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools`, `limitations` are supported in Claude Code v2.1.63+. Hook types `PostCompact`, `Elicitation`, `ElicitationResult` require v2.1.76+.

### Isolation Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `worktree` | Isolated git worktree copy | Code changes that need rollback safety |
| `sandbox` | Restricted Bash environment | Agents running untrusted or scan commands |

When `isolation: sandbox` is set, the agent's Bash calls run with restricted permissions. This is advisory metadata — enforcement depends on the execution environment.

### Token Ceiling

When `maxTokens` is set, it serves as advisory metadata for the orchestrator to manage agent turn budgets. The orchestrator should track output and consider escalation or task splitting when an agent approaches its ceiling.

### Negative Capabilities (Limitations)

The `limitations` field declares what an agent explicitly CANNOT or SHOULD NOT do. This enables:
1. **Clearer routing**: Orchestrator knows agent boundaries
2. **Safer delegation**: Prevents accidental capability overreach
3. **Better documentation**: Makes agent scope explicit

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

## Soul Identity

Optional per-agent identity layer that separates personality/style from capabilities.

| Aspect | Location | Purpose |
|--------|----------|---------|
| Capabilities | `.claude/agents/{name}.md` | WHAT the agent does |
| Identity | `.claude/agents/souls/{name}.soul.md` | HOW the agent communicates |

### Soul File Format

Location: `.claude/agents/souls/{name}.soul.md`

```yaml
---
agent: {agent-name}        # Must match agent filename
version: 1.0.0
---
```

Sections: `## Personality`, `## Style`, `## Anti-patterns`

### Activation

1. Agent frontmatter includes `soul: true`
2. Routing skill reads `souls/{name}.soul.md` at spawn time (Step 5)
3. Soul content prepended to agent prompt as identity context
4. Missing soul file → graceful fallback (no error)

### Precedence

Behavioral memory observations (R011) override soul defaults when they conflict. Behaviors are user-specific; souls are template defaults.

## Artifact Output Convention

Skills that produce significant output can persist results to local storage.

**Location**: `.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md`

**Format**: Metadata header with `skill`, `date`, `query` fields, followed by skill output content.

**Rules**:
- Opt-in per skill — not mandatory
- The final subagent in the skill's pipeline writes the artifact (R010 compliance)
- Skills create the directory (`mkdir -p`) before writing
- `.claude/outputs/` is git-untracked (under `.claude/` gitignore)
- No indexing required — date-based directory browsing is sufficient

## Separation of Concerns

| Location | Purpose | Contains |
|----------|---------|----------|
| `.claude/agents/` | WHAT the agent does | Role, capabilities, workflow |
| `.claude/skills/` | HOW to do tasks | Instructions, scripts, rules |
| `guides/` | Reference docs | Best practices, tutorials |

Agent body: purpose, capabilities overview, workflow. NOT detailed instructions or reference docs.

## Skill Frontmatter

Location: `.claude/skills/{name}/SKILL.md`

### Required Fields

```yaml
name: skill-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
```

### Optional Fields

```yaml
scope: core                # core | harness | package (default: core)
context: fork              # Forked context for isolated execution
version: 1.0.0             # Semantic version
user-invocable: false      # Whether user can invoke directly
disable-model-invocation: true  # Prevent model from auto-invoking
```

### Skill Effectiveness Tracking

Skills can optionally track effectiveness metrics via auto-populated fields:

```yaml
effectiveness:              # Auto-populated by sys-memory-keeper
  invocations: 0            # Total invocation count across sessions
  success_rate: 0.0         # Success rate (0.0-1.0)
  last_invoked: ""          # ISO-8601 timestamp
```

These fields are read-only from the skill's perspective — sys-memory-keeper updates them at session end based on task-outcome-recorder data. They inform model selection, routing optimization, and skill maintenance priorities.

## Skill Scope

| Scope | Purpose | Deployed via init? |
|-------|---------|-------------------|
| `core` | Universal development tools | Yes |
| `harness` | Agent/skill/rule maintenance | Yes |
| `package` | Package-specific (npm publish, etc.) | No |

Default: `core` (when field is omitted)

### Context Fork Criteria

Use `context: fork` for skills that orchestrate multi-agent workflows. Cap at **10 total** across the project.

| Use `context: fork` | Do NOT use `context: fork` |
|---------------------|---------------------------|
| Routing skills (secretary, dev-lead, etc.) | Best-practices skills |
| Workflow orchestration (DAG, pipelines) | Hook/command skills |
| Multi-agent coordination patterns | Single-agent reference skills |
| Task decomposition/planning | External tool integrations |

Current skills with `context: fork` (8/10 cap):
- secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing
- dag-orchestration, task-decomposition, worker-reviewer-pipeline
- pipeline-guards

## Naming

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `fe-vercel-agent.md` |
| Skill dir | `kebab-case/` | `react-best-practices/` |
| Skill file | UPPERCASE | `SKILL.md` |

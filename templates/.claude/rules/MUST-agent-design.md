# [MUST] Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Agent File Format

Location: `.claude/agents/{name}.md` (single file, kebab-case)

### Required Frontmatter

```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: sonnet              # sonnet | opus | haiku (or full ID: claude-sonnet-4-6)
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
sandboxFailIfUnavailable: true  # Exit if sandbox unavailable (v2.1.83+)
background: true           # Run in background
maxTurns: 10               # Max conversation turns
maxTokens: 100000          # Per-turn token ceiling
mcpServers: [server-1]     # MCP servers available
hooks:                     # Agent-specific hooks
  PreToolUse:
    - matcher: "Edit"
      if: "Edit(*.md)"      # Conditional filter (permission rule syntax, v2.1.85+)
      command: "echo hook"
permissionMode: bypassPermissions  # Permission mode
disallowedTools: [Bash]    # Tools to disallow
limitations:               # Negative capability declarations
  - "cannot execute tests"
  - "cannot modify code"
domain: backend              # backend | frontend | data-engineering | devops | universal
```

> **Note**: `isolation`, `background`, `maxTurns`, `maxTokens`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools`, `limitations` are supported in Claude Code v2.1.63+. Hook types `PostCompact`, `Elicitation`, `ElicitationResult` require v2.1.76+. `CwdChanged`, `FileChanged` hook events and `managed-settings.d/` drop-in directory require v2.1.83+. Conditional `if` field for hooks requires v2.1.85+.

## Permission Mode Guidance

When spawning agents via the Agent tool, CC applies a default `mode` of `acceptEdits` if not explicitly specified. To maintain consistent permission behavior:

1. **Agent frontmatter `permissionMode`**: Declares the agent's intended permission level. CC respects this when the agent is spawned via Agent tool.
2. **Agent tool `mode` parameter**: Overrides frontmatter at spawn time. Routing skills should pass this explicitly.
3. **Recommendation**: For agents that modify files, set `permissionMode: bypassPermissions` in frontmatter if the project uses `bypassPermissions` mode.

| Mode | Behavior |
|------|----------|
| `default` | CC decides per-tool prompting |
| `acceptEdits` | Auto-accept file edits, prompt for others |
| `bypassPermissions` | Skip all permission prompts |
| `plan` | Require plan approval |
| `dontAsk` | Non-interactive, deny unapproved |
| `auto` | AI decides safety |

<!-- DETAIL: Isolation/Token/Limitations/Escalation details
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
-->

## Memory Scopes

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

When enabled: first 200 lines of MEMORY.md loaded into system prompt.

## Soul Identity

Optional per-agent identity layer. `soul: true` in frontmatter enables personality/style via `.claude/agents/souls/{name}.soul.md`. Behavioral memory (R011) overrides soul defaults.

<!-- DETAIL: Soul Identity full spec
| Aspect | Location | Purpose |
|--------|----------|---------|
| Capabilities | `.claude/agents/{name}.md` | WHAT the agent does |
| Identity | `.claude/agents/souls/{name}.soul.md` | HOW the agent communicates |

### Soul File Format: agent: {name}, version: 1.0.0 — Sections: Personality, Style, Anti-patterns
### Activation: frontmatter soul:true → routing skill reads souls/{name}.soul.md at spawn (Step 5) → prepend to prompt → missing file = graceful fallback
-->

## Artifact Output Convention

Skills persist output to `.claude/outputs/sessions/{YYYY-MM-DD}/{skill-name}-{HHmmss}.md`. Opt-in, git-untracked. Final subagent writes (R010).

<!-- DETAIL: Artifact Output full spec
**Format**: Metadata header with `skill`, `date`, `query` fields, followed by skill output content.
**Rules**: Opt-in per skill, final subagent writes (R010 compliance), Skills create directory (mkdir -p), .claude/outputs/ is git-untracked, no indexing required.
-->

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
effort: medium              # low | medium | high — overrides model effort level when invoked
```

When both an agent and its invoked skill specify `effort`, the skill's value takes precedence (more specific invocation-time setting).

<!-- DETAIL: Skill Effectiveness Tracking
Skills can optionally track effectiveness metrics via auto-populated fields:
  effectiveness.invocations, effectiveness.success_rate (0.0-1.0), effectiveness.last_invoked (ISO-8601)
Read-only from skill perspective — sys-memory-keeper updates at session end via task-outcome-recorder data.
-->

## Skill Scope

| Scope | Purpose | Deployed via init? |
|-------|---------|-------------------|
| `core` | Universal development tools | Yes |
| `harness` | Agent/skill/rule maintenance | Yes |
| `package` | Package-specific (npm publish, etc.) | No |

Default: `core` (when field is omitted)

### Context Fork Criteria

Use `context: fork` for multi-agent orchestration skills only. Cap: **12 total**. Current: 9/12 (secretary/dev-lead/de-lead/qa-lead-routing, dag-orchestration, task-decomposition, worker-reviewer-pipeline, pipeline-guards, deep-plan).

<!-- DETAIL: Context Fork decision table
| Use context:fork | Do NOT use context:fork |
| Routing skills, Workflow orchestration (DAG), Multi-agent coordination, Task decomposition | Best-practices skills, Hook/command skills, Single-agent reference, External tool integrations |
-->

## Naming

| Type | Pattern | Example |
|------|---------|---------|
| Agent file | `kebab-case.md` | `fe-vercel-agent.md` |
| Skill dir | `kebab-case/` | `react-best-practices/` |
| Skill file | UPPERCASE | `SKILL.md` |

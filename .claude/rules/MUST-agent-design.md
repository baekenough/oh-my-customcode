# [MUST] Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Agent File Format

Location: `.claude/agents/{name}.md` (single file, kebab-case)

### Required Frontmatter

```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: sonnet              # sonnet | opus | haiku | opusplan (or full ID: claude-sonnet-4-6, claude-opus-4-6[1m])
tools: [Read, Write, ...]  # Allowed tools
```

### Model Aliases

| Alias | Full ID | Use Case |
|-------|---------|----------|
| `haiku` | claude-haiku-4-5 | Fast, cheap tasks (search, simple edits) |
| `sonnet` | claude-sonnet-4-6 | General tasks, code generation (default) |
| `opus` | claude-opus-4-6 | Complex reasoning, architecture |
| `opusplan` | claude-opus-4-6 + plan mode | Architecture planning with approval gates |

Extended context suffix: `[1m]` (e.g., `claude-opus-4-6[1m]`) — enables 1M token context window.

### Optional Frontmatter

```yaml
memory: project            # user | project | local
effort: high               # low | medium | high | default | max
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
disableSkillShellExecution: true  # Disable inline shell execution in skills (v2.1.91+)
```

> **Note**: When `disableSkillShellExecution` is enabled (v2.1.91+), skills that rely on inline shell execution (e.g., `codex-exec`, `gemini-exec`, `rtk-exec`) will have their shell blocks disabled. This is a security hardening option.

> **Note**: `isolation`, `background`, `maxTurns`, `maxTokens`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools`, `limitations` are supported in Claude Code v2.1.63+. Hook types `PostCompact`, `Elicitation`, `ElicitationResult` require v2.1.76+. `CwdChanged`, `FileChanged` hook events and `managed-settings.d/` drop-in directory require v2.1.83+. Conditional `if` field for hooks requires v2.1.85+. `PermissionDenied` hook event requires v2.1.88+. Monitor tool and subprocess sandboxing (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, `CLAUDE_CODE_SCRIPT_CAPS`) added in v2.1.98+. Settings resilience (unrecognized hook event names no longer cause settings.json to be ignored) improved in v2.1.101+. PreCompact hook block support (exit 2 / `{"decision":"block"}`) added in v2.1.105+. Skill description listing cap raised from 250 to 1,536 characters in v2.1.105+. Plugin `monitors` manifest key for background monitors added in v2.1.105+.

## Hook Event Types

All supported hook event types in Claude Code. Agents and skills can reference these in `hooks:` frontmatter.

| Event | Trigger | Data Available | Handler Types | CC Version |
|-------|---------|---------------|---------------|------------|
| `PreToolUse` | Before tool execution | tool, tool_input | command, prompt | v2.1.63+ |
| `PostToolUse` | After tool execution | tool, tool_input, tool_output | command, prompt | v2.1.63+ |
| `PreCompact` | Before context compaction | — | command, prompt | v2.1.76+ |
| `PostCompact` | After context compaction | — | command, prompt | v2.1.76+ |
| `Stop` | Session ending | — | command, prompt | v2.1.63+ |
| `SessionStart` | Session begins | — | command | v2.1.63+ |
| `SessionEnd` | Session fully closes | — | command | v2.1.76+ |
| `SubagentStart` | Subagent spawned | agent_type, model, description | command | v2.1.63+ |
| `SubagentStop` | Subagent completed | agent_type, model, result | command, prompt | v2.1.63+ |
| `UserPromptSubmit` | User submits prompt | user_input | command, prompt | v2.1.76+ |
| `Notification` | Long-running op completes | message | command | v2.1.76+ |
| `CwdChanged` | Working directory changes | old_cwd, new_cwd | command | v2.1.83+ |
| `FileChanged` | External file modification | file_path, change_type | command | v2.1.83+ |
| `Elicitation` | Agent requests user input | question | command, prompt | v2.1.76+ |
| `ElicitationResult` | User responds to elicitation | answer | command, prompt | v2.1.76+ |
| `PostMessage` | After message sent | message_type | command | v2.1.76+ |
| `PermissionDenied` | Auto mode classifier denial | tool, tool_input, denial_reason | command, prompt | v2.1.88+ |
| `TeammateIdle` | Agent Teams member idle | teammate_id | command | v2.1.83+ |
| `TaskCreated` | Task created | task_id, description | command | v2.1.83+ |
| `TaskCompleted` | Task completed | task_id, result | command | v2.1.83+ |

### Hook Handler Types

| Type | Behavior | Use Case |
|------|----------|----------|
| `command` | Execute shell command, stdin receives JSON context | Scripts, validation, logging |
| `prompt` | Inject text into model context | Rule reinforcement, advisory guidance |
| `http` | POST to HTTP endpoint | External integrations, webhooks |
| `agent` | Spawn agent to handle event | Complex event-driven workflows |

### PreToolUse Hook Return Values

| Return | Behavior | CC Version |
|--------|----------|------------|
| `exit 0` | Allow tool execution | All |
| `exit 1` | Block silently | All |
| `exit 2` + stderr | Block with message | All |
| `{"decision": "defer"}` | Pause execution; resume with `-p --resume` | v2.1.89+ |

The `defer` decision allows headless sessions to pause at a tool call for human review.

### PreCompact Hook Return Values

| Return | Behavior | CC Version |
|--------|----------|------------|
| `exit 0` | Allow compaction | All |
| `exit 2` + stderr | Block compaction with message | v2.1.105+ |
| `{"decision": "block"}` | Block compaction (JSON response) | v2.1.105+ |

PreCompact hooks can now prevent context compaction, useful for preserving critical context during multi-step workflows.

### Hook Matcher Syntax

```yaml
hooks:
  PreToolUse:
    - matcher: "tool == \"Edit\""       # Match specific tool
      if: "Edit(*.md)"                  # Conditional filter (v2.1.85+)
      command: "echo hook"
    - matcher: "*"                       # Match all
      command: "echo hook"
```

> **v2.1.85+**: `if` field supports permission rule syntax for conditional hook execution. **v2.1.88** extended `if` matching to support compound commands (`ls && git push`) and commands with env-var prefixes (`FOO=bar git push`).

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

## Fast Mode

Fast Mode uses the same model with faster output. Activated via `/fast` toggle or `fastMode` setting. Does NOT switch to a different model.

| Aspect | Normal | Fast Mode |
|--------|--------|-----------|
| Model | As configured | Same model |
| Output speed | Standard | ~2.5x faster |
| Reasoning depth | Full | Reduced |

### Activation

- `/fast` — toggle in current session
- `fastMode: true` in settings.json
- `CLAUDE_CODE_DISABLE_FAST_MODE=1` — env var to disable

### Interaction with Effort

When Fast Mode is active, it reduces effective reasoning depth but does NOT override the `effort` frontmatter field. The effort field controls task complexity allocation; Fast Mode controls output generation speed.

### Default Effort Change (CC v2.1.94+)

Starting with Claude Code v2.1.94, the default effort level changed from `medium` to `high` for API-key, Bedrock/Vertex/Foundry, Team, and Enterprise users. Console (free-tier) users retain `medium` as the default.

This means agents WITHOUT an explicit `effort` field now run at `high` effort by default on paid tiers. To maintain previous behavior, set `effort: medium` explicitly in agent frontmatter.

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
effort: medium              # low | medium | high | default | max — overrides model effort level when invoked
argument-hint: "<arg> [--flag]"  # CLI-style usage hint displayed in /help and command listings
model: sonnet                      # Override spawned model when skill is invoked via Agent
agent: mgr-creator                 # Preferred agent to execute this skill
hooks:                             # Skill-specific hooks (same syntax as agent hooks)
  PreToolUse:
    - matcher: "Bash"
      command: "echo hook"
paths: ["src/**/*.ts"]             # Conditional loading — skill auto-injected when matching files are open
shell: "bash"                      # Shell for embedded script execution
allowed-tools: [Read, Write, Bash] # Restrict tools available during skill execution
keep-coding-instructions: true     # Preserve coding instructions in plugin output styles (v2.1.94+)
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

Use `context: fork` for multi-agent orchestration skills only. Cap: **12 total**. Current: 12/12 (secretary/dev-lead/de-lead/qa-lead-routing, dag-orchestration, task-decomposition, worker-reviewer-pipeline, pipeline-guards, deep-plan, professor-triage, evaluator-optimizer, sauron-watch).

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

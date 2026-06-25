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
| `opus47` | claude-opus-4-7 | Latest Opus model, supports xhigh effort |
| `fable` | claude-fable-5 | Mythos-class; tier above Opus, highest GA capability (access added in CC v2.1.170) |

Extended context suffix: `[1m]` (e.g., `claude-opus-4-6[1m]`) — enables 1M token context window.

> **Claude Fable 5 (access via CC v2.1.170+)**: Mythos-class model, GA on the Claude API and positioned as a tier above Opus — its capabilities exceed any previously GA model. CC v2.1.170 is the client version that adds access (the model's GA is an API/platform property, not a CC-release milestone). Available via `model: fable` / `claude-fable-5`. Reserve for the most complex reasoning where its capability premium is warranted; `sonnet` remains the default for general tasks and `opus` for architecture (cost/latency awareness, R005). CC v2.1.170 also fixes session transcripts not saving (and not appearing in `--resume`) when launched from a VS Code integrated terminal or any shell inheriting Claude Code env vars — relevant to transcript-dependent skills (`homework`, `episodic-memory`). Closes #1352.

> **v2.1.173+**: Fable 5 model IDs carrying a `[1m]` suffix are now auto-normalized (the suffix is stripped) because Fable 5 includes 1M context by default. Use `claude-fable-5` / `model: fable` WITHOUT a `[1m]` suffix — appending it is redundant and normalized away. (The `[1m]` suffix remains meaningful for Opus/Sonnet IDs.)

### Fallback Models (CC v2.1.166+)

> **v2.1.166+**: The `fallbackModel` setting configures up to three fallback models tried in order when the primary model is overloaded or unavailable. `--fallback-model` now also applies to interactive sessions. CC additionally retries a turn once on the fallback model when the API rejects an unexpected non-retryable error (auth, rate-limit, request-size, and transport errors still surface immediately).

This is a settings-level resilience mechanism, distinct from the per-agent `model:` frontmatter. It complements the `model-escalation` skill (outcome-based escalation) by handling availability/overload failover at the platform level.

> **v2.1.178+**: Compaction now honors the `fallbackModel` chain — on overload or model-availability errors during context compaction, CC falls back to the configured fallback model instead of failing the compaction. Extends the v2.1.166 `fallbackModel` resilience to the compaction path.

### Thinking Toggle (CC v2.1.166+)

> **v2.1.166+**: `MAX_THINKING_TOKENS=0`, `--thinking disabled`, and the per-model thinking toggle disable thinking on models that think by default via the Claude API (3rd-party providers unchanged). Relevant when an agent's `effort` is low and thinking overhead is undesirable.

> **v2.1.183+**: CC now warns (stderr, in `-p` print mode) when the requested model is deprecated or auto-updated to a newer model — and this warning now ALSO covers models set in agent frontmatter (`model:`). Relevant to the Model Aliases table above: a stale/deprecated `model:` value in agent frontmatter now surfaces a deprecation warning instead of silently resolving. Separately, v2.1.183 fixes `thinking.disabled.display: Extra inputs are not permitted` 400 errors on subagent spawns and session-title generation — extends the v2.1.166 toggle above; subagent spawns with thinking disabled no longer 400.

> **v2.1.187+**: Org-configured model restrictions now apply to the model picker, `--model`, `/model`, and `ANTHROPIC_MODEL` (a restricted model shows "restricted by your organization's settings"). Extends the v2.1.175 `enforceAvailableModels` scope to per-agent `model:` override entry points — a managed model allowlist now also constrains the picker/env paths. Also fixed `--json-schema` / workflow `agent({schema})` structured output: the model can no longer re-call `StructuredOutput` indefinitely after a successful call, and follow-up turns reliably return structured output — relevant to schema-constrained subagent spawns.

### Safe Mode & Bundled Skill Control (CC v2.1.169+)

> **v2.1.169+**: `--safe-mode` (and `CLAUDE_CODE_SAFE_MODE`) starts Claude Code with ALL customizations disabled (CLAUDE.md, plugins, skills, hooks, MCP servers) — use it to isolate whether a project customization (agent/skill/hook) causes a regression. The `disableBundledSkills` setting (and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` env) hides bundled skills, workflows, and built-in slash commands from the model — useful when bundled skills conflict with or duplicate project skills (R006 skill-surface management). Note: `disableBundledSkills` hides skills from the model but is a CC platform setting, distinct from the advisory `skills:` frontmatter field (which is documentation metadata, not a runtime allowlist).

> **v2.1.172+**: `availableModels` restrictions now apply to subagent `model:` overrides, the agent dispatch model picker, and the advisor model. `availableModels` allowlists using version-specific IDs (e.g. `claude-opus-4-8`) no longer hide the Opus/Sonnet 1M picker rows, and model IDs no longer receive a doubled 1M suffix (`[1M][1m]`) when `ANTHROPIC_DEFAULT_OPUS_MODEL` already includes one. Relevant when restricting per-agent model overrides via `availableModels`.

> **v2.1.175+**: The `enforceAvailableModels` managed setting — when enabled, the `availableModels` allowlist also constrains the **Default** model: a Default that would resolve to a disallowed model now falls back to the first allowed model, and user or project settings can no longer widen a managed `availableModels` list. Extends the v2.1.172 `availableModels` scope (subagent `model:` overrides, dispatch picker, advisor model) to the Default model itself. Relevant when an enterprise/managed config pins the allowed model set — per-agent `model:` overrides AND the resolved Default both honor it.

### Optional Frontmatter

Key optional fields: `memory`, `effort`, `skills`, `soul`, `isolation`, `background`, `maxTurns`, `maxTokens`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools`, `limitations`, `domain`, `disableSkillShellExecution`. Supported since CC v2.1.63+. See full optional frontmatter via Read tool.

### Note on `skills:` field

The `skills:` frontmatter field is **advisory metadata** consumed by oh-my-customcode tooling (graph-builder, mgr-sauron) for documentation and validation. It is **NOT a runtime allowlist** — Claude Code does not filter the available skills based on this field, and subagents can invoke any registered skill regardless of what `skills:` declares. Use it to document a subagent's intended skill dependencies; do not rely on it for access control.

Reference: research findings on issue #1055 (closed not-planned).

<!-- DETAIL: Optional Frontmatter (full yaml block)
```yaml
memory: project            # user | project | local
effort: high               # low | medium | high | xhigh | default | max
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

> **Note**: When `disableSkillShellExecution` is enabled (v2.1.91+), skills that rely on inline shell execution (e.g., `rtk-exec`) will have their shell blocks disabled. This is a security hardening option.
-->

<!-- DETAIL: CC Version Compatibility History
`isolation`, `background`, `maxTurns`, `maxTokens`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools`, `limitations` are supported in Claude Code v2.1.63+. Hook types `PostCompact`, `Elicitation`, `ElicitationResult` require v2.1.76+. `CwdChanged`, `FileChanged` hook events and `managed-settings.d/` drop-in directory require v2.1.83+. Conditional `if` field for hooks requires v2.1.85+. `PermissionDenied` hook event requires v2.1.88+. `refreshInterval` setting for status line auto-refresh interval added in v2.1.97+. Monitor tool and subprocess sandboxing (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, `CLAUDE_CODE_SCRIPT_CAPS`) added in v2.1.98+. Settings resilience (unrecognized hook event names no longer cause settings.json to be ignored) improved in v2.1.101+. PreCompact hook block support (exit 2 / `{"decision":"block"}`) added in v2.1.105+. Skill description listing cap raised from 250 to 1,536 characters in v2.1.105+. Plugin `monitors` manifest key for background monitors added in v2.1.105+. `ENABLE_PROMPT_CACHING_1H` and `FORCE_PROMPT_CACHING_5M` env vars for prompt cache TTL control added in v2.1.108+. Skill tool can now discover and invoke built-in slash commands (`/init`, `/review`, `/security-review`) in v2.1.108+. `/recap` session context feature and `/undo` alias for `/rewind` added in v2.1.108+. `/tui` command and `tui` setting for fullscreen rendering added in v2.1.110+. PushNotification tool for mobile push notifications (Remote Control + config required) added in v2.1.110+. `autoScrollEnabled` config for fullscreen mode added in v2.1.110+. SDK/headless `TRACEPARENT`/`TRACESTATE` distributed trace linking added in v2.1.110+. Bash tool maximum timeout enforcement added in v2.1.110+. Write tool IDE diff feedback (informs model when user edits proposed content) added in v2.1.110+. `--resume`/`--continue` now resurrects unexpired scheduled tasks in v2.1.110+. `/focus` command (separated from Ctrl+O) added in v2.1.110+. `xhigh` effort level for Opus 4.7 (between `high` and `max`; other models fall back to `high`) added in v2.1.111+. `/effort` interactive slider with arrow-key navigation (when called without arguments) added in v2.1.111+. Auto mode no longer requires `--enable-auto-mode` in v2.1.111+. PowerShell tool progressive rollout (`CLAUDE_CODE_USE_POWERSHELL_TOOL` env var) added in v2.1.111+. Read-only bash commands with glob patterns (`ls *.ts`) and `cd <project-dir> &&` prefix no longer trigger permission prompt in v2.1.111+. `/less-permission-prompts` built-in skill for permission allowlist scanning added in v2.1.111+. `/ultrareview` parallel multi-agent cloud code review added in v2.1.111+. `/skills` menu sorting by estimated token count (press `t`) added in v2.1.111+. `OTEL_LOG_RAW_API_BODIES` env var for full API request/response body logging added in v2.1.111+. Plan files named after prompt content (not random words) in v2.1.111+. Plugin error handling improvements (dependency conflict errors, stale version recovery, install recovery) in v2.1.111+.
`sandbox.network.deniedDomains` setting for domain blocking within `allowedDomains` wildcards added in v2.1.113+. Subagent mid-stream stall detection with auto-fail after 10 minutes added in v2.1.113+. Bash `find -exec`/`-delete` no longer auto-approved under `Bash(find:*)` allow rules in v2.1.113+. Bash deny rules now match exec wrappers (`env`/`sudo`/`watch`/`ionice`/`setsid`) in v2.1.113+. Native binary spawning (per-platform optional dependency) replaces bundled JavaScript in v2.1.113+. `/loop` Esc now cancels pending wakeups in v2.1.113+.
Agent frontmatter `hooks:` fire when agent runs as main-thread agent via `--agent` flag (previously subagent-only) in v2.1.116+. `/reload-plugins` auto-installs missing plugin dependencies from added marketplaces in v2.1.116+.
Hook JSON output `terminalSequence` field for desktop notifications, window title changes, and terminal bells without controlling terminal added in v2.1.141+. `claude agents --cwd <path>` flag to scope session list to a directory added in v2.1.141+. Background agents launched via `/bg` now preserve current permission mode (no longer revert to default) in v2.1.141+. `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` env var to clone GitHub plugin sources over HTTPS instead of SSH added in v2.1.141+. `ANTHROPIC_WORKSPACE_ID` env var for workload identity federation workspace scoping added in v2.1.141+.
-->

## Hook Event Types

20 event types supported: PreToolUse, PostToolUse, PreCompact, PostCompact, Stop, SessionStart, SessionEnd, SubagentStart, SubagentStop, UserPromptSubmit, Notification, CwdChanged, FileChanged, Elicitation, ElicitationResult, PostMessage, PermissionDenied, TeammateIdle, TaskCreated, TaskCompleted. 4 handler types: command, prompt, http, agent. See full reference table via Read tool.

<!-- DETAIL: Hook Event Types Full Reference

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
-->

### Main-Thread Agent Hooks (v2.1.116+)

Agent frontmatter `hooks:` now fire when the agent runs as a main-thread agent via `--agent` flag. Previously, frontmatter hooks only fired when spawned as subagents via the Agent tool.

> **Note**: `/reload-plugins` now auto-installs missing plugin dependencies from added marketplaces (v2.1.116+).

> **v2.1.157+**: `settings.json` `agent` field is now honored for dispatched sessions (with `--agent <name>` override). `EnterWorktree` can switch between Claude-managed worktrees mid-session, and worktrees are left unlocked when the agent finishes (enabling `git worktree remove`/`prune` cleanup).

## Permission Mode Guidance

CC defaults `mode` to `acceptEdits` if not specified — always pass `mode: "bypassPermissions"` explicitly in Agent tool calls (see R010). See guidance details via Read tool.

| Mode | Behavior |
|------|----------|
| `default` | CC decides per-tool prompting |
| `acceptEdits` | Auto-accept file edits, prompt for others |
| `bypassPermissions` | Skip all permission prompts |
| `plan` | Require plan approval |
| `dontAsk` | Non-interactive, deny unapproved |
| `auto` | AI decides safety |

<!-- DETAIL: Permission Mode Guidance (reasoning)
When spawning agents via the Agent tool, CC applies a default `mode` of `acceptEdits` if not explicitly specified. To maintain consistent permission behavior:

1. **Agent frontmatter `permissionMode`**: Declares the agent's intended permission level. CC respects this when the agent is spawned via Agent tool.
2. **Agent tool `mode` parameter**: Overrides frontmatter at spawn time. Routing skills should pass this explicitly.
3. **Recommendation**: For agents that modify files, set `permissionMode: bypassPermissions` in frontmatter if the project uses `bypassPermissions` mode.
-->

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

### Sensitive Path Handling

> **Status (CC v2.1.121+)**: `.claude/`, `.git/`, `.vscode/` direct Write/Edit/Bash works without prompts under `mode: "bypassPermissions"`. The historical `/tmp/*.sh` bypass pattern is deprecated. See #1101.

Current CC behavior: under `bypassPermissions`, all `.claude/**` paths (including `.claude/outputs/**`, `.claude/agents/**`, `.claude/skills/**`, `.claude/rules/**`, `templates/.claude/**`) accept Write/Edit/Bash directly. Catastrophic shell operations remain blocked by independent safety guards.

**Recommended practice**:
1. Pass `mode: "bypassPermissions"` on every Agent tool call (R010 Universal bypassPermissions)
2. Use Write/Edit directly for `.claude/**` paths — no `/tmp/*.sh` wrapping needed
3. For CC < v2.1.121: see git history of this section (pre-v0.126.0) for the legacy bypass pattern

<!-- DETAIL: Pre-v2.1.121 sensitive path behavior (historical)
| Path | Tool | Allow rule | Result (CC < v2.1.121) |
|------|------|-----------|--------|
| `.claude/**` | Bash (`cp`, `mkdir`, `rm`) | `Bash(*)` allowed | Prompt (sensitive-path overrode) |
| `.claude/**` | Write, Edit | `Write(.claude/**)` allowed | Prompt (sensitive-path overrode) |
| `templates/.claude/**` | Write, Edit | `Write(templates/.claude/**)` allowed | Prompt (#960, #961, #981) |
| `.claude/outputs/**` | Write, Edit | `Write(.claude/outputs/**)` | Prompt (#1043) |
| `.claude/outputs/**` | Bash via `/tmp/*.sh` | — | Allowed (legacy bypass) |
-->

<!-- DETAIL: Cross-references
- `feedback_sensitive_path*.md` — historical (pre-v2.1.121) memories, marked with status: historical (#1101)
- `feedback_templates_claude_glob.md` — `.claude/**` glob does not cover `templates/.claude/**`, separate allow rules required (still applies for non-bypassPermissions modes)
-->

### Artifact Channel Protocol

에이전트 간 결과 핸드오프 시 **아티팩트 파일을 채널로 사용**하는 프로토콜. 기존 Artifact Output Convention의 경로 규약을 에이전트 통신 계약으로 승격합니다.

#### 원칙

| 원칙 | 내용 |
|------|------|
| Path-only transfer | 다음 에이전트에 전달할 때 **파일 경로만 전달**, 본문 inline 전달 금지 |
| Read-write 분리 | 생산 에이전트는 Write, 소비 에이전트는 Read (파일 경쟁 방지) |
| Session-scoped | 아티팩트는 세션 범위 — `{YYYY-MM-DD}` 디렉토리로 격리 |
| Single-writer | 한 아티팩트는 하나의 에이전트만 작성. 후속 에이전트는 새 아티팩트 생성 |

#### 사용 맥락

1. **Parallel agents → Aggregator**: N 병렬 에이전트가 각자 `skill-HHmmss.md` 작성 → aggregator가 N개 경로를 받아 단일 요약 생성
2. **Research → Planner**: research 에이전트가 findings를 아티팩트로 저장 → planner가 경로 참조로 계획 수립
3. **Pipeline steps**: 단계별 state를 파일 기반으로 체크포인트 (Tracker 패턴의 전단계)

#### 관련 규약

- R013 SHOULD-ecomode.md Deep Insight Context Handoff Pattern (per-agent budget + handoff protocol)
- `result-aggregation` 스킬 (channel read pattern 구현)
- R011 SHOULD-memory-integration.md (장기 persistence는 memory, 세션 handoff는 channel)

<!-- DETAIL: Artifact Output full spec
**Format**: Metadata header with `skill`, `date`, `query` fields, followed by skill output content.
**Rules**: Opt-in per skill, final subagent writes (R010 compliance), Write tool auto-creates parent directory (no Bash `mkdir` required — avoids `.claude/` sensitive-path prompt per #960/#961/#978), .claude/outputs/ is git-untracked, no indexing required.
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

See activation, effort interaction, and default effort change details via Read tool.

<!-- DETAIL: Fast Mode Activation, Effort Interaction, Default Effort Change
### Activation

- `/fast` — toggle in current session
- `fastMode: true` in settings.json
- `CLAUDE_CODE_DISABLE_FAST_MODE=1` — env var to disable

### Interaction with Effort

When Fast Mode is active, it reduces effective reasoning depth but does NOT override the `effort` frontmatter field. The effort field controls task complexity allocation; Fast Mode controls output generation speed.

### Default Effort Change (CC v2.1.94+)

Starting with Claude Code v2.1.94, the default effort level changed from `medium` to `high` for API-key, Bedrock/Vertex/Foundry, Team, and Enterprise users. Console (free-tier) users retain `medium` as the default.

This means agents WITHOUT an explicit `effort` field now run at `high` effort by default on paid tiers. To maintain previous behavior, set `effort: medium` explicitly in agent frontmatter.
-->

## Skill Frontmatter

Location: `.claude/skills/{name}/SKILL.md`

### Required Fields

```yaml
name: skill-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
```

### Optional Fields

Key optional fields: `scope`, `context`, `version`, `effort`, `model`, `agent`, `hooks`, `paths`, `shell`, `allowed-tools`, `keep-coding-instructions`. Skill `effort` takes precedence over agent `effort` when both specified. See full optional fields via Read tool.

> **v2.1.163+**: In skill `command` bodies, use `\$` to emit a literal `$` before a number (e.g., `\$1`) — previously ambiguous with shell variable expansion. Relevant when authoring skills with `shell:` or inline command steps that include dollar signs not intended as variables.

> **v2.1.178+**: Skills in nested `.claude/skills` directories now load when working on files in that subtree; on a name clash with a higher-scope skill, the nested skill is surfaced as `<dir>:<name>` so both remain invokable. Directory-qualified nested skills also no longer trigger permission prompts in non-interactive runs. Additionally, MCP-spec entries (`mcp__server`, `mcp__server__*`, `mcp__*`) in a subagent's `disallowedTools` are now honored (previously silently ignored) — relevant to the Optional Frontmatter `disallowedTools` field. oh-my-customcode keeps a flat `.claude/skills/` layout, but the `<dir>:<name>` disambiguation matters if a nested project subtree introduces a same-named skill.

> **v2.1.178+**: When names collide across nested `.claude/` directories, the agent, workflow, and output-style CLOSEST to the working directory now wins; project-scope workflow saves target the closest existing `.claude/workflows/`. Relevant to multi-`.claude/` layouts — project-root `.claude/` definitions are overridden by a nested `.claude/` when working inside that subtree.

<!-- DETAIL: Skill Optional Fields (full yaml block)
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
-->

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

Use `context: fork` for multi-agent orchestration skills only. Cap: **12 total**. Current: 10/12 (secretary/dev-lead/de-lead/qa-lead-routing, dag-orchestration, task-decomposition, worker-reviewer-pipeline, deep-plan, professor-triage, roundtable-debate).

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

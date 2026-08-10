# [MUST] Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Agent File Format

Location: `.claude/agents/{name}.md` (single file, kebab-case)

### Required Frontmatter

```yaml
name: agent-name           # Unique identifier (kebab-case)
description: Brief desc    # One-line summary
model: sonnet              # CC-native alias (Tier 1) or full model ID (Tier 2) — see "Model Specification — 3 Tiers" below
tools: [Read, Write, ...]  # Allowed tools
```

<!-- ARCHIVED CC version note (historical):
> **v2.1.208+**: The Agent tool no longer launches with no tools when a subagent's `tools:` list resolves to nothing — it now returns a clear error naming the unrecognized entries, catching frontmatter `tools:` typos that previously failed silently.
-->

### Model Specification — 3 Tiers

Model values resolve differently depending on WHERE they are written. Mixing tiers causes a value that is valid in one place to silently fail spawn in another (measured this session: `sonnet5`/`opus5`/`opus48` are invented names this project had documented as if they were CC-recognized — CC v2.1.220 does not resolve them, and spawn fails immediately).

#### Tier 1 — CC-native aliases (valid in BOTH frontmatter `model:` AND the Agent tool `model` parameter)

| Alias | Use Case |
|-------|----------|
| `haiku` | Fast, cheap tasks (search, simple edits) |
| `sonnet` | General tasks, code generation (default) |
| `opus` | Complex reasoning, architecture |
| `opusplan` | Opus + plan mode; architecture planning with approval gates |
| `inherit` | Inherit the parent session's model |

**CC resolves these, not this project.** This project cannot "pin" an alias to a specific version — measured: a frontmatter `model: sonnet` agent executed as `claude-sonnet-5` (CC v2.1.197+ default), not a project-fixed `claude-sonnet-4-6`. Treat any "currently resolves to X" statement as a snapshot that changes when CC's own default changes.

#### Tier 2 — Full model IDs (frontmatter `model:` ONLY — recommended for stability)

| Full ID | Use Case |
|---------|----------|
| `claude-haiku-4-5` | Fast, cheap tasks |
| `claude-sonnet-5` | Native 1M context; current CC default Sonnet (v2.1.197+) |
| `claude-opus-4-6` | Opus, previous generation |
| `claude-opus-4-8` | Opus, previous generation; supports xhigh effort |
| `claude-opus-5` | Latest Opus (GA); native 1M context, fast mode at $10/$50 per Mtok |
| `claude-fable-5` | Mythos-class; tier above Opus (access via CC v2.1.170+) |

Full IDs are valid ONLY in agent frontmatter — the Agent tool's `model:` spawn parameter does NOT accept them (see Tier 3). Writing the full ID directly (not a project-invented shorthand) pins the agent regardless of future CC default changes. This is the recommended way to opt into Sonnet 5 / Opus 5 / Fable 5 explicitly rather than riding CC's Tier-1 default resolution.

Extended context suffix: `[1m]` (e.g., `claude-opus-4-6[1m]`) — enables 1M token context window.

#### Tier 3 — Agent tool `model` parameter (spawn-time override, enum of exactly 4 values)

```
Agent(subagent_type: "...", model: "opus", mode: "bypassPermissions", prompt: "...")
```

The Agent tool's `model` parameter accepts ONLY `sonnet` | `opus` | `haiku` | `fable`. It does NOT accept full model IDs (Tier 2) and does NOT accept `sonnet5`/`opus5`/`opus48` (never valid anywhere — retire these names). Note `fable` is valid HERE (Tier 3) but is NOT a Tier-1 frontmatter alias — Fable 5 in frontmatter requires the Tier-2 full ID `claude-fable-5`.

Skill/rule text instructing "spawn with `model: opus`" refers to this tier — always the bare 4-value alias, never a full ID.

> **v2.1.219+**: Claude Opus 5 (`claude-opus-5`) added. Opt in via the Tier-2 full ID in frontmatter; Tier-1 `opus`/`sonnet` alias resolution is CC-controlled (see Tier 1 above — this project does not pin it). Relative standing vs Fable 5 is not yet confirmed officially — do not assert an ordering.

> **v2.1.222+**: **org-restricted 환경에서** `model: opus` 계열 subagent/teammate의 family alias가 parent model로 떨어지던 문제가 수정되어, 이제 해당 family 내에서 org가 허용한 **최신 모델로 step-down**합니다. 이는 Tier 1의 "CC resolves these, not this project" 원칙을 강화하는 사례입니다 — Tier-1 alias 해석에는 **org 제한이라는 추가 변수**가 있어 프로젝트가 pin할 수 없으므로, 특정 모델을 확정하려면 frontmatter에 **Tier-2 full ID**를 씁니다. Agent 도구 spawn 파라미터(Tier 3)는 full ID를 받지 않으므로 이 경로에서는 alias 해석이 org 설정에 좌우됩니다. (본 저장소의 org 제한 여부는 미실측 — 위 조건절이 적용 범위입니다.)

> **v2.1.223+**: workflow agent · forked skill · slash command · 재개된 background agent가 **요청한 subagent 모델이 제한되어 parent model로 실행될 때 경고가 표시**됩니다. 위 v2.1.222 org step-down 노트의 직접 연장선으로, 이전에는 이 강등이 **무음**이었습니다 — 즉 "`model: opus`로 스폰했다"는 기록이 실제 실행 모델의 증거가 아니었습니다. 특정 모델을 확정하려면 frontmatter Tier-2 full ID를 쓰고, 실행 모델은 경고 표시 유무로 확인합니다(R020 "attempt ≠ outcome"의 모델 선택 각도).

> **v2.1.223+**: `CLAUDE_CODE_DISABLE_1M_CONTEXT`가 **native 1M 창을 가진 모든 Claude 모델**을 auto-compaction으로 200K에 유지하도록 확대되었습니다(이전에는 고정 모델 목록). 미인식 model ID도 가정 컨텍스트 창 내로 유지되며 `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`로 복원할 수 있습니다. 위 Tier-2 표의 `claude-sonnet-5`/`claude-opus-5`(native 1M)와 `[1m]` 접미사는 이 env가 설정된 환경에서 **실효 200K로 동작**하므로, 1M 전제의 대용량 컨텍스트 위임 전에 env 설정 여부를 확인합니다(cross-ref R013 context budget).

> **Claude Fable 5 (access via CC v2.1.170+)**: Mythos-class model, GA on the Claude API and positioned as a tier above Opus — its capabilities exceed any previously GA model. CC v2.1.170 is the client version that adds access (the model's GA is an API/platform property, not a CC-release milestone). Available via frontmatter full ID `claude-fable-5` (Tier 2) or Agent tool `model: fable` (Tier 3) — NOT via a Tier-1 frontmatter alias. Reserve for the most complex reasoning where its capability premium is warranted; `sonnet` remains the default for general tasks and `opus` for architecture (cost/latency awareness, R005). CC v2.1.170 also fixes session transcripts not saving (and not appearing in `--resume`) when launched from a VS Code integrated terminal or any shell inheriting Claude Code env vars — relevant to transcript-dependent skills (`homework`, `episodic-memory`). Closes #1352.

<!-- ARCHIVED CC version notes (historical):
> **v2.1.173+**: Fable 5 model IDs carrying a `[1m]` suffix are now auto-normalized (the suffix is stripped) because Fable 5 includes 1M context by default. Use `claude-fable-5` / `model: fable` WITHOUT a `[1m]` suffix — appending it is redundant and normalized away. (The `[1m]` suffix remains meaningful for Opus/Sonnet IDs.)

> **v2.1.197+**: Claude Sonnet 5가 Claude Code의 **기본 모델**로 도입되었습니다 — 네이티브 1M-token 컨텍스트, 프로모션 가격 $2/$10 per Mtok(2026-08-31까지). frontmatter에서 명시 opt-in하려면 Tier-2 full ID `claude-sonnet-5`를 사용합니다(`sonnet5`는 어느 계층에서도 유효한 값이 아님 — 위 3-Tier 구분 참조). **정정(실측)**: 이 조항이 이전에 "oh-my-customcode의 base `sonnet` alias는 안정성을 위해 `claude-sonnet-4-6`에 고정 유지"라고 서술했으나 사실이 아니다 — `sonnet` alias 해석 주체는 CC이며 프로젝트가 pin할 수 없다(Tier 1 참조); frontmatter `model: sonnet` 에이전트가 실측상 `claude-sonnet-5`로 실행되었다. Sonnet 5가 CC 신규 기본값이므로 명시 모델 없는 세션은 이제 Sonnet 5에서 동작합니다.

> **v2.1.201+**: Claude Sonnet 5 세션이 harness reminder를 mid-conversation system role로 주입하지 않도록 변경되었습니다 — Sonnet 5 실행 시 하니스 리마인더(규칙 재주입 등) 전달 방식이 조정되었으며, PostCompact 규칙 재주입(R021)·세션 연속성 동작 자체에는 영향이 없습니다. Sonnet 5가 CC 기본 모델(v2.1.197+)이므로 명시 모델 없는 세션에 적용됩니다.
-->

> **Fable 5 Effort 전략**: Fable 5는 **high effort가 기본값**이며, `xhigh`는 capability-sensitive 작업(최고난도 아키텍처/추론)에 한정해야 합니다. Fable 5의 `low`/`medium` effort조차 이전 세대 모델의 `xhigh`를 상회하는 품질을 보이므로, Fable 5를 사용하는 실행 에이전트는 `effort` 필드를 신중히 명시하고 불필요한 `xhigh` 남용을 지양합니다(R005 비용/지연 인식과 정합).

> **Mythos 5 (`claude-mythos-5`)**: Project Glasswing 한정 공급 모델로, **GA가 아닙니다** — Fable 5(GA, 위 "Model Specification — 3 Tiers"의 `claude-fable-5`/`fable`)와 구분해야 합니다. 특성: adaptive-thinking 전용 아키텍처 + 안전 분류기가 개입 시 `stop_reason: "refusal"`로 fallback하는 체계를 가집니다. oh-my-customcode 에이전트 frontmatter에는 아직 alias를 등록하지 않습니다(비-GA, 공급 제한).

> **프롬프팅 패턴 상호참조**: Fable 5/Mythos 5 대상 프롬프팅 패턴(effort 조합, adaptive-thinking 활용, refusal fallback 대응)의 상세 가이드는 `guides/claude-code/16-fable5-prompting.md`를 참조하세요.

### Fallback Models (CC v2.1.166+)

<!-- ARCHIVED CC version note (historical):
> **v2.1.166+**: The `fallbackModel` setting configures up to three fallback models tried in order when the primary model is overloaded or unavailable. `--fallback-model` now also applies to interactive sessions. CC additionally retries a turn once on the fallback model when the API rejects an unexpected non-retryable error (auth, rate-limit, request-size, and transport errors still surface immediately).
-->

This is a settings-level resilience mechanism, distinct from the per-agent `model:` frontmatter. It complements the `model-escalation` skill (outcome-based escalation) by handling availability/overload failover at the platform level.

<!-- ARCHIVED CC version note (historical): > **v2.1.178+**: Compaction now honors the `fallbackModel` chain — on overload or model-availability errors during context compaction, CC falls back to the configured fallback model instead of failing the compaction. Extends the v2.1.166 `fallbackModel` resilience to the compaction path. -->

### Thinking Toggle (CC v2.1.166+)

<!-- ARCHIVED CC version note (historical):
> **v2.1.166+**: `MAX_THINKING_TOKENS=0`, `--thinking disabled`, and the per-model thinking toggle disable thinking on models that think by default via the Claude API (3rd-party providers unchanged). Relevant when an agent's `effort` is low and thinking overhead is undesirable.
-->

<!-- ARCHIVED CC version notes (historical):
> **v2.1.183+**: CC now warns (stderr, in `-p` print mode) when the requested model is deprecated or auto-updated to a newer model — and this warning now ALSO covers models set in agent frontmatter (`model:`). Relevant to "Model Specification — 3 Tiers" above: a stale/deprecated `model:` value in agent frontmatter now surfaces a deprecation warning instead of silently resolving. Separately, v2.1.183 fixes `thinking.disabled.display: Extra inputs are not permitted` 400 errors on subagent spawns and session-title generation — extends the v2.1.166 toggle above; subagent spawns with thinking disabled no longer 400.

> **v2.1.187+**: Org-configured model restrictions now apply to the model picker, `--model`, `/model`, and `ANTHROPIC_MODEL` (a restricted model shows "restricted by your organization's settings"). Extends the v2.1.175 `enforceAvailableModels` scope to per-agent `model:` override entry points — a managed model allowlist now also constrains the picker/env paths. Also fixed `--json-schema` / workflow `agent({schema})` structured output: the model can no longer re-call `StructuredOutput` indefinitely after a successful call, and follow-up turns reliably return structured output — relevant to schema-constrained subagent spawns.

> **v2.1.196+**: 조직 기본 모델(org default models)이 추가되어 관리자가 org 콘솔에서 조직 전체 기본 모델을 설정하며, 사용자가 직접 선택하지 않으면 `/model`에 "Org default"(또는 "Role default")로 표시됩니다. v2.1.175 `enforceAvailableModels`/v2.1.187 org model restriction의 연장선 — 조직 관리 설정이 기본 모델 해석까지 관여합니다. 또한 백그라운드 세션 turn 이후 중복 recap 라인 문제를 수정 — schema-rejected된 StructuredOutput 시도가 재시도와 나란히 렌더되지 않습니다(schema-constrained subagent spawn / Workflow `agent({schema})`에 관련).

> **v2.1.198+**: 내장 Explore 에이전트가 이제 main session의 모델을 상속합니다(opus로 cap; 이전에는 haiku 고정) — Explore 기반 검색 subagent의 추론 품질이 향상됩니다. 또한 subagent와 context compaction이 session의 extended thinking 설정을 상속하여, 위임된 작업의 출력 품질이 세션 설정과 정합됩니다. R009/R018 병렬 subagent 위임 품질에 관련.
-->

### Safe Mode & Bundled Skill Control (CC v2.1.169+)

<!-- ARCHIVED CC version note (historical):
> **v2.1.169+**: `--safe-mode` (and `CLAUDE_CODE_SAFE_MODE`) starts Claude Code with ALL customizations disabled (CLAUDE.md, plugins, skills, hooks, MCP servers) — use it to isolate whether a project customization (agent/skill/hook) causes a regression. The `disableBundledSkills` setting (and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` env) hides bundled skills, workflows, and built-in slash commands from the model — useful when bundled skills conflict with or duplicate project skills (R006 skill-surface management). Note: `disableBundledSkills` hides skills from the model but is a CC platform setting, distinct from the advisory `skills:` frontmatter field (which is documentation metadata, not a runtime allowlist).
-->

<!-- ARCHIVED CC version notes (historical):
> **v2.1.172+**: `availableModels` restrictions now apply to subagent `model:` overrides, the agent dispatch model picker, and the advisor model. `availableModels` allowlists using version-specific IDs (e.g. `claude-opus-4-8`) no longer hide the Opus/Sonnet 1M picker rows, and model IDs no longer receive a doubled 1M suffix (`[1M][1m]`) when `ANTHROPIC_DEFAULT_OPUS_MODEL` already includes one. Relevant when restricting per-agent model overrides via `availableModels`.

> **v2.1.175+**: The `enforceAvailableModels` managed setting — when enabled, the `availableModels` allowlist also constrains the **Default** model: a Default that would resolve to a disallowed model now falls back to the first allowed model, and user or project settings can no longer widen a managed `availableModels` list. Extends the v2.1.172 `availableModels` scope (subagent `model:` overrides, dispatch picker, advisor model) to the Default model itself. Relevant when an enterprise/managed config pins the allowed model set — per-agent `model:` overrides AND the resolved Default both honor it.
-->

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
  path: haiku → sonnet → opus  # Escalation sequence (Tier-3 Agent-tool aliases only)
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

31 event types supported: SessionStart, Setup, UserPromptSubmit, UserPromptExpansion, PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, PostToolBatch, Notification, MessageDisplay, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, DirectoryAdded, FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact, Elicitation, ElicitationResult, SessionEnd. 4 handler types: command, prompt, http, agent. See full reference table via Read tool.

> **`MessageDisplay`는 표시 전용 — `additionalContext` 미지원**: `MessageDisplay`는 `hookSpecificOutput.displayContent`로 **화면 표시 텍스트만** 교체하며, 트랜스크립트와 Claude가 보는 내용은 원본이 유지된다. 따라서 advisory 훅을 `MessageDisplay`에 배선하면 **모델에 도달하지 않는다**. `additionalContext`(모델 컨텍스트 주입)를 지원하는 이벤트는 SessionStart, Setup, SubagentStart, UserPromptSubmit, UserPromptExpansion, PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop이다. (이전 판이 나열하던 `PostMessage`는 문서화된 이벤트가 아니다 — 실제 이벤트명은 `MessageDisplay`.)

> **신규 이벤트 발동 시점**: `Setup` — `--init-only`, 또는 `-p` 모드에서 `--init`/`--maintenance`로 시작할 때. `UserPromptExpansion` — 사용자가 입력한 커맨드가 프롬프트로 확장될 때(모델 도달 전; 확장 차단 가능). `PostToolUseFailure` — 도구 호출이 실패한 뒤. `PostToolBatch` — 병렬 도구 호출 배치 전체가 끝난 뒤, 다음 모델 호출 전. `MessageDisplay` — assistant 메시지 텍스트가 표시되는 동안(실시간 스트리밍). `DirectoryAdded` (v2.1.219+) — `/add-dir` 또는 SDK `register_repo_root`로 작업 디렉토리가 세션 중 추가될 때. (그 밖의 신규 이벤트 — `PermissionRequest`, `StopFailure`, `InstructionsLoaded`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove` — 는 발동 시점을 미실측이므로 서술하지 않는다.)

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
| `MessageDisplay` | While assistant message text is displayed (live streaming); `displayContent` only — does NOT support `additionalContext` | — (not stated) | — (not stated) | not stated |
| `PermissionDenied` | Auto mode classifier denial | tool, tool_input, denial_reason | command, prompt | v2.1.88+ |
| `TeammateIdle` | Agent Teams member idle | teammate_id | command | v2.1.83+ |
| `TaskCreated` | Task created | task_id, description | command | v2.1.83+ |
| `TaskCompleted` | Task completed | task_id, result | command | v2.1.83+ |
| `DirectoryAdded` | New working directory registered mid-session (`/add-dir` or SDK `register_repo_root`) | old dirs, new_dir | command | v2.1.219+ |

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

> **v2.1.214+**: 단일 세그먼트 `dir/**` 형태의 hook `if:` 조건이 이제 `<cwd>/dir`에만 매칭됩니다(any-depth 아님) — 모든 깊이를 매칭하려면 `**/dir/**`로 작성. 같은 버전에서 `allow` 규칙도 `<cwd>/dir`로 좁혀져 hook `if:`와 정렬되었지만, `deny`/`ask` 규칙은 any-depth 매칭을 유지합니다. 파일명 glob(예: `Edit(*.md)`)은 영향 없음. (위 v2.1.85+ `if:` 노트의 연장.)
-->

### Main-Thread Agent Hooks (v2.1.116+)

Agent frontmatter `hooks:` now fire when the agent runs as a main-thread agent via `--agent` flag. Previously, frontmatter hooks only fired when spawned as subagents via the Agent tool.

> **Note**: `/reload-plugins` now auto-installs missing plugin dependencies from added marketplaces (v2.1.116+).

<!-- ARCHIVED CC version notes (historical):
> **v2.1.157+**: `settings.json` `agent` field is now honored for dispatched sessions (with `--agent <name>` override). `EnterWorktree` can switch between Claude-managed worktrees mid-session, and worktrees are left unlocked when the agent finishes (enabling `git worktree remove`/`prune` cleanup).

> **v2.1.191+**: Hooks with comma-separated matchers (e.g. `"Bash,PowerShell"`) now fire correctly — previously such matchers silently never fired. Relevant when authoring `.claude/hooks/` entries that target multiple tools in one matcher.

> **v2.1.195+**: 하이픈이 포함된 hook matcher 식별자(예: `code-reviewer`, `mcp__brave-search`)가 이제 substring이 아니라 exact-match됩니다(이전에는 부분 문자열로 우연히 매칭). 하이픈 포함 MCP 서버의 모든 tool을 매칭하려면 `mcp__brave-search__.*` 형식을 사용하세요. 참고: oh-my-customcode의 `hooks.json`은 `*` / `mcp_tool_name matches "..."` / `tool == "..."` 형식을 사용하므로 이 변경의 영향을 받지 않습니다 — 다만 하이픈 포함 tool-name matcher를 새로 추가할 때 exact-match 시맨틱을 고려해야 합니다.

> **v2.1.199+**: SessionStart/Setup/SubagentStart hook이 exit code 2로 종료할 때 stderr를 조용히 숨기던 문제가 수정되어 이제 오류가 표시됩니다. `.claude/hooks.json`의 hard-block/advisory hook 디버깅 가시성이 향상됩니다(R021 Enforcement Tiers 관측성과 정합).
-->

<!-- ARCHIVED CC version note (historical):
> **v2.1.204+**: headless 세션의 SessionStart hook 중 hook 이벤트가 스트리밍되지 않아 remote worker가 hook 도중 idle-reap되던 문제가 수정되었습니다. Hook Event Types/SessionStart 관련.
-->

## Permission Mode Guidance

> Canonical source for the bypassPermissions requirement: R010 (MUST-orchestrator-coordination.md) "Universal bypassPermissions". CC defaults `mode` to `acceptEdits` if not specified — always pass `mode: "bypassPermissions"` explicitly in Agent tool calls. See R010 for the full requirement, rationale, and self-check.

| Mode | Behavior |
|------|----------|
| `default` | CC decides per-tool prompting |
| `acceptEdits` | Auto-accept file edits, prompt for others |
| `bypassPermissions` | Skip all permission prompts |
| `plan` | Require plan approval |
| `dontAsk` | Non-interactive, deny unapproved |
| `auto` | AI decides safety |

<!-- ARCHIVED CC version note (historical):
> **v2.1.200+**: `default` 모드가 CLI·`--help`·VS Code·JetBrains에서 "Manual"로 표기됩니다 — `--permission-mode manual` / `"defaultMode": "manual"`이 `default`와 병행 허용(동일 동작). 위 표의 `default` row는 그대로 유효하며 UI 라벨만 "Manual"로 노출됩니다. cross-ref R002.
-->

> **v2.1.212+**: Agent(구 Task) tool의 `mode` 파라미터가 **deprecated되어 무시됩니다** — subagent는 **기본적으로** 부모(오케스트레이터) 세션의 permission mode를 상속합니다. 위 "CC defaults `mode` to `acceptEdits`" 서술과 R010 Universal bypassPermissions의 per-call `mode: "bypassPermissions"` 지정은 플랫폼 레벨에서 no-op가 됩니다(명시 지정 자체는 무해). 무인 실행의 실제 bypass 여부는 이제 부모 세션 mode가 결정하므로, 오케스트레이터 세션을 bypassPermissions로 유지하는 것이 핵심입니다. Canonical owner는 R010.

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
| `path` | haiku → sonnet → opus | Model upgrade sequence (Tier-3 Agent-tool aliases only) |
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

<!-- ARCHIVED CC version note (historical):
> **v2.1.163+**: In skill `command` bodies, use `\$` to emit a literal `$` before a number (e.g., `\$1`) — previously ambiguous with shell variable expansion. Relevant when authoring skills with `shell:` or inline command steps that include dollar signs not intended as variables.
-->

<!-- ARCHIVED CC version notes (historical):
> **v2.1.178+**: Skills in nested `.claude/skills` directories now load when working on files in that subtree; on a name clash with a higher-scope skill, the nested skill is surfaced as `<dir>:<name>` so both remain invokable. Directory-qualified nested skills also no longer trigger permission prompts in non-interactive runs. Additionally, MCP-spec entries (`mcp__server`, `mcp__server__*`, `mcp__*`) in a subagent's `disallowedTools` are now honored (previously silently ignored) — relevant to the Optional Frontmatter `disallowedTools` field. oh-my-customcode keeps a flat `.claude/skills/` layout, but the `<dir>:<name>` disambiguation matters if a nested project subtree introduces a same-named skill.

> **v2.1.178+**: When names collide across nested `.claude/` directories, the agent, workflow, and output-style CLOSEST to the working directory now wins; project-scope workflow saves target the closest existing `.claude/workflows/`. Relevant to multi-`.claude/` layouts — project-root `.claude/` definitions are overridden by a nested `.claude/` when working inside that subtree.

> **v2.1.199+**: 스택된 slash-skill 호출(`/skill-a /skill-b do XYZ`)이 이제 leading skill을 최대 5개까지 모두 로드합니다(이전에는 첫 번째만 로드). oh-my-customcode의 라우팅 스킬 체이닝(예: `/omcustom:fsd`가 여러 스킬을 연쇄 호출하는 패턴)에서 다중 스킬 스택 호출 시 컨텍스트 손실이 줄어듭니다. 또한 subagent 조회 중 `/model`·`/fast`를 입력하면 lead의 model picker가 열리며 notice가 표시됩니다.
-->

> **v2.1.210+**: 스킬/커맨드 본문에서 인자 없이 호출된(unmatched) `$1`/`$2` positional placeholder가 조용히 제거되던(silently stripped) 동작이 수정되어 이제 리터럴 `$1`로 verbatim 보존됩니다 — 인자 부재 시 `$1`이 확장된 프롬프트에 그대로 남아 지시가 깨지므로, silent stripping에 옵션-인자 처리를 의존하지 말고 인자 부재 케이스를 명시 처리(default text / `$ARGUMENTS` guard / `argument-hint`)해야 합니다. (위 v2.1.163+ `\$1` escape는 항상 리터럴 `$` 출력용 별개 메커니즘으로 이번 변경 대상이 아니며, 이번 수정은 치환 의도의 bare `$1`이 unmatched일 때만 적용됩니다.)

> **v2.1.222+**: 스킬 frontmatter의 `disable-model-invocation: true`(모델이 스스로 그 스킬을 호출하지 못하게 막고 사용자/파이프라인의 명시적 호출만 허용하는 필드)가 설정된 스킬을 모델이 호출하려 할 때의 refusal 문구가 개선되어, 모델에게 **워크플로우를 스스로 복제하지 말고 사용자에게 실행을 요청하라**고 지시합니다. 무인 루프(`/fsd` 등)가 이런 스킬을 모델 호출 경로에 두면 실행 대신 refusal이 반환되므로, 해당 스킬은 **사용자/파이프라인 명시 호출**로 설계합니다.

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

# [MUST] Permission Rules

> **Priority**: MUST | **ID**: R002

## Tool Permission Tiers

| Tier | Tools | Policy |
|------|-------|--------|
| 1: Always | Read, Glob, Grep, ToolSearch | Free use, read-only |
| 2: Default | Write, Edit, NotebookEdit | State changes explicitly, notify before modifying important files |
| 3: Context | Agent, Skill, EnterPlanMode, ExitPlanMode, EnterWorktree, ExitWorktree, LSP, Monitor, TodoWrite, AskUserQuestion, PushNotification | Context-dependent, no user approval needed |
| 4: Approval | Bash, PowerShell, WebFetch, WebSearch | Request user approval on first use |
| 5: Conditional | TeamCreate, TeamDelete, SendMessage, TaskCreate, TaskGet, TaskList, TaskUpdate, TaskStop, TaskOutput | Available when Agent Teams enabled |
| 6: MCP | ListMcpResourcesTool, ReadMcpResourceTool, CronCreate, CronDelete, CronList, RemoteTrigger | MCP/extension tools, available when servers configured |

## File Access

| Operation | Allowed | Prohibited |
|-----------|---------|-----------|
| Read | All source, configs, docs | - |
| Write | Source code, new files in project, `.claude/**` (CC v2.1.121+ under `bypassPermissions`) | .env, .git/config, paths outside project |
| Delete | Temp files created by agent | Existing files (without request), entire directories |

> **Sensitive paths note**: As of CC v2.1.121 (2026-04-28) and further relaxed in v2.1.126 (2026-05-01), `.claude/`, `.git/`, `.vscode/` are no longer prompted for Write/Edit/Bash under `mode: "bypassPermissions"`. The legacy `/tmp/*.sh` script bypass (R010 historical section) is deprecated for CC >= v2.1.121. Catastrophic operations (`rm -rf /`) remain blocked. See #1101.

## Permission Request Format

```
[Permission Request]
Action: {action} | Required: {tool} | Reason: {why} | Risk: Low/Medium/High
Approve?
```

On insufficient permission: do not attempt, notify user, suggest alternative.

## Deny Rule Glob Patterns (CC v2.1.166+)

<!-- ARCHIVED CC version note (historical): v2.1.166+: Deny rules support glob patterns in the tool-name position — `"*"` in a deny rule denies all tools. Allow rules reject non-MCP globs (only MCP tool-name globs are accepted in the allow position). Unknown tool names in deny rules emit a startup warning. -->

| Position | Glob support |
|----------|-------------|
| Deny rule tool-name | Yes — `"*"` denies all tools |
| Allow rule tool-name | MCP globs only; non-MCP globs rejected |
| Unknown tool in deny rule | Startup warning |

Use a `"*"` deny rule in `settings.json` to enforce a deny-by-default posture, then add specific allow rules. Complements the Tier-based policy above — settings.json deny rules are evaluated by the CC platform, independent of the advisory tier table.

<!-- ARCHIVED CC version note (historical): v2.1.208+: Permission rule matchers (deny/ask rules) are now compiled once and cached, fixing multi-second per-turn slowdowns in sessions with many rules. Complements the deny-by-default posture above — a large deny/allow rule set no longer costs per-turn latency. -->

<!-- ARCHIVED CC version note (historical): v2.1.183+: Fixed MCP servers requiring authentication exposing auth-stub tools to the model in headless/SDK mode — unauthenticated MCP auth-stub tools are no longer surfaced to the model in `-p` / SDK runs (they would fail on call). Relevant to the Tier-6 MCP tier: a headless run no longer offers auth-stub MCP tools. Separately, v2.1.181 added the `sandbox.allowAppleEvents` opt-in setting, letting sandboxed commands send Apple Events on macOS (default off) — a deliberate sandbox-scope widening, complementing the Tier-based policy above. -->

<!-- ARCHIVED CC version note (historical): v2.1.186+: Added `claude mcp login <name>` / `claude mcp logout <name>` to authenticate MCP servers from the CLI without the interactive `/mcp` menu (`--no-browser` stdin redirect for SSH). Also fixed `Agent(type)` deny rules and `Agent(x,y)` allowed-types restrictions not being enforced for named subagent spawns — extends the v2.1.178 `Tool(param:value)` per-parameter permission syntax (Agent model/param deny) to reliable enforcement on named spawns. Relevant to Tier-6 MCP and the Agent Tool Permission Mode section. -->

<!-- ARCHIVED CC version note (historical): v2.1.178+: Permission rules now support `Tool(param:value)` syntax to match a tool's input parameters, with `*` wildcard — e.g. `Agent(model:opus)` denies Opus subagents, or a parameter glob to constrain a tool's arguments. This extends the v2.1.166 tool-name glob support down to per-parameter granularity. Relevant to the Agent Tool Permission Mode below: a deny rule can now block specific subagent models/parameters at the platform level, complementing `availableModels` (R006) and the universal `mode: "bypassPermissions"` requirement (R010). A `Agent(model:...)` parameter deny is evaluated by the CC platform independent of the advisory tier table. -->

<!-- ARCHIVED CC version note (historical): v2.1.191+: Sandbox network permission dialog now REMEMBERS hosts allowed with "Yes" for the rest of the session (no per-connection re-prompt). Also: `/permissions` Recently-denied tab now PERSISTS an approved denial on close (previously discarded); managed `forceRemoteSettingsRefresh` now takes effect via MDM/file policy with `Cache-Control: no-cache`; MCP capability discovery (`tools/list`/`prompts/list`/`resources/list`) and OAuth token requests now retry transient network errors with backoff (headless skips the browser popup). Relevant to Tier-4/Tier-6 (sandbox network + MCP) permission flows. -->

<!-- ARCHIVED CC version note (historical): v2.1.193+: `autoMode.classifyAllShell` 설정은 모든 Bash/PowerShell 명령(Tier-4)을 arbitrary-code-execution 패턴만이 아니라 전부 auto-mode classifier로 보냅니다. auto-mode 거부 사유가 transcript / 거부 토스트 / `/permissions` recent denials에 노출됩니다. MCP 서버가 인증이 필요하면 시작 시 `/mcp`를 가리키는 알림을 표시하고, MCP `headersHelper` 인증은 tool 호출이 401/403을 반환하면 자동 재실행·재연결합니다(Tier-6). 이 섹션의 tier 기반 정책과 병존하는 플랫폼-레벨 동작입니다. -->

<!-- ARCHIVED CC version note (historical): v2.1.195+: 프로젝트 `.claude/settings.json`으로만 활성화된 외부 플러그인이 이제 모든 loader 경로에서 명시적 설치 동의를 요구합니다(이전에는 일부 경로에서 우회됨). Tier-6 MCP/플러그인 신뢰 경계 강화. -->

<!-- ARCHIVED CC version note (historical): v2.1.187+: Org-configured model restrictions now apply to the model picker, `--model`, `/model`, and `ANTHROPIC_MODEL`, surfacing a "restricted by your organization's settings" message for a restricted model. Extends the v2.1.175 `enforceAvailableModels` managed-setting scope to the model picker/env entry points. Also added the `sandbox.credentials` setting (blocks sandboxed reads of credential files/secret env) — cross-ref R001. -->

<!-- ARCHIVED CC version note (historical): v2.1.196+: 조직 기본 모델(org default models)이 추가되어 관리자가 org 콘솔에서 설정하며, 사용자가 직접 고르지 않으면 `/model`에 "Org default"(또는 "Role default")로 표시됩니다 — v2.1.187 org model restriction 범위를 기본 모델 해석까지 확장(cross-ref R006). 보안: `claude mcp list`/`get`이 self-approved `.mcp.json` 서버를 spawn하지 않고 신뢰되지 않은 워크스페이스는 `⏸ Pending approval` 표시(Tier-6, cross-ref R001). 또한 `claude agents --dangerously-skip-permissions`가 조용히 auto mode로 폴백하던 문제를 수정 — 이제 bypass 고지를 표시하고 spawned agent에도 bypass 모드를 적용합니다(R010 Universal bypassPermissions와 정합). -->

<!--
> **v2.1.200+**: `default` permission mode가 CLI·`--help`·VS Code·JetBrains 전반에서 "Manual"로 표기되도록 변경되었습니다 — `--permission-mode manual`과 `"defaultMode": "manual"`이 기존 `default`와 병행 허용됩니다(동일 동작, 라벨만 변경). 위 tier 표의 `default` 모드는 그대로 유효하며 UI 표기만 "Manual"로 노출됩니다(cross-ref R006 Permission Mode Guidance). 또한 `AskUserQuestion` 다이얼로그가 기본적으로 auto-continue하지 않도록 변경되어(이전에는 idle 시 자동 진행), idle timeout은 `/config`로 opt-in해야 합니다 — **자율/비대화 흐름(FSD 등)에서 AskUserQuestion 호출은 이제 사용자 응답까지 블록되므로, 무인 실행 중 질문 도구 사용을 지양하고 best-judgment로 진행하는 R015 directive persistence와 정합**. 그리고 `.claude.json`의 `disabledMcpServers`/`enabledMcpServers`가 non-array 값일 때 발생하던 시작 크래시가 수정되었습니다(Tier-6 MCP).

> **v2.1.203+**: manual permission mode일 때 footer에 회색 ⏸ 배지가 표시되어 활성 모드가 상시 가시화됩니다. v2.1.200 "Manual" 라벨 변경과 정합.

> **v2.1.207+**: Auto mode가 Bedrock/Vertex/Foundry에서 `CLAUDE_CODE_ENABLE_AUTO_MODE` opt-in 없이 사용 가능해졌습니다(설정 `disableAutoMode`로 비활성화 가능). 또한 `-p`/SDK 비대화 실행의 remote managed settings가 consent 다이얼로그 없이 동의로 기록되던 문제가 수정되었습니다. Tier-3/4 권한 흐름 관련.
-->

> **v2.1.210+**: `Write(path)`/`NotebookEdit(path)`/`Glob(path)` 형태의 permission rule은 시작 시 경고를 발생시킵니다 — 파일 쓰기 rule은 `Edit(path)`, 읽기 rule은 `Read(path)` matcher로 작성합니다. 위 Tier 표의 Write/NotebookEdit/Glob은 도구명일 뿐 path-scoped rule matcher가 아닙니다(위 v2.1.166 unknown-tool startup warning 연장선).

> **v2.1.214+**: 단일 세그먼트 `dir/**` allow rule(예: `Edit(src/**)`)이 트리 어디에나 있는 중첩 `dir/`까지 auto-approve하던 버그가 수정되어 이제 `<cwd>/dir`에만 매칭됩니다(hook `if:` 조건도 동일 — 임의 깊이 매칭이 필요하면 `**/dir/**`로 작성). **`deny`/`ask` permission rule은 any-depth 매칭을 유지**(allow만 `<cwd>`로 좁아짐). settings.json 스코프 설계 시 이 비대칭(allow 좁게 / deny·ask 넓게)을 전제로 삼습니다. 위 v2.1.210 `Edit(path)`/`Read(path)` matcher 권고의 연장선.

> **v2.1.221/222+**: 세 건이 Tier-3/4 권한 흐름에 영향을 줍니다.
> 1. **(v2.1.221) Bash 도구 권한 검사 우회 수정** — zsh가 `[[ ]]` 정규식 조건문 안에서 숨겨진 명령을 실행할 수 있었고, 해당 명령들은 이제 권한 프롬프트를 발생시킵니다. **이 저장소의 Claude Code Bash 도구 실행 셸이 zsh**이므로(R005 #1540), `[[ ... =~ ... ]]` 안에 명령을 포함하는 형태는 Tier-4 프롬프트 대상이며 무인 흐름의 새 프롬프트 발생원이 될 수 있습니다. Windows의 따옴표 포함 경로 PowerShell 권한 검사도 같은 방향으로 수정되었습니다.
> 2. **(v2.1.221) auto mode 병렬 권한 검사 최적화** — 병렬 tool call의 권한 검사가 cache-efficient해지고 캐시된 대화 prefix 재사용으로 비용이 감소했습니다(R009 병렬 배치의 부담 완화). 검사 대기 중 모드를 전환하면 stale 결과를 적용하지 않고 재프롬프트합니다.
> 3. **(v2.1.222) Remote Control auto-start 스코프 축소** — repo-local 설정(`.claude/settings.json` / `.claude/settings.local.json`)으로는 **켤 수 없고**(끄는 것은 가능), 활성화는 user scope `/config`에서만 가능합니다.

> **v2.1.223/225+**: 두 건이 Tier-4 Bash 권한 검사와 세션 인증에 영향을 줍니다. (223) 조작된 명령이 **자기 일부를 권한 검사에서 숨기던** 결함이 수정되었습니다 — v2.1.221 zsh `[[ ]]` 우회 수정의 연장선이며, 검사 대상 문자열과 실행 문자열이 다를 수 있었다는 뜻입니다(표시 측 결함은 R001). (225) 일시적 401이 장수명 `CLAUDE_CODE_OAUTH_TOKEN`을 저장된 단수명 토큰으로 교체해 headless 세션을 재시작 전까지 망가뜨리던 결함이 수정되었습니다 — 구버전 무인 실행에서 401 이후의 연쇄 인증 실패는 토큰 설정 오류가 아니라 이 교체 버그일 수 있으므로 진단 시 구분합니다. agent definition의 `bypassPermissions`가 org 정책을 무시하던 공백(223)은 R010 "Universal bypassPermissions"가 canonical.

## Agent Tool Permission Mode

> Canonical source: R010 (MUST-orchestrator-coordination.md) "Universal bypassPermissions" owns the full requirement, rationale, self-check, and version history. Core rule: always pass `mode: "bypassPermissions"` explicitly on every Agent tool call — the Agent tool's default `mode` (`acceptEdits`) overrides agent frontmatter `permissionMode` and causes prompts during unattended execution. Skills that spawn agents MUST include this in their Agent tool call instructions. See R010 for details.

> **v2.1.212+**: CC가 Agent(구 Task) tool의 `mode` 파라미터를 deprecated 처리했습니다(이제 무시) — subagent는 부모 세션의 permission mode를 기본 상속합니다. 위 canonical 요약의 default `mode`(`acceptEdits`)가 frontmatter `permissionMode`를 override한다는 서술 및 항상 `mode: "bypassPermissions"`를 넘기라는 요건은 이 버전부터 stale이며(파라미터가 무시됨), 무인 실행의 실질 게이트는 부모 세션의 permission mode입니다. 요건 재조정은 R010 "Universal bypassPermissions"가 canonical — R002는 이 flag만 유지합니다.

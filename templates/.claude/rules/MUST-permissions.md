# [MUST] Permission Rules

> **Priority**: MUST | **ID**: R002

## Tool Permission Tiers

| Tier | Tools | Policy |
|------|-------|--------|
| 1: Always | Read, Glob, Grep, ToolSearch | Free use, read-only |
| 2: Default | Write, Edit, NotebookEdit | State changes explicitly, notify before modifying important files |
| 3: Context | Agent, Skill, EnterPlanMode, ExitPlanMode, EnterWorktree, ExitWorktree, LSP, Monitor, TodoWrite†, AskUserQuestion, PushNotification | Context-dependent, no user approval needed |
| 4: Approval | Bash, PowerShell, WebFetch, WebSearch | Request user approval on first use |
| 5: Conditional | TeamCreate†, TeamDelete†, SendMessage, TaskCreate†, TaskGet†, TaskList†, TaskUpdate†, TaskStop, TaskOutput | Available when Agent Teams enabled |
| 6: MCP | ListMcpResourcesTool, ReadMcpResourceTool, CronCreate, CronDelete, CronList, RemoteTrigger | MCP/extension tools, available when servers configured |

> **†** 현행 모델의 기본 실행 환경에 **존재하지 않는다** — 아래 v2.1.233 노트 참조. 이 표는 **도구 카탈로그**이지 가용성 보증이 아니므로, 규칙이 특정 도구 호출을 의무화하기 전에 실측(도구 목록 / `ToolSearch`)으로 존재를 확인한다.

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

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.210+**: `Write(path)`/`NotebookEdit(path)`/`Glob(path)` 형태의 permission rule은 시작 시 경고를 발생시킵니다 — 파일 쓰기 rule은 `Edit(path)`, 읽기 rule은 `Read(path)` matcher로 작성합니다. 위 Tier 표의 Write/NotebookEdit/Glob은 도구명일 뿐 path-scoped rule matcher가 아닙니다(위 v2.1.166 unknown-tool startup warning 연장선). -->

> **v2.1.214+**: 단일 세그먼트 `dir/**` allow rule(예: `Edit(src/**)`)이 트리 어디에나 있는 중첩 `dir/`까지 auto-approve하던 버그가 수정되어 이제 `<cwd>/dir`에만 매칭됩니다(hook `if:` 조건도 동일 — 임의 깊이 매칭이 필요하면 `**/dir/**`로 작성). **`deny`/`ask` permission rule은 any-depth 매칭을 유지**(allow만 `<cwd>`로 좁아짐). settings.json 스코프 설계 시 이 비대칭(allow 좁게 / deny·ask 넓게)을 전제로 삼습니다. 위 v2.1.210 `Edit(path)`/`Read(path)` matcher 권고의 연장선.

> **v2.1.252/257+**: 두 건이 allow 규칙 저장·반영 신뢰성을 보강합니다. (252) `.claude/settings.local.json`이 아직 없는 프로젝트에서 "always allow"를 눌러도 저장되지 않던 결함이 수정되었습니다 — 구버전에서 "always allow를 눌렀는데 다시 묻는다"는 관측은 이 파일 부재가 원인일 수 있었습니다. (257) 세션 시작 후 새로 생성된 `.claude/` 폴더의 settings가 재시작 전까지 반영되지 않던 결함이 수정되었습니다 — R021 「훅 배선 경로」가 서술하는 settings 재생성 흐름에서, 세션 중 생성한 settings 파일이 이제 즉시 로드됩니다.

> **v2.1.221/222+**: 세 건이 Tier-3/4 권한 흐름에 영향을 줍니다.
> 1. **(v2.1.221) Bash 도구 권한 검사 우회 수정** — zsh가 `[[ ]]` 정규식 조건문 안에서 숨겨진 명령을 실행할 수 있었고, 해당 명령들은 이제 권한 프롬프트를 발생시킵니다. **이 저장소의 Claude Code Bash 도구 실행 셸이 zsh**이므로(R005 #1540), `[[ ... =~ ... ]]` 안에 명령을 포함하는 형태는 Tier-4 프롬프트 대상이며 무인 흐름의 새 프롬프트 발생원이 될 수 있습니다. Windows의 따옴표 포함 경로 PowerShell 권한 검사도 같은 방향으로 수정되었습니다.
> 2. **(v2.1.221) auto mode 병렬 권한 검사 최적화** — 병렬 tool call의 권한 검사가 cache-efficient해지고 캐시된 대화 prefix 재사용으로 비용이 감소했습니다(R009 병렬 배치의 부담 완화). 검사 대기 중 모드를 전환하면 stale 결과를 적용하지 않고 재프롬프트합니다.
> 3. **(v2.1.222) Remote Control auto-start 스코프 축소** — repo-local 설정(`.claude/settings.json` / `.claude/settings.local.json`)으로는 **켤 수 없고**(끄는 것은 가능), 활성화는 user scope `/config`에서만 가능합니다.

> **v2.1.223/225+**: 두 건이 Tier-4 Bash 권한 검사와 세션 인증에 영향을 줍니다. (223) 조작된 명령이 **자기 일부를 권한 검사에서 숨기던** 결함이 수정되었습니다 — v2.1.221 zsh `[[ ]]` 우회 수정의 연장선이며, 검사 대상 문자열과 실행 문자열이 다를 수 있었다는 뜻입니다(표시 측 결함은 R001). (225) 일시적 401이 장수명 `CLAUDE_CODE_OAUTH_TOKEN`을 저장된 단수명 토큰으로 교체해 headless 세션을 재시작 전까지 망가뜨리던 결함이 수정되었습니다 — 구버전 무인 실행에서 401 이후의 연쇄 인증 실패는 토큰 설정 오류가 아니라 이 교체 버그일 수 있으므로 진단 시 구분합니다. agent definition의 `bypassPermissions`가 org 정책을 무시하던 공백(223)은 R010 "Universal bypassPermissions"가 canonical.

> **v2.1.232/233+**: 232가 권한 검사 우회 3건을 수정했으나 **233이 그중 2건을 롤백**했습니다. 어느 것이 현행인지 버전별로 구분합니다.
>
> 1. **233 현재 유효 (232 수정 유지)** — (a) PowerShell에서 변수 기록 파라미터가 `$PSDefaultParameterValues`를 조용히 덮어써 이후 명령의 파일 접근을 리다이렉트할 수 있던 우회가 수정되었습니다. 또한 중첩 git 저장소가 부모 디렉토리의 trust를 상속하던 문제가 수정되어 저장소마다 별도 trust 확인이 필요하고, `sandbox.ripgrep`은 user/managed/`--settings`에서만 적용되며 **project settings로는 override 불가**입니다(위 v2.1.214 allow/deny 스코프 비대칭과 같은 계열의 축소 — repo-local 설정으로 켤 수 없는 항목이 늘었습니다). 233은 추가로 **Windows NT `\??\` device prefix 경로가 UNC 경로 검증을 우회**해 NTLM 자격증명 유출 벡터가 되던 결함을 수정했습니다 — 같은 경로를 여러 표기로 쓸 수 있다는 v2.1.221/223 "검사 대상 문자열 ≠ 실행 문자열" 계열의 **경로 표기** 각도입니다.
> 2. **233에서 롤백됨 — 현재 권한 검사되지 않음** — (b) Windows Git Bash가 경로 검증에는 일반 파일로 보이는 Cygwin-style symlink를 따라가던 우회 수정, (c) Bash 입력 리다이렉션(`< file`)을 인자 표기와 동일하게 권한 검사하던 변경. 두 건 모두 232에서 도입됐다가 233에서 되돌려졌습니다(CHANGELOG v2.1.233: "Reverted the 2.1.232 Bash permission changes for Cygwin-style symlinks on Windows and for input redirections (`< file`); a narrower version will return in a later release"). **이 두 경로는 현행 233에서 권한 검사를 거치지 않으므로, 검사된다고 가정하고 경로 스코프 규칙을 설계하면 우회됩니다.**
> 3. **재도입 예정** — "a narrower version will return in a later release"이므로 좁힌 형태로 돌아옵니다. 재도입 시 적용 범위가 232 원본과 다를 수 있으므로 그때 다시 확인합니다.
>
> **`< file` 회고적 함의(버전 무관 유지)**: `< file`은 232 한 릴리즈를 제외하면 경로 스코프 규칙을 우회해 왔고 233에서 다시 그 상태이므로, **프롬프트 없이 읽힌 사실을 allow 규칙의 증거로 삼지 않습니다**. 위 v2.1.221/223 "검사 대상 문자열 ≠ 실행 문자열" 계열의 연장선입니다.
>
> **일반 교훈**: 단일 릴리즈의 플랫폼 권한 개선은 롤백될 수 있으므로 **항구적 보호막으로 간주하지 않습니다**. 스코프 규칙은 개선 이전 상태를 기준으로 설계하고 플랫폼 개선은 defense-in-depth로만 취급합니다(`feedback_platform_claim_staleness` 계열 — 플랫폼 주장의 시효성).

> **v2.1.251+**: Bash·경로 권한검사 우회 수정 5건이 한 릴리즈에서 함께 발견·수정되었습니다 — (a) 정수 셸 변수에 산술식을 대입하는 명령(`OPTIND=1/0`, `RANDOM=2+2`)을 auto-approve하던 결함, (b) 샌드박스 내 Bash 명령이 자기 output file을 리다이렉트·교체할 수 있던 결함, (c) 작업 디렉토리 내부 심링크가 permission check **이후** 교체(TOCTOU)되어 Read/Write/Edit가 승인 영역 밖을 접근할 수 있던 결함, (d) Grep/Glob이 심링크로 도달한 검색 경로에 `Read(...)` deny 규칙을 적용하지 못하던 결함, (e) Workflow tool이 permission check 실행 **전에** 세션이 읽을 수 없는 `scriptPath`를 먼저 읽고 에러에 그 경로를 그대로 인용하던 결함(cross-ref R023 Workflow Script Sanity Check). 한 릴리즈에서만 5건이 나왔다는 사실 자체가 위 「일반 교훈」— 단일 릴리즈의 플랫폼 권한 개선은 롤백될 수 있으므로 항구적 보호막으로 간주하지 않는다 — 를 강하게 재확인시킵니다.

> **v2.1.247~251 재도입 여부 확인 (실측)**: 위 「일반 교훈」이 언급하는 v2.1.233 롤백 2건(Windows Git Bash의 Cygwin-style symlink 우회, Bash 입력 리다이렉션 `< file`)의 "좁힌 형태 재도입"은 v2.1.247~251 CHANGELOG 범위에서 **확인되지 않았습니다** — "Cygwin"이라는 단어도 `< file` 입력 리다이렉션 언급도 4개 릴리즈 어디에도 없습니다. 대신 v2.1.251에 위 5건의 (c)(d)처럼 **메커니즘이 다른** 별개의 심링크·경로 우회 수정이 새로 등장했습니다 — 같은 "심링크 우회"라는 결과이지만 원인 버그는 다릅니다. 따라서 위 "233에서 롤백됨" 서술은 이 시점까지 **여전히 유효**하며, 재도입이 확인되면 이 노트를 갱신합니다.

> **v2.1.257+ (재도입 확인)**: v2.1.233에서 롤백됐던 2건 중 **`< file` 입력 리다이렉션 권한검사가 v2.1.257에서 재도입**됐습니다 — Bash `Read()`/`Edit()` deny 규칙이 이제 `< file` 리다이렉트와 `tac`/`egrep` 같은 reader 명령에도 적용되어, 인자나 리다이렉트 대상 중 하나라도 deny에 걸리면 명령이 거부됩니다. 232 원본("인자 표기와 동일하게 검사")보다 넓은 형태입니다. Windows Git Bash의 Cygwin-style symlink 우회 건은 v2.1.257/258 CHANGELOG에도 여전히 언급이 없어 **미재도입 상태로 유지**합니다. 위 「`< file` 회고적 함의(버전 무관 유지)」 문단은 이제 **v2.1.257 미만 버전에 한정**해 읽습니다 — v2.1.257 이후로는 `< file`이 다시 검사 대상입니다.

> **v2.1.257+**: 권한검사 보강 5건이 추가로 확인되었습니다. (a) auto mode에서 `permissions.ask` 규칙이 매칭 명령이 복합 명령·서브셸 내부에서 실행될 때 건너뛰어지던 결함이 수정되어 확인 프롬프트 없이 실행되지 않습니다 — 위 「allow ≠ classifier」 계열의 ask 층 보강입니다. (b) zsh가 bash와 다르게 파싱하는 `[[ ]]` 조건문을 auto-approve하던 결함이 추가로 수정되었습니다 — v2.1.221/238에 이은 3번째 보강이며, 이 저장소의 Bash 도구 실행 셸이 zsh이므로 직접 해당합니다. (c) `permissions.blockReadsOutsideWorkingDirectories` 설정이 신설되어, auto mode에서 작업 디렉토리 밖 첫 파일 읽기 전 1회 프롬프트를 표시하고 그런 읽기를 차단하는 옵션을 제공합니다. (d) `allowManagedPermissionRulesOnly`가 활성 상태일 때 첫 settings reload 이후 `--disallowedTools`와 세션 deny 규칙이 탈락하던 결함이 수정되었습니다. (e) 워크트리 격리 세션이 git을 건드리지 않는 Bash 루프·`$VAR` 읽기·`"$(…)"`·heredoc을 "too complex to verify that it stays inside the worktree"로 거부하던 결함이 수정되었습니다 — R009 워크트리 병렬 위임 시 이런 복합 명령의 거부를 더 이상 격리 결함으로 진단하지 않습니다.

> **v2.1.238+**: Bash 도구의 permission 검사가 zsh 전용 조건문(shell conditional) 문법에 대해 추가로 개선되었습니다. 이는 위 v2.1.221 "zsh `[[ ]]` 정규식 조건문 안에서 숨겨진 명령이 권한 검사를 우회"의 **직접 연장선**입니다 — "개선"으로만 기술되어 있어 v2.1.221 수정이 완전 해결이 아니었거나 추가 우회 벡터가 있었음을 시사합니다. 이 저장소의 Bash 도구 실행 셸이 zsh이므로(R005 #1540 실측) 직접 관련됩니다.

> **v2.1.246/248+**: (246) 끝에 매달린 `&&`/`||`가 있는 손상된(malformed) 명령에 대해 Bash 권한검사가 이제 **항상 승인을 요구**합니다 — 구버전에서는 이런 형태가 검사를 우회할 수 있었습니다. (248) `--restricted`(또는 `CLAUDE_CODE_RESTRICTED=1`) 모드가 신설되어 명령/코드 실행 도구와 `WebFetch`를 제거하고(`--tools`에 명시 시 예외), 파일 도구를 작업 디렉토리 내부로 제한하며, `bypassPermissions`를 거부하고, user/project/local settings 파일을 무시합니다. 이 저장소는 프로젝트 settings에 `bypassPermissions`를 선언하지만 v2.1.257부터 그 선언은 무시되므로(R010 Universal bypassPermissions의 ★ v2.1.257 노트 — 2026-09-02 실측 유효 모드는 user settings `auto`), `--restricted`와의 상호 배타성은 **user/managed scope에서 bypass를 켠 경우에 한해** 성립합니다 — 이 저장소 워크플로우에는 적용하지 않되, 신규 안전 모드 옵션으로 존재를 기록합니다.

### Todo/Task 도구 기본 제거 (v2.1.233+) — 위 표의 †

CHANGELOG v2.1.233 원문: *"Todo/task-tracking tools (TaskCreate/Get/Update/List, TodoWrite) are no longer available on Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer models; set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` to bring them back"*. 이 저장소 에이전트 **49개 중 46개**(`claude-sonnet-5` 41 + `claude-opus-5` 5)가 대상 모델이므로 실행 환경의 기본값은 **부재**다(잔여 3개는 `haiku`).

**실측 (2026-08-15 — `claude -p --output-format stream-json` init 이벤트의 `tools` 배열, `claude-opus-5[1m]`/`claude-sonnet-5` 3회 동일 결과)**:

| 상태 | 도구 |
|------|------|
| 미등록 (CHANGELOG 명시) | `TodoWrite`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` |
| 미등록 (CHANGELOG 미명시 — 별도 게이팅) | `TeamCreate`, `TeamDelete` |
| 잔존 | `TaskStop`, `TaskOutput`, `SendMessage` |

바이너리(`2.1.233`) 게이트 함수 실측도 이를 뒷받침한다 — 게이트 대상 도구 배열은 **정확히 5개**(CHANGELOG 명시 5종)이며 `TaskOutput`은 포함되지 않는다.

`TeamCreate` 부재는 CHANGELOG가 설명하지 않는 별개 사실이며, **Agent Teams 생성 경로 자체가 없다**는 뜻이다 — 환경변수 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`이 설정돼 있어도 R018은 이 환경에서 비활성이다(R018 Detection). 규칙은 **존재하지 않는 도구의 호출을 의무화하지 않는다** — 도구 의존 의무를 쓸 때는 부재 시 대체 규약을 함께 규정한다(R018 Member TaskUpdate Discipline이 그 예).

`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`은 복구 수단이나 **환경 설정 사안**이므로 규칙이 그 설정을 전제하지 않는다. 공식 settings 문서(`code.claude.com/docs/en/settings`)에는 2026-08-15 기준 미수록 — 현재 근거는 CHANGELOG 원문 + 위 실측이다.

Origin: #1582. Cross-ref: R018(Member TaskUpdate Discipline 대체 규약), R020("도구가 있다"는 가정도 실측 대상).

## Agent Tool Permission Mode

> Canonical source: R010 (MUST-orchestrator-coordination.md) "Universal bypassPermissions" owns the full requirement, rationale, self-check, and version history. Core rule: always pass `mode: "bypassPermissions"` explicitly on every Agent tool call — the Agent tool's default `mode` (`acceptEdits`) overrides agent frontmatter `permissionMode` and causes prompts during unattended execution. Skills that spawn agents MUST include this in their Agent tool call instructions. See R010 for details.

> **v2.1.212+**: CC가 Agent(구 Task) tool의 `mode` 파라미터를 deprecated 처리했습니다(이제 무시) — subagent는 부모 세션의 permission mode를 기본 상속합니다. 위 canonical 요약의 default `mode`(`acceptEdits`)가 frontmatter `permissionMode`를 override한다는 서술 및 항상 `mode: "bypassPermissions"`를 넘기라는 요건은 이 버전부터 stale이며(파라미터가 무시됨), 무인 실행의 실질 게이트는 부모 세션의 permission mode입니다. 요건 재조정은 R010 "Universal bypassPermissions"가 canonical — R002는 이 flag만 유지합니다.

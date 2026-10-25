# Claude Code Version Compatibility

> Updated: 2026-10-05
> Source: Claude Code release notes (#967, #968, #969, #1126 auto-detected by claude-native skill, #1137, #1158, #1242, #1243, #1244, #1245, #1276, #1280, #1713, #1714, #1716, #1746, #1747)
>
> **Note (compat 노트 이관, v1.1.9~v1.1.76)**: v2.1.161~v2.1.276 구간의 CC 호환성 노트는 `.claude/rules/` 각 규칙(R001/R002/R006/R010/R012 등)에 인라인으로 축적되어 있으며, 이 구간은 그대로 보존합니다.
>
> **Note (정책 전환, #1717 — v1.1.77+)**: 룰 코퍼스 컨텍스트 예산 초과(#1717 실측: 주석 제외 306,752자, `/memory` 150k자 한도 초과)를 계기로, v2.1.277+부터 신규 CC 버전 노트는 다시 이 가이드로 돌아옵니다. 룰 파일(`.claude/rules/*.md`)에는 현재 행동을 바꾸는 규범이 있을 때만 1줄로 남기고, CHANGELOG 인용·영향 서사·Origin 배경은 이 가이드가 전담합니다(R016 「버전노트 보존정책」).

## Compatibility Baseline

oh-my-customcode v1.1.9 targets Claude Code v2.1.201+ (v2.1.197부터 Sonnet 5가 CC 기본 Sonnet 모델이었고, v2.1.284부터 Anthropic API의 기본 Sonnet 모델은 Sonnet 5.5). 이 파일에 정리된 v2.1.117-160 항목은 하위호환이며 config 변경이 불필요합니다.

## v2.1.117 (2026-04-22)

**Key changes relevant to oh-my-customcode:**

- `CLAUDE_CODE_FORK_SUBAGENT=1` enables forked subagents on external builds — relevant for R018 Agent Teams expansion
- Main-thread agent `mcpServers` frontmatter loading via `--agent` — broadens MCP integration scope (affects sys-memory-keeper and native auto-memory users)
- `/model` persistence across restarts — reduces repeated model selection in long sessions
- `/resume` summarization of stale sessions — aligns with R013 ecomode context budget
- Concurrent MCP server startup — shorter session bootstrap

**Action items**: None. Features are additive.

## v2.1.118 (2026-04-23)

**Key changes relevant to oh-my-customcode:**

- `/cost` + `/stats` → merged into `/usage` — update CLAUDE.md quick-reference if these appear (they don't in current docs)
- Vim visual modes (`v`, `V`) — orthogonal to harness
- Custom themes via `~/.claude/themes/` + plugin `themes/` directory — R012 HUD statusline unaffected
- **Hooks can invoke MCP tools directly (`type: "mcp_tool"`)** — new hook capability, R022 wiki-sync or memory hooks could benefit
- `DISABLE_UPDATES` env var — stricter than `DISABLE_AUTOUPDATER`

**Action items**: Consider R022/R011 hooks migration to `type: "mcp_tool"` for direct wiki/memory integration (P3 follow-up).

## v2.1.119 (2026-04-23)

**Key changes relevant to oh-my-customcode:**

- `/config` persistence to `~/.claude/settings.json` with proper override precedence — project/local/policy stacking more predictable
- `prUrlTemplate` setting — useful if mirroring to GitHub Enterprise or GitLab
- `CLAUDE_CODE_HIDE_CWD` env var — cosmetic
- `--from-pr` now accepts GitLab MR, Bitbucket PR, GitHub Enterprise URLs — widens reviewer scenarios
- **`--print` mode honors agent `tools:` and `disallowedTools:` frontmatter** — fixes a long-standing gap, relevant for CI runs using `--print`

**Action items**: Verify `--print` based CI scripts (if any) work correctly with restricted-tools agents like `arch-documenter` (which has `disallowedTools: [Bash]`).

## v2.1.139 (2026-05-xx) — 신규 사용자 노출 명령

> Issue: #1126 — CC v2.1.139 onboarding update

### `claude agents` — Agent View (Research Preview)

단일 화면에서 실행 중(running), 대기(blocked), 완료(done) 상태인 모든 CC 세션을 목록으로 확인합니다.

```bash
claude agents
```

**oh-my-customcode 연관**: R009 병렬 에이전트, R018 Agent Teams 운영 시 다중 세션 상태 가시성이 개선됩니다. 복잡한 병렬 워크플로우에서 어느 에이전트가 blocked 상태인지 즉시 파악 가능.

### `claude plugin details <name>` — Plugin Inventory

플러그인의 component inventory와 세션당 예상 token cost를 표시합니다.

```bash
claude plugin details oh-my-customcode
claude plugin details superpowers
```

**oh-my-customcode 연관**: R013 ecomode token efficiency 검증 도구로 활용 가능합니다. 자체 빌드 결과(skill/agent count + 토큰 비용)를 정량 측정하여 `guides/claude-code/14-token-efficiency.md` 최적화 결정에 근거를 제공합니다.

### `/scroll-speed` — 마우스 스크롤 속도 조정

휠 스크롤 속도를 실시간 preview와 함께 튜닝합니다. 긴 transcript나 대용량 출력 검토 시 유용.

```
/scroll-speed
```

### `/mcp` Reconnect 개선

`.mcp.json` 편집 후 CC 재시작 없이 `reconnect` 명령으로 변경사항을 반영합니다. 연결 실패 시 HTTP 상태 코드와 URL이 표시됩니다.

**oh-my-customcode 연관**: `ontology-rag` 등 MCP 서버 설정 변경 시 재시작 없이 적용 — 긴 세션 중단 없이 R011 메모리 통합을 재설정할 수 있습니다.

### Transcript View 네비게이션 단축키

transcript view에서 다음 단축키를 사용할 수 있습니다:

| 키 | 동작 |
|----|------|
| `?` | 전체 단축키 목록 표시 |
| `{` | 이전 user prompt로 이동 |
| `}` | 다음 user prompt로 이동 |
| `v` | shortcut panel 표시/숨김 toggle |

### `/context all` — Skill별 토큰 추정 정확도 개선

모델 tokenizer 기반 추정값과 반올림 표시가 적용됩니다.

**oh-my-customcode 연관**: R013 ecomode context budget 관리 (threshold: 80%)에서 각 skill이 소비하는 토큰을 더 정확히 파악할 수 있습니다. `context: fork` skill (현재 10/12 사용 중) 비용 모니터링에 직접 활용 가능.

**Action items**: None — 모두 additive. `/context all`로 fork skill 비용 정기 점검 권장.

## v2.1.140 (2026-05-12) — 호환성 점검

> Issue: #1134 — cc-release-monitor auto-create

### Agent tool 개선

- **`subagent_type` 매칭 완화**: case-insensitive + separator-insensitive — `"Code Reviewer"`가 `code-reviewer`로 정상 해석. oh-my-customcode는 이미 strict kebab-case 사용 → 영향 없음 (단, 외부 스킬이 비표준 표기로 호출해도 동작하게 됨).

### Slash command 안정성

- **`/goal` hanging fix**: `disableAllHooks` 또는 `allowManagedHooksOnly` 설정 환경에서 무한 대기 → 명확한 메시지 출력으로 변경. oh-my-customcode의 `omcustom:goal` 스킬은 네이티브 `/goal`과 별개 namespace이므로 직접 영향 없음.

### Settings / Background service / Plugins

- Settings 심볼릭 링크 hot-reload fix — `ConfigChange` hook 오발화 차단
- `claude --bg` idle-exit 직전 connection drop fix
- Background service 엔드포인트 보안 환경 startup timing 완화
- Remote managed settings 401 → 토큰 force-refresh 후 1회 재시도
- Managed `extraKnownMarketplaces` 자동 업데이트가 `known_marketplaces.json`에 영속화 — **관리형 환경에서 marketplace 자동 등록 정책 검토 필요**
- `/loop` 중복 wakeup 제거 — 백그라운드 작업 완료 자동 알림 활용 시 효율 개선 (자동 적용)
- Windows event-loop stall fix (`where.exe` 재호출 폭주) — macOS dev에는 영향 없음
- `Read` tool offset이 공백/`+` 접두 문자열일 때 검증 통과 — 호출 안전성 개선
- 네이티브 터미널 cursor focus 동작 개선 (UX)
- **Plugins default component folder 무시 경고**: `plugin.json`이 동일 키를 명시할 때 default 폴더(`commands/` 등)가 무시되면 `/doctor`, `claude plugin list`, `/plugin`에서 경고. **oh-my-customcode plugin 패키지가 영향 가능 — `templates/marketplace.json` + plugin.json 구조 audit 권고**.

### oh-my-customcode 연관 평가

| 변경 | 영향 | Action |
|------|------|--------|
| `subagent_type` 매칭 완화 | 영향 없음 (strict kebab-case 유지) | None |
| `/goal` hanging fix | omcustom:goal namespace 별개 | None |
| Settings/BG/Read tool fixes | 사용자 환경 안정성 향상 | None (수동적 효익) |
| `/loop` 효율 개선 | `loop` 스킬 사용 시 자동 적용 | None |
| Managed `extraKnownMarketplaces` 영속화 | 관리형 정책 환경 영향 가능 | P3 audit |
| Plugins default component folder 경고 | `plugin.json` 구조 audit 필요 | P3 audit |

**Action items**: P3 audit 2건 (관리형 marketplace 정책 + plugin.json default folder 검증). 모두 후속 release 별도 처리.

## v2.1.142 (2026-05-14) — 호환성 점검

> Issue: #1158 — CC v2.1.142 compatibility documentation

### `claude agents` 신규 플래그 — 백그라운드 세션 설정

`claude agents` 명령에 백그라운드 세션을 직접 구성하는 플래그가 추가되었습니다.

```bash
claude agents --add-dir <path>          # 추가 디렉토리 접근 권한
claude agents --settings <path>         # 커스텀 settings 파일 경로
claude agents --mcp-config <path>       # MCP 설정 파일 경로
claude agents --plugin-dir <path>       # 플러그인 디렉토리 경로
claude agents --permission-mode <mode>  # 권한 모드 지정
claude agents --model <model>           # 사용할 모델 지정
claude agents --effort <level>          # effort 레벨 지정
claude agents --dangerously-skip-permissions  # 권한 프롬프트 생략
```

**oh-my-customcode 연관**: R009 병렬 에이전트, R018 Agent Teams 고급 운영 시 활용 가능. 특히 `--permission-mode`, `--model`, `--effort` 플래그는 R006 에이전트 프론트매터의 값을 CLI 레벨에서 오버라이드하는 경로를 제공합니다. `--dangerously-skip-permissions`는 CI/unattended 환경에서 `bypassPermissions`(R010)와 동등한 효과. **Action required: None** — 기존 harness 운영에 영향 없음.

### Fast Mode 기본 모델 변경: Opus 4.7

Fast Mode 활성화 시 기본 모델이 Opus 4.6에서 **Opus 4.7**로 변경되었습니다.

```bash
# Opus 4.6으로 고정하려면 (이전 동작 유지)
export CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1
```

**oh-my-customcode 연관**: R006 에이전트 프론트매터에서 `model: opus`를 사용하는 에이전트(arch-documenter, arch-speckit-agent 등)와 Fast Mode 상호작용에 주의. Fast Mode 토글(`/fast`)이 활성화된 세션에서는 Opus 4.7이 자동으로 선택됩니다. R012 statusline의 모델 표기도 4.7로 반영됩니다. 모델 변경에 따른 동작 차이가 있을 경우 위 환경 변수로 고정 가능.

### Plugin root-level SKILL.md 지원

플러그인 루트에 `SKILL.md`가 존재하면 `skills/` 서브디렉토리 없이도 스킬로 노출됩니다.

**oh-my-customcode 연관**: oh-my-customcode는 `.claude/skills/<name>/SKILL.md` 패턴을 사용하므로 직접 영향 없음. 외부 플러그인이 루트 `SKILL.md`를 통해 스킬을 노출할 경우, 라우팅 스킬(R019 enrichment)이 이를 자동 감지합니다.

### `/plugin details` — LSP 서버 표시

`claude plugin details <name>` 명령의 상세 정보 패널에 플러그인이 제공하는 **LSP 서버** 목록이 추가됩니다.

**oh-my-customcode 연관**: 플러그인 인벤토리 가시성 향상. LSP 통합 플러그인(ex: context7) 사용 시 서버 상태 확인에 활용 가능. 직접적인 harness 변경 불필요.

### `/web-setup` — 기존 GitHub App 연결 교체 경고

`/web-setup` 실행 시 기존 GitHub App 연결을 대체하기 전에 경고를 표시합니다.

**oh-my-customcode 연관**: 영향 없음 (UX 안전장치, mgr-gitnerd GitHub 연동과 무관).

### `MCP_TOOL_TIMEOUT` 수정 — 원격 MCP 서버 타임아웃

`MCP_TOOL_TIMEOUT` 환경 변수가 원격 HTTP/SSE MCP 서버의 요청별 fetch 타임아웃을 실제로 높이도록 수정되었습니다 (기존 60초 상한선 해제).

```bash
export MCP_TOOL_TIMEOUT=120000  # 120초 (밀리초 단위)
```

**oh-my-customcode 연관**: `ontology-rag` 등 원격 MCP 서버를 사용하는 R019 연동에서 타임아웃 문제가 있었다면 이 변수로 해결 가능. 네트워크 지연이 큰 환경에서 MCP 도구 호출 실패율 감소 기대.

### BG 세션 / Git Worktree Edit 차단 수정

백그라운드 세션에서 기존 git worktree 내 파일 편집이 차단되던 문제가 수정되었습니다.

**oh-my-customcode 연관**: `mgr-gitnerd`가 worktree를 사용하는 브랜치 병렬 작업 시나리오에서 R009 병렬 에이전트 운영이 안정화됩니다.

### BG 세션 macOS sleep/wake 소멸 수정

macOS 절전/복귀 후 백그라운드 세션이 사라지던 문제가 수정되었습니다. 데몬이 클럭 점프를 감지하여 세션을 유지합니다.

**oh-my-customcode 연관**: R018 Agent Teams 장시간 실행 세션의 안정성 개선. 긴 병렬 작업 중 macOS 절전 시 세션 유실 방지.

### 데몬 바이너리 업그레이드 후 충돌 루프 수정

`brew upgrade` 등 바이너리 업그레이드 후 데몬이 crash-loop에 빠지던 문제가 수정되었습니다.

**oh-my-customcode 연관**: 영향 없음 (플랫폼 안정성 개선).

### Claude-in-Chrome 확장 공유 탭 없을 때 BG 에이전트 충돌 수정

**oh-my-customcode 연관**: 영향 없음 (브라우저 자동화 사용 시 환경 안정성 개선).

### `claude agents` 연결 시 링크 클릭 수정

연결된 `claude agents` 세션에서 링크 클릭 시 headless browser shim이 적용되지 않도록 수정되었습니다.

**oh-my-customcode 연관**: 영향 없음 (UX 수정).

### `claude agents` "v to open in editor" 수정

`$EDITOR`/`$VISUAL` 환경 변수를 존중하도록 수정되었습니다 (기존: 데몬 기본값 사용).

**oh-my-customcode 연관**: 영향 없음 (UX 수정).

### `claude agents` Windows 네트워크 드라이브 데드락 수정

**oh-my-customcode 연관**: macOS 개발 환경에는 영향 없음.

### Apple Terminal 256색 배경색 번짐 수정

`claude agents` 세션 연결 시 256색 터미널에서 배경색이 번지던 문제가 수정되었습니다.

**oh-my-customcode 연관**: 영향 없음 (터미널 렌더링 수정).

### `claude --bg --dangerously-skip-permissions` 유지 수정

retire/wake 사이클 후에도 `--dangerously-skip-permissions` 플래그가 유지되도록 수정되었습니다.

**oh-my-customcode 연관**: R010 unattended 실행 안정성 개선. 장시간 백그라운드 에이전트 실행 시 권한 모드 드롭 방지.

### oh-my-customcode 연관 평가

| 변경 | 영향 | Action |
|------|------|--------|
| `claude agents` 신규 플래그 | 고급 세션 구성 가능 | None (opt-in) |
| Fast Mode 기본 모델 → Opus 4.7 | `model: opus` 에이전트 + Fast Mode 상호작용 | 필요 시 `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1` |
| Plugin root SKILL.md | omcustom 패턴 미해당 | None |
| `/plugin details` LSP 표시 | 인벤토리 가시성 향상 | None |
| `/web-setup` 교체 경고 | UX 안전장치 | None |
| `MCP_TOOL_TIMEOUT` 수정 | R011/R019 MCP 타임아웃 해결 | 필요 시 환경 변수 설정 |
| BG + git worktree Edit 차단 수정 | R009 worktree 병렬 작업 안정화 | None |
| BG macOS sleep/wake 소멸 수정 | R018 장시간 세션 안정성 | None |
| 데몬 crash-loop 수정 | 플랫폼 안정성 | None |
| 기타 버그 수정 (Chrome ext, links, editor, Windows, 256색, BG permissions) | 환경별 안정성 개선 | None |

**Action items**: Fast Mode를 사용하는 경우 Opus 4.7 전환 영향을 확인하고, 필요 시 `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1`로 고정. `MCP_TOOL_TIMEOUT` 설정이 필요한 환경에서는 선택적으로 적용.

## v2.1.143 (2026-05-15) — 호환성 점검

> Issue: #1166 — CC v2.1.143 compatibility documentation

### Plugin dependency enforcement

`claude plugin disable` now refuses to disable a plugin when another enabled plugin depends on it, and prints a copy-pasteable disable-chain hint. `claude plugin enable` force-enables transitive dependencies.

**oh-my-customcode 연관**: 필수/권장 플러그인(superpowers, context7, elements-of-style 등)을 함께 운영할 때 의존성 순서 실수가 줄어듭니다. 플러그인 비활성화 자동화는 실패 메시지의 disable-chain 힌트를 그대로 따르도록 해야 합니다. 직접 harness 변경 불필요.

### `/plugin` marketplace projected context cost

Marketplace browse pane now shows projected context cost estimates per turn and per invocation.

**oh-my-customcode 연관**: R013 ecomode 및 토큰 효율 감사에서 플러그인 선택 근거가 개선됩니다. `/plugin details`와 함께 플러그인 도입 전 비용 점검에 활용합니다.

### `worktree.bgIsolation: "none"`

New setting lets background sessions edit the working copy directly without `EnterWorktree` for repositories where worktrees are impractical.

```json
{
  "worktree": {
    "bgIsolation": "none"
  }
}
```

**oh-my-customcode 연관**: R009/R018 병렬 작업에서 worktree가 불가능한 저장소의 fallback 옵션입니다. 같은 working copy를 공유하므로 충돌 위험이 있습니다. 사용 전 `git status --short --branch`를 확인하고, 병렬 파일 소유권을 명확히 나누는 경우에만 opt-in 하세요.

### PowerShell execution policy bypass

PowerShell tool now passes `-ExecutionPolicy Bypass`. Opt out with:

```bash
export CLAUDE_CODE_POWERSHELL_RESPECT_EXECUTION_POLICY=1
```

**oh-my-customcode 연관**: Windows 환경에서 hook/script 실행 호환성이 좋아집니다. 보수적 enterprise policy 환경에서는 위 opt-out을 문서화하세요.

### Background sessions preserve model and effort

Background sessions now preserve the model and effort level set after waking from idle. Shift+Tab in attached agent sessions now includes auto mode in the cycle.

**oh-my-customcode 연관**: R006 agent frontmatter의 `model`/`effort`와 장시간 R018 세션 운영이 더 안정적입니다. 별도 변경 없음.

### Fixes relevant to agent harnesses

- Corrupt `.credentials.json` with non-array `scopes` no longer hangs startup or silently aborts OAuth token refresh.
- Stop hooks that block repeatedly now end the turn with a warning after 8 consecutive blocks. Override with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
- Esc/Ctrl+C cancels pending `/loop` wakeup while idle.
- `/goal` evaluator no longer fires while background shells or delegated subagents are still running.
- `NO_COLOR`/`FORCE_COLOR` in settings env now apply to subprocesses only, preserving Claude Code UI colors.
- Agent view avoids repeated PowerShell processes on Windows.
- `/bg` without a prompt now waits for input instead of sending `continue`.
- `--agent <name>` can find plugin-contributed agents without the `plugin:` prefix.

### oh-my-customcode 연관 평가

| 변경 | 영향 | Action |
|------|------|--------|
| Plugin dependency enforcement | 플러그인 disable/enable 순서 안전 | None |
| Marketplace context cost | R013 비용 점검 개선 | Use in token audits |
| `worktree.bgIsolation: "none"` | worktree 불가 repo fallback | Opt-in only with file ownership discipline |
| PowerShell policy bypass | Windows script 호환성 | Enterprise opt-out 문서화 |
| BG model/effort persistence | 장시간 에이전트 안정성 | None |
| Stop hook block cap | hook 무한루프 안전 | Hook 테스트 시 8회 cap 인지 |
| `/goal`, `/loop`, `/bg`, plugin agent fixes | autonomous workflow 안정성 | None |

**Action items**: 직접 변경 불필요. `worktree.bgIsolation: "none"`은 충돌 위험이 있으므로 기본값으로 권장하지 않고, R009 병렬 작업에서는 기존 worktree 격리를 우선합니다.

## v2.1.141 (2026-05-13) — 호환성 점검

> Issue: #1137 — CC v2.1.141 compatibility documentation

### 훅 시스템: `terminalSequence` 필드

훅 JSON 출력에 `terminalSequence` 필드가 추가되었습니다. 훅이 터미널을 제어하지 않고도 데스크탑 알림, 창 제목 변경, 터미널 벨을 발생시킬 수 있습니다.

```json
{
  "terminalSequence": "\x1b]0;[oh-my-customcode] 작업 완료\x07"
}
```

**oh-my-customcode 연관**: R012 HUD 이벤트 채널(stderr hooks)의 보완 수단. 현재 HUD는 stderr를 통해 에이전트 스폰 이벤트를 알리는데, `terminalSequence`를 통해 창 제목(window title)을 태스크 상태로 업데이트하거나 긴 병렬 작업 완료 시 벨 신호를 보내는 활용이 가능합니다. **훅 수정은 별도 보안 승인이 필요** — `.claude/hooks/` 변경 시 사용자 명시 승인 필요 (R001).

### 플러그인 설치: `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`

GitHub 플러그인 소스를 SSH 대신 HTTPS로 클론하는 환경 변수가 추가되었습니다.

```bash
export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1
claude plugin install superpowers
```

**oh-my-customcode 연관**: GitHub SSH 키가 없는 CI 환경이나 기업 방화벽 환경에서 oh-my-customcode 플러그인 설치 시 활용. CLAUDE.md 외부 의존성 섹션의 설치 명령어에는 변경 불필요 (HTTPS는 opt-in).

### 워크로드 아이덴티티: `ANTHROPIC_WORKSPACE_ID`

Federation 규칙이 둘 이상의 workspace를 커버하는 경우, 발급 토큰을 특정 workspace로 스코핑하는 환경 변수입니다.

```bash
export ANTHROPIC_WORKSPACE_ID=ws_xxxxxxxxxxxx
```

**oh-my-customcode 연관**: 멀티 workspace 엔터프라이즈 환경에서 R001(안전 규칙) 준수 측면의 워크스페이스 격리 강화. 현재 단일 workspace 사용자에게는 영향 없음.

### `claude agents --cwd <path>` — 디렉토리 스코프 세션 목록

`claude agents` 명령이 `--cwd` 플래그를 지원합니다. 특정 디렉토리로 세션 목록을 필터링합니다.

```bash
claude agents --cwd /workspace/repos/oh-my-customcode
claude agents --cwd ~/projects/my-service
```

**oh-my-customcode 연관**: R009 병렬 에이전트 모니터링 시 노이즈 감소. 모노레포 또는 멀티 프로젝트 환경에서 현재 프로젝트 에이전트만 추적 가능. `guides/claude-code/13-cli-flags.md`에 `--cwd` 플래그 추가 권장 (별도 P3).

### `/feedback` 최근 세션 포함 지원

`/feedback` 명령이 최근 24시간 또는 7일 세션을 포함할 수 있게 되었습니다. 현재 세션을 넘나드는 이슈 제보 시 유용합니다.

**oh-my-customcode 연관**: 멀티 세션에 걸친 에이전트 동작 이슈(R016 위반 패턴 등)를 Anthropic에 제보할 때 재현 컨텍스트를 자동 포함. 직접적인 harness 변경 불필요.

### Rewind 메뉴: "Summarize up to here"

Rewind 메뉴에 이전 턴까지의 컨텍스트를 압축하되 최근 대화를 보존하는 옵션이 추가되었습니다.

**oh-my-customcode 연관**: R013 ecomode context budget 관리와 상호 보완. 수동 context 압축 도구로 활용 가능 (PreCompact/PostCompact 훅 — R006 Hook Event Types). `sys-memory-keeper`가 세션 종료 시 메모리를 저장하는 R011 패턴과 함께 사용하면 중요 컨텍스트 유실 없이 압축 가능.

### Auto mode 권한 다이얼로그 개선

`permissions.ask` 규칙이 권한 프롬프트를 트리거한 경우, 다이얼로그가 그 이유를 명시적으로 표시합니다.

**oh-my-customcode 연관**: R002 권한 규칙 디버깅 개선. `bypassPermissions` 모드에서 예상치 못한 권한 프롬프트 발생 시 원인 파악이 쉬워짐. 개발자가 `.claude/hooks/hooks.json` 또는 settings의 `permissions` 설정을 진단하는 데 직접 도움.

### IDE 연결 시 "view diff in your IDE" 복원

파일 편집 권한 프롬프트에서 IDE 연결 상태일 때 "view diff in your IDE" 옵션이 복원되었습니다.

**oh-my-customcode 연관**: 영향 없음 (UX 복원, harness 연동 없음).

### `/bg` 백그라운드 에이전트 권한 모드 유지

`/bg` 또는 `←←`로 실행된 백그라운드 에이전트가 기본값으로 되돌아가지 않고 현재 세션의 권한 모드를 유지합니다.

**oh-my-customcode 연관**: R010 `bypassPermissions` 맥락에서 중요한 개선. 이전에는 `/bg`로 에이전트를 분리하면 `bypassPermissions` 설정이 유실되어 unattended 실행 중 권한 프롬프트가 발생할 수 있었습니다. **v2.1.141+에서는 `/bg` 플로우에서 권한 모드 드롭이 더 이상 발생하지 않음** — R010 Universal bypassPermissions 규칙에 따라 Agent tool 호출의 `mode: "bypassPermissions"`는 CC 2.1.212 미만에서 필요하고 2.1.212+에서는 무시되지만 호환을 위해 계속 전달하며, `/bg` 전환 시 추가 workaround 불필요.

### `claude agents`: 백그라운드 셸 잔류 에이전트 상태 수정

작업을 완료했으나 백그라운드 셸이 계속 실행 중인 에이전트가 Working 대신 Completed 상태로 올바르게 표시됩니다.

**oh-my-customcode 연관**: R009 병렬 에이전트 상태 가시성 개선. `claude agents`로 병렬 작업 모니터링 시 허위 Working 상태로 인한 혼란 감소.

### 장시간 thinking 중 스피너 피드백 개선

긴 reasoning 구간에서 스피너 표시가 개선되었습니다.

**oh-my-customcode 연관**: 영향 없음 (UX 개선, opus/opusplan 모델 사용 에이전트에서 체감 가능).

### oh-my-customcode 연관 평가

| 변경 | 영향 | Action |
|------|------|--------|
| `terminalSequence` 훅 필드 | R012 HUD 보완 가능 | P3: 창 제목 업데이트 hook 검토 |
| `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` | CI/기업 환경 플러그인 설치 | None (opt-in) |
| `ANTHROPIC_WORKSPACE_ID` | 멀티 workspace 환경 | None (단일 workspace) |
| `claude agents --cwd` | 프로젝트별 세션 필터링 | P3: cli-flags 가이드 업데이트 |
| `/feedback` 세션 범위 확장 | 이슈 제보 개선 | None |
| Rewind "Summarize up to here" | R013 수동 context 압축 | None |
| Auto mode 권한 다이얼로그 | R002 디버깅 개선 | None (수동적 효익) |
| IDE diff 옵션 복원 | UX 복원 | None |
| `/bg` 권한 모드 유지 | R010 `/bg` 플로우 안전성 향상 | **R010 규칙 노트 업데이트** |
| `claude agents` Completed 상태 수정 | R009 상태 가시성 개선 | None |
| thinking 스피너 개선 | UX | None |

**Action items**: P3 2건 (`terminalSequence` hook 검토, cli-flags 가이드 `--cwd` 추가). R010 규칙 문서에 `/bg` 권한 모드 유지 노트 추가 (이번 release에서 처리).

---

## Known Limitations

### `.gitignore` 중첩 `.md` 파일 패턴 제한

현재 `.gitignore`에는 다음 패턴이 설정되어 있습니다:

```gitignore
docs/superpowers/plans/*
!docs/superpowers/plans/*.md
```

이 패턴은 `docs/superpowers/plans/` **직접 자식** `.md` 파일만 추적합니다. git 시맨틱상 부모 디렉토리가 이미 제외(`*`)되면, 자식 디렉토리 내 파일의 `!` 부정 패턴이 효력을 발휘하지 않습니다. 예를 들어 `docs/superpowers/plans/subdir/plan.md`는 추적되지 않습니다.

**현재 영향**: 없음. `release-plan` 스킬은 `docs/superpowers/plans/YYYY-MM-DD-<name>.md` 플랫 경로만 생성합니다. 중첩 `.md` 파일 추적이 필요해질 경우의 수정 방안:

```gitignore
docs/superpowers/plans/**
!docs/superpowers/plans/*.md
!docs/superpowers/plans/<subdir>/*.md  # 추적이 필요한 서브디렉토리 명시
```

> Issue: #1147 — 문서화 전용, 코드 변경 없음.

---

## Action Items Summary

### Action items 작성 지침

측정 결과를 코멘트나 규칙의 근거로 사용하기 전에 검증 행렬이 필요한 조건을 모두 포함하는지 확인하십시오. 결과에 영향을 줄 수 있는 변수(사용자 scope 값, 모델, 세션 유형 등)를 나열하고, 각 변수마다 다른 조건을 유지한 채 해당 값만 바꾼 대조 실험을 최소 한 번 포함하십시오. 수행하지 않은 조건은 미측정으로 표시하고 일반화의 근거에서 제외하십시오.

결과를 일반화하는 문장에는 실제로 측정한 조건을 함께 명시하십시오. 관측된 결과의 주체와 적용 범위를 구분하고, 값 변경에 따른 결과 차이가 확인된 범위를 넘어 인과관계를 단정하지 마십시오. 검증 행렬이 불완전하면 추가 측정이 필요한 조건을 action item에 기록하십시오.

| Version | oh-my-customcode action | Priority |
|---------|------------------------|----------|
| v2.1.117 | None (additive) | — |
| v2.1.118 | Evaluate hooks `type: mcp_tool` for R022/R011 | P3 follow-up |
| v2.1.119 | Audit `--print` CI with disallowedTools agents | P3 follow-up |
| v2.1.139 | None (additive). `/context all` fork skill 비용 모니터링 권장 | P3 follow-up |
| v2.1.140 | P3 audit: managed `extraKnownMarketplaces` 영속화 + plugin.json default folder 무시 경고 | P3 follow-up |
| v2.1.141 | P3: `terminalSequence` hook 검토 + cli-flags `--cwd` 추가. R010 `/bg` 권한 모드 유지 노트 추가 (완료) | P3 follow-up |
| v2.1.142 | Fast Mode Opus 4.7 전환 확인 (필요 시 `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1`). `MCP_TOOL_TIMEOUT` 선택적 설정. | P3 follow-up |
| v2.1.143 | 직접 변경 불필요. `worktree.bgIsolation: "none"` opt-in 시 파일 소유권 규율 필수. Stop hook 8회 block cap 인지. | P3 follow-up |
| v2.1.144 | 호환 가능. CLAUDE.md `omcustomMinClaudeCode` v2.1.121 유지. macOS bg session FDA crash fix 확인. | None |
| v2.1.145 | docs-only. `claude agents --json` HUD 강화, Stop/SubagentStop hook `background_tasks`/`session_crons` 활용, status line GitHub PR 통합 — 별도 follow-up 권장. | P3 follow-up |
| v2.1.146 | docs-only. `/simplify`→`/code-review` 리네임 + effort level, AskUserQuestion auto-mode normalization, MCP pagination 안정성, `CLAUDE_CODE_SUBAGENT_MODEL` 자식 프로세스 전파 fix. | None |
| v2.1.147 | `Workflow` 도구(`CLAUDE_CODE_WORKFLOWS=1`) 추가 — /pipeline과 개념 중첩, 통합 검토 후보. `/simplify`→`/code-review` 개명. plugin agent 복수 `Agent()` 타입 fix. | P3 follow-up |
| v2.1.148 | Bash 도구 exit 127 regression(v2.1.147 도입) 수정 — v2.1.147 사용 시 즉시 업그레이드 권장. | None |
| v2.1.149 | `/usage` per-category(skills/subagents/plugins/MCP) breakdown, GFM 체크박스 렌더링, worktree sandbox allowlist fix, `find` macOS vnode crash fix. | P3 follow-up |
| v2.1.150 | 내부 인프라 개선만, 사용자 대면 변경 없음. 조치 불필요. | None |
| v2.1.152 | `disallowed-tools` in skill frontmatter (R002/R006), `/reload-skills`, `SessionStart reloadSkills` — no harness change needed. | None |
| v2.1.153 | statusline `COLUMNS`/`LINES` env (R012), `skipLfs` marketplace option, `claude agents` autocomplete improvement. | P3 follow-up |
| v2.1.154 | Opus 4.8 + `opus48` alias (R006), dynamic workflows (R009/R018), lean system prompt default, `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE` deprecated 06/01. | P3 follow-up |
| v2.1.156 | Opus 4.8 thinking-block API-error fix — no harness change needed. | None |
| v2.1.159 | 내부 인프라 개선만, 사용자 대면 변경 없음. 조치 불필요. | None |
| v2.1.160 | `acceptEdits` 환경은 build-tool config 파일 쓰기 시 추가 prompt 인지 필요. bypassPermissions 사용 시 영향 없음. single-file grep → read-before-edit 충족(토큰 효율 개선). | `acceptEdits` 환경 주의 |
| #1241 | Agent tool malformed-parsing on long/special-char prompts — mitigations documented in Known Platform Issues. | See below |

## v2.1.144 (2026-05-19) — 호환성 점검

> Issue: #1187 — CC v2.1.144 compatibility documentation

### `/resume` 백그라운드 세션 지원

`claude --bg` 또는 agent view로 시작된 세션이 `/resume` 목록에 표시됩니다 (`bg` 배지로 구분).

**oh-my-customcode 연관**: R018 Agent Teams 장시간 세션 및 `/bg` 플로우 복귀가 편리해집니다. 직접 변경 불필요.

### 백그라운드 subagent 완료 알림에 경과 시간 추가

백그라운드 subagent 완료 알림에 "Agent completed · 3h 2m 5s" 형태로 경과 시간이 표시됩니다.

**oh-my-customcode 연관**: R009 병렬 에이전트 성능 추적에 유용. `claude agents` 뷰에서 장시간 실행 감지(2x+ 지속 시 split 권장 — R009 Adaptive Parallel Splitting)에 활용 가능.

### `/plugin` Browse/Discover pane 마지막 업데이트 시각 표시

플러그인 마지막 업데이트 시각이 표시됩니다.

**oh-my-customcode 연관**: 필수/권장 플러그인(superpowers, context7 등) 버전 신선도 모니터링에 유용. 직접 변경 불필요.

### `/model` 현재 세션만 변경 (`d` 키로 새 세션 기본값 설정)

`/model`이 현재 세션만 변경하며, `d` 키로 새 세션 기본값을 별도 설정합니다.

**oh-my-customcode 연관**: R006 agent frontmatter `model:` 설정이 세션 기본값과 독립적으로 동작하는 동작과 정합. 직접 변경 불필요.

### "extra usage" → "usage credits" 명명 변경

`/extra-usage` → `/usage-credits` (구 명령 호환 유지).

**oh-my-customcode 연관**: CLAUDE.md 슬래시 커맨드 표 및 가이드 문서에서 `/extra-usage` 언급이 있다면 `/usage-credits`로 업데이트 권장. 현재 oh-my-customcode 문서에는 해당 커맨드 직접 노출 없음 — 영향 없음.

### 시작 시 `api.anthropic.com` 도달 불가 시 타임아웃 개선

75초 멈춤 → 15초 timeout으로 수정. captive portal/firewall/VPN 환경에서 시작 지연 대폭 감소.

**oh-my-customcode 연관**: R001 안전 규칙 및 네트워크 제한 환경에서의 CI 실행 안정성 개선. 직접 변경 불필요.

### 터미널 렌더링 수정

- 윈도 리사이즈 누락 후 터미널 출력 깨짐 → 다음 프레임에 self-heal (Ctrl+L 불필요)
- 긴 세션의 점진적 터미널 디스플레이 손상 수정
- VS Code 스피너 애니메이션 색상 수 감소로 렌더링 글리치 완화

**oh-my-customcode 연관**: R012 HUD statusline 및 장시간 병렬 에이전트 세션 가독성 개선. 직접 변경 불필요.

### macOS 배경 세션 "exit 1 before init" crash 수정 (Full Disk Access 영역)

macOS Full Disk Access 권한 영역에서 배경 세션이 초기화 전에 exit 1로 종료되던 v2.1.143 regression이 수정되었습니다.

**oh-my-customcode 연관**: R011 메모리 동작 영향 없음. macOS 환경에서 `/bg` 기반 자동화 실행 안정성 복원.

### oh-my-customcode 연관 평가

| 변경 | 영향 영역 | Action |
|------|----------|--------|
| `/resume` bg 세션 표시 | R018 세션 복귀 편의성 | None |
| 백그라운드 subagent 경과 시간 | R009 성능 추적 | None (수동 활용 가능) |
| `/plugin` 업데이트 시각 | 플러그인 신선도 확인 | None |
| `/model` 세션 vs 기본값 분리 | R006 model 설정과 정합 | None |
| `/usage-credits` 명명 변경 | 문서 참조 | None (현재 노출 없음) |
| 15초 startup timeout | CI/네트워크 환경 안정성 | None |
| 터미널 렌더링 수정 | R012 HUD 가독성 | None |
| macOS bg session crash fix | R011 메모리, `/bg` 플로우 | None |

**Action items**: 호환 가능. CLAUDE.md `omcustomMinClaudeCode` 헤더는 v2.1.121 유지 (신규 기능 의존 없음).

---

## v2.1.145 (2026-05-19) — 호환성 점검

> Issue: #1191 — CC v2.1.145 compatibility documentation

### `claude agents --json` — 라이브 세션 JSON 출력

`claude agents --json` 플래그로 라이브 Claude 세션 목록을 JSON으로 출력합니다. tmux-resurrect, status bar, session picker 등 외부 스크립팅 통합에 활용할 수 있습니다.

**oh-my-customcode 연관**: R012 HUD/statusline 강화 후보. `.claude/statusline.sh`가 `claude agents --json`을 파싱하여 활성 에이전트 수를 status bar에 표시하는 통합이 가능합니다. 별도 follow-up 권장 (P3).

### OTEL `agent_id` / `parent_agent_id` 속성 + 배경 subagent span nesting 수정

`claude_code.tool` OTEL span에 `agent_id`와 `parent_agent_id` 속성이 추가되었습니다. 배경 subagent span nesting도 수정되었습니다.

**oh-my-customcode 연관**: `monitoring-setup` 스킬 및 R018 Agent Teams 트레이싱에서 에이전트 계층 구조 추적이 개선됩니다. 호환 가능 — 기존 OTEL 설정 변경 불필요.

### Status line JSON에 GitHub repo/PR 정보 자동 포함

`.claude/statusline.sh`가 JSON 입력을 받는 경우 GitHub repo 및 PR 정보가 자동 포함됩니다.

**oh-my-customcode 연관**: R012 statusline 강화 가능. 현재 `.claude/statusline.sh`가 branch 정보를 표시하는데, GitHub PR 번호/상태를 추가로 표시하는 통합이 가능합니다. 별도 follow-up 권장 (P3).

### `/plugin` Discover/Browse 화면에 설치 전 상세 정보 표시

설치 전 commands/agents/skills/hooks/MCP/LSP 서버 목록을 확인할 수 있습니다.

**oh-my-customcode 연관**: R013 ecomode 및 토큰 효율 측면에서 플러그인 도입 전 비용/기능 점검 개선. 직접 변경 불필요.

### `claude agents` 탭 제목에 awaiting-input 카운트 표시

**oh-my-customcode 연관**: R009 병렬 에이전트 모니터링 개선. 사용자 입력 대기 에이전트를 탭 제목에서 즉시 확인 가능.

### Stop / SubagentStop hook 입력에 `background_tasks`, `session_crons` 필드 추가

Stop 및 SubagentStop hook의 입력 JSON에 `background_tasks`와 `session_crons` 필드가 추가되었습니다.

**oh-my-customcode 연관**: `.claude/hooks/` 내 `feedback-collector.sh` 및 Stop hook 스크립트와 호환됩니다 (옵션 필드이므로 기존 스크립트 영향 없음). hook input schema를 활용하는 고급 패턴(background task 완료 확인 등)에서 활용 가능 — 별도 follow-up 권장.

### Bash 명령 bare variable assignment 자동 승인 우회 취약점 수정

non-allowlisted env var의 bare variable assignment가 자동 승인을 우회하던 취약점이 수정되었습니다.

**oh-my-customcode 연관**: R002 권한 규칙 강화. `bypassPermissions` 모드 하 Bash 도구 사용 시 의도치 않은 환경 변수 주입 경로가 차단됩니다. 직접 harness 변경 불필요.

### Agent Teams non-ASCII teammate name 수정

Agent Teams 멤버 이름에 non-ASCII 문자(한국어 포함)가 포함된 경우의 버그가 수정되었습니다.

**oh-my-customcode 연관**: R018 Agent Teams에서 한국어 멤버 이름을 사용하는 경우 영향. v2.1.145로 업그레이드 후 검증 권장.

### 기타 수정

- 슬래시 커맨드/`@`-mention 제안 목록에 마우스 hover/click 지원 (fullscreen)
- 터미널 리사이즈/리포커스 후 스피너/경과시간 freeze 수정
- Task list random order 수정
- MCP prompt slash command missing argument 에러 메시지 개선

**oh-my-customcode 연관**: 영향 없음 (UX/안정성 개선).

### oh-my-customcode 연관 평가

| 변경 | 영향 영역 | 상태 |
|------|----------|------|
| `claude agents --json` | R012 HUD/statusline 통합 가능 | P3 follow-up 권장 |
| OTEL `agent_id`/`parent_agent_id` + bg subagent nesting | `monitoring-setup` 스킬 / R018 Agent Teams 트레이싱 | 호환, 후속 검토 |
| Stop/SubagentStop hook의 `background_tasks`, `session_crons` 필드 | `feedback-collector.sh` 호환 OK (옵션 필드) | hook input schema 갱신 후보 |
| Status line JSON에 GitHub repo + PR 정보 | `.claude/statusline.sh` 강화 가능 (R012) | P3 follow-up 권장 |
| Bare variable assignment auto-approve bypass fix | R002 permissions 강화 | 호환 |
| Agent Teams non-ASCII teammate name fix | R018 한국어 멤버 사용 시 영향 | v2.1.145 업그레이드 후 검증 권장 |
| `/plugin` 상세 정보 사전 표시 | R013 플러그인 비용 점검 | None |
| `claude agents` awaiting-input 카운트 | R009 병렬 모니터링 개선 | None |
| 기타 UX/안정성 수정 | 일반 개선 | None |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보 (별도 이슈로 등록 권장):
  1. `claude agents --json`을 활용한 HUD 강화 (R012)
  2. Hook input schema에 `background_tasks` / `session_crons` 활용
  3. Status line JSON GitHub PR 정보 통합 (R012)

---

## v2.1.146 (2026-05-21) — 호환성 점검

> Issue: #1205 — Claude Code v2.1.146 compatibility documentation

### `/simplify` → `/code-review` 리네임 (+ effort level)

기존 `/simplify` 슬래시 커맨드가 `/code-review`로 리네임되었습니다. effort level을 인수로 지정할 수 있습니다 (예: `/code-review high`).

**oh-my-customcode 연관**: 내부 `dev-review` 스킬과 명칭이 다르며 충돌 없음. 사용자가 네이티브 `/code-review`와 omcustom `dev-review` 스킬을 혼동하지 않도록 구분 안내가 필요할 수 있습니다 (별도 follow-up 후보). 직접 harness 변경 불필요.

### Auto mode `AskUserQuestion` 억제 해제

Auto mode에서 user 또는 skill이 명시적으로 요청한 경우 `AskUserQuestion` 호출이 더 이상 억제되지 않습니다.

**oh-my-customcode 연관**: R015 intent transparency의 ambiguity-gate 패턴이 정상 작동합니다. 신뢰도 < 70% 구간에서 `AskUserQuestion`을 통한 명시적 확인 요청이 auto mode에서도 동작하므로 R015 오탐(ambiguous routing 무음 처리)이 감소합니다. 호환, 개선.

### MCP `resources/list`, `resources/templates/list`, `prompts/list` 페이지네이션 수정

1페이지 이후의 항목이 누락되던 버그가 수정되었습니다.

**oh-my-customcode 연관**: `ListMcpResourcesTool` 페이지네이션 안정성이 개선됩니다. `ontology-rag` 등 R019 MCP 서버에서 리소스 목록이 많은 경우 전체 항목이 정상 조회됩니다. 호환, 개선.

### `CLAUDE_CODE_SUBAGENT_MODEL` 자식 프로세스 전파 수정

`CLAUDE_CODE_SUBAGENT_MODEL` 환경 변수가 다중 에이전트 세션의 자식 프로세스에 전파되지 않던 버그가 수정되었습니다.

**oh-my-customcode 연관**: R010 + R018 Agent Teams 멤버 모델 일관성에 직접 영향. `CLAUDE_CODE_SUBAGENT_MODEL`을 설정한 환경에서 Agent Teams 멤버가 지정 모델을 올바르게 사용하는지 v2.1.146 업그레이드 후 검증 권장. 호환, 검증 권장.

### Windows 관련 수정 (macOS 영향 없음)

- Windows PowerShell `pwsh` winget/Store 설치 실패 fix (v2.1.124 regression)
- Windows Terminal background session strobing fix
- Windows NTFS junction background-job worktree 안전성 개선
- GNOME Terminal right/middle-click paste fix

**oh-my-customcode 연관**: macOS 개발 환경에는 직접 영향 없음.

### 기타 수정

- `/background` skill-or-custom-slash-only 입력 수용 fix → `/bg` 플로우(R010 Universal bypassPermissions) 개선
- Backgrounded sessions tool permission "don't ask again" 재요청 fix → R010 bypassPermissions 안정성 개선
- Auto-updater 상태줄 fail 시 현재 버전 표시 fix → R012 statusline 영향 없음 (별도)
- Agent SDK 스트리밍 세션 종료 시 uncaught exception fix → agent-sdk-* 플러그인 영향 가능, 모니터 권장
- `forceLoginOrgUUID`/`forceLoginMethod` managed-settings enforcement fix → R002 직접 영향 없음
- Auto-updater 일시적 네트워크 실패 retry 개선
- 대용량 파일 편집 diff 렌더링 성능 개선
- `/theme` color editor + "New custom theme" Esc 미응답 fix

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| `/simplify` → `/code-review` 리네임 + effort level | 내부 `dev-review` skill과 명칭 다름, 충돌 없음 | 호환, 별도 조치 없음 |
| Auto mode `AskUserQuestion` 억제 해제 | R015 intent transparency, ambiguity-gate 정상 작동 | 호환, 개선 |
| MCP 페이지네이션 수정 | `ListMcpResourcesTool` 페이지네이션 안정성 | 호환, 개선 |
| `CLAUDE_CODE_SUBAGENT_MODEL` 자식 프로세스 전파 fix | R010 + R018 Agent Teams 멤버 모델 일관성 개선 | 호환, 검증 권장 |
| `/background` 입력 수용 fix | `/bg` 플로우 개선 | 호환, 개선 |
| Backgrounded sessions permission "don't ask again" fix | R010 bypassPermissions 안정성 | 호환, 개선 |
| Agent SDK 스트리밍 uncaught exception fix | agent-sdk-* 플러그인 영향 가능 | 호환, 모니터 |
| Windows/터미널 관련 수정 | macOS 환경 직접 영향 없음 | 호환 |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보:
  - `CLAUDE_CODE_SUBAGENT_MODEL` 전파 동작 검증 (R018 Agent Teams 멤버 모델 일관성)
  - 외부 `/code-review`와 내부 `dev-review` skill 구분 안내 (CLAUDE.md 또는 dev-review skill 본문)
  - Agent SDK 스트리밍 fix가 agent-sdk-dev 플러그인에 미치는 영향 모니터

---

## v2.1.147 (2026-05-21) — 호환성 점검

> Issue: #1216 — Claude Code v2.1.147 compatibility documentation

### `Workflow` 도구 추가 (기본 off)

deterministic multi-agent orchestration을 위한 새 `Workflow` 도구가 추가되었습니다. `CLAUDE_CODE_WORKFLOWS=1` 환경 변수로 활성화할 수 있으며, 기본값은 비활성입니다.

**oh-my-customcode 연관**: oh-my-customcode `/pipeline` 스킬(workflows/*.yaml 기반)과 개념적으로 중첩됩니다. 향후 네이티브 `Workflow` 도구 통합 검토 후보이나, 현재 기본 off이므로 영향 없음. 호환.

### `/simplify` → `/code-review` 개명 (+ effort level, `--comment`)

기존 `/simplify` 슬래시 커맨드가 `/code-review`로 개명되었습니다. 선택한 effort 수준으로 correctness 버그를 보고하며(`/code-review high`), `--comment` 플래그로 inline PR 코멘트를 게시할 수 있습니다. 기존 cleanup-and-fix 동작은 제거되었습니다.

**oh-my-customcode 연관**: CC 빌트인 `/code-review`와 내부 `dev-review`/`code-review` 스킬의 명칭 혼동 방지 안내가 필요합니다. v2.1.146에서 최초 리네임된 내용의 연속입니다. `.claude/skills/intent-detection/patterns/agent-triggers.yaml`의 `skill-simplify` 라우팅 엔트리는 내부 스킬 라우팅이므로 CC 빌트인 제거와 무관하나, 명명 혼동 방지를 위해 점검이 권장됩니다.

### REPL 및 Workflow 도구 샌드박스 강화

prototype-pollution 및 thenable 기반 escape에 대한 샌드박스 보안이 강화되었습니다.

**oh-my-customcode 연관**: R001 안전 규칙과 정합. 보안 강화이므로 호환, 개선.

### plugin agent 복수 `Agent(...)` 타입 fix

plugin agents가 `tools:` frontmatter에 복수 `Agent(...)` 타입을 선언 시 마지막 항목만 남기고 나머지를 드롭하던 버그가 수정되었습니다.

**oh-my-customcode 연관**: oh-my-customcode 에이전트 frontmatter에서 `tools:`에 복수 Agent() 타입을 선언하는 경우 이전에는 마지막만 인식되었습니다. 영향 점검이 권장됩니다.

### hook `if` 조건 매칭 버그 수정

hook `if` 조건(예: `PowerShell(git push*)`)이 매칭되지 않던 버그가 수정되었습니다 (`PowerShell(*)`만 동작했음).

**oh-my-customcode 연관**: `.claude/hooks/` 내 조건부 hook(`if` 필드 사용)의 정확한 매칭이 보장됩니다. R001 안전 규칙의 stage-blocker hook 신뢰성이 향상됩니다. 호환, 개선.

### 기타 수정

- auto-updater 개선: transient 네트워크 실패 재시도, OS 에러 코드 보고
- diff 렌더링 성능 개선
- prompt history 연속 중복 제거
- enterprise login 제한 강제 수정

**oh-my-customcode 연관**: 일반 안정성 개선. 직접 영향 없음.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| `Workflow` 도구 추가 (기본 off) | `/pipeline` 스킬과 개념 중첩, 향후 통합 후보 | 호환, follow-up 후보 |
| `/simplify` → `/code-review` 개명 | 내부 `dev-review` 스킬과 명칭 혼동 주의 | 호환, agent-triggers.yaml 점검 권장 |
| REPL/Workflow 샌드박스 강화 | R001 보안 강화 | 호환, 개선 |
| plugin agent 복수 Agent() 타입 fix | frontmatter `tools:` 복수 Agent() 선언 영향 점검 | 호환, 영향 점검 권장 |
| hook `if` 조건 매칭 fix | stage-blocker hook 신뢰성 향상 | 호환, 개선 |
| auto-updater / diff / history 개선 | 일반 안정성 | 호환 |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보:
  1. CC 빌트인 `/code-review`와 내부 `dev-review` skill 구분 안내 보강
  2. `agent-triggers.yaml`의 `skill-simplify` 엔트리 명명 혼동 방지 점검
  3. plugin agent frontmatter `tools:` 복수 Agent() 선언 영향 점검
  4. `Workflow` 도구와 `/pipeline` 스킬 통합 가능성 연구 (중장기)

---

## v2.1.148 (2026-05-22) — 호환성 점검

> Issue: #1218 — Claude Code v2.1.148 compatibility documentation

### Bash 도구 exit code 127 regression 수정 (긴급)

v2.1.147에서 도입된 regression으로, 일부 사용자에게서 Bash 도구가 모든 명령에 대해 exit code 127을 반환하던 버그가 수정되었습니다.

**oh-my-customcode 연관**: Bash 도구를 사용하는 gh, git, 빌드/테스트 명령 등 oh-my-customcode 워크플로우 전반에 영향을 줍니다. v2.1.147을 사용 중이라면 v2.1.148로 즉시 업그레이드가 권장됩니다.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| Bash exit code 127 regression fix | 모든 Bash 도구 사용 워크플로우 복구 | 즉시 업그레이드 권장 |

**Action items**:
- v2.1.147 사용 중이면 v2.1.148로 즉시 업그레이드
- 본 릴리스에서 코드 변경 없음 (docs-only)

---

## v2.1.149 (2026-05-22) — 호환성 점검

> Issue: #1219 — Claude Code v2.1.149 compatibility documentation

### `/usage` per-category 사용량 분석

`/usage`가 limits 사용량 분석을 카테고리별로 표시합니다: skills, subagents, plugins, per-MCP-server 비용 세분화.

**oh-my-customcode 연관**: R013 ecomode 토큰 추적, R012 statusline, `token-efficiency-audit` 스킬과 연관됩니다. per-MCP 비용 가시성 덕분에 `ontology-rag` 등 R019 MCP 서버의 비용을 모니터링할 수 있습니다. 호환, 개선.

### `/diff` 키보드 스크롤 지원

`/diff` 상세 뷰에서 키보드 스크롤이 지원됩니다 (arrows, j/k, PgUp/PgDn, Space, Home/End).

**oh-my-customcode 연관**: 코드 리뷰 워크플로우의 UX 향상. 직접 harness 변경 불필요.

### GFM 체크박스 렌더링

Markdown 출력이 GFM task list 체크박스(`- [ ]`/`- [x]`)를 일반 bullet 대신 체크박스로 렌더링합니다.

**oh-my-customcode 연관**: 에이전트 작업 목록(`- [ ]`/`- [x]`) 출력 가독성이 향상됩니다. 호환, 개선.

### git worktree 샌드박스 write allowlist 수정

git worktree에서 sandbox write allowlist가 main repo root 전체 대신 공유 `.git` 디렉토리만 커버하도록 수정되었습니다 (hooks/, config는 deny).

**oh-my-customcode 연관**: `EnterWorktree` 사용 시 보안이 강화됩니다. R001 안전 규칙과 정합. 호환, 보안 개선.

### Bash `find` macOS 크래시 버그 수정

Bash 도구의 `find` 명령이 macOS system file/vnode table을 소진하여 호스트를 크래시시키던 버그가 수정되었습니다.

**oh-my-customcode 연관**: Bash 도구로 대형 디렉토리를 탐색하는 oh-my-customcode 워크플로우의 호스트 안정성이 향상됩니다. 중요한 수정이므로 업그레이드가 권장됩니다.

### `/ultraplan` 및 remote session 생성 수정

작업 트리에 실제 변경이 없을 때 "Could not capture uncommitted changes"로 실패하던 버그가 수정되었습니다.

**oh-my-customcode 연관**: `/ultraplan` 및 remote session 기반 워크플로우 안정성이 향상됩니다. 호환, 개선.

### 기타 수정

- enterprise `allowAllClaudeAiMcps` managed setting 추가
- PowerShell 권한 우회 수정 (built-in `cd` 함수): macOS 환경 직접 영향 없음

**oh-my-customcode 연관**: macOS 개발 환경에는 직접 영향 없음.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| `/usage` per-category breakdown | R013 ecomode / R012 statusline / MCP 비용 가시성 | 호환, 개선 |
| `/diff` 키보드 스크롤 | 코드 리뷰 UX 향상 | 호환, 개선 |
| GFM 체크박스 렌더링 | 에이전트 작업 목록 가독성 향상 | 호환, 개선 |
| worktree sandbox write allowlist fix | EnterWorktree 보안 강화 | 호환, 보안 개선 |
| Bash `find` macOS 크래시 fix | 대형 디렉토리 탐색 호스트 안정성 향상 | 업그레이드 권장 |
| `/ultraplan` 생성 fix | remote session 워크플로우 안정성 | 호환, 개선 |
| PowerShell `cd` 권한 fix | macOS 영향 없음 | 호환 |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보:
  1. `/usage` per-MCP-server 비용 데이터를 `token-efficiency-audit` 스킬에 통합 검토
  2. R012 statusline에 per-category usage 표시 강화 검토

---

## v2.1.150 (2026-05-23) — 호환성 점검

> Issue: #1220 — Claude Code v2.1.150 compatibility documentation

### 내부 인프라 개선

내부 인프라 개선으로, 사용자 대면 변경 사항은 없습니다.

**oh-my-customcode 연관**: 코드 및 문서 변경 불필요. 추적 기록용 docs-only 항목입니다.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| 내부 인프라 개선 | 사용자 대면 변경 없음 | 조치 불필요 |

**Action items**:
- 코드 및 문서 변경 불필요 (추적 기록용 docs-only)

---

## v2.1.152 (2026-05-27) — 호환성 점검

> Issue: #1242 — CC v2.1.152 tracking

### Skill/slash-command `disallowed-tools` frontmatter (R002/R006)

Skills and slash commands can now declare `disallowed-tools` in their frontmatter to remove specific tools from the model while the skill is active.

**oh-my-customcode 연관**: R002 tool permission tiers 및 R006 skill frontmatter optional fields와 직접 연관됩니다. 특정 스킬 실행 구간에 Bash나 Write 등 위험 도구를 제거하는 세밀한 tool scope 제어가 가능해집니다. 예: 조사 전용 스킬에서 `disallowed-tools: [Bash, Write]` 선언으로 read-only 강제. 신규 스킬 작성 시 활용 권장.

### `/reload-skills` 명령 + `SessionStart reloadSkills: true`

`/reload-skills` 커맨드로 세션 재시작 없이 스킬 디렉토리를 재스캔할 수 있습니다. `SessionStart` 훅이 `reloadSkills: true`를 반환하면 훅이 설치한 스킬이 동일 세션 내에서 즉시 사용 가능합니다.

**oh-my-customcode 연관**: R006 스킬 인프라 및 SessionStart 훅(`hooks.json`)과 연관됩니다. 현재 SessionStart 훅은 HUD 초기화 및 메모리 로드에 사용되는데, 훅에서 스킬을 동적 설치하는 패턴이 필요한 경우 `reloadSkills: true`로 즉시 적용 가능합니다. 현재 하네스에서 즉시 활용 계획 없음 — 직접 변경 불필요.

### `SessionStart` 훅 세션 제목 설정

`SessionStart` 훅이 `hookSpecificOutput.sessionTitle`을 통해 세션 제목을 설정할 수 있습니다.

**oh-my-customcode 연관**: R012 HUD와 결합하여 프로젝트/에이전트 컨텍스트를 창 제목에 반영하는 것이 가능합니다. 선택적 활용.

### `MessageDisplay` 훅 이벤트

어시스턴트 메시지 텍스트를 표시 시점에 변환하거나 숨길 수 있는 새 훅 이벤트입니다.

**oh-my-customcode 연관**: 고급 HUD 커스터마이제이션 후보. `.claude/hooks/` 변경은 R001에 따라 사용자 명시 승인 필요.

### 기타 변경

- `--fallback-model` 설정 시 주 모델 불가 상태에서 세션 내 자동 fallback (오류 없이 계속)
- Auto mode opt-in consent 제거 (자동화 환경 진입 간소화)
- 터미널 렌더링 안정성 개선 다수 (툴 결과 링크 클릭, 마크다운 테이블, 포커스 모드 등)

**oh-my-customcode 연관**: `--fallback-model` 패턴은 R006 `model:` 프론트매터의 보완 수단으로 CI 환경에서 활용 가능합니다. 직접 harness 변경 불필요.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| Skill `disallowed-tools` frontmatter | R002/R006 tool scope 세밀 제어 | 신규 스킬에서 선택적 활용 (opt-in) |
| `/reload-skills` + `SessionStart reloadSkills` | R006 스킬 동적 로딩 | None (현재 즉각 활용 계획 없음) |
| `SessionStart` 세션 제목 설정 | R012 HUD 강화 후보 | P3 follow-up |
| `MessageDisplay` 훅 | HUD 고급 커스터마이제이션 | P3 follow-up |
| `--fallback-model` | CI 환경 모델 안정성 | None (opt-in) |
| 터미널 렌더링 수정 | UX 개선 | None |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보:
  1. `disallowed-tools` frontmatter를 read-only 스킬(연구·분석)에 적용 검토
  2. `SessionStart sessionTitle` hook을 R012 HUD 창 제목 통합에 활용 검토

---

## v2.1.153 (2026-05-28) — 호환성 점검

> Issue: #1243 — CC v2.1.153 tracking

### Statusline scripts `COLUMNS`/`LINES` 환경 변수 수신 (R012)

`.claude/statusline.sh`를 포함한 statusline 스크립트가 `COLUMNS`와 `LINES` 환경 변수를 받게 되어 출력을 터미널 너비에 맞게 조정할 수 있습니다.

**oh-my-customcode 연관**: R012 HUD Statusline과 직접 연관됩니다. 현재 `.claude/statusline.sh`는 고정 형식으로 출력되는데, 좁은 터미널에서 상태줄이 잘리는 문제를 `COLUMNS`를 활용하여 반응형으로 개선할 수 있습니다. 별도 follow-up 권장 (P3).

### `skipLfs` 플러그인 마켓플레이스 옵션

`github`/`git` 플러그인 마켓플레이스 소스에 `skipLfs: true` 옵션이 추가되어 Git LFS 다운로드를 건너뛸 수 있습니다.

**oh-my-customcode 연관**: 대형 LFS 에셋을 포함한 플러그인을 사용하는 환경에서 설치 속도 개선에 활용 가능합니다. 현재 oh-my-customcode 마켓플레이스 설정에는 직접 영향 없음.

### `claude agents` 자동완성 개선

dispatch 입력의 자동완성이 프로젝트 스킬뿐 아니라 네이티브 슬래시 커맨드와 번들 스킬도 제안합니다.

**oh-my-customcode 연관**: R019 라우팅 및 에이전트 디스패치 UX 개선. 네이티브 `/code-review`와 내부 `dev-review` 스킬 구분이 자동완성에서도 명확해집니다. 직접 harness 변경 불필요.

### `/model` 기본값 저장 (`s` 키로 현재 세션만 변경)

`/model` 선택이 새 세션 기본값으로 저장됩니다. 현재 세션만 변경하려면 `s` 키를 사용합니다. 기존 `d` 키는 `s` 키(`thisSessionOnly`)로 변경되었습니다.

**oh-my-customcode 연관**: R006 agent frontmatter `model:` 설정이 세션 기본값과 독립적으로 동작하는 기존 동작과 정합. keybindings.json에서 `modelPicker:setAsDefault`를 커스터마이즈한 경우 `modelPicker:thisSessionOnly`로 rename 필요.

### 기타 수정 (안정성)

- MCP 서버 frontmatter policy 적용 수정 (`--strict-mcp-config`, managed settings 정책)
- 과도한 메모리 사용 수정 (세션 파일 경로로 세션 재개 시 여러 GB)
- `Agent` 도구 `subagent_type: 'claude'` 사용 시 gitignored 경로 출력 무음 폐기 수정
- stateful MCP 서버 reconnect-loop regression 수정 (v2.1.147 도입)
- 백그라운드 세션 다수 UX/안정성 수정

**oh-my-customcode 연관**: MCP 정책 수정은 R011 native auto-memory 및 R019 ontology-rag 서버 동작에 영향 가능합니다. `subagent_type: 'claude'` gitignored 경로 수정은 R010 subagent 델리게이션 시 `.claude/outputs/` 아티팩트 채널 사용 신뢰성을 높입니다.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| Statusline `COLUMNS`/`LINES` | R012 반응형 statusline 가능 | P3 follow-up |
| `skipLfs` 마켓플레이스 옵션 | LFS 포함 플러그인 설치 개선 | None |
| `claude agents` 자동완성 | 네이티브/내부 스킬 구분 UX | None |
| `/model` 기본값 저장 (`s` 키) | R006 model 설정 정합 | keybindings.json 커스터마이즈 시 rename |
| MCP 서버 frontmatter policy 수정 | R011/R019 MCP 서버 정책 안정성 | 호환, 개선 |
| MCP 과다 메모리 사용 수정 | 장시간 세션 안정성 | 호환, 개선 |
| `subagent_type: 'claude'` gitignored 수정 | R010 아티팩트 채널 신뢰성 | 호환, 개선 |

**Action items**:
- 본 릴리스에서 코드 변경 없음 (docs-only)
- 후속 follow-up 후보:
  1. `.claude/statusline.sh`에 `COLUMNS` 기반 반응형 출력 적용 (R012)

---

## v2.1.154 (2026-05-28) — 호환성 점검

> Issue: #1244 — CC v2.1.154 tracking

> **Note**: v2.1.151 및 v2.1.155는 공개 릴리즈가 없었습니다 (Claude Code는 일부 패치 번호를 건너뜁니다).

### Opus 4.8 도입 (R006 model aliases)

Opus 4.8이 출시되었습니다. 기본 effort는 `high`이며, `/effort xhigh`로 최고 추론 강도를 활성화할 수 있습니다. Fast Mode on Opus 4.8이 표준 요금의 2배 가격에 2.5배 속도로 제공됩니다.

**oh-my-customcode 연관**: R006 model aliases 표에 `opus48` alias 추가가 필요합니다. 현재 `opus` alias는 `claude-opus-4-6`을 가리키며, Opus 4.8 사용 에이전트는 full model ID(`claude-opus-4-8`) 또는 신규 alias를 명시해야 합니다. `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE` 환경 변수는 **2026-06-01 폐기 예정** — 해당 변수를 사용하는 환경에서는 `/model claude-opus-4-6[1m]` + `/fast on`으로 전환 필요합니다.

**추천 업데이트**: R006 MUST-agent-design.md의 model aliases 표에 `opus48` → `claude-opus-4-8` 항목 추가. 별도 이슈로 추적 권장.

### Dynamic Workflows — `Workflow` 도구 (R009/R018)

`Workflow` 도구가 일반 공개되었습니다. `/workflows`로 실행 중인 워크플로우를 확인할 수 있습니다. 백그라운드에서 수십~수백 개의 에이전트를 오케스트레이션합니다.

**oh-my-customcode 연관**: R009 병렬 실행 및 R018 Agent Teams와 개념적으로 중첩됩니다. oh-my-customcode `/pipeline` 스킬(workflows/*.yaml)과의 통합 가능성이 높아졌습니다. 현재는 네이티브 `Workflow` 도구를 실험적으로 평가하는 단계이며, R009/R018 기존 패턴이 기본으로 유지됩니다. 중장기 통합 후보 (P2).

### Lean system prompt 기본값 변경

Lean system prompt가 Haiku, Sonnet, Opus 4.7 이하를 제외한 모든 모델의 기본값이 되었습니다.

**oh-my-customcode 연관**: Opus 4.8 기반 에이전트(arch-documenter, arch-speckit-agent 등)는 lean system prompt로 실행됩니다. system prompt 토큰이 감소하여 R013 ecomode context budget에 긍정적입니다. 직접 harness 변경 불필요.

### `AskUserQuestion` 자제 개선

Claude가 스스로 판단할 수 있는 상황에서는 multiple-choice prompt를 보내지 않도록 개선되었습니다.

**oh-my-customcode 연관**: R015 intent transparency의 ambiguity-gate 패턴과 정합. 불필요한 확인 요청 감소로 자동화 흐름이 개선됩니다.

### `/simplify` 역할 변경

`/simplify`가 이제 cleanup-only review(재사용, 단순화, 효율성)를 실행하고 수정사항을 적용합니다. `/code-review --fix`의 전체 버그 탐색 리뷰와는 별도입니다.

**oh-my-customcode 연관**: v2.1.146/v2.1.147에서 언급된 `/simplify`→`/code-review` 개명의 후속 조치입니다. 내부 `dev-review` 스킬과는 여전히 충돌 없음.

### `claude agents`: shell 명령 백그라운드 세션으로 실행

`claude agents`에서 `! <command>`를 입력하면 셸 명령이 독립 백그라운드 세션으로 실행됩니다. `claude --bg --exec '<command>'`와 동일합니다.

**oh-my-customcode 연관**: 긴 CI/빌드 명령을 백그라운드로 분리할 때 유용합니다. R010 Universal bypassPermissions와 무관 (별도 채널).

### 기타 변경

- Plugins `defaultEnabled: false` — 필요 시 명시 활성화 가능 (oh-my-customcode 필수 플러그인 영향 없음)
- Streaming tool execution 항상 활성화 (Bedrock/Vertex/Foundry 포함)
- `Stdio MCP` 서브프로세스에 `CLAUDE_CODE_SESSION_ID`, `CLAUDECODE=1` 환경 변수 전달
- `rm -rf $HOME` trailing slash 경우 위험 경로 차단 수정 (R001 보안 강화)
- 배경 에이전트 worktree 격리 guard 수정 (공유 체크아웃 write 방지)

**oh-my-customcode 연관**: `CLAUDE_CODE_SESSION_ID` 전달은 R011 native auto-memory의 세션 스코핑에 활용 가능합니다. `rm -rf $HOME` trailing slash 수정은 R001 안전 규칙 강화입니다.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| Opus 4.8 도입 | R006 model aliases 업데이트 필요 | 별도 이슈 등록 권장 (P2) |
| `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE` 폐기 (06/01) | 해당 변수 사용 환경 전환 필요 | 06/01 이전 조치 필요 |
| Dynamic Workflows | R009/R018 + `/pipeline` 스킬 통합 후보 | P2 follow-up |
| Lean system prompt 기본값 | Opus 4.8 에이전트 토큰 감소 | None (자동 적용) |
| `AskUserQuestion` 자제 | R015 ambiguity-gate 개선 | None |
| `/simplify` cleanup-only | 내부 `dev-review`와 충돌 없음 | None |
| `! <command>` bg shell | 빌드 명령 백그라운드 분리 | None (opt-in) |
| `CLAUDE_CODE_SESSION_ID` MCP 전달 | R011 MCP 세션 스코핑 | None (옵션 활용) |
| `rm -rf $HOME` trailing slash fix | R001 보안 강화 | None |
| 배경 에이전트 worktree guard fix | R009 격리 안전성 | None |

**Action items**:
- **[P2]** R006 MUST-agent-design.md model aliases 표에 `opus48` → `claude-opus-4-8` 추가 (별도 이슈 등록 권장)
- **[긴급]** `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE` 사용 환경이 있다면 2026-06-01 전에 `/model claude-opus-4-6[1m]` + `/fast on` 패턴으로 전환
- **[P2]** Dynamic Workflows와 `/pipeline` 스킬 통합 가능성 연구

---

## v2.1.158 (2026-05-30)

### oh-my-customcode 영향

| 변경 | 영향 | 적용 |
|------|------|------|
| Auto mode가 Bedrock/Vertex/Foundry에서 Opus 4.7/4.8 지원 (`CLAUDE_CODE_ENABLE_AUTO_MODE=1`) | 멀티 클라우드 백엔드에서 auto 모드 사용 가능 | R006 permissionMode `auto` — 백엔드 무관 동작 |

## v2.1.157 (2026-05-29)

### oh-my-customcode 영향

| 변경 | 영향 | 적용 |
|------|------|------|
| `.claude/skills` 디렉토리 플러그인 자동 로드 (마켓플레이스 불필요) | 내부 스킬 배포 단순화 | 외부 의존성 설치 절차 간소화 가능 |
| `claude plugin init <name>` 스캐폴딩 추가 | 신규 플러그인 생성 도구 | mgr-creator 워크플로우 보완 |
| `settings.json` `agent` 필드가 dispatched session에서 honored (`--agent` override) | 메인 스레드 에이전트 지정 가능 | R006 main-thread agent 참조 |
| `EnterWorktree` 세션 중 Claude-managed worktree 간 전환 | 워크트리 격리 작업 유연성 | R006 worktree isolation 참조 |
| `tool_decision` telemetry에 `tool_parameters` 포함 (`OTEL_LOG_TOOL_DETAILS=1`) | bash/MCP/skill 파라미터 추적 가능 | R012 monitoring + monitoring-setup 스킬 참조 |
| Claude-managed worktree 종료 시 자동 unlock (`git worktree remove/prune` 가능) | 워크트리 정리 자동화 | R006 worktree 참조 |
| 다수 버그 수정 (이미지 처리, sandbox 권한, `claude agents` 세션, `--resume`) | 안정성 향상 | 영향 없음 |

## v2.1.160 (2026-06-02) — 호환성 점검

> Issue: #1280

### shell startup 파일 및 build-tool config 파일 쓰기 전 prompt 추가

`.zshenv`, `.zlogin`, `.bash_login` 등 shell startup 파일과 `~/.config/git/` 쓰기 전 확인 prompt가 추가되었습니다. 의도치 않은 shell 명령 실행 방지가 목적입니다.

**oh-my-customcode 연관**: R001 안전 규칙과 정합. `bypassPermissions` 모드에서는 이 prompt가 우회됩니다 — R010 Universal bypassPermissions를 사용하는 워크플로우에는 영향 없음.

### `acceptEdits` 모드에서 build-tool config 파일 쓰기 전 prompt (R002/R006)

`acceptEdits` 모드에서 code-execution 권한을 부여할 수 있는 build-tool config 파일(`.npmrc`, `.yarnrc*`, `bunfig.toml`, `.bazelrc`, `.pre-commit-config.yaml`, `.devcontainer/` 등) 쓰기 전 확인 prompt가 추가되었습니다.

**oh-my-customcode 연관**: R002 권한 티어 및 R006 `acceptEdits` 모드 동작과 직접 연관됩니다. **`bypassPermissions` 모드를 사용하는 경우(R010 Universal bypassPermissions) 이 prompt는 우회됩니다** — 기존 oh-my-customcode 서브에이전트 워크플로우에 영향 없음. `acceptEdits` 모드로 운영하는 환경에서는 위 파일 타입 쓰기 시 추가 확인이 발생합니다.

### single-file `grep` 명령이 read-before-edit 체크 충족 (R023/도구 효율)

single-file `grep`/`egrep`/`fgrep` 명령 실행이 해당 파일에 대한 read-before-edit 체크를 충족합니다. Edit 이전에 별도 Read 호출 없이 `grep` 결과만으로도 사전 읽기 조건을 만족합니다.

**oh-my-customcode 연관**: R023 Verification Ladder의 Tier 1(결정론적 검사) 시프트-레프트 원칙과 정합됩니다. `grep`으로 파일 내용을 확인한 후 Edit를 사용하는 워크플로우에서 불필요한 Read 호출이 줄어들어 토큰 효율이 개선됩니다.

### `claude agents` 완료 세션 복원 시 chat history 유실 수정

`claude agents`에서 완료된 세션 복원 시 chat history가 유실되고 원본 prompt가 재실행되던 버그가 수정되었습니다.

**oh-my-customcode 연관**: R018 Agent Teams 장시간 세션 복원 신뢰성이 향상됩니다.

### 야간 retire 후 재연결된 background 세션 conversation 유실 수정

야간 retire 후 재연결된 background 세션에서 conversation이 유실되던 버그가 수정되었습니다.

**oh-my-customcode 연관**: R011 native auto-memory 세션 지속성 및 R018 Agent Teams 장기 실행 세션 안정성이 향상됩니다.

### `claude --bg` cold-start "socket missing" 오류 수정

`claude --bg` cold-start 시 "socket missing" 오류가 발생하던 버그가 수정되었습니다.

**oh-my-customcode 연관**: R010 Universal bypassPermissions + `/bg` 플로우의 초기 기동 안정성이 개선됩니다.

### WSL copy-on-select Windows 클립보드 수정

WSL 환경에서 copy-on-select 시 Windows 클립보드가 정상 동작하도록 수정되었습니다 (PowerShell interop).

**oh-my-customcode 연관**: macOS 개발 환경에는 직접 영향 없음.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| shell startup + `~/.config/git/` 쓰기 prompt | R001 안전 강화. bypassPermissions 모드는 우회 | None (bypassPermissions 사용 시 영향 없음) |
| `acceptEdits` build-tool config 파일 쓰기 prompt | R002/R006 연관. bypassPermissions 모드는 우회 | **`acceptEdits` 환경**은 대상 파일 타입 쓰기 시 확인 발생 |
| single-file `grep` → read-before-edit 충족 | R023 Tier 1 시프트-레프트, 토큰 효율 개선 | None (자동 적용, 도구 사용 패턴 최적화 가능) |
| `claude agents` 완료 세션 복원 chat history 유실 수정 | R018 세션 복원 신뢰성 | None |
| background 세션 conversation 유실 수정 | R011/R018 장기 세션 안정성 | None |
| `claude --bg` cold-start fix | R010 `/bg` 기동 안정성 | None |
| WSL 클립보드 수정 | macOS 환경 영향 없음 | None |

**Action items**:
- **`acceptEdits` 모드 환경**: `.npmrc`, `bunfig.toml`, `.devcontainer/` 등 build-tool config 파일 쓰기 워크플로우에서 추가 확인 prompt 발생 여부 인지 필요. `bypassPermissions` 모드 전환으로 해소 가능 (R010 권고).
- 본 릴리스에서 코드 변경 없음 (docs-only)

---

## v2.1.159 (2026-05-31) — 호환성 점검

> Issue: #1276

### 내부 인프라 개선

내부 인프라 개선으로, 사용자 대면 변경 사항은 없습니다.

**oh-my-customcode 연관**: 코드 및 문서 변경 불필요. 추적 기록용 docs-only 항목입니다.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| 내부 인프라 개선 | 사용자 대면 변경 없음 | 조치 불필요 |

**Action items**:
- 코드 및 문서 변경 불필요 (추적 기록용 docs-only)

---

## v2.1.156 (2026-05-29) — 호환성 점검

> Issue: #1245 — CC v2.1.156 tracking

> **Note**: v2.1.155는 공개 릴리즈가 없었습니다 (Claude Code는 일부 패치 번호를 건너뜁니다).

### Opus 4.8 thinking-block API 오류 수정

Opus 4.8에서 thinking blocks가 수정되어 API 오류가 발생하던 버그가 수정되었습니다.

**oh-my-customcode 연관**: Opus 4.8 기반 에이전트(v2.1.154에서 도입)의 안정성이 개선됩니다. v2.1.154로 Opus 4.8을 도입한 경우 v2.1.156으로 업그레이드가 강력히 권장됩니다. 직접 harness 변경 불필요.

### oh-my-customcode 연관 평가

| 변경 | oh-my-customcode 영향 | 조치 |
|------|----------------------|------|
| Opus 4.8 thinking-block API 오류 수정 | Opus 4.8 에이전트 안정성 복구 | v2.1.154 사용 시 즉시 업그레이드 |

**Action items**:
- v2.1.154를 사용 중이라면 v2.1.156으로 즉시 업그레이드 (Opus 4.8 thinking-block 안정성)
- 본 릴리스에서 코드 변경 없음 (docs-only)

---

## v2.1.277 (2026-09-18)

> Issue: #1714 — Claude Code v2.1.277 compatibility documentation

### 설정 · CLAUDE.md 로딩

- CHANGELOG 원문: "Added AGENTS.md support: in a project with no CLAUDE.md, Claude Code reads AGENTS.md instead; change it under "Project instructions" in `/config` (not yet on Bedrock, Vertex or Foundry)"
  (277) 이 저장소는 루트에 `CLAUDE.md`가 있으므로 AGENTS.md 대체 로딩은 발동하지 않습니다 — 다만 저장소 루트의 `AGENTS.md`는 `.gitignore` 리터럴로 미추적 상태이므로(세션152 실측), 이 파일이 실수로 tracked화되어 CLAUDE.md와 내용이 갈리는 일이 없도록 유지합니다.

### 헤드리스(`-p`) · 백그라운드

- CHANGELOG 원문: "Fixed `claude -p` and Agent SDK sessions that could hang with no result after an internal error; they now report the error and exit with code 1"
  (277) `/fsd` 등 `-p` 기반 무인 루프에서 내부 오류로 인한 무응답 행이 사라지고 exit code 1로 종료되므로, 무인 루프 감시 스크립트는 이제 이 종료 코드를 정지 신호로 사용할 수 있습니다.
- CHANGELOG 원문: "Fixed a headless resume (`claude -p --resume`, the SDK, a VS Code extension window reload) starting the session's cost and usage totals at zero; headless sessions now save their totals at exit"
  (277) `-p --resume`으로 이어가는 헤드리스 세션의 비용·사용량 누적이 이제 정확히 보존되므로, 릴리즈 세션 비용 추정 시 재개 이전 구간이 0으로 초기화되던 오차가 사라집니다.
- CHANGELOG 원문: "Fixed background sessions (`claude --bg`) exiting when a plugin's LSP server exited or closed its stdin"
  (277) `--bg` 백그라운드 세션이 LSP 플러그인의 stdin 종료만으로 함께 종료되던 결함이 수정되어, 무인 백그라운드 실행의 뜻밖의 조기 종료 원인 후보 하나가 사라집니다.
- CHANGELOG 원문: "Improved session start-up for SDK and headless (`-p`) use: the first turn no longer waits on the per-directory CLAUDE.md lookup"
  (277) 이 저장소는 CLAUDE.md + 23개 룰을 매 세션 고정 주입하므로, 헤드리스 첫 턴의 디렉터리별 CLAUDE.md 조회 대기가 제거되면 `-p` 기반 파이프라인(`/pipeline auto-dev` 등)의 착수 지연이 줄어듭니다.
- CHANGELOG 원문: "Removed the background Haiku auto-title request from `claude -p` runs launched outside an SDK or IDE"
  (277) `-p` 단독 실행에서 백그라운드 자동 제목 요청이 제거되어, 순수 CLI 기반 무인 실행의 부가 API 호출이 줄어듭니다 — 이 저장소 R005 비용 인식 원칙과 정합합니다.

### 훅 · 재개 · prompt cache

- CHANGELOG 원문: "Fixed conversations failing every request with "text content blocks must be non-empty" when an earlier assistant turn held an empty text block beside other content, including after `--resume`"
  (277) 이 오류 문구는 R021이 v2.1.251 이후 text 블록 부재율 급증의 원인으로 추정한 CHANGELOG 항목과 같은 계열입니다 — 이 수정이 R008 advisory 진양성 원인(#1706 `[hypothesis]`)을 직접 해소하는지는 미확정이며, 다음 세션에서 v2.1.277+ 트랜스크립트로 재측정이 필요합니다.
- CHANGELOG 원문: "Fixed sessions continued after `/clear` (restart, `--continue`, `--resume`) missing part of their first message when a SessionStart hook printed output, causing a full prompt-cache miss"
  (277) 이 저장소는 `SessionStart` 훅(`claude-md-reinject.sh`)으로 매 세션 CLAUDE.md를 재주입하므로, v2.1.277 미만에서는 `/clear` 이후 재개 시 그 훅 출력이 prompt-cache를 전면 무효화했을 수 있습니다 — R021의 SessionStart 재주입 경로 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed resumed subagents and teammates re-rendering the MCP tool definitions they had loaded, which broke prompt caching for that agent"
  (277) 재개된 서브에이전트·teammate의 MCP 도구 정의 재렌더링으로 인한 prompt-cache 파손이 수정되어, R009 v2.1.265 계열의 prefix 안정성 노트가 한 건 더 보강됩니다.
- CHANGELOG 원문: "Fixed attachments recorded earlier in a conversation being re-rendered after a resume or relaunch, which dropped extended thinking and missed the prompt cache"
  (277) 재개·재실행 후 첨부물 재렌더링으로 extended thinking이 소실되고 캐시가 깨지던 결함이 수정되어, 재개 세션의 reasoning 보존 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed a crash ("unrecoverable interface error") when resuming a session whose saved transcript contains a stop hook summary without a well-formed hook list"
  (277) Stop 훅 요약이 불완전한 트랜스크립트를 재개할 때의 크래시가 수정되어, R021이 운용하는 `session-reflection.sh` Stop 훅 경로의 재개 안정성이 개선됩니다.
- CHANGELOG 원문: "Fixed messages typed while Claude is still working sometimes being ignored by the model"
  (277) 작업 중 입력한 메시지가 무시되던 결함이 수정되어, R020 Interrupt 관련 규칙이 전제하는 "인터럽트가 모델에 도달한다"는 가정의 신뢰성이 높아집니다.

### Bash · 샌드박스 · 권한

- CHANGELOG 원문: "Fixed `$TMPDIR` expanding empty in Bash commands that run outside the sandbox while sandboxing is enabled"
  (277) 샌드박스 활성 중 비샌드박스 Bash 명령에서 `$TMPDIR`가 빈 값으로 확장되던 결함이 수정되어, R010의 PPID 스코프 `/tmp` 마커 carve-out과 R009의 에이전트별 고유 `$TMPDIR` 경로 지침이 이제 더 안정적으로 동작합니다.
- CHANGELOG 원문: "Fixed a `sandbox.excludedCommands` glob exempting an entire compound Bash command from the sandbox when only one part matched; every part must now match"
  (277) 복합 Bash 명령의 일부만 매칭돼도 전체가 샌드박스에서 면제되던 결함이 수정되어, `sandbox.excludedCommands`를 쓰는 환경의 샌드박스 우회 폭이 좁아집니다.
- CHANGELOG 원문: "Fixed the Write tool silently ending the turn as a declined permission when the target path is an existing directory; it now reports a clear error"
  (277) 기존 디렉터리 경로에 Write를 시도할 때 무음으로 거부되던 결함이 수정되어, R020 "actual outcome ≠ attempt" 진단에서 원인 후보(무음 권한 거부 vs 명확한 오류)를 구분하기 쉬워집니다.
- CHANGELOG 원문: "Improved the dangerous-rm permission prompt to name the flagged rm command and suggest a `${VAR:?}` guard, so headless runs can recover"
  (277) 위험한 `rm` 프롬프트가 플래그된 명령과 가드 방법을 명시하게 되어, R001 파괴적 명령 승인 절차의 실효성이 헤드리스 실행에서도 개선됩니다.
- CHANGELOG 원문: "Improved prompt handling: invisible Unicode formatting and tag characters in a prompt are removed and the cleaned prompt is shown for review before it is sent"
  (277) 비가시 유니코드로 명령 일부를 숨기던 R001 v2.1.223 계열의 승인 다이얼로그 무결성 결함과 같은 위협 축을 프롬프트 입력 단계에서도 방어하게 됩니다.

### 서브에이전트 · SendMessage

- CHANGELOG 원문: "Fixed messages from other agents (such as a subagent's SendMessage) that arrived mid-turn showing up below the "Ran N shell commands" row instead of where they arrived"
  (277) 서브에이전트 SendMessage가 도착 위치가 아니라 엉뚱한 곳에 표시되던 결함이 수정되어, R018 SendMessage 신뢰성 계열 노트가 표시 정확성 측면에서 한 건 더 보강됩니다.
- CHANGELOG 원문: "Changed subagent results to reach the main agent under a header marking them as subagent output, with the result indented, so text in a subagent's result cannot pass as the session's own instructions"
  (277) 서브에이전트 결과가 이제 "서브에이전트 출력"임을 표시하는 헤더로 감싸져 도착하므로, R015 "다른 에이전트의 메시지는 결코 사용자의 승인이 아니다" 원칙이 플랫폼 레벨에서도 표시적으로 강화됩니다.

### 스킬 · 플러그인 · 도구

- CHANGELOG 원문: "Fixed project skills from the main repository not loading in `--worktree` sessions when `.claude/skills` is untracked"
  (277) 이 저장소는 `.claude/skills`가 tracked이므로 이 결함의 직접 대상은 아니지만, `isolation: "worktree"`로 스폰하는 에이전트가 untracked 스킬 디렉터리를 가진 다른 프로젝트에서는 이제 정상 로드됩니다.
- CHANGELOG 원문: "Fixed `claude plugin install` sometimes failing and breaking the installed copy when reinstalling a plugin version that a session or another program was using; an unchanged copy is now left alone"
  (277) 사용 중인 플러그인 버전을 재설치할 때 설치본이 깨지던 결함이 수정되어, 세션 도중 플러그인 재설치가 더 안전해집니다.
- CHANGELOG 원문: "Fixed Grep and Glob reporting no matches when the search could not start because the system was out of processes, memory or file handles; they now return an error saying so"
  (277) 자원 고갈로 탐색 자체가 시작되지 못했을 때 "매치 없음"으로 오보고되던 결함이 수정되어, R005 「도구 이름 ≠ 그 프로그램」이 경고하는 0건 결과 오독 위험이 이 원인 축에서는 줄어듭니다.
- CHANGELOG 원문: "Changed Fable to always appear in `/model` on the Anthropic API; it is greyed out only when your organization's settings disable it"
  (277) `/model`에서 Fable이 항상 노출되도록 바뀌어, R006 Fable 5 tier 안내(Tier 2 `claude-fable-5`/`claude-fable-5-1`)를 선택할 때 조직 정책으로 비활성화된 경우만 회색으로 구분됩니다.
- CHANGELOG 원문: "Removed the deprecated TaskOutput tool; Claude reads a background task's output file with Read instead, and the `taskOutputMaxChars` setting and `TASK_MAX_OUTPUT_LENGTH` no longer have any effect"
  (277) `TaskOutput` 도구 자체가 제거되고 `taskOutputMaxChars`/`TASK_MAX_OUTPUT_LENGTH` 설정이 무효화되므로, 이 두 항목을 언급하는 기존 룰 텍스트(R002 Tier 5 표, R013 인라인 출력 상한 노트)는 이제 사실과 어긋납니다 — 아래 「rule candidates」 참조.

기타 67건 — 이 저장소 비해당(VSCode/Claude Code on the web/Claude Tag 전용 UI 18건 포함, 나머지는 게이트웨이 전용 설정, 로그인/인증 UX, 저빈도 크래시 edge case, `/plugin`·`/mcp` 표시 버그 등).

**Action items**:
- R002 Tier 5 표와 R013 인라인 출력 상한 노트의 `TaskOutput`/`taskOutputMaxChars`/`TASK_MAX_OUTPUT_LENGTH` 참조를 v1.1.77에서 정정 완료(위 서술의 "R005"는 R013의 오기였습니다).
- 그 외 항목은 CC 플랫폼이 자체 해소한 신뢰성 개선이며, 이 저장소 harness 변경은 불필요합니다.

---

## v2.1.278 (2026-09-19)

> Issue: #1713 — Claude Code v2.1.278 compatibility documentation

### 자동 모드 · 비용

- CHANGELOG 원문: "Changed auto mode for Claude API and Enterprise users, and on Bedrock, Vertex, Foundry and gateways, to default to the server-side classifier, which does not charge for classifier overhead (`CLAUDE_CODE_AUTO_MODE_SERVER=0` opts out on Bedrock, Vertex, Foundry and gateways); warns on billed fallback. See https://code.claude.com/docs/en/auto-mode-classifier-billing"
  (278) auto mode classifier가 기본적으로 서버사이드로 전환되어 classifier 오버헤드가 과금되지 않으므로, 이 저장소가 상시 사용하는 auto mode 세션의 실질 비용이 낮아집니다 — R005 비용 인식 원칙에 유리한 방향의 변경입니다.
- CHANGELOG 원문: "Added an `Auto mode server` row to `/status` showing whether this session's auto mode classifier runs on the server"
  (278) `/status`에서 이 세션의 classifier가 서버에서 도는지 직접 확인할 수 있게 되어, 위 비용 절감이 실제로 적용됐는지를 실측(R020 ground-truth)할 수 있습니다.

**Action items**:
- 코드·룰 변경 불필요. `/status`의 `Auto mode server` 행으로 상태만 확인 가능합니다(docs-only).

---

## v2.1.280 (2026-09-22)

> Issue: #1716 — Claude Code v2.1.280 compatibility documentation

### 모델 · effort

- CHANGELOG 원문: "Added Claude Opus 5.5 (`claude-opus-5-5`), now the default Opus model — 1M context, $4/$20 per Mtok with $0.20/Mtok cache reads"
  (280) Opus 5.5가 기본 Opus 모델이 되었으므로, R006 Model Specification Tier 2 표에 `claude-opus-5-5` 전체 ID를 추가할지 검토가 필요합니다 — 아래 Action items 참조.
- CHANGELOG 원문: "Changed the default model on Pro and Team Standard plans from Sonnet to Opus, matching Max, Team Premium, and Enterprise"
  (280) Pro/Team Standard 플랜의 기본 모델이 Sonnet에서 Opus로 바뀌었으므로, 해당 플랜을 쓰는 세션은 R005 비용 인식 관점에서 기본값 자체가 더 비싸진 상태로 시작됩니다.
- CHANGELOG 원문: "Changed an effort level saved before `/effort` became per-model to no longer apply to newly released models such as Opus 5.5; they start at their default until you pick a level"
  (280) Opus 5.5처럼 새로 출시된 모델은 과거 저장된 effort 값을 물려받지 않고 기본 effort로 시작하므로, 이 저장소의 effort 관련 지침을 새 모델에 그대로 적용하기 전 실측이 필요합니다.
- CHANGELOG 원문: "Changed Opus 4.7, Opus 4.8 and Fable 5 to stop holding their launch-default effort over `/effort` in `-p` or the Agent SDK, a project, managed or `--settings` `effortLevel`, or a per-model level"
  (280) Opus 4.7·4.8·Fable 5는 `-p`나 Agent SDK에서 쓰는 `/effort`, 프로젝트·managed·`--settings` `effortLevel`, 모델별 레벨에 대해 launch-default effort를 더 이상 우선시하지 않게 되었습니다. R006이 v2.1.267 노트에서 기록한 것은 이 세 모델의 커스텀 커맨드·스킬·서브에이전트 `effort:` 프론트매터 무시 결함이 267에서 **수정됐다**는 사실이며, 280은 그 수정을 세션·설정 경로로 확장한 후속 변경입니다 — 아래 Action items 참조.

### MCP

- CHANGELOG 원문: "Added `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` to change the 2,048-character cap on MCP tool descriptions and server instructions for every MCP server in the session"
  (280) MCP 도구 설명·서버 안내문의 2,048자 상한을 세션 단위로 조정할 수 있게 되어, `ontology-rag`·`semble-integration`·`code-review-graph` 등 이 저장소가 연동하는 MCP 서버의 설명이 길어질 때 절단 위험을 env var로 완화할 수 있습니다.

### 권한 · 자동 모드

- CHANGELOG 원문: "Fixed writes through a symlinked path being judged by their in-tree spelling: the prompt names where the write lands, and `acceptEdits`, allow rules and auto mode no longer approve one landing outside"
  (280) 심볼릭 링크 경로를 통한 쓰기가 트리 내부 표기만으로 승인되던 우회가 수정되어, R002가 반복 기록해 온 "경로 표기 우회" 계열(예: v2.1.233 `\??\`, v2.1.268 symlink 디렉터리)의 최신 보강입니다.
- CHANGELOG 원문: "Fixed auto mode retrying an action over and over when a safety check declined to review it; the action is now denied once, noting that retrying won't help"
  (280) safety check가 검토를 거부한 행동을 auto mode가 무한 재시도하던 결함이 수정되어, R010 Subagent Scope-Creep STOP Protocol이 전제하는 "재시도가 아니라 범위 재설계"라는 원칙과 플랫폼 동작이 더 가까워집니다.
- CHANGELOG 원문: "Fixed auto mode denying actions over and over without pause when a safety check gave no answer; retries now back off, and the turn stops with a message after ten in a row"
  (280) safety check 무응답 시의 무한 거부 루프가 backoff + 10회 후 정지로 수정되어, 무인 루프가 이런 상황에서 조기에 눈에 띄는 정지 메시지로 멈추게 됩니다.
- CHANGELOG 원문: "Fixed Write calls failing validation when a model sends `path`, `file_text`, `file_content` or a stray `description` instead of `file_path` and `content`"
  (280) 잘못된 파라미터명으로 인한 Write 검증 실패가 완화되어, R020 도구 호출 완결성 관련 왕복 낭비가 이 원인 축에서는 줄어듭니다.
- CHANGELOG 원문: "Changed `PermissionRequest` hooks: an agent-type hook no longer runs there, since its answer could never allow or deny the request; it now shows an error pointing to command or http hooks"
  (280) `PermissionRequest` 훅에 agent-type 핸들러를 쓰면 이제 오류로 안내되므로, 이 이벤트에는 command 또는 http 핸들러만 유효하다는 제약이 명시화됩니다 — 이 저장소는 현재 `PermissionRequest`를 배선하지 않았습니다.

### 백그라운드 서브에이전트 · SendMessage · 압축

- CHANGELOG 원문: "Fixed resuming a session with unfinished background agents, shells or workflows starting a model turn on its own before you typed anything"
  (280) 미완료 백그라운드 작업이 있는 세션을 재개할 때 사용자 입력 없이 턴이 저절로 시작되던 결함이 수정되어, R010 v2.1.232 "non-teammate 스폰이 기본 background 실행"이 야기하는 재개 시 예상치 못한 자동 진행 위험이 줄어듭니다.
- CHANGELOG 원문: "Fixed messages sent to a background subagent being silently lost in headless and SDK sessions when the subagent was finishing its turn"
  (280) 서브에이전트가 턴을 마무리하는 시점에 헤드리스·SDK 세션에서 메시지가 무음 소실되던 결함이 수정되어, R018 SendMessage 신뢰성 계열("전달됨 ≠ 읽힘" 등)에 헤드리스 경로의 보강이 추가됩니다.
- CHANGELOG 원문: "Fixed a finished subagent's report being lost when the conversation that launched it was compacted before the report was read"
  (280) 완료된 서브에이전트 보고가 compact로 소실되던 결함이 수정되어, R013/R018이 함께 다루는 compaction-서브에이전트 보고 상호작용의 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed background subagents being unable to use the LSP tool when an LSP plugin is active"
  (280) LSP 플러그인 활성 시 백그라운드 서브에이전트가 LSP 도구를 쓰지 못하던 결함이 수정되어, 백그라운드로 이동한 서브에이전트의 도구 가용성 격차가 줄어듭니다.
- CHANGELOG 원문: "Fixed background shell tasks reporting benign non-zero exits (e.g. grep with no matches) as failures"
  (280) `grep` 무매치처럼 무해한 non-zero exit을 백그라운드 셸 작업이 실패로 오보고하던 결함이 수정되어, R020 "실행됨 ≠ 실패"류 오판 원인 하나가 background shell 경로에서 사라집니다.
- CHANGELOG 원문: "Fixed background sessions (`claude --bg`) being unable to run git, hooks, plugins and other helper programs when an environment variable handed to the session contained a NUL character"
  (280) NUL 문자가 든 환경변수로 인해 `--bg` 세션이 git·훅·플러그인을 실행하지 못하던 결함이 수정되어, 이 저장소처럼 훅에 의존하는 백그라운드 실행의 안정성이 개선됩니다.

### 스킬 · 메모리 · prompt cache

- CHANGELOG 원문: "Fixed skills in `~/.claude/skills/` being moved to `~/.claude/skills/.trash/` when a `manifest.json` in that folder listed their names"
  (280) 사용자 스코프 스킬이 `manifest.json` 이름 목록과 겹치면 `.trash/`로 이동해 버리던 결함이 수정되어, R017 Count Sync가 전제하는 스킬 파일의 존재 안정성이 보강됩니다 — 이 저장소 스킬은 프로젝트 스코프(tracked)라 직접 대상은 아니었으나, 사용자 스코프 스킬을 병행하는 세션에서는 데이터 손실 위험이 있었습니다.
- CHANGELOG 원문: "Fixed memory write conflicts in Cowork sessions showing Claude only the start and end of a memory file over about 10,800 characters, so the retried write dropped the middle"
  (280) Cowork 세션에서 10,800자 초과 메모리 파일의 중간 구간이 재시도 쓰기에서 소실되던 결함이 수정되어, R011의 200줄 예산 관리와 무관하게 존재하던 별도의 메모리 파일 무결성 위험이 줄어듭니다.
- CHANGELOG 원문: "Fixed a model switch made from a host app (Claude Desktop, VS Code, SDK) while Claude is working causing a prompt-cache miss on the next prompt"
  (280) 작업 중 모델 전환으로 인한 prompt-cache miss가 수정되어, R013/R009가 다루는 prompt-cache 안정성 계열에 호스트 앱발 모델 전환 축이 보강됩니다.
- CHANGELOG 원문: "Fixed resumed fork subagents rebuilding their tool list instead of re-sending the one they first used, which broke prompt caching for that agent"
  (280) fork된 서브에이전트를 재개할 때 도구 목록을 재구성해 prompt cache가 깨지던 결함이 수정되어, R009 fork 컨텍스트 상속 관련 비용 안정성이 개선됩니다.
- CHANGELOG 원문: "Improved `/cost` cache-miss causes to name thinking mode and thinking display changes"
  (280) `/cost`의 cache-miss 원인 표시에 thinking 모드·표시 변경이 추가되어, R012/R013이 다루는 prompt-cache 원인 후보 진단이 더 세밀해집니다.

### 훅 · 안정성

- CHANGELOG 원문: "Added hook output sizes and the number of oversized outputs saved to a file to the `hook_execution_complete` OpenTelemetry event"
  (280) 훅 출력 크기와 파일로 저장된 초과분 개수가 OpenTelemetry 이벤트에 추가되어, R021이 기록한 v2.1.247 훅 출력 폭주(대화 overflow) 계열 결함을 모니터링으로 조기 발견할 수 있게 됩니다.
- CHANGELOG 원문: "Improved the UserPromptSubmit hook timeout notice and the debug log to name which hook command timed out"
  (280) `UserPromptSubmit` 훅 타임아웃 알림이 어느 훅 명령이 타임아웃됐는지 명시하게 되어, 이 저장소가 이 이벤트에 배선한 `r007-r008-drift-advisor.sh`·`fail-axis-cause-advisor.sh`·`claude-md-reinject.sh` 등 다중 훅의 원인 진단이 쉬워집니다.
- CHANGELOG 원문: "Fixed conversations failing on every turn with a "role 'system' must precede an 'assistant' message" API error"
  (280) 이 API 오류로 전 턴이 실패하던 결함이 수정되어, 관련 세션 자체 종료 위험이 사라집니다.
- CHANGELOG 원문: "Fixed conversations with the advisor on failing every turn with API Error 400 "Input tag 'advisor_20260301'" behind a proxy or gateway that doesn't support it; the request now retries without it"
  (280) advisor 미지원 프록시·게이트웨이 경유 시의 400 오류가 이제 advisor 없이 재시도되어, R005가 기록한 v2.1.276의 같은 오류 문구(2.1.275 회귀)와는 별개 시나리오가 추가로 해소됩니다.
- CHANGELOG 원문: "Fixed a crash when resuming a session whose saved transcript holds a malformed system message or a memory-saved notice without its file list"
  (280) 메모리 저장 알림에 파일 목록이 없어 재개 시 크래시하던 결함이 수정되어, R011 세션 종료 메모리 저장 경로의 재개 안정성이 개선됩니다.
- CHANGELOG 원문: "Fixed `/config` crashing and some on/off preferences being misread when a preference that has moved to `settings.json` still holds a value like `null` or `"false"` in `~/.claude.json`"
  (280) `settings.json`으로 이관된 설정이 `~/.claude.json`에 `null`/`"false"`로 남아 있을 때의 오독·크래시가 수정되어, R002/R010이 의존하는 설정 계층(user/project/local) 판독 신뢰성이 개선됩니다.

기타 91건 — 이 저장소 비해당(VSCode/Claude Code on the web/Claude Tag/Code Review 전용 29건, Windows·self-hosted runner 전용 4건 포함, 나머지는 UI 다이얼로그·마우스·키바인딩 폴리시, Artifact 도구 세부사항, 마켓플레이스 커밋 추적 등 저빈도 항목).

**Action items**:
- R006 Model Specification Tier 2 표에 `claude-opus-5-5` 행을 v1.1.77에서 추가 완료. R006의 v2.1.267 DETAIL 노트(Opus 4.7·4.8·Fable 5의 `effort:` 프론트매터 무시 결함이 267에서 수정됐다는 기록)에는 #1720에서 v2.1.280의 후속 변경("Changed Opus 4.7, Opus 4.8 and Fable 5 to stop holding their launch-default effort over `/effort` in `-p` or the Agent SDK, a project, managed or `--settings` `effortLevel`, or a per-model level")을 반영한 후속 노트를 추가했습니다.
- 그 외 항목은 CC 플랫폼 신뢰성 개선이며 이 저장소 harness 변경은 불필요합니다.

---

## v2.1.281 (2026-09-23)

> Issue: #1731 — Claude Code v2.1.281 compatibility documentation
> Scope-ceiling check (R017): 설치 CC는 **2.1.282**(`claude --version`=2.1.282, `npm view @anthropic-ai/claude-code version`=2.1.282 실측)입니다. 2.1.282 CHANGELOG를 확인한 결과 2.1.281 항목을 되돌린 사례는 없습니다 — 아래 "재개된 세션 재전송" 항목(3번)은 2.1.282에서 "Fixed more cases of continued or resumed sessions (`--continue`, `--resume`) re-sending earlier messages in a changed form, which could make the API drop Claude's earlier reasoning"로 사례가 확장될 뿐, 되돌리기가 아니라 같은 방향의 보강입니다.

### 설정 · 세션 위임

- CHANGELOG 원문: "Added `"attribution": false` in `settings.json` to hide all commit and PR attribution; older CLI versions skip a settings file that holds it, so keep the object form in files shared across versions"
  (281) 이 저장소는 attribution을 CC 설정이 아니라 system-reminder 기반 `Co-Authored-By`/`Generated with` 문구로 관리하므로, `settings.json`에 이 키를 추가할 계획이 없다면 harness 변경은 불필요합니다 — 향후 추가할 경우 구버전 CLI와 공유하는 설정 파일에서는 object 형태를 유지해야 합니다.
- CHANGELOG 원문: "Fixed `--setting-sources` (and SDK `settingSources`) not being forwarded to spawned sessions: teammates, `/bg`, `claude agents` sessions and `--worktree --tmux` now start with the parent's restriction"
  (281) `--setting-sources`로 제한한 설정 범위가 teammate·`/bg`·`claude agents`·`--worktree --tmux`로 스폰된 세션에 전달되지 않던 결함이 수정되어, 부모 세션의 설정 제한이 이제 하위 세션까지 상속됩니다 — 이 저장소는 `--setting-sources`를 명시적으로 쓰지 않으므로 직접 영향은 없습니다.

### 재개(resume) · prompt cache

- CHANGELOG 원문: "Fixed resumed sessions re-sending earlier turns in a changed form (a parallel tool-call turn, an MCP tool call's input or a tool-search result while its server was still reconnecting, or a tool-search result whose loading turn was interrupted), which could make the API drop the conversation's prior reasoning"
  (281) 재개된 세션이 병렬 tool-call 턴·재연결 중이던 MCP 도구 입력·로딩이 끊긴 tool-search 결과를 바뀐 형태로 재전송해 API가 이전 reasoning을 버리던 결함이 수정되었습니다 — 위 스코프 상한 확인대로 2.1.282에서 사례가 추가로 확장됩니다.
- CHANGELOG 원문: "Fixed resuming a very large session sometimes restoring only its last few messages"
  (281) 매우 큰 세션을 재개할 때 마지막 몇 메시지만 복원되던 결함이 수정되어, `/fsd` 등 장기 세션을 압축 후 재개하는 흐름의 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed a session resumed after a restart during a pending permission prompt sending a different history than before, which broke the prompt cache from that point"
  (281) 대기 중인 권한 프롬프트 도중 재시작 후 재개된 세션이 이전과 다른 히스토리를 보내 그 지점부터 prompt cache가 깨지던 결함이 수정되어, R012 statusline `prompt_cache` 필드가 보고하는 cache-miss 원인 후보 중 하나가 줄어듭니다.
- CHANGELOG 원문: "Fixed resuming a session that ended during a tool call: Claude now sees the call and is told its outcome is unknown, and a manual resume no longer adds a hidden "Continue" message"
  (281) 도구 호출 도중 종료된 세션을 재개하면 이제 Claude가 그 호출을 인지하고 결과를 "알 수 없음"으로 안내받으며, 수동 재개 시 숨은 "Continue" 메시지도 더 이상 추가되지 않습니다 — R020 "Failure/Interrupt Report ≠ Actual Failure" 표가 다루는 중단 처리 계열과 같은 방향의 보강입니다.
- CHANGELOG 원문: "Fixed sessions with an earlier advisor result the API could no longer read failing one request every turn and repeatedly losing earlier reasoning; the history is now repaired once"
  (281) 이전 advisor 결과를 API가 더 이상 읽지 못해 매 턴 요청이 실패하고 이전 reasoning을 반복 소실하던 결함이 수정되어(히스토리를 1회 복구), R005가 기록한 advisor 미지원 프록시 계열 오류와는 별개로 advisor 자체의 히스토리 손상 축이 줄어듭니다.
- CHANGELOG 원문: "Fixed the prompt cache being lost when an MCP server disconnects mid-conversation, or is still connecting after a resume, while tool search is off (for example behind a proxy or gateway)"
  (281) MCP 서버가 대화 도중 연결이 끊기거나 재개 후에도 계속 연결 중일 때(tool search가 꺼진 상태) prompt cache가 소실되던 결함이 수정되어, R019 ontology-RAG/wiki-RAG처럼 이 저장소가 세션 중 MCP 서버에 의존하는 경로의 비용 안정성이 개선됩니다.
- CHANGELOG 원문: "Improved auto mode after resuming a session in a new process: the permission classifier can now reuse its earlier prompt cache instead of rewriting it"
  (281) 새 프로세스에서 세션을 재개한 뒤 auto mode 권한 classifier가 이전 prompt cache를 재사용할 수 있게 되어, `defaultMode` 무시 결함(v2.1.257, R010/R002 기록)과 별개로 재개 직후 auto mode 판정 비용이 줄어듭니다.

### 권한 · rm 프롬프트 · sandbox

- CHANGELOG 원문: "Fixed a turn that could retry indefinitely, ignoring `--max-turns`, when the model alternated unparseable tool calls and output-limit truncation"
  (281) 모델이 파싱 불가능한 도구 호출과 출력 상한 절단을 번갈아 낼 때 `--max-turns`를 무시하고 무한 재시도하던 결함이 수정되어, R020 "maxTurns 절단 실증" 항목이 전제하는 턴 상한 자체의 신뢰성이 개선됩니다 — 이 결함은 "무시하고 계속 도는" 역방향 사례이므로, R020이 주로 다루는 "조기 절단" 문제와는 반대 축입니다.
- CHANGELOG 원문: "Fixed a recursive `rm` whose target is only command-substitution output, such as `rm -rf "$(pwd)"`, running unprompted in auto and `--dangerously-skip-permissions` mode; it now asks even with a Bash allow rule, unless run with `CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT=1`"
  (281) `rm -rf "$(pwd)"`처럼 대상이 command-substitution 출력뿐인 재귀 `rm`이 auto·`--dangerously-skip-permissions` 모드에서 무프롬프트로 실행되던 결함이 수정되어, Bash allow rule이 있어도 이제 확인을 묻습니다(`CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT=1`로 끌 수 있음) — R001 Destructive Git Commands 표가 다루는 파괴적 명령 계열과 같은 방향의 플랫폼 보강입니다.
- CHANGELOG 원문: "Improved the dangerous-rm check to also flag a removal at a shell variable followed by a top-level directory name, at a variable derived from the working directory, or at a backslash-only target"
  (281) 작업 디렉터리에서 파생된 변수나 최상위 디렉터리명이 뒤따르는 셸 변수, backslash-only 대상까지 dangerous-rm 검사가 넓어져, 위 항목과 함께 R001이 명시하지 않는 rm 패턴의 플랫폼 측 탐지 범위가 확장됩니다.
- CHANGELOG 원문: "Changed the dangerous `rm` prompt in `--dangerously-skip-permissions` and auto mode to wait 2 minutes for an answer, then deny the command with a rewrite hint so unattended sessions keep going (`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1` turns this off)"
  (281) `--dangerously-skip-permissions`·auto mode의 dangerous rm 프롬프트가 응답을 2분 대기한 뒤 거부(재작성 힌트 포함)하도록 바뀌어, 무인 세션이 응답 없는 rm 프롬프트에 영구히 멈추지 않고 진행합니다(`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1`로 끌 수 있음) — `/fsd` 같은 무인 루프에서 rm이 필요한 작업이 있다면 2분 뒤 자동 거부됨을 전제해야 합니다.
- CHANGELOG 원문: "Fixed sandboxed Bash commands being unable to write to `$TMPDIR` when `CLAUDE_CODE_TMPDIR` is set"
  (281) `CLAUDE_CODE_TMPDIR`가 설정된 상태에서 샌드박스된 Bash 명령이 `$TMPDIR`에 쓰지 못하던 결함이 수정되어, R005가 기록한 샌드박스 도구 공백·`$TMPDIR` 안내와 함께 이 저장소의 스크래치패드 작업 경로 안정성이 개선됩니다.

### 훅 · MCP 연결 타이밍 · plugin validate

- CHANGELOG 원문: "Fixed `mcp_tool` hooks on blocking events (PreToolUse and similar) being skipped while their MCP server was still connecting; they now wait for it, up to the MCP connect timeout"
  (281) `mcp_tool` 훅이 blocking 이벤트(PreToolUse 등)에서 MCP 서버가 아직 연결 중일 때 건너뛰던 결함이 수정되어 이제 MCP connect timeout까지 대기합니다 — 이 저장소는 현재 `mcp_tool` 타입 훅을 배선하지 않았으나, R006 Hook Event Types가 다루는 4개 핸들러 타입 중 하나의 신뢰성 보강입니다.
- CHANGELOG 원문: "Added MCP server checks to `claude plugin validate`: it reports `.mcp.json` entries that would be silently dropped at load, undeclared `${user_config.*}` references, and insecure URLs"
  (281) `claude plugin validate`에 `.mcp.json` 항목이 로드 시 조용히 누락되는 경우, 미선언 `${user_config.*}` 참조, 불안전한 URL을 보고하는 MCP 검사가 추가되어, R017 "스킬 추가·수정 후 `claude plugin validate`를 개수 대조와 함께 실행" 조항의 검증 범위가 넓어집니다.
- CHANGELOG 원문: "Fixed `claude plugin validate` reporting `privacyPolicyUrl`, `supportUrl` and other listing metadata keys in plugin.json as unknown fields"
  (281) `claude plugin validate`가 plugin.json의 `privacyPolicyUrl`·`supportUrl` 등 리스팅 메타데이터 키를 unknown field로 오보고하던 결함이 수정되어, 위 R017 조항 실행 시의 오탐 1종이 줄어듭니다.
- CHANGELOG 원문: "Improved plugin hook-failure errors to name the offending plugin, and added a `claude plugin validate` warning when a shell-form hook leaves `${CLAUDE_PLUGIN_ROOT}` unquoted (it breaks on plugin paths with spaces)"
  (281) 플러그인 훅 실패 오류에 해당 플러그인 이름이 명시되고, shell-form 훅이 `${CLAUDE_PLUGIN_ROOT}`를 따옴표 없이 쓰면(경로에 공백이 있을 때 깨짐) `claude plugin validate` 경고가 추가되어, R023 Workflow Script Sanity Check가 다루는 "셸 변수 이스케이프" 계열 점검이 plugin validate 단계에서도 보강됩니다.

### /loop · 예약 작업

- CHANGELOG 원문: "Fixed scheduled tasks and `/loop` wakeups being fired again every second when their delivery failed, which could make Claude Code exit at the end of a turn"
  (281) 전달에 실패한 예약 작업·`/loop` 웨이크업이 매초 재발화되어 턴 종료 시 Claude Code가 종료될 수 있던 결함이 수정되어, 이 저장소가 무인 루프(`/fsd` 등)에서 겪을 수 있던 조용한 조기 종료 원인 하나가 줄어듭니다.

기타 157건 — 이 저장소 비해당 (VSCode·Claude Code on the web·Claude Tag·Code Review 전용 26건(VSCode 6, web 6, Claude Tag 13, Code Review 1), Windows 전용 2건 포함, 나머지 129건은 UI 다이얼로그·키바인딩·마우스·vim 모드·Claude apps gateway/Bedrock/Vertex 세부사항 등).

**Action items**:
- 19건 모두 CC 플랫폼 신뢰성·안전장치 보강이며 즉각적인 harness 변경(룰 수정)은 불필요합니다.
- 위 dangerous rm 2분 타임아웃(권한 · rm 프롬프트 · sandbox 3번째 항목)은 `/fsd` 등 무인 루프가 rm을 직접 실행하지 않는 한(R010 Sensitive Path Handling상 `.claude/**` 조작은 rm이 아닌 Write/Edit) 이 저장소에는 즉시 영향이 없으나, 향후 무인 루프에 rm이 포함될 경우 이 타임아웃을 전제로 설계해야 합니다.
- 2.1.282 CHANGELOG의 harness 관련 항목(예: 2.1.281 "재전송 changed form" resume 결함의 추가 사례 수정)은 별도 이슈에서 2.1.282 섹션으로 다룹니다.

---

## v2.1.282 (2026-09-24)

> Issue: #1746 — Claude Code v2.1.282 compatibility documentation
> Scope-ceiling check (R017): 설치 CC는 **2.1.283**(`claude --version`=2.1.283, `npm view @anthropic-ai/claude-code version`=2.1.283 실측)이며 2.1.283이 상한입니다. 2.1.283 CHANGELOG를 확인한 결과 아래 "namespace 예약" 항목은 `claude-ai` 이름 부분만 되돌려졌습니다 — "Reverted the 2.1.282 reservation of the `claude-ai` name: skills, commands, workflows and MCP servers' skills and prompts so named load again, and `Skill(claude-ai:*)` rules are ordinary prefix rules". `anthropic-skills` 이름 예약은 되돌려지지 않았으므로 아래 항목은 그 범위만 유효합니다.

### 텔레메트리 · settings

- CHANGELOG 원문: "Changed project and local settings to ignore OpenTelemetry variables that turn on export, set its endpoint, or capture content, like `CLAUDE_CODE_ENABLE_TELEMETRY` and `OTEL_LOG_*`"
  (282) 프로젝트·로컬 설정 파일에 적힌 OpenTelemetry 관련 변수를 이제 CC가 무시합니다 — CHANGELOG는 export 활성화·엔드포인트 지정·콘텐츠 캡처라는 세 클래스를 `CLAUDE_CODE_ENABLE_TELEMETRY`·`OTEL_LOG_*` 예시로만 들었을 뿐 전체 목록을 열거하지 않았으므로, 같은 클래스에 속하는 한 `OTEL_METRICS_EXPORTER`·`OTEL_LOGS_EXPORTER`처럼 예시에 없는 변수도 마찬가지로 무시되며, 어차피 마스터 토글(`CLAUDE_CODE_ENABLE_TELEMETRY`)이 무시되므로 export 계열 변수는 값을 설정해도 무력화됩니다 — `.claude/skills/monitoring-setup/SKILL.md`가 이 값들을 `.claude/settings.local.json`에 기록하도록 안내하는 절이 이 변경의 직접 영향 범위이며, 별도 서브에이전트가 해당 스킬 자체를 수정 중입니다.
- CHANGELOG 원문: "Added a startup notice, and `/status` and `claude doctor` entries, listing telemetry variables in a project's settings files that were ignored or that turned telemetry off"
  (282) 프로젝트 설정 파일에 적혔으나 무시되거나 텔레메트리를 끈 변수들이 시작 알림·`/status`·`claude doctor`에 나열되어, 위 항목의 무시 여부를 세션 시작 시 바로 확인할 수 있습니다.

### skill/plugin namespace 예약

- CHANGELOG 원문: "Changed `Skill(anthropic-skills:*)` and `Skill(claude-ai:*)` allow rules to cover only skills synced from claude.ai, not plugins or other skills that merely use such a name"
  (282) `Skill(anthropic-skills:*)`·`Skill(claude-ai:*)` allow rule이 claude.ai에서 동기화된 스킬만 가리키도록 좁혀져, 같은 이름을 쓰는 플러그인·다른 스킬은 더 이상 이 allow rule로 커버되지 않습니다 — 이 저장소 스킬 frontmatter `name:` 값은 `anthropic-skills`·`claude-ai`와 겹치지 않습니다(실측: `git grep -h '^name:' .claude/skills/*/SKILL.md | grep -cE 'anthropic-skills|claude-ai'` = 0), `.mcp.json`의 서버명도 `eraser`·`ontology-rag`뿐이라(`jq -r '.mcpServers|keys[]' .mcp.json`) 이름 충돌 대상이 아닙니다.
- CHANGELOG 원문: "Changed skill folders, command files and workflow commands in the `anthropic-skills` or `claude-ai` namespace to no longer load; a plugin so named still loads but yields name ties to synced skills"
  (282) `anthropic-skills`·`claude-ai` namespace의 스킬 폴더·명령 파일·workflow 명령이 더 이상 로드되지 않도록 바뀌었습니다(같은 이름의 플러그인 자체는 계속 로드되나 이름 충돌 시 동기화된 스킬에 양보) — 위에서 확인한 대로 이 저장소 스킬은 해당 namespace를 쓰지 않아 영향이 없습니다.
- CHANGELOG 원문: "Changed MCP servers configured under the name `anthropic-skills` or `claude-ai` to list no skills or prompts (their tools still work); rename the server in your MCP configuration to list them again"
  (282) `anthropic-skills`·`claude-ai` 이름으로 설정된 MCP 서버는 스킬·프롬프트 목록을 더 이상 제공하지 않습니다(도구 자체는 계속 동작) — 이 저장소가 쓰는 `ontology-rag` 등 MCP 서버 이름은 이 두 이름과 겹치지 않으므로 직접 영향은 없습니다.

### 권한 · 압축 · thinking 복구

- CHANGELOG 원문: "Fixed Bash permission rules with a mid-pattern `:*` being skipped in settings files while `--allowedTools` honored them; they now work from every source, with a startup warning on how they match"
  (282) settings 파일에서 중간에 `:*`가 들어간 Bash permission rule이 건너뛰어지던 결함이 수정되어 이제 모든 출처에서 동일하게 매칭되고, 매칭 방식에 대한 시작 경고도 추가됩니다 — R002 Deny Rule Glob Patterns 표가 다루는 glob 매칭 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed compaction failing when the summarization request is refused; it now retries on a fallback model"
  (282) 요약 요청이 거부되어 compaction이 실패하던 결함이 수정되어 이제 폴백 모델로 재시도합니다 — R013 Context Budget Management가 전제하는 compaction 신뢰성이 개선됩니다.
- CHANGELOG 원문: "Fixed sessions failing on every turn with an \"Invalid `data` in `redacted_thinking` block\" API error; Claude Code now drops the conversation's thinking blocks and retries once"
  (282) "Invalid `data` in `redacted_thinking` block" API 오류로 매 턴 실패하던 세션이, 대화의 thinking 블록을 삭제하고 1회 재시도하도록 수정되어 복구됩니다 — R004 Recovery 표의 "Retryable" 축과 같은 방향의 플랫폼 보강입니다.

### 재개(resume) — 281 항목의 확장

- CHANGELOG 원문: "Fixed more cases of continued or resumed sessions (`--continue`, `--resume`) re-sending earlier messages in a changed form, which could make the API drop Claude's earlier reasoning"
  (282) 위 v2.1.281 섹션의 Scope-ceiling check가 예고한 대로, 재개된 세션이 이전 메시지를 바뀐 형태로 재전송해 API가 이전 reasoning을 버리는 사례가 추가로 수정되었습니다 — 되돌리기가 아니라 281의 같은 결함 계열이 넓어진 것입니다.

기타 77건 — 이 저장소 비해당(VSCode 4건, Cloud sessions 5건, Claude Tag 11건 포함, 나머지 57건은 UI 다이얼로그·vim 모드·PDF 렌더링·artifact 게시 등 harness 비영향 세부사항). 실측: `gh issue view 1746 --json body --jq .body | sed -n '/What.s changed/,/액션 아이템/p' | grep -c '^- '` = 86건 중 위 본문 9건(텔레메트리 2·namespace 3·권한·압축·thinking 복구 3·재개 확장 1)을 다뤘으므로 86 − 9 = 77건입니다.

**Action items**:
- 위 텔레메트리 변수 무시 항목은 `.claude/skills/monitoring-setup/SKILL.md`의 `.claude/settings.local.json` 기록 절 갱신이 필요하며, 별도 서브에이전트가 처리합니다.
- namespace 예약 항목은 이 저장소의 `omcustom` namespace와 충돌하지 않아 즉각적인 harness 변경은 불필요합니다.
- 나머지 항목은 CC 플랫폼 신뢰성 보강이며 룰 수정은 불필요합니다.

---

## v2.1.283 (2026-09-25)

> Issue: #1747 — Claude Code v2.1.283 compatibility documentation
> Scope-ceiling check (R017): 설치 CC·npm latest 모두 **2.1.283**(`claude --version`=2.1.283, `npm view @anthropic-ai/claude-code version`=2.1.283 실측)로 이 릴리즈가 상한이며, 2.1.283보다 나중 릴리즈는 없습니다.

### namespace 예약 되돌림

- CHANGELOG 원문: "Reverted the 2.1.282 reservation of the `claude-ai` name: skills, commands, workflows and MCP servers' skills and prompts so named load again, and `Skill(claude-ai:*)` rules are ordinary prefix rules"
  (283) 위 v2.1.282 섹션의 `claude-ai` namespace 예약이 되돌려져, 그 이름의 스킬·명령·workflow·MCP 서버 스킬/프롬프트가 다시 로드되고 `Skill(claude-ai:*)` rule도 평범한 prefix rule로 돌아갑니다 — `anthropic-skills` 이름 예약은 이 되돌림 대상이 아니므로 위 2.1.282 섹션 해당 항목은 `anthropic-skills` 범위에서만 유효합니다.

### 지시 파일 감사 · plugin validate

- CHANGELOG 원문: "Added `/doctor prompt-audit` (also `/checkup prompt-audit`) to audit your CLAUDE.md files, skills, agents and commands for prompting patterns written for older models"
  (283) CLAUDE.md·스킬·에이전트·명령의 프롬프팅 패턴을 감사하는 `/doctor prompt-audit`(`/checkup prompt-audit`)이 추가되어, R016 예산 게이트(`validate-docs`)가 다루는 지시 파일 크기·구식 패턴 점검을 CC 자체 도구로도 보완할 수 있습니다.
  (283) 이어서 "Improved `prompt-audit` on Claude Code configuration: stale paths, stale commands and contradicting instruction files now lead the report, and thinking keywords that Claude Code documents are kept"에 따르면 구식 경로·구식 명령·상충하는 지시 파일이 보고서 상단에 오르도록 개선되어, R023 Deprecated-Platform-Feature Staleness Check가 겨냥하는 폐기된 플랫폼 기능 참조 탐지와 목적이 겹칩니다.
- CHANGELOG 원문: "Fixed `claude plugin validate` saying Claude Code accepts a plugin or marketplace name it cannot install; such names in `marketplace.json` now fail validation"
  (283) `claude plugin validate`가 실제로 설치할 수 없는 플러그인·마켓플레이스 이름을 수용 가능하다고 오보고하던 결함이 수정되어, 그런 이름은 이제 `marketplace.json`에서 검증 실패로 잡힙니다.
- CHANGELOG 원문: "Fixed `claude plugin validate` passing plugins whose `outputStyles`, `themes`, `monitors`, or `lspServers` paths are missing or point outside the plugin directory"
  (283) `outputStyles`·`themes`·`monitors`·`lspServers` 경로가 누락되거나 플러그인 디렉터리 밖을 가리켜도 통과하던 `claude plugin validate` 결함이 수정되어, R017 "스킬 추가·수정 후 `claude plugin validate`를 개수 대조와 함께 실행" 조항이 잡아내는 결함 범위가 넓어집니다.

### auto-memory · 권한 모드

- CHANGELOG 원문: "Fixed Claude's edits to its own auto-memory notes being blocked as sensitive-file writes when Claude Code was started in a subdirectory of a git repository"
  (283) git 저장소의 하위 디렉터리에서 시작된 세션이 자신의 auto-memory 노트를 편집할 때 sensitive-file write로 차단되던 결함이 수정되었습니다 — R011 Subagent memory:project Source-Tree Pollution Guard와는 "하위 디렉터리 실행"이라는 트리거 조건만 같을 뿐 실패 양상은 다릅니다: R011 가드는 `memory: project` 서브에이전트가 소스 트리 하위에 `.claude/agent-memory/`를 잘못 생성하는 것을 경고하는 반면, 이번 283 수정은 CC 자신의 auto-memory 편집이 sensitive-file write로 오탐 차단되던 것을 고친 것입니다 — 가드 자체(중첩 생성 방지 확인)는 계속 필요합니다.
- CHANGELOG 원문: "Changed interactive sessions on third-party providers or with telemetry off to start in auto mode when no permission mode is configured; `permissions.defaultMode` still overrides it"
  (283) 서드파티 provider를 쓰거나 텔레메트리를 끈 상태에서 permission mode가 설정되지 않은 대화형 세션이 이제 auto mode로 시작합니다(`permissions.defaultMode`가 설정돼 있으면 계속 그 값이 우선) — R010 Self-Check가 요구하는 유효 permission mode 실측(`jq -r '.permissions.defaultMode // "unset"'`)이 이 조건에서는 auto mode로 귀결됨을 새로 고려해야 합니다.

### /context · 워크플로 폴백

- CHANGELOG 원문: "Fixed `/context` not counting MCP server instructions: they now appear as their own row and count toward the total"
  (283) `/context`가 MCP 서버 instructions를 집계하지 않던 결함이 수정되어 이제 별도 행으로 표시되고 총량에도 반영됩니다 — R013 Context Budget Management의 백분율 임계값 계산에 MCP 서버 instructions 몫이 추가로 포함됩니다.
- CHANGELOG 원문: "Fixed dynamic workflows started during a model fallback running every agent on the fallback model instead of retrying the configured model"
  (283) 모델 폴백 도중 시작된 dynamic workflow가 모든 에이전트를 폴백 모델로 실행하던 결함이 수정되어 이제 원래 설정된 모델로 재시도합니다 — R006 Fallback Models 절이 다루는 설정-레벨 failover가 workflow 실행 중에도 원래 모델 지향으로 동작합니다.

기타 85건 — 이 저장소 비해당(VSCode 7건, Cloud sessions 3건, Claude Tag 7건, Code Review 2건 포함, 나머지 66건은 vim 모드·키바인딩·UI 리스트·Bedrock/Vertex·self-hosted runner git 세부사항 등 harness 비영향). 실측: `gh issue view 1747 --json body --jq .body | sed -n '/What.s changed/,/액션 아이템/p' | grep -c '^- '` = 94건 중 위 본문 9건(namespace 되돌림 1·지시 파일 감사/plugin validate 4·auto-memory·권한 모드 2·`/context`·워크플로 폴백 2)을 다뤘으므로 94 − 9 = 85건입니다.

**Action items**:
- `claude-ai` namespace 되돌림은 이 저장소의 `omcustom` namespace와 무관해 즉각적인 harness 변경은 불필요합니다.
- `/doctor prompt-audit`·`claude plugin validate` 강화 항목은 R016 예산 게이트·R017 plugin validate 실행 시 참고할 보조 도구로 기록해 두었으며 룰 수정은 불필요합니다.
- auto-memory 차단 결함 수정, auto mode 시작 조건 변경, `/context` MCP 집계, workflow 폴백 수정은 모두 기존 룰이 이미 다루는 전제를 강화하는 방향이며 룰 문안 변경은 불필요합니다.

---

## v2.1.284 (2026-09-28)

> Issue: #1755 — Claude Code v2.1.284 compatibility documentation
> Scope-ceiling check (R017): 설치 CC·npm latest 모두 **2.1.284**(`claude --version`=2.1.284, `npm view @anthropic-ai/claude-code version`=2.1.284 실측)로 이 릴리즈가 상한이며, 릴리즈 게시 시각은 2026-09-28T18:02:03Z(`gh release view v2.1.284 -R anthropics/claude-code --json publishedAt` 실측)입니다. 2.1.284보다 나중 릴리즈는 없습니다.

### Sonnet 5.5 · 모델 핀 이전

- CHANGELOG 원문: "Added Claude Sonnet 5.5 (`claude-sonnet-5-5`), now the default Sonnet model on the Anthropic API — 1M context, $2/$10 per Mtok with $0.20/Mtok cache reads"
  (284) Sonnet 5.5(`claude-sonnet-5-5`)가 추가되어 Anthropic API의 기본 Sonnet 모델이 되었습니다. #1755의 범위 결정에 따라 이 저장소는 v1.1.89에서 에이전트 모델 핀 전체를 `claude-sonnet-5-5`/`claude-opus-5-5`로 이전했으며, R006 Model Specification Tier 2 표에 `claude-sonnet-5-5` 행이 추가되었습니다. Tier 1 alias(`sonnet`)는 계속 CC가 해석하므로 프로젝트가 고정할 수 없다는 R006의 설명은 그대로입니다.

### 권한 · 시작 모드

- CHANGELOG 원문: "Added a "Yes, but ask again next time" answer to auto mode's prompt before a read outside the working directories, so you can allow that one read and still be asked about later ones"
  (284) 작업 디렉터리 밖 읽기를 묻는 auto mode 프롬프트에 "Yes, but ask again next time" 응답이 추가되어, 해당 읽기 한 건만 허용하고 이후 읽기는 계속 확인받을 수 있습니다. 이는 사용자 대화형 프롬프트의 응답 선택지이며 R010 Self-Check가 실측하는 유효 permission mode 판정과 R002 도구 티어 정책을 바꾸지 않습니다.
- CHANGELOG 원문: "Changed interactive terminal and VS Code sessions to start in auto mode when no permission mode is configured, on every plan and provider; `permissions.defaultMode` still overrides it"
  (284) permission mode가 설정되지 않은 대화형 터미널·VS Code 세션은 모든 플랜과 provider에서 auto mode로 시작합니다(`permissions.defaultMode`가 설정돼 있으면 계속 그 값이 우선). 위 v2.1.283 섹션의 "서드파티 provider 또는 텔레메트리 off" 조건이 모든 플랜·provider로 넓어진 것입니다. 이 변경은 대화형 터미널·VS Code 세션에 대한 것이므로, R010 Self-Check의 `jq -r '.permissions.defaultMode // "unset"'`(R010은 이를 user·project·local 세 범위에 적용, 무인 실행 전 점검)가 "unset"을 내더라도 무인(`-p`/headless) 실행의 모드를 이 변경으로 판단해서는 안 됩니다. 무인 실행은 이 변경의 대상이 아닙니다.

### 상태줄 · 재시도 · 컨텍스트

- CHANGELOG 원문: "Added dollar amounts to the Claude apps gateway spend limit in `/usage` and the status line (for example "$271.40 / $500.00 spent this month") when the gateway runs this version or later; the status line's `rate_limits.spend_limit` also gains `used_usd`, `limit_usd` and `period`"
  (284) 상태줄의 `rate_limits.spend_limit`에 `used_usd`, `limit_usd`, `period` 필드가 추가되었습니다(gateway가 이 버전 이상일 때). R012 Statusline API 포맷은 이 필드를 요구하지 않으므로 `.claude/statusline.sh` 확장은 선택 사항입니다.
- CHANGELOG 원문: "Fixed a damaged response stream showing raw errors such as "JSON Parse error" or "undefined is not an object", or writing the word "undefined" into an answer, instead of being retried or reported as an interrupted response"
  (284) 손상된 응답 스트림이 원시 오류("JSON Parse error" 등)나 답변 속 "undefined" 문자열로 노출되던 결함이 수정되어 재시도되거나 중단된 응답으로 보고됩니다. R004 Retryable 재시도 전략을 플랫폼이 이 경로에서도 수행하므로, 구버전 세션의 "undefined" 혼입은 모델 오류가 아니라 스트림 손상이었을 수 있습니다.
- CHANGELOG 원문: "Fixed an overloaded or server error arriving right after a thinking block ending the turn with an error instead of being retried"
  (284) thinking 블록 직후에 도착한 overloaded·서버 오류가 재시도되지 않고 턴을 오류로 끝내던 결함이 수정되었습니다. R004 v2.1.246/257 자동 이어감 노트와 같은 계열이며, 무인 루프 중단을 "재시도 로직 부재"로 오진하기 전에 확인할 경계가 하나 더 생겼습니다.
- CHANGELOG 원문: "Fixed "Prompt is too long" errors that persisted after compacting: when the compacted request is still too long, Claude Code now compacts once more, keeping less of the recent conversation"
  (284) compact 후에도 요청이 너무 길면 CC가 최근 대화를 덜 남기고 한 번 더 compact합니다. R013의 v2.1.269/274 "Prompt is too long" 수정 노트를 이어받는 항목이며, 재compact 이후에는 최근 대화 보존량이 줄어든다는 점을 컨텍스트 예산 판단에 반영해야 합니다.

### 규칙 · 훅 · 메시징

- CHANGELOG 원문: "Fixed rules symlinked into `.claude/rules` from outside the project being skipped without ever showing the external-imports approval prompt; a `.claude` directory symlinked from outside the project now asks for the same approval"
  (284) 프로젝트 밖에서 `.claude/rules`로 symlink된 룰이 승인 프롬프트 없이 건너뛰어지던 결함이 수정되었고, 프로젝트 밖에서 symlink된 `.claude` 디렉터리도 같은 승인을 요구합니다. 이 저장소의 룰은 프로젝트 내부 실파일이므로 영향이 없지만, 룰을 외부 경로에서 링크하는 사용자 환경에서는 승인 프롬프트가 새로 나타납니다.
- CHANGELOG 원문: "Fixed the debug log dropping a failed hook's stderr when the hook also wrote to stdout, and logging nothing for a failed hook with no output; failed hooks now also log their status code"
  (284) 실패한 훅의 stderr가 stdout과 함께 쓰였을 때 debug 로그에서 누락되던 결함과, 출력 없는 실패 훅이 아무것도 기록되지 않던 결함이 수정되었고 상태 코드도 기록됩니다. R021 훅 발화 진단(배선 확인 ≠ 발화 확인)에서 debug 로그를 근거로 삼을 때 신뢰도가 높아집니다.
- CHANGELOG 원문: "Fixed `{"decision":"block"}` returned by Elicitation and ElicitationResult hooks being ignored; it now declines the MCP elicitation, as exit code 2 does"
  (284) Elicitation·ElicitationResult 훅이 반환한 `{"decision":"block"}`이 무시되던 결함이 수정되어 exit code 2와 같이 MCP elicitation을 거부합니다. 이 저장소는 해당 훅을 배선하지 않으므로 R021 Enforcement Tiers 변경은 불필요합니다.
- CHANGELOG 원문: "Fixed sessions launched without the `SendMessage` tool (such as by Claude Desktop) still being told to message other sessions with it"
  (284) `SendMessage` 도구 없이 시작된 세션(예: Claude Desktop)에 여전히 그 도구로 메시지를 보내라고 안내하던 결함이 수정되었습니다. R018 Detection이 이미 `SendMessage` 존재를 Teams 활성 증거로 쓰지 않으므로 판정표 변경은 불필요합니다.

### 서브에이전트 · 출력 · 메모리

- CHANGELOG 원문: "Fixed the Explore subagent switching to Opus on the Claude API when the session runs a model ID Claude Code doesn't recognize, such as a custom model behind a proxy; Explore now inherits that model"
  (284) 세션이 CC가 인식하지 못하는 모델 ID(예: proxy 뒤 custom 모델)로 실행될 때 Explore 서브에이전트가 Opus로 전환되던 결함이 수정되어 이제 그 모델을 상속합니다. R006 모델 명세 표의 `inherit` 의미와 같은 방향이며, 구버전에서 Explore가 Opus로 전환된 관측은 이 결함이 원인일 수 있습니다.
- CHANGELOG 원문: "Fixed `/loop` status updates in self-paced mode often not being shown because Claude wrote them only in its reasoning; Claude now writes each update, and the outcome when the loop stops, as visible text"
  (284) self-paced `/loop`의 상태 갱신이 reasoning에만 쓰여 표시되지 않던 결함이 수정되어, 각 갱신과 루프 종료 결과가 visible text로 기록됩니다. 원문상 원인은 Claude가 갱신을 reasoning에만 썼다는 모델 출력 동작이며, R007/R008 헤더·접두사가 text 블록에 남지 않던 문제(R008 원인 귀속 노트)와 같은 원인이라는 근거는 없습니다. 이 수정이 R008 text 블록 부재율 전반을 해소한다는 증거는 없으므로 계수 결과는 실측으로 확인해야 합니다.
- CHANGELOG 원문: "Improved auto-memory loading: invisible characters and tags that imitate Claude Code's own markup are neutralized in `MEMORY.md` and recalled memory notes before they reach Claude"
  (284) `MEMORY.md`와 회상된 메모리 노트에서 보이지 않는 문자와 CC 자체 markup을 흉내 내는 태그가 Claude에 도달하기 전에 무력화됩니다. R011 native auto memory 경로의 방어가 강화된 것이며, 메모리에 `<system-reminder>` 류 태그를 그대로 적어 두는 관행은 더 이상 원문 그대로 전달되지 않는다고 봐야 합니다.

기타 86건 — 이 저장소 비해당(VSCode 18건, Claude Tag 10건, Cloud sessions 1건, Code Review 1건 포함, 나머지 56건은 gateway·vim 모드·키바인딩·UI 리스트·plugin 화면·Windows/Linux 세부사항 등 harness 비영향). 실측: `gh issue view 1755 --json body --jq .body | sed -n '/^## 릴리즈 요약/,$p' | grep -c '^- '` = 100건 중 위 본문 14건(Sonnet 5.5·모델 핀 1, 권한·시작 모드 2, 상태줄·재시도·컨텍스트 4, 규칙·훅·메시징 4, 서브에이전트·출력·메모리 3)을 다뤘으므로 100 − 14 = 86건입니다.

**Action items**:
- v1.1.89에서 에이전트 모델 핀을 `claude-sonnet-5-5`/`claude-opus-5-5`로 이전했고 R006 Tier 2 표에 `claude-sonnet-5-5` 행을 추가했습니다(#1755 범위 결정).
- auto mode 시작 조건 확대와 "ask again next time" 응답은 R010 Self-Check의 유효 permission mode 실측 절차를 바꾸지 않으므로 룰 수정은 불필요합니다.
- 상태줄 `spend_limit` 필드, 재시도·재compact 수정, 훅 로그·Elicitation·`SendMessage` 안내 수정, Explore 상속, `/loop` 표시, auto-memory 무력화는 기존 룰이 이미 다루는 전제를 강화하는 방향이며 룰 문안 변경은 불필요합니다.

---

## v2.1.285 (2026-09-29)

> Issue: #1764 — Claude Code v2.1.285 compatibility documentation
> Scope-ceiling check (R017): 조사 시점의 최신 릴리즈는 2.1.288(`claude --version`=2.1.288)이며, 2.1.285 이후 2.1.286~2.1.288의 CHANGELOG를 확인한 결과 이 릴리즈 항목의 롤백(revert)은 관측되지 않았습니다. 다만 아래 백그라운드 시간 제한 항목은 2.1.288에서 적용 범위가 좁혀졌습니다(해당 항목 참조). 릴리즈 게시 시각은 2026-09-29T19:27:30Z입니다.

### 백그라운드 · 시간 제한

- CHANGELOG 원문: "Changed background Bash and PowerShell commands to stop after a time limit (their `timeout` with `run_in_background`, default 30 min, max 2 h); Claude is notified when one is stopped"
  (285) 백그라운드 Bash·PowerShell 명령이 시간 제한(`run_in_background`와 함께 쓰는 `timeout`, 기본 30분, 최대 2시간) 후 중단되며, 중단되면 Claude에 알림이 갑니다. auto-dev.yaml의 ci-check 단계는 단일 한정 호출 `gh run watch <run-id> --exit-status`를 선택적으로(optionally) `run_in_background`로 실행하도록 안내하므로, 백그라운드로 실행하는 경우에 한해 이 기본 30분 제한이 확인할 지점이지만, 어떤 룰도 백그라운드 제한을 규정하지 않으므로 룰 문안 변경은 불필요합니다.
  (288) 이후 이 제한은 좁혀졌습니다. CHANGELOG 원문: "Changed the background command time limit to apply only in unattended sessions (`-p`, Agent SDK, CI, cloud); terminal, desktop app and VS Code sessions have no limit" — 대화형 터미널 세션에는 제한이 없고 `-p`·SDK·CI·cloud 세션에만 남습니다. 이는 위 변경의 롤백이 아니라 적용 범위의 축소입니다.

### 서브에이전트 · 권한 모드

- CHANGELOG 원문: "Improved subagents in auto mode: a subagent's run now ends as soon as it hands its report back to its caller, instead of taking extra turns that reach no one"
  (285) auto mode의 서브에이전트가 보고를 호출자에게 넘기는 즉시 종료되며, 아무에게도 닿지 않는 추가 턴을 쓰지 않습니다. 플랫폼 동작 개선이며 R009/R018의 maxTurns 절단 노트는 영향을 받지 않습니다.
- CHANGELOG 원문: "Fixed fork subagents not keeping the session's plan mode or `dontAsk` mode: a fork now runs under its parent's permission mode and cannot exit plan mode"
  (285) fork 서브에이전트가 부모의 permission mode로 실행되고 plan mode를 빠져나갈 수 없습니다. 서브에이전트의 유효 모드를 부모 세션이 결정한다는 R010 Self-Check의 전제를 강화하는 항목입니다.
- CHANGELOG 원문: "Fixed background subagents in auto mode prompting a second, redundant reply after each report"
  (285) auto mode의 백그라운드 서브에이전트가 보고마다 중복 응답을 한 번 더 요구하던 결함이 수정되었습니다. 백그라운드 서브에이전트 보고를 다루는 맥락 정보이며 룰 변경은 없습니다.
- CHANGELOG 원문: "Fixed `claude -p --permission-prompt-tool`: a background subagent's permission request now goes to the prompt tool instead of being auto-denied"
  (285) `claude -p --permission-prompt-tool` 사용 시 백그라운드 서브에이전트의 권한 요청이 자동 거부되는 대신 prompt tool로 전달됩니다. headless 권한 라우팅에 관한 항목이며 이 저장소에는 연결된 배선이 없습니다.
- CHANGELOG 원문: "Changed `claude -p` and Python Agent SDK sessions on third-party providers or with telemetry off to start in auto mode when no permission mode is configured, like interactive sessions; `--permission-mode` still overrides it"
  (285) 서드파티 provider이거나 텔레메트리가 꺼진 `claude -p`·Python Agent SDK 세션도 permission mode가 설정되지 않았으면 대화형 세션처럼 auto mode로 시작하며 `--permission-mode`가 계속 우선합니다. 위 v2.1.283·v2.1.284 섹션의 auto mode 시작 조건 노트를 이어받는 항목입니다. R010 Self-Check는 user·project·local 세 범위의 `permissions.defaultMode`를 함께 실측하는 절차이며, 이 항목으로 바뀌지 않습니다.

### 훅

- CHANGELOG 원문: "Fixed synchronous hooks hanging Claude Code while a background process the hook started (for example `some-daemon &`) kept its output open; the hook now finishes shortly after its own process exits"
  (285) 훅이 시작한 백그라운드 프로세스가 출력을 열어 둔 동안 동기 훅이 Claude Code를 멈추게 하던 결함이 수정되어, 훅은 자신의 프로세스가 끝난 직후 종료됩니다. 훅 신뢰성에 관한 항목이며 R021 훅 발화 진단의 맥락 정보입니다.
- CHANGELOG 원문: "Fixed hooks and SDK permission callbacks seeing a missing or outdated plan on ExitPlanMode when the plan was written in the same response"
  (285) 같은 응답에서 plan이 작성된 경우 훅과 SDK 권한 콜백이 ExitPlanMode 시점에 plan을 보지 못하거나 오래된 plan을 보던 결함이 수정되었습니다. 이 저장소는 ExitPlanMode 훅을 배선하지 않으므로 영향이 없습니다.

### Workflow · 재시도

- CHANGELOG 원문: "Fixed a failed `agent()`, `parallel()` or `pipeline()` call that a workflow script awaits later, or not at all, being treated as an unhandled promise rejection, which could end a background session"
  (285) workflow 스크립트가 나중에 await하거나 아예 await하지 않는 `agent()`·`parallel()`·`pipeline()` 호출의 실패가 unhandled promise rejection으로 처리되어 백그라운드 세션을 끝낼 수 있던 결함이 수정되었습니다. R023 Workflow Script Sanity Check의 맥락 정보입니다.
- CHANGELOG 원문: "Fixed a failing API request being retried up to 21 times when streaming kept failing; the non-streaming fallback now shares the request's retry budget instead of getting a fresh set of retries"
  (285) 스트리밍이 계속 실패할 때 API 요청이 최대 21회까지 재시도되던 결함이 수정되어, non-streaming fallback이 새 재시도 횟수를 받는 대신 요청의 재시도 예산을 공유합니다. R004 Retryable 재시도 전략의 맥락 정보입니다.

### MCP

- CHANGELOG 원문: "Changed MCP tools so a tool that sets its own `_meta['anthropic/alwaysLoad']` to false stays deferred when its `--mcp-config`, Agent SDK or plugin server is set to `alwaysLoad`"
  (285) 도구가 자신의 `_meta['anthropic/alwaysLoad']`를 false로 설정하면, 해당 서버(`--mcp-config`, Agent SDK, plugin)가 `alwaysLoad`로 설정돼 있어도 그 도구는 deferred 상태를 유지합니다. 이 저장소의 설정에는 `alwaysLoad`가 없으므로 영향이 없습니다.

### 메모리 · 컨텍스트

- CHANGELOG 원문: "Changed /memory so that Auto-memory can no longer be turned on from a background session or from a session one of Claude Code's own tools started; turning it off there still works"
  (285) 백그라운드 세션이나 Claude Code 자체 도구가 시작한 세션에서는 `/memory`로 Auto-memory를 켤 수 없고 끄는 것만 가능합니다. R011의 native auto memory 경로 설명은 바뀌지 않습니다.
- CHANGELOG 원문: "Changed sessions behind a custom `ANTHROPIC_BASE_URL` to use the 1M context window of models that have one (Opus 4.7+, Sonnet 5+, Fable); run `/autocompact 200k` if your gateway stops at 200K"
  (285) 커스텀 `ANTHROPIC_BASE_URL` 뒤의 세션이 1M 컨텍스트 창을 가진 모델(Opus 4.7+, Sonnet 5+, Fable)에서 그 창을 사용하며, gateway가 200K에서 멈추면 `/autocompact 200k`를 실행하라고 안내합니다. R013 임계값은 창 대비 백분율이므로 이 환경에서는 절대 토큰량이 달라질 수 있습니다.

기타 123건 — 이 저장소 비해당(VSCode·Claude Code on the web·Claude Tag·Code Review 전용 항목과 UI 다이얼로그·키바인딩·vim 모드 등 harness 비영향 세부사항). 실측: `gh release view v2.1.285 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 136건 중 위 본문 13건을 다뤘으므로 136 − 13 = 123건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 백그라운드 시간 제한, 서브에이전트·권한 모드, 훅, Workflow·재시도, MCP, 메모리·컨텍스트 항목은 모두 기존 룰이 이미 다루는 전제를 강화하거나 이 저장소에 배선이 없는 기능에 관한 것이며 룰 문안 변경은 불필요합니다.

---

## v2.1.286 (2026-09-30)

> Issue: #1765 — Claude Code v2.1.286 compatibility documentation
> Scope-ceiling check (R017): 조사 시점의 최신 릴리즈는 2.1.288(`claude --version`=2.1.288)이며, 2.1.288 CHANGELOG에서 이 릴리즈 항목의 롤백은 관측되지 않았습니다. 릴리즈 게시 시각은 2026-09-30T19:10:13Z입니다.

### 서브에이전트

- CHANGELOG 원문: "Fixed foreground subagents sometimes missing the task-tracking tools (TaskCreate/Get/Update/List, TodoWrite) in sessions that have them enabled"
  (286) 작업 추적 도구(TaskCreate/Get/Update/List, TodoWrite)가 활성화된 세션에서 foreground 서브에이전트가 가끔 그 도구를 받지 못하던 결함이 수정되었습니다. 이 수정은 해당 도구가 활성화된 세션에만 적용되며 이 저장소 환경에는 그 도구가 없으므로, R002의 † 표기(현행 환경에 존재하지 않음)는 그대로 유효합니다.
- CHANGELOG 원문: "Fixed subagents spawned with worktree isolation loading the project CLAUDE.md and its imports a second time from the worktree copy on their first file read"
  (286) worktree 격리로 스폰된 서브에이전트가 첫 파일 읽기 때 worktree 사본에서 프로젝트 CLAUDE.md와 그 import를 한 번 더 로드하던 결함이 수정되었습니다. 중복 로드에 관한 플랫폼 수정이며 룰 변경은 없습니다.
- CHANGELOG 원문: "Fixed the commit attribution reminder being re-sent inside tool output when a model fallback lasts only one turn"
  (286) 모델 fallback이 한 턴만 지속될 때 commit attribution 안내가 도구 출력 안에서 다시 전송되던 결함이 수정되었습니다. 안내 중복에 관한 항목이며 룰 변경은 없습니다.

### Workflow · 재시도

- CHANGELOG 원문: "Fixed Workflow tool subagents being restarted from their original prompt when a connection stalled for a few minutes mid-response"
  (286) 응답 도중 연결이 몇 분간 정체되면 Workflow 도구의 서브에이전트가 원래 프롬프트부터 다시 시작되던 결함이 수정되었습니다. R023 Workflow 관련 맥락 정보입니다.
- CHANGELOG 원문: "Changed how failed API requests are retried: one limit now covers a whole model call, so with the default retry settings a failing call sends at most 14 requests"
  (286) 실패한 API 요청의 재시도 한도가 모델 호출 전체에 대해 하나로 적용되어, 기본 재시도 설정에서 실패하는 호출은 최대 14개의 요청을 보냅니다. 위 (285)의 재시도 예산 공유 수정을 이어받는 항목이며 R004 재시도 예산의 맥락 정보입니다.

### 스킬

- CHANGELOG 원문: "Improved commit guidance: when your project or user skills include one named `verify`, Claude is now told to run it right before committing, except for docs-only and tests-only commits"
  (286) 프로젝트 또는 사용자 스킬에 `verify`라는 이름의 스킬이 있으면 docs-only·tests-only 커밋을 제외하고 커밋 직전에 실행하라고 Claude에 안내됩니다. 관측한 범위에서 이 저장소에는 `verify`라는 이름의 스킬이 없고(`deep-verify`는 이름이 일치하지 않습니다) 사용자 스킬에서도 관측되지 않았으므로 조치는 없습니다.

### 훅 · 안정성

- CHANGELOG 원문: "Changed `--bare` to connect only the MCP servers named on the command line, send the model no system reminders, and start no background tasks; under `--bare`, a shell command that reaches its timeout now stops instead of moving to the background"
  (286) `--bare`는 명령줄에 지정한 MCP 서버만 연결하고, 모델에 system reminder를 보내지 않으며, 백그라운드 작업을 시작하지 않습니다. 또한 `--bare`에서는 timeout에 도달한 셸 명령이 백그라운드로 넘어가는 대신 중단됩니다. 이 저장소는 `--bare`를 사용하지 않으므로 영향이 없습니다.

### 모델

- CHANGELOG 원문: "Fixed every turn failing when the Anthropic API refuses the model your default or a model alias resolves to: Claude Code now retries once on the previous model of the same tier"
  (286) Anthropic API가 기본 모델 또는 모델 alias가 해석된 모델을 거부해 모든 턴이 실패하던 결함이 수정되어, 이제 같은 티어의 이전 모델로 한 번 재시도합니다. R006은 Tier 1 alias를 CC가 해석한다고 이미 규정하므로 문안 변경은 불필요합니다.

기타 80건 — 이 저장소 비해당(VSCode·Claude Code on the web·Claude Tag·Code Review 전용 항목과 UI 다이얼로그·키바인딩·vim 모드 등 harness 비영향 세부사항). 실측: `gh release view v2.1.286 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 88건 중 위 본문 8건을 다뤘으므로 88 − 8 = 80건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 서브에이전트, Workflow·재시도, 스킬, `--bare`, 모델 항목은 기존 룰이 이미 다루는 전제를 강화하거나 이 저장소에 해당 구성이 없는 항목이며 룰 문안 변경은 불필요합니다.

---

## v2.1.287 (2026-10-01)

> Issue: #1766 — Claude Code v2.1.287 compatibility documentation
> Scope-ceiling check (R017): 조사 시점의 최신 릴리즈는 2.1.288(`claude --version`=2.1.288)입니다. 2.1.288 CHANGELOG는 이 릴리즈의 항목을 롤백하지 않았고, 아래 `rm` 안전장치 수정은 오히려 `bash -c`·`sh -c` 스크립트로 확장되었습니다(288 CHANGELOG 원문: "Fixed a dangerous `rm` (such as one on `/` or the home directory) inside a `bash -c` or `sh -c` script running without a prompt in bypassPermissions mode or under a shell allow rule (anthropics/claude-code#96300)"). 릴리즈 게시 시각은 2026-10-01T18:00:22Z입니다.

### 지시 파일

- CHANGELOG 원문: "Fixed a folder's CLAUDE.md being attached a second time after resuming a session or after a compaction"
  (287) 세션을 재개하거나 compaction을 한 뒤 폴더의 CLAUDE.md가 한 번 더 첨부되던 결함이 수정되었습니다. R021의 재주입 경로는 `SessionStart` 훅(`claude-md-reinject.sh`)이며 CC 자체의 CLAUDE.md 첨부와 별개이므로 재주입은 계속 유지합니다. 다만 중복 첨부 위험이 있었다는 점은 기록해 둡니다.

### 권한 · rm

- CHANGELOG 원문: "Fixed a dangerous `rm` (such as one on `/` or the home directory) losing its always-ask safeguard when the same command also redirected output to a `~` or wildcard path"
  (287) 위험한 `rm`(예: `/` 또는 홈 디렉터리 대상)이 같은 명령에서 `~`나 와일드카드 경로로 출력을 리다이렉트할 때 항상 확인하는 안전장치를 잃던 결함이 수정되었습니다. R001의 `rm` 금지 맥락과 같은 방향의 플랫폼 수정이며 R001 문안 변경은 없습니다.
- CHANGELOG 원문: "Changed whole-tool `Bash` allow rules and allowing hooks to prompt for, not run, shell writes to files Claude Code's file tools refuse outright (the Anthropic profile store, the host credentials file)"
  (287) Bash 전체 allow 규칙과 허용 훅이, Claude Code의 파일 도구가 아예 거부하는 파일(Anthropic profile store, host credentials file)에 대한 셸 쓰기를 실행하지 않고 확인을 요구합니다. R002 Bash 티어의 맥락 정보이며 티어 정책은 바뀌지 않습니다.

### 훅

- CHANGELOG 원문: "Fixed hooks configured with `asyncRewake` waking Claude over and over with "found issues" notifications when the hook's script file is missing; the broken hook is now reported once"
  (287) `asyncRewake`로 구성된 훅의 스크립트 파일이 없을 때 "found issues" 알림으로 Claude를 계속 깨우던 결함이 수정되어, 깨진 훅은 한 번만 보고됩니다. 관측한 범위에서 이 저장소에는 `asyncRewake` 훅이 없으므로 영향이 없습니다.

### 텔레메트리

- CHANGELOG 원문: "Added `prompt_text` to the OpenTelemetry `user_prompt` event, a copy of `prompt` for backends that nest dotted keys; drop or mask it wherever you drop or mask `prompt` (anthropics/claude-code#70763)"
  (287) OpenTelemetry `user_prompt` 이벤트에 `prompt_text`가 추가되었고, `prompt`를 제거하거나 마스킹하는 곳에서는 이 필드도 같이 제거하거나 마스킹해야 합니다. monitoring-setup 스킬을 다루는 맥락 정보입니다.

### MCP

- CHANGELOG 원문: "Changed MCP server `alwaysLoad: false` to defer all of that server's tools behind tool search"
  (287) MCP 서버의 `alwaysLoad: false`는 그 서버의 모든 도구를 tool search 뒤로 deferred 처리합니다. 위 (285)의 `alwaysLoad` 항목과 같은 계열이며, 이 저장소의 설정에는 `alwaysLoad`가 없으므로 영향이 없습니다.

### 메모리 · 컨텍스트

- CHANGELOG 원문: "Changed Opus 4.7+ and Fable to use a 1M context window by default on Bedrock, Vertex, Foundry and the Claude apps gateway, with no `[1m]` suffix (`CLAUDE_CODE_DISABLE_1M_CONTEXT=1` keeps 200K)"
  (287) Bedrock, Vertex, Foundry, Claude apps gateway에서 Opus 4.7+와 Fable이 `[1m]` 접미사 없이 기본으로 1M 컨텍스트 창을 사용하며 `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`이면 200K를 유지합니다. R013 임계값은 창 대비 백분율이므로 절대 토큰량은 이 설정에 따라 달라집니다.

### 모델

- CHANGELOG 원문: "Fixed picking Fable in `/model` on a claude.ai login saving the current version's id, so your saved default now follows the newest Fable like Opus and Sonnet do"
  (287) claude.ai 로그인에서 `/model`로 Fable을 고르면 현재 버전의 id가 저장되던 결함이 수정되어, 저장된 기본값이 Opus·Sonnet처럼 최신 Fable을 따라갑니다. R006 모델 티어 설명의 맥락 정보이며 룰 변경은 없습니다.

기타 98건 — 이 저장소 비해당(VSCode·Claude Code on the web·Claude Tag·Code Review 전용 항목과 UI 다이얼로그·키바인딩·vim 모드 등 harness 비영향 세부사항). 실측: `gh release view v2.1.287 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 106건 중 위 본문 8건을 다뤘으므로 106 − 8 = 98건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 지시 파일, 권한·`rm`, 훅, 텔레메트리, MCP, 메모리·컨텍스트, 모델 항목은 기존 룰이 이미 다루는 전제를 강화하거나 이 저장소에 해당 구성이 없는 항목이며 룰 문안 변경은 불필요합니다. R021의 `SessionStart` 재주입은 유지합니다.

---

## v2.1.288 (2026-10-02)

> Issue: #1790 — Claude Code v2.1.288 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-05)의 최신 릴리즈는 2.1.289입니다(`claude --version`=2.1.289, `npm view @anthropic-ai/claude-code version`=2.1.289). 2.1.289 CHANGELOG에는 "[VSCode] Reverted a 2.1.288 change to `claude auth status` that may have made sign-outs more frequent"가 있으나, 2.1.288 CHANGELOG 절에는 `claude auth status` 문구가 없어(`grep -F` 0건) 되돌려진 288 항목을 특정할 수 없고 VSCode 전용이므로 아래 항목의 롤백은 확인되지 않았습니다. 릴리즈 게시 시각은 2026-10-02T20:19:57Z입니다(`gh release view v2.1.288 --repo anthropics/claude-code --json publishedAt`).

### 세션 · 재개 · 컨텍스트

- CHANGELOG 원문: "Fixed mid-response API timeouts failing the turn: non-interactive sessions and subagents now continue from the partial response, and thinking-only responses are retried"
  (288) 응답 도중 API 타임아웃이 턴을 실패시키던 결함이 수정되어, 비대화형 세션과 서브에이전트가 부분 응답에서 이어가고 thinking만 있는 응답은 재시도됩니다. R004 Retryable 재시도 전략을 플랫폼이 서브에이전트 경로에서도 수행한다는 (257)·(246)의 자동 이어감과 같은 계열이므로, 위임 에이전트의 중간 종료를 진단할 때 네트워크 절단 축은 후순위로 두고 R020의 maxTurns 한도를 먼저 확인하는 기존 순서를 유지합니다. 룰 변경은 없습니다.
- CHANGELOG 원문: "Fixed long conversations failing with "Prompt is too long" instead of auto-compacting when the last reply reported zero token usage"
  (288) 마지막 응답이 토큰 사용량 0을 보고하면 긴 대화가 auto-compact 대신 "Prompt is too long"으로 실패하던 결함이 수정되었습니다. R013 컨텍스트 예산·(269)(274)의 "Prompt is too long" 계열 수정과 같은 맥락이며 임계값 정의는 바뀌지 않습니다. `/fsd` 같은 장기 자율 루프에 유리한 수정입니다.
- CHANGELOG 원문: "Fixed `--resume` sometimes dropping files and other context that a compaction had just restored"
  (288) `--resume`이 compaction 직후 복원된 파일과 컨텍스트를 간혹 누락하던 결함이 수정되었습니다. 압축·재시작 뒤 CLAUDE.md를 다시 읽는 R010의 Session Continuity 절차는 그대로 유지하며(재개 관련 버전 노트는 R011이 담당합니다), 이 수정은 구버전 재개 세션의 컨텍스트 누락을 모델 규칙 위반으로만 귀속하지 않는 근거가 됩니다.
- CHANGELOG 원문: "Fixed a resumed session sometimes not saving the last response of a turn, so that the next `--resume` showed the prompt unanswered"
  (288) 재개된 세션이 간혹 턴의 마지막 응답을 저장하지 못해 다음 `--resume`에서 프롬프트가 미응답으로 보이던 결함이 수정되었습니다. 미응답처럼 보이지만 실제로는 응답이 있었을 수 있는 역방향 사례이므로 R020의 Failure/Interrupt Report ≠ Actual Failure (reverse direction) 조항대로, 재개 뒤 미응답으로 보이는 턴은 트랜스크립트 표시가 아니라 산출물 실측으로 판정합니다.
- CHANGELOG 원문: "Fixed resume occasionally loading a transcript cut short when the same session rewrote the file during the load"
  (288) 같은 세션이 로드 중 파일을 다시 쓰면 재개가 간혹 잘린 트랜스크립트를 읽던 결함이 수정되었습니다. 트랜스크립트 계수(`scripts/count-r007-r008.sh`, R023)의 입력 신뢰도에 관한 맥락 정보입니다. R011의 (275) 노트는 275 이전에 malformed 엔트리 하나 때문에 재개에 실패한 세션을 대상으로 R020 트랜스크립트 계수를 하한값으로 취급하도록 하며, 잘린 트랜스크립트를 읽은 세션의 계수도 하한값으로 보는 것이 같은 방향입니다 [가설 — 잘린 로드 세션의 계수 보정은 (275) 노트가 직접 다루지 않는 유비]. 룰 변경은 없습니다.
- CHANGELOG 원문: "Fixed resuming a conversation started on 2.1.286 or earlier dropping the model's earlier thinking"
  (288) 2.1.286 이하에서 시작한 대화를 재개하면 모델의 이전 thinking이 누락되던 결함이 수정되었습니다. 맥락 정보이며 영향은 확인되지 않았습니다.
- CHANGELOG 원문: "Fixed session titles, memory recall and prompt hooks failing on Mantle or behind gateways that reject structured outputs; added `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` to turn structured outputs off"
  (288) Mantle이나 structured outputs를 거부하는 게이트웨이 뒤에서 세션 제목·메모리 recall·prompt 훅이 실패하던 결함이 수정되었고, `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`로 structured outputs를 끌 수 있습니다. 관측한 범위에서 이 저장소에는 `type: prompt` 훅이 PostCompact(matcher `*`) 1개 있으나, 프로젝트 `.claude/settings.json`에 `env`가 없고(`.claude/settings.local.json`의 env 키는 `CLAUDE_COST_CAP`뿐) Mantle·게이트웨이 설정이 관측되지 않아 영향이 없습니다.
- CHANGELOG 원문: "Changed `/autocompact` to save the auto-compact window per model, so each model keeps its own setting when you switch"
  (288) `/autocompact`가 auto-compact 창을 모델별로 저장하므로 모델을 바꿔도 각 모델이 자기 설정을 유지합니다. R013 임계값은 창 대비 백분율이므로 모델 전환 시 절대 토큰량이 모델별 설정에 따라 달라질 수 있습니다 [가설 — 저장소에서 /autocompact 사용 여부 미관측].
- CHANGELOG 원문: "Fixed the first request in a fresh environment or after a model switch using the built-in output limit and auto-compact window, not the server's; that request may now wait up to 1.5 seconds"
  (288) 새 환경이나 모델 전환 뒤 첫 요청이 서버의 출력 한도·auto-compact 창 대신 내장값을 쓰던 결함이 수정되었고, 그 요청은 이제 최대 1.5초 기다릴 수 있습니다. 위 `/autocompact` 항목과 함께 R013 컨텍스트 예산의 절대 토큰량 해석에 관한 맥락 정보이며, 임계값 정의는 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed unattended sessions (`CLAUDE_CODE_RETRY_WATCHDOG`) retrying for hours after a very long response stream failed; Claude Code now streams again, and gives up after three timeouts"
  (288) `CLAUDE_CODE_RETRY_WATCHDOG`을 쓰는 무인 세션이 매우 긴 응답 스트림 실패 뒤 몇 시간씩 재시도하던 결함이 수정되어, 이제 다시 스트리밍하고 타임아웃 세 번 뒤 포기합니다. R018의 (260) 노트가 이 환경 변수를 예시로 언급합니다. (288) 타임아웃 세 번 뒤 포기하는 동작은 R004의 최대 3회 재시도 후 보고하는 전략과 방향이 같습니다. (288) 저장소에서 이 환경 변수 사용은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed headless (`-p` / SDK) sessions occasionally ignoring SIGTERM when a supervisor such as `timeout` or systemd sends SIGCONT alongside it"
  (288) 감독자(`timeout`, systemd 등)가 SIGCONT를 함께 보낼 때 headless(`-p` / SDK) 세션이 간혹 SIGTERM을 무시하던 결함이 수정되었습니다. 관측한 범위에서 `infra/hada-scout/scout-runner.sh`가 `timeout "${SCOUT_TIMEOUT}" claude -p`(`-k` 없음)로 실행하므로 해당 구성입니다. 288 이전에는 SIGTERM이 간혹 무시되어 실행이 끝나지 않을 수 있었다는 회고적 함의가 있습니다 [가설 — 실제 배포 여부와 이미지의 CC 버전 미실측]. 룰 변경은 없습니다.

### 권한 · auto mode · rm

- CHANGELOG 원문: "Fixed auto mode denials pointing Claude at a Bash permission rule when the blocked tool was not Bash"
  (288) 차단된 도구가 Bash가 아닌데도 auto mode 거부 메시지가 Bash 권한 규칙을 가리키던 결함이 수정되었습니다. 이 저장소가 추적하는 프로젝트 settings의 `defaultMode`는 `bypassPermissions`이고(`git show HEAD:.claude/settings.json | jq -r '.permissions.defaultMode'`), R010 「Universal bypassPermissions」에 따르면 2.1.257부터 project·local의 이 값은 무시되어 그 범위가 `default`로 귀결하며, bypass가 아닌 user 값(`auto` 포함)을 덮습니다(`.claude/rules/MUST-orchestrator-coordination.md:588`, `claude -p` init `permissionMode` 실측, CC 2.1.289). 작성 기기에서는 사용자 scope `defaultMode`가 `auto`로 관측되었으나(`jq -r '.permissions.defaultMode // "unset"' ~/.claude/settings.json`; 기기별 설정이라 저장소 사실이 아닙니다), 이 규칙대로라면 그 기기의 `claude -p` 세션은 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않는 한 auto mode가 아니라 `default`로 시작합니다. 대화형 TTY 세션의 유효 모드는 R010이 `-p` 결과와 조정하지 않은 `[가설]`이므로, 이 수정은 auto mode가 실제로 활성인 세션에 한해 관련됩니다. R001의 classifier 차단 후 재시도 금지 취지와 R010 STOP Protocol의 진단 정확도가 높아질 뿐 규범은 그대로입니다.
- CHANGELOG 원문: "Improved auto mode: when a conversation grows too long for the client-side safety classifier to review, it is now compacted instead of prompting for, or failing, every tool call"
  (288) auto mode에서 대화가 클라이언트 측 안전 classifier가 검토하기에 너무 길어지면 모든 도구 호출을 묻거나 실패시키는 대신 compact됩니다. 이 저장소의 긴 세션 중 auto mode가 실제로 활성인 세션에만 해당합니다(바로 위 항목의 R010 판정 — 이 저장소처럼 project에 `bypassPermissions`가 있고 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않으며 user 값이 bypass가 아닐 때 `claude -p`는 `default`로 시작, 대화형 세션은 `[가설]`). 구버전의 긴 auto mode 세션에서 도구 호출 거부·프롬프트가 있었다면 모델 규칙 위반으로만 귀속할 수 없습니다 [가설 — 해당 거부·프롬프트가 실제로 있었는지 미관측]. R002·R021 문안 변경은 없습니다.
- CHANGELOG 원문: "Changed the client-side auto mode classifier to ignore an `ANTHROPIC_DEFAULT_SONNET_MODEL` pin that names Claude Sonnet 5.5 or Opus 5.5 and use Claude Sonnet 5 instead"
  (288) 클라이언트 측 auto mode classifier는 Claude Sonnet 5.5 또는 Opus 5.5를 가리키는 `ANTHROPIC_DEFAULT_SONNET_MODEL` 고정을 무시하고 Claude Sonnet 5를 사용합니다. 관측한 범위에서 프로젝트 `.claude/settings.json`에 `env`가 없고 `.claude/settings.local.json`의 env 키는 `CLAUDE_COST_CAP`뿐이어서 이 env 고정은 쓰이지 않습니다(사용자 scope는 미관측). 이 저장소의 에이전트 핀은 frontmatter의 Tier 2 전체 ID(R006)이며, auto mode classifier가 에이전트 핀과 무관한 모델로 동작한다는 점은 R006 모델 설명의 맥락 정보입니다.
- CHANGELOG 원문: "Fixed Bash tool permission check to prompt before a `BASHPID` assignment whose value the shell would evaluate as arithmetic, instead of allowing it silently"
  (288) 셸이 산술식으로 평가할 값을 가진 `BASHPID` 할당을 조용히 허용하지 않고 먼저 확인합니다. R002 Bash 티어(Tier 4 승인) 방향의 플랫폼 수정이며 티어 정책은 바뀌지 않습니다. 저장소에 `BASHPID` 할당 사용은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed a dangerous `rm` (such as one on `/` or the home directory) inside a `bash -c` or `sh -c` script running without a prompt in bypassPermissions mode or under a shell allow rule (anthropics/claude-code#96300)"
  (288) `bash -c`·`sh -c` 스크립트 안의 위험한 `rm`(예: `/`나 홈 디렉터리 대상)이 bypassPermissions 모드나 셸 allow 규칙 아래에서 프롬프트 없이 실행되던 결함이 수정되었습니다. 이 수정은 (287)의 `rm` 안전장치 수정이 스크립트 래퍼로 확장된 것이며, 가장 직접적인 선행 노트는 R001의 (261) 노트(positional parameter와 큰따옴표 `sh -c` 내부 `rm -rf`까지 확인을 확장)와 (273) 노트(bypass 모드 subshell 안의 `rm`)입니다. 관측한 범위에서 프로젝트 settings.json에는 `Bash(rm:*)` allow와 `defaultMode: bypassPermissions`(R010에 따라 2.1.257부터 프로젝트 scope에서는 무시됩니다)가 있고 `Bash(bash:*)`·`Bash(sh:*)` allow는 없습니다. 프로젝트 scope의 `bypassPermissions`가 무시되므로 이 저장소의 추적 설정만으로는 bypassPermissions 모드가 되지 않으며, 유효 모드는 local·user·managed 설정과 실행 플래그에 따라 기기마다 다릅니다(R010 「Universal bypassPermissions」, `.claude/rules/MUST-orchestrator-coordination.md:588`). R001 문안 변경은 없고, 이 플랫폼 가드는 R001의 위임 전 blast-radius 열거를 대체하지 않습니다.
- CHANGELOG 원문: "Changed the background command time limit to apply only in unattended sessions (`-p`, Agent SDK, CI, cloud); terminal, desktop app and VS Code sessions have no limit"
  (288) 백그라운드 명령 시간 제한이 무인 세션(`-p`, Agent SDK, CI, cloud)에만 적용되고, 터미널·데스크톱 앱·VS Code 세션에는 제한이 없습니다. 이 가이드 (285) 절의 백그라운드 시간 제한 항목("(288) 이후 이 제한은 좁혀졌습니다"로 이 불릿을 인용)과 이어지며, 룰 변경은 없습니다.

### 훅

- CHANGELOG 원문: "Fixed PreToolUse and PermissionRequest hooks being skipped when matching them failed or the tool's input could not be serialized to JSON; the call is now blocked"
  (288) matcher 평가 자체가 오류로 실패하거나 도구 입력을 JSON으로 직렬화할 수 없을 때 PreToolUse·PermissionRequest 훅이 건너뛰어지던 결함이 수정되어, 이제 해당 호출이 차단됩니다(matcher가 일치하지 않는 훅은 원래도 실행되지 않으며 이 항목의 대상이 아닙니다). 이 fail-closed 동작은 R021의 Hard Block 계열에 한정되지 않고 advisory를 포함한 모든 PreToolUse 그룹에 적용되므로, 평가 중 오류를 내는 matcher는 이제 호출을 차단합니다. 관측한 범위에서 PreToolUse 그룹은 12개(advisory 포함)이고 PermissionRequest 훅은 없습니다. R021 Advisory-first 정책 문안 변경은 없으며, 훅 matcher 편집 뒤 `bun run sync:hooks` 재생성 확인(R021)의 중요도가 커집니다.
- CHANGELOG 원문: "Fixed `idle_prompt` notification hooks firing while background agents are still running (anthropics/claude-code#93672)"
  (288) 백그라운드 에이전트가 실행 중인데 `idle_prompt` 알림 훅이 발화하던 결함이 수정되었습니다. 관측한 범위에서 Notification 훅은 1개이고 matcher가 `*`이며 `.message`를 stderr에 출력할 뿐이어서 영향은 stderr 줄 1개 수준입니다. 이 훅이 `idle_prompt` 알림에도 걸리는지는 확인하지 않았습니다 [가설 — matcher *가 idle_prompt 알림에도 걸릴 가능성].
- CHANGELOG 원문: "Fixed the InstructionsLoaded hook omitting agent_id and agent_type when a subagent's file access loads a rule or nested CLAUDE.md; rules and nested CLAUDE.md files loaded on file access now also report effort"
  (288) 서브에이전트의 파일 접근이 룰이나 nested CLAUDE.md를 로드할 때 InstructionsLoaded 훅이 agent_id·agent_type을 빠뜨리던 결함이 수정되었고, 파일 접근으로 로드된 룰·nested CLAUDE.md는 effort도 보고합니다. 관측한 범위에서 InstructionsLoaded 훅이 없어 영향이 없습니다(`jq -r '.hooks.InstructionsLoaded // [] | length' .claude/settings.json` = 0, `git grep -c -F 'InstructionsLoaded' -- .claude/hooks/hooks.json` 출력 없음(rc=1)). 훅 stdin 필드는 실측으로 확인한다는 기존 규율(R020 Config-Schema-Before-Edit)을 유지합니다.

### 지시 파일

- CHANGELOG 원문: "Fixed path-scoped `.claude/rules` and nested CLAUDE.md files not loading when Write or Edit creates or changes a file in their scope (previously only Read loaded them)"
  (288) path-scoped `.claude/rules`와 nested CLAUDE.md가 Write·Edit으로 해당 범위의 파일을 만들거나 바꿀 때도 로드됩니다(이전에는 Read만 로드). 관측한 범위에서 `.claude/rules/*.md`에는 frontmatter가 없어 path-scoped 룰이 없습니다(`paths:` 일치 1건은 R006 본문의 스킬 frontmatter 예시 줄입니다). `git ls-files '*CLAUDE.md'` 기준 CLAUDE.md 파일은 `CLAUDE.md`, `templates/CLAUDE.md` 2개이며, 이 중 nested CLAUDE.md는 `templates/CLAUDE.md`(루트와 내용이 다름)입니다. 따라서 288부터 `templates/` 아래 파일을 Write·Edit할 때도 이 파일이 로드됩니다. Edit과 기존 파일 덮어쓰기는 선행 Read가 필요하므로 새로 생기는 차이는 주로 새 파일 Write일 것입니다 [가설 — 선행 Read 때문에 Read 로드가 이미 일어났을 가능성]. R021의 `SessionStart` 재주입 경로는 별개이며 유지합니다.

### 서브에이전트 · Agent Teams

- CHANGELOG 원문: "Fixed agent teams: a plugin-defined agent spawned by name now runs with its own prompt, tools, disallowedTools and effort instead of the defaults"
  (288) agent teams에서 이름으로 스폰한 plugin 정의 에이전트가 기본값 대신 자기 prompt·tools·disallowedTools·effort로 실행됩니다. R018은 `TeamCreate` 부재 환경에서 비활성(dormant)이고 관측한 범위에서 `.claude-plugin/` 디렉토리가 없어 plugin 정의 에이전트도 없으므로 영향이 없습니다. 룰 변경은 없습니다.
- CHANGELOG 원문: "Fixed a stall when launching an agent whose `tools:` lists very many `Agent(...)` entries"
  (288) `tools:`에 `Agent(...)` 항목이 매우 많은 에이전트를 시작할 때의 정체가 수정되었습니다. 관측한 범위에서 `.claude/agents/*.md` 중 `tools:`에 `Agent(` 항목이 있는 파일은 0개이므로 영향이 없습니다. R006 에이전트 설계 문안 변경은 없습니다.
- CHANGELOG 원문: "Fixed Claude reporting a message to another session as delivered when that session held it: the notice now says it wasn't delivered and names the session, and in SDK sessions Claude can now learn of it mid-turn"
  (288) 다른 세션이 메시지를 보류하고 있는데 전달됨으로 보고하던 결함이 수정되어, 이제 전달되지 않았음과 세션 이름을 알리고 SDK 세션에서는 턴 도중에도 이를 알 수 있습니다. 직접 선행 노트는 R018의 (271) 노트(보류된 교차 세션 메시지, 전달됨 ≠ 읽힘)이며, R018 Scope의 "전달·열거 성공은 조율 신호일 뿐 승인 채널이 아니며 완료의 증거도 아니다"와 R020의 actual outcome ≠ attempt와 같은 방향입니다. 룰 변경은 없습니다.

### MCP · LSP

- CHANGELOG 원문: "Fixed MCP tool calls sometimes running twice when a remote server's result was over 16 MB or could not be parsed"
  (288) 원격 서버의 결과가 16MB를 넘거나 파싱할 수 없을 때 MCP 도구 호출이 간혹 두 번 실행되던 결함이 수정되었습니다. 부작용이 있는 MCP 호출의 중복 실행 위험에 관한 맥락 정보이며 R001·R002 문안 변경은 없습니다.
- CHANGELOG 원문: "Fixed LSP tool calls hanging indefinitely when a language server uses dynamic capability registration or stops responding; requests now time out after 60s (per-server `requestTimeout`)"
  (288) language server가 동적 capability 등록을 쓰거나 응답을 멈출 때 LSP 도구 호출이 무한 대기하던 결함이 수정되어, 요청이 60초 뒤 타임아웃됩니다(서버별 `requestTimeout`). R002 Tier 3의 LSP 도구에 관한 맥락 정보이며 룰 변경은 없습니다.

### 텔레메트리

- CHANGELOG 원문: "Fixed OpenTelemetry `claude_code.tool.blocked_on_user` spans reporting `unknown` source or decision in `-p` and SDK sessions and for PreToolUse hook approvals"
  (288) `-p`·SDK 세션과 PreToolUse 훅 승인에서 OpenTelemetry `claude_code.tool.blocked_on_user` span이 source·decision을 `unknown`으로 보고하던 결함이 수정되었습니다. monitoring-setup 스킬을 다루는 맥락 정보입니다.
- CHANGELOG 원문: "Fixed permission asks that ended unanswered, in `-p` or on an interrupted turn, emitting no `tool_decision` event"
  (288) `-p`에서 또는 인터럽트된 턴에서 응답 없이 끝난 권한 요청이 `tool_decision` 이벤트를 내보내지 않던 결함이 수정되었습니다. 응답 없는 권한 요청이 이제 관측 가능하다는 monitoring-setup 맥락 정보이며, R003 인터럽트 처리·R020 인터럽트 규칙의 문안 변경은 없습니다.

### 코드 리뷰

- CHANGELOG 원문: "Added `--max-findings <n>|all` to /code-review to report more or fewer findings than the usual limit; the choice is reused until you pass `--max-findings default`"
  (288) `/code-review`에 `--max-findings <n>|all`이 추가되어 보고 건수 상한을 바꿀 수 있고, 선택값은 `--max-findings default`를 지정할 때까지 다음 실행에도 유지됩니다. R023의 (232) 노트가 `/code-review`를 Tier 3 검증 호출로 다루므로, 상한이 걸린 리뷰를 완전한 리뷰로 오인할 수 있다는 함의가 있습니다. 관측한 범위에서 이 저장소 파이프라인에 `/code-review` 호출은 없습니다. 룰 변경은 없습니다.

### 설치

- CHANGELOG 원문: "Fixed the npm auto-updater reporting success when the platform-native binary failed to download and only the placeholder `claude` stub was installed"
  (288) npm auto-updater가 플랫폼 네이티브 바이너리 다운로드에 실패하고 placeholder `claude` 스텁만 설치됐는데도 성공을 보고하던 결함이 수정되었습니다. R020의 actual outcome ≠ attempt가 설치 도메인에 나타난 사례입니다. R017 게이트의 `claude --version` 실측이 스텁 설치 실패를 부수적으로 드러낼 수 있습니다 [가설 — 스텁이 `--version` 출력으로 구분되는지 미실측]. 룰 변경은 없습니다.

기타 59건 — 이 저장소 비해당(VSCode·Cloud sessions·Cowork·Claude Tag·Claude in Chrome·플러그인 마켓플레이스/`--plugin-dir`·mods·screen reader 모드·agents view 키바인딩·Windows·Bedrock/Vertex 인증 등 harness 비영향 세부사항). 실측: `gh release view v2.1.288 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 89건 중 위 본문 30건을 다뤘으므로 89 − 30 = 59건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 세션·재개·컨텍스트, 권한·auto mode·`rm`, 훅, 지시 파일, 서브에이전트·Agent Teams, MCP·LSP, 텔레메트리, 코드 리뷰, 설치 항목은 기존 룰이 이미 다루는 전제를 강화하거나, 이 저장소에 해당 구성이 없거나, 해당 구성이 있어도 현재 행동을 바꾸는 규범이 아니므로 룰 문안 변경은 불필요합니다. R021의 `SessionStart` 재주입은 유지합니다.
- 제안 없음: R016 정책상 룰에는 현재 행동을 바꾸는 규범만 1줄로 들어가며, 위 항목 중 행동을 바꾸는 것은 확인되지 않았습니다.
- 미확인 사항: Notification 훅(matcher `*`)이 `idle_prompt` 알림에도 걸리는지는 확인하지 않았습니다 [가설 — matcher *가 idle_prompt 알림에도 걸릴 가능성].
- 미확인 사항: `infra/hada-scout/scout-runner.sh`(`timeout … claude -p`)의 실제 배포 여부와 이미지의 CC 버전은 확인하지 않았습니다 [가설 — 배포 이미지가 288 미만 CC를 쓸 가능성].

---

## v2.1.289 (2026-10-03)

> Issue: #1791 — Claude Code v2.1.289 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-05)의 최신 릴리즈는 2.1.289입니다(`claude --version`=2.1.289, `npm view @anthropic-ai/claude-code version`=2.1.289). 따라서 이 릴리즈 이후 릴리즈의 롤백 확인 대상이 없습니다. 이 릴리즈 CHANGELOG의 "[VSCode] Reverted a 2.1.288 change to `claude auth status` that may have made sign-outs more frequent"는 2.1.288 항목의 롤백이며 VSCode 전용입니다(288 절에는 `claude auth status` 문구가 없습니다). 릴리즈 게시 시각은 2026-10-03T23:07:17Z입니다(`gh release view v2.1.289 --repo anthropics/claude-code --json publishedAt`).

### 권한 · Bash deny/ask 규칙

- CHANGELOG 원문: "Fixed Bash deny and ask rules missing a command behind an environment variable prefix with an expanded value (e.g. `TZ="$HOME" rm -rf build`) when the sandbox auto-allows commands"
  (289) sandbox가 명령을 자동 허용하는 경우, 확장된 값을 가진 환경 변수 접두(예: `TZ="$HOME" rm -rf build`) 뒤의 명령을 Bash deny·ask 규칙이 놓치던 결함이 수정되었습니다. R002·R001의 `rm` 금지 맥락과 같은 방향의 플랫폼 수정입니다. 관측한 범위에서 프로젝트 `.claude/settings.json`에는 `permissions.deny`가 0개이고 `sandbox` 설정이 없어 이 수정의 전제 조건(sandbox auto-allow)이 없으므로 영향이 없습니다.
- CHANGELOG 원문: "Fixed a Bash deny or ask rule being skipped under sandbox auto-allow when a bare variable assignment came before the command"
  (289) sandbox auto-allow 상태에서 명령 앞에 bare 변수 할당이 오면 Bash deny·ask 규칙이 건너뛰어지던 결함이 수정되었습니다. 위 항목과 같은 전제(sandbox auto-allow)를 요구하므로 관측한 범위에서 이 저장소에는 해당하지 않습니다.
- CHANGELOG 원문: "Fixed a deny or ask rule on a nested part of a compound shell command not holding over a user-installed mod's approval on managed machines"
  (289) 관리형 머신에서 compound shell 명령의 중첩 부분에 걸린 deny·ask 규칙이, 사용자가 설치한 mod의 승인 앞에서 유지되지 않던 결함이 수정되었습니다. 이 결함은 CHANGELOG 원문대로 관리형 머신에서만 발생하며, 관리형 머신 여부와 사용자가 설치한 mod는 머신·사용자 수준 구성이라 저장소에서 관측할 수 없습니다. 관측한 범위에서 이 저장소에는 mod 구성이 없고 R002 티어 정책도 바뀌지 않습니다. 이 개발 환경이 관리형 머신이 아니어서 영향이 없을 것으로 봅니다 [가설 — 머신 관리 여부는 미관측].
- CHANGELOG 원문: "Fixed `Read` deny rules not applying to files @-mentioned, changed, or selected in the IDE through a symlink"
  (289) IDE에서 @-멘션되거나 변경되거나 선택된 파일이 심볼릭 링크를 통해 들어올 때 `Read` deny 규칙이 적용되지 않던 결함이 수정되었습니다. R002 파일 접근 범위와 같은 방향의 플랫폼 수정이며, 관측한 범위에서 프로젝트 `permissions.deny`가 0개이므로 이 저장소에서는 영향이 없습니다.

### MCP

- CHANGELOG 원문: "Fixed a user-installed plugin being able to rewrite the descriptions of an organization-managed MCP server's sign-in tools"
  (289) 사용자가 설치한 플러그인이 조직 관리 MCP 서버의 로그인 도구 설명을 다시 쓸 수 있던 결함이 수정되었습니다. 관측한 범위에서 이 저장소는 조직 관리 MCP 서버 구성을 두지 않으며 R002 Tier 6(MCP) 정책도 바뀌지 않습니다.

### 플러그인 · 에이전트

- CHANGELOG 원문: "Fixed `claude plugin validate` skipping the plugin when the folder also holds a marketplace manifest"
  (289) 폴더에 marketplace manifest도 함께 있으면 `claude plugin validate`가 플러그인을 건너뛰던 결함이 수정되었습니다. 관측한 범위에서 이 저장소의 검증 대상에는 marketplace manifest가 없으므로(`.claude-plugin/` 디렉토리 없음) 이 결함 조건에 해당하지 않습니다. 참고로 R017 본문에 "스킬 추가·수정 후 `claude plugin validate`를 개수 대조와 함께 실행한다(R023)"는 문장이 있으나, 이 수정은 그 문장의 동작을 바꾸지 않습니다.
- CHANGELOG 원문: "Fixed `claude plugin validate` failing an Anthropic marketplace's own plugin and listing a clean `plugin.json` in `--json`"
  (289) `claude plugin validate`가 Anthropic marketplace의 자체 플러그인을 실패 처리하고 `--json` 출력에 깨끗한 `plugin.json`을 목록으로 나열하던 결함이 수정되었습니다. 결함 대상이 Anthropic marketplace의 자체 플러그인이고 이 저장소의 검증 대상에는 marketplace manifest가 없으므로 영향이 없습니다.
- CHANGELOG 원문: "Added `agent.spawn` for teammates, one agent id across plugin hook events, and idle and waiting states in `$.agent.list()`"
  (289) teammates용 `agent.spawn`, 플러그인 훅 이벤트 전반의 단일 agent id, `$.agent.list()`의 idle·waiting 상태가 추가되었습니다. R010은 서브에이전트의 다른 서브에이전트 스폰을 프로젝트 정책으로 금지하며, 이 항목은 플러그인 API 표면이므로 R010을 바꾸지 않습니다. R018은 `TeamCreate` 부재 시 dormant이며 이 항목은 그 판정을 바꾸지 않습니다. 이 항목의 "plugin hook events"는 플러그인·mod 훅 표면이고, R021의 `r007-r008-drift-advisor.sh`가 읽는 것은 프로젝트 `settings.json` 훅의 stdin(`agent_id`)이므로 두 표면은 서로 다릅니다. 다만 플러그인 훅 agent id 변경이 프로젝트 훅 stdin의 `agent_id`에 영향을 줄 가능성은 남습니다 [가설 — 두 표면의 연동 여부는 미실측].

기타 19건 — 이 저장소 비해당(mods·plugin 패널 UI 렌더링, 터미널 렌더링·제어 문자 처리, `ui.render` 훅, 플러그인 표시 행, VSCode 전용 롤백 등 harness 비영향 세부사항이며 이 저장소는 mods·plugin 패널 UI를 개발하지 않습니다). 실측: `gh release view v2.1.289 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 27건 중 위 본문 8건을 다뤘으므로 27 − 8 = 19건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 권한·Bash deny/ask, MCP, 플러그인·에이전트 항목은 기존 룰이 이미 다루는 전제를 강화하거나 이 저장소에 해당 구성(sandbox, `permissions.deny`, 조직 관리 MCP, `.claude-plugin/`)이 없는 항목이며 룰 문안 변경은 불필요합니다.
- 룰 변경 제안은 없습니다(CC 2.1.289 CHANGELOG 항목 기준; #1827·#1828 실측에 따른 룰 정정은 아래 두 노트에 기록).

### permission mode 실측 노트 (#1828)

- 실측(CC 2.1.289, 2026-10-06, `claude -p … --output-format stream-json --verbose --no-session-persistence`의 `system/init` `permissionMode`): `defaultMode` 우선순위는 local > project > user입니다. project의 `"default"`는 user의 `auto`/`bypassPermissions`를 덮고, 키가 없으면 user 값이 유지됩니다. project/local `bypassPermissions`는 무시되며(디버그 로그: `[WARN] settings defaultMode "bypassPermissions" ignored — only policy/user/flag settings may grant bypass mode`) 그 범위는 `default`로 귀결되어 user의 bypass가 아닌 값을 덮습니다: 격리 user=`acceptEdits` + project 또는 local=`bypassPermissions` → `default`(E8b/E8c), user∈{`plan`,`auto`,`acceptEdits`} + project·local=`bypassPermissions` → `default`(C4·C6·C7·C9). user=`bypassPermissions`이면 project·local=`bypassPermissions`여도 결과는 `bypassPermissions`였고 무시 WARN은 0줄이었습니다(C1~C3). 근거: 이슈 #1828 코멘트(E1~E8)와 정정 코멘트(C0~C9 원자료, https://github.com/baekenough/oh-my-customcode/issues/1828#issuecomment-5998595610). `[가설]`(미관측): 인터랙티브 TTY 세션, `default`에서 실제 프롬프트 여부, managed 정책·`--settings`, 다른 CC 버전, 서브에이전트 상속.
- 기존 설치본 안내(`bun -e` deepMerge 시뮬레이션으로 관측: `settings.json` deep merge는 사용자 측 값을 우선하고 `preserveFiles`도 적용되어, 이미 설치된 프로젝트의 `permissions.defaultMode: "default"`는 업데이트 후에도 남습니다): 값 확인은 `jq -r '.permissions.defaultMode // "unset"' .claude/settings.json`(프로젝트 루트에서)이며, 직접 설정한 값이 아니라면 해당 키를 삭제하면 user 범위 값이 유지됩니다(예: `jq 'del(.permissions.defaultMode)' .claude/settings.json > settings.json.new && mv settings.json.new .claude/settings.json`).
- 반영: R010 「Universal bypassPermissions」 단락과 Self-Check 1번, 배포 템플릿 `templates/.claude/settings.json`에서 `permissions.defaultMode: "default"`를 제거했습니다(키 부재 시 user 값 유지). `.claude/settings.json` 주석과 ARCHITECTURE 두 행도 같은 실측에 맞게 정정됐습니다.

### 이름 붙인 Agent 스폰 / 암묵적 팀 실측 노트 (#1827)

- 실측(CC 2.1.289, 2026-10-05~06, 오케스트레이터): Agent 도구 스키마의 `team_name`은 "Deprecated; ignored. The session has a single implicit team.", `name`은 "Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running."입니다. `name: "teams-probe"` 스폰 결과는 "Spawned successfully."로 시작하고 `agent_id: <name>@session-<id>`(내부 식별자는 자리표시자로 치환), `name: teams-probe`, "The agent is now running and will receive instructions via mailbox."를 담았으며, 이름 없는 스폰은 "Async agent launched successfully."였습니다.
- 이름 붙인 멤버(스폰 입력 `model: haiku`)가 보고한 직접 도구 14개: Agent, AskUserQuestion, Artifact, Bash, Edit, ListAgents, Read, ReportFindings, ScheduleWakeup, SendFeedback, Skill, ToolSearch, Workflow, Write. 직접 목록에 없던 것: SendMessage, TaskCreate, TaskList, TaskUpdate, TeamCreate, TeamDelete, SubagentHandback, Glob, Grep. 멤버는 호출자를 `teammate_id="team-lead"`로 관측했고, 지연 도구 목록은 관측되지 않았습니다. 비교: frontmatter `tools:`가 명시된 `qa-writer`(이름 없이 스폰)의 런타임 도구는 Read, Write, Edit, Grep, Glob였습니다.
- `SendMessage({to: "teams-probe"})` 결과: `{"success":true,"message":"Message sent to teams-probe's inbox", … "routing":{"sender":"team-lead","target":"@teams-probe", …}}`. `ListAgents`는 "Subagents (2): …"와 `Teammates (1): teams-probe [<ref>] · general-purpose · pane · started 4m ago`(`<ref>`는 내부 ref 자리표시자)를 구분해 표시했습니다. 멤버의 첫 보고는 `<teammate-message teammate_id="teams-probe" color="blue">` 안의 `idle_notification` 형태로 메인 대화에 도착했습니다.
- 후속 실측: 멤버가 `ToolSearch`를 query "select:SendMessage"로 1회 호출하자 SendMessage 스키마가 반환됐습니다. 이어 `SendMessage({to: "team-lead", message: "probe-ok: SendMessage loaded via ToolSearch"})`가 반환한 원문은 `{"success": true, "message": "Message sent to team-lead's inbox", … "routing": {"sender": "teams-probe", "senderColor": "blue", "target": "@team-lead", "summary": "probe ok", "content": "probe-ok: SendMessage loaded via ToolSearch"}}`였고, 메인 대화는 `<teammate-message teammate_id="teams-probe" color="blue" summary="probe ok">probe-ok: SendMessage loaded via ToolSearch</teammate-message>`로 받았습니다. 즉 SendMessage는 직접 목록에 없어도 지연 로드할 수 있습니다.
- `[가설]`(미관측): 멤버→다른 멤버 피어 메시징, 메시지의 메인 대화 전달 시점(관측된 것은 발신 15:26:05Z 메시지가 메인 대화의 다음 턴 경계에서 표시됐다는 사실뿐이며 원인은 미확정).
- Task·Team 도구 실측(모델별 각 1건): haiku 팀원(스폰 입력 `model: haiku`)이 `ToolSearch`를 "select:TaskCreate,TaskList,TaskUpdate,TaskGet,TeamCreate,TeamDelete"로 호출하자 TaskCreate, TaskList, TaskUpdate, TaskGet은 반환됐고 TeamCreate, TeamDelete는 반환되지 않았습니다. sonnet 팀원(자기 보고 "You are powered by the model named Sonnet 5.5. The exact model ID is claude-sonnet-5-5.")이 "select:TaskCreate,TaskList,TaskUpdate,TaskGet,TeamCreate,TeamDelete,SendMessage"로 호출하자 SendMessage 1개만 반환되고 나머지 6개는 반환되지 않았으며, 이어 `SendMessage({to:"team-lead"})`가 "Message sent to team-lead's inbox"를 반환했습니다. 메인 세션(`claude-opus-5-5`)의 같은 Task·Team 질의는 "No matching deferred tools found."였습니다. 판정: Task 도구 가용성은 역할이 아니라 모델을 따르며, CHANGELOG 2.1.233이 Task 도구를 제거한 "Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer models"와 일치합니다(R002 DETAIL 인용). `SendMessage`는 두 모델(haiku, sonnet-5-5) 팀원 각 1건이 로드했습니다(다른 모델은 `[가설]`). Team 도구는 측정한 셋 모두 불가입니다. `[가설]`(미관측): 팀원의 TaskList가 팀원끼리 공유되는지, opus 팀원의 도구 구성, 인터랙티브 세션.
- 반영: R018 Detection은 `TeamCreate` 존재 기준을 유지합니다 — 오케스트레이터는 lifecycle 시작 도구 `TeamCreate`를 쓸 수 없으므로 Detection = No(dormant)입니다(R018은 Task 도구가 없어도 「Task 도구 부재 시 대체 규약」으로 의무를 유지하므로 공유 작업 목록은 판정 기준이 아닙니다). R010 「Agent Teams (required when enabled)」 문장도 같은 실측에 맞게 정정됐습니다. Detection 표의 "no member spawnable", Scope의 "`TeamCreate` 필요", 「멤버 도구 부재 시 대체 규약」(Detection = No 한정·`ToolSearch` 로드)·「Member TaskUpdate Discipline」 문장을 실측에 맞게 정정했고, R002 Tier 5의 `SendMessage` 문구와 Todo/Task 표 주석을 보강했습니다.

---

## v2.1.290 (2026-10-05)

> Issue: #1845 — Claude Code v2.1.290 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 2.1.291~2.1.296 절에서 "2.1.290"과 "Revert"를 검색한 결과, 이 릴리즈 항목을 되돌리는 문장 1건과 이 릴리즈가 들여온 회귀를 고친 문장 1건이 관측됐습니다. 2.1.293 절: "Reverted the 2.1.290 fix for cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is no longer told, and the session stays asleep" — 아래 클라우드 세션 항목에 반영했습니다. 2.1.291 절: "Fixed a regression in 2.1.290 where cloud sessions could drop answers to permission prompts" — 2.1.290이 들여온 클라우드 세션 회귀를 고친 수정이며, 이 릴리즈 항목을 되돌리거나 좁히는 문장은 아닙니다. 이 저장소가 클라우드 세션을 쓰는지는 관측하지 않았습니다(2.1.291 절과 같은 [가설]). 2.1.293 절의 다른 "Reverted" 항목은 2.1.281 변경에 대한 것이며 이 릴리즈와 무관합니다. 2.1.295 절의 "Fixed a background session's `/loop` stopping without notice when its next wakeup came due while the session's process was down; the session now says so and Claude is told"와 "Fixed a stopped scheduled task coming back on resume after a rewind, and a scheduled task being lost on resume after Esc or a rewind following a compaction"은 같은 `/loop`·예약 작업 영역의 후속 수정이며(뒤 문장은 아래 compaction 뒤 예약 작업 복귀 항목의 후속), 둘 다 롤백이 아닙니다. 릴리즈 게시 시각은 2026-10-05T23:33:17Z입니다(`gh release view v2.1.290 -R anthropics/claude-code --json publishedAt`).

### 에이전트 · teammate · worktree

- CHANGELOG 원문: "Changed an in-process teammate's `agent_id` in Agent results to its agent ID (its `name@team` address stays in `teammate_id`); TeammateIdle hooks no longer fire from its subagents or forks"
  (290) 인프로세스 teammate의 Agent 반환 결과에서 `agent_id`는 agent ID가 되고 `name@team` 주소는 `teammate_id`에 남으며, 그 teammate의 서브에이전트나 fork에서는 TeammateIdle 훅이 더 이상 발화하지 않습니다. 관측한 범위에서 `.claude/settings.json:355`의 TeammateIdle 훅은 stdin에서 `.teammate_id`를 읽으므로(`.claude/settings.json:360`) 주소 필드가 유지되는 한 읽는 필드는 그대로입니다. 이 변경은 Agent 반환 결과에 대한 서술이며 훅 stdin의 필드 변경이라는 근거는 원문에 없습니다 [가설 — 훅 stdin의 `teammate_id` 값 형식 불변 여부는 실제 teammate 세션 미실측]. R018은 `TeamCreate` 부재로 dormant이므로(`.claude/rules/MUST-agent-teams.md:22`, `:36`) 정책 변경은 없습니다.
- CHANGELOG 원문: "Fixed background subagents losing write and Bash access in their worktree after the main session enters or exits a different worktree"
  (290) 메인 세션이 다른 worktree에 들어가거나 나온 뒤 백그라운드 서브에이전트가 자기 worktree의 write·Bash 접근을 잃던 결함이 수정되었습니다. 관측한 범위(`git grep -n '^isolation:' -- '.claude/agents/*.md'`)에서 에이전트 frontmatter의 `isolation:` 값은 `sec-codeql-expert`의 `sandbox`(`.claude/agents/sec-codeql-expert.md:8`) 1건이며 `isolation: worktree` 에이전트는 없습니다. frontmatter 밖의 worktree 경로, 즉 메인 세션이 `EnterWorktree`를 쓰는 `omcustom-auto-improve`(`.claude/skills/omcustom-auto-improve/SKILL.md:59`)와 호출 단위 `isolation: "worktree"` 위임(R009 `.claude/rules/MUST-parallel-execution.md:208`의 v2.1.273 노트)은 이번에 실행 검증하지 않았습니다. 따라서 그 경로의 백그라운드 서브에이전트에 대한 영향은 [가설 — 메인 세션의 worktree 전환과 백그라운드 서브에이전트 실행이 겹치는지로 판정]입니다. 이 수정은 플랫폼의 접근 복원이며 프로젝트의 도구 허용 범위를 넓히는 근거가 아닙니다.
- CHANGELOG 원문: "Fixed resumed subagents and teammates losing their earlier thinking and prompt cache after receiving a message mid-run"
  (290) 재개된 서브에이전트와 teammate가 실행 중 메시지를 받은 뒤 이전 thinking과 prompt cache를 잃던 결함이 수정되었습니다. 원문의 발생 조건은 "after receiving a message mid-run"(실행 중 메시지 수신)입니다. 멈춘 위임을 `SendMessage`로 재개하는 R020 절차(`.claude/rules/MUST-completion-verification.md:120`)가 이 조건에 해당하는지는 [가설 — 재개 메시지가 원문의 실행 중 수신으로 처리되는지 미실측]이며, 효과 크기도 [가설 — 재개 전후 prompt_cache 필드를 R012 상태줄로 실측하면 판정]입니다.
- CHANGELOG 원문: "Fixed background agents failing with "Agent stalled" and Workflow tool subagents restarting from their prompt when a Mac woke from sleep"
  (290) Mac이 절전에서 깨어날 때 백그라운드 에이전트가 "Agent stalled"로 실패하고 Workflow 도구의 서브에이전트가 프롬프트부터 다시 시작되던 결함이 수정되었습니다. 원문의 조건은 Mac이 절전에서 깨어날 때이므로, Mac에서 돌린 `/fsd` 장기 루프의 절전 후 중단을 진단할 때 이 축을 확인 대상에 포함합니다(개발 기기의 OS는 기기별 사항이라 저장소 사실로 단정하지 않습니다). R018의 정체 멤버 재할당 규칙(`.claude/rules/MUST-agent-teams.md:349`의 "Reassign (>2min)", `:568`의 "~2분간 진행이 없으면") 문안은 바뀌지 않습니다.

### 예약 작업 · 백그라운드 세션 (/loop)

- CHANGELOG 원문: "Fixed scheduled tasks (`/loop` with an interval, reminders) silently not coming back on resume once the conversation was compacted; covers compactions made from this version on"
  (290) 대화가 compact된 뒤 resume하면 `/loop` 간격 작업과 reminder가 조용히 돌아오지 않던 결함이 수정되었으며, 적용 범위는 이 버전부터 수행한 compaction입니다. 과거에 compact된 세션까지 복구된다고 확장하지 않습니다. 원문의 대상은 간격을 둔 `/loop`와 reminder이며, `/fsd`의 `/loop`는 간격 없이 모델이 주기를 정하는 self-paced 루프입니다(`.claude/skills/fsd/SKILL.md:16`, `:39` "self-paced loop (model decides cadence)"; `:162`는 스킬 호출이 필수가 아니라고 명시). CHANGELOG는 self-paced 루프를 따로 부르기도 하므로(2.1.295 "a self-paced `/loop`") 이 수정이 `/fsd`의 루프에도 적용되는지는 [가설 — self-paced `/loop` 세션을 compact한 뒤 resume해 루프가 돌아오는지 실측하면 판정]입니다.
- CHANGELOG 원문: "Fixed scheduled tasks set in the foreground never firing after a ← or `/background` hand-off, and recurring ones firing an extra run on every resume, respawn or fork"
  (290) foreground에서 설정한 예약 작업이 ← 또는 `/background` hand-off 뒤 발화하지 않던 결함과, 반복 작업이 resume·respawn·fork마다 추가로 한 번 더 실행되던 결함이 수정되었습니다. 관측한 범위(`git show HEAD:.claude/settings.json | command grep -n -i -E 'schedul|cron|wakeup|loop|timer|interval|routine'` 5줄)에서 `.claude/settings.json`에 예약 작업 설정은 보이지 않았습니다. 일치한 5줄은 `statusLine.refreshInterval`, 훅 `description` 3개(수동 compaction 제안, 서브에이전트 완료 시 자동 이어가기, 반복 실패 루프 감지), `skillOverrides`의 `templates:omcustom-loop`이며, 이 핵심어를 쓰지 않는 키는 이 검색으로 판정하지 않았습니다. 관측한 범위(`git grep -n -E 'CronCreate|ScheduleWakeup|/schedule' -- '.claude/skills/*/SKILL.md'`와 `/fsd`의 `/loop` 줄)에서 플랫폼 예약 기능을 언급하는 스킬 경로는 두 가지입니다. 하나는 `/fsd`의 선택적 `/loop`·ScheduleWakeup 호출(`.claude/skills/fsd/SKILL.md:16`, `:162`)이고, 다른 하나는 `claude-native` 스킬의 예약 실행 안내(`.claude/skills/claude-native/SKILL.md:232` "### Scheduled (CronCreate)", `:237`의 `/schedule "daily at 9am: /claude-native"`, `:240` "Or via CronCreate MCP tool for programmatic scheduling.")입니다. `/schedule`은 `.claude/skills/claude-native/SKILL.md:234`("Can be set up as a scheduled remote agent using `/schedule`")가 말하는 scheduled remote agent를 만드는 경로이고, 2026-10-13 Claude Code 2.1.296 세션의 스킬 목록에서 `schedule` 스킬 설명도 이를 "scheduled cloud agents (routines)"로 소개합니다. 따라서 이 항목의 세션 예약 작업과 다를 수 있습니다 [가설 — `/schedule` routine이 세션 예약 작업 경로를 거치는지는 미관측]. `:240`의 CronCreate 경로는 `/schedule`과 별개로 CronCreate MCP 도구(`:240`의 "CronCreate MCP tool" 표기)로 예약을 만드는 안내이며, 이것이 이 항목의 세션 예약 작업에 해당하는지도 [가설 — 미관측]입니다. 두 스킬 경로의 실제 사용도 관측하지 않았습니다. `omcustom-loop`는 예약 기능을 언급하지 않습니다(`command grep -c -E '/loop|ScheduleWakeup|CronCreate' .claude/skills/omcustom-loop/SKILL.md` 결과 0). 이 스킬은 SubagentStop command 훅이 결과 기록·연속 완료 집계·advisory만 수행하고 오케스트레이터 워크플로를 이어가지 않는다고 설명하며(`.claude/skills/omcustom-loop/SKILL.md:3` "no orchestrator-workflow continuation"), 현재 배선은 v2.1.294 절에 정리했습니다. 따라서 프로젝트 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed `/loop` and other recurring session-only scheduled tasks running an extra time after a sandboxed Bash command on Linux or after `.claude/scheduled_tasks.json` was deleted"
  (290) Linux의 sandboxed Bash 명령 뒤, 또는 `.claude/scheduled_tasks.json`이 삭제된 뒤 `/loop` 등 세션 한정 반복 작업이 한 번 더 실행되던 결함이 수정되었습니다. 첫 조건에 대해서는 관측한 범위에서 `.claude/settings.json`에 `sandbox` 키가 없으므로(`jq 'has("sandbox")'`=false) 이 저장소의 추적 설정에서는 직접 영향 조건이 관측되지 않았습니다. Linux 기기 여부와 user·local·managed scope의 sandbox 설정은 기기별 사항이라 판정하지 않았습니다. 둘째 조건인 `.claude/scheduled_tasks.json` 삭제에 대해서는, 이 파일이 현재 없고(`ls` 결과 "No such file or directory") gitignore 대상이며(`git check-ignore -v .claude/scheduled_tasks.json` → `.gitignore:40:.claude/*`), 이 가이드·미러를 제외한 추적 파일 중 이 파일 이름을 언급하는 곳은 R009 v2.1.273 노트(`.claude/rules/MUST-parallel-execution.md:208`, `:197`에서 열린 HTML 주석 안)와 그 `templates/` 미러·위키 사본이어서(`git grep -n scheduled_tasks`), 파일 이름 검색 범위에서는 이 파일을 직접 지우는 경로가 관측되지 않았습니다. 다만 디렉터리 단위 경로는 이 파일을 원래 위치에서 없앨 수 있습니다. 기존 설치에서 `omcustom init`은 `install({ backup: exists })`를 호출하고(`src/cli/init.ts:205`), 백업 단계가 `.claude/`를 `.claude-backup-` 접두의 타임스탬프 폴더로 `rename`하며(`src/core/installer.ts:197`, `:933`, `:919`~`:925`; `src/core/layout.ts:28`, `:32`), 복원 대상 기본값은 `settings.json`·`settings.local.json`과 `agent-memory`·`agent-memory-local`입니다(`src/core/file-preservation.ts:25`, `:30`). 즉 이 경로는 `scheduled_tasks.json`을 지우지 않고 백업 폴더로 옮기며(복원 대상 기본값에 없음), 이 이동이 원문의 "was deleted" 조건에 해당하는지는 원문이 밝히지 않습니다 [가설 — `omcustom init` 백업 이동 뒤 세션 한정 반복 작업이 한 번 더 실행되는지로 판정]. R001이 승인을 요구하는 `git clean -fdx`는 gitignore 대상인 이 파일을 실제로 지웁니다. 둘째 조건에 관해서는 어느 경로든 세션 한정 반복 작업이 있는 세션에서 이 파일이 사라질 때 관련되고, 첫 조건(Linux의 sandboxed Bash 명령 뒤)은 위에서 판정한 범위를 따릅니다. 두 조건에 대한 수정 모두 플랫폼 수정이므로 룰 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Changed background sessions waiting on a scheduled wakeup (`/loop`): they are now left running through updates and low memory, where being restarted or shut down could silently lose the wakeup"
  (290) `/loop` 예약 wakeup을 기다리는 백그라운드 세션은 업데이트와 메모리 부족 상황에서도 재시작·종료되지 않고 유지되므로, 이전에 wakeup이 조용히 사라질 수 있던 경로가 줄어듭니다. R013의 메모리 압박 노트(v2.1.238/274)와 관련된 영역이지만 그 임계값 계산을 바꾸지 않습니다.
- CHANGELOG 원문: "Fixed sessions moved to the background while idle reopening as "no saved transcript" after a restart or idle cleanup; they now resume their conversation"
  (290) idle 상태에서 백그라운드로 옮겨진 세션이 재시작이나 idle cleanup 뒤 "no saved transcript"로 열리던 결함이 수정되어 이제 대화를 재개합니다. 이 저장소의 재개 절차(R011 세션 메모리)는 바뀌지 않으며, 실제 재개 동작은 이번 정적 검토에서 실행 검증하지 않았습니다.
- CHANGELOG 원문: "Fixed cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is now told and can schedule it again"
  (290) 클라우드 세션에서 컨테이너 재시작으로 `/loop` wakeup이나 예약 작업이 사라진 뒤 세션이 계속 잠든 채로 남던 결함에 대한 수정입니다. 단, 2.1.293 절의 "Reverted the 2.1.290 fix for cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is no longer told, and the session stays asleep"가 이 수정을 되돌렸으므로 현재 최신 버전(2.1.296)에서는 이 항목이 유효하지 않습니다. 이 저장소가 클라우드 세션을 쓰는지는 관측되지 않았습니다. 관측한 범위(`git grep -n -E 'container restart|staying asleep' -- .claude/rules guides CLAUDE.md`, 이 가이드·미러 제외)에서 이 수정에 기대는 룰·가이드 문장은 찾지 못했습니다(유일한 일치인 `.claude/rules/MUST-completion-verification.md:567`은 2.1.275의 권한 프롬프트 항목입니다).

### 훅 · 플러그인

- CHANGELOG 원문: "Fixed Claude replying in an endless loop when a plugin's async Stop hook passes an unquoted script path under a folder with a space, such as Application Support"
  (290) 플러그인의 async Stop 훅이 공백이 든 폴더(예: Application Support) 아래의 인용되지 않은 스크립트 경로를 넘길 때 Claude가 무한 루프로 응답하던 결함이 수정되었습니다. 이 결함은 플러그인 훅에 관한 것이며, 이 저장소는 플러그인 매니페스트(`.claude-plugin/`)를 두지 않아(`git ls-files` 0건, `find -maxdepth 4 -name .claude-plugin` 0건) 플러그인 훅을 배포하지 않습니다. 참고로 프로젝트 `.claude/settings.json`의 훅 핸들러 64개(`command` 63·`prompt` 1) 중 `async: true`는 0건이며, `bash `로 시작하는 훅 명령 44개는 전부 `bash "${CLAUDE_PROJECT_DIR:-.}/..."` 형태로 경로를 따옴표로 감쌉니다(`jq '[.hooks[][]?.hooks[]? | select(.async==true)] | length' .claude/settings.json`=0, 같은 jq에서 `.command`가 `bash "${CLAUDE_PROJECT_DIR:-.}/`로 시작하는 항목 수=44; 같은 형태의 `statusLine` 명령은 훅이 아니므로 제외). 사용자가 설치한 플러그인의 훅은 저장소에서 관측할 수 없습니다.
- CHANGELOG 원문: "Fixed some permission rules and safety checks not being applied to a tool call after a PreToolUse hook rewrote its input"
  (290) PreToolUse 훅이 도구 호출의 입력을 다시 쓴 뒤 일부 권한 규칙과 안전 검사가 그 호출에 적용되지 않던 결함이 수정되었습니다. 관측한 범위에서 `updatedInput`·`permissionDecision`은 `.claude/hooks`와 `.claude/settings.json`의 인라인 훅 어디에도 없으므로(`git grep -n -E 'updatedInput|permissionDecision' -- .claude/hooks` 0건, `command grep -c -E 'updatedInput|permissionDecision' .claude/settings.json` 0) 이 저장소 훅은 입력을 다시 쓰지 않으며 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed sandboxed Bash commands on Linux running `ConfigChange` hooks and reloading settings mid-command when `.claude/settings.json` or `.claude/settings.local.json` does not exist"
  (290) `.claude/settings.json` 또는 `.claude/settings.local.json`이 없을 때 Linux의 sandboxed Bash 명령이 명령 도중 `ConfigChange` 훅을 실행하고 설정을 다시 읽던 결함이 수정되었습니다. 관측한 범위에서 `.claude/settings.json`에 `ConfigChange` 훅이 없고(`jq '.hooks|has("ConfigChange")'`=false) 두 설정 파일이 모두 존재하며(`ls`) `sandbox` 키도 없어(`jq 'has("sandbox")'`=false) 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Added `agentId` to the `tool.check` event of plugin hooks, so a hook can tell a subagent's permission check from the main session's"
  (290) 플러그인 훅의 `tool.check` 이벤트에 `agentId`가 추가되어, 훅이 서브에이전트의 권한 검사와 메인 세션의 검사를 구분할 수 있습니다. 이 항목은 플러그인(mod) 훅 표면이며, `r007-r008-drift-advisor.sh`가 읽는 것은 프로젝트 `settings.json` 훅 stdin의 `agent_id`입니다(`.claude/hooks/scripts/r007-r008-drift-advisor.sh:152`). 두 표면은 서로 다르므로 이 스크립트의 payload 계약을 바꾸지 않으며 코드 변경은 제안하지 않습니다.

### 권한 · Bash · 설정

- CHANGELOG 원문: "Fixed Bash permission checks auto-approving some read-only commands (such as `rg` or `git grep`) whose arguments the shell would still expand as wildcards; these now prompt for approval"
  (290) 셸이 인자를 여전히 와일드카드로 확장하는 일부 읽기 전용 명령(예: `rg`, `git grep`)을 Bash 권한 검사가 자동 승인하던 결함이 수정되어 이제 승인을 묻습니다. R005·R002가 전수조사 표준으로 지정한 `git grep`(`.claude/rules/MAY-optimization.md:87`)과 직접 관련됩니다. 다만 `.claude/settings.json`의 allow 규칙에 `Bash(git:*)`가 있어 규칙 일치로 허용될 가능성이 있으나, 규칙 일치와 읽기 전용 자동 승인 분류의 우선 관계는 관측되지 않았습니다 [가설 — 와일드카드 인자를 가진 `git grep` 실행 시 프롬프트 여부를 실측하면 판정]. 와일드카드 인자 사용 시 승인 프롬프트가 늘 수 있으며, 무인 실행의 유효 permission mode 확인(R010 Self-Check)은 그대로 필요합니다.
- CHANGELOG 원문: "Fixed Bash permission checks auto-approving certain commands whose variable names zsh reads differently from bash; these now prompt for approval"
  (290) zsh가 bash와 다르게 해석하는 변수 이름을 가진 일부 명령을 Bash 권한 검사가 자동 승인하던 결함이 수정되어 이제 승인을 묻습니다. 이 저장소의 셸은 zsh이며 R005가 zsh 변수 분할 차이를 다루지만(`.claude/rules/MAY-optimization.md:43`), 이 수정은 그 문장의 내용을 바꾸지 않습니다.
- CHANGELOG 원문: "Changed `CLAUDE_CODE_DISABLE_ATTACHMENTS` so a repository's `.claude/settings.json` or `.claude/settings.local.json` can no longer set it; shell, user and managed settings still can"
  (290) 저장소의 `.claude/settings.json`·`.claude/settings.local.json`은 더 이상 `CLAUDE_CODE_DISABLE_ATTACHMENTS`를 설정할 수 없고 셸·사용자·managed 설정은 계속 설정할 수 있습니다. 관측한 범위에서 이 가이드와 미러를 제외한 추적 파일 전체에서 이 키는 0건이고(`git grep -n CLAUDE_CODE_DISABLE_ATTACHMENTS -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`), gitignore 대상인 `.claude/settings.local.json`도 `command grep -c` 결과 0건이므로 영향이 없습니다.
- CHANGELOG 원문: "Fixed automatic compaction giving up with "Prompt is too long" when a Mac went to sleep while it was running"
  (290) Mac이 절전 상태가 되었을 때 자동 compaction이 "Prompt is too long"으로 포기하던 결함이 수정되었습니다. R013의 v2.1.269/273 노트(같은 오류 계열의 compaction 정지 결함)와 같은 방향의 수정이며 R013 임계값은 바뀌지 않습니다.

### 스킬 · MCP · 도구

- CHANGELOG 원문: "Fixed skills not being found when asked for by the name in SKILL.md when their folder has a different name (for example a non-English name): the skill listing now shows both names"
  (290) 폴더 이름이 SKILL.md의 `name`과 다를 때(예: 비영어 이름) `name`으로 요청한 스킬을 찾지 못하던 결함이 수정되었고, 스킬 목록은 이제 두 이름을 함께 표시합니다. 관측한 범위(python3로 `.claude/skills/*/SKILL.md`의 `name:`과 폴더 이름을 비교)에서 114개 중 22개의 `name`이 폴더 이름과 다릅니다. 그중 20개는 `name: omcustom:<폴더명>` 형태이고(예: `.claude/skills/create-agent/SKILL.md:2`, `.claude/skills/fsd/SKILL.md:2`), 2개는 폴더 이름의 `omcustom-` 접두를 `omcustom:`로 바꾼 형태입니다(`omcustom-auto-improve` → `omcustom:auto-improve`, `omcustom-web` → `omcustom:web`). 따라서 이 저장소에 직접 해당하는 수정입니다. 목록 표시가 바뀌므로 `/skill-doctor`나 스킬 목록 출력을 문서화한 곳이 있다면 두 이름 표시를 반영해야 하지만, 그런 문서는 이번에 조사하지 않았습니다 [가설 — `git grep`으로 스킬 목록 출력 인용 문서를 찾으면 판정].
- CHANGELOG 원문: "Changed skills and custom commands to refuse a `!` shell command that contains raw control characters other than tab and newline, with a message that shows where they are"
  (290) 스킬과 커스텀 커맨드는 탭과 개행을 제외한 raw 제어 문자가 든 `!` 셸 명령을 거부하며, 거부 메시지에 위치를 표시합니다. 관측한 범위(``git grep -n -E '^!|!`' -- '.claude/skills/*/SKILL.md'``)의 일치는 `.claude/skills/omcustom-release-notes/SKILL.md:164`의 "`!` breaking marker" 설명 1건이며 `!` 셸 명령이 아니므로, 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed `disableClaudeAiConnectors` and `allowedMcpServers` URL rules not being applied to some MCP entries declared in `.mcp.json`, plugins or agents"
  (290) `disableClaudeAiConnectors`와 `allowedMcpServers` URL 규칙이 `.mcp.json`·플러그인·에이전트에 선언된 일부 MCP 항목에 적용되지 않던 결함이 수정되었습니다. 관측한 범위에서 `.mcp.json`에는 `eraser`, `ontology-rag` 2개 서버가 있고(jq 키 목록), `.claude/settings.json`·룰·로컬 설정에 `allowedMcpServers`·`disableClaudeAiConnectors`가 없으므로(`git grep -n -E 'allowedMcpServers|disableClaudeAiConnectors' -- .claude/settings.json .claude/rules` 0건, `.claude/settings.local.json`은 `command grep -c` 0) 저장소 설정 범위에서는 규칙이 걸려 있지 않아 영향 조건이 관측되지 않았습니다. 조직 managed 설정 유무는 저장소에서 관측할 수 없습니다.
- CHANGELOG 원문: "Fixed WebFetch silently dropping page text past 100,000 characters; it now says how much was unread and takes an `offset` to read on"
  (290) WebFetch가 100,000자를 넘는 페이지 텍스트를 조용히 버리던 결함이 수정되어, 이제 읽지 못한 분량을 알리고 이어 읽을 `offset`을 받습니다. R005가 HTTP 조회에 `WebFetch`를 우선하도록 하므로(`.claude/rules/MAY-optimization.md:31`) 긴 페이지를 다룰 때 truncation이 보이게 된다는 점이 관련됩니다. 룰 문안 변경은 필요하지 않습니다.

기타 168건 — 이 저장소 비해당이거나 룰 변경이 필요 없는 세부 항목(Claude apps gateway, `/ultrareview`, agents view UI, mods 렌더링·pane 표시, VSCode·Cloud sessions·Claude Tag·Code Review·Remote Control 전용 항목, Windows 전용 수정, 터미널·키 입력 UI, plugin/mod 개발 API 세부, 보안 하드닝 세부, plan mode 세부(`--continue`·`--resume <session-id>` 재개 시 복원, 클라우드 컨테이너 재시작 시 계획 유실, connector 도구 승인), Bash 도구 세부(읽기 전용 명령의 권한 판정, changed-files 보기, `pyright`·`ps` 승인) 등). 이 중 "Fixed the Bash tool occasionally losing shell aliases, functions and plugin PATH entries for a whole session when its first command ran seconds after startup on a new config directory"는 이 저장소 Bash의 `grep`이 셸 함수라는 R005 문장(`.claude/rules/MAY-optimization.md:87`)과 관련되지만, 플랫폼 수정이므로 룰 변경 사안이 아닙니다. 실측: `gh release view v2.1.290 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 190건 중 위 본문 22건을 다뤘으므로 190 − 22 = 168건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 훅·권한·스킬·MCP 항목은 이 저장소의 관측 구성(`async` 훅 0건, `updatedInput` 출력 훅 0건, `ConfigChange` 훅 0건, `sandbox` 키 없음, `allowedMcpServers` 0건)에서 영향 조건이 관측되지 않거나 플랫폼 결함 수정이어서 룰·훅·에이전트 변경이 필요하지 않습니다.
- 스킬 `name`과 폴더 이름 불일치(114개 중 22개)는 이번 수정의 직접 수혜 대상이며, 후속으로 스킬 목록 출력을 인용한 문서의 두 이름 표시 반영 여부만 확인하면 됩니다.
- 룰 변경 제안은 없습니다(CC 2.1.290 CHANGELOG 항목 기준).

---

## v2.1.291 (2026-10-06)

> Issue: #1844 — Claude Code v2.1.291 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 2.1.293~2.1.296 CHANGELOG 절에서 `2.1.291` 문자열과 "Revert"를 검색한 결과, 이 릴리즈의 두 항목을 되돌리거나 좁히는 문장은 관측되지 않았습니다. 2.1.293 절의 롤백 문장 2건은 각각 2.1.281의 auto mode 거부 메시지 변경과 2.1.290의 클라우드 세션 wakeup 수정을 대상으로 하며(293 절 "Reverted the 2.1.290 fix for cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is no longer told, and the session stays asleep"), 이 릴리즈의 권한 프롬프트 답변 누락 수정과는 다른 항목입니다. 릴리즈 게시 시각은 2026-10-06T03:55:19Z입니다(`gh release view v2.1.291 -R anthropics/claude-code --json publishedAt`).

### 세션 · 권한 프롬프트

- CHANGELOG 원문: "Fixed a regression in 2.1.290 where cloud sessions could drop answers to permission prompts"
  (291) 2.1.290에서 생긴 회귀로, 클라우드 세션이 권한 프롬프트에 대한 답변을 누락할 수 있던 결함이 수정되었습니다. 이 저장소의 `.claude/settings.json`은 `permissions.allow` 17개(`jq '.permissions.allow|length'`)와 `permissions.defaultMode: "bypassPermissions"`(`.claude/settings.json:23`)를 두지만, 바로 위 `:22`의 `_comment_defaultMode`가 "Do NOT rely on this key for unattended runs."라고 적고 있고 R010은 2.1.257부터 project·local scope의 `bypassPermissions`가 무시된다고 기록합니다(`.claude/rules/MUST-orchestrator-coordination.md:588`). R010은 또한 서브에이전트가 부모 세션의 권한 모드를 상속하되 에이전트 정의 frontmatter가 이를 덮어쓸 수 있다고 기록합니다(`.claude/rules/MUST-orchestrator-coordination.md:586`이 인용한 Agent 도구 스키마 "agent-definition frontmatter may override it"). 이 저장소의 에이전트 파일 50개 중 49개가 `permissionMode: bypassPermissions`를 두며(`git grep -h '^permissionMode:' -- '.claude/agents/*.md' | sort | uniq -c`), `agora-runner.md`에는 이 줄이 없습니다(`git grep -L '^permissionMode:' -- '.claude/agents/*.md'`, `souls/` 하위 파일 제외). 다만 이 저장소가 클라우드 세션을 쓰는지는 관측하지 못했으며 이 수정은 클라우드 세션 한정이므로 영향 여부는 [가설 — 클라우드 세션 사용 여부 미관측]입니다. 권한 모드 규칙(R010·R002)의 문안은 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed a regression in 2.1.288 where the last messages of a session could be lost when quitting"
  (291) 2.1.288에서 생긴 회귀로, 세션을 종료할 때 마지막 메시지가 유실될 수 있던 결함이 수정되었습니다. R020은 위반 횟수를 기억이 아니라 트랜스크립트 파싱으로 집계하도록 요구하므로(`.claude/rules/MUST-completion-verification.md:384`, `:389`), 2.1.288~2.1.290 구간에서 종료된 세션의 트랜스크립트는 마지막 메시지가 빠져 있을 수 있었습니다 [가설 — 실제 유실 여부는 해당 세션 트랜스크립트로 실측해야 합니다]. 이 수정은 이후 세션에만 적용되며 이미 유실된 메시지를 복구한다는 근거는 CHANGELOG에 없습니다.

기타 0건 — 이 저장소 비해당 항목은 없습니다. 실측: `gh release view v2.1.291 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 2건 중 위 본문 2건을 다뤘으므로 2 − 2 = 0건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 룰·CLAUDE.md·에이전트·훅 변경은 불필요합니다. 두 항목 모두 플랫폼 회귀 수정이며 이 저장소의 규범 문안을 바꾸지 않습니다.
- 룰 변경 제안은 없습니다.

---

## v2.1.292 (2026-10-06)

> Issue: #1847 — Claude Code v2.1.292 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 2.1.293~2.1.296 CHANGELOG 절에서 `2.1.292` 문자열과 "Revert"를 검색한 결과, 이 릴리즈의 항목을 직접 되돌리는 문장은 관측되지 않았습니다. 2.1.293 절의 롤백 문장 2건은 2.1.281의 auto mode 거부 메시지 변경과 2.1.290의 클라우드 세션 wakeup 수정을 대상으로 합니다(293 절 "Reverted the 2.1.290 fix for cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is no longer told, and the session stays asleep"). 이 문장은 아래 background `/loop` 항목과 같은 영역이지만 대상이 클라우드 컨테이너 재시작이므로 별개 항목으로 판단합니다 [가설 — 두 수정의 코드 경로가 같은지는 미관측]. 후속 보완으로는 295 절 "Fixed a background session's `/loop` stopping without notice when its next wakeup came due while the session's process was down; the session now says so and Claude is told"가 있으며 롤백은 아닙니다. 릴리즈 게시 시각은 2026-10-06T18:59:30Z입니다(`gh release view v2.1.292 -R anthropics/claude-code --json publishedAt`).

### Agent · 서브에이전트

- CHANGELOG 원문: "Added an `effort` parameter to the Agent tool, so Claude runs a sub-agent at the effort level you ask for"
  (292) Agent 도구에 `effort` 파라미터가 추가되어, Claude가 사용자가 요청한 effort 수준으로 서브에이전트를 실행합니다. R009 「Agent Tool Requirements」 목록은 Agent 호출 파라미터로 `subagent_type`과 `model`을 열거하고(`.claude/rules/MUST-parallel-execution.md:278`, `:279`), 다른 룰은 `mode`(R006 `.claude/rules/MUST-agent-design.md:67`(보이는 예시 줄)·`:470`(`:464`에서 열린 HTML DETAIL 주석 안), R010 `.claude/rules/MUST-orchestrator-coordination.md:588`·`:630`)와 `description`의 `[N]` 접두사(R008 `.claude/rules/MUST-tool-identification.md:101`)를 요구합니다. 이 7개 줄 어디에도 `effort`는 나오지 않으며(`for spec in MUST-parallel-execution.md:278 MUST-parallel-execution.md:279 MUST-agent-design.md:67 MUST-agent-design.md:470 MUST-orchestrator-coordination.md:588 MUST-orchestrator-coordination.md:630 MUST-tool-identification.md:101; do f=${spec%%:*}; n=${spec##*:}; git show HEAD:.claude/rules/$f | command sed -n "${n}p" | command grep -c effort; done` 출력 7줄 모두 0), effort는 에이전트 frontmatter `effort:`로 정의합니다(`.claude/agents`의 49개 파일에 `effort:` 줄이 있음, R006 선택 필드 `.claude/rules/MUST-agent-design.md:179`). 오케스트레이터 환경의 Agent 도구 정의(Claude Code 2.1.296, 2026-10-13, 세션 도구 목록에서 직접 읽음)에는 `effort` 파라미터(enum: low, medium, high, xhigh, max)가 있으며, 도구 설명(CHANGELOG 원문이 아님) 전문은 "Reasoning effort for this agent. Set this ONLY when the user, or instructions such as CLAUDE.md or a skill, explicitly ask that this agent or delegated work run at a specific effort level, never on your own judgment; otherwise omit it and the agent runs at its usual effort. Ignored for subagent_type: "fork": a fork runs at your own effort."입니다. 이 절을 정정한 서브에이전트 세션(Claude Code 2.1.296)의 Agent 도구 정의에서도 같은 파라미터와 설명을 관측했습니다. 호출 단위 `effort`와 frontmatter `effort`의 우선순위는 관측하지 못했습니다 [가설 — 우선순위 미실측]. 이 항목은 선택 기능 추가이므로 기존 위임 규칙을 바꾸지 않습니다.
- CHANGELOG 원문: "Fixed subagent definitions with `permissionMode: auto` entering auto mode when auto mode is unavailable (disabled by settings, circuit breaker, or a model that doesn't support it)"
  (292) auto mode를 쓸 수 없는 상황(설정으로 비활성화, circuit breaker, 미지원 모델)에서 `permissionMode: auto`로 정의된 서브에이전트가 auto mode에 진입하던 결함이 수정되었습니다. `.claude/agents`의 `permissionMode:` 줄 49개는 전부 `bypassPermissions`이고 `auto`와 `plan`은 0건이므로(`git grep -h '^permissionMode:' -- '.claude/agents/*.md' | sort | uniq -c` 결과 1행 "49 permissionMode: bypassPermissions") 이 결함 조건에 해당하지 않습니다.
- CHANGELOG 원문: "Changed agent names to allow at most 256 characters: a longer one is rejected, and a skill's or a plugin file's `name` longer than that is ignored"
  (292) 에이전트 이름은 최대 256자로 제한되어 더 긴 이름은 거부되고, 스킬이나 플러그인 파일의 `name`이 그보다 길면 무시됩니다. 측정한 범위(python3로 `.claude/agents/*.md`와 `.claude/skills/*/SKILL.md`의 `name:` 길이 최대값 계산)에서 에이전트 `name`의 최대 길이는 22자(`lang-typescript-expert`), 스킬 `name`의 최대 길이는 32자(`supabase-postgres-best-practices`)이므로 영향 조건이 관측되지 않았습니다.

### 권한 · 훅 · 도구 입력

- CHANGELOG 원문: "Security: Fixed PreToolUse hook approvals and auto mode bypassing the permission prompt for file reads from network (UNC) paths"
  (292) PreToolUse 훅의 승인과 auto mode가 네트워크(UNC) 경로의 파일 읽기에서 권한 프롬프트를 우회하던 보안 결함이 수정되었습니다. 관측한 범위에서 이 저장소의 훅은 승인 결정 필드를 출력하지 않습니다(`git grep -n permissionDecision -- .claude/hooks` 결과 0건, `.claude/settings.json` 인라인 훅도 `command grep -c permissionDecision` 0; 훅 출력의 `hookSpecificOutput`은 `.claude/hooks/scripts/`의 `claude-md-reinject.sh:74`, `fail-axis-cause-advisor.sh:132`, `r007-r008-drift-advisor.sh:445`, `user-prompt-preprocessor.sh:99`의 jq 출력 식 4곳이 출력 생성 지점이며 모두 `additionalContext` 전달에만 씁니다; `git grep -n hookSpecificOutput -- .claude/hooks`는 주석과 `.claude/hooks/hooks.json:239`의 description을 포함해 13줄을 반환합니다). 또한 이 저장소 실행 환경은 macOS이며 UNC 경로 사용은 관측하지 못했습니다 [가설 — UNC 경로 사용 여부 미관측]. 영향이 없을 것으로 봅니다.
- CHANGELOG 원문: "Fixed a skill's or slash command's `allowed-tools` rule coming back in a later turn when you leave auto mode or plan mode partway through that turn"
  (292) auto mode나 plan mode를 턴 도중에 벗어날 때 스킬·슬래시 커맨드의 `allowed-tools` 규칙이 이후 턴에 다시 돌아오던 결함이 수정되었습니다. 관측한 범위(`git grep -n '^allowed-tools:' -- '.claude/skills/*/SKILL.md'`)에서 `allowed-tools`를 선언한 스킬은 2개입니다(`.claude/skills/diagram-design/SKILL.md:12`, `.claude/skills/profile/SKILL.md:7`). 영향 범위가 작고 규칙 문안은 바뀌지 않습니다.
- CHANGELOG 원문: "Improved hook output handling: `<system-reminder>` tags written in a hook's output are escaped before they reach Claude"
  (292) 훅 출력에 쓰인 `<system-reminder>` 태그가 Claude에 전달되기 전에 이스케이프됩니다. 측정한 범위(`git grep -n system-reminder -- .claude/hooks`)에서 `.claude/hooks`의 `system-reminder` 문자열은 `.claude/hooks/scripts/user-prompt-preprocessor.sh:63`의 주석과 `:67`의 입력 판별 정규식 2건이며, 훅이 이 태그를 출력하는 곳은 관측되지 않았습니다(`command grep -c system-reminder CLAUDE.md .claude/settings.json` 결과 0·0). 따라서 이 저장소 훅의 출력은 바뀌지 않습니다. 다만 `claude-md-reinject.sh`가 CLAUDE.md 전문을 `additionalContext`로 재주입하므로, 향후 CLAUDE.md에 이 태그를 쓰면 이스케이프 대상이 됩니다.
- CHANGELOG 원문: "Improved tool input handling: Grep accepts `file_path` for `path`, and Write, WebFetch and Read ignore a few stray parameters instead of failing the call"
  (292) Grep이 `path`의 별칭으로 `file_path`도 받고, Write·WebFetch·Read는 몇몇 불필요한 파라미터를 호출 실패 대신 무시합니다. 룰은 도구 호출 인자를 일부 규정합니다. R008의 required 파라미터 완비 점검(`.claude/rules/MUST-tool-identification.md:38`·`:40`, `:252` "매 도구 호출 직전", `:256`의 예는 AskUserQuestion `questions`)은 모든 도구 호출에 적용됩니다. Agent 호출에 한정해서는 R008 `:97`의 `subagent_type` 일치와 `:101`의 `description` `[N]` 접두사, R009 `.claude/rules/MUST-parallel-execution.md:279`의 `model`, 그리고 `mode`를 다루는 R006 `.claude/rules/MUST-agent-design.md:67`(보이는 예시 줄)·`:470`(`:464`에서 열린 HTML DETAIL 주석 안)과 R010 `.claude/rules/MUST-orchestrator-coordination.md:630`이 있습니다(각 줄 `sed -n`으로 확인). 그러나 Grep·Write·WebFetch·Read의 파라미터 이름(`path`/`file_path`)을 규정한 룰 문장은 관측한 범위에서 없습니다(``git grep -n -E 'file_path|`path`' -- .claude/rules CLAUDE.md`` 3건: `.claude/rules/MAY-optimization.md:148`의 v2.1.229 크래시 노트, `.claude/rules/MUST-agent-design.md:291`의 `FileChanged` 훅 데이터 필드, `:430`의 model escalation 설정 키로 규범 지시가 아닙니다). 위임 프롬프트들은 이번에 조사하지 않았습니다. 따라서 이 수정으로 바꿀 룰 문안은 관측되지 않았습니다. R002 ‡(`.claude/rules/MUST-permissions.md:18`)의 기록, 즉 frontmatter `tools:`에 Grep/Glob을 명시한 `qa-writer` 1건은 전용 도구를 받았고 명시 목록이 없는 메인 세션에는 없었다는 관측과, frontmatter 명시가 `--tools` 명시와 같은 효과라는 일반화는 그 1건에 근거한 추정이라는 서술은 그대로입니다.
- CHANGELOG 원문: "Fixed Grep and Glob reporting no matches when the file or folder they were given could not be read; Claude now retries once or tells you"
  (292) 지정한 파일이나 폴더를 읽을 수 없을 때 Grep과 Glob이 일치 항목 없음으로 보고하던 결함이 수정되어, 이제 Claude가 한 번 재시도하거나 사용자에게 알립니다. R020의 Read-Before-Characterize는 로그를 읽기 전에 특성화하지 않도록 요구하며(`.claude/rules/MUST-completion-verification.md`의 해당 절), 이 수정은 같은 방향의 플랫폼 보완입니다. 구버전 세션에서 "0건"으로 보고된 검색은 읽기 실패였을 가능성이 있으나 [가설 — 과거 세션별 실측 필요], 규칙 문안은 바뀌지 않습니다.
- CHANGELOG 원문: "Improved sandbox auto-allow: with strict sandbox mode set in user, managed or --settings settings, an interpreter command with an env var prefix like `FOO=bar python3 app.py` runs unprompted"
  (292) 사용자·관리형·`--settings` 설정에 strict sandbox 모드가 지정된 경우, `FOO=bar python3 app.py` 같은 환경 변수 접두 인터프리터 명령이 프롬프트 없이 실행됩니다. 원문상 이 동작은 strict sandbox 모드가 사용자·관리형·`--settings` 설정에 있을 때만 해당하므로, 프로젝트 `.claude/settings.json`의 `sandbox` 키 유무는 판단 근거가 되지 않습니다. 사용자·관리형·`--settings` 설정은 이번 검토에서 조사하지 않았으므로 영향 여부는 [가설 — 해당 scope의 strict sandbox 설정 여부로 판정]입니다.

### MCP

- CHANGELOG 원문: "Fixed an MCP tool with a name longer than 128 characters making every request fail; that tool is now left out and an MCP error names it"
  (292) 이름이 128자를 넘는 MCP 도구가 모든 요청을 실패시키던 결함이 수정되어, 해당 도구는 제외되고 MCP 오류가 그 이름을 알립니다. 이 저장소 `.mcp.json`은 서버 2개(`ontology-rag` stdio `.mcp.json:4`, `eraser` http `.mcp.json:16`)를 두며 `.claude/settings.json:26`은 `ontology-rag`만 `enabledMcpjsonServers`에 나열합니다(`:25`의 `enableAllProjectMcpServers`는 true). 도구 이름 길이는 세션 도구 목록으로 잴 수 있습니다. Claude Code 2.1.296 리뷰어 세션에서 가장 긴 `ontology-rag` 도구 이름은 `mcp__ontology-rag__ontology_compare_phases`(42자, 접두 제외 23자)로 관측됐고, 이 절을 정정한 서브에이전트 세션의 지연 도구 목록에서도 같은 이름이 최장이었습니다(python3 `len` 계산). `eraser`는 두 세션 모두 인증 전 도구(`mcp__eraser__authenticate`, `mcp__eraser__complete_authentication`)만 보였으므로, 인증 후 도구 이름 길이는 [가설 — 인증 후 도구 목록으로 판정]입니다.
- CHANGELOG 원문: "Improved startup of `claude -p` and SDK sessions: the first turn no longer waits for HTTP and SSE MCP servers to answer `resources/list`"
  (292) `claude -p`와 SDK 세션의 시작이 빨라져 첫 턴이 HTTP·SSE MCP 서버의 `resources/list` 응답을 기다리지 않습니다. 이 저장소의 http 서버는 `eraser` 하나이며(`.mcp.json:16`), 무인 실행(`.claude/skills/fsd/SKILL.md:133`가 `claude -p`를 언급)에서 이 서버가 로드되는지는 관측하지 못했습니다 [가설 — `enableAllProjectMcpServers: true`(`.claude/settings.json:25`)에 따른 로드 여부 미실측]. 시작 지연 개선이지만, 첫 턴이 HTTP·SSE 서버의 `resources/list` 결과 없이 시작될 수 있는지는 원문이 말하지 않으므로 [가설 — 첫 턴에서 해당 서버 리소스 목록의 유무를 실측하면 판정]입니다.
- CHANGELOG 원문: "Changed local (stdio) MCP server connections to negotiate protocol version 2026-07-28 by default on every install, including Bedrock, Vertex and Foundry; `MCP_PROTOCOL_NEGOTIATION=legacy` opts out"
  (292) 로컬(stdio) MCP 서버 연결이 모든 설치(Bedrock·Vertex·Foundry 포함)에서 기본적으로 프로토콜 버전 2026-07-28을 협상하며, `MCP_PROTOCOL_NEGOTIATION=legacy`로 이전 방식을 선택할 수 있습니다. 이 저장소의 로컬 stdio 서버는 `ontology-rag`이며 `.venv/bin/python -m ontology_rag.mcp_server`로 실행됩니다(`.mcp.json:4`~`:9`). Claude Code 2.1.296 세션에서 `ontology-rag` 도구가 노출된 것은 관측됐습니다(리뷰어 관측이며, 이 절을 정정한 서브에이전트 세션의 지연 도구 목록에도 `mcp__ontology-rag__*` 도구가 있었습니다). 다만 연결 경로가 새 프로토콜 협상인지 아래 항목의 7일 폴백인지는 관측하지 않았습니다 [가설 — 연결 경로 미관측]. R019의 enrichment는 실패 시 조용히 건너뛰도록 규정되어 있습니다(`.claude/rules/SHOULD-ontology-rag-routing.md:39`의 「Failure Handling」 절, 표는 `:41`~`:46`).
- CHANGELOG 원문: "Improved startup with local (stdio) MCP servers that ignore the newer protocol check: after one slow connect they are remembered for 7 days and connected the older way without the wait"
  (292) 새 프로토콜 확인을 무시하는 로컬(stdio) MCP 서버는 한 번 느리게 연결된 뒤 7일 동안 기억되어, 이후 대기 없이 이전 방식으로 연결되므로 시작이 빨라집니다. 이 저장소의 로컬 stdio 서버는 `ontology-rag` 하나이며(`.mcp.json:3`~`:4`), 이 서버가 새 프로토콜 확인을 무시해 이 폴백 대상이 되는지는 관측하지 않았습니다(위 항목의 [가설]과 같은 미관측 사항). 연결 방식의 기본값을 바꾸는 항목이 아니라 시작 지연 개선이므로 룰 변경은 필요하지 않습니다.

### 무인 실행 · 예약 · 재개

- CHANGELOG 원문: "Fixed one-shot `claude -p` and Agent SDK runs stopping a background command 5 seconds after the final result, and one-shot `claude -p` runs dropping a scheduled wakeup; both are now waited for"
  (292) 일회성 `claude -p`와 Agent SDK 실행이 최종 결과 5초 뒤에 백그라운드 명령을 멈추던 결함과, 일회성 `claude -p` 실행이 예약된 wakeup을 버리던 결함이 수정되어, 이제 둘 다 기다립니다. `/fsd`는 `claude -p`·예약 실행 경로를 명시적으로 다루고(`.claude/skills/fsd/SKILL.md:133`, `:172`), R020은 2.1.257의 Monitor 대기 수정을 이미 기록합니다(`.claude/rules/MUST-completion-verification.md:535`). 구버전 `-p` 실행에서 백그라운드 결과의 부재는 조기 종료의 산물일 수 있었습니다 [가설 — 실제 무인 `-p` 실행에서의 효과 미실측].
- CHANGELOG 원문: "Fixed plan mode not being restored when resuming a session from the `claude --resume` session picker or with `/resume`"
  (292) `claude --resume` 세션 선택기나 `/resume`으로 세션을 재개할 때 plan mode가 복원되지 않던 결함이 수정되었습니다. 이 저장소의 에이전트 정의에는 `permissionMode: plan`이 0건입니다(`git grep -h '^permissionMode:' -- '.claude/agents/*.md' | sort | uniq -c`). plan mode에 들어가는 경로로는 사용자가 세션에서 켜는 경우 외에, `structured-dev-cycle` 스킬이 Stage 1을 `EnterPlanMode`에 대응시키고(`.claude/skills/structured-dev-cycle/SKILL.md:134`~`:136`) `research` 스킬이 `EnterPlanMode`를 언급하며(`.claude/skills/research/SKILL.md:384`) R002 Tier 3가 `EnterPlanMode`를 나열합니다(`.claude/rules/MUST-permissions.md:11`). 이 경로로 들어간 plan mode도 재개 시 복원 대상이 되지만, 플랫폼 수정이므로 규칙 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed saved scheduled tasks created after `/resume`, `/branch` or `/clear` never firing, and saved tasks ignoring later creates and deletes after two writes to the tasks file milliseconds apart"
  (292) `/resume`·`/branch`·`/clear` 이후 만든 저장된 예약 작업이 발화하지 않던 결함과, 작업 파일에 몇 밀리초 간격으로 두 번 쓴 뒤 저장된 작업이 이후의 생성·삭제를 무시하던 결함이 수정되었습니다. `/fsd`의 루프 드라이버는 메인 대화 자신이며 `/goal`·`/loop`(ScheduleWakeup) 호출은 필수가 아니라고 규정합니다(`.claude/skills/fsd/SKILL.md:162`). 관측한 범위(위 v2.1.290 절의 예약 경로 `git grep`)에서 이 수정이 닿을 수 있는 경로는 `/fsd`의 선택적 `/loop` 호출과 `claude-native` 스킬의 예약 실행 안내(`.claude/skills/claude-native/SKILL.md:232`~`:240`, `/schedule`·CronCreate)입니다. 두 경로의 실제 사용은 관측하지 않았고, `/schedule` routine이 이 저장된 예약 작업 경로를 쓰는지도 [가설 — 미관측]입니다.
- CHANGELOG 원문: "Fixed a background session's `/loop` silently stopping when the session's process restarted (for example after a crash), because its pending wakeup was lost"
  (292) 백그라운드 세션의 프로세스가 재시작될 때(예: 크래시) 대기 중이던 wakeup이 사라져 `/loop`가 조용히 멈추던 결함이 수정되었습니다. `/fsd`의 `/loop` 반복은 `.claude/skills/fsd/SKILL.md:16`과 `:39`에 정의되어 있습니다. 2.1.293의 클라우드 wakeup 롤백은 대상이 클라우드 컨테이너 재시작이므로 이 항목과 별개 항목으로 판단하며(위 Scope-ceiling과 같은 판단, 코드 경로 동일 여부는 [가설]), 2.1.295의 "Fixed a background session's `/loop` stopping without notice when its next wakeup came due while the session's process was down; the session now says so and Claude is told"는 롤백이 아닌 후속 보완입니다. 현행(2.1.296)에서의 실제 동작은 실행 검증하지 않았습니다.
- CHANGELOG 원문: "Added `CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS` environment variable to set a longer base delay for the backoff when retrying an overloaded (529) request"
  (292) 과부하(529) 요청을 재시도할 때의 백오프 기본 지연을 늘리는 환경 변수 `CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS`가 추가되었습니다. 측정한 범위에서 이 변수는 `.claude/settings.json`과 `.claude/settings.local.json`에 설정되어 있지 않으며(`command grep -c OVERLOADED .claude/settings.json .claude/settings.local.json` 결과 0·0; `.claude/settings.local.json`은 gitignore 대상이라 `git grep`으로는 볼 수 없습니다), 선택 환경 변수이므로 기본 동작은 바뀌지 않습니다. R004의 "Retry up to 3x with backoff (1s, 2s, 4s)"(`.claude/rules/SHOULD-error-handling.md:25`)는 에이전트 수준 재시도 규정이며 플랫폼 내부 백오프와 별개입니다.

### 컨텍스트 · 압축 · 입력

- CHANGELOG 원문: "Fixed "instruction file not loaded" lines going stale or missing after `/cd` or a permission change, and added a transcript line when a nested one isn't loaded"
  (292) `/cd`나 권한 변경 뒤 "instruction file not loaded" 안내 줄이 오래되거나 누락되던 결함이 수정되었고, 중첩 지시 파일이 로드되지 않을 때 트랜스크립트 줄이 추가되었습니다. `InstructionsLoaded` 훅은 이 저장소에 배선되어 있지 않으므로(CC가 로드하는 `.claude/settings.json`의 `hooks` 키에 없음(jq), `command grep -c InstructionsLoaded .claude/settings.json .claude/settings.local.json` 결과 0·0; `.claude/hooks/hooks.json`은 CC가 직접 로드하지 않는 소스 파일, R021) 훅 동작에는 영향이 없고, 표시와 트랜스크립트 정보가 정확해집니다. 이 저장소에는 중첩 지시 파일 `templates/CLAUDE.md`가 있으므로(v2.1.288·v2.1.293 절) 그것이 로드되지 않는 경우 새 트랜스크립트 줄이 생길 수 있습니다. 트랜스크립트를 파싱하는 스크립트(예: R020 자가 계수용 `scripts/count-r007-r008.sh`)에 이 줄이 영향을 주는지는 [가설 — 새 줄이 포함된 트랜스크립트로 계수 결과를 비교하면 판정]입니다.
- CHANGELOG 원문: "Fixed a compaction summary that repeated `/name` letting Claude invoke a skill that is reserved for the user"
  (292) 압축 요약이 `/name`을 반복하면 사용자 전용 스킬을 Claude가 호출할 수 있던 결함이 수정되었습니다. 이 저장소는 `disable-model-invocation: true` 스킬 10개를 둡니다(`git grep -l -E '^disable-model-invocation: *true' -- '.claude/skills/*/SKILL.md' | wc -l`=10; 예: `.claude/skills/npm-publish/SKILL.md:6`, `.claude/skills/npm-version/SKILL.md:6`, `.claude/skills/sauron-watch/SKILL.md:5`). 구버전에서는 압축 뒤 이 스킬들이 모델에 의해 호출될 여지가 있었으나 [가설 — 실제 호출 사례 미관측], 수정으로 사용자 전용 의도가 압축 후에도 유지됩니다. 규칙 문안 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed @-mentioned text files over 256KB being left out silently: Claude is now told the file's size and to read it in portions"
  (292) 256KB를 넘는 @-멘션 텍스트 파일이 조용히 제외되던 결함이 수정되어, 이제 Claude에게 파일 크기와 분할 읽기가 안내됩니다. 이 가이드(`guides/claude-code/15-version-compatibility.md`)와 미러(`templates/guides/claude-code/15-version-compatibility.md`)는 256KB(262144바이트)를 넘으므로(`wc -c`, 2026-10-13 측정) 직접 해당합니다. 이 가이드를 @-멘션하면 전문이 한 번에 들어오지 않고, 이 수정에 따라 Claude가 파일 크기와 분할 읽기 안내를 받습니다(이 수정 이전에는 조용히 제외되던 조건입니다).
- CHANGELOG 원문: "Fixed the Read tool returning only the first entry, with no error, when a PDF's `pages` was a list such as "6,9,15"; it now returns an error saying to read each page or range separately"
  (292) PDF의 `pages`에 "6,9,15" 같은 목록을 주면 Read가 오류 없이 첫 항목만 반환하던 결함이 수정되어, 이제 각 페이지나 범위를 따로 읽으라는 오류를 반환합니다. `git grep -n -w PDF -- '.claude/skills/*/SKILL.md'` 결과는 2건(`.claude/skills/research/SKILL.md:227`, `.claude/skills/scout/SKILL.md:94`)이며 둘 다 출처 태깅 문구이지 PDF 읽기 지시가 아니므로 영향이 없습니다.

기타 70건 — 이 저장소 비해당(VSCode·Claude Tag·Code Review·Cloud sessions·Remote Control 전용 항목, 터미널 입력·vim mode·렌더링·/theme·/focus 등 UI 세부, mod·plugin 훅 API(`prompt.autocomplete`, `$.model.complete`, `agent.spawn`, `tool.check`, `tool.call`, `config.set`)와 `claude plugin` 하위 명령, Windows 전용 보안 수정, 샌드박스 읽기 거부 경로·managed 설정·`/ultrareview` 업로드 관련 수정 등 harness 비영향 세부사항이며 이 저장소는 mod·plugin 패널 UI를 개발하지 않습니다). 실측: `gh release view v2.1.292 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 92건 중 위 본문 22건을 다뤘으므로 92 − 22 = 70건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- Agent·권한·훅·MCP·무인 실행·컨텍스트 항목은 이 저장소에 해당 구성이 없거나(`permissionMode: auto`/`plan` 0건, `InstructionsLoaded` 훅 없음, `OVERLOADED` 환경 변수 미설정; strict sandbox는 사용자·관리형·`--settings` scope 사항이라 미조사) 선택 기능 또는 플랫폼 수정이며, 룰·CLAUDE.md·에이전트·훅 변경은 불필요합니다. @-멘션 256KB 항목은 이 가이드 자체가 해당하지만 플랫폼의 안내 개선이므로 역시 룰 변경 사안이 아닙니다.
- 룰 변경 제안은 없습니다. 후보로만 보고합니다: Agent 호출 단위 `effort` 파라미터는 `.claude/rules/MUST-parallel-execution.md`의 "Agent Tool Requirements" 목록에 한 줄로 추가할 수 있습니다. Agent 스키마의 `effort` 노출은 관측됐으나(오케스트레이터 세션, Claude Code 2.1.296), frontmatter `effort:`와의 우선순위가 미실측이므로 현재는 보류합니다.

---

## v2.1.293 (2026-10-07)

> Issue: #1849 — Claude Code v2.1.293 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 이 릴리즈 이후 릴리즈(2.1.294~2.1.296)의 CHANGELOG 절 3개에서 `2.1.293`과 `Revert`를 검색했고(`command grep -nE '2\.1\.293|Revert' section-2.1.294.md section-2.1.295.md section-2.1.296.md`) 출력은 0줄이었습니다. 따라서 이후 릴리즈가 이 릴리즈의 항목을 롤백하거나 좁힌 문장은 관측되지 않았습니다(`command grep -n '2\.1\.29' section-2.1.296.md`의 일치는 절 제목과 gateway 로그인 회귀 1줄이며, 그 줄은 2.1.295 회귀를 다루므로 이 릴리즈와 무관합니다). 이 릴리즈 자체에는 이전 릴리즈의 롤백이 2건 있으며 아래 해당 항목에서 다룹니다. 릴리즈 게시 시각은 2026-10-07T18:10:20Z입니다(`gh release view v2.1.293 -R anthropics/claude-code --json publishedAt`).

### 모델 · 상태줄

- CHANGELOG 원문: "Added Claude Haiku 5.5 (`claude-haiku-5-5`), now the default Haiku model on the Anthropic API — 1M context, $0.10/$0.50 per Mtok ($0.50/$2.50 for prompts over 100K)"
  (293) Haiku 5.5(`claude-haiku-5-5`)가 추가되어 Anthropic API의 기본 Haiku 모델이 되었습니다. R006 Tier-2 표에는 이번 변경에서 `claude-haiku-5-5` 행이 추가되었고(`.claude/rules/MUST-agent-design.md:50`, 기존 `claude-haiku-4-5` 행은 `:49`), `guides/multi-model-routing/README.md:36`에도 같은 모델 행이 추가되었습니다. 이 저장소의 haiku 에이전트 3개는 Tier-1 별칭 `model: haiku`를 씁니다(`.claude/agents/mgr-supplier.md:4`, `.claude/agents/sys-naggy.md:4`, `.claude/agents/tracker-checkpoint.md:4`). Tier-1 별칭은 CC가 해석하므로(R006 Tier 1 단락, `MUST-agent-design.md:33`, `:43`) 이 에이전트들이 실제로 Haiku 5.5로 실행되는지는 스폰 결과의 `resolvedModel`을 실측해야 확정됩니다 [가설 — 스폰 결과의 `resolvedModel` 값이 `claude-haiku-5-5`인지 여부로 판정].
- CHANGELOG 원문: "Added `agentType` to the `subagentStatusLine` payload, so scripts can tell custom subagent types apart"
  (293) `subagentStatusLine` payload에 `agentType`이 추가되어 스크립트가 커스텀 서브에이전트 타입을 구분할 수 있습니다. 관측한 범위에서 `.claude/settings.json`의 상태줄 설정은 `statusLine`(`.claude/settings.json:29`) 하나이고 `subagentStatusLine`은 `.claude`·`templates/.claude`에서 0건이어서(`git grep -n subagentStatusLine -- .claude templates/.claude` 0건, `.claude/settings.local.json`은 `command grep -c` 0) 영향 조건이 관측되지 않았습니다. `.claude/hooks/scripts/audit-log.sh:29`·`:35`의 `agentType`은 Agent 도구 결과 객체(`.tool_response?.agentType?`)를 읽는 별개 표면입니다.

### 서브에이전트 · 도구 안내

- CHANGELOG 원문: "Fixed Claude being told to continue or message subagents with `SendMessage` in sessions, including resumed ones, where a host, a permission rule or a `--tools` list removed that tool"
  (293) 호스트, permission rule, `--tools` 목록이 `SendMessage`를 제거한 세션(재개 세션 포함)에서도 Claude가 `SendMessage`로 서브에이전트를 이어가거나 메시지하라고 안내받던 결함이 수정되었습니다. R018 「멤버 도구 부재 시 대체 규약」(`.claude/rules/MUST-agent-teams.md:490`)은 멤버에게 `SendMessage`가 있다고 가정하지 말되 부재를 전제하지도 말고 먼저 `ToolSearch`로 로드를 시도하라고 규정하며(`:492`), 로드할 수 없을 때의 대체 수단(아티팩트 파일 채널)을 표로 둡니다(`:496`). 이 수정은 도구가 실제로 제거된 세션에서 Claude가 없는 도구를 안내받지 않게 하는 것이며, 그 경우 R018의 대체 표를 따른다는 규범과 충돌하지 않으므로 룰 문안 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed subagents and `--agent` sessions being told a built-in tool was disabled for the whole session when only their own tool list left it out"
  (293) 서브에이전트와 `--agent` 세션이 자신의 도구 목록에서만 빠졌을 뿐인 내장 도구를 "세션 전체에서 비활성"이라고 안내받던 결함이 수정되었습니다. 이 저장소의 에이전트는 frontmatter `tools:`/`disallowedTools:`로 도구를 제한하므로(R010 「Known Limitations (Active Cache)」, `.claude/rules/MUST-orchestrator-coordination.md:811`) 직접 관련됩니다. 이 수정은 모델이 받는 안내 문구를 바로잡는 것이며 위임 전 도구 가용성 점검(R010 Agent Capability Pre-Check, `.claude/rules/MUST-orchestrator-coordination.md:742`)의 필요성을 바꾸지 않습니다.
- CHANGELOG 원문: "Fixed Claude sometimes treating its own last actions before a context compaction as done after it, and retracting or redoing finished work"
  (293) Claude가 컨텍스트 compaction 직전에 자신이 한 마지막 동작을 compaction 이후에 한 일로 취급해, 끝난 작업을 철회하거나 다시 하던 결함이 수정되었습니다(원문 "treating its own last actions before a context compaction as done after it"의 "done after it"을 "compaction 뒤에 수행된 것"으로 읽었습니다). 이 저장소는 compaction 전후 상태 보완용 훅을 배선합니다(PreCompact `task-state-precompact.sh` `.claude/settings.json:396`, PostCompact prompt 훅 `.claude/settings.json:407`). 다만 PreCompact가 저장한 상태의 복원은 PostCompact prompt에 기대며(`.claude/hooks/scripts/task-state-precompact.sh:3` "Pairs with PostCompact prompt that restores this state"), R021은 PostCompact 배선의 효과를 보장되지 않는 것으로 기록합니다(`.claude/rules/MUST-enforcement-policy.md:9`, `:26`; 보장 경로는 `SessionStart` 재주입). 따라서 이 보완이 실제로 복원 효과를 내는지는 [가설 — compact 직후 응답에 저장된 작업 상태가 반영되는지로 판정]입니다. 플랫폼 수정은 같은 문제를 다루는 방향이며 훅·룰 변경은 필요하지 않습니다. 구버전 `/fsd` 세션에서 관측된 작업 재수행이 있다면 일부가 이 결함 때문이었을 수 있으나 [가설 — 해당 세션 트랜스크립트 미조사] R020의 완료 검증 규정 문안은 이 수정으로 바뀌지 않습니다.

### 컨텍스트 · 룰 로딩

- CHANGELOG 원문: "Fixed path-scoped rules and nested CLAUDE.md files not loading when Claude views a file with a single-file cat, head, tail, sed -n or grep command in the Bash tool instead of the Read tool"
  (293) 단일 파일을 대상으로 한 Bash의 cat·head·tail·sed -n·grep 명령으로 파일을 볼 때 path-scoped rule과 중첩 CLAUDE.md가 로드되지 않던 결함이 수정되었습니다. 관측한 범위에서 `.claude/rules/*.md`와 `.claude/skills/*/SKILL.md`의 줄 시작 `paths:`는 `MUST-agent-design.md:632`의 문서 예시 1건뿐이고(`git grep -n -E '^paths:' -- '.claude/rules/*.md' '.claude/skills/*/SKILL.md'`) 실제 룰은 전부 무조건 로드되므로, path-scoped 룰 쪽 절반은 해당하지 않습니다. 반면 중첩 CLAUDE.md 쪽 절반은 해당합니다. 추적된 CLAUDE.md는 루트 `CLAUDE.md`와 `templates/CLAUDE.md` 2개이며(`git ls-files '*CLAUDE.md'`), `templates/` 하위 디렉터리에 있으므로 `templates/CLAUDE.md`가 중첩 CLAUDE.md입니다(위 v2.1.288 절의 같은 판단; 두 파일 내용도 서로 다릅니다, `cmp` 불일치). 따라서 293부터는 `templates/` 아래 파일을 단일 파일 Bash 보기(`cat`·`head`·`tail`·`sed -n`·`grep`)로 열 때도 이 파일이 로드됩니다. 여러 파일을 훑는 `git grep` 전수조사(R005, `.claude/rules/MAY-optimization.md:87`)는 원문의 단일 파일 명령 목록에 없으므로 이 로드와 무관하다고 봅니다 [가설 — `git grep` 단일 경로 지정 시의 로드 여부는 미실측].

### 권한 · 백그라운드

- CHANGELOG 원문: "Fixed `claude agents` offering bypass permissions that background sessions then ignored when consent was saved only in `.claude/settings.local.json` or a `--settings` file; it now asks for consent first, and a session that ignores bypass shows a short notice that stays"
  (293) bypass 동의가 `.claude/settings.local.json`이나 `--settings` 파일에만 저장된 경우, `claude agents`가 bypass permissions를 제공하지만 백그라운드 세션이 이를 무시하던 결함이 수정되었습니다. 이제 먼저 동의를 묻고, bypass를 무시한 세션에는 짧은 안내가 남습니다. R010 「Universal bypassPermissions」는 project·local의 `bypassPermissions` `defaultMode`가 2.1.257부터 무시된다고 이미 기록합니다(`.claude/rules/MUST-orchestrator-coordination.md:588`). 같은 계열이며, 이 저장소의 프로젝트 `.claude/settings.json`은 `permissions.defaultMode: "bypassPermissions"`를 유지하되 신뢰하지 말라는 주석을 둡니다(`jq .permissions .claude/settings.json`의 `_comment_defaultMode`). `.claude/settings.local.json`의 동의 상태는 기기별 설정 파일(gitignore 대상)이라 이번 검토에서 의도적으로 열어 보지 않았으며 [가설 — `claude agents` 실사용 시 동의 프롬프트 표시 여부는 미실측] 룰 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Reverted the auto mode denial message change from 2.1.281 that told Claude a denial covers the outcome, not only the exact command"
  (293) 2.1.281에서 도입된, 거부가 정확한 명령뿐 아니라 그 결과까지 포함한다고 Claude에게 알리던 auto mode 거부 메시지 변경이 롤백되었습니다. 관측한 범위에서 `.claude/rules`와 `CLAUDE.md`에 `2.1.281`을 언급하는 문장은 0건이며(`git grep -n '2\.1\.281' -- .claude/rules CLAUDE.md` rc=1), R010 STOP Protocol은 classifier trip 횟수(2회)만 기준으로 삼고 거부 메시지 문구에 의존하지 않으므로(`.claude/rules/MUST-orchestrator-coordination.md:273`의 trip 계수 서술 — `:272`에서 열린 HTML DETAIL 주석 안, 같은 파일 `:254`의 STOP Protocol 절) 영향이 없습니다. 다만 롤백으로 "거부는 결과까지 포함하므로 다른 경로로 우회하지 말라"는 취지를 플랫폼 메시지가 더 이상 전하지 않습니다. 저장소 룰 중 인접한 규범은 적용 범위가 각각 좁습니다. R001의 Ask-before-scan(`.claude/rules/MUST-safety.md:147`)은 크레덴셜 디스커버리 스캔이 classifier에 걸리면 재시도하지 말라고 하고, R001 「Standing User-Deny + Classifier Block」(`:171`, `:177`)은 사용자의 상시 금지("don't touch X")가 있을 때만 차단된 편집을 다른 경로로 재시도하지 말라고 합니다. R010 STOP Protocol(`.claude/rules/MUST-orchestrator-coordination.md:262`)은 서브에이전트의 classifier trip 2회를 다루고, 같은 룰의 git 조항 두 개(`:487` 브랜치 전환 거부 시 `stash`/`reset`/`clean` 자체 우회 금지, `:1004`·`:1014` pre-commit 훅 차단의 `--no-verify` 우회 금지)와 R017의 v2.1.269/271 노트(`.claude/rules/MUST-sync-verification.md:369`, HTML 주석 안 — 낡은 `.git/config.lock`을 `rm`으로 자체 우회하지 말고 보고)는 git 작업에 한정됩니다. R015의 `.claude/rules/MUST-intent-transparency.md:138`은 allow 규칙으로는 classifier 차단이 풀리지 않으므로 사용자가 `!`로 직접 실행하거나 차단 트리거를 제거해야 한다고 적고, 같은 룰의 「Failed Tool Re-Try Discipline」(`:82`)은 사용자가 지정한 도구를 거부 후에도 같은 도구로 재시도하라는 규범이라 방향이 일부 반대이지만, 다른 수단으로 조용히 바꾸지 말라는 같은 방향의 요소도 있습니다(보이는 `:87` "do NOT silently switch", `:84`에서 열린 DETAIL 주석 안 `:85` "do NOT silently switch to a different mechanism"; `:87`은 사용자가 지정한 도구, `:85`는 사용자가 지정한 도구·형식("User-specified tools/formats")에 한정). R020의 진단 가설 표(`.claude/rules/MUST-completion-verification.md:323`)는 권한·토큰 오류를 플래그·옵션 변경으로 우회하지 말라고 하지만 진단 가설 검증 맥락의 조항입니다. 룰 문장 스윕(`git grep -n -i classifier -- .claude/rules CLAUDE.md`와 ``git grep -n -i -E 'route around|circumvent|우회|another path|different mechanism' -- .claude/rules CLAUDE.md``, HTML 주석 안의 일치 포함)에서 위 조항 외에 일반 auto mode 거부 전반에 대해 "다른 경로로 우회하지 말라"고 규정한 문장은 찾지 못했습니다. 즉 롤백 뒤 그 일반 규범은 플랫폼 메시지에서 빠졌고, 위 스윕 범위의 저장소 룰에서도 확인되지 않습니다. (288) 절 「권한 · auto mode · rm」은 작성 기기의 사용자 scope `defaultMode`를 `auto`로 관측했습니다(기기별 설정이라 저장소 사실이 아닙니다). 세션의 실제 유효 모드는 프로젝트 설정과의 우선순위에 따라 달라지므로(R010 「Universal bypassPermissions」의 `claude -p` 실측과 원천 목록·우선순위에 따르면, 이 저장소처럼 project(또는 local)에 `bypassPermissions`가 있고 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않으며 user 값이 bypass가 아닐 때 `default`로 귀결하고, 키가 없으면 user 값이 유지되며, managed 범위와 대화형 세션은 [가설]) 이 롤백은 auto mode로 실행되는 세션에 한해 해당합니다.

### 스케줄링

- CHANGELOG 원문: "Reverted the 2.1.290 fix for cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is no longer told, and the session stays asleep"
  (293) 컨테이너 재시작으로 대기 중인 `/loop` wakeup이나 예약 작업이 사라진 cloud 세션이 계속 잠든 상태로 남던 문제에 대한 2.1.290 수정(2.1.290 CHANGELOG: "Fixed cloud sessions staying asleep after a container restart lost a pending `/loop` wakeup or scheduled task; Claude is now told and can schedule it again")이 롤백되어, Claude에게 알리지 않으며 세션은 잠든 채로 남습니다. 대상은 cloud 세션입니다. 관측한 범위(v2.1.290 절의 예약 경로 `git grep`)에서 이 저장소가 `/loop`를 쓰는 경로는 `/fsd`의 선택적 self-paced `/loop` 호출입니다(`.claude/skills/fsd/SKILL.md:16`, `:39`, `:162`). self-paced `/loop`도 예약 wakeup을 기다리는 세션 한정 반복 작업으로 다뤄집니다(2.1.290 CHANGELOG "`/loop` and other recurring session-only scheduled tasks", "background sessions waiting on a scheduled wakeup (`/loop`)"). `claude-native` 스킬의 `/schedule` 안내(`.claude/skills/claude-native/SKILL.md:234`~`:237`)는 클라우드 routine을 만드는 경로이며, routine 실행이 이 항목의 cloud 세션 wakeup 경로를 거치는지는 [가설 — 미관측]입니다. `omcustom-loop` 스킬 문서는 이 절을 작성한 v2.0.2 시점에 SubagentStop prompt 훅을 설명해 배선보다 오래된 상태였으나, v2.0.5(#1857)에서 고쳐져 이제 SubagentStop command 훅을 설명합니다(`.claude/skills/omcustom-loop/SKILL.md:3` "SubagentStop advisory hooks during background agent work (outcome recording, consecutive-completion advisory; no orchestrator-workflow continuation)"; `:13`은 이 훅들이 결과를 기록하고 연속 완료 횟수를 세고 advisory를 낼 뿐 오케스트레이터 워크플로를 이어가지 않으며, "check pending steps" 지시는 v1.1.32에서 prompt 훅에서 빠졌고 남은 failure-gate prompt 훅은 #1631에서 advisory command 훅으로 교체되었다고 적습니다). 이는 v2.1.294 절에 정리한 배선, 즉 SubagentStop 훅 5개가 전부 `command` 타입이라는 관측(`jq -c '[.hooks.SubagentStop[]?.hooks[]?.type]' .claude/settings.json`; #1631 교체, `.claude/hooks/hooks.json:283`의 description)과 일치합니다. 이 스킬 문서는 `/loop`·`ScheduleWakeup`·`CronCreate`를 언급하지 않습니다(`command grep -c -E '/loop|ScheduleWakeup|CronCreate' .claude/skills/omcustom-loop/SKILL.md` 결과 0). `/fsd`를 cloud 세션에서 돌린 흔적은 관측하지 못했으므로 영향이 없을 것으로 봅니다 [가설 — cloud 세션 사용 여부 미관측]. 2.1.290의 다른 `/loop` 관련 수정(compaction 이후 예약 작업 복원 등)은 이 항목으로 롤백되지 않았습니다.

### MCP

- CHANGELOG 원문: "Fixed a memory leak where an HTTP MCP connection kept every request it had sent until it closed"
  (293) HTTP MCP 연결이 닫힐 때까지 보낸 모든 요청을 보관하던 메모리 누수가 수정되었습니다. 이 저장소는 `.mcp.json`을 추적합니다(`git ls-files .mcp.json`=1건). 추적된 `.mcp.json`의 서버 2개 중 `eraser`는 `type: "http"`, `ontology-rag`는 `stdio`로 설정되어 있으므로(`git cat-file -p HEAD:.mcp.json`) 설정 기준으로는 HTTP 연결 서버가 있습니다. 다만 Claude Code 2.1.296 리뷰어 세션과 이 정정 세션에서 `eraser`는 인증 전 도구(`authenticate` 계열)만 보였으므로, 장시간 세션에서 실제로 HTTP MCP 요청이 쌓이는지는 [가설 — 인증 후 `eraser` 사용 세션에서 판정]입니다. R013의 메모리 노트(`.claude/rules/SHOULD-ecomode.md:89`, `:101`)와 같은 계열이며 룰 변경은 필요하지 않습니다.

기타 46건 — 이 저장소 비해당(`←` 백그라운드 이동·Esc 처리 등 터미널 UI 동작, Claude in Chrome, `/ultrareview`, Remote Control·cloud 세션 스트리밍, `/model`·`/tui`·`/feedback`·vim 모드·keybindings 등 UI 세부, Windows 전용 수정, claude.ai skill 동기화 주기, `claude purge`·`claude logs`·`claude plugin test`·`claude plugin eval`·Claude apps gateway, mods API(`$.tool.register`), Team·Enterprise 시작 지연, OpenTelemetry·self-hosted runner·`[Claude Tag]`·`[Code Review]` 항목, Bash 편집 diff 안내 문구(다른 프로세스의 쓰기를 포함할 수 있다는 표시) 등 harness 비영향 세부사항이며 이 저장소는 해당 기능을 개발하지 않습니다). 실측: `gh release view v2.1.293 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 56건 중 위 본문 10건을 다뤘으므로 56 − 10 = 46건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 모델·상태줄, 서브에이전트·도구 안내, 컨텍스트·룰 로딩, 스케줄링, MCP 항목은 이 저장소에 해당 구성(`subagentStatusLine`, path-scoped 룰, cloud `/loop` 사용 흔적)이 없거나 기존 룰의 전제와 같은 방향의 플랫폼 수정이며 룰 문안 변경은 불필요합니다. 권한·백그라운드 중 `claude agents` bypass 동의 항목은 R010의 2.1.257 기록과 같은 계열의 플랫폼 수정입니다. 반면 auto mode 거부 메시지 롤백은 기존 룰을 보강하지 않고, 플랫폼이 전하던 "다른 경로로 우회하지 말라"는 취지를 없애는 변경입니다(아래 결정 후보). 중첩 CLAUDE.md(`templates/CLAUDE.md`)는 이 저장소에 있어 293의 로드 수정이 해당하지만, 로드 범위가 넓어지는 플랫폼 수정이므로 룰 변경 사안이 아닙니다.
- 모델 카탈로그 갱신: `claude-haiku-5-5` 행은 이번 변경에서 R006 Tier-2 표(`.claude/rules/MUST-agent-design.md:50`)와 `guides/multi-model-routing/README.md:36`에 추가되었습니다. 이는 모델 목록 행 추가이며 에이전트 행동 규범을 바꾸는 변경은 아닙니다. 위 첫 항목의 "룰 문안 변경은 불필요"는 이 카탈로그 행을 제외한 규범 문안을 가리킵니다.
- 결정 후보: 일반 auto mode 거부에 대해 "다른 경로로 우회하지 말라"는 범용 규범은 위 룰 문장 스윕에서 관측되지 않았습니다. 이를 룰로 둘지는 행동을 바꾸는 규범 신설이라 R016 절차의 별도 결정 사안이며, CC 지식을 기록하는 이 가이드에서는 제안하지 않고 후보로만 남깁니다.
- 후속 실측 후보는 haiku 에이전트 3개의 `resolvedModel`(Haiku 5.5 여부) 확인입니다. 이 문서의 규범 변경 제안은 없습니다(CC 2.1.293 CHANGELOG 항목 기준).

---

## v2.1.294 (2026-10-08)

> Issue: #1848 — Claude Code v2.1.294 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 2.1.295·2.1.296 CHANGELOG 절에서 `2.1.294` 문자열과 "Revert"를 검색한 결과, 이 릴리즈의 두 항목을 되돌리거나 좁히는 문장은 관측되지 않았습니다. 같은 영역의 후속 항목으로 295 절 "Fixed web searches and `agent` hook evaluations taking much longer at `xhigh` and `max` effort"와 296 절 "Fixed managed-settings `PreToolUse` hooks that deny a tool call with `"continue": false`, and managed `prompt` hooks that block one, refusing the call but not ending the turn"이 있으나 둘 다 롤백이 아닌 별개 수정입니다. 릴리즈 게시 시각은 2026-10-08T05:03:54Z입니다(`gh release view v2.1.294 -R anthropics/claude-code --json publishedAt`).

### prompt · agent 훅 판정

- CHANGELOG 원문: "Fixed `prompt` and `agent` hooks written as instructions (such as "Block commands that...") allowing what they should block"
  (294) 지시문 형태("Block commands that..." 등)로 작성된 `prompt`·`agent` 훅이 막아야 할 대상을 허용하던 결함이 수정되었습니다. 측정한 범위에서 이 저장소가 설정하는 `prompt` 훅은 1개이며 `agent` 타입 훅은 0개입니다(`jq -c '[.hooks[][]?.hooks[]? | .type] | group_by(.) | map({(.[0]):length}) | add' .claude/settings.json templates/.claude/settings.json` 결과 두 파일 모두 `{"command":63,"prompt":1}`). 그 1개는 PostCompact 이벤트의 컨텍스트 재주입 문안이며(`.claude/hooks/hooks.json:375`, `.claude/settings.json:407`), 무엇을 차단하는 판정 훅이 아닙니다. 스킬·에이전트 frontmatter에는 `hooks:` 블록이 없습니다(`git grep -n -E '^hooks:' -- '.claude/agents/*.md' '.claude/skills/*/SKILL.md'` 결과 0건; 경로를 지정하지 않으면 R006 본문의 frontmatter 예시 줄이 걸립니다). 따라서 이 결함이 이 저장소의 차단 동작에 영향을 주지 않았다고 봅니다. PostCompact `prompt` 훅 문안이 판정 대상 평가를 거치는지는 CHANGELOG가 말하지 않으므로 [가설 — PostCompact prompt 훅의 평가 경로 미실측]입니다.
- CHANGELOG 원문: "Improved how `prompt` hooks on Stop and SubagentStop written as instructions (such as "Carry on if the build is broken") are judged, so Claude is less likely to stop early"
  (294) Stop·SubagentStop의 `prompt` 훅이 지시문 형태로 작성된 경우의 판정이 개선되어 Claude가 일찍 멈출 가능성이 줄었습니다. 이 저장소의 Stop 훅 6개와 SubagentStop 훅 5개는 전부 `command` 타입이며 `prompt` 타입은 없습니다(`jq -c '{stop:[.hooks.Stop[]?.hooks[]?.type], sub:[.hooks.SubagentStop[]?.hooks[]?.type]}' .claude/settings.json`). SubagentStop의 `prompt` 판정 훅은 #1631에서 advisory 전용 command 훅으로 교체되었다고 `.claude/hooks/hooks.json:283`의 description이 기록합니다. 이 절을 작성한 v2.0.2 시점에는 `.claude/skills/omcustom-loop/SKILL.md:3`와 `:13`이 여전히 "SubagentStop prompt hook"으로 자동 이어가기를 설명해 배선과 문서가 어긋났습니다(이 문장은 당시 이력이며 현재 파일의 문구가 아닙니다). 이 어긋남은 2.1.294와 무관한 선재 항목이었고, v2.0.5(#1857)에서 스킬 문서가 SubagentStop command 훅 설명으로 고쳐졌습니다(`:3` "outcome recording, consecutive-completion advisory; no orchestrator-workflow continuation"). 따라서 이 개선은 이 저장소가 설정하는 훅(settings.json)에는 적용 대상이 없고, 훗날 Stop·SubagentStop에 `prompt` 훅을 다시 배선하면 그때 적용됩니다. 다만 CC 내장 `/goal` 커맨드(`omcustom:goal` 스킬과는 별개 — 위 :118 참조)는 세션 범위 Stop `prompt` 훅을 등록하므로(CC 2.1.310 바이너리 문자열 `sessionHooksRegistry.add(s,"Stop","",{type:"prompt",prompt:t})`) 그런 세션에서는 저장소 배선과 무관하게 이 개선이 적용될 수 있습니다. [가설 — goal 조건문이 원문의 '지시문 형태'에 해당하는지 미실측]

기타 0건 — 이 저장소 비해당 항목은 없습니다. 실측: `gh release view v2.1.294 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 2건 중 위 본문 2건을 다뤘으므로 2 − 2 = 0건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 훅 설정 변경은 불필요합니다. `agent` 타입 훅은 0개이고, 유일한 `prompt` 훅은 PostCompact 재주입용이며 Stop·SubagentStop은 전부 `command` 훅입니다.
- 룰 변경 제안은 없습니다. `omcustom-loop` 스킬 문서와 hooks.json 배선의 어긋남은 이 절 작성 시점(v2.0.2)에 이 릴리즈의 조치 사항이 아니라 별도 정리 후보로 보고했고, v2.0.5(#1857)에서 정리되었습니다.

---

## v2.1.295 (2026-10-08)

> Issue: #1850 — Claude Code v2.1.295 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 상한 이후 릴리즈는 없으며, 2.1.296 CHANGELOG 절에서 "2.1.295"와 "Revert"를 검색했습니다. 이 릴리즈 항목을 되돌리거나 좁히는 "Revert" 문장은 없었고, "2.1.295"는 한 곳에서만 나타났습니다. 그 문장은 "Fixed a saved Claude apps gateway sign-in being ignored on machines whose managed settings set `forceLoginMethod` to `gateway` with no `forceLoginGatewayUrl` (regression in 2.1.295)"이며, 이 릴리즈의 `forceLoginMethod: "gateway"` 지원(Claude apps gateway) 항목의 회귀 수정으로 이 저장소와 무관합니다. 릴리즈 게시 시각은 2026-10-08T19:48:38Z입니다(`gh release view v2.1.295 -R anthropics/claude-code --json publishedAt`).

### hooks · 훅 실패 처리

- CHANGELOG 원문: "Added `onFailure: "block"` for command and HTTP hooks: a hook that can't start, times out, or exits with an unexpected code blocks the action instead of letting it through"
  (295) `onFailure: "block"` 옵션이 command·HTTP 훅에 추가되어, 훅이 시작하지 못하거나 타임아웃되거나 예상 밖 종료 코드를 내면 동작을 통과시키는 대신 차단할 수 있습니다. 관측한 범위에서 `.claude/settings.json`·`templates/.claude/settings.json`·`.claude/hooks/hooks.json`에는 `onFailure`·`timeout`·`async` 키가 0건이므로(`git grep -c -E '"(onFailure|timeout|async)"' -- .claude/settings.json templates/.claude/settings.json .claude/hooks/hooks.json` 출력 없음, rc=1) 이 세 파일의 훅은 모두 기본 동작을 씁니다. R021은 대부분의 규칙을 advisory-first로 규정하고 그 이유로 "Missing dependencies (jq, etc.) don't break the session"을 듭니다(`.claude/rules/MUST-enforcement-policy.md:79`). `onFailure: "block"`은 옵트인이므로 기본값이 바뀌지 않으며, 기존 advisory 훅에 일괄 적용하면 R021 정책에 반하므로 적용하지 않습니다. 이 옵션을 R021 Hard Block 계층 훅(`.claude/rules/MUST-enforcement-policy.md:19`의 stage-blocker, dev-server tmux, rule-deletion-guard)에 쓸지는 별도 결정 사안이며 이번 반영 범위에 넣지 않습니다.
- CHANGELOG 원문: "Fixed an async SessionStart hook's unchanged context being added to the conversation again on every resume"
  (295) 비동기 SessionStart 훅의 변하지 않은 컨텍스트가 resume마다 대화에 다시 추가되던 결함이 수정되었습니다. 관측한 범위에서 `.claude/hooks/hooks.json:128`의 `SessionStart` 훅 블록에는 `async` 키가 없으므로(위 `git grep` 0건) 이 결함 조건에 해당하지 않습니다.
- CHANGELOG 원문: "Fixed variables a SessionStart hook writes to `CLAUDE_ENV_FILE` not reaching the Bash tool after an in-app `/resume` or `/branch`"
  (295) SessionStart 훅이 `CLAUDE_ENV_FILE`에 쓴 변수가 인앱 `/resume`·`/branch` 이후 Bash 도구에 전달되지 않던 결함이 수정되었습니다. 관측한 범위에서 `.claude/hooks/`와 `.claude/settings.json`에는 `CLAUDE_ENV_FILE` 참조가 없으므로(`git grep -n CLAUDE_ENV_FILE -- .claude/hooks .claude/settings.json` rc=1) 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed an async hook's JSON output being ignored when it is printed over several lines"
  (295) 여러 줄로 출력된 비동기 훅의 JSON 출력이 무시되던 결함이 수정되었습니다. `async` 훅이 0건이므로(위 `git grep -c` 출력 없음) 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed web searches and `agent` hook evaluations taking much longer at `xhigh` and `max` effort"
  (295) `xhigh`·`max` effort에서 웹 검색과 `agent` 훅 평가가 훨씬 오래 걸리던 문제가 수정되었습니다. 관측한 범위에서 CC가 로드하는 `.claude/settings.json`의 훅 타입은 `command` 63개와 `prompt` 1개(PostCompact, `.claude/hooks/hooks.json:375`가 소스)이며 `agent` 타입은 없으므로(v2.1.294 절의 jq 타입 집계) `agent` 훅 쪽 영향 조건은 관측되지 않았습니다. `.claude/agents/*.md`에서 `effort: xhigh` 또는 `max` 줄은 `git grep -n -E 'effort: *(xhigh|max)' -- '.claude/agents/*.md'` 0건이므로(경로를 지정하지 않으면 `docs/` 계획 문서와 이 가이드·미러가 걸립니다) 에이전트 frontmatter 경로의 영향은 없고, 세션 수준 effort 설정에 따른 웹 검색 영향은 측정하지 않았습니다.

### 서브에이전트 · 팀원 · 백그라운드 작업

- CHANGELOG 원문: "Fixed `CLAUDE_AUTO_BACKGROUND_TASKS` moving a subagent to the background while an edit or shell command waited behind it, which started that call before the subagent finished"
  (295) `CLAUDE_AUTO_BACKGROUND_TASKS`가 서브에이전트를 백그라운드로 옮길 때, 그 뒤에서 편집이나 셸 명령이 대기하고 있으면 서브에이전트가 끝나기 전에 그 호출이 시작되던 결함이 수정되었습니다. 관측한 범위(`git grep -n CLAUDE_AUTO_BACKGROUND_TASKS -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`)에서 `CLAUDE_AUTO_BACKGROUND_TASKS` 참조는 규칙 노트의 서술(`.claude/rules/MUST-completion-verification.md:559`와 그 `templates/` 미러·`wiki/rules/r020.md` 사본)이며 설정으로 쓰는 곳은 없으므로, 이 환경 변수를 설정한 환경에서만 관련됩니다. R009의 병렬 실행 정책은 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed subagents in their own linked worktree being shown the parent session's git branch, status and recent commits"
  (295) 자신의 linked worktree에서 실행되는 서브에이전트에게 부모 세션의 git 브랜치·상태·최근 커밋이 보이던 결함이 수정되었습니다. 이 저장소는 공유 워크트리의 브랜치 이름이 턴 단위로 바뀔 수 있다고 보고 위임 직전 `git rev-parse --abbrev-ref HEAD` 실측을 요구합니다(R010, `.claude/rules/MUST-orchestrator-coordination.md`의 「사전 실측 리터럴」). 이 수정은 worktree 격리 서브에이전트가 받는 git 컨텍스트만 바로잡으며 이 실측 의무를 바꾸지 않습니다. 관측한 범위(`git grep -n '^isolation:' -- '.claude/agents/*.md'`)에서 에이전트 frontmatter의 `isolation` 값은 `sec-codeql-expert.md:8`의 `sandbox` 한 건이어서 frontmatter로 worktree 격리하는 에이전트는 없습니다. 호출 단위 `isolation: "worktree"` 위임과 `EnterWorktree` 경로는 v2.1.290 절과 같이 [가설]입니다.
- CHANGELOG 원문: "Fixed in-process agent teammates failing their first SendMessage call until they loaded the tool through tool search"
  (295) in-process 에이전트 팀원이 도구 검색으로 `SendMessage`를 로드하기 전에는 첫 `SendMessage` 호출이 실패하던 결함이 수정되었습니다. R018은 `TeamCreate`가 없으면 휴면이며(`.claude/rules/MUST-agent-teams.md:22`의 Detection 행, `:36`의 dormant 문장) 멤버의 `SendMessage`는 부재를 전제하지 말고 `ToolSearch`로 먼저 로드를 시도하라고 규정합니다(같은 파일 `:492`, 「멤버 도구 부재 시 대체 규약」). 이 수정은 그 로드 단계를 생략할 수 있게 하는 방향입니다. 다만 R018은 멤버의 도구 구성이 에이전트 frontmatter와 실행 환경에 좌우된다고 추정하며(`:492`는 이를 추정으로 적고 #1817 "추정 원인 (미검증)"을 인용하며, 실측된 것은 전용 `Glob`/`Grep` 1건), 이 수정이 그 추정을 바꾸지 않으므로 기존 대체 규약은 그대로 둡니다.
- CHANGELOG 원문: "Fixed Claude not being told it can resume background subagents with SendMessage after a session was killed and resumed a second time"
  (295) 세션이 종료된 뒤 두 번째로 resume되었을 때 Claude가 백그라운드 서브에이전트를 `SendMessage`로 재개할 수 있다는 사실을 전달받지 못하던 결함이 수정되었습니다. R018 `SendMessage` resume 관련 노트(`.claude/rules/MUST-agent-teams.md:549`)가 다루는 같은 계열의 신뢰성 수정입니다. 미완 위임을 실측값과 함께 `SendMessage`로 resume하는 R020 「Verification-Delegation Non-Termination」 절차(`.claude/rules/MUST-completion-verification.md:120`)와 보고 본문이 없을 때 `SendMessage`로 재요청하는 R009 결과 수집 절차(`.claude/rules/MUST-parallel-execution.md:368`)는 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed a background session's `/loop` stopping without notice when its next wakeup came due while the session's process was down; the session now says so and Claude is told"
  (295) 세션의 프로세스가 내려가 있는 동안 백그라운드 세션의 `/loop` 다음 wakeup 시각이 지나면 알림 없이 멈추던 결함이 수정되어, 이제 세션이 그 사실을 알리고 Claude도 전달받습니다. `/fsd`는 self-paced `/loop`를 선택적 구동 수단으로 씁니다(`.claude/skills/fsd/SKILL.md:39`, `:172`). 프로세스가 내려갔다 복구되는 구간의 무음 중단을 이제 세션이 알려주므로, 무인 루프 중단을 관측하면 이 알림 유무를 먼저 확인하는 것이 좋습니다. 이 저장소가 백그라운드 세션에서 `/loop`를 실제로 돌리는지는 관측하지 않았습니다 [가설 — 사용자의 `/fsd` 실행이 백그라운드 세션이면 해당].
- CHANGELOG 원문: "Fixed a stopped scheduled task coming back on resume after a rewind, and a scheduled task being lost on resume after Esc or a rewind following a compaction"
  (295) 되감기(rewind) 뒤 중지된 예약 작업이 resume에서 되살아나던 결함과, 압축(compaction) 뒤 Esc나 되감기를 거친 resume에서 예약 작업이 사라지던 결함이 수정되었습니다. `/fsd`·`/loop` 같은 예약·반복 실행과 R011 세션 연속성에 영향이 있을 수 있는 계열입니다. 관측한 범위에서 `.claude/settings.json`·`.claude/skills/fsd`·`.claude/skills/omcustom-loop`에는 `CronCreate` 예약 작업 설정이 없습니다(`git grep -n CronCreate -- .claude/settings.json .claude/skills/fsd .claude/skills/omcustom-loop` 0건). `CronCreate`는 R002 도구 표(`.claude/rules/MUST-permissions.md:14`) 외에 `claude-native` 스킬의 예약 실행 안내(`.claude/skills/claude-native/SKILL.md:232`, `:240`)와 `guides/claude-code/13-cli-flags.md:56`~`:62`, 그리고 이들의 `templates/` 미러·위키 사본과 `docs/superpowers/plans/`의 계획 문서 2건에 나오며(`git grep -n CronCreate`, 이 가이드·미러 제외), `claude-native`의 이 경로를 실제로 쓰는지는 [가설 — 미관측]입니다. 또한 self-paced `/loop`도 예약 wakeup을 기다리는 세션 한정 반복 작업으로 다뤄지고(2.1.290 CHANGELOG "`/loop` and other recurring session-only scheduled tasks", "background sessions waiting on a scheduled wakeup (`/loop`)"), `/fsd`는 `/loop`를 선택적으로 호출합니다(`.claude/skills/fsd/SKILL.md:16`, `:39`, `:162`). 따라서 `/fsd`를 `/loop`로 돌리다 compaction 뒤 Esc·rewind를 거쳐 resume하는 경로에는 이 수정이 해당할 수 있습니다 [가설 — 해당 경로의 실제 발생은 미관측].

### 무인 · headless(`-p`) 실행

- CHANGELOG 원문: "Added a line on stderr, when it is a terminal, that says what a `claude -p` run is waiting for when it stays open after its last turn"
  (295) `claude -p` 실행이 마지막 턴 이후에도 열려 있을 때, 터미널이면 stderr에 무엇을 기다리는지 알려주는 줄이 추가되었습니다. `/fsd`는 무인 실행(`claude -p`, 예약 실행)에서 `/goal`·`/loop`를 권장합니다(`.claude/skills/fsd/SKILL.md:172`). 이 줄은 터미널일 때만 출력되므로 파이프·CI의 stdout 파싱에는 영향이 없다고 보지만 stderr 소비자는 측정하지 않았습니다 [가설 — `claude -p` 실행 스크립트가 stderr를 파싱하지 않으면 영향 없음].
- CHANGELOG 원문: "Fixed `claude -p` text output dropping earlier responses when background work started another turn; each turn's response now prints when the turn ends"
  (295) `claude -p` 텍스트 출력이 백그라운드 작업으로 다른 턴이 시작되었을 때 앞선 응답을 빠뜨리던 결함이 수정되어, 이제 각 턴의 응답이 그 턴이 끝날 때 출력됩니다. 이 저장소는 `-p`로 `/fsd`를 돌릴 수 있고(`.claude/skills/fsd/SKILL.md:172`) 서브에이전트 완료 응답에 의존하므로, 구버전의 `-p` 출력 누락을 "에이전트가 응답하지 않음"으로 오진하지 않도록 이 경계를 기억하는 것이 좋습니다. 이 저장소의 `-p` 출력 파서는 관측하지 못했습니다.
- CHANGELOG 원문: "Added `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` to limit how long unattended retry mode (`CLAUDE_CODE_RETRY_WATCHDOG`) waits out 429 and 529 errors"
  (295) 무인 재시도 모드(`CLAUDE_CODE_RETRY_WATCHDOG`)가 429·529 오류를 얼마나 오래 기다리는지 제한하는 `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`가 추가되었습니다. 이 가이드의 (288) 항목이 이미 `CLAUDE_CODE_RETRY_WATCHDOG`를 다루고 있습니다(`guides/claude-code/15-version-compatibility.md:1791`). 새 환경 변수는 옵트인이며, 관측한 범위(`git grep -n RETRY_WATCHDOG -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`)에서 참조는 룰 노트(`.claude/rules/MUST-agent-teams.md:549`와 그 `templates/` 미러·`wiki/rules/r018.md` 사본)뿐이라 이 저장소는 어느 쪽도 설정하지 않습니다.

### MCP

- CHANGELOG 원문: "Fixed remote MCP servers in headless and SDK sessions staying disconnected after an outage longer than 15 seconds, or reconnecting in a tight loop to a server that drops each connection right after it connects; repeated drops now back off, up to 30s"
  (295) headless·SDK 세션에서 원격 MCP 서버가 15초보다 긴 장애 뒤 연결이 끊긴 채 남던 결함과, 연결 직후 매번 끊는 서버에 빠르게 반복 재연결하던 결함이 수정되어, 이제 반복 끊김은 최대 30초까지 backoff합니다. 관측한 범위에서 `.mcp.json:15-16`에 원격 http 서버(`https://app.eraser.io/api/mcp`)가 있으므로 `-p`·SDK로 이를 쓰는 무인 실행에서는 관련될 수 있습니다. `.mcp.json:4`의 다른 서버는 stdio 방식이라 원격 재연결 결함에 해당하지 않습니다.
- CHANGELOG 원문: "Changed MCP tool descriptions the model loads through tool search to be cut at 16,384 characters instead of 2,048"
  (295) 도구 검색으로 로드되는 MCP 도구 설명이 2,048자 대신 16,384자에서 잘리도록 바뀌었습니다. 이는 MCP 서버를 쓰는 세션의 컨텍스트 비용을 늘릴 수 있는 변경입니다. R013의 컨텍스트 예산 임계값은 창 대비 백분율이므로 규칙을 바꾸지 않으며, 설명이 긴 MCP 서버를 쓸 때의 영향은 측정하지 않았습니다 [가설 — `/context`에서 MCP 도구 설명 비중이 2.1.295 전후로 늘었는지 비교하면 판정 가능].

### 스킬 · 에이전트 frontmatter · 권한

- CHANGELOG 원문: "Changed subagents to preload at most 32 skills from the `skills` field, each once; a subagent with the Skill tool can still invoke the rest"
  (295) 서브에이전트가 `skills` 필드에서 미리 로드하는 스킬이 최대 32개로 제한되고 각각 한 번만 로드됩니다. Skill 도구가 있는 서브에이전트는 나머지를 계속 호출할 수 있습니다. 즉 CC는 `skills:`에 나열된 스킬을 서브에이전트에 사전 로드합니다(컨텍스트 비용이 생기고 상한은 32개). 원문의 "can still invoke the rest"는 32개를 넘어 사전 로드되지 않은 나열 스킬을 가리킵니다. 이 필드가 접근 허용 목록이 아니라는 전제는 원문이 아니라 R006의 서술(`.claude/rules/MUST-agent-design.md:199`)에 근거합니다. 관측한 범위(python3로 `.claude/agents/*.md` frontmatter를 파싱)에서 `skills:`를 선언한 에이전트는 37개이고 항목 수 최대값은 4개(`.claude/agents/fe-vercel-agent.md`)이므로 상한 32에 걸리지 않습니다. R006의 `skills:` 설명은 이번 변경에서 사전 로드 사실을 반영해 정정되었습니다(`.claude/rules/MUST-agent-design.md:196`~`:198`의 DETAIL 주석, `:199`의 보이는 문장).
- CHANGELOG 원문: "Fixed a skill's `allowed-tools` and `effort` being dropped when the Skill tool finished before the response stream ended, which denied the skill's Bash commands in `-p` runs"
  (295) Skill 도구가 응답 스트림이 끝나기 전에 끝나면 스킬의 `allowed-tools`와 `effort`가 버려져 `-p` 실행에서 스킬의 Bash 명령이 거부되던 결함이 수정되었습니다. 관측한 범위에서 `.claude/skills/*/SKILL.md`에 `allowed-tools:` 또는 `effort:` 줄이 합계 21건 있으므로(`git grep -n -E '^allowed-tools:|^effort:' -- '.claude/skills/*/SKILL.md'` 21건; 경로를 지정하지 않으면 다른 파일까지 152건이 걸립니다) 해당 스킬을 `-p`로 호출하는 무인 실행에서 관련될 수 있습니다. 구버전에서 `-p` 중 스킬의 Bash가 거부된 사례를 관측하지는 못했습니다.
- CHANGELOG 원문: "Fixed Bash permission checks for for-loops over glob patterns, improving permission-check accuracy"
  (295) for 반복문이 glob 패턴을 순회하는 Bash 명령의 권한 검사가 수정되어 검사 정확도가 개선되었습니다. 원문은 어느 방향의 오류였는지(과허용·과차단)를 밝히지 않으므로 이 저장소에 대한 영향 방향은 단정하지 않습니다 [가설 — 원문 방향 미확정이므로 영향 방향은 알 수 없음]. `.claude/settings.json:2`의 `permissions` 규칙은 이 수정으로 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed `--tools` and `--restricted` not applying to built-in tools that register after launch, and deprecated tool names reaching tools outside the caller's tool set"
  (295) `--tools`와 `--restricted`가 실행 뒤에 등록되는 내장 도구에는 적용되지 않던 결함과, 폐기된 도구 이름으로 호출자의 도구 집합 밖 도구에 닿던 결함이 수정되었습니다. 이 저장소의 도구 제한 전제는 R010 「Known Limitations (Active Cache)」(`.claude/rules/MUST-orchestrator-coordination.md:811`, 예: `arch-documenter`의 `disallowedTools: [Bash]`)와 R002 ‡(`.claude/rules/MUST-permissions.md:18`, frontmatter `tools:` 명시가 `--tools` 명시와 같은 효과라는 일반화는 1건 실측에 근거한 추정)에 기대고 있습니다. 원문 문법상 앞 절은 CLI 플래그(`--tools`·`--restricted`)에 관한 것이고, 뒤 절("deprecated tool names reaching tools outside the caller's tool set")은 플래그에 한정되지 않은 호출자의 도구 집합 일반에 관한 것으로 읽힙니다. 이 수정 이전에는 실행 뒤 등록되는 내장 도구를 통해 `--tools`·`--restricted` 제한이 빠질 수 있었습니다. 뒤 절이 frontmatter `tools:`·`disallowedTools:` 제한에도 적용됐다면, 구버전에서 그런 서브에이전트에 특정 도구가 주어지지 않는다는 전제가 늘 성립했다고 볼 수 없습니다 [가설 — 측정하지 않음]. 위임 전 도구 가용성 점검(R010 Agent Capability Pre-Check, `.claude/rules/MUST-orchestrator-coordination.md:742`)은 그대로 필요하며 룰 문안 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed forked skills invoked from Workflow subagents delivering their results to the main conversation instead of the invoking agent"
  (295) Workflow 서브에이전트가 호출한 forked skill이 결과를 호출한 에이전트가 아니라 메인 대화로 전달하던 결함이 수정되었습니다. 이 저장소는 `context: fork` 스킬을 쓰며 상한이 12개입니다(R006 「Context Fork Criteria」, `.claude/rules/MUST-agent-design.md`). 원문상 이 결함은 Workflow 서브에이전트가 호출한 경우의 결함입니다. 관측한 범위(`git grep -l -E '^context: *fork' -- '.claude/skills/*/SKILL.md'`)에서 `context: fork` 스킬은 10개(`dag-orchestration`, `de-lead-routing`, `deep-plan`, `dev-lead-routing`, `professor-triage`, `qa-lead-routing`, `roundtable-debate`, `secretary-routing`, `task-decomposition`, `worker-reviewer-pipeline`)이며 R006이 이를 다중 에이전트 오케스트레이션용으로 규정하므로 영향은 제한적이라고 봅니다 [가설 — Workflow 서브에이전트가 fork 스킬을 호출하는 경로가 없으면 해당 없음].

### 환경 · 기타 동작

- CHANGELOG 원문: "Fixed commands and hooks in background sessions inheriting `FORCE_COLOR=3`, which put color escape codes into the output Claude reads"
  (295) 백그라운드 세션의 명령과 훅이 `FORCE_COLOR=3`을 상속해 Claude가 읽는 출력에 색상 이스케이프 코드가 섞이던 결함이 수정되었습니다. 이 저장소의 `.husky/pre-commit:67-68`이 이미 `env -u FORCE_COLOR NO_COLOR=1`로 coverage 출력의 ANSI 오염을 막고 있어(#1437) 이 방어는 그대로 유효하며 제거하지 않습니다. 이 수정은 백그라운드 세션 출력의 색상 코드 오염 원인 하나를 줄이는 방향입니다.

기타 121건 — 이 저장소 비해당(Claude apps gateway 설정·감사·정책, mods·plugin 패널·marketplace·`claude plugin` CLI, 터미널 렌더링·vim 모드·키바인딩·붙여넣기, VSCode·Cloud sessions·Claude Tag·Code Review·self-hosted runner·Desktop 전용 항목, OSC 7501·`/copy` 같은 UI 세부사항, `cat` 같은 Bash 명령 뒤의 파일 읽음 상태 판정·mtime이 바뀌지 않은 변경에 대한 Edit의 전체 읽음 판정 같은 도구 상태 세부, `←`로 백그라운드에 옮긴 self-paced `/loop`의 Esc 중지 등). 실측: `gh release view v2.1.295 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 143건 중 위 본문 22건을 다뤘으므로 143 − 22 = 121건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:

- 이 릴리즈에는 결함 수정·옵트인 기능 외에 기본 동작 변경도 있습니다(도구 검색으로 로드되는 MCP 도구 설명의 16,384자 절단, 서브에이전트 `skills` 사전 로드 상한 32개, 터미널일 때 `claude -p`가 stderr에 쓰는 대기 안내 줄). 이 중 `skills` 사전 로드 항목은 R006 `skills:` 설명의 정정(`.claude/rules/MUST-agent-design.md:196`~`:199`)으로 이어졌고, 그 밖에는 관측한 범위에서 룰·CLAUDE.md·에이전트·훅 변경이 필요한 항목을 찾지 못했습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때만 1줄).
- `onFailure: "block"`을 R021 Hard Block 계층 훅에 적용할지는 별도 결정 사안으로 이월합니다. 위 `git grep -c` 결과상 세 설정 파일(`.claude/settings.json`, `templates/.claude/settings.json`, `.claude/hooks/hooks.json`)의 훅은 `onFailure`·`timeout`·`async`를 쓰지 않습니다.
- (295) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.296 (2026-10-09)

> Issue: #1851 — Claude Code v2.1.296 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-13)의 최신 릴리즈는 2.1.296입니다(`claude --version`=2.1.296, `npm view @anthropic-ai/claude-code version`=2.1.296). 이 릴리즈가 스코프 상한이므로 이후 릴리즈의 롤백 확인 대상이 없습니다. 릴리즈 게시 시각은 2026-10-09T19:28:59Z입니다(`gh release view v2.1.296 -R anthropics/claude-code --json publishedAt`).

### 훅

- CHANGELOG 원문: "Fixed managed-settings `PreToolUse` hooks that deny a tool call with `"continue": false`, and managed `prompt` hooks that block one, refusing the call but not ending the turn"
  (296) managed settings의 `PreToolUse` 훅이 `"continue": false`로 도구 호출을 거부하는 경우와 managed `prompt` 훅이 호출을 차단하는 경우에, 호출은 거부되지만 턴이 끝나지 않던 결함이 수정되었습니다. 관측한 범위에서 description이 차단 목적을 밝힌 이 저장소의 PreToolUse 훅은 프로젝트 settings에 배선되어 있으며, 종료 코드는 훅마다 다릅니다. 스크립트 훅 `.claude/hooks/scripts/stage-blocker.sh:13`과 `.claude/hooks/scripts/rule-deletion-guard.sh:32`는 `exit 2`를 씁니다. description이 차단 목적을 적은 인라인 훅 두 개, 곧 `.claude/settings.json:52`(description `:56` "Block dev servers outside tmux - ensures you can access logs")와 `:82`(description `:86` "Block creation of random .md files - keeps docs consolidated")의 명령에는 `exit 1`이 있습니다(`command grep -n 'exit 1' .claude/settings.json`). `"continue": false`나 `permissionDecision`을 출력하는 곳은 없습니다(`git grep -n -E '"continue": *false|continue: *false|permissionDecision' -- .claude/hooks .claude/settings.json` rc=1). R021의 Conversation Block 계층 훅(`context-budget-advisor.sh`, `stuck-detector.sh`, `cost-cap-advisor.sh`)은 `.claude/settings.json:494`~`:495`, `:516`~`:517`, `:527`~`:528`에서 `continueOnBlock: true`로 배선됩니다. managed settings는 저장소 파일이 아니므로 관측 대상이 아니며, 이 저장소가 배포하는 훅은 관측한 범위에서 프로젝트 settings 훅(`.claude/settings.json`과 `templates/` 미러)이고 플러그인 매니페스트는 없으므로(v2.1.290 절의 `git ls-files`·`find` 0건) 이 수정의 대상이 아니라고 봅니다 [가설 — 사용자 환경의 managed settings 훅 유무는 미관측].
- CHANGELOG 원문: "Fixed PostToolUse hooks in managed settings not applying `updatedMCPToolOutput` in some sessions"
  (296) managed settings의 PostToolUse 훅이 일부 세션에서 `updatedMCPToolOutput`을 적용하지 못하던 결함이 수정되었습니다. 이 저장소의 `playwright-compress` 훅이 `updatedMCPToolOutput`을 씁니다(`.claude/hooks/scripts/playwright-compress.sh:81`, 배선 `.claude/settings.json:579`). 다만 그 훅은 managed가 아니라 프로젝트 settings에 있으므로 이 수정의 대상이 아닙니다. 프로젝트 settings 경로에서 같은 증상이 있었는지는 관측하지 못했습니다 [가설 — 증상이 managed 한정이라는 CHANGELOG 문구를 따르면 영향 없음]. 또한 이 훅은 입력 JSON 전체를 되돌려 주면서 `updatedMCPToolOutput`을 최상위 키로 넣으며(`.claude/hooks/scripts/playwright-compress.sh:81`의 jq 식), 다른 훅이 쓰는 `hookSpecificOutput` 객체 형태(예: `.claude/hooks/scripts/claude-md-reinject.sh:74`)와 다릅니다. CC가 최상위 위치의 이 키를 적용하는지는 실측하지 않았습니다 [가설 — 훅 적용 전후 MCP 도구 결과를 비교하면 판정].
- CHANGELOG 원문: "Fixed hook output being altered when it contained text resembling a plugin hint tag"
  (296) 훅 출력에 플러그인 힌트 태그와 비슷한 텍스트가 있으면 출력이 변형되던 결함이 수정되었습니다. 이 저장소의 advisory 훅은 stdout·stderr로 규칙 경고를 전달하므로(R021 Advisory 계층) 이론상 해당될 수 있으나, 관측한 범위에서 저장소에 `plugin hint` 문자열은 0건입니다(`git grep -n 'plugin hint' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1). 훅 출력이 실행 시점에 이런 텍스트를 포함하는지는 관측하지 않았으므로, 영향은 없을 것으로 보되 [가설 — 실제 훅 출력 내용으로 판정]입니다.
- CHANGELOG 원문: "Fixed Esc or an interrupt during a `UserPromptSubmit` hook or a mod's `prompt.submit` hook ending headless sessions, clearing the typed prompt, or letting the unchecked prompt through"
  (296) `UserPromptSubmit` 훅이나 mod의 `prompt.submit` 훅이 실행되는 동안의 Esc·인터럽트가 headless 세션을 끝내거나 입력한 프롬프트를 지우거나 검사되지 않은 프롬프트를 통과시키던 결함이 수정되었습니다. 이 저장소는 `UserPromptSubmit` 훅 4개(`user-prompt-preprocessor.sh`, `r007-r008-drift-advisor.sh`, `session-autofix-prompt.sh`, `fail-axis-cause-advisor.sh`)를 배선합니다(`.claude/settings.json:233`). 특히 R007/R008 drift advisor와 원인 되묻기 advisor가 이 이벤트에 걸려 있으므로, 구버전의 인터럽트 시 "검사되지 않은 프롬프트 통과"는 advisory 전달 누락의 가능한 경로였습니다 [가설 — 해당 인터럽트 시나리오의 실제 발생은 미관측]. 룰 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Fixed SessionStart hooks of a plugin loaded after a headless session starts being skipped when a different plugin with the same name, or another spelling of it, had already run"
  (296) headless 세션 시작 후 로드된 플러그인의 SessionStart 훅이, 같은 이름(또는 다른 표기)의 다른 플러그인이 이미 실행됐다는 이유로 건너뛰어지던 결함이 수정되었습니다. 원문의 대상은 플러그인의 SessionStart 훅이며, 이 저장소의 SessionStart 재주입(R021, `.claude/settings.json:161`)은 프로젝트 settings 훅이라 원문 대상에 들지 않습니다. 이 저장소가 사용하는 플러그인(superpowers 등)의 훅이 영향을 받았는지는 관측하지 못했습니다 [가설 — 플러그인 SessionStart 훅 발화 로그로 판정].
- CHANGELOG 원문: "Fixed a late-loading plugin's SessionStart hook output reaching the new conversation after `/clear` in headless sessions"
  (296) headless 세션에서 늦게 로드된 플러그인의 SessionStart 훅 출력이 `/clear` 이후의 새 대화에 전달되던 결함이 수정되었습니다. 위 항목과 같은 플러그인 훅 경로의 수정이며, 원문상 프로젝트 SessionStart 훅은 대상이 아닙니다.
- CHANGELOG 원문: "Improved `--debug` output for hooks: command hooks on tool calls, prompts, SessionStart and Stop now log their command, plugin, outcome and duration when they finish, so a slow hook is identifiable"
  (296) `--debug` 출력이 개선되어 도구 호출·프롬프트·SessionStart·Stop의 command 훅이 종료 시 명령, 플러그인, 결과, 소요 시간을 기록하므로 느린 훅을 식별할 수 있습니다. 이 저장소는 훅 핸들러 64개를 프로젝트 settings에 배선하므로(`jq '[.hooks[][]?.hooks[]?] | length' .claude/settings.json`=64) 훅 지연이나 발화 여부를 진단할 때 쓸 수 있는 새 수단입니다. 훅 진단을 R021의 "배선 확인 ≠ 전달 확인 ≠ 발화 확인 ≠ 로드 확인" 원칙(`.claude/rules/MUST-enforcement-policy.md:38`)으로 실측할 때 `--debug` 로그를 증거로 추가할 수 있으나 룰 변경은 필요하지 않습니다.

### 에이전트 · 서브에이전트

- CHANGELOG 원문: "Added `autoCompactWindow` to subagent frontmatter and `--agents` definitions, so a subagent can auto-compact earlier than the main conversation's window"
  (296) 서브에이전트 frontmatter와 `--agents` 정의에 `autoCompactWindow`가 추가되어, 서브에이전트가 메인 대화의 창보다 일찍 auto-compact할 수 있습니다. 관측한 범위에서 `autoCompactWindow`는 이 가이드 밖에서 0건이며(`git grep -n autoCompactWindow -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1) R006 「Optional Frontmatter」 목록(`.claude/rules/MUST-agent-design.md:179`)에도 없습니다. 같은 명령 결과상 에이전트 파일 중 이 필드를 쓰는 것이 없으므로 영향 조건이 관측되지 않았고, 긴 작업을 하는 에이전트의 컨텍스트 사용량을 낮추는 선택 수단으로 남습니다(턴 수 한도인 `maxTurns`와는 별개입니다) [가설 — 에이전트에 적용했을 때의 효과는 미실측].
- CHANGELOG 원문: "Improved `--debug` output to name unrecognized frontmatter fields in custom agent files, with a hint for likely typos"
  (296) `--debug` 출력이 커스텀 에이전트 파일의 인식되지 않는 frontmatter 필드를 이름으로 알려 주고, 오타로 보이는 경우 힌트를 제공합니다. 이 저장소의 에이전트 frontmatter는 R006이 선택 필드로 나열한 `limitations`(13개 파일), `domain`(49개 파일), `soul`(1개 파일)을 씁니다(`.claude/agents/arch-documenter.md:5`, `:8`, `.claude/agents/lang-golang-expert.md`; R006 목록 `MUST-agent-design.md:179`). 또한 `.claude/agents/fe-design-expert.md:19`의 `source:`(외부 출처 메타데이터 블록)는 R006 선택 필드 목록에도 없는 필드입니다(`git grep -n -E '^source:' -- '.claude/agents/*.md'` 1건). 이 필드들이 CC의 인식 필드인지는 관측하지 못했으므로 `--debug`가 이들을 "unrecognized"로 보고할 수 있습니다 [가설 — `claude --debug`로 에이전트 로드 시 출력 실측으로 판정].
- CHANGELOG 원문: "Fixed resumed subagents being told that the user rejected a tool call that a session shutdown had interrupted"
  (296) 세션 종료로 중단된 도구 호출에 대해, 재개된 서브에이전트가 사용자가 그 호출을 거부했다고 안내받던 결함이 수정되었습니다. 이 저장소는 절단되거나 정체된 서브에이전트를 재개할 때 실측값을 동봉하라고 규정합니다(`.claude/rules/MUST-completion-verification.md:127`). 구버전에서 재개된 에이전트가 "사용자 거부"로 오인해 작업을 중단했을 가능성이 있으나 [가설 — 해당 세션 미조사] 룰 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Added `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` to run every workflow agent on one model while other subagents keep theirs"
  (296) `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`이 추가되어 모든 workflow 에이전트를 하나의 모델로 실행하고 다른 서브에이전트는 자기 모델을 유지합니다. 이 저장소는 Workflow 스크립트 규약을 두지만(R023 `.claude/rules/SHOULD-verification-ladder.md:302`) 이 env는 `.claude/settings.json`, `templates/.claude/settings.json`, `.claude/settings.local.json`에서 0건으로 설정돼 있지 않습니다(`command grep -c CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` 세 파일 모두 0). 설정하지 않으면 동작이 바뀌지 않으며, 설정 시 R006의 Tier-2 핀과 어긋날 수 있어 [가설 — 설정했을 때 에이전트 frontmatter 핀과의 우선순위는 미실측] 사용 전 측정이 필요합니다.

### 권한 · 파일 편집

- CHANGELOG 원문: "Fixed Bash permission checks auto-approving some commands that assign the `BASH_ARGV0` shell variable and then use it; these now prompt for approval"
  (296) `BASH_ARGV0` 셸 변수를 할당한 뒤 사용하는 일부 명령을 Bash 권한 검사가 자동 승인하던 결함이 수정되어, 이제 승인을 요청합니다. 관측한 범위에서 이 가이드와 미러를 제외한 저장소에 `BASH_ARGV0`은 0건이며(`git grep -n BASH_ARGV0 -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`) 프로젝트 allow 규칙(`.claude/settings.json`의 `permissions.allow`)은 `Bash(git:*)` 같은 접두 규칙입니다. 위 명령 결과상 이 변수를 쓰는 추적 스크립트가 없으므로 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed Edit and NotebookEdit replacing every non-ASCII character in files that are not valid UTF-8 (Windows-1252, Shift-JIS, GBK); such edits are now refused"
  (296) UTF-8이 아닌 파일(Windows-1252, Shift-JIS, GBK)에서 Edit·NotebookEdit가 모든 non-ASCII 문자를 바꿔 버리던 결함이 수정되어, 이제 그런 편집은 거부됩니다. 이 저장소의 추적된 `*.md`·`*.ts`·`*.sh`·`*.json`·`*.yaml`·`*.yml` 1431개 파일을 UTF-8로 디코드해 측정한 결과(`git ls-files -z -- '*.md' '*.ts' '*.sh' '*.json' '*.yaml' '*.yml'` 목록을 python3로 `decode('utf-8')`) UTF-8이 아닌 파일은 0개였으므로, 이 수정으로 편집이 거부될 대상 파일은 관측되지 않았습니다.

### 컨텍스트 · 비용 · 모델

- CHANGELOG 원문: "Updated `/cost`, the status line, `--max-budget-usd` and the SDK's cost figures to price Sonnet 5.5 cache reads at $0.10 per million tokens (was $0.20)"
  (296) `/cost`, 상태줄, `--max-budget-usd`, SDK의 비용 수치가 Sonnet 5.5 cache read를 100만 토큰당 $0.10(이전 $0.20)으로 계산하도록 갱신되었습니다. R006 Tier-2 표의 `claude-sonnet-5-5` 행(`.claude/rules/MUST-agent-design.md:52`)과 `guides/multi-model-routing/README.md:38`의 같은 모델 행은 이전 값 `$0.20`을 적고 있었으나, 이번 변경에서 CC 비용 수치의 $0.10(v2.1.296, 이전 $0.20)으로 함께 정정되었습니다. `claude-opus-5-5`의 `$0.20/Mtok cache reads`(`MUST-agent-design.md:56`)는 이 항목 대상이 아니며 변경 여부는 관측하지 못했습니다. `guides/claude-code/15-version-compatibility.md`의 2.1.28x 절 원문 인용은 당시 릴리즈 노트의 역사 기록이므로 정정 대상이 아닙니다. 이 저장소의 상태줄은 CC가 상태줄 입력으로 주는 `.cost.total_cost_usd`를 읽고(`.claude/statusline.sh:102`) 그 값을 `/tmp/.claude-cost-${PPID}` 브리지 파일에 씁니다(`:122`~`:124`). 비용 훅 `cost-cap-advisor.sh`는 이 브리지 파일을 읽으며(`.claude/hooks/scripts/cost-cap-advisor.sh:10`, `:43`), 두 스크립트에 단가 하드코딩은 없습니다(`git grep -n -E '0\.20|0\.10' -- .claude/statusline.sh .claude/hooks/scripts` 출력 없음). 따라서 이 갱신은 두 스크립트에 별도 수정 없이 반영됩니다.
- CHANGELOG 원문: "Fixed token counts for Haiku 5.5 and other models that take only adaptive thinking, which failed behind some gateways and were counted with budget thinking elsewhere"
  (296) Haiku 5.5처럼 adaptive thinking만 받는 모델의 토큰 수 계산이, 일부 gateway 뒤에서는 실패하고 다른 곳에서는 budget thinking으로 계산되던 결함이 수정되었습니다. 원문의 "elsewhere"는 실패하던 일부 gateway 밖, 즉 Anthropic API 직접 사용을 포함한 그 밖의 경로를 뜻하므로, budget thinking으로 계산되던 뒤쪽 결함은 gateway를 쓰지 않는 환경에도 해당합니다. 이 저장소의 haiku 에이전트 3개(`.claude/agents/mgr-supplier.md:4`, `.claude/agents/sys-naggy.md:4`, `.claude/agents/tracker-checkpoint.md:4`)는 Tier-1 별칭 `model: haiku`를 쓰므로, 이들이 Haiku 5.5로 해석되면 구버전의 토큰 수 계산이 부정확했을 수 있습니다 [가설 — 스폰 결과의 `resolvedModel`이 `claude-haiku-5-5`이면 해당, 2.1.293 절과 같은 판정 기준].
- CHANGELOG 원문: "Added an `allow_large` option to the Read tool so Claude can read a text file past the usual size limits in one call when it needs the whole file and the context has room"
  (296) Read 도구에 `allow_large` 옵션이 추가되어, 전체 파일이 필요하고 컨텍스트에 여유가 있을 때 통상 크기 한도를 넘는 텍스트 파일을 한 번에 읽을 수 있습니다. R005는 "필요한 파일만 읽는다"를 지연 로딩 전략으로 규정합니다(`.claude/rules/MAY-optimization.md:11`). 이 옵션은 컨텍스트 비용을 키우므로 R013의 예산 임계값(`.claude/rules/SHOULD-ecomode.md:87`)이 계속 적용됩니다. 룰 변경은 필요하지 않습니다.
- CHANGELOG 원문: "Changed the default limit on MCP tool descriptions sent up front and on MCP server instructions from 2,048 to 4,096 characters"
  (296) 미리 전달되는 MCP 도구 설명과 MCP 서버 안내문의 기본 한도가 2,048자에서 4,096자로 바뀌었습니다. 이 저장소의 가이드는 2,048자 상한을 280 절에서 기록합니다(`guides/claude-code/15-version-compatibility.md:1339`, `:1340`). 그 기록은 당시 사실이며 현재 기본값이 아니므로 읽을 때 참고해야 합니다. `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`는 저장소 settings에 0건으로 설정돼 있지 않아(`command grep -c CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH .claude/settings.json templates/.claude/settings.json .claude/settings.local.json` 모두 0) 저장소 설정 범위에서는 기본값이 적용됩니다. 한도가 두 배가 되어 MCP 서버 안내문이 더 길게 주입되므로 컨텍스트 고정비가 늘 수 있습니다 [가설 — 실제 서버 안내문 길이와 증가분은 미실측].
- CHANGELOG 원문: "Added `CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS` environment variable to set a longer maximum delay for the backoff when retrying an overloaded (529) request"
  (296) 과부하(529) 요청을 재시도할 때 백오프의 최대 지연을 더 길게 정하는 `CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS` env가 추가되었습니다. R004의 Retryable 전략은 "최대 3회, 1s·2s·4s 백오프"를 규정하며(`.claude/rules/SHOULD-error-handling.md:25`) 플랫폼 재시도와 별개 층입니다. 이 env는 저장소 settings에 설정되어 있지 않아(`command grep -c OVERLOADED_RETRY_MAX .claude/settings.json templates/.claude/settings.json .claude/settings.local.json` 모두 0) 저장소 설정 범위에서는 동작이 바뀌지 않습니다.

### MCP · headless

- CHANGELOG 원문: "Fixed headless sessions starting a folder's `.mcp.json` or plugin MCP server that was switched off for that folder, after changing directory or reloading plugins"
  (296) headless 세션이 디렉토리 변경이나 플러그인 재로드 후에, 해당 폴더에서 꺼 둔 `.mcp.json` 또는 플러그인 MCP 서버를 시작하던 결함이 수정되었습니다. 이 저장소는 `.mcp.json`을 추적하며 서버 2개(`ontology-rag`는 stdio, `eraser`는 http)를 둡니다(`git cat-file -p HEAD:.mcp.json`). `-p`/`/fsd` 무인 실행에서 꺼 둔 서버가 되살아나던 경로가 닫힌 것입니다. 프로젝트 scope는 `.claude/settings.json`에서 `enableAllProjectMcpServers: true`, `enabledMcpjsonServers: ["ontology-rag"]`이고 `disabledMcpjsonServers` 키는 없습니다(`jq -c '{enableAllProjectMcpServers, enabledMcpjsonServers, disabledMcpjsonServers}' .claude/settings.json`, `.claude/settings.local.json`도 `command grep -c disabledMcpjsonServers` 0). 기기별 로컬 승인 상태(사용자 `~/.claude.json` 등)는 관측하지 않았습니다 [가설 — 로컬 scope의 서버 비활성 여부 미관측].
- CHANGELOG 원문: "Fixed `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` re-running a finished turn after a restart when an MCP tool result had ended that turn"
  (296) 재시작 후 MCP 도구 결과가 턴을 끝낸 경우에도 `CLAUDE_CODE_RESUME_INTERRUPTED_TURN`이 이미 끝난 턴을 다시 실행하던 결함이 수정되었습니다. 관측한 범위에서 이 env는 이 가이드 밖에서 0건으로 저장소에 설정돼 있지 않습니다(`git grep -n CLAUDE_CODE_RESUME_INTERRUPTED_TURN -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1, `.claude/settings.local.json`은 `command grep -c` 0). 설정할 경우의 무인 루프 재개 시나리오에만 관련됩니다.
- CHANGELOG 원문: "Fixed secret redaction in shared transcripts and debug logs missing some values that follow a key with no value, including in JSON written inside a shell string"
  (296) 공유 transcript와 debug 로그에서, 값이 없는 키 뒤에 오는 일부 값(셸 문자열 안에 쓰인 JSON 포함)이 마스킹되지 않던 결함이 수정되었습니다. R001은 시크릿 노출을 금지하며(`.claude/rules/MUST-safety.md:9`) 이 저장소는 `secret-filter.sh` 훅을 배선합니다(`.claude/settings.json:548`). 플랫폼 마스킹은 이 훅과 별개의 층이며, 이 수정은 공유·debug 산출물의 방어를 보강합니다. 훅이나 룰 변경은 필요하지 않습니다.

### 백그라운드

- CHANGELOG 원문: "Changed `←`: a turn or `!` command started while the session moves to the background is now stopped instead of finishing out of sight"
  (296) `←`: 세션이 백그라운드로 이동하는 동안 시작된 턴이나 `!` 명령이 이제 보이지 않는 곳에서 끝나지 않고 중지됩니다. R010 「Background Agent Permission Mode (`/bg` flow)」(`.claude/rules/MUST-orchestrator-coordination.md:642`)는 `/bg`·`←←`로 백그라운드로 가는 에이전트의 permission mode 보존을 다루며 이 항목은 그 서술을 바꾸지 않습니다. 원문의 대상은 "started while the session moves to the background"인 턴이나 `!` 명령입니다. `←`는 대화형 키이므로, 사용자가 `/fsd` 세션을 `←`로 백그라운드로 보내는 도중에 시작된 턴은 중지될 수 있으며, 그 경우 시작한 작업이 중지되었는지 확인하고, 중지되었다면 필요에 따라 다시 실행하는 것이 좋습니다 [가설 — 중지 대상 범위는 원문 외 미실측].

기타 57건 — 이 저장소 비해당(Claude apps gateway(`managed.policies[].code`, `allowedProviders`, `forceLoginMethod`)·`claude self-hosted-runner`·Cloud sessions·`[Claude Tag]`·`[Code Review]` 항목, VSCode 전용 항목, Windows 전용 수정, mods·plugin API(`$.agent.register`, `$.http.fetch`, plugin marketplace·secret) 및 `/plugin` 표시, 터미널 렌더링·복사·toast·fullscreen·transcript 토글·`/diff`·`←` 세부 UI, `--teleport`, claude.ai synced skill·plugin, `claude purge`, OpenTelemetry `git_commit_id`, 번들 dataviz skill, `/code-review` 출력 형식, `CLAUDE_CODE_TRANSCRIPT_LOCAL_GC`, Workflow 스크립트의 깊은 중첩·CRLF 처리 등 harness 비영향 세부사항이며 이 저장소는 해당 기능을 개발하거나 사용하지 않습니다). 실측: `gh release view v2.1.296 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 79건 중 위 본문 22건을 다뤘으므로 79 − 22 = 57건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 훅(managed 훅·플러그인 SessionStart·`--debug`), 에이전트·서브에이전트, 권한·파일 편집, MCP·headless, 백그라운드 항목은 이 저장소에 해당 구성(managed settings, `autoCompactWindow`, 비UTF-8 파일, 관련 env)이 없거나 기존 룰이 이미 다루는 전제를 보강하는 항목이며 룰 문안 변경은 불필요합니다.
- 후속 실측 후보: (1) `claude --debug`로 에이전트 로드 시 `limitations`·`domain`·`soul`·`source`가 unrecognized로 보고되는지 확인합니다. (2) haiku 에이전트 3개의 `resolvedModel`을 확인합니다(2.1.293 절과 같은 후보). (3) `playwright-compress.sh`의 최상위 `updatedMCPToolOutput` 키가 적용되는지 확인합니다.
- 모델 카탈로그 셀 정정: Sonnet 5.5 cache read 비용 표기는 이번 변경에서 R006 Tier-2 표(`.claude/rules/MUST-agent-design.md:52`)와 `guides/multi-model-routing/README.md:38`에 정정되었습니다. 이는 카탈로그 값 정정이며 에이전트 행동 규범을 바꾸는 변경은 아닙니다. 위 첫 항목의 "룰 문안 변경은 불필요"는 이 카탈로그 셀을 제외한 규범 문안을 가리킵니다.
- 이 문서의 규범 변경 제안은 없습니다(CC 2.1.296 CHANGELOG 항목 기준).

---

## v2.1.299 (2026-10-14)

> Issue: #1861 — Claude Code v2.1.299 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 상한 이후 릴리즈 2.1.300~2.1.310의 CHANGELOG 절을 각각 잘라 "2.1.299"와 "Revert"를 검색했습니다. "2.1.299"는 11개 절에서 한 번도 나타나지 않았습니다(절마다 `awk -v v="<버전>" '/^## /{p=($2==v)} p' CHANGELOG.md`로 자른 파일에 `grep -c '2\.1\.299'` = 0). 대소문자를 무시한 "revert"는 2곳에서 나타났으며 둘 다 git의 revert 상태 감지에 관한 문장입니다. 2.1.300의 "Fixed the diff view in Claude Desktop and Remote Control sessions not noticing a conflicted cherry-pick or revert in reftable repositories"와 2.1.301의 "Fixed `/diff` not noticing a conflicted cherry-pick or revert in reftable repositories when one of its git checks timed out or failed"이며, 이 릴리즈 항목을 되돌리거나 좁히는 문장은 관측한 범위에서 찾지 못했습니다. 릴리즈 게시 시각은 2026-10-14T02:49:42Z입니다(`gh release view v2.1.299 -R anthropics/claude-code --json publishedAt`).

### 훅 · 프롬프트 제출 순서

- CHANGELOG 원문: "Changed `UserPromptSubmit` hooks to run before a skill or custom slash command expands, so a hook that blocks the prompt now also stops its embedded shell commands"
  (299) `UserPromptSubmit` 훅이 스킬이나 사용자 정의 슬래시 커맨드가 확장되기 전에 실행되도록 바뀌어, 프롬프트를 차단하는 훅이 이제 그 커맨드에 포함된 셸 명령도 멈춥니다. CC가 로드하는 `.claude/settings.json:233`의 `UserPromptSubmit`에는 command 훅 4개(`user-prompt-preprocessor.sh`, `r007-r008-drift-advisor.sh`, `session-autofix-prompt.sh`, `fail-axis-cause-advisor.sh`)가 배선되어 있습니다(`jq -c '[(.hooks.PreToolUse | length), ([.hooks.PreToolUse[] | .hooks[]] | length), ([.hooks.UserPromptSubmit[] | .hooks[]] | length)]' .claude/settings.json` = `[11,14,4]`). 이 중 세 스크립트는 `"decision": "block"`을 내보내지 않도록 주석으로 명시합니다(`.claude/hooks/scripts/user-prompt-preprocessor.sh:28`, `.claude/hooks/scripts/r007-r008-drift-advisor.sh:442`, `.claude/hooks/scripts/fail-axis-cause-advisor.sh:20`). R021은 이 중 `r007-r008-drift-advisor.sh`와 `fail-axis-cause-advisor.sh`를 Advisory 계층으로 분류합니다(`.claude/rules/MUST-enforcement-policy.md:23`, `:25`). 네 스크립트를 세 가지로 조회했습니다(각각 `-- <네 스크립트 경로>`): `git grep -n -i -E 'decision|block'`, `git grep -n -E 'exit [1-9]|"continue"|continue *:|stopReason'`, `git grep -n -E 'exit +"?\$'`. 앞의 두 조회에서 나온 히트는 주석 줄(예: `.claude/hooks/scripts/r007-r008-drift-advisor.sh:117`~`:119`, `:442`, `.claude/hooks/scripts/user-prompt-preprocessor.sh:28`, `:97`, `.claude/hooks/scripts/fail-axis-cause-advisor.sh:20`, `:130`)과 `r007-r008-drift-advisor.sh`에서 content block을 다루는 jq 줄(`:266`~`:309`)이었습니다. 셋째 조회는 출력이 없었고(rc=1), `session-autofix-prompt.sh`에서는 세 조회 어디에서도 히트가 나오지 않았습니다. 따라서 관측한 범위(위 세 조회)에서 이 네 훅은 명시적인 차단 출력(`decision`·`continue`·`stopReason` 키)이나 명시적인 차단 종료 코드(`exit 2`)를 내지 않습니다. 다만 세 스크립트는 `set -euo pipefail`로 실행되므로(`.claude/hooks/scripts/fail-axis-cause-advisor.sh:41`, `.claude/hooks/scripts/user-prompt-preprocessor.sh:41`, `.claude/hooks/scripts/r007-r008-drift-advisor.sh:129`; `session-autofix-prompt.sh`에는 `git grep -n -E '^set -'` 히트 없음) 보호되지 않은 명령이 실패하면 그 명령의 종료 코드로 끝날 수 있고, 이 `set -e` 경로는 조회하지 않았습니다. 차단 시 셸 명령도 멈춘다는 변경은 명시적 차단 경로 기준으로 이 훅들에 해당하지 않으며, `set -e` 경로까지 포함한 판정은 [가설 — 각 스크립트에서 보호 없이 실패할 수 있는 명령이 종료 코드 2로 끝날 수 있는지 확인하면 판정 가능]로 남깁니다. 두 스크립트는 훅 입력의 `.prompt`를 읽습니다(`.claude/hooks/scripts/user-prompt-preprocessor.sh:54`, `.claude/hooks/scripts/fail-axis-cause-advisor.sh:54`). 훅이 확장 전에 실행되므로 `/fsd` 같은 스킬 호출에서 `.prompt`가 확장 전 원문을 담을 수 있습니다 [가설 — 2.1.299 전후로 `/<skill>` 프롬프트의 훅 stdin `.prompt`를 캡처해 비교하면 판정 가능]. 스킬 본문의 셸 주입 표기는 ``git grep -c -E '!`' -- '.claude/skills/*/SKILL.md'`` 출력 1줄(`.claude/skills/omcustom-release-notes/SKILL.md:1`)이며, 그 줄(`:164`)은 커밋 메시지의 `!` breaking 표기 설명이라 셸 주입 구문이 아닙니다.
- CHANGELOG 원문: "Changed a skill's own front-matter `UserPromptSubmit` hook to first run on the prompt after the one that invokes the skill"
  (299) 스킬 frontmatter에 선언된 `UserPromptSubmit` 훅이 그 스킬을 호출한 프롬프트가 아니라 그다음 프롬프트에서 처음 실행되도록 바뀌었습니다. 관측한 범위에서 `.claude/skills/*/SKILL.md`에는 `hooks:` frontmatter 줄과 `UserPromptSubmit` 문자열이 나타나지 않으므로(`git grep -n -E '^hooks:' -- '.claude/skills/*/SKILL.md'`와 `git grep -n UserPromptSubmit -- '.claude/skills/*/SKILL.md'` 둘 다 출력 없음) 이 저장소 스킬에는 해당하지 않습니다.
- CHANGELOG 원문: "Fixed plan mode running a write (an MCP tool's, a file's, a shell command's) that a `PreToolUse` hook or a mod's `tool.check` hook allowed"
  (299) `PreToolUse` 훅이나 mod의 `tool.check` 훅이 허용한 쓰기(MCP 도구·파일·셸 명령)를 plan mode가 실행하던 결함이 수정되었습니다. `.claude/settings.json:37`의 `PreToolUse`에는 matcher 그룹 11개와 훅 명령 14개가 있습니다(위 `jq -c` 출력 `[11,14,4]`의 앞 두 값). 관측한 범위에서 이 훅들은 `permissionDecision`을 출력하지 않으므로(`git grep -n permissionDecision -- .claude/settings.json .claude/hooks templates/.claude/settings.json` rc=1) 훅이 명시적으로 허용하는 경로는 관측되지 않았습니다. 종료 코드 0으로 끝나는 훅이 결함 조건의 "allowed"에 해당했는지는 원문이 밝히지 않습니다 [가설 — 구버전 plan mode에서 exit 0으로 끝나는 `PreToolUse` 훅 뒤의 Write가 실행되는지 재현하면 판정 가능]. 에이전트 frontmatter에서 `plan` permission mode나 `opusplan` 모델은 관측되지 않았습니다(`git grep -n -E '^permissionMode:|^model: *opusplan' -- '.claude/agents/*.md'` 49줄이 모두 `permissionMode: bypassPermissions`). R006 Permission Mode 표는 `plan`을 "Require plan approval"로 설명합니다(`.claude/rules/MUST-agent-design.md:382`). 사용자가 대화형 세션에서 plan mode를 쓸 때의 영향은 측정하지 않았습니다.

### 서브에이전트 · SendMessage · 백그라운드 알림

- CHANGELOG 원문: "Fixed background subagents in auto mode sometimes sending their final report twice, once as the result and once as a message"
  (299) auto mode의 백그라운드 서브에이전트가 때때로 최종 보고를 결과로 한 번, 메시지로 한 번, 두 번 보내던 결함이 수정되었습니다. R009는 완료 알림에 보고 본문이 없으면 한 턴 기다린 뒤 산출물을 실측하고 `SendMessage`로 재요청하도록 규정합니다(`.claude/rules/MUST-parallel-execution.md:368`). 구버전에서 같은 보고가 두 번 도착하면 별개의 완료나 재요청에 대한 응답으로 오인할 수 있으므로, 보고 횟수가 아니라 산출물 실측으로 완료를 판정하는 R020 원칙을 그대로 적용합니다. 저장소가 추적하는 permission mode 값은 project `.claude/settings.json:23`의 `"defaultMode": "bypassPermissions"`입니다(`git ls-files .claude/settings.local.json` 출력 없음, `git check-ignore -v --no-index .claude/settings.local.json` = `.gitignore:40:.claude/*`). 유지보수자 기기에서는 `jq -r '.permissions.defaultMode // "unset"' ~/.claude/settings.json .claude/settings.json .claude/settings.local.json`의 출력이 `auto`, `bypassPermissions`, `bypassPermissions`로 관측되었으며, user·local 값은 기기 로컬 값입니다. R010은 user `auto`와 project·local `bypassPermissions` 조합이 `claude -p`에서 `default`로 시작한다고 기록하고, 같은 문단에서 대화형 TTY 세션은 2026-09-02 기록("auto mode is active")과 조정되지 않은 `[가설]`로 남깁니다(`.claude/rules/MUST-orchestrator-coordination.md:588`). 대화형 세션이 auto mode로 실행되는지는 측정하지 않았습니다 [가설 — 세션의 실제 permission mode 표시로 판정].
- CHANGELOG 원문: "Fixed `SendMessage` not finding a subagent by name after the CLI restarted and resumed the session (names given before the last compaction still need the agent ID)"
  (299) CLI가 재시작되어 세션을 resume한 뒤 `SendMessage`가 이름으로 서브에이전트를 찾지 못하던 결함이 수정되었습니다. 원문 괄호는 이 수정의 예외로, 재시작·resume 뒤에도 마지막 compaction 이전에 붙인 이름은 여전히 agent ID가 필요하다고 적습니다. R018은 이름을 붙인 `Agent` 스폰이 세션의 암묵적 팀의 팀원을 만든다고 기록하고(`.claude/rules/MUST-agent-teams.md:22`), R009는 보고가 빠진 위임을 `SendMessage`로 재요청하도록 규정합니다(`.claude/rules/MUST-parallel-execution.md:368`). 따라서 재시작·resume를 거친 세션에서 마지막 compaction 이전에 붙인 이름의 위임을 이어갈 때는 agent ID로 `SendMessage`를 보내야 합니다. 재시작 없이 compaction(아래 idle compaction 포함)만 거친 세션의 이름 조회는 원문이 다루지 않습니다 [가설 — 재시작 없이 compaction된 세션에서 compaction 이전 이름으로 `SendMessage`를 보내 보면 판정 가능]. 그 경우에도 agent ID 사용을 예방 조치로 권합니다. 이 저장소 위임에서 이름 기반 `SendMessage`를 얼마나 쓰는지는 측정하지 않았습니다.
- CHANGELOG 원문: "Improved background agent notifications: they now say when an agent is only waiting on its own background work, got a message too late for its result, or was stopped by a usage limit"
  (299) 백그라운드 에이전트 알림이 이제 에이전트가 자기 백그라운드 작업을 기다리고 있을 뿐인 경우, 결과에 반영되기에는 늦게 메시지를 받은 경우, 사용량 한도로 멈춘 경우를 알려줍니다. 새 문구는 실측할 대상을 고르는 신호로 쓸 수 있지만 완료 증거는 아닙니다. R018 「Member Completion Verification」(`.claude/rules/MUST-agent-teams.md:501`의 제목, `:503`의 본문)과 R009 결과 수집 절차(`.claude/rules/MUST-parallel-execution.md:368`)의 ground-truth 실측 의무는 바뀌지 않습니다.
- CHANGELOG 원문: "Changed agent `tools:` lists to take only the named MCP server's tools; list a server whose name contains `__` as `mcp__<whole name>__*`"
  (299) 에이전트 `tools:` 목록이 이름으로 지정한 MCP 서버의 도구만 받도록 바뀌었고, 이름에 `__`가 들어 있는 서버는 `mcp__<whole name>__*`로 적어야 합니다. 관측한 범위에서 `.claude/agents/*.md`에는 `mcp__` 항목이나 `mcpServers:` 줄이 없으므로(`git grep -n -E 'mcp__|^mcpServers:' -- '.claude/agents/*.md'` 출력 없음) 이 저장소 에이전트 정의에는 해당하지 않습니다.

### 권한 · MCP 규칙 · settings

- CHANGELOG 원문: "Changed MCP allow rules to reach only the server they name: `mcp__a` no longer allows a server named `a__b` or `a_`; write `mcp__<server>__*` with the server's whole normalized name"
  (299) MCP allow 규칙이 이름으로 지정한 서버에만 적용되도록 바뀌어, `mcp__a`가 더 이상 `a__b`나 `a_`라는 서버를 허용하지 않습니다. 관측한 범위(`git grep -n -E 'mcp__|enabledMcpjsonServers|disabledMcpjsonServers|enableAllProjectMcpServers' -- .claude/settings.json templates/.claude/settings.json`)에서 두 설정 파일의 `mcp__` 문자열은 `PostToolUse` 훅의 `"matcher"` 값(`.claude/settings.json:582`, `templates/.claude/settings.json:548`)이며 permission 규칙이 아닙니다. 유지보수자 기기의 gitignore된 `.claude/settings.local.json`(저장소 추적 대상 아님)에서 관측한 `mcp__`도 훅 `"matcher"` 값이었습니다(`command grep -n -E 'mcp__|McpjsonServers' .claude/settings.local.json`). `.mcp.json`의 서버 이름은 `ontology-rag`(`.mcp.json:3`)와 `eraser`(`.mcp.json:14`)이고(`jq -c '.mcpServers | to_entries | map({name: .key, type: (.value.type // "stdio")})' .mcp.json` 출력 2개 항목) `__`나 끝의 `_`를 포함하지 않습니다. 따라서 이 변경의 영향 조건은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed deny and ask rules for an MCP server (`mcp__<server>`) not applying when the server's normalized name contains a double underscore"
  (299) 정규화된 서버 이름에 이중 밑줄이 들어 있으면 그 MCP 서버의 deny·ask 규칙(`mcp__<server>`)이 적용되지 않던 결함이 수정되었습니다. 바로 위 항목의 근거대로 관측한 범위의 설정 파일에는 `mcp__` permission 규칙이 없고 `.mcp.json` 서버 이름에 `__`가 없으므로 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed a settings file being ignored when `enabledMcpjsonServers` or `disabledMcpjsonServers` held a single server name (letters, digits, - or _) as a plain string"
  (299) `enabledMcpjsonServers`나 `disabledMcpjsonServers`가 서버 이름 하나를 일반 문자열로 담으면 그 설정 파일이 무시되던 결함이 수정되었습니다. `.claude/settings.json:26`~`:28`의 `enabledMcpjsonServers`는 배열(`["ontology-rag"]`)입니다. 유지보수자 기기의 gitignore된 `.claude/settings.local.json`(`git check-ignore -v --no-index .claude/settings.local.json` = `.gitignore:40:.claude/*`)에서도 이 키가 배열로 시작하는 것을 관측했습니다. `templates/.claude/settings.json`에는 이 키가 나타나지 않습니다(위 `git grep`). 관측한 값이 문자열이 아니므로 결함 조건에 해당하지 않습니다.
- CHANGELOG 원문: "Fixed `claude mcp list`, `claude mcp get` and subagent MCP servers starting a server that a policy check blocks; it is now reported as blocked without being started"
  (299) `claude mcp list`·`claude mcp get`과 서브에이전트 MCP 서버가 정책 검사로 차단된 서버를 시작하던 결함이 수정되어, 이제 시작하지 않고 blocked로 보고합니다. 서브에이전트 소절의 `tools:` 항목에서 실행한 `git grep -n -E 'mcp__|^mcpServers:' -- '.claude/agents/*.md'`(출력 없음)대로 에이전트 frontmatter에 `mcpServers:` 줄이 없으므로 서브에이전트 MCP 서버 경로는 관측되지 않았고, managed 정책 설정은 확인하지 않았습니다.
- CHANGELOG 원문: "Fixed MCP connections over HTTP hanging for 30 seconds and failing when a server never ends the body of its reply to a notification (anthropics/claude-code#99014)"
  (299) 서버가 알림에 대한 응답 본문을 끝내지 않으면 HTTP 기반 MCP 연결이 30초 동안 멈췄다가 실패하던 결함이 수정되었습니다. `.mcp.json:14`~`:16`의 `eraser`는 `"type": "http"` 서버이므로 이 결함 조건에 들어갈 수 있는 연결입니다 [가설 — `eraser` 서버가 알림 응답 본문을 끝내지 않는지는 미관측이며, 2.1.299 미만에서 `eraser` 연결 시 30초 정지 후 실패가 재현되면 판정 가능]. v2.1.295 절의 원격 MCP 재연결 항목도 같은 `eraser` http 서버를 관련 연결로 다뤘습니다. 다만 그 항목의 원문은 headless·SDK 세션의 원격 MCP 서버에 한정되었고, 이번 수정의 원문은 세션 종류를 한정하지 않습니다. `ontology-rag`는 `.mcp.json:4`의 `"type": "stdio"`이므로 HTTP 연결 조건에 해당하지 않습니다.
- CHANGELOG 원문: "Fixed rm prompts on shell `-c` scripts that don't run `rm`. An rm built at run time in a script Claude Code can't read no longer prompts unless `CLAUDE_CODE_STRICT_INLINE_SHELL_RM_PROMPT=1`"
  (299) `rm`을 실행하지 않는 셸 `-c` 스크립트에 rm 확인 프롬프트가 뜨던 결함이 수정되었습니다. 또한 Claude Code가 읽을 수 없는 스크립트 안에서 실행 시점에 조립된 rm은 `CLAUDE_CODE_STRICT_INLINE_SHELL_RM_PROMPT=1`이 아니면 더 이상 프롬프트를 띄우지 않습니다. R005는 즉석 순회를 `xargs`·배열·`bash -c`로 쓰도록 권하므로(`.claude/rules/MAY-optimization.md:43`) 앞 절은 이 형태의 불필요한 프롬프트를 줄이는 방향입니다. 뒤 절은 확인 프롬프트 하나를 기본으로 없애는 방향이며, 관측한 범위(`git grep -n STRICT_INLINE_SHELL -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1)에서 이 저장소는 그 환경 변수를 설정하지 않습니다. R006 표에 따르면 `bypassPermissions`는 "Skip all permission prompts"이므로(`.claude/rules/MUST-agent-design.md:381`) 이 변경은 다른 permission mode로 실행되는 세션에서 관련됩니다. 위 서브에이전트 항목에서 유지보수자 기기로 관측한 조합(user `auto` + project·local `bypassPermissions`)은 R010 기록상 `claude -p`에서 `default`로 시작하므로(`.claude/rules/MUST-orchestrator-coordination.md:588`) 그런 기기의 무인 실행에도 관련될 수 있습니다. 이 저장소의 파괴적 명령 방어에는 CC 프롬프트와 별개로 `PreToolUse` Bash 훅(`destructive-git-guard.sh`, `rule-deletion-guard.sh`)도 있지만, 이 훅들이 실행 시점에 조립된 rm을 잡는지는 측정하지 않았습니다 [가설 — 합성 입력으로 두 훅을 재현하면 판정 가능].

### 컨텍스트 · compaction · 상태줄

- CHANGELOG 원문: "Added idle compaction in the terminal: a 200K+ token conversation left idle for about 54 minutes is compacted before its one-hour prompt cache expires, so your next message doesn't reprocess it all"
  (299) 터미널에서 200K 토큰 이상인 대화가 약 54분 동안 유휴 상태로 남으면, 1시간 prompt cache가 만료되기 전에 compact해 다음 메시지가 전체를 다시 처리하지 않도록 하는 idle compaction이 추가되었습니다. compact된 뒤에는 R010 「Session Continuity」의 CLAUDE.md 재독 의무(`.claude/rules/MUST-orchestrator-coordination.md:848`의 제목, `:850`의 본문)와 R021의 `SessionStart` 재주입 경로(`.claude/rules/MUST-enforcement-policy.md:9`의 각주, `claude-md-reinject.sh`)가 적용됩니다. 위 `SendMessage` 항목의 제한(재시작·resume 뒤 마지막 compaction 이전 이름은 agent ID 필요, 재시작 없는 compaction은 [가설])과 아래 `/reload-skills` 항목도 함께 관련됩니다. R013의 컨텍스트 예산은 사용량 기준입니다(`.claude/rules/SHOULD-ecomode.md:172`의 보이는 제목 "R013 context budget (usage-based)", `:181`의 DETAIL 주석). 같은 파일의 DETAIL 주석(`:174`~`:182`)에 있는 Token Guardian 행은 "1h cache TTL idle detection"을 트리거로 적고 있어(`:179`) idle compaction과 같은 유휴 구간을 겨냥합니다 [가설 — cc-token-saver 설치 여부와 실제 동작은 미관측이며, 두 장치가 함께 켜진 환경에서 유휴 구간 동작을 관찰하면 판정 가능]. 원문이 "in the terminal"로 한정하므로 `claude -p` 무인 실행에 적용되는지는 확인하지 않았습니다.
- CHANGELOG 원문: "Added `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` to change idle compaction's 200K-token minimum; `"idleCompaction": false` in settings.json turns it off. Both need v2.1.290 or later"
  (299) `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`로 idle compaction의 200K 토큰 하한을 바꿀 수 있고, settings.json의 `"idleCompaction": false`로 끌 수 있습니다. 원문은 둘 다 v2.1.290 이상이 필요하다고 적습니다. 관측한 범위(`git grep -n -i -E 'idleCompaction|IDLE_COMPACT' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1)에서 이 저장소는 어느 쪽도 설정하지 않으므로 터미널 세션에서는 기본 동작을 따릅니다 [가설 — 기본 활성 여부는 원문의 "turns it off"에서 추론했으며, 200K 토큰을 넘긴 세션을 54분 이상 두어 compaction 발생을 관찰하면 판정 가능].
- CHANGELOG 원문: "Fixed replies cut off at the output token limit ending the turn silently, with no retry or error, after a request fell back to non-streaming mode"
  (299) non-streaming 모드로 폴백한 요청에서 출력 토큰 한도에 걸려 잘린 응답이 재시도나 오류 없이 턴을 조용히 끝내던 결함이 수정되었습니다. R004는 v2.1.246·v2.1.257의 자동 이어감 경계를 기록하고(`.claude/rules/SHOULD-error-handling.md:28`, `:30`), 서브에이전트 중간 종료를 진단할 때 R020 「maxTurns 절단 실증」의 turn 한도를 먼저 확인하도록 안내합니다(`:30`). 2.1.299 미만 세션에서 표시 없이 끝난 응답은 turn 한도나 네트워크 절단이 아니라 이 결함이었을 수 있으므로 진단 후보에 포함합니다 [가설 — non-streaming 폴백 여부를 트랜스크립트에서 확인해야 판정 가능].
- CHANGELOG 원문: "Improved `/reload-skills` to say it re-sends the full skill list to Claude, which is how to get skills back after compaction"
  (299) `/reload-skills`가 전체 스킬 목록을 Claude에게 다시 보낸다고 안내하도록 개선되었으며, 원문은 이것이 compaction 뒤 스킬을 되찾는 방법이라고 적습니다. 이 저장소는 스킬 114개를 추적합니다(`git ls-files '.claude/skills/*/SKILL.md' | wc -l` = 114). R013의 v2.1.261 노트는 `/skill-doctor`를 스킬 컨텍스트 비용 진단 수단으로 기록합니다(`.claude/rules/SHOULD-ecomode.md:97`). `/reload-skills`는 사용자가 입력하는 슬래시 커맨드이므로, 대화형 세션에서 compaction(위 idle compaction 포함) 뒤 스킬을 찾지 못할 때 복구 수단이 됩니다. 무인 `claude -p` 실행에서 이 커맨드를 쓸 수 있는지는 확인하지 않았습니다. compaction 뒤 이 저장소 세션에서 스킬 목록이 실제로 빠졌는지는 관측하지 않았습니다.
- CHANGELOG 원문: "Fixed `/usage`, the approaching-limit warning (terminal and VS Code) and the status line sometimes showing more than 100% used (anthropics/claude-code#92238)"
  (299) `/usage`, 한도 근접 경고(터미널·VS Code), 상태줄이 때때로 사용량을 100% 넘게 표시하던 결함이 수정되었습니다. R012 상태줄 스크립트는 `rate_limits.five_hour.used_percentage`와 `rate_limits.seven_day.used_percentage`를 읽고(`.claude/statusline.sh:103`~`:104`) 정수로 바꾼 값을 상한 없이 `RL:${rl_5h_int}%`로 표시합니다(`:350`~`:351`). 원문의 "the status line"이 상태줄 명령에 전달되는 `rate_limits` 값까지 포함한다면, 구버전에서 RL 세그먼트에 나타난 100% 초과 값은 스크립트가 아니라 플랫폼 값에서 왔을 수 있습니다 [가설 — 구버전 상태줄 stdin의 `used_percentage`가 100을 넘었는지 캡처하면 판정 가능].

### 무인 · headless(`-p`) 실행

- CHANGELOG 원문: "Fixed `claude -p` saying nothing when a settings file fails validation: text-output runs now list the file and the invalid entry on stderr"
  (299) 설정 파일이 검증에 실패해도 `claude -p`가 아무것도 알리지 않던 결함이 수정되어, 이제 텍스트 출력 실행은 stderr에 그 파일과 잘못된 항목을 표시합니다. `/fsd`는 `claude -p`·예약 실행 같은 무인 경로를 다루고(`.claude/skills/fsd/SKILL.md:133`, `:172`), R010은 유효 permission mode를 `claude -p` init 값으로 실측한 기록에 기대고 있습니다(`.claude/rules/MUST-orchestrator-coordination.md:588`). 이 저장소의 `.claude/settings.json`은 `_comment_defaultMode` 같은 주석용 키를 담고 있습니다(`.claude/settings.json:22`). 2.1.299 이상에서 이 파일이 검증 오류를 내는지는 실행해 보지 않았습니다 [가설 — `claude -p` 텍스트 출력 실행의 stderr를 확인하면 판정 가능].
- CHANGELOG 원문: "Fixed a regression in 2.1.296 where cloud and headless sessions could run an approved tool call twice if a new message arrived as the session resumed after a restart"
  (299) 2.1.296에서 생긴 회귀로, cloud·headless 세션이 재시작 후 resume되는 동안 새 메시지가 도착하면 승인된 도구 호출을 두 번 실행할 수 있던 결함이 수정되었습니다. 영향 구간은 2.1.296 이상 2.1.299 미만이며, 원문의 발생 조건은 재시작, 그 뒤의 resume, resume 도중 새 메시지 도착의 세 가지입니다. `/fsd`를 `claude -p`로 돌리는 경로(`.claude/skills/fsd/SKILL.md:172`)에서 이 구간에 세 조건이 함께 일어났다면 `git commit`·`gh issue create` 같은 비멱등 호출이 중복되었을 수 있으므로, 그 구간의 무인 실행 결과는 중복 커밋·이슈 여부를 실측으로 확인하는 것이 좋습니다 [가설 — 해당 구간에서 세 조건이 함께 발생했는지는 미관측].
- CHANGELOG 원문: "Fixed MCP tool calls in headless and SDK sessions sometimes failing or running twice when a background reconnect closed the connection they were running on"
  (299) headless·SDK 세션에서 백그라운드 재연결이 실행 중인 연결을 닫으면 MCP 도구 호출이 때때로 실패하거나 두 번 실행되던 결함이 수정되었습니다. `.mcp.json`에는 stdio 서버 `ontology-rag`(`:3`~`:4`)와 원격 http 서버 `eraser`(`:14`~`:16`)가 있으며, 이 항목은 v2.1.295 절에서 다룬 원격 MCP 재연결 수정과 같은 계열입니다. 무인 실행에서 `eraser`의 생성 도구가 두 번 실행되면 중복 산출물이 생길 수 있습니다 [가설 — 무인 실행에서 `eraser` 도구 사용은 미관측]. R019는 enrichment 실패 시 조용히 건너뛰도록 규정하므로(`.claude/rules/SHOULD-ontology-rag-routing.md:39`의 「Failure Handling」 제목, `:43`의 "MCP server unavailable" 행, `:48`) `ontology-rag` 호출 실패는 라우팅을 막지 않습니다.

### 예약 작업 · `/loop`

- CHANGELOG 원문: "Fixed scheduled tasks and loops firing again after every turn, or firing early, during the repeated hour when daylight saving time ends"
  (299) 서머타임이 끝나 같은 시각이 반복되는 한 시간 동안 예약 작업과 루프가 매 턴 뒤 다시 발화하거나 일찍 발화하던 결함이 수정되었습니다. 원문은 세션 종류를 한정하지 않습니다. `/fsd`는 self-paced `/loop`를 반복 수단의 하나로 설명하고(`.claude/skills/fsd/SKILL.md:39`), 세션이 무인(`claude -p`, 예약 실행)이라 자기 페이싱이 필요할 때 `/goal`·`/loop` 호출을 권장합니다(`:172`). 따라서 2.1.299 미만에서 서머타임을 적용하는 시간대의 서머타임 종료 구간에 `/loop`로 `/fsd`를 돌린 경우 반복이 매 턴 뒤 다시 발화하거나 일찍 발화했을 수 있습니다 [가설 — 원문의 "loops"가 self-paced `/loop`를 포함하는지와 서머타임 종료 구간의 `/fsd` 실행 사례는 미관측].
- CHANGELOG 원문: "Fixed scheduled tasks being announced for the wrong minute: the scheduling tools now report each job's actual next run time"
  (299) 예약 작업의 공지 시각이 잘못된 분(minute)으로 표시되던 결함이 수정되어, 이제 예약 도구가 각 작업의 실제 다음 실행 시각을 보고합니다. 원문은 세션 종류를 한정하지 않습니다. 관측한 범위(`git grep -n -E 'ScheduleWakeup|CronCreate' -- .claude/skills`)에서 이 저장소 스킬의 예약 도구 언급은 `/fsd`의 `/loop`(ScheduleWakeup) 설명(`.claude/skills/fsd/SKILL.md:162`)과 `claude-native` 스킬 예약 실행 절의 CronCreate 언급(`.claude/skills/claude-native/SKILL.md:232` 절 제목 "### Scheduled (CronCreate)", `:240` "Or via CronCreate MCP tool for programmatic scheduling.")입니다. 그 절의 주 경로는 `/schedule`(`:234`, `:237`)이고 CronCreate MCP 도구는 대안입니다. `/loop`(ScheduleWakeup)나 CronCreate MCP 도구로 예약한 작업은 2.1.299 미만에서 보고된 다음 실행 시각이 실제와 분 단위로 어긋났을 수 있습니다 [가설 — ScheduleWakeup이 원문의 "scheduling tools"에 포함되는지, `/schedule` routine이 이 항목의 대상인지, 두 도구 경로의 실제 사용은 미관측].

### 스킬 로딩 · Read/Write 도구

- CHANGELOG 원문: "Changed skill and command loading: one whose file or folder name has hidden, direction-changing or blank-like characters, `<` or `>` is no longer offered until renamed; such a `name:` is ignored"
  (299) 파일·폴더 이름에 숨김·방향 전환·공백 유사 문자나 `<`·`>`가 들어 있는 스킬과 커맨드는 이름을 바꿀 때까지 제공되지 않고, 그런 `name:`은 무시됩니다. 관측한 범위(python3 `os.walk` 검사)에서 `.claude/skills`와 `templates/.claude/skills` 아래 디렉토리·파일 이름 538개와 각 `SKILL.md`의 `name:` 값 가운데 출력 가능한 ASCII(0x21–0x7E) 밖 문자나 `<`·`>`를 포함한 항목은 0건이었고 `.claude/commands`는 존재하지 않으므로, 이 변경의 영향 조건은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed Read garbling UTF-16LE files with a byte-order mark, and Write dropping byte-order marks or silently converting Windows-1252, Shift-JIS, GBK or UTF-16BE files to UTF-8 (now refused)"
  (299) BOM이 있는 UTF-16LE 파일을 Read가 깨뜨리던 결함과, Write가 BOM을 빠뜨리거나 Windows-1252·Shift-JIS·GBK·UTF-16BE 파일을 UTF-8로 조용히 변환하던 결함이 수정되었으며, 후자는 이제 거부됩니다. `git ls-files -z`가 나열한 1,578개 경로 중 1개(`docs/plans/refs/latest`)는 심볼릭 링크이므로(`git ls-files -s`의 mode 120000 줄 1개) tracked 일반 파일은 1,577개입니다. python3 검사에서 앞 8,000바이트에 NUL이 없는 tracked 일반 파일 가운데 BOM이 있는 파일과 UTF-8로 디코드되지 않는 파일은 각각 0건이었으므로, 관측한 범위에서 tracked 텍스트 파일 편집에서 Write 거부가 생길 조건은 관측되지 않았습니다. NUL이 있어 바이너리로 분류한 파일(BOM 없는 UTF-16 파일이 섞여 있을 수 있음)은 인코딩 판정에서 제외했습니다.

기타 165건 — 이 저장소 비해당(mods·plugin API와 `claude plugin` eval·test·validate, Claude apps gateway·서드파티 `ANTHROPIC_BASE_URL`·managed settings 전달, Cowork·cloud sessions·Remote Control·self-hosted runner, VSCode·Windows·WSL·Claude Tag·Code Review 전용 항목, 터미널 렌더링·CJK 줄바꿈·붙여넣기·fullscreen UI, sandbox 경로 규칙, worktree·reftable, SDK·IDE·remote-control 세션의 `ScheduleWakeup` 결함, SDK·headless의 auto mode 모델 전환, `/btw`·`/ultrareview`·Artifact 도구·Claude in Chrome, 이미지·PDF·문서 첨부 처리, debug 로그 메모리, description 없이 시작한 팀원의 자격증명 표시, `/usage` 경고·plan mode 안내 줄 같은 안내 문구 등). 실측: `gh release view v2.1.299 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 190건 중 위 본문 25건을 다뤘으므로 190 − 25 = 165건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:

- 관측한 범위에서 이 릴리즈의 기본 동작 변경 중 이 저장소와 맞닿는 것에는 터미널 idle compaction(기본 동작, 위 [가설] 참조), `UserPromptSubmit` 훅의 실행 시점 이동, 실행 시점에 조립된 rm의 확인 프롬프트 제거(`CLAUDE_CODE_STRICT_INLINE_SHELL_RM_PROMPT=1`로 옛 동작 복원)가 있습니다. `idleCompaction`·`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` 설정 여부는 별도 결정 사안으로 이월합니다.
- 재시작·resume를 거친 세션에서는 마지막 compaction 이전에 붙인 이름 대신 agent ID로 `SendMessage`를 보냅니다. 재시작 없이 compaction만 거친 세션에서도 예방 조치로 agent ID를 씁니다. 대화형 세션에서 compaction 뒤 스킬이 보이지 않으면 `/reload-skills`를 씁니다. 관측한 범위에서 룰·CLAUDE.md·에이전트·훅 파일의 변경을 확정한 항목은 찾지 못했습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때 1줄).
- 2.1.296 이상 2.1.299 미만으로 `claude -p` 무인 실행을 했고 그 실행에서 재시작, resume, resume 도중 새 메시지 도착이 함께 일어났다면, 승인된 도구 호출의 중복 실행 회귀가 남긴 중복 커밋·이슈가 있는지 실측으로 확인합니다.
- (299) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.300 (2026-10-14)

> Issue: #1862 — Claude Code v2.1.300 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 2.1.301~2.1.310 CHANGELOG 절을 각각 잘라 `2.1.300` 문자열과 "Revert"(대소문자 무시)를 검색했습니다(`grep -n -i -E '2\.1\.300|revert' section-<버전>.md`). "2.1.300"은 305 절 한 곳에서 나타났으며, 그 문장은 "Self-hosted runner: Fixed a start script that shares only its stdout with the runner or orchestrator failing with `Resource temporarily unavailable` when `TERM` is set (a 2.1.300 regression)"입니다. 이 문장은 이 릴리즈의 self-hosted runner 항목 계열의 회귀 수정이며 이 저장소는 self-hosted runner를 쓰지 않으므로 무관합니다. "revert"는 301 절 "Fixed `/diff` not noticing a conflicted cherry-pick or revert in reftable repositories when one of its git checks timed out or failed" 한 곳에서만 나타났고, 이는 git revert 상태 감지 수정이지 롤백 문장이 아닙니다. 같은 영역의 후속 항목으로 302 절 "Changed prompt and agent hooks so that at most 12 of one event run at a time; the rest wait their turn", 304 절 "Changed tool search to be on by default behind a custom `ANTHROPIC_BASE_URL`; a 400 or 422 from the gateway is retried without it", 305 절 "Fixed every request failing on Vertex, Bedrock and other providers when the endpoint or a gateway rejects tool search, and behind gateways with ToolSearch disallowed or left out of `--tools` (a 2.1.304 regression): Claude Code now retries without it"가 있으나 모두 이 릴리즈 항목을 되돌리는 문장이 아닌 별개 변경입니다. artifact 갱신 영역의 301 절 항목은 아래 「Artifact 도구」 소절에서 다룹니다. 릴리즈 게시 시각은 2026-10-14T18:24:25Z입니다(`gh release view v2.1.300 -R anthropics/claude-code --json publishedAt`).

### 훅

- CHANGELOG 원문: "Fixed SessionEnd hooks sometimes not running when you exit while a background command is still running"
  (300) 백그라운드 명령이 아직 실행 중일 때 종료하면 SessionEnd 훅이 때때로 실행되지 않던 결함이 수정되었습니다. 이 저장소의 두 settings 파일에는 SessionEnd 훅이 배선되어 있지 않습니다(`jq -c '.hooks.SessionEnd // "absent"' .claude/settings.json templates/.claude/settings.json` 결과 두 파일 모두 `"absent"`). R011 Session-End Auto-Save는 사용자 발화("끝", "종료" 등)로 세션 종료를 감지한다고 규정하므로(`.claude/rules/SHOULD-memory-integration.md:445`) 이 수정의 직접 대상이 아니라고 봅니다.
- CHANGELOG 원문: "Fixed agent hooks ignoring their `model`: aliases like `haiku` now resolve, a subagent's model no longer overrides it, and an unavailable model falls back to the caller's instead of allowing the action"
  (300) `agent` 훅이 자신의 `model` 설정을 무시하던 결함이 수정되었습니다. 이제 `haiku` 같은 별칭이 해석되고, 서브에이전트의 모델이 훅의 모델을 덮어쓰지 않으며, 사용할 수 없는 모델은 동작을 허용하는 대신 호출자의 모델로 폴백합니다. 이 저장소의 두 settings 파일에서 훅 타입 분포는 `{"command":63,"prompt":1}`이고 `agent` 타입 훅은 0개입니다(`jq -c '[.hooks[][]?.hooks[]? | .type] | group_by(.) | map({(.[0]):length}) | add' .claude/settings.json templates/.claude/settings.json`; `git grep -n -E '"type": *"agent"' -- .claude templates/.claude` rc=1). 따라서 현재 배선에는 적용 대상이 없습니다. 원문의 마지막 절은 구버전에서 사용할 수 없는 모델을 지정한 `agent` 훅이 판정 없이 동작을 허용했다는 뜻이므로, 훗날 `agent` 훅을 차단 용도로 배선한다면 2.1.300 이상을 전제로 해야 한다고 봅니다.
- CHANGELOG 원문: "Changed hooks: `updatedInput` from PreToolUse and PermissionRequest hooks is now validated like Claude's own input: unknown keys are dropped, and input the tool rejects denies the call"
  (300) PreToolUse·PermissionRequest 훅이 돌려주는 `updatedInput`이 이제 Claude 자신의 입력과 같은 방식으로 검증됩니다. 원문은 결과를 두 갈래로 나눕니다. 알 수 없는 키는 버려지고, 도구가 거부하는 입력은 호출 자체를 거부합니다. 키가 버려진 뒤의 처리는 원문이 말하지 않습니다. 남은 입력이 도구 검증을 통과하면 그 키만 빠진 채 진행되고, 필수 키를 오타 내 그 키가 버려지면 남은 입력이 도구 검증에 걸려 거부될 수 있다고 봅니다 [가설 — `updatedInput`이 원래 입력 전체를 대체한다는 전제(원문은 대체인지 병합인지 말하지 않으며, 병합이라면 원래 입력의 필수 키가 남아 거부되지 않을 수 있음)와, 키가 버려진 뒤 호출이 진행되는지 거부되는지를 측정하지 않음]. 이 저장소의 훅은 `updatedInput`을 출력하지 않고 PermissionRequest 훅도 배선하지 않습니다(`git grep -n -E 'updatedInput|PermissionRequest' -- .claude/hooks .claude/settings.json templates/.claude/settings.json` rc=1). 따라서 이 동작 변경은 현재 배선에 영향을 주지 않습니다. 앞으로 입력을 고쳐 쓰는 PreToolUse 훅을 추가한다면 훅 검증 픽스처를 세 경우로 나눠야 합니다. 선택 키를 오타 내면 그 키가 오류 없이 버려져 의도한 수정이 조용히 빠질 수 있고, 필수 키를 오타 내면 위 [가설]의 전체 대체 전제에서 남은 입력이 도구 검증에 걸려 거부될 수 있으며, 도구 스키마에 맞지 않는 값은 호출 거부로 이어집니다.

### 백그라운드 · 프로세스

- CHANGELOG 원문: "Fixed Claude polling a background command's output file or sleeping while it runs"
  (300) 백그라운드 명령이 실행되는 동안 Claude가 그 출력 파일을 폴링하거나 sleep하던 결함이 수정되었습니다. 이 저장소의 릴리즈 대기 지침은 Bash 타임아웃 안의 유한 폴링이나 단일 `gh run watch <run-id> --exit-status`(선택적으로 `run_in_background`)를 무한 수동 폴링 루프보다 우선하라고 적고 있습니다(`.claude/skills/pipeline/workflows/auto-dev.yaml:1551`~`:1554`, #1711). 이 수정은 모델 쪽 행동에 관한 것이며 이 지침과 충돌하지 않으므로 지침 변경은 필요하지 않습니다. 구버전 세션 기록에서 백그라운드 명령을 기다리며 출력 파일을 반복 Read한 흔적은 위임 프롬프트 결함이 아니라 이 플랫폼 결함의 산물일 수 있습니다 [가설 — 해당 기간 트랜스크립트에서 반복 Read 패턴과 CC 버전을 대조하지 않음].
- CHANGELOG 원문: "Changed exit to force-kill background commands still running 1.5 seconds after being asked to stop; in fullscreen mode they could previously be left running"
  (300) 종료 시 정지 요청 후 1.5초가 지나도 실행 중인 백그라운드 명령을 강제 종료하도록 바뀌었습니다. 이전에는 fullscreen 모드에서 그런 명령이 남아 있을 수 있었습니다. 이 저장소의 R005는 프로세스를 띄운 스크립트를 정리한 직후 `pgrep -f <패턴> | wc -l`로 잔여 개수를 확인하라고 규정합니다(`.claude/rules/MAY-optimization.md:43`). 이 변경은 세션 종료 시점의 잔여를 줄이는 방향이지만 세션 도중 정리의 대체 수단은 아니므로 그 확인 절차는 그대로 유지합니다.
- CHANGELOG 원문: "Changed background sessions to resume a carried workflow through the Workflow tool's approval instead of running it from the handoff file"
  (300) 백그라운드 세션이 넘겨받은 workflow를 handoff 파일에서 바로 실행하는 대신 Workflow 도구의 승인을 거쳐 재개하도록 바뀌었습니다. 이 저장소의 두 스킬은 신규 DAG·오케스트레이션 작업에 네이티브 Workflow tool을 우선 쓰라고 권장합니다(`.claude/skills/dag-orchestration/SKILL.md:11`, `.claude/skills/task-decomposition/SKILL.md:11`). 관측한 범위(`git grep -n -i -E 'workflow tool|workflow script|workflow\(' -- .claude/skills`)에서 그 밖의 일치는 CI workflow 스크립트를 다루는 `.claude/skills/pipeline/workflows/auto-dev.yaml:851` 한 곳이므로, 스킬은 Workflow 도구 사용을 권장하지만 호출 절차나 스크립트를 정의하지는 않습니다. Workflow 스크립트에 대한 규범은 R023 「Workflow Script Sanity Check」(`.claude/rules/SHOULD-verification-ladder.md:320` 제목, `:322`부터 본문)에 있습니다. 무인 백그라운드 실행에서 workflow 재개가 승인 단계에서 멈출 수 있는지는 permission mode에 따라 달라질 것으로 보입니다 [가설 — 백그라운드 세션의 Workflow 승인 프롬프트를 permission mode별로 실측하지 않음].

### headless · resume · 트랜스크립트

- CHANGELOG 원문: "Fixed resuming a headless or Agent SDK session losing the recent messages a compaction had kept, when the compaction followed a reply cut at the output token limit (compactions from this version on)"
  (300) 출력 토큰 한도에서 잘린 응답 뒤에 compaction이 일어난 경우, headless 또는 Agent SDK 세션을 재개하면 compaction이 보존한 최근 메시지가 사라지던 결함이 수정되었습니다. 원문의 괄호("compactions from this version on")대로 이 수정은 2.1.300 이후에 일어난 compaction에만 적용됩니다. 이 저장소의 무인 실행 경로에는 `claude -p`를 쓰는 측정 절차(`.claude/rules/MUST-orchestrator-coordination.md:588`)와 리뷰어 호출(`.claude/skills/agora/SKILL.md:18`)이 있습니다. 출력 토큰 한도에서 잘린 응답 뒤에 2.1.300 이전 버전에서 compaction된 headless·Agent SDK 세션을 재개할 때는 여전히 compaction이 보존한 최근 메시지가 빠질 수 있다고 전제합니다.
- CHANGELOG 원문: "Fixed resuming a headless or Agent SDK session losing its compaction summary or bringing back pre-compaction history, when the compaction followed a retried or unfinished reply in the same turn"
  (300) 같은 턴에서 재시도되었거나 끝나지 않은 응답 뒤에 compaction이 일어난 경우, headless 또는 Agent SDK 세션을 재개하면 compaction 요약이 사라지거나 compaction 이전 기록이 되살아나던 결함이 수정되었습니다. R004는 비대화형 세션의 중단 응답 자동 이어감(v2.1.246+)을 기록하고 있으므로(`.claude/rules/SHOULD-error-handling.md:28`), 재시도·미완료 응답과 compaction이 겹치는 조합은 무인 루프에서 나타날 수 있습니다 [가설 — 이 저장소 무인 세션에서 해당 조합의 발생 빈도를 측정하지 않음]. 같은 턴의 재시도·미완료 응답 뒤에 compaction된 headless·Agent SDK 세션을 구버전에서 재개했을 때 compaction 요약이 빠졌거나 이미 요약된 이전 기록이 되살아난 것처럼 보였다면 이 결함이 원인 후보입니다.
- CHANGELOG 원문: "Fixed the first transcript entry written after resuming a session being lost when a crash had cut the transcript's last line short"
  (300) 크래시로 트랜스크립트의 마지막 줄이 잘린 상태에서 세션을 재개하면, 재개 후 처음 기록되는 트랜스크립트 항목이 사라지던 결함이 수정되었습니다. 이 저장소에서 `transcript_path`를 언급하는 훅 스크립트는 3개입니다(`git grep -n -l 'transcript_path' -- .claude/hooks` 결과 `r007-r008-drift-advisor.sh`, `session-env-check.sh`, `task-outcome-recorder.sh`; `session-env-check.sh`의 언급은 `:48` 주석 1곳입니다). R020 「Self-Violation Counting Is Also Diagnosis」(`.claude/rules/MUST-completion-verification.md:381` 제목)는 위반 계수를 트랜스크립트 파싱으로 하라고 요구하므로, 구버전 크래시 후 재개 세션의 트랜스크립트로 계수할 때는 재개 직후 1건이 누락되었을 수 있음을 함께 적습니다.
- CHANGELOG 원문: "Changed local session transcripts to also record each API request's system prompt, tools and parameters, so a transcript you choose to share can reproduce a request exactly"
  (300) 로컬 세션 트랜스크립트가 각 API 요청의 시스템 프롬프트, 도구, 파라미터도 기록하도록 바뀌었습니다. 유지보수자 기기의 로컬 트랜스크립트 1개로 레코드 형태를 측정했습니다. 대상은 `~/.claude/projects/<프로젝트>/` 바로 아래 `*.jsonl` 중 2026-10-25 측정 세션의 트랜스크립트(`version` 필드 최댓값 2.1.302)이고, 17:22 KST에 계수만 출력하는 스크립트로 측정했습니다. 세션이 진행 중이었으므로 수치는 측정 시점 값입니다. 이 파일에는 `api-request` 52줄, `api-request-blob` 56줄, `api-request-shape` 2줄이 별도 최상위 줄로 기록되어 있었습니다. `version` 최댓값이 2.1.288·2.1.289·2.1.294인 같은 디렉토리 트랜스크립트 5개에는 세 타입이 0줄이었고, 2.1.300·2.1.301 트랜스크립트는 이 디렉토리에 없었습니다. `api-request-blob` 56줄은 모두 `.message.role`을 가졌고(system 41, assistant 11, user 4이며 user 4줄 중 `tool_result` 블록이 없는 줄은 1줄), `isSidechain` 키는 56줄 모두 없었습니다. role이 assistant인 blob 11줄의 content에는 모두 `tool_use` 블록이 있었고 그중 6줄에는 `text` 블록도 있었습니다. 같은 시점 `tail -n 200` 창(isSidechain 필터 후)에서 role이 assistant인 줄 23개 중 4개가 `api-request-blob`이었습니다. `r007-r008-drift-advisor.sh`는 레코드 최상위 `.type`을 보지 않고 `.message.role`로 줄을 고릅니다(`.type?`은 content 블록 판별에만 씁니다). assistant 줄 인덱스 목록 생성(`.claude/hooks/scripts/r007-r008-drift-advisor.sh:232`)과 그 마지막 원소를 마지막 assistant 줄로 고르는 선택(`:235`), 턴 경계 판정(`:249`~`:251`, content가 문자열이거나 `tool_result` 블록이 없는 user 줄을 경계로 봄), 턴 구성(`:265`)이 그렇고, `:229`의 필터는 `isSidechain`이 없는 줄을 통과시킵니다. 창은 `:339`에서 `tail -n 200`으로 읽고 `:340`에서 그 줄 수를 세어 `:343`에서 `$wlc`로 넘깁니다. `:262`는 창 시작부터 마지막 assistant 줄까지(`:248`의 `range(0; $last + 1)`) 경계가 하나도 없고(`$bi`가 비어 있음) 창이 포화(`$wlc >= 200`)일 때에만 판정을 건너뜁니다. 따라서 blob 줄이 실제 응답 줄과 함께 턴으로 묶여 `tool_use`·announce가 이중 계수되거나, `tool_result`가 없는 user blob이 턴 경계로 잡힐 수 있습니다. 또한 추가된 줄이 실제 경계를 창 밖으로 밀어내 "경계 없음 + 포화" 조건이 더 자주 성립해 판정이 건너뛰어질 수 있습니다(반대로 `tool_result`가 없는 user blob은 창 안에 경계를 더할 수 있습니다) [가설 — 이 경로의 실제 오탐·미탐 발화는 관측되지 않음(not observed); 판정 기준은 2.1.300 이상 트랜스크립트에서 advisory 출력과 blob 줄을 제외한 재계산을 대조하는 것]. 또한 트랜스크립트 파일 크기가 커지므로, 트랜스크립트를 공유하거나 이슈에 첨부할 때 시스템 프롬프트 전문이 포함된다는 점을 확인합니다.

### MCP · 도구 검색

- CHANGELOG 원문: "Fixed automatic tool search (`ENABLE_TOOL_SEARCH=auto`) turning off part-way through a conversation, for example while MCP servers reconnect after a resume"
  (300) 자동 도구 검색(`ENABLE_TOOL_SEARCH=auto`)이 대화 도중, 예를 들어 resume 뒤 MCP 서버가 다시 연결되는 동안 꺼지던 결함이 수정되었습니다. 이 저장소는 `ENABLE_TOOL_SEARCH`를 설정하지 않으며(`git grep -n 'ENABLE_TOOL_SEARCH' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1, `jq -c '.env // {}' .claude/settings.json` = `{}`), tracked 파일 `.mcp.json`에는 `eraser`·`ontology-rag` 두 서버가 있습니다(`git show HEAD:.mcp.json | jq -c '.mcpServers|keys'`; 이 파일은 `.gitignore:49` 패턴에도 걸리지만 `git ls-files`에 포함되며 작업트리와 HEAD의 차이는 없습니다, `git diff --quiet HEAD -- .mcp.json` rc=0). R005의 DETAIL 주석(자동 주입되지 않음)은 도구 부재를 결론짓기 전에 `ToolSearch`로 실측하라고 적고 있습니다(`.claude/rules/MAY-optimization.md:140`). 도구 검색 자체는 동작이 관측되었습니다. 2026-10-25 측정 세션(유지보수자 기기, 트랜스크립트 `version` 2.1.302)의 위임 에이전트 컨텍스트에 지연 도구 목록과 `ToolSearch`로 로드하라는 안내가 있었고, R018은 `ToolSearch` 지연 로드 실측을 기록합니다(`.claude/rules/MUST-agent-teams.md:492`). 측정하지 않은 것은 그 도구 검색이 `auto` 모드로 동작하는지 여부입니다. 따라서 구버전에서 resume 뒤 MCP 서버가 다시 연결되는 동안 지연 도구가 지연 처리 없이 노출되던 현상이 있었다면 이 결함의 산물일 수 있습니다 [가설 — 이 저장소 세션의 도구 검색 모드가 `auto`인지 측정하지 않음].
- CHANGELOG 원문: "Fixed Claude not being told about an MCP server's tools and instructions until its next tool call, when the server finished connecting after a compaction"
  (300) compaction 뒤에 연결을 마친 MCP 서버의 도구와 지침이 다음 도구 호출 전까지 Claude에게 알려지지 않던 결함이 수정되었습니다. R019는 `ontology-rag` MCP 서버를 쓸 수 없으면 조용히 건너뛰라고 규정합니다(`.claude/rules/SHOULD-ontology-rag-routing.md:43`). 구버전 장기 세션에서 compaction 직후 라우팅 enrichment가 건너뛰어졌다면, 서버 부재가 아니라 이 고지 지연이 원인이었을 수 있습니다 [가설 — compaction 직후 `get_agent_for_task` 호출 가능 여부를 측정하지 않음].
- CHANGELOG 원문: "Fixed a conversation failing on every turn with a 400 error when the API rejected an MCP tool's input schema; Claude Code now sends that tool without parameters for the rest of the conversation"
  (300) API가 어떤 MCP 도구의 입력 스키마를 거부하면 대화가 매 턴 400 오류로 실패하던 결함이 수정되었고, 이제 그 도구는 남은 대화 동안 파라미터 없이 전송됩니다. 결과어에 주의해야 합니다. 대화는 계속되지만 해당 MCP 도구는 파라미터 없이 노출되므로 정상 호출이 되지 않을 수 있습니다. R004 「Recovery」의 Retryable 행(`.claude/rules/SHOULD-error-handling.md:25`, 3회 backoff 재시도)으로는 이런 매 턴 400이 해소되지 않았을 것이며 [가설 — 구버전에서 재시도 결과를 측정하지 않음], 구버전에서 이 증상은 설정 오류가 아니라 특정 MCP 도구 스키마 거부였을 수 있습니다.
- CHANGELOG 원문: "Fixed Claude searching for deferred tools already loaded earlier in the conversation when a session resumes a history that never listed them"
  (300) 지연 도구를 한 번도 나열하지 않은 기록을 재개한 세션에서, Claude가 대화 앞부분에서 이미 로드한 지연 도구를 다시 검색하던 결함이 수정되었습니다. R018 「멤버 도구 부재 시 대체 규약」은 `SendMessage`를 `ToolSearch`(query "select:SendMessage")로 지연 로드한 실측을 기록합니다(`.claude/rules/MUST-agent-teams.md:492`). 이 수정은 중복 검색 비용을 줄이는 방향이며 `SendMessage` 부재를 전제하기 전에 먼저 로드를 시도하라는 그 규약의 절차를 바꾸지 않습니다.

### 모니터링 (OpenTelemetry)

- CHANGELOG 원문: "Added `cache_creation_5m_tokens` and `cache_creation_1h_tokens` to the OpenTelemetry `api_request` event, splitting cache writes by lifetime"
  (300) OpenTelemetry `api_request` 이벤트에 `cache_creation_5m_tokens`와 `cache_creation_1h_tokens`가 추가되어 캐시 쓰기를 수명별로 나눠 볼 수 있습니다. 이 저장소의 `monitoring-setup` 스킬은 OpenTelemetry console 출력으로 API 요청 이벤트를 포함한 사용 지표를 보여 준다고 설명합니다(`.claude/skills/monitoring-setup/SKILL.md:11`). 스킬 절차 자체는 바뀌지 않으며, 캐시 TTL 관련 비용을 진단할 때 이 두 필드를 근거로 쓸 수 있습니다. 상태줄과 훅은 캐시 쓰기 토큰을 직접 읽지 않습니다(`git grep -n -E 'cache_creation' -- .claude/hooks .claude/statusline.sh` rc=1).

### 도구 동작

- CHANGELOG 원문: "Fixed Claude naming files in the session scratchpad by a bare filename or relative path instead of their full path"
  (300) Claude가 세션 scratchpad의 파일을 전체 경로가 아니라 파일 이름만 또는 상대 경로로 부르던 결함이 수정되었습니다. 이 저장소의 auto-dev 파이프라인은 위임이 만드는 임시 파일을 `$TMPDIR`나 세션 scratchpad 아래의 에이전트별 고유 경로에 두라고 요구합니다(`.claude/skills/pipeline/workflows/auto-dev.yaml:835`~`:836`). 구버전 서브에이전트 보고에서 scratchpad 파일이 이름만으로 언급되었다면 저장소 루트 기준 상대 경로로 오독될 수 있었으므로, 보고된 경로는 `ls`로 실재를 확인한 뒤 사용합니다.

### Artifact 도구

- CHANGELOG 원문: "Improved artifact updates: Claude now applies a small change and republishes the artifact in one call, and makes larger edits and republishes within a single response"
  (300) artifact 갱신 방식이 바뀌어, 작은 변경은 한 번의 호출로 적용해 다시 게시하고 큰 편집은 한 응답 안에서 편집과 재게시를 함께 합니다. 바로 다음 릴리즈인 2.1.301 절에는 "Fixed artifact updates being refused where a PreToolUse hook covers Edit or Write; Claude now edits the file and then republishes instead of changing it in the publish call"이 있습니다. 이 저장소의 PreToolUse 훅 matcher에는 Edit·Write를 덮는 항목이 여럿 있습니다(`jq -c '[.hooks.PreToolUse[]? | .matcher]' .claude/settings.json` 결과에 `"Write|Edit"`, `"Write"`, `"Edit|Write"`, `"Edit"`, `"Write|Edit|Bash"` 포함). 따라서 이 저장소에서 Artifact 도구로 artifact를 갱신한 세션은 2.1.301 수정 이전에 그 거부 조건에 해당했을 수 있습니다. CHANGELOG는 301 항목을 회귀로 표시하지 않으므로, 300의 한 번 호출 갱신 방식이 그 거부를 낳았다는 인과는 [가설 — 2.1.300과 2.1.301에서 같은 PreToolUse 훅 아래 artifact 갱신을 재현해 비교하지 않음]입니다. 관측한 범위(`git grep -n -l -E 'Artifact tool|Artifact\(|action: *"?publish' -- .claude/skills .claude/agents` rc=1)에서 이 저장소의 스킬·에이전트는 Artifact 도구 사용을 정의하지 않습니다.

기타 71건 — 이 저장소 비해당(mods API(`virtualText`, `$.ui.view`, `Text`의 `dir`, `agent.spawn`·`prompt.change`·`prompt.edit`·`prompt.submit` 훅, 핫 리로드 안내), Claude Platform on AWS의 `/advisor`, OpenTelemetry GenAI 속성·`git_commit_id`·`user_prompt` 이벤트, cloud sessions·Cowork·Remote Control·`claude remote-control`·`claude daemon`·self-hosted runner 항목, `claude agents` 화면·`/tasks`·breadcrumb·agents view 입력 처리 같은 UI 세부, `--worktree`·reftable 저장소·plugin `WorktreeCreate`/`WorktreeRemove` 훅, `forceLoginOrgUUID`·`forceLoginGatewayUrl`·`claude gateway`·`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`, `/autocompact` 경고 문구, `claude --help`의 `--restricted` 설명, `/branch`·`claude purge`의 U+2028/U+2029 처리, gzip 요청 압축, 번들 `claude-api`·`plugin-authoring` 스킬, Artifact 도구 진행 표시, Claude 3 모델의 PDF 안내, TLS 검사 프록시 뒤 feature flag, 어두운 ANSI 테마, `/sandbox` 문구, VSCode·Windows·`[Cloud sessions]`·`[Remote Control]`·`[Claude Tag]`·`[Code Review]` 항목). 실측: `gh release view v2.1.300 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 88건 중 위 본문 17건을 다뤘으므로 88 − 17 = 71건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 훅 설정 변경은 필요하지 않습니다. 위 jq·`git grep` 결과상 두 settings 파일에는 SessionEnd 훅과 `agent` 타입 훅이 없고, 훅이 `updatedInput`을 출력하지 않습니다.
- 측정한 트랜스크립트 1개(기기 로컬, 2.1.302)에서는 트랜스크립트 기록 확장으로 생긴 `api-request-blob` 줄이 모두 `.message.role`을 가졌으므로, 그런 줄은 `r007-r008-drift-advisor.sh`의 role 기반 선택(`:232`, `:249`~`:251`, `:265`)에 섞일 수 있습니다. 레코드 형태는 위와 같이 측정했으나 실제 오판 발화는 관측되지 않았으므로 영향은 [가설]로 남기고, advisory 출력과 blob 제외 재계산을 대조한 뒤 판단합니다.
- (300) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.301 (2026-10-15)

> Issue: #1863 — Claude Code v2.1.301 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 상한 이후 릴리즈 2.1.302~2.1.310의 CHANGELOG 절을 각각 잘라 "2.1.301"과 "Revert"를 검색했으며(`awk -v v="<버전>" '/^## /{p=($2==v)} p' CHANGELOG.md`로 자른 절마다 `grep -c -F`), 두 문자열 모두 9개 절에서 0건이었습니다. 따라서 이 릴리즈 항목을 되돌리거나 회귀로 지목하는 문장은 관측한 범위에서 없습니다. 릴리즈 게시 시각은 2026-10-15T19:22:06Z입니다(`gh release view v2.1.301 -R anthropics/claude-code --json publishedAt`).

### 훅

- CHANGELOG 원문: "Fixed artifact updates being refused where a PreToolUse hook covers Edit or Write; Claude now edits the file and then republishes instead of changing it in the publish call"
  (301) Edit나 Write를 대상으로 하는 PreToolUse 훅이 있는 환경에서 artifact 갱신이 거부되던 결함이 수정되어, 이제 Claude가 게시 호출 안에서 파일을 바꾸는 대신 파일을 편집한 뒤 다시 게시합니다. 이 저장소는 matcher에 Edit 또는 Write가 들어간 PreToolUse 항목 5개를 프로젝트 settings에 배선하므로(`.claude/settings.json:45` `Write|Edit`, `:85` `Write`, `:95` `Edit|Write`, `:105` `Edit`, `:115` `Write|Edit|Bash`; `jq -r '.hooks.PreToolUse[].matcher' .claude/settings.json`) 원문의 조건에 해당합니다. 2.1.300 CHANGELOG의 "Improved artifact updates: Claude now applies a small change and republishes the artifact in one call, and makes larger edits and republishes within a single response"가 게시 호출 하나로 바꾸는 경로를 도입한 것으로 읽힙니다. 다만 CHANGELOG는 이 결함을 2.1.300의 회귀로 명시하지 않으므로 두 항목의 인과는 확정하지 않습니다. 이 수정의 원문은 새 동작("Claude now edits the file and then republishes instead of changing it in the publish call")이 PreToolUse 훅 환경에만 적용되는지, 모든 artifact 갱신에 적용되는지 명시하지 않습니다. 이 저장소 세션의 artifact 게시가 실제로 거부됐는지는 관측하지 못했습니다 [가설 — 판정 범위를 우선 2.1.300 세션으로 좁혀, 그 트랜스크립트의 artifact 게시 거부 기록으로 판정. 작성 기기의 이 프로젝트 트랜스크립트 디렉토리에는 `version` 최댓값이 2.1.300·2.1.301인 파일이 없으므로(2026-10-25 17:50 KST, 파일별 `version` 최댓값 계수), 해당 버전 트랜스크립트가 없는 기기에서는 같은 PreToolUse 훅 구성으로 2.1.300과 2.1.301에서 artifact 게시를 재현해 비교].
- CHANGELOG 원문: "Fixed quitting removing a worktree made by a `WorktreeCreate` hook without asking when it may hold unpushed commits"
  (301) `WorktreeCreate` 훅이 만든 worktree를, 푸시되지 않은 커밋이 있을 수 있는데도 종료 시 묻지 않고 제거하던 결함이 수정되었습니다. R006은 이 이벤트를 훅 이벤트 카탈로그에 나열하지만(`.claude/rules/MUST-agent-design.md:255`, DETAIL 주석 — 자동 주입되지 않음; 보이는 요약은 `:257`의 "33개 이벤트 타입"), 프로젝트 settings와 templates 미러의 `hooks` 키에는 `WorktreeCreate`가 0건입니다(`jq -r '.hooks|keys[]' <파일> | grep -c WorktreeCreate`를 `.claude/settings.json`과 `templates/.claude/settings.json`에 각각 실행해 둘 다 0). 따라서 이 저장소 설정 범위에서는 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed the permission prompt for a plugin or skill hook's `ask` decision not showing which plugin or skill the hook comes from"
  (301) 플러그인이나 스킬 훅이 `ask` 결정을 낼 때의 권한 프롬프트가 그 훅의 출처 플러그인·스킬을 보여 주지 않던 결함이 수정되었습니다. 관측한 범위에서 이 저장소의 스킬·에이전트 frontmatter에는 `hooks:` 필드가 없고(`git grep -l -E '^hooks:' -- '.claude/skills/*/SKILL.md' '.claude/agents/*.md'` 출력 없음), 프로젝트 훅에서 `permissionDecision`을 출력하는 곳도 없습니다(`git grep -n -E 'permissionDecision' -- .claude/hooks .claude/settings.json` rc=1). 위 두 측정 범위에서 이 저장소가 배포하는 스킬·훅은 이 수정의 대상이 아니며, 사용 중인 외부 플러그인(superpowers 등) 훅이 `ask`를 내는지는 관측하지 않았습니다 [가설 — 플러그인 훅 소스의 `ask` 출력 여부로 판정].

### 스킬 · Workflow

- CHANGELOG 원문: "Fixed skills and commands with very many or very long argument names stalling for seconds when invoked; only the first 64 names, each up to 64 characters, are now filled in"
  (301) 인자 이름이 매우 많거나 긴 스킬·커맨드가 호출 시 수 초간 멈추던 결함이 수정되어, 이제 앞의 64개 이름(각 64자까지)만 채워집니다. 이름 붙은 인자를 선언하는 `arguments:` frontmatter는 이 저장소 스킬에서 0건이며(`git grep -c -E '^arguments:' -- '.claude/skills/*/SKILL.md'` 출력 없음), 추적된 SKILL.md 114개 중 50개는 표시용 `argument-hint:`를 씁니다(`git grep -l -E '^argument-hint:' -- '.claude/skills/*/SKILL.md' | wc -l`=50, `git ls-files -- '.claude/skills/*/SKILL.md' | wc -l`=114). 따라서 64개 상한에 걸리는 스킬은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed skills, commands and hooks using very large amounts of memory when their arguments fill many placeholders"
  (301) 인자가 많은 자리표시자를 채울 때 스킬·커맨드·훅이 매우 많은 메모리를 쓰던 결함이 수정되었습니다. 이 저장소에서 자리표시자 후보 문자열(`$ARGUMENTS` 또는 `$<숫자>`)이 있는 스킬 파일은 8개이며(`git grep -l -P '\$ARGUMENTS|\$[0-9]\b' -- '.claude/skills/*/SKILL.md' | wc -l`=8), 이 수에는 셸 예시 코드의 `$1` 같은 비자리표시자도 섞여 있을 수 있습니다. `$ARGUMENTS`를 쓰는 파일은 1개입니다(`git grep -c -P '\$ARGUMENTS' -- '.claude/skills/*/SKILL.md'` 1건, `.claude/skills/ambiguity-gate/SKILL.md`). "많은 자리표시자" 조건에 해당하는 스킬이 있는지는 판정하지 못했습니다 [가설 — 스킬 호출 전후 프로세스 메모리 측정으로 판정].
- CHANGELOG 원문: "Fixed skills no longer being listed to the model after using `/rewind`"
  (301) `/rewind` 사용 후 스킬 목록이 모델에게 더 이상 제공되지 않던 결함이 수정되었습니다. 이 저장소 세션은 추적된 SKILL.md 114개(`git ls-files -- '.claude/skills/*/SKILL.md' | wc -l`=114)의 라우팅 스킬과 슬래시 커맨드 스킬을 모델이 볼 수 있는 스킬 목록에 의존하므로, 구버전에서 `/rewind` 뒤에 스킬 라우팅이 실패했다면 그 원인이 이 결함일 수 있습니다 [가설 — 2.1.301 미만에서 `/rewind` 직후 Skill 호출 실패 기록으로 판정].
- CHANGELOG 원문: "Fixed workflow agents sometimes skipping their step, and the run still reporting success, after reading the harness note that their task text carries no user authority"
  (301) workflow 에이전트가 자기 작업 텍스트에 사용자 권한이 없다는 하네스 안내문을 읽은 뒤 가끔 단계를 건너뛰고, 실행은 여전히 성공으로 보고되던 결함이 수정되었습니다. R023은 Workflow 스크립트 실행 전 결정론적 점검을 규정하고(`.claude/rules/SHOULD-verification-ladder.md:322`), R020은 "실행함"과 "성공함"을 구분합니다. 원문의 "sometimes"대로 구버전 Workflow 실행의 성공 보고는 각 단계의 실제 수행을 보장하지 않았으므로, 그 산출물은 결정론적 ground-truth로 다시 확인하는 것이 좋습니다. `dag-orchestration`·`task-decomposition` 스킬은 신규 작업에 네이티브 Workflow tool을 권장합니다(`.claude/skills/dag-orchestration/SKILL.md:11`, `.claude/skills/task-decomposition/SKILL.md:11`). 관측한 범위(`git ls-files | grep -i -E 'workflow.*\.(js|mjs)$'` 출력 없음)에서 추적된 Workflow 스크립트 파일은 없습니다. 이름에 workflow가 들어간 `.claude/skills/pipeline/workflows/auto-dev.yaml`은 pipeline 스킬의 YAML 정의이며, 스킬 파일 중 Workflow tool이나 `scriptPath`를 언급하는 것은 위 두 스킬이고 pipeline 스킬은 들어 있지 않습니다(`git grep -n -i -P 'Workflow tool|scriptPath' -- '.claude/skills/*/SKILL.md'`).
- CHANGELOG 원문: "Fixed workflow scripts asking for permission or being refused when read, edited or re-run after a Bash `cd` in the same session"
  (301) 같은 세션에서 Bash `cd` 뒤에 workflow 스크립트를 읽거나 편집하거나 다시 실행할 때 권한을 묻거나 거부되던 결함이 수정되었습니다. R005는 Bash `cd`가 세션 cwd로 남아 상대 경로가 어긋날 수 있다며 지속 `cd`를 금지합니다(`.claude/rules/MAY-optimization.md:89`, #1778, #1767). 이 수정은 workflow 스크립트 경로에 한정되며 다른 스크립트·도구의 상대 경로 문제를 다루지 않으므로, R005의 지속 `cd` 금지는 그대로 유효합니다.

### 도구 동작 · 권한

- CHANGELOG 원문: "Fixed Grep and Glob reporting no matches when the search program failed unexpectedly before returning any results; they now return an error saying the search failed"
  (301) 검색 프로그램이 결과를 내기 전에 예기치 않게 실패했을 때 Grep·Glob이 "일치 없음"으로 보고하던 결함이 수정되어, 이제 검색 실패 오류를 반환합니다. 관측한 범위(`git grep -l -P '^\s*-\s*(Grep|Glob)\s*$|^tools:.*\b(Grep|Glob)\b' -- '.claude/agents/*.md' | wc -l`=50, 에이전트 파일 50개)에서 모든 에이전트 파일이 `tools:`에 Grep 또는 Glob을 명시하며, R002는 이렇게 명시한 `qa-writer` 1건이 전용 `Grep`/`Glob`을 받았다는 실측을 기록하고, 다른 에이전트로의 일반화는 추정으로 둡니다(`.claude/rules/MUST-permissions.md:18`). 따라서 2.1.301 미만에서 서브에이전트가 보고한 Grep·Glob의 0건 결과는 검색 실패가 위장된 것일 수 있었습니다. R005의 2.1.275 노트(`.claude/rules/MAY-optimization.md:120`, DETAIL 주석 — 자동 주입되지 않음)는 재확인 대상을 "대용량 출력 탐색"의 0건 결과로 한정하므로, 이 항목은 그 노트가 이미 덮는 경우가 아닙니다. 같은 재확인 원칙(0건 결과를 `git grep` 등 독립 경로로 다시 확인)을 검색 프로그램 실패 경로로 확장 적용하는 근거로 기록합니다. 보이는 R005 본문은 저장소 전수조사에 `git grep`을 표준으로 둡니다(`.claude/rules/MAY-optimization.md:87`).
- CHANGELOG 원문: "Fixed the Read tool reading binary files such as .xlsm, .parquet, .epub and .heic as text"
  (301) Read 도구가 .xlsm, .parquet, .epub, .heic 같은 바이너리 파일을 텍스트로 읽던 결함이 수정되었습니다. 이 저장소에서 이 네 확장자의 추적 파일은 0개이므로(`git ls-files -- '*.xlsm' '*.parquet' '*.epub' '*.heic' | wc -l`=0) 저장소 파일 범위에서는 영향 조건이 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed a tool call cut off by a message sent mid-turn during its permission check being reported to the model as rejected by the user"
  (301) 권한 검사 중에 턴 도중 보낸 메시지로 끊긴 도구 호출이 모델에게 "사용자가 거부함"으로 보고되던 결함이 수정되었습니다. R020은 비파괴 맥락에서 인터럽트 직후 직전 요청을 "취소"로 단정하지 말라고 규정하며(`.claude/rules/MUST-completion-verification.md:307`, 적용 범위는 `:293`의 "비파괴 한정"이고 파괴적 작업은 `:299`의 Safety Carve-Out이 정지를 우선합니다), R015는 사용자 지정 도구가 실패해도 같은 도구를 재시도하라고 규정합니다(`.claude/rules/MUST-intent-transparency.md:87`). 구버전에서 모델이 받은 "사용자 거부" 신호는 실제 거부가 아니라 턴 도중 메시지에 의한 절단이었을 수 있으므로, 그 신호를 근거로 작업을 포기하거나 다른 도구로 바꾼 사례는 재해석 대상입니다 [가설 — 해당 세션 트랜스크립트에서 거부 직전 사용자 메시지 유무로 판정].

### 컨텍스트 · 모델 · headless

- CHANGELOG 원문: "Added `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` so unattended retry mode (`CLAUDE_CODE_RETRY_WATCHDOG`) ends a request at a usage limit that resets too far away instead of waiting"
  (301) 무인 재시도 모드(`CLAUDE_CODE_RETRY_WATCHDOG`)가 너무 먼 시점에 초기화되는 사용량 한도에서 기다리지 않고 요청을 끝내도록 하는 `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`가 추가되었습니다. 이 저장소는 무인 `claude -p` 실행에서 `/fsd`를 쓸 수 있다고 안내하지만(`.claude/skills/fsd/SKILL.md:172`), `RETRY_WATCHDOG` 계열 env는 추적되는 프로젝트 settings와 templates 미러에서 0건입니다(`grep -c RETRY_WATCHDOG .claude/settings.json templates/.claude/settings.json` 모두 0). 새 env도 이 가이드 밖의 추적 파일에서 0건이므로(`git grep -n RETRY_WATCHDOG_MAX -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1) 저장소 설정 범위에서는 동작이 바뀌지 않습니다. 작성 기기의 `.claude/settings.local.json`은 추적되지 않는 gitignore 대상이므로(`git ls-files -- .claude/settings.local.json` 출력 없음, `git check-ignore -v --no-index .claude/settings.local.json` = `.gitignore:40:.claude/*`) 저장소 근거에서 뺐으며, 그 파일에서도 0건이었던 것은 로컬 관측일 뿐입니다.
- CHANGELOG 원문: "Fixed the `fable` (and `best`) model alias erroring on the Anthropic API when the newest Fable model is not available to your organization: Claude Code now retries once on the previous Fable model"
  (301) 조직에서 최신 Fable 모델을 쓸 수 없을 때 `fable`(및 `best`) 별칭이 Anthropic API에서 오류를 내던 결함이 수정되어, 이제 이전 Fable 모델로 한 번 재시도합니다. R006은 `fable`을 Agent 도구 `model` 파라미터의 Tier-3 값으로 둡니다(`.claude/rules/MUST-agent-design.md:70`). 에이전트 frontmatter에서 Fable을 지정한 파일은 관측한 범위에서 0개입니다(`git grep -n -E '^model: *(claude-)?fable' -- '.claude/agents/*.md'` rc=1). 이 수정 이후 `model: "fable"` 스폰은 오류 대신 이전 Fable 모델로 실행될 수 있으므로, 실행 모델이 중요한 위임에서는 스폰 결과의 실제 모델을 확인하는 것이 좋습니다 [가설 — 최신 Fable을 쓸 수 없는 조직에서 스폰 결과의 `resolvedModel`로 판정].
- CHANGELOG 원문: "Improved switching to a model with a smaller context window: a conversation too long for the new model is now summarized by the previous model first"
  (301) 컨텍스트 창이 더 작은 모델로 바꿀 때, 새 모델에 너무 긴 대화를 이전 모델이 먼저 요약하도록 개선되었습니다. R006과 R013은 `CLAUDE_CODE_DISABLE_1M_CONTEXT` 설정 여부에 따라 1M 창 모델이 실효 200K로 동작할 수 있다고 기록합니다(`.claude/rules/MUST-agent-design.md:85`, DETAIL 주석 — 자동 주입되지 않음; `.claude/rules/SHOULD-ecomode.md:91`). 1M 창 세션에서 더 작은 창의 모델로 `/model` 전환하면 이 요약이 개입할 수 있습니다 [가설 — 이 저장소 세션의 모델 전환 사례는 미관측].
- CHANGELOG 원문: "Fixed a case where switching to a model with a smaller context window could spend usage credits on a summary by the previous model without asking first"
  (301) 더 작은 창의 모델로 전환할 때 이전 모델의 요약에 묻지 않고 사용 크레딧을 쓸 수 있던 경우가 수정되었습니다. 이전 모델이 요약하는 동작은 전체 CHANGELOG에서 2.1.301 절의 이 항목과 위 항목 두 줄에만 나타나므로(`grep -c -F 'by the previous model' CHANGELOG.md`=2, 두 줄 모두 2.1.301 절 범위 안), 그 동작이 언제부터 있었는지는 CHANGELOG로 확정할 수 없습니다. 비용 상한 advisory 훅 `cost-cap-advisor.sh`는 상태줄 브리지 파일 `/tmp/.claude-cost-${PPID}`의 누적 비용을 읽으므로(`.claude/hooks/scripts/cost-cap-advisor.sh:10`, `:43`), 그 동작이 있던 버전에서는 모델 전환 직후의 비용 증가가 이 요약 비용이었을 수 있습니다 [가설 — 먼저 해당 버전에 이전 모델 요약 동작이 있었는지 확인하고, 있었다면 전환 전후 `/cost` 차이로 판정].
- CHANGELOG 원문: "Fixed conversations being compacted over and over, on a model you didn't pick, behind an LLM gateway whose responses name a different model than the one requested"
  (301) 요청한 모델과 다른 모델 이름을 응답에 적는 LLM gateway 뒤에서, 대화가 고르지 않은 모델로 반복 compaction되던 결함이 수정되었습니다. `ANTHROPIC_BASE_URL`은 추적되는 프로젝트 settings와 templates 미러에서 0건이므로(`grep -c ANTHROPIC_BASE_URL .claude/settings.json templates/.claude/settings.json` 모두 0) 저장소가 추적하는 설정은 gateway를 지정하지 않습니다. 사용자 셸 env, user scope 설정, gitignore된 로컬 settings의 gateway 사용 여부는 저장소 사실이 아니어서 판정에서 뺐습니다 [가설 — 실행 환경의 `ANTHROPIC_BASE_URL` 설정 여부로 판정].

### 텔레메트리

- CHANGELOG 원문: "Added `classifier_verdict` and `permission_mode` to OpenTelemetry `tool_decision` events, so auto mode classifier decisions can be told apart from permission rules"
  (301) OpenTelemetry `tool_decision` 이벤트에 `classifier_verdict`와 `permission_mode`가 추가되어, auto mode 분류기의 결정을 권한 규칙과 구분할 수 있습니다. `monitoring-setup` 스킬은 `claude_code.tool_decision` 이벤트를 관측 대상으로 나열합니다(`.claude/skills/monitoring-setup/SKILL.md:182`). R010 Self-Check 항목 1은 무인 실행 전에 유효 permission mode를 settings 파일과 실행 플래그로 실측하라고 규정하며(`.claude/rules/MUST-orchestrator-coordination.md:606`), 이 속성은 그 실측을 도구 호출 단위로 보강하는 관측 수단이 될 수 있습니다 [가설 — `permission_mode` 값이 R010이 정의하는 유효 모드와 같은지는 미실측, 같은 세션에서 `claude -p` init `permissionMode`와 대조해 판정].
- CHANGELOG 원문: "Added `classifier_category` to OpenTelemetry `tool_decision` events, naming the built-in rule a classifier block matched, when `OTEL_LOG_TOOL_DETAILS=1`"
  (301) `OTEL_LOG_TOOL_DETAILS=1`일 때 OpenTelemetry `tool_decision` 이벤트에 분류기 차단이 일치한 내장 규칙 이름인 `classifier_category`가 추가되었습니다. R010 STOP Protocol은 서브에이전트가 safety classifier에 2회 걸리면 중단하고 재설계하라고 규정하고(`.claude/rules/MUST-orchestrator-coordination.md:262`), 같은 파일의 2.1.268 노트는 auto mode 거부 화면에 규칙 이름이 표시된다고 기록합니다(`:731`, DETAIL 주석 — 자동 주입되지 않음). 이 속성은 차단 사유를 텔레메트리에도 규칙 단위로 남기므로 재설계 범위를 정할 때 증거로 쓸 수 있으나, 2.1.282부터 project·local settings의 `OTEL_LOG_*` 변수는 무시되므로 user scope 설정이나 셸 export가 필요합니다(`.claude/skills/monitoring-setup/SKILL.md:24`).

기타 33건 — 이 저장소 비해당(mods API(`Input`의 `rows`, `$.model.fork`, 훅 `.catch`, `$.env.set`, 질문 대화상자 위 트리)·`claude-api` 번들 스킬의 OpenTelemetry 안내와 CMEK 문구·Self-hosted runner·`[VSCode]`·Windows 전용 항목, vim mode(`%` motion, INSERT 유지, AskUserQuestion Esc), 터미널 렌더링(VTE·iTerm2 잔여 문자, 어두운 ANSI 테마, 헤더 행만 있는 Markdown 표, fullscreen compaction 정지, 장시간 서브에이전트 진행 표시 렌더링), artifact 페이지의 sticky header 위 띠 칠하기, 로그인·디스크 가득 참 오류 문구·토큰 갱신 시간 초과, `awsAuthRefresh`, 재개 세션의 compaction 행 안내, "/clear" 힌트, reftable 저장소의 `/diff` 등 harness 비영향 세부사항으로 분류했습니다 [가설 — 범주별 저장소 사용 여부는 개별 실측하지 않음]). 실측: `gh release view v2.1.301 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 51건 중 위 본문 18건을 다뤘으므로 51 − 18 = 33건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 이 문서의 규범 변경 제안은 없습니다(CC 2.1.301 CHANGELOG 항목 기준). 위 항목 대부분은 저장소가 추적하는 구성에서 해당 조건(`WorktreeCreate` 훅, 스킬·에이전트 `hooks:`, `arguments:` frontmatter, gateway 설정, watchdog env, 대상 바이너리 확장자 파일)이 관측되지 않았거나, 본문이 인용한 기존 룰(R002, R005, R006, R010, R013, R015, R020, R023)의 전제를 보강하는 항목입니다. 예외는 네 항목입니다. artifact 항목은 저장소가 원문 조건에 해당하며(PreToolUse matcher 5개) 룰 인용 없이 아래 후속 후보 (3)으로 추적합니다. `/rewind` 항목과 모델 전환 크레딧 항목은 룰 인용 없이 [가설]로 남긴 회고 판정이며, 자리표시자 항목은 조건에 해당하는 스킬이 있는지 판정하지 못했습니다.
- 후속 실측 후보: (1) OpenTelemetry `tool_decision`의 `permission_mode` 값과 `claude -p` init `permissionMode`를 같은 세션에서 대조합니다. (2) 최신 Fable을 쓸 수 없는 조직에서 `model: "fable"` 스폰의 `resolvedModel`을 확인합니다. (3) 2.1.300 세션 트랜스크립트에서 PreToolUse 훅 환경의 artifact 게시 거부 기록을 확인하고, 기기에 해당 버전 트랜스크립트가 없으면 같은 훅 구성으로 2.1.300과 2.1.301에서 재현해 비교합니다.

---

## v2.1.302 (2026-10-16)

> Issue: #1864 — Claude Code v2.1.302 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 상한 이후 릴리즈 2.1.303~2.1.310의 CHANGELOG 절을 각각 잘라 "2.1.302"와 "Revert"를 검색했으며(`awk -v v="<버전>" '/^## /{p=($2==v)} p' CHANGELOG.md`로 자른 절마다 `grep -c -F`), 두 문자열 모두 8개 절에서 0건이었습니다. 같은 범위의 "regression" 문장은 2.1.305 절의 두 건이며, 각각 "(a 2.1.304 regression)"과 "(a 2.1.300 regression)"을 지목하므로 이 릴리즈의 회귀 수정이 아닙니다. 따라서 이 릴리즈 항목을 되돌리거나 회귀로 지목하는 문장은 관측한 범위에서 없습니다. 릴리즈 게시 시각은 2026-10-16T20:53:06Z입니다(`gh release view v2.1.302 -R anthropics/claude-code --json publishedAt`).

### 에이전트 · 서브에이전트

- CHANGELOG 원문: "Changed fork subagents (`subagent_type: "fork"`) to be on by default in `claude -p`, the Agent SDK, the desktop app and VS Code, as they already are in the terminal; `CLAUDE_CODE_FORK_SUBAGENT=0` turns them off, and `claude mcp serve` never offers them"
  (302) fork 서브에이전트(`subagent_type: "fork"`)가 터미널과 같이 `claude -p`, Agent SDK, 데스크톱 앱, VS Code에서도 기본으로 켜지도록 바뀌었으며, `CLAUDE_CODE_FORK_SUBAGENT=0`으로 끌 수 있고 `claude mcp serve`는 이를 제공하지 않습니다. R009의 2.1.232 노트는 fork가 전체 대화와 prompt cache를 상속하므로 "Instance independence — Isolated context, no shared state" 행이 fork에는 성립하지 않는다고 기록합니다(`.claude/rules/MUST-parallel-execution.md:200`, DETAIL 주석 — 자동 주입되지 않음). 그 노트는 실행 환경을 구분하지 않지만, 원문("as they already are in the terminal")에 따르면 이 변경 전에는 `claude -p`에서 fork가 기본으로 켜져 있지 않았습니다. 이 변경으로 무인 `claude -p`에서 도는 `/fsd`(`.claude/skills/fsd/SKILL.md:172`)에서도 그 노트의 전제가 기본으로 적용됩니다. `CLAUDE_CODE_FORK_SUBAGENT`는 이 가이드 밖의 추적 파일에서 0건이므로(`git grep -c -F CLAUDE_CODE_FORK_SUBAGENT -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 출력 없음) 저장소 설정으로 끄지 않습니다.
- CHANGELOG 원문: "Changed the desktop app and VS Code to always run the main conversation's subagents in the background, as the terminal does, rather than let Claude choose; a subagent's own Agent calls in `claude -p`, the Agent SDK, the desktop app and VS Code now run in the foreground by default"
  (302) 데스크톱 앱과 VS Code가 터미널처럼 메인 대화의 서브에이전트를 항상 백그라운드로 실행하도록 바뀌었고, `claude -p`·Agent SDK·데스크톱 앱·VS Code에서 서브에이전트 자신의 Agent 호출은 이제 기본으로 포그라운드에서 실행됩니다. R009의 2.1.232 노트는 백그라운드 스폰의 반환이 완료 신호가 아니라고 기록하며(`.claude/rules/MUST-parallel-execution.md:200`, DETAIL 주석 — 자동 주입되지 않음), 이 변경은 그 전제를 데스크톱 앱과 VS Code로 넓힙니다. 뒤쪽 절의 "서브에이전트 자신의 Agent 호출"은 R010 Core Rule이 프로젝트 정책으로 금지하는 경로이므로(`.claude/rules/MUST-orchestrator-coordination.md:7`, "Subagents MUST NOT spawn other subagents") 이 정책을 따르는 위임 흐름에는 해당하지 않습니다. 서브에이전트가 정책을 어기고 Agent를 호출한 경우의 포그라운드 실행 영향은 관측하지 않았습니다 [가설 — 해당 위반 사례의 트랜스크립트로 판정].
- CHANGELOG 원문: "Fixed worktree isolation refusing to create or resume worktrees under git 2.56 or later when a stray `.git` file points at a directory that doesn't exist"
  (302) git 2.56 이상에서 존재하지 않는 디렉토리를 가리키는 남은 `.git` 파일이 있을 때 worktree isolation이 worktree 생성·재개를 거부하던 결함이 수정되었습니다. 작성 기기의 git은 2.52.0으로(`git --version`, 로컬 관측) 원문의 버전 조건에 들지 않으며, CI 러너와 사용자 환경의 git 버전은 관측하지 않았습니다. 에이전트 frontmatter의 `isolation:`은 관측한 범위에서 `sandbox` 1건이며(`git grep -n -E '^isolation:' -- '.claude/agents/*.md'` → `.claude/agents/sec-codeql-expert.md:8`) `worktree` 값은 없습니다. 다만 가이드는 에이전트 frontmatter `isolation: worktree`를 선택지로 안내하고(`guides/git-worktree-workflow/README.md:89`, `guides/worktree-lifecycle/README.md:81`), `omcustom-auto-improve` 스킬은 `EnterWorktree` 도구를 씁니다(`.claude/skills/omcustom-auto-improve/SKILL.md:59`). 그 안내를 따른 에이전트와 `EnterWorktree`가 원문의 "worktree isolation"에 포함되는지는 관측하지 못했습니다 [가설 — git 2.56 이상 환경에서 남은 `.git` 파일을 둔 채 `isolation: worktree` 에이전트 스폰과 `EnterWorktree` 호출을 각각 실행해 판정].

### 권한 · permission mode

- CHANGELOG 원문: "Changed `claude -p` and Agent SDK sessions with no permission mode to start in `default` mode on third-party providers, with telemetry off or on a fresh install; `--permission-mode auto` keeps auto"
  (302) permission mode가 지정되지 않은 `claude -p`·Agent SDK 세션이 서드파티 provider에서, 텔레메트리를 끈 환경에서, 또는 새로 설치한 환경에서 `default` 모드로 시작하도록 바뀌었고, `--permission-mode auto`는 auto를 유지합니다. 원문의 "on third-party providers, with telemetry off or on a fresh install"은 세 조건을 선택지로 나열한 것으로 읽었습니다. 같은 CHANGELOG의 다른 항목이 텔레메트리 꺼짐을 provider와 별개 범주로 나열하기 때문입니다(2.1.304 "now also available on Bedrock, Vertex, Foundry, Claude apps gateway and telemetry-disabled sessions", 2.1.310 "on Bedrock, Vertex, and Foundry, and when telemetry or nonessential traffic is disabled"). 서드파티 provider이면서 텔레메트리가 꺼졌거나 새로 설치한 경우만 해당한다는 결합 독해도 문법상 배제되지 않습니다 [가설 — 서드파티 provider 없이 텔레메트리만 끈 1st-party `claude -p` 세션의 init `permissionMode`가 `default`인지로 판정]. R010 「Universal bypassPermissions」 본문은 2.1.212 이상에서 부모 모드가 `permissions.defaultMode`(managed·local·project·user)와 `--permission-mode` 같은 실행 플래그에서 온다고 기록하고, 2.1.257부터 project·local의 `bypassPermissions`가 무시되어 그 범위가 `default`로 귀결한다는 실측 규칙을 적습니다(`.claude/rules/MUST-orchestrator-coordination.md:588`, Self-Check 항목 1 `:606`). 저장소가 추적하는 값은 프로젝트 settings의 `bypassPermissions`와 templates 미러의 미설정입니다(`jq -r '.permissions.defaultMode // "unset"' .claude/settings.json templates/.claude/settings.json` = `bypassPermissions`, `unset`). 따라서 init으로 templates를 받은 프로젝트에서 local·user·managed 범위의 `defaultMode`와 실행 플래그도 비어 있으면, 위 조건의 `claude -p`는 이 변경의 "no permission mode" 세션에 들 수 있습니다 [가설 — 그 구성에서 위 세 조건별 init `permissionMode`로 판정]. 이 저장소 자체의 `bypassPermissions`가 무시된 상태를 CC가 "no permission mode"로 취급하는지는 실측하지 않았으며, R010 `:588`의 규칙대로라면 그 경우에도 `default`로 귀결하므로 결과는 같을 것으로 봅니다 [가설 — 같은 판정 기준]. `packages/serve/src/lib/server/claude-cli.ts`의 `claude -p` 호출 4곳(`:40`, `:86`, `:117`, `:174`; 명령 문자열은 모두 ``claude -p ${escapeShellArg(prompt)} --no-input``)은 `--permission-mode`를 넘기지 않으며(`git grep -n -F 'claude -p' -- packages/` 4건, `git grep -n -F -e '--permission-mode' -- packages/` 출력 없음), 각 호출은 `cwd: root` 또는 `cwd: projectRoot`(`:44`, `:90`, `:121`, `:178`)에서 실행되므로, 모드 관련 실행 플래그(`--permission-mode` 등)가 없는 이 호출의 모드는 그 디렉토리의 project·local settings와 user·managed settings, 곧 R010 `:588`이 나열한 네 범위가 정하고, 네 범위가 모두 비어 있으면 CC 내장 기본값이 정합니다. 이 항목은 그 기본값을 원문의 조건("on third-party providers, with telemetry off or on a fresh install")에서 `default`로 바꿉니다. 이 호출이 도구 승인을 필요로 하는지는 관측하지 않았습니다. 작성 기기의 로컬 관측은 저장소 사실이 아니며, user scope `auto`와 추적되지 않는 `.claude/settings.local.json`(`git check-ignore -v --no-index .claude/settings.local.json` = `.gitignore:40:.claude/*`)의 `bypassPermissions`입니다. R010 `:588`의 규칙대로라면 이 조합의 `claude -p`는 이 변경과 무관하게 이미 `default`로 시작합니다. 서드파티 provider env는 추적되는 프로젝트 settings와 templates 미러에서 0건입니다(`grep -c -E 'ANTHROPIC_BASE_URL|CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)' .claude/settings.json templates/.claude/settings.json` 모두 0). 무인 `/fsd`를 위 세 조건 중 하나에서 돌릴 때는 R010 Self-Check대로 `claude -p` init `permissionMode`를 먼저 실측합니다.
- CHANGELOG 원문: "Added `CLAUDE_CODE_AUTO_MODE_MODEL` to choose the model the client-side auto mode classifier uses; it does not change the model for server-side auto mode"
  (302) 클라이언트 측 auto mode 분류기가 쓰는 모델을 고르는 `CLAUDE_CODE_AUTO_MODE_MODEL`이 추가되었으며, 서버 측 auto mode의 모델은 바꾸지 않습니다. 저장소가 추적하는 settings는 `auto`를 지정하지 않습니다(위 `jq` 결과 `bypassPermissions`, `unset`). 작성 기기의 user scope 값은 `auto`이지만(로컬 관측), R010 `:588`의 실측 규칙에 따르면 무시된 project `bypassPermissions`가 `claude -p`에서 그 값을 `default`로 덮으며, 대화형 TTY 세션의 결과는 같은 단락이 `[가설]`로 남긴 미조정 상태입니다. 이 env는 이 가이드 밖의 추적 파일에서 0건이므로(`git grep -c -F CLAUDE_CODE_AUTO_MODE_MODEL -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 출력 없음) 저장소 설정 범위에서는 분류기 모델이 바뀌지 않습니다. auto mode가 활성인 세션에서 클라이언트 측과 서버 측 중 어느 분류기가 쓰이는지는 관측하지 못했습니다 [가설 — OpenTelemetry `tool_decision` 이벤트의 `classifier_verdict`·`permission_mode` 속성(2.1.301)으로 판정].
- CHANGELOG 원문: "Improved auto mode with the server-side classifier: a conversation too long for the safety check is now compacted, instead of every checked tool call being denied"
  (302) 서버 측 분류기를 쓰는 auto mode에서, 안전 검사에 너무 긴 대화는 이제 검사 대상 도구 호출을 모두 거부하는 대신 compaction됩니다. R010 STOP Protocol은 서브에이전트가 safety classifier에 2회 걸리면 중단하고 범위를 좁혀 재설계하라고 규정합니다(`.claude/rules/MUST-orchestrator-coordination.md:262`). 구버전의 긴 세션에서 연속 거부가 났다면 그 원인은 작업 범위가 아니라 대화 길이였을 수 있으므로, 그 거부 횟수를 STOP 판정의 trip으로 셀 때는 거부 사유를 먼저 확인하는 것이 좋습니다 [가설 — 거부 메시지의 규칙 이름이나 `classifier_category`로 판정].

### 훅

- CHANGELOG 원문: "Changed prompt and agent hooks so that at most 12 of one event run at a time; the rest wait their turn"
  (302) prompt 훅과 agent 훅이 한 이벤트당 동시에 최대 12개까지 실행되고 나머지는 차례를 기다리도록 바뀌었습니다. 이 저장소의 prompt·agent 타입 훅은 프로젝트 settings와 templates 미러에서 각각 1개이며(`jq -r '[.hooks[][]?.hooks[]? | select(.type=="prompt" or .type=="agent")] | length' .claude/settings.json templates/.claude/settings.json` = 1, 1), 그 1개는 PostCompact 이벤트(키 `.claude/settings.json:403`)의 prompt 훅입니다(`"type": "prompt"`는 `.claude/settings.json:407`, templates 미러 `templates/.claude/settings.json:373`). 소스 `.claude/hooks/hooks.json`에서도 같은 타입은 1개입니다(`jq -r '[.. | objects | select(has("type")) | .type | select(.=="prompt" or .=="agent")] | length' .claude/hooks/hooks.json` = 1). 위 세 파일에서 한 이벤트에 12개를 넘는 prompt·agent 훅은 관측되지 않았으므로 이 상한은 저장소가 배선한 훅의 실행 순서를 바꾸지 않습니다(외부 플러그인 훅은 측정 범위 밖입니다). command 훅은 원문 대상이 아닙니다.

### 컨텍스트 · compaction · 도구

- CHANGELOG 원문: "Added an `Idle compaction` row to `/config` for turning idle compaction off or back on; the notices shown after an idle compaction now say how to turn it off"
  (302) idle compaction을 끄거나 다시 켜는 `Idle compaction` 행이 `/config`에 추가되었고, idle compaction 후 표시되는 안내가 끄는 방법을 알려 줍니다. 관측한 범위에서 저장소에는 idle compaction 관련 문자열이 0건입니다(`git grep -n -i 'idle compaction' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1). R013의 컨텍스트 예산 임계값은 컨텍스트 사용 비율 기준이므로(`.claude/rules/SHOULD-ecomode.md:87` 제목 줄, 임계값 상세는 같은 파일 `:103`의 DETAIL 주석 — 자동 주입되지 않음), 유휴 시간에 의한 compaction은 그 임계값과 별개로 일어날 수 있습니다 [가설 — idle compaction의 발동 조건은 원문에 없어 미실측].
- CHANGELOG 원문: "Fixed a "Prompt is too long" error when stopping a turn while the conversation was being compacted"
  (302) 대화가 compaction되는 동안 턴을 멈추면 "Prompt is too long" 오류가 나던 결함이 수정되었습니다. R013의 2.1.274 노트는 훅 주도 세션의 "Prompt is too long" 종료 결함 수정을 기록합니다(`.claude/rules/SHOULD-ecomode.md:101`). 이 항목은 다른 경로(compaction 중 턴 중지)의 같은 오류이므로, 2.1.302 미만에서 사용자가 compaction 중에 턴을 멈춘 뒤 이 오류가 났다면 컨텍스트 초과가 아니라 이 결함이었을 수 있습니다 [가설 — 오류 직전 compaction 진행 여부로 판정].
- CHANGELOG 원문: "Fixed a prompt cache miss when a tool added mid-session was loaded again through ToolSearch or after compaction"
  (302) 세션 도중 추가된 도구(원문 "a tool added mid-session")가 ToolSearch로 다시 로드되거나 compaction 후에 다시 로드될 때 prompt cache miss가 나던 결함이 수정되었습니다. 원문은 어떤 도구가 세션 도중 추가되는지 예를 들지 않습니다. 작성자 예시로, 이 저장소는 `.mcp.json`에 MCP 서버 2개를 두므로(`git cat-file -p HEAD:.mcp.json`) 그 서버가 세션 중에 늦게 연결된 경우 그 도구가 원문 범위에 들 수 있습니다 [가설 — 서버 연결 시점과 재로드 전후 `prompt_cache` 필드로 판정]. 이 저장소의 룰은 `SendMessage` 같은 지연 내장 도구를 `ToolSearch`로 로드하는 절차를 기록하지만(`.claude/rules/MUST-agent-teams.md:492`), 지연 내장 도구가 원문의 "a tool added mid-session"에 해당하는지는 원문에 없어 판정하지 못했습니다 [가설 — 지연 내장 도구 재로드 전후 `prompt_cache` 필드로 판정]. R012는 상태줄의 `prompt_cache` 필드가 cache miss의 가능한 원인을 표시한다고 기록합니다(`.claude/rules/SHOULD-hud-statusline.md:65`).
- CHANGELOG 원문: "Fixed the Read tool loading an image file of any size, or a pipe or device named like an image, entirely into memory; image sources over 128 MB are now refused"
  (302) Read 도구가 크기와 무관하게 이미지 파일, 또는 이미지처럼 이름 붙은 파이프·장치를 통째로 메모리에 올리던 결함이 수정되어, 이제 128 MB를 넘는 이미지 소스는 거부됩니다. 이 저장소의 추적 이미지 14개 중 가장 큰 파일은 1,294,475바이트입니다(`git ls-files -z -- '*.png' '*.jpg' '*.jpeg' '*.gif' '*.webp' '*.svg' | xargs -0 stat -f '%z %N' | sort -n | tail -1` → `assets/diagrams/03-routing-architecture.png`). 따라서 추적 이미지 범위에서는 거부 대상이 관측되지 않았습니다.

### MCP · 설정 쓰기 · 텔레메트리

- CHANGELOG 원문: "Fixed MCP servers showing no tools, or every tool call failing, when the server negotiates protocol version 2026-07-28 but omits `resultType`, `ttlMs` or `cacheScope`"
  (302) 서버가 프로토콜 버전 2026-07-28로 협상하면서 `resultType`, `ttlMs`, `cacheScope`를 빠뜨리면 MCP 서버의 도구가 보이지 않거나 모든 도구 호출이 실패하던 결함이 수정되었습니다. 이 저장소는 `.mcp.json`에 서버 2개(`ontology-rag`는 stdio, `eraser`는 http)를 둡니다(`git cat-file -p HEAD:.mcp.json`). R019는 MCP 서버를 쓸 수 없거나 결과가 비면 enrichment 없이 조용히 진행하라고 규정하므로(`.claude/rules/SHOULD-ontology-rag-routing.md:43`, `:45`), 구버전에서 이 결함으로 도구가 사라졌다면 라우팅 enrichment가 경고 없이 빠졌을 수 있습니다. 두 서버가 협상한 프로토콜 버전은 관측하지 못했습니다 [가설 — MCP 초기화 응답의 `protocolVersion`으로 판정].
- CHANGELOG 원문: "Fixed `claude plugin` and other subcommands sometimes exiting before a queued settings or config write finished, which could lose the change or leave a `.tmp` file behind"
  (302) `claude plugin`과 다른 서브커맨드가 대기 중인 settings·config 쓰기가 끝나기 전에 가끔 종료되어, 변경이 유실되거나 `.tmp` 파일이 남을 수 있던 결함이 수정되었습니다. 이 저장소 문서는 설정을 쓰는 서브커맨드를 안내하며, 아래는 예시입니다(후보 전체는 `git grep -n -E 'claude (mcp|plugin) (add|install|remove|enable|disable|marketplace)' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/**' ':!wiki/**'` 출력). `claude mcp add semble -- semble mcp`는 `.claude/skills/semble-integration/SKILL.md:67`과 `guides/token-efficiency/semble.md:71`에 있습니다. `claude mcp add-json aws-mcp --scope user`로 시작하는 명령은 `.claude/agents/infra-aws-expert.md:81`(HTML 주석 밖의 에이전트 정의 본문)과 `guides/aws/index.yaml:47`(가이드 메타데이터의 `install_command`)에 있고, `CLAUDE.md:275`·`:279`의 같은 계열 명령(`claude mcp add`·`claude mcp add-json`)은 HTML 주석 안이라 자동 주입되지 않습니다. `claude plugin marketplace add`와 `claude plugin install cc-token-saver`는 `guides/cc-token-saver/README.md:9`, `:10`에 있습니다. 원문은 `claude plugin`을 명명하지만 `claude mcp add`가 원문의 "other subcommands"에 드는지는 원문에 없습니다 [가설 — 2.1.302 미만에서 `claude mcp add` 직후 설정 파일의 서버 항목 기록 여부와 `.tmp` 잔존 여부로 판정]. 구버전에서 이런 명령을 실행했다면 `claude mcp list`나 `claude plugin list`로 등록 결과를 실측하는 것이 R020의 "실행함 ≠ 성공함" 원칙에 맞습니다.
- CHANGELOG 원문: "Fixed `classifier_category` missing from OpenTelemetry `tool_decision` events for most auto mode classifier blocks, and new `tool_decision` attributes pushing out `tool_use_id`, `tool_source` and `tool_parameters` when `OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT` is low"
  (302) 대부분의 auto mode 분류기 차단에서 OpenTelemetry `tool_decision` 이벤트에 `classifier_category`가 빠지던 결함과, `OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT`가 낮을 때 새 `tool_decision` 속성이 `tool_use_id`, `tool_source`, `tool_parameters`를 밀어내던 결함이 수정되었습니다. 2.1.301에서 추가된 속성의 후속 수정이므로, 2.1.301 단독 환경의 `classifier_category` 부재는 차단이 없었다는 증거가 아닙니다. `monitoring-setup` 스킬은 `claude_code.tool_decision`을 관측 대상으로 나열하며(`.claude/skills/monitoring-setup/SKILL.md:182`), `OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT`는 이 가이드 밖의 추적 파일에서 0건입니다(`git grep -n OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1).

기타 49건 — 이 저장소 비해당(`[Cloud sessions]`·`[Claude Tag]`·`[Code Review]`·`[Remote Control]`·`[VSCode]`·Self-hosted runner·Windows 전용 항목, 태그 없는 cloud session 비용·사용량 재시작 수정, `/design-sync`·`/design-login`·`/design consent` 등 Claude Design 안내, Vertex·Bedrock 전환 오류와 gateway의 Opus 4 접두사 모델명, plugin marketplace의 reftable 재복제·`claude plugin details <name>@builtin` 안내·plugin이 많을 때의 시작 시간·PowerShell 도구, 데스크톱 앱의 MCP 인증 안내, artifact 빈 편집 목록 게시, agents view 빈 행과 `← for agents` 힌트, `claude remote-control --help`, prompt suggestions의 크레딧 과금, 백틱 URL·이모지 줄바꿈 렌더링, 배경 세션의 LLM gateway 안내, Claude in Chrome 안내문 위치, `/feedback` 정책 안내 등 harness 비영향 세부사항으로 분류했습니다 [가설 — 범주별 저장소 사용 여부는 개별 실측하지 않음]). 실측: `gh release view v2.1.302 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 63건 중 위 본문 14건을 다뤘으므로 63 − 14 = 49건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 이 문서의 규범 변경 제안은 없습니다(CC 2.1.302 CHANGELOG 항목 기준). fork 서브에이전트의 `-p` 기본 활성화와 permission mode 기본값 변경은 R009·R010이 이미 다루는 전제(fork 컨텍스트 상속, 유효 모드 실측)를 무인 실행 경로로 넓히는 항목입니다.
- 후속 실측 후보: (1) `defaultMode`와 `--permission-mode` 없이 서드파티 provider, 텔레메트리를 끈 1st-party, 새 설치 각각에서 `claude -p` init `permissionMode`를 실측합니다(templates 미러의 `defaultMode` 미설정 구성 포함). (2) 무인 `claude -p`에서 `subagent_type: "fork"`가 도구 목록에 노출되는지 확인합니다. (3) `.mcp.json` 두 서버의 협상 `protocolVersion`을 확인합니다.

---

## v2.1.303 (2026-10-18)

> Issue: #1865 — Claude Code v2.1.303 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 2.1.304~2.1.310 CHANGELOG 절을 각각 잘라 `2.1.303` 문자열과 "Revert"(대소문자 무시)를 검색한 결과(`grep -n -i -E '2\.1\.303|revert' section-<버전>.md`), 일곱 절 모두에서 일치하는 줄이 관측되지 않았습니다. 따라서 이 릴리즈를 되돌리거나 그 회귀를 고치는 문장은 상한까지 관측되지 않았습니다. 릴리즈 게시 시각은 2026-10-18T22:26:54Z입니다(`gh release view v2.1.303 -R anthropics/claude-code --json publishedAt`).

### 일반 수정

- CHANGELOG 원문: "Bug fixes and reliability improvements"
  (303) 이 릴리즈의 노트는 일반적인 버그 수정과 안정성 개선이라는 한 문장으로만 구성되며 개별 변경을 명시하지 않습니다(`gh release view v2.1.303 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 1). 따라서 훅, 서브에이전트, 권한, headless 실행 등 이 저장소 하네스의 어떤 동작이 바뀌었는지는 노트로 판정할 수 없습니다 [가설 — 판정하려면 2.1.302와 2.1.303에서 같은 훅·`claude -p` 실행의 출력을 비교해야 합니다]. 이 릴리즈를 근거로 룰·훅·설정을 바꾸지 않으며, 2.1.302와 2.1.303 사이에서 동작 차이가 관측되면 이 릴리즈를 원인 후보로 함께 기록합니다.

기타 0건 — 이 저장소 비해당 항목은 없습니다. 실측: `gh release view v2.1.303 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 1건 중 위 본문 1건을 다뤘으므로 1 − 1 = 0건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 룰·훅·설정 변경은 필요하지 않습니다. 노트가 개별 변경을 명시하지 않으므로 조치 근거가 되는 항목이 없습니다.

---

## v2.1.304 (2026-10-19)

> Issue: #1866 — Claude Code v2.1.304 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 2.1.305~2.1.310의 CHANGELOG 절을 각각 잘라 "2.1.304"와 "Revert"를 검색했습니다. "Revert"는 여섯 절 모두에서 0건이었고, "2.1.304"는 2.1.305 절의 한 문장에서 나타났습니다. 그 문장은 "Fixed every request failing on Vertex, Bedrock and other providers when the endpoint or a gateway rejects tool search, and behind gateways with ToolSearch disallowed or left out of `--tools` (a 2.1.304 regression): Claude Code now retries without it"이며, 도구 검색과 관련된 2.1.304 회귀를 고친 문장입니다. 원문은 회귀를 일으킨 2.1.304 변경을 특정하지 않으며, 실패 조건에는 Vertex·Bedrock 등 provider와 `ToolSearch`를 금지하거나 `--tools`에서 뺀 게이트웨이가 들어 있습니다. 2.1.304 절에서 도구 검색을 다루는 최상위 불릿은 아래 「컨텍스트 · compaction · 도구 검색」 소절의 custom `ANTHROPIC_BASE_URL` 항목 하나입니다(`awk -v v=2.1.304 '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -i -E 'tool ?search'` = 1). 다만 그 항목이 이 회귀의 원인인지는 원문으로 확인되지 않습니다 [가설 — 이후 CHANGELOG나 이슈에서 원인 변경이 명시되면 판정]. 릴리즈 게시 시각은 2026-10-19T21:34:39Z입니다(`gh release view v2.1.304 -R anthropics/claude-code --json publishedAt`). 릴리즈 노트의 최상위 불릿 76줄은 CHANGELOG 2.1.304 절의 최상위 불릿 76줄과 순서까지 같습니다(python3 목록 비교 결과 identical).

### 훅 · 스킬

- CHANGELOG 원문: "Fixed a PreToolUse hook's deny reason being replaced by a timeout error when an Agent SDK callback hook on the same tool call timed out"
  (304) 같은 도구 호출에 걸린 Agent SDK 콜백 훅이 타임아웃되면 PreToolUse 훅의 거부 사유가 타임아웃 오류로 바뀌던 결함이 수정되었습니다. 이 저장소의 PreToolUse 훅은 `.claude/settings.json`에 배선된 11개 블록입니다(`jq '.hooks.PreToolUse | length' .claude/settings.json` = 11). 관측한 범위에서 저장소 코드에는 Agent SDK 의존성이 보이지 않으므로(`git grep -n -E 'claude-agent-sdk|claude-code-sdk' -- package.json src packages` rc=1) SDK 콜백 훅이 같은 도구 호출에 겹치는 조건은 관측되지 않았습니다.
- CHANGELOG 원문: "[VSCode] Fixed one cause of sessions failing to start with "Subprocess initialization did not complete within 60000ms": time a SessionStart command hook spends running no longer counts toward the limit, up to 10 minutes in total"
  (304) VSCode에서 세션이 "Subprocess initialization did not complete within 60000ms"로 시작에 실패하던 원인 하나가 수정되어, SessionStart command 훅이 실행되는 시간은 합계 10분까지 이 제한에 포함되지 않습니다. 이 저장소는 `.claude/settings.json`의 SessionStart에 command 훅 7개를 배선하며, 그 훅들에는 개별 `timeout`이 없습니다(`jq -c '[.hooks.SessionStart[].hooks[] | .type] | group_by(.) | map({(.[0]): length}) | add' .claude/settings.json` = `{"command":7}`, `jq -c '[.hooks.SessionStart[].hooks[] | .timeout // null]'` = null 7개). 원문에 따르면 수정 전 버전에서는 이 훅들의 실행 시간이 60초 시작 제한에 포함되었으므로, VSCode 확장으로 이 저장소를 여는 환경에서는 시작 실패에 기여했을 수 있습니다 [가설 — 7개 훅의 실행 시간 합계와 VSCode 시작 실패 발생 여부는 미관측]. VSCode 전용 항목이며 CLI 세션과 `claude -p`에는 해당하지 않습니다.
- CHANGELOG 원문: "Fixed a skill's `once` hook also removing another skill's identical hook after it ran"
  (304) 한 스킬의 `once` 훅이 실행된 뒤 다른 스킬의 동일한 훅까지 제거하던 결함이 수정되었습니다. 관측한 범위에서 `.claude/skills` 아래 파일에는 `hooks:` 키가 0건이므로(`git grep -n -E '^[[:space:]]*hooks:' -- .claude/skills` rc=1) 스킬 훅 경로의 영향 조건은 관측되지 않았습니다.
- CHANGELOG 원문: "Changed skill hooks: the skills of one source (a repo, your own folder, or a plugin) can register at most 1,024 hooks and 16,384 matcher characters per session"
  (304) 한 출처(저장소, 사용자 폴더, 플러그인)의 스킬이 세션당 등록할 수 있는 훅이 최대 1,024개, matcher 문자 수가 최대 16,384자로 제한됩니다. 위 `git grep` 결과(rc=1)에 따르면 이 저장소의 스킬은 훅을 선언하지 않으므로 이 상한과 관계가 관측되지 않았습니다. 원문의 대상은 스킬 훅이며, 프로젝트 settings 훅이 이 계수에 들어가는지는 원문이 밝히지 않습니다. 들어가더라도 `.claude/settings.json`의 훅은 64개(command 63, prompt 1)이므로(`jq '[.hooks[][].hooks[]] | length' .claude/settings.json` = 64) 1,024개 상한 아래이고, matcher 문자 수 합계도 374자로(`jq '[.hooks[][].matcher // ""] | add | length' .claude/settings.json` = 374) 16,384자 상한 아래입니다.
- CHANGELOG 원문: "Changed skills under a policy that allows hooks from plugins only: a skill used in the main conversation whose hooks are kept out no longer gets its `allowed-tools`"
  (304) 플러그인 훅만 허용하는 정책 아래에서, 훅이 배제된 스킬을 메인 대화에서 쓰면 그 스킬의 `allowed-tools`가 더 이상 부여되지 않습니다. 이 저장소에서 `allowed-tools`를 선언한 스킬은 `.claude/skills/diagram-design/SKILL.md:12`와 `.claude/skills/profile/SKILL.md:7`의 두 개입니다(`git grep -n -E '^allowed-tools:' -- '.claude/skills/*/SKILL.md'`). 두 스킬에는 `hooks:` 키가 없으므로(위 `git grep` rc=1) 원문의 "hooks are kept out" 조건에 해당하지 않는다고 봅니다 [가설 — 훅을 선언하지 않은 스킬도 이 조건에 드는지는 원문이 밝히지 않으며, 해당 managed 정책을 켠 환경에서 두 스킬의 도구 허용을 실측하면 판정]. 정책 자체는 managed settings 사안이라 저장소 파일에서는 관측 대상이 아닙니다.
- CHANGELOG 원문: "Changed compaction to send Claude the skill list again afterwards; `/reload-skills` now sends only new or changed skills"
  (304) compaction 뒤에 스킬 목록을 Claude에 다시 보내도록 바뀌었고, `/reload-skills`는 새로 추가되거나 바뀐 스킬만 보냅니다. 이 저장소의 `.claude/skills/`에는 스킬 디렉토리 114개가 있습니다(`command ls -d .claude/skills/*/ | wc -l` = 114). 이 중 init이 설치하는 것은 `scope: package` 6개를 뺀 108개입니다(`src/core/scope-filter.ts:36`의 `return scope !== 'package';`, `git grep -l -E '^scope: package' -- '.claude/skills/*/SKILL.md' | wc -l` = 6). 따라서 compaction 직후의 컨텍스트 사용량(R013 임계값, statusline CTX%)에는 그 세션이 로드한 스킬 목록 크기가 다시 더해집니다 [가설 — compaction 직전·직후의 `/context` 출력과 statusline CTX%를 비교하면 판정]. R013의 v2.1.261 노트(`.claude/rules/SHOULD-ecomode.md:97`)는 이 저장소의 스킬 열거 블록 개수를 적습니다. 이 절을 작성한 v2.0.3 시점에는 "115개"였고, v2.0.5(#1877)에서 위 디렉토리 계수와 같은 114개로 정정되었습니다.
- CHANGELOG 원문: "Fixed resumed and cloud sessions sending Claude the whole skill list again each time plugins reloaded at startup"
  (304) 재개된 세션과 cloud 세션이 시작할 때 플러그인이 다시 로드될 때마다 전체 스킬 목록을 Claude에 다시 보내던 결함이 수정되었습니다. 스킬 디렉토리 114개(위 계수)를 둔 이 저장소에서 `--resume`으로 재개한 세션에서는 이 중복이 컨텍스트 비용을 늘렸을 수 있습니다 [가설 — 수정 전 버전으로 재개한 세션의 트랜스크립트에서 스킬 목록 반복 횟수를 세면 판정].

### 서브에이전트 · 팀원 · headless

- CHANGELOG 원문: "Fixed a plugin keeping a headless run going past `--max-turns`, Stop, or ended input by spawning subagents or re-running a finished one"
  (304) 플러그인이 서브에이전트를 스폰하거나 끝난 서브에이전트를 다시 실행해 headless 실행을 `--max-turns`·Stop·입력 종료 뒤까지 이어가던 결함이 수정되었습니다. 원문의 주체는 플러그인입니다. 관측한 범위에서 이 저장소의 `.claude/`와 `CLAUDE.md`에는 `--max-turns` 사용이 보이지 않으며(`git grep -n -E -- '--max-turns' -- .claude CLAUDE.md` rc=1), 무인 `/fsd`의 `claude -p` 경로는 `OMCUSTOM_UNATTENDED=1`로 무인 실행을 표시합니다(`.claude/skills/fsd/SKILL.md:133`). 이 저장소는 프로젝트 settings에서 플러그인을 켜지 않으며(`jq -c '.enabledPlugins // null' .claude/settings.json` = null), 사용자 수준에서 켠 플러그인이 이 결함을 일으켰는지는 관측하지 않았습니다 [가설 — headless 실행 트랜스크립트에서 Stop 이후의 서브에이전트 스폰이 보이면 판정].
- CHANGELOG 원문: "Fixed self-paced `/loop` wakeups scheduled at the 1-hour maximum firing just after the 1-hour prompt cache expired, so those wakeups no longer re-read the conversation uncached"
  (304) 1시간 최대치로 예약된 self-paced `/loop` wakeup이 1시간 prompt cache가 만료된 직후에 발동하던 결함이 수정되어, 그런 wakeup은 더 이상 대화를 캐시 없이 다시 읽지 않습니다. `/fsd` 스킬은 반복 단위를 `/loop` recurrence, 곧 모델이 주기를 정하는 self-paced loop로 기술하고(`.claude/skills/fsd/SKILL.md:39`), 무인(`claude -p`, 예약 실행) 세션에서 `/goal`·`/loop`를 호출하는 경로를 권장합니다(`.claude/skills/fsd/SKILL.md:172`). 그 경로의 wakeup이 1시간 최대치로 예약된 적이 있다면, 수정 전 버전에서는 그런 wakeup마다 대화를 캐시 없이 다시 읽는 비용이 들었을 수 있습니다 [가설 — 무인 `/fsd` 실행 기록에서 1시간 최대치 wakeup의 발생 여부와 그 요청의 cache read 토큰으로 판정].
- CHANGELOG 원문: "Fixed subagents sometimes forgetting their most recent work when they were messaged or resumed right after finishing"
  (304) 서브에이전트가 끝난 직후에 메시지를 받거나 재개되면 가장 최근 작업을 때때로 잊던 결함이 수정되었습니다. R009는 완료 알림에 보고 본문이 없으면 한 턴 기다리고, 그래도 없으면 산출물을 실측한 뒤 `SendMessage`로 재요청하도록 안내합니다(`.claude/rules/MUST-parallel-execution.md:368`). 수정 전 버전에서는 이 재요청을 받은 서브에이전트가 직전 작업을 잊은 채 답했을 수 있습니다 [가설 — 수정 전 버전의 재요청 응답과 실제 산출물을 대조한 기록은 미관측]. 재요청 응답도 결정론적 ground-truth로 대조한다는 원칙(R018 「Member Completion Verification」, 제목 `.claude/rules/MUST-agent-teams.md:501`)은 그대로입니다.
- CHANGELOG 원문: "Fixed agent teams: approving a shutdown request from the main session no longer exits the whole CLI"
  (304) 메인 세션에서 shutdown 요청을 승인하면 CLI 전체가 종료되던 agent teams 결함이 수정되었습니다. 이 환경에서 R018은 `TeamCreate` 부재로 비활성입니다(`.claude/rules/MUST-agent-teams.md:22`, `:30`). 같은 파일 `:22`는 이름 붙인 `Agent` 스폰이 세션의 암묵적 팀의 팀원이 된다고 기록하지만, 그 팀원에게서 shutdown 요청이 오는지는 관측하지 않았습니다 [가설 — 이름 붙인 팀원의 shutdown 요청을 메인에서 승인한 뒤 CLI가 유지되는지로 판정].
- CHANGELOG 원문: "Improved responsiveness and throughput when many subagents are running at the same time"
  (304) 많은 서브에이전트가 동시에 실행될 때의 응답성과 처리량이 개선되었습니다. R009의 동시 실행 상한 "5 concurrent (soft default: 4)"(`.claude/rules/MUST-parallel-execution.md:190`)는 프로젝트 정책이므로 이 개선으로 바뀌지 않으며, 같은 파일의 Stability Testing Protocol(제목 `:256`, 본문 `:258`)이 정한 축소 기준도 그대로입니다.
- CHANGELOG 원문: "Improved the `claude -p` invalid-settings warning: a file that did not load lists only what stopped it, and long lists are capped per file"
  (304) `claude -p`의 잘못된 settings 경고가 개선되어, 로드되지 않은 파일은 로드를 막은 원인만 나열하고 긴 목록은 파일별로 상한을 둡니다. 이 저장소의 `playwright-compress` 훅은 훅 안에서 `claude -p`를 호출하지만 stderr를 `2>/dev/null`로 버리므로(`.claude/hooks/scripts/playwright-compress.sh:54`) 이 경고의 형식 변경은 그 훅의 출력에 닿지 않습니다. R010이 기록한 project/local `defaultMode: "bypassPermissions"` 무시 WARN(`.claude/rules/MUST-orchestrator-coordination.md:625`, `--debug-file` 실측, DETAIL 주석 안)이 이 경고와 같은 출력인지는 관측하지 않았습니다 [가설 — `claude -p`로 무시 WARN을 재현해 stderr와 debug 파일의 형식을 대조하면 판정].

### 컨텍스트 · compaction · 도구 검색

- CHANGELOG 원문: "Fixed a "Context limit reached" or "Prompt is too long" error after stopping a turn while Claude Code was compacting a conversation the API had rejected as too long"
  (304) API가 너무 길다고 거부한 대화를 Claude Code가 compaction하는 도중 턴을 중지하면 "Context limit reached" 또는 "Prompt is too long" 오류가 나던 결함이 수정되었습니다. R013은 같은 "Prompt is too long" 계열 수정을 v2.1.269/273·v2.1.274 노트로 기록하고 있으며(`.claude/rules/SHOULD-ecomode.md:99`, `:101`), 이번 수정은 그중 턴 중지 경로를 다룹니다. 무인 `/fsd` 실행은 사람이 턴을 중지하지 않으므로 이 경로의 대상이 아니라고 봅니다 [가설 — 무인 실행 중 compaction 도중의 인터럽트 발생 기록으로 판정].
- CHANGELOG 원문: "Fixed `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200k` silently setting a 100K window: the variable now accepts `k` and `M` suffixes like `--autocompact`, and warns when a value is out of range or ignored"
  (304) `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200k`가 조용히 100K 창을 설정하던 결함이 수정되어, 이제 이 변수가 `--autocompact`처럼 `k`·`M` 접미사를 받고 범위를 벗어나거나 무시되는 값에는 경고합니다. 관측한 범위에서 이 저장소에는 이 변수와 `--autocompact` 사용이 보이지 않습니다(`git grep -n -E 'CLAUDE_CODE_AUTO_COMPACT_WINDOW|--autocompact' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` rc=1). R013의 백분율 임계값은 창 크기에 따라 절대 토큰량이 달라지므로(`.claude/rules/SHOULD-ecomode.md:91`), 사용자 환경에서 이 변수에 접미사 값을 넣었다면 수정 전 버전의 실효 창은 원문 예시처럼 의도와 달랐을 수 있습니다 [가설 — 사용자 환경의 변수 값은 미관측].
- CHANGELOG 원문: "Changed tool search to be on by default behind a custom `ANTHROPIC_BASE_URL`; a 400 or 422 from the gateway is retried without it"
  (304) custom `ANTHROPIC_BASE_URL` 뒤에서도 도구 검색이 기본으로 켜지고, 게이트웨이가 400 또는 422를 돌려주면 도구 검색 없이 재시도합니다. 이 저장소의 두 settings에는 `ANTHROPIC_BASE_URL` 설정이 보이지 않습니다(`git grep -n 'ANTHROPIC_BASE_URL' -- .claude/settings.json templates/.claude/settings.json .claude/hooks` rc=1, 두 파일의 `jq -c '.env // {} | keys'` = `[]`). 관측한 범위(`git grep -n 'ANTHROPIC_BASE_URL' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`)에서 그 밖의 참조는 룰 버전 노트 서술 네 곳(`.claude/rules/MUST-orchestrator-coordination.md:663`, `:665`, `.claude/rules/MUST-safety.md:55`, `.claude/rules/MAY-optimization.md:120` — 네 곳 모두 HTML 주석 안)과 그 `templates/` 미러, 그리고 `wiki/rules/r005.md:74`·`:129`의 요약입니다. 2.1.305는 도구 검색과 관련된 2.1.304 회귀를 수정했으나 원문은 대상 변경을 특정하지 않으므로, 이 항목과의 연결은 위 Scope-ceiling check에 적은 대로 [가설]입니다. R002 § 각주(`.claude/rules/MUST-permissions.md:20`)는 `ToolSearch`가 실행 환경에 없을 수 있다는 전제를 이미 두고 있습니다.

### Bash · 도구 · worktree

- CHANGELOG 원문: "Fixed Bash and PowerShell deleting a large command's output file when it could not be copied to the session's tool-results folder, unless the disk is full"
  (304) 큰 명령 출력 파일을 세션의 tool-results 폴더로 복사하지 못했을 때 Bash·PowerShell이 그 출력 파일을 삭제하던 결함이 수정되었습니다(디스크가 가득 찬 경우는 제외). R013의 v2.1.261 노트는 command 출력이 인라인 상한을 넘으면 파일로 저장된다는 전제에서 `bashOutputMaxChars`를 기본값으로 올리지 않고 독립적인 exit-code 조회를 우선하도록 안내합니다(`.claude/rules/SHOULD-ecomode.md:97`). 수정 전 버전에서는 파일로 넘어간 큰 출력이 복사 실패 시 사라질 수 있었으므로, 같은 줄의 exit-code 우선 지침은 그 경우에도 판정 근거를 남깁니다.
- CHANGELOG 원문: "Fixed `rm -r` of a mounted drive or a folder at its top level (`/Volumes`, `/media`, WSL's `/mnt/c`) not getting the safety prompt that `rm -rf /Applications` gets"
  (304) 마운트된 드라이브나 그 최상위 폴더(`/Volumes`, `/media`, WSL의 `/mnt/c`)에 대한 `rm -r`이 `rm -rf /Applications`가 받는 안전 프롬프트를 받지 못하던 결함이 수정되었습니다. R001은 광범위 삭제를 금지 작업으로 둡니다(`.claude/rules/MUST-safety.md:11`). 이 플랫폼 프롬프트는 R001의 v2.1.261 노트(`.claude/rules/MUST-safety.md:59`, DETAIL 주석 안)가 서술한 위험 `rm` 프롬프트와 같은 defense-in-depth 성격이며, R001의 사전 확인·승인 의무를 대체하지 않습니다.
- CHANGELOG 원문: "Fixed `claude --worktree` removing the worktree and its branch without asking at exit when HEAD was detached or on another branch, which could lose commits"
  (304) HEAD가 detached이거나 다른 브랜치에 있을 때 `claude --worktree`가 종료 시 묻지 않고 worktree와 그 브랜치를 제거해 커밋을 잃을 수 있던 결함이 수정되었습니다. 관측한 범위에서 이 저장소의 `.claude/`와 `CLAUDE.md`에는 `claude --worktree` 호출이 보이지 않습니다(`git grep -n -F 'claude --worktree' -- .claude CLAUDE.md` rc=1). 더 넓은 검색 `git grep -n -E 'isolation: *"?worktree|--worktree|EnterWorktree' -- .claude CLAUDE.md`에서 `--worktree`에 걸리는 줄은 `.claude/hooks/scripts/destructive-git-guard.sh:34`이며, 이 줄의 `--worktree`는 `git restore`의 플래그를 가리는 가드 패턴입니다. 같은 검색에서 worktree를 만드는 스킬 경로는 `omcustom-auto-improve`의 `EnterWorktree` 사용입니다(`.claude/skills/omcustom-auto-improve/SKILL.md:59`). `EnterWorktree` 경로가 같은 종료 처리를 거치는지는 관측하지 않았습니다 [가설 — `EnterWorktree`로 만든 worktree에서 브랜치를 바꾼 뒤 종료해 브랜치가 남는지로 판정]. 이 결함은 R001의 미병합 브랜치 삭제 승인 의무(「Destructive Git Commands」, 제목 `.claude/rules/MUST-safety.md:14`)와 같은 위험 부류입니다.
- CHANGELOG 원문: "Fixed `claude --help` text for `--tools`, `--resume`, `--debug`, `--json-schema`, `--disable-slash-commands`, `--system-prompt-snapshot` and `claude update` to match actual behavior"
  (304) `--tools`·`--resume`·`--debug` 등의 `claude --help` 설명이 실제 동작에 맞게 고쳐졌습니다. R010은 `--dangerously-skip-permissions`의 의미를 CC 2.1.289의 `claude --help` 출력으로 인용하는데(`.claude/rules/MUST-orchestrator-coordination.md:588`), 이 플래그는 원문의 정정 목록에 들어 있지 않습니다. R002 ‡ 각주의 `--tools` 근거는 help 텍스트가 아니라 CHANGELOG 2.1.162 문장입니다(`.claude/rules/MUST-permissions.md:18`). 따라서 두 인용의 근거는 이번 정정으로 바뀌지 않습니다.
- CHANGELOG 원문: "Removed the notes from `claude plugin validate` that predicted where a mod's hooks would run"
  (304) `claude plugin validate`가 mod 훅이 실행될 위치를 예측해 보여 주던 안내가 제거되었습니다. R017은 스킬 추가·수정 후 `claude plugin validate`를 개수 대조와 함께 실행하도록 안내합니다(`.claude/rules/MUST-sync-verification.md:533`). 제거된 것은 mod 훅에 관한 안내이며, 관측한 범위에서 저장소에는 mod 디렉토리가 보이지 않습니다(`git ls-files | grep -i -E '(^|/)mods?/'` 0줄). 따라서 R017 검증 출력의 개수 대조에는 영향이 없다고 봅니다 [가설 — mod의 배치 위치 규약은 확인하지 않았으며, 2.1.303과 2.1.304의 검증 출력을 비교하면 판정].

기타 55건 — 이 저장소 비해당으로 판단한 항목입니다: mods·plugin API(`tool.check`의 `decider: "person"`·`e.isReadOnly`, `settings.read` 계층, mod 재로드·버튼·공유, 먼저 실행된 플러그인이 mod 훅을 건너뛸 때의 transcript 줄), `/auto-mode-setup`, `/claude-api` 스킬 갱신, Pro·Max 재개 사용량 경고, 조직 정책 갱신·Consumer Terms·`/privacy-settings`, Linux sandbox `denyRead` glob, `CLAUDE_CODE_TRANSCRIPT_LOCAL_GC`, Cowork·Remote Control·Claude Desktop 전용 항목, SDK·desktop 세션의 context usage 확인 대기, LLM gateway `context_management` 오류, server-managed settings로 전달된 OpenTelemetry 설정, Write 결과의 경로 표시, 이미지 이름의 idle pipe를 기다리는 Read의 인터럽트, `/effort` 표시, 다중 선택 질문 메모 절단·transcript `{`/`}`·agents view Ctrl+C·compaction 요약의 도구 이름 표시 같은 터미널 UI, `/usage`·`/artifacts`·`/fast` 표시, auto mode 세션 파일 크기, SDK·headless의 큰 compacted 세션 재개 속도, 긴 대화의 메모리 사용, 나머지 VSCode 항목과 Self-hosted runner·Windows·Cloud sessions·Claude Tag·Code Review 항목. 기능어 표본 검색(`git grep -n -i -o -E 'auto-mode-setup|managed-agents|TRANSCRIPT_LOCAL_GC|remote.control|denyRead|privacy-settings|context_management|OTEL_|OpenTelemetry|Cowork|tool\.check|settings\.read|reload-skills|/effort|/usage|/artifacts|/fast([^a-z]|$)|isReadOnly|cleanupPeriodDays|self-hosted' -- .claude CLAUDE.md .github package.json`)의 히트 파일은 `.claude/rules/` 아래 11개와, 룰 밖의 다섯 파일입니다. 룰 밖 히트 가운데 OpenTelemetry는 `monitoring-setup` 스킬과 그 메타데이터(`.claude/ontology/skills.yaml`, `.claude/skills/intent-detection/patterns/agent-triggers.yaml`)입니다. 그 스킬의 「CC 버전 분기 안내」 절(`.claude/skills/monitoring-setup/SKILL.md:22`)은 2.1.282부터 project·local 설정에 적힌 OpenTelemetry 변수가 무시된다고 적습니다(`:24`의 마스터 스위치·endpoint·내용 캡처 변수; `enable` 절의 `:60`도 같은 취지). `enable` 절(`:28`)은 2.1.282 미만에서는 `.claude/settings.local.json`(`:34`), 2.1.282 이상에서는 user-scope `~/.claude/settings.json`과 셸 export(`:73`, `:74`)를 안내합니다. 다만 Upgrade Path는 버전 구분 없이 `.claude/settings.local.json`을 안내하고(`:193` "In settings.local.json env:"), `trajectory-otel on` 절차도 `.claude/settings.local.json`을 쓰라고 적되(`:306`) 같은 기능의 Activation Notes(`:381`)가 2.1.282부터는 `enable`·`disable`의 2.1.282 이상 분기처럼 적용하라고 덧붙입니다. 따라서 그 스킬이 안내하는 경로들은 이 항목의 대상인 server-managed settings 경로와 다릅니다. 나머지 두 파일은 부분 문자열 일치입니다(`.claude/skills/research/SKILL.md:292`, `:294`의 "risks/efforts"·"risk/effort", `CLAUDE.md:245`(`:227`에서 열린 HTML 주석 안)의 cc-token-saver `/usage-view`). 룰 파일 11개의 히트는 문맥별로 판정하지 않았고, 기능어가 없는 성능·표시 항목도 검색으로 판정하지 않았습니다 [가설 — 항목별 저장소 측정은 위 본문 항목에 한해 실행했습니다]. 실측: `gh release view v2.1.304 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 76건 중 위 본문 21건을 다뤘으므로 76 − 21 = 55건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 관측한 범위에서 행동 변화를 위해 룰·CLAUDE.md·에이전트·훅을 바꿔야 한다고 확정한 항목은 없습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때만 1줄). 위 compaction 항목에 적은 R013 스킬 개수의 차이(v2.0.3 시점 "115개" 대 디렉토리 계수 114개)는 카운트 동기화 사안(R017 「Count Sync」)이라 이 절의 반영 범위에 넣지 않았고, v2.0.5(#1877)에서 114개로 정정되었습니다. 위 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.305 (2026-10-20)

> Issue: #1868 — Claude Code v2.1.305 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 2.1.306~2.1.310의 CHANGELOG 절을 각각 잘라 "2.1.305"와 "Revert"를 검색했습니다. "Revert"는 다섯 절 모두에서 0건이었고, "2.1.305"는 2.1.307 절의 한 문장에서 나타났습니다. 그 문장은 "Changed the `axScreenReader` setting and `CLAUDE_AX_SCREEN_READER` in a settings `env` block to apply only from user, managed or `--settings` settings (since 2.1.305)"이며, 스크린 리더 설정의 적용 범위를 좁히는 내용이라 아래 본문 항목을 되돌리거나 좁히지 않습니다. 이 저장소의 두 settings에는 `env` 키가 없습니다(`jq -c '.env // {} | keys'` = `[]`, `.claude/settings.json`·`templates/.claude/settings.json`). 릴리즈 게시 시각은 2026-10-20T20:46:50Z입니다(`gh release view v2.1.305 -R anthropics/claude-code --json publishedAt`). 릴리즈 노트의 최상위 불릿 38줄은 CHANGELOG 2.1.305 절의 최상위 불릿 38줄과 순서까지 같습니다(python3 목록 비교 결과 identical).

### 도구 검색 · 설정 · MCP · 시작 경고

- CHANGELOG 원문: "Fixed every request failing on Vertex, Bedrock and other providers when the endpoint or a gateway rejects tool search, and behind gateways with ToolSearch disallowed or left out of `--tools` (a 2.1.304 regression): Claude Code now retries without it"
  (305) 2.1.304의 회귀로, 엔드포인트나 게이트웨이가 도구 검색을 거부하는 Vertex·Bedrock 등 provider에서, 그리고 `ToolSearch`를 금지하거나 `--tools`에서 뺀 게이트웨이 뒤에서 모든 요청이 실패하던 결함이 수정되었고, 이제 도구 검색 없이 재시도합니다. 원문은 회귀를 일으킨 2.1.304 변경을 특정하지 않습니다. 이 저장소의 두 settings에는 provider나 게이트웨이를 고르는 `env` 설정이 보이지 않으며(위 `jq` 결과 `[]`), `.claude/settings.json`의 permission `deny` 규칙도 0개입니다(`jq -c '.permissions.deny // [] | length' .claude/settings.json` = 0). 사용자 환경이 2.1.304에서 이 조건에 해당했는지는 관측하지 않았습니다.
- CHANGELOG 원문: "Fixed `/effort` and `/autocompact` settings not applying when the model name differed from a `modelOverrides` value by letter case or a `[1m]` tag"
  (305) 모델 이름이 `modelOverrides` 값과 대소문자나 `[1m]` 태그에서 다를 때 `/effort`·`/autocompact` 설정이 적용되지 않던 결함이 수정되었습니다. 이 저장소의 두 settings에는 `modelOverrides`가 보이지 않습니다(`git grep -n modelOverrides -- .claude/settings.json templates/.claude/settings.json` rc=1). R006은 `[1m]` 접미사를 1M 컨텍스트 표기로 안내하므로(`.claude/rules/MUST-agent-design.md:62`), `modelOverrides`를 쓰는 사용자 환경에서는 이 표기 차이가 결함 조건이었을 수 있습니다 [가설 — 사용자 환경의 `modelOverrides` 값은 미관측].
- CHANGELOG 원문: "Improved MCP consent dialogs so an Enter meant for the prompt is less likely to be taken as Accept"
  (305) 프롬프트에 입력하려던 Enter가 MCP 동의 대화상자의 Accept로 받아들여질 가능성이 줄었습니다. 이 저장소는 `.mcp.json`에 프로젝트 MCP 서버 2개를 두며(`jq -c '.mcpServers | keys' .mcp.json` = `["eraser","ontology-rag"]`), `.claude/settings.json`에서 `enableAllProjectMcpServers: true`와 `enabledMcpjsonServers: ["ontology-rag"]`를 설정합니다(`jq -c '{enableAllProjectMcpServers, enabledMcpjsonServers}' .claude/settings.json`). 이 설정이 적용되는 환경에서는 프로젝트 MCP 서버의 동의 대화상자가 뜨지 않는다고 봅니다 [가설 — 프로젝트 settings의 이 두 키가 현재 CC에서 적용되는지는 미관측이며, 새 클론에서 대화형 세션을 시작해 동의 대화상자 표시 여부로 판정].
- CHANGELOG 원문: "Fixed startup warnings printing as raw text above the logo: they now go to the debug log, and permission rules that restrict nothing show as warning rows under the banner"
  (305) 시작 경고가 로고 위에 원문 텍스트로 찍히던 문제가 수정되어 이제 debug log로 가고, 아무것도 제한하지 않는 permission 규칙은 배너 아래 경고 행으로 표시됩니다. R010이 기록한 project/local `defaultMode: "bypassPermissions"` 무시 WARN은 `claude -p --debug-file`의 debug 파일에서 관측된 것입니다(`.claude/rules/MUST-orchestrator-coordination.md:625`, DETAIL 주석 안). 그 WARN이 대화형 시작 화면에도 찍혔는지는 관측하지 않았으므로, 이 변경 뒤에도 해당 확인은 debug 파일로 합니다 [가설 — 대화형 시작 화면과 debug log를 함께 보면 판정]. 이 저장소의 `.claude/settings.json` permission은 allow 17개·deny 0개·ask 0개입니다(`jq -c '.permissions | {allowN:(.allow//[]|length), denyN:(.deny//[]|length), askN:(.ask//[]|length)}' .claude/settings.json`). R010에 따르면 2.1.257부터 project/local의 `defaultMode: "bypassPermissions"`는 무시됩니다(`.claude/rules/MUST-orchestrator-coordination.md:588`). 같은 줄의 `claude -p` init `permissionMode` 실측 규칙(CC 2.1.289, 2026-10-06)에 따르면, 이 저장소처럼 project에 그 값이 있으면(`jq -r '.permissions.defaultMode' .claude/settings.json` = bypassPermissions) 그 범위는 `default`로 귀결되어 user 값이 `bypassPermissions`가 아닌 한 `default`가 되고, user가 `bypassPermissions`이면 `bypassPermissions`로 남습니다. local 범위의 다른 값(같은 줄의 실측은 `default`, `acceptEdits`이며, `auto`는 2.1.257 CHANGELOG상 무시되나 미측정 `[가설]`, `plan`·`dontAsk`는 미측정)은 여전히 적용되어 project·user 값보다 우선하며, managed 설정과 실행 플래그도 원천입니다. 따라서 유효 모드는 기기마다 다르며, 대화형 세션의 결과는 R010이 `-p` 결과와 조정하지 않은 `[가설]`로 둡니다. 이 allow 규칙이 "restrict nothing" 경고 행으로 표시되는지는 관측하지 않았습니다 [가설 — 유효 모드를 기록한 대화형 세션의 시작 배너 경고 행으로 판정].

### 서브에이전트 · 팀원 · worktree · Workflow

- CHANGELOG 원문: "Fixed new worktrees in a bare repository sometimes starting from local HEAD instead of the default branch, and unchanged subagent worktrees sometimes not being cleaned up"
  (305) bare 저장소의 새 worktree가 기본 브랜치 대신 로컬 HEAD에서 때때로 시작하던 결함과, 바뀌지 않은 서브에이전트 worktree가 때때로 정리되지 않던 결함이 수정되었습니다. 이 저장소는 bare 저장소가 아닙니다(`git rev-parse --is-bare-repository` = false). 관측한 범위에서 frontmatter로 worktree 격리하는 에이전트는 보이지 않으며(`git grep -n -E '^isolation:' -- '.claude/agents/*.md'` 결과는 `.claude/agents/sec-codeql-expert.md:8`의 `sandbox` 한 건), 작성 기기의 작업 트리에서 조사 시점에 관측한 `git worktree list`는 1줄(메인 작업 트리)이었으며, 이 값은 체크아웃마다 다른 로컬 상태입니다. 서브에이전트 worktree 정리 결함은 호출 단위 `isolation: "worktree"` 위임에서 관련된다고 봅니다 [가설 — 호출 단위 worktree 위임 뒤 `git worktree list`의 잔존 줄로 판정].
- CHANGELOG 원문: "Fixed Claude naming the wrong model for a subagent's work after the subagent switched to a fallback model"
  (305) 서브에이전트가 fallback 모델로 바뀐 뒤 Claude가 그 서브에이전트 작업의 모델을 잘못 말하던 결함이 수정되었습니다. R009는 병렬 스폰 표시에 `[N] {subagent_type}:{model}` 형식을 쓰고(`.claude/rules/MUST-parallel-execution.md:290`), R006의 v2.1.247 버전 노트(`.claude/rules/MUST-agent-design.md:81`, HTML 주석 안)는 서브에이전트가 첫 호출의 model 404에서 세션의 fallback model chain을 쓴다고 기록합니다. 스폰 표시의 모델은 요청한 모델이며, 수정 전 버전에서는 fallback 전환 뒤 Claude가 서술한 실행 모델이 틀렸을 수 있습니다 [가설 — 서브에이전트 트랜스크립트의 `message.model` 값과 Claude의 서술을 대조하면 판정].
- CHANGELOG 원문: "Fixed cloud sessions and teammates not telling Claude when a compaction had to leave the oldest messages out of its summary to fit"
  (305) compaction이 요약 크기에 맞추려고 가장 오래된 메시지를 요약에서 빼야 했을 때 cloud 세션과 팀원이 이를 Claude에 알리지 않던 결함이 수정되었습니다. 이 환경에서 팀원은 이름 붙인 `Agent` 스폰으로 생깁니다(`.claude/rules/MUST-agent-teams.md:22`). 수정 전 버전에서는 오래 실행된 팀원 세션의 Claude가, compaction이 초기 위임 지시를 포함할 수 있는 가장 오래된 메시지를 요약에서 뺀 사실을 통보받지 못했을 수 있습니다 [가설 — 팀원 compaction에서 메시지 누락이 실제로 일어났는지는 미관측]. R018의 결정론적 완료 검증 원칙(「Member Completion Verification」, 제목 `.claude/rules/MUST-agent-teams.md:501`)은 그대로입니다.
- CHANGELOG 원문: "Fixed Workflow resume re-running already-completed `pipeline()` and `parallel()` agents instead of serving them from the run's journal"
  (305) Workflow resume이 이미 완료된 `pipeline()`·`parallel()` agent를 실행 journal에서 제공하지 않고 다시 실행하던 결함이 수정되었습니다. R009의 v2.1.269/271 버전 노트(`.claude/rules/MUST-parallel-execution.md:206`, HTML 주석 안)는 Workflow 스크립트 내부의 `parallel()`/`pipeline()` fan-out을 `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`가 규율한다고 적습니다. 관측한 범위에서 `.claude/skills`에는 `pipeline(`·`parallel(` 호출이 보이지 않으므로(`git grep -n -E '(^|[^[:alnum:]_])(pipeline|parallel)\(' -- .claude/skills` rc=1) 스킬이 배포하는 Workflow 스크립트 경로의 영향은 관측되지 않았습니다. 사용자가 작성한 Workflow 스크립트를 수정 전 버전에서 resume했다면 완료된 agent가 다시 실행되어 비용과 부수효과가 중복되었을 수 있습니다 [가설 — 해당 Workflow의 resume 기록으로 판정].

### 무인 실행 · Bash

- CHANGELOG 원문: "Added `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS` so unattended retry mode (`CLAUDE_CODE_RETRY_WATCHDOG`) notices a usage limit that was lifted before its reset"
  (305) 무인 재시도 모드(`CLAUDE_CODE_RETRY_WATCHDOG`)가 리셋 전에 해제된 사용량 한도를 알아차리도록 `CLAUDE_CODE_RETRY_WATCHDOG_USAGE_LIMIT_RECHECK_MS`가 추가되었습니다. 관측한 범위에서 이 저장소의 settings와 스킬은 `CLAUDE_CODE_RETRY_WATCHDOG`를 설정하지 않습니다(`git grep -n -E 'CLAUDE_CODE_RETRY_WATCHDOG' -- .claude/skills .claude/settings.json templates/.claude/settings.json` rc=1). 관측한 범위(`git grep -n 'RETRY_WATCHDOG' -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`)에서 그 밖의 참조는 R018 v2.1.260 버전 노트 서술(`.claude/rules/MUST-agent-teams.md:549`, HTML 주석 안)과 그 `templates/` 미러, 그리고 `wiki/rules/r018.md:161`의 영어 요약입니다. 무인 `/fsd`를 이 재시도 모드로 실행하는 사용자 환경에서 관련된다고 봅니다 [가설 — 사용자 환경의 환경 변수 설정은 미관측].
- CHANGELOG 원문: "Fixed Bash commands on a full disk failing with a raw `ENOSPC` file path: the error now says the disk is full and that nothing ran"
  (305) 디스크가 가득 찬 상태의 Bash 명령이 원시 `ENOSPC` 파일 경로로 실패하던 문제가 수정되어, 이제 디스크가 가득 찼고 아무것도 실행되지 않았다고 알립니다. R020 「Failure/Interrupt Report ≠ Actual Failure」(제목 `.claude/rules/MUST-completion-verification.md:524`)는 도구의 실패·중단 보고도 ground-truth로 확인하도록 요구합니다. 원문에 따르면 이 오류에서는 명령이 실행되지 않았으므로, 이 메시지를 받은 경우 그 명령의 부분 산출물보다 디스크 여유 공간을 먼저 확인합니다. 실행 도중 디스크가 차서 끊긴 명령은 별개 경우이며, 2.1.309 CHANGELOG의 "a Bash command cut off by a full disk now says so and names the folder to free up" 문장이 다룹니다. 그 경우에는 명령이 부분 실행되었으므로 부분 산출물이 확인 대상입니다.

기타 28건 — 이 저장소 비해당으로 판단한 항목입니다: Linux `sandbox.allowNestedUserNamespaces`, cloud session·SDK `setMcpServers`의 MCP 서버 교체, 예약된 Cowork cloud 세션의 WebFetch 승인 대기, Remote Control `/resume` 항목·spawn-mode 안내, `/usage`·스크린 리더·`/artifacts` 같은 터미널 UI, mod `Image`·docked pane, managed `allowedMcpServers`의 `managed-mcp.json` 필터, Claude Desktop이 경로로 마운트한 플러그인의 `allowManagedPermissionRulesOnly` 처리, Self-hosted runner·VSCode·Cloud sessions·Claude Tag·Code Review 항목. 기능어 표본 검색(`git grep -n -i -o -E 'allowNestedUserNamespaces|setMcpServers|allowedMcpServers|deniedMcpServers|managed-mcp|allowManagedPermissionRulesOnly|spinnerVerbs|axScreenReader|screen reader|iTerm|docked pane|Cowork|remote.control|/usage|/artifacts|self-hosted|alwaysLoad' -- .claude CLAUDE.md .github package.json`)의 히트 파일은 `.claude/rules/` 아래 9개와 `CLAUDE.md` 하나이며, `CLAUDE.md:245`의 히트는 cc-token-saver `/usage-view`의 부분 문자열 일치입니다. 룰 파일 9개의 히트는 문맥별로 판정하지 않았고, 기능어가 없는 표시 항목도 검색으로 판정하지 않았습니다 [가설 — 항목별 저장소 측정은 위 본문 항목에 한해 실행했습니다]. 실측: `gh release view v2.1.305 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 38건 중 위 본문 10건을 다뤘으므로 38 − 10 = 28건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 관측한 범위에서 행동 변화를 위해 룰·CLAUDE.md·에이전트·훅을 바꿔야 한다고 확정한 항목은 없습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때만 1줄). 위 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.306 (2026-10-21)

> Issue: #1867 — Claude Code v2.1.306 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 이 절의 `awk` 명령이 읽는 `CHANGELOG.md`는 저장소 루트의 같은 이름 파일이 아니라 `gh api -H 'Accept: application/vnd.github.raw' repos/anthropics/claude-code/contents/CHANGELOG.md > CHANGELOG.md`로 받은 Claude Code CHANGELOG입니다. 이 절의 상한 루프는 빈 파일이나 저장소 루트 `CHANGELOG.md`(커밋 82a7e4c6의 파일)로 실행해도 0 여덟 줄을 출력하므로(2026-10-25 측정), 받은 파일의 크기(`wc -c CHANGELOG.md`)와 대상 절 머리(`grep -c -E '^## 2\.1\.(307|308|309|310)$' CHANGELOG.md` = 4, 위 두 파일에서는 0)를 먼저 확인합니다. 2.1.307·2.1.308·2.1.309·2.1.310 CHANGELOG 절을 각각 잘라 `2.1.306` 문자열과 "Revert"를 검색한 결과 네 절 모두 두 문자열이 0건이었으므로(`for v in 2.1.307 2.1.308 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -F -e 2.1.306; awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -i revert; done` 출력 0 여덟 줄), 이 릴리즈의 두 항목을 되돌리거나 좁히는 문장은 관측되지 않았습니다. 같은 compaction 영역의 후속 항목은 `for v in 2.1.307 2.1.308 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -n -i compact; done` 검색에서 여섯 줄이 걸렸습니다(절 머리 줄을 1행으로 센 번호): 307:11("Autocompact is thrashing" 오류 일부, PDF 페이지·이미지·큰 도구 결과를 많이 읽는 턴), 307:12(cloud 세션 재시작 뒤 `/autocompact` 창), 309:14(매우 큰 중첩 CLAUDE.md 아래 파일을 읽은 뒤 반복 compaction), 309:38(compaction이 일어난 턴의 남은 artifact 업데이트마다 권한을 묻던 결함), 310:11(비대화형 세션(`-p`, Agent SDK)에서 트랜스크립트 파일이 매우 클 때 compaction 중 메모리 사용), 그리고 310:6 "Fixed compaction after a "Prompt is too long" error keeping too much of a conversation with dense text, such as base64 or SVG, so the next request could fail again"입니다. 여섯 줄 모두 롤백이 아니며 아래 MCP 세션 오류 보고 항목과 조건이 다른 별개 수정·개선입니다(310:11만 "Improved", 나머지 다섯 줄은 "Fixed"). 릴리즈 게시 시각은 2026-10-21T03:16:31Z입니다(`gh release view v2.1.306 -R anthropics/claude-code --json publishedAt`).

### MCP · compaction 오류 보고

- CHANGELOG 원문: "Fixed an API error being replaced by "prompt is too long", and an unneeded compaction, in sessions with many MCP tools"
  (306) MCP 도구가 많은 세션에서 API 오류가 "prompt is too long"으로 바뀌어 보고되던 결함과 불필요한 compaction이 일어나던 결함이 함께 수정되었습니다. 원문의 인과 방향은 실제 API 오류가 "prompt is too long"으로 대체된 것이므로, 306 이전 MCP 도구가 많은 세션에서 본 "prompt is too long" 보고는 컨텍스트 초과의 증거가 아니었을 수 있고, 같은 조건의 세션에서 일어난 compaction도 필요해서 일어난 것이 아니었을 수 있습니다. R013은 다른 조건의 "Prompt is too long" 결함 수정을 기록하고 있습니다. (269) 노트는 auto-compaction이 요약할 완전한 이전 대화 교환이 없을 때(주로 매우 큰 프롬프트를 쓰는 SDK 세션)의 경우이고(`.claude/rules/SHOULD-ecomode.md:99`, 보이는 텍스트), (274) 노트는 훅 주도 세션(활성 `/goal` 등)에서 컨텍스트가 다시 넘칠 때의 경우입니다(`.claude/rules/SHOULD-ecomode.md:101`, 보이는 텍스트). 이 저장소의 `.mcp.json`은 서버 2개(`ontology-rag` stdio, `eraser` http)를 정의합니다(`git show HEAD:.mcp.json`). user 범위 설정이나 claude.ai 커넥터가 더하는 MCP 도구는 저장소 사실이 아니므로 세지 않았고, 원문이 "many"의 기준 수치를 밝히지 않으므로 이 저장소를 쓰는 세션이 결함 조건에 해당했는지는 [가설 — 306 이전 트랜스크립트에서 MCP 도구가 많은 세션의 "prompt is too long" 사례와 실제 컨텍스트 크기를 대조하면 판정 가능]입니다. 이 재해석은 실패·중단 보고도 ground-truth를 확인하기 전에는 실패로 단정하지 않는다는 R020 「Failure/Interrupt Report ≠ Actual Failure」 본문(`.claude/rules/MUST-completion-verification.md:526`, 보이는 텍스트)과 같은 계열의 진단 함의입니다. R013 임계값은 창 대비 백분율이므로(`.claude/rules/SHOULD-ecomode.md:91`) 이 수정으로 바뀌지 않습니다.

### 중첩 `claude -p` 실행

- CHANGELOG 원문: "Fixed `claude -p` inside cloud sessions reporting "Not logged in" when started without the session's environment variables"
  (306) cloud 세션 안에서 세션의 환경 변수 없이 시작된 `claude -p`가 "Not logged in"을 보고하던 결함이 수정되었습니다. 이 저장소 코드에서 `claude -p` 호출은 같은 줄 검색 `git grep -n -P '(\bclaude\b|CLAUDE[A-Z_]*BIN)[^\n]*?\s-p(\s|$|")' HEAD -- '*.sh' '*.bash' '*.ts' '*.js' '*.mjs' '*.cjs' '*.py' '*.yml' '*.yaml' '.husky/*'`와 줄 이음 검색 `git grep -n -P -A1 '(\bclaude\b|CLAUDE[A-Z_]*BIN)[^\n]*\\\s*$' HEAD -- '*.sh' '*.bash' '*.ts' '*.js' '*.mjs' '*.cjs' '*.py' '*.yml' '*.yaml' '.husky/*'`로 관측한 범위에서 네 계열(미러·테스트를 뺀 파일 5개)에 나타납니다. 첫째, 훅 `.claude/hooks/scripts/playwright-compress.sh:54`가 `claude -p --model haiku`로 브라우저 MCP 출력을 요약하며, 이 훅은 `.claude/settings.json:579`에 `mcp__playwright__.*|mcp__claude-in-chrome__.*` matcher(`:582`)로 배선되어 있습니다. 둘째, Web UI 서버 `packages/serve/src/lib/server/claude-cli.ts:40`, `:86`, `:117`, `:174`가 `` `claude -p ${escapeShellArg(prompt)} --no-input` `` 명령 문자열을 조립합니다. 셋째, `agora` 스킬의 `.claude/skills/agora/scripts/reviewers.sh:168`~`:169`와 `.claude/skills/agora/scripts/judge.sh:223`~`:224`가 변수 바이너리 `"$AGORA_CLAUDE_BIN"` 뒤의 이음 줄에서 `-p`를 넘깁니다. 넷째, `infra/hada-scout/scout-runner.sh:109`가 `timeout "${SCOUT_TIMEOUT}" claude -p`를 실행합니다. 같은 줄 검색의 나머지 히트는 `templates/` 아래 미러(`playwright-compress.sh:54`)와 테스트 주석(`tests/unit/core/hooks-scripts.test.ts:2863`)이고, 이음 줄 검색의 나머지 히트는 `templates/` 아래 `agora` 미러(같은 줄 번호)와 다음 줄이 `-p`가 아닌 줄(`.claude/hooks/scripts/adaptive-harness-scan.sh:12`와 그 미러, `.github/workflows/ci.yml:336`~`:337`, `tests/unit/skills/agora-scripts.test.ts:373`의 주석)입니다. 이 검색은 코드 확장자 파일에서 같은 줄과 바로 다음 이음 줄의 형태만 잡으므로 다른 변수명·배열 인자 형태의 호출은 놓칠 수 있으며, 배열 인자 형태 검색(`git grep -n -P "['\"]claude['\"]\s*,\s*\[|['\"]-p['\"]" HEAD -- '*.ts' '*.js' '*.mjs' '*.py' ':!**/*.test.ts'`)은 0건이었습니다. `agora`의 두 스크립트는 각자의 `run_sanitized`로 `AGORA_` 접두 환경 변수만 제거해 자식 프로세스를 띄우며(`.claude/skills/agora/scripts/reviewers.sh:49`~`:53`, `:151`; `.claude/skills/agora/scripts/judge.sh:52`~`:56`, `:177`), `AGORA_CLAUDE_BIN`의 기본값은 `claude`입니다(`reviewers.sh:15`, `judge.sh:20`). `playwright-compress.sh`는 출력이 3000자 이상일 때만 요약을 시도하고(`:44`~`:48`), `claude -p`가 0이 아닌 코드로 끝나면 원본 입력을 그대로 돌려줍니다(`:54`~`:58`). 다만 "Not logged in" 상태의 `claude -p`가 0으로 끝난다면 결과는 두 갈래로 나뉩니다. 그 문구를 stdout에 낸다면 그 문구가 요약이 되고, stdout이 비었다면(stderr 출력은 `:54`의 `2>/dev/null`이 버림) 빈 문자열이 요약이 됩니다. 원본에 `:51`의 패턴 `ref="[^"]*"`(큰따옴표로 감싼 `ref=` 값)과 일치하는 값이 있었다면, 두 갈래 모두 요약에 없는 그 값들이 `:61`~`:74`에서 `[Preserved refs]` 줄로 덧붙습니다. 어느 갈래든 최종 요약이 `:80`~`:81`에서 훅 출력의 `tool_response`·`updatedMCPToolOutput` 값이 됩니다 [가설 — 로그아웃 상태 `claude -p`의 exit code와 stdout으로 판정]. 그 값이 실제 MCP 도구 결과를 대체하는지는 v2.1.296 절이 실측하지 않았다고 기록한 최상위 `updatedMCPToolOutput` 키의 적용 여부에도 달려 있습니다 [가설 — v2.1.296 절과 같이 훅 적용 전후 MCP 도구 결과를 비교하면 판정]. 이 저장소를 cloud 세션에서 실행하는지, 위 자식 프로세스들이 "세션의 환경 변수 없이 시작된" 조건에 해당하는지는 관측하지 않았습니다 [가설 — cloud 세션에서 브라우저 MCP 도구를 호출한 뒤 훅이 요약을 돌려주는지 원본을 돌려주는지 306 전후로 비교하면 판정 가능].

기타 0건 — 이 저장소 비해당 항목은 없습니다. 실측: `gh release view v2.1.306 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 2건 중 위 본문 2건을 다뤘으므로 2 − 2 = 0건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 관측한 범위에서 훅·설정 변경이 필요하다고 확정한 항목은 없습니다. 첫 항목은 진단 해석에 관한 것입니다. 둘째 항목의 `playwright-compress.sh`는 `claude -p`가 0이 아닌 코드로 끝나는 경우 원본을 반환하도록 작성되어 있으나(`.claude/hooks/scripts/playwright-compress.sh:54`~`:58`), 로그아웃 상태에서 0으로 끝나는 경우의 동작(문구가 stdout에 나오는 갈래와 stdout이 비는 갈래)과 그 결과가 실제 MCP 도구 결과를 대체하는지는 위 [가설]입니다.
- 306 이전 버전에서 MCP 도구가 많은 세션의 "prompt is too long" 보고나 compaction을 진단할 때는 컨텍스트 초과로 단정하기 전에 실제 컨텍스트 크기와 원래 API 오류를 먼저 확인합니다. 룰 변경 제안은 없습니다(R016: CC 지식은 이 가이드에 둡니다).
- (306) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.307 (2026-10-21)

> Issue: #1870 — Claude Code v2.1.307 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 이 절의 `awk` 명령이 읽는 `CHANGELOG.md`는 저장소 루트의 같은 이름 파일이 아니라 `gh api -H 'Accept: application/vnd.github.raw' repos/anthropics/claude-code/contents/CHANGELOG.md > CHANGELOG.md`로 받은 Claude Code CHANGELOG이며, 빈 파일이나 저장소 루트 `CHANGELOG.md`(커밋 82a7e4c6의 파일)로도 상한 루프가 0만 출력하므로(2026-10-25 측정) 대상 절 머리(`grep -c -E '^## 2\.1\.(308|309|310)$' CHANGELOG.md` = 3)를 먼저 확인합니다. 2.1.308·2.1.309·2.1.310 CHANGELOG 절을 각각 잘라 `2.1.307` 문자열과 "Revert"를 검색한 결과 세 절 모두 두 문자열이 0건이었으므로(`for v in 2.1.308 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -F -e 2.1.307; awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -i revert; done` 출력 0 여섯 줄), 이 릴리즈 항목을 되돌리거나 좁히는 문장은 관측되지 않았습니다. 아래 본문 항목의 핵심어 일부로 309·310 절을 검색하면(`for v in 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -n -i -E 'keychain|sleep|idempotent|thrash|compact|safety_event|\[1m\]|recently[- ]denied|unparseable|axScreenReader'; done`) 309 절 14·38행과 310 절 3·6·11행이 걸립니다(절 머리 줄을 1행으로 센 번호). 310:3은 Monitor 도구 항목으로 "sleep" 단어가 일치했을 뿐 MCP 연결 중 절전과는 무관합니다. compaction 히트 가운데 309:14(매우 큰 중첩 CLAUDE.md 아래 파일을 읽은 뒤 세션이 반복 compaction하던 결함, 크기 한도를 넘는 중첩 CLAUDE.md는 이제 앞부분만 로드)가 아래 "Autocompact is thrashing" 항목과 가장 가까운 후속 항목이지만, 원인 조건이 다른 별개 수정이며 307 항목을 되돌리거나 좁히지 않습니다. 309:38(compaction이 일어난 턴의 남은 artifact 업데이트마다 권한을 묻던 결함), 310:6(base64·SVG 같은 밀도 높은 텍스트가 있는 대화에서 "Prompt is too long" 오류 뒤의 compaction, 이 가이드 v2.1.306 절의 범위 확인 문단이 원문을 인용)도 별개 수정이고, 310:11(비대화형 세션(`-p`, Agent SDK)에서 트랜스크립트 파일이 매우 클 때 compaction 중 메모리 사용)은 별개 개선("Improved")입니다. 위 핵심어 검색의 정규식은 본문 항목의 핵심어를 모두 담지 않습니다. 빠진 핵심어(fork, stop reason, background, `CLAUDE_AX_SCREEN_READER`)로 같은 두 절을 검색한 `for v in 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -n -i -E 'fork|stop reason|background|AX_SCREEN_READER'; done`은 309 절 42·52행과 310 절 5·25행을 돌려주며, 각각 세션보다 오래 산 백그라운드 명령에서 Linux 샌드박스 write deny가 풀리던 결함, 번들 dataviz 스킬의 `apca(text, background)` 함수, `cleanupPeriodDays`가 매우 클 때의 백그라운드 정리, Claude Tag 번들 목록의 백그라운드 새로 고침이라 307 항목을 되돌리거나 좁히지 않습니다. MCP 인접 항목은 `for v in 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -n -E 'MCP'; done`에서 309 절 5·6행과 310 절 14행이 걸립니다. 309:5(`--mcp-config`로 넘긴 MCP 설정 파일을 샌드박스 명령·자동 승인 편집이 고칠 수 있던 결함), 309:6(print·SDK 세션에서 비활성화된 MCP 서버가 나중의 권한 프롬프트로 다시 연결되던 결함), 310:14(비대화형 세션에서 서버의 elicitation에 답이 없는 채로 타임아웃된 MCP 도구 호출의 오류 문구 변경)는 307 본문의 MCP 항목(키체인 잠금, 연결 중 절전, HTTP 호출 이중 전송)과 대상이 다른 별개 항목입니다. 두 보조 검색도 핵심어 표본이므로 다른 표현으로 쓰인 후속 항목은 놓칠 수 있습니다. 릴리즈 게시 시각은 2026-10-21T22:17:02Z입니다(`gh release view v2.1.307 -R anthropics/claude-code --json publishedAt`).

### 모델 · 컨텍스트 · compaction

- CHANGELOG 원문: "Fixed requests failing with a model-not-found error when `CLAUDE_CODE_DISABLE_1M_CONTEXT` is set and the model is an alias with the `[1m]` suffix, such as `opus[1m]`"
  (307) `CLAUDE_CODE_DISABLE_1M_CONTEXT`가 설정된 상태에서 모델이 `opus[1m]`처럼 `[1m]` 접미사가 붙은 별칭이면 요청이 model-not-found 오류로 실패하던 결함이 수정되었습니다. R013은 이 환경 변수가 native 1M 창 모델을 auto-compaction으로 200K에 유지한다고 기록하고(`.claude/rules/SHOULD-ecomode.md:91`, 보이는 텍스트), R006은 `[1m]` 접미사를 1M 창 활성화 표기로 설명합니다(`.claude/rules/MUST-agent-design.md:62`, 보이는 텍스트). 저장소가 추적하는 파일 범위에서 에이전트 frontmatter의 `model:` 값은 `claude-sonnet-5-5` 42개, `claude-opus-5-5` 5개, `haiku` 3개이고(`git grep -h -E '^model:' HEAD -- '.claude/agents/*.md' | sort | uniq -c`), `[1m]` 표기는 `.claude/agents`·`.claude/settings.json`·`templates/.claude/settings.json`에서 0건이며(`git grep -n -F '[1m]' HEAD -- .claude/agents .claude/settings.json templates/.claude/settings.json` 출력 없음), `CLAUDE_CODE_DISABLE_1M_CONTEXT`는 tracked 설정 두 파일에 없습니다(`git grep -c CLAUDE_CODE_DISABLE_1M_CONTEXT HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1). 검색을 코드·설정 확장자 일부로 넓힌 `git grep -n -F -e '[1m]' -e 'CLAUDE_CODE_DISABLE_1M_CONTEXT' HEAD -- '*.sh' '*.bash' '*.ts' '*.js' '*.mjs' '*.py' '*.yml' '*.yaml' '*.json' '.husky/*'`에서도 환경 변수는 0건이고, `[1m]` 히트는 주석(`.claude/hooks/scripts/audit-log.sh:29`와 그 미러)과 테스트 파일의 줄(`tests/unit/core/hooks-scripts-shape.test.ts:274`의 입력 픽스처, `:280`의 단언, `tests/unit/core/template-validation.test.ts:108`의 JSDoc 주석, `:526`의 단언 입력 배열 항목)입니다. 이 pathspec 밖에도 `.toml`·`.jq`·`.rs`·`.svelte` 같은 추적 확장자가 있으나, `.md`만 뺀 `git grep -n -F -e '[1m]' -e 'CLAUDE_CODE_DISABLE_1M_CONTEXT' HEAD -- . ':!*.md'`도 같은 6줄을 돌려줍니다. 따라서 관측한 범위에서 저장소가 추적하는 설정만으로는 이 결함의 두 조건이 함께 만들어지지 않습니다. 다만 이 환경 변수와 모델 별칭은 셸 환경, user 범위 설정, gitignore된 `.claude/settings.local.json`(`git check-ignore -v --no-index .claude/settings.local.json` 결과 `.gitignore:40:.claude/*`)에서도 정해질 수 있으므로, 실제 해당 여부는 기기마다 다릅니다. 유지보수자 기기에서의 관측(2026-10-25, CC 2.1.310)으로는 셸 환경 변수가 설정되지 않았고(`[ -n "${CLAUDE_CODE_DISABLE_1M_CONTEXT+x}" ]` 거짓), user·local 설정 파일의 `CLAUDE_CODE_DISABLE_1M_CONTEXT`·`[1m]` 계수도 0이었습니다(`command grep -c -F -e CLAUDE_CODE_DISABLE_1M_CONTEXT ~/.claude/settings.json .claude/settings.local.json`, `command grep -c -F -e '[1m]' ~/.claude/settings.json .claude/settings.local.json`). R002가 기록한 이 저장소 실행 환경의 `claude-opus-5[1m]`(`.claude/rules/MUST-permissions.md:145`, 보이는 텍스트)은 `claude -p --output-format stream-json` init 이벤트의 `tools` 배열을 측정한 기록(`:143`, HTML 주석 안)에 실행 모델로 함께 적힌 값이며, 그 기록은 이 모델 ID를 어디서 읽었는지 밝히지 않습니다. 이 값은 `opus[1m]` 별칭을 골라 나온 값일 수도 있습니다. 그러나 그 측정 기록에는 `CLAUDE_CODE_DISABLE_1M_CONTEXT` 설정 여부가 적혀 있지 않으므로 이 결함 조건의 증거로 쓰지 않습니다. 수정 뒤 이 조합이 어떤 창 크기로 실행되는지는 원문이 밝히지 않습니다 [가설 — 환경 변수를 켜고 `opus[1m]`으로 시작한 세션의 `/context` 창 크기를 확인하면 판정 가능].
- CHANGELOG 원문: "Fixed some "Autocompact is thrashing" errors in turns that read many PDF pages, images or other large tool results"
  (307) PDF 페이지·이미지·그 밖의 큰 도구 결과를 많이 읽는 턴에서 나던 "Autocompact is thrashing" 오류 일부가 수정되었습니다. 원문이 "some"으로 범위를 한정하므로 이 조건의 턴에서도 이 오류가 모두 해소되었다고 보지 않습니다. 관측한 범위(`git grep -n -i thrashing HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 0건)에서 이 저장소의 룰·스킬·훅은 이 오류 문구를 참조하지 않습니다. R013 컨텍스트 예산 임계값은 창 대비 백분율이므로(`.claude/rules/SHOULD-ecomode.md:91`) 이 수정으로 바뀌지 않습니다.

### MCP

- CHANGELOG 원문: "Fixed MCP servers showing "needs authentication" in `claude -p` on macOS while the login keychain was locked; they now say why, and the next run after an unlock connects without a new sign-in"
  (307) macOS에서 로그인 키체인이 잠긴 동안 `claude -p`의 MCP 서버가 "needs authentication"으로 표시되던 결함이 수정되어, 이제 MCP 서버가 그 이유를 알려주고, 잠금 해제 뒤의 다음 실행은 새 로그인 없이 연결됩니다. `.mcp.json`의 `eraser`는 `url`과 `type: "http"`만 가진 원격 서버 정의이므로(`git show HEAD:.mcp.json`, `.mcp.json:14`~`:17`), 저장소 설정만으로는 이 서버가 키체인에 자격 증명을 두는 인증을 거치는지 알 수 없습니다. `/fsd` 스킬은 세션이 무인(`claude -p`, 예약 실행)이라 자기 페이싱이 필요할 때 `/goal`·`/loop`를 호출하는 경로를 권장하며(`.claude/skills/fsd/SKILL.md:172`), 저장소 코드가 `claude -p`를 직접 띄우는 예로는 `agora` 스킬의 `.claude/skills/agora/scripts/reviewers.sh:168`~`:169`(`"$AGORA_CLAUDE_BIN"` 뒤 이음 줄의 `-p`)가 있습니다. 이런 `claude -p` 실행이 macOS에서 로그인 키체인이 잠긴 동안 이뤄졌고 그때 MCP 서버가 "needs authentication"으로 보였다면, 원인 하나가 키체인 잠금이었을 수 있습니다 [가설 — 키체인이 잠긴 macOS에서 `claude -p`의 MCP 상태 메시지를 306과 307에서 비교하면 판정 가능]. 원문은 잠금 해제 뒤의 다음 실행이 연결된다고 적을 뿐 잠긴 동안 연결된다고 적지 않으므로, 무인 실행의 MCP 의존 단계는 계속 연결 상태를 실측합니다.
- CHANGELOG 원문: "Fixed MCP servers being reported as timed out, and staying failed in headless runs, when a macOS or Linux computer went to sleep while they were connecting"
  (307) MCP 서버가 연결되는 도중 macOS·Linux 컴퓨터가 절전에 들어가면 타임아웃으로 보고되던 결함과, 그때 headless 실행에서는 실패 상태로 남던 결함이 수정되었습니다. R004는 절전·연결 끊김·서버 오류로 mid-stream 절단된 서브에이전트 응답이 자동으로 이어진다는 (257) 노트를 두고 있으며(`.claude/rules/SHOULD-error-handling.md:30`, 보이는 텍스트), 이 수정은 같은 절전 계열이지만 대상이 MCP 연결 단계라는 점이 다릅니다. 307 이전 macOS·Linux에서 MCP 서버가 연결 중 "timed out"으로 보고되었다면 서버 장애가 아니라 연결 중 절전이 원인이었을 수 있고, 그 실행이 headless(`claude -p`)였다면 원문상 실패 상태가 그대로 남는 결과까지 이어졌을 수 있습니다 [가설 — 실패 시각과 시스템 절전 기록(`pmset -g log`)을 대조하면 판정 가능]. 원문이 전송 방식을 한정하지 않으므로 `.mcp.json`의 두 서버(stdio `ontology-rag`, http `eraser`, `git show HEAD:.mcp.json`) 중 어느 쪽이 해당하는지는 구분하지 않습니다.
- CHANGELOG 원문: "Fixed HTTP MCP tool calls being sent twice when the connection closed mid-call; only read-only or idempotent tools are now retried"
  (307) 호출 도중 연결이 닫히면 HTTP MCP 도구 호출이 두 번 전송되던 결함이 수정되어, 이제 읽기 전용이거나 멱등인 도구만 재시도됩니다. `.mcp.json`의 두 서버 중 HTTP 전송은 `eraser`(`.mcp.json:15`~`:16`)이고 `ontology-rag`는 stdio입니다(`.mcp.json:4`, `git show HEAD:.mcp.json`). 어떤 `eraser` 도구가 읽기 전용·멱등으로 분류되는지는 저장소 설정에서 알 수 없습니다. 307 이전에는 호출 도중 연결이 닫힌 경우 멱등이 아닌 도구 호출(예: 생성 계열)도 두 번 전송되어 중복 산출물을 남겼을 수 있습니다 [가설 — 중복 산출물 유무는 확인하지 않음]. 307 이후 멱등이 아닌 도구는 재시도되지 않으므로, 같은 상황에서 그 호출이 원격에 반영됐는지는 원격 상태를 확인한 뒤 재호출 여부를 정하는 것이 안전합니다 [가설 — 재시도하지 않는 경우의 오류 보고 형태는 원문이 밝히지 않음].

### 권한 · auto mode · 설정 범위

- CHANGELOG 원문: "Fixed `/permissions` > Recently denied not showing the denied shell command, and auto mode's local classifier ignoring an approval from there when it checks a retried command; approving a row now names the command, not its description"
  (307) `/permissions` > Recently denied에 거부된 셸 명령이 표시되지 않던 결함과, auto mode의 로컬 classifier가 재시도된 명령을 검사할 때 그 화면에서 한 승인을 무시하던 결함이 수정되었고, 이제 행을 승인하면 설명이 아니라 명령 자체가 지정됩니다. R015는 "allow 규칙으로는 safety-classifier 차단이 해소되지 않습니다"라고 적고 사용자 직접 실행(`!`)이나 차단 트리거 제거를 안내합니다(`.claude/rules/MUST-intent-transparency.md:138`, 보이는 텍스트). 307 이전에 auto mode에서 "Recently denied에서 승인했는데도 재시도가 다시 막혔다"는 관측이 있었다면 로컬 classifier가 재시도된 명령을 검사하며 그 승인을 무시한 결함이었을 수 있습니다. 원문은 로컬 classifier의 재시도 검사만 언급하므로, 이 화면 승인이 R015가 말하는 safety-classifier 차단까지 해소하는지는 [가설 — Recently denied에서 승인한 명령을 auto mode에서 재시도해 차단 여부를 확인하면 판정 가능]입니다. 관측한 범위(`git grep -n -i -E 'recently[- ]denied|recent denials' HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 8줄)에서 이 화면에 관한 기록은 룰 파일의 경우 모두 HTML 주석 안에 있습니다: R002의 ARCHIVED 주석 두 줄(`.claude/rules/MUST-permissions.md:65`, `:67`, 자동 주입되지 않음), R001의 HTML 주석(`.claude/rules/MUST-safety.md:200`에서 열리는 주석 안의 `:201`, 자동 주입되지 않음), 그리고 이 세 줄의 `templates/` 미러입니다. 나머지 2줄은 위키 사본(`wiki/rules/r002.md:75`, `:77`)입니다. 이 중 R002 `:65`는 v2.1.191부터 Recently-denied 탭이 승인한 거부 항목을 닫을 때 유지한다고 기록하며, 이번 수정은 그 탭에서 한 승인이 auto mode 로컬 classifier의 재시도 검사에서 무시되던 결함을 다룹니다. 저장소가 추적하는 project 설정의 `permissions.defaultMode`는 `bypassPermissions`입니다(`git show HEAD:.claude/settings.json | jq -r '.permissions.defaultMode // "unset"'`). R010은 2.1.257+에서 project 범위의 `bypassPermissions`가 무시되어 그 범위가 `default`로 귀결된다고 `claude -p` 실측으로 기록하고, 대화형 세션의 결과는 `[가설]`로 남깁니다(`.claude/rules/MUST-orchestrator-coordination.md:588`, 보이는 텍스트). 실효 모드는 저장소 밖의 user·managed 범위 설정과 실행 플래그에도 좌우되므로, auto mode에서만 해당하는 두 번째 결함이 이 저장소를 쓰는 세션에 해당하는지는 기기마다 다르며 여기서 단정하지 않습니다.
- CHANGELOG 원문: "Changed the `axScreenReader` setting and `CLAUDE_AX_SCREEN_READER` in a settings `env` block to apply only from user, managed or `--settings` settings (since 2.1.305)"
  (307) `axScreenReader` 설정과 settings `env` 블록의 `CLAUDE_AX_SCREEN_READER`가 user·managed·`--settings` 설정에서만 적용되도록 바뀌었으므로, project(`.claude/settings.json`)·local(`.claude/settings.local.json`) 범위에 적은 값은 적용 대상이 아닙니다. 이 설정은 2.1.208 CHANGELOG 절이 화면 낭독기 모드를 추가하면서 안내한 것이므로(`awk '/^## /{v=$2} /axScreenReader/{print v}' CHANGELOG.md` 결과 2.1.208과 2.1.307 두 절), 원문 괄호의 "(since 2.1.305)"는 도입 시점이 아니며 그 정확한 뜻은 원문만으로 확정하지 않습니다. 저장소가 추적하는 파일에서는 이 키가 쓰이지 않습니다(`git grep -n -i -E 'axScreenReader|AX_SCREEN_READER' HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 0건). gitignore된 `.claude/settings.local.json`과 user 범위 설정은 저장소 사실이 아니므로 이 결론의 근거에 넣지 않았습니다. project·local 범위 값이 무시되거나 그 범위로는 켤 수 없는 설정의 예로는 다음이 있으며, 이 항목이 같은 계열에 더해집니다. R010은 2.1.257+에서 project·local의 `defaultMode: "bypassPermissions"`가 무시되고 `"auto"`도 같은 CHANGELOG에 따라 무시된다고 적으며 `auto`는 미측정 `[가설]`로 둡니다(`.claude/rules/MUST-orchestrator-coordination.md:588`, 보이는 텍스트). `monitoring-setup` 스킬은 2.1.282부터 project·local 설정의 OpenTelemetry 변수 중 export를 켜거나 endpoint를 지정하거나 내용을 캡처하는 변수가 무시된다고 적습니다(`.claude/skills/monitoring-setup/SKILL.md:24`). 2.1.232 CHANGELOG는 `sandbox.ripgrep`을 user·managed·`--settings`에서만 적용하도록 바꿨고, R002는 이를 HTML 주석 안 버전 노트로 기록합니다(`.claude/rules/MUST-permissions.md:99`, `:85`에서 열리는 DETAIL 주석 안, 자동 주입되지 않음). 같은 주석 안의 (2.1.222) 노트는 Remote Control auto-start를 repo-local 설정으로는 켤 수 없고 끄는 것만 가능하다고 적습니다(`.claude/rules/MUST-permissions.md:93`, HTML 주석 안).

### 서브에이전트 · 도구 호출 · 백그라운드

- CHANGELOG 원문: "Improved fork subagents launched together: each is now told which launch is its own, so forks are much less likely to try to start each other's work"
  (307) 함께 실행된 fork 서브에이전트가 이제 각자 어느 실행이 자기 것인지 전달받으므로, 서로의 작업을 시작하려 할 가능성이 크게 줄었습니다. R010은 「Parallel Delegation — Sibling-Agent Disclosure」 절(제목 `.claude/rules/MUST-orchestrator-coordination.md:493`)의 표에서 병렬 스폰 프롬프트마다 동시 실행 에이전트 수·각자 담당 범위·"자기 담당 범위만 기준으로 보고" 지시를 명시하도록 요구합니다(`.claude/rules/MUST-orchestrator-coordination.md:517`, 보이는 텍스트). 원문의 개선은 함께 실행된 각 fork에게 자기 실행이 어느 것인지 알려주는 것이며 형제의 담당 범위나 보고 범위 지시를 대신한다고 적지 않으므로, R010의 고지 의무는 그대로 둡니다. v2.1.232+에서 `subagent_type: "fork"` 서브에이전트가 전체 대화와 prompt cache를 상속한다는 기록은 R009의 DETAIL 주석 안에 있습니다(`.claude/rules/MUST-parallel-execution.md:197`에서 열리는 `<!-- DETAIL: CC version notes (v2.1.224-v2.1.273) + Fable 5 note` 주석의 `:200`, 자동 주입되지 않음). 관측한 범위(`git grep -n -E 'subagent_type: *"?fork|"fork"' HEAD -- .claude/skills .claude/agents` 출력 없음)에서 스킬·에이전트 정의는 fork 서브에이전트를 지정하지 않으므로, 이 개선은 오케스트레이터가 Agent 도구에서 직접 fork 여러 개를 함께 실행하는 경우에 해당합니다.
- CHANGELOG 원문: "Improved recovery from unparseable tool calls: Claude Code now retries the call up to twice before ending the turn with an error"
  (307) 파싱할 수 없는 도구 호출에서의 복구가 개선되어, 이제 Claude Code가 턴을 오류로 끝내기 전에 그 호출을 최대 두 번 재시도합니다. R018은 멤버 프롬프트가 크거나 여러 도메인에 걸치면 "malformed-parsing truncation" 위험이 있다며 약 5000토큰·단일 도메인 상한을 둡니다(`.claude/rules/MUST-agent-teams.md:583`, 보이는 텍스트). 다만 R018 전체는 Detection이 No이면 휴면이고 R009/R010이 적용됩니다(`.claude/rules/MUST-agent-teams.md:36`, 보이는 텍스트). 이 가이드의 「Known Platform Issues & Workarounds」 절에 있는 「Agent tool malformed parsing on long / special-character prompts (#1241)」 항목은 Agent 도구가 매우 길거나 특수문자가 많은 위임 프롬프트를 간헐적으로 파싱하지 못해 도구 호출을 `malformed`로 보고하는 증상과 그 우회책을 적고 있습니다. R018과 그 #1241 항목이 말하는 실패가 원문의 "unparseable tool calls"와 같은 실패인지는 확인하지 않았습니다 [가설 — 상한을 넘는 위임에서 파싱 실패가 307 전후로 턴 종료로 이어지는 빈도를 비교하면 판정 가능]. 같은 실패라 해도 원문은 재시도 두 번 뒤에는 턴을 오류로 끝낸다고 적으므로 상한과 우회책의 필요성은 남습니다. 또한 307 이후에는 파싱 실패가 재시도로 가려질 수 있으므로, 위임 결과 판정은 계속 R020 ground-truth로 합니다.
- CHANGELOG 원문: "Fixed subagent transcripts recording placeholder token usage and an empty stop reason for streamed responses"
  (307) 스트리밍 응답에 대해 서브에이전트 트랜스크립트가 자리표시용 토큰 사용량과 빈 stop reason을 기록하던 결함이 수정되었습니다. 관측한 범위(`git grep -l -E 'transcript_path' HEAD -- .claude/hooks`)에서 트랜스크립트 경로를 다루는 훅 스크립트는 `r007-r008-drift-advisor.sh`, `session-env-check.sh`, `task-outcome-recorder.sh` 세 개이고, `git grep -n -E 'stop_reason|input_tokens|output_tokens|"usage"|\.usage' HEAD -- .claude/hooks .claude/statusline.sh`가 출력 없이 끝났으므로 관측한 범위에서 훅과 상태줄에 트랜스크립트의 토큰 사용량이나 stop reason을 파싱하는 코드는 나오지 않았습니다. 비용 경고 훅 `cost-cap-advisor.sh`는 트랜스크립트가 아니라 `/tmp/.claude-cost-${PPID}` 파일에서 비용을 읽습니다(`.claude/hooks/scripts/cost-cap-advisor.sh:10`, `:43`). `packages/eval-core/src/db/schema.ts:41`에 `input_tokens` 열이 있으나, `git grep -n -F -e inputTokens -e input_tokens HEAD -- packages/eval-core/src ':!**/*.test.ts'`가 돌려준 것은 스키마·마이그레이션 정의 4줄(`db/schema.ts:41`, `:62`, `db/migrate.ts:40`, `:56`)이고 `git grep -n -P '\.usage\b|usage\?\.|message\.usage' HEAD -- packages/eval-core/src`는 0건(rc=1)이어서, 그 값을 서브에이전트 트랜스크립트에서 채우는 경로는 이 이름들로는 찾지 못했습니다 [가설 — eval-core의 세션 수집 경로를 읽으면 판정 가능]. 307 이전 서브에이전트 트랜스크립트로 토큰을 사후 집계했다면 스트리밍 응답분은 자리표시 값이었을 수 있으므로, 그런 과거 집계는 근거로 쓰지 않습니다.
- CHANGELOG 원문: "Fixed a background command stopped through a connected app (such as the desktop app archiving an idle session) being reported to Claude as stopped by the user; the notice now names its output file"
  (307) 연결된 앱(예: 유휴 세션을 보관하는 데스크톱 앱)을 통해 중지된 백그라운드 명령이 Claude에게 사용자가 중지한 것으로 보고되던 결함이 수정되어, 이제 알림이 그 명령의 출력 파일을 지정합니다. R020 「Failure/Interrupt Report ≠ Actual Failure」 본문은 실패·중단 보고도 ground-truth를 확인하기 전에는 실패로 단정하지 않는다고 규정하며(`.claude/rules/MUST-completion-verification.md:526`, 보이는 텍스트), 이 결함은 중단의 주체가 잘못 보고되던 사례입니다. 307 이전에 "사용자가 중지함"으로 보고된 백그라운드 명령은 연결된 앱을 통해 중지된 경우라면 사용자 조치가 아니었으므로 사용자 의도의 근거로 쓰지 않습니다 [가설 — 이 저장소 사용자가 데스크톱 앱 등 연결된 앱으로 세션을 다루는지는 관측하지 않음]. 이제 알림이 출력 파일을 지정하므로, 중지된 명령이 어디까지 진행했는지는 그 파일을 읽어 확인하는 것이 R020의 ground-truth 원칙에 맞습니다.

### 텔레메트리

- CHANGELOG 원문: "Added the `claude_code.safety_event` OpenTelemetry event for each tool call a permission rule, auto mode, a safety check, a hook or the sandbox stopped, prompted or sent back"
  (307) 권한 규칙·auto mode·안전 검사·훅·샌드박스가 도구 호출을 멈추거나, 확인을 요청하거나, 되돌려 보낼 때마다 발생하는 `claude_code.safety_event` OpenTelemetry 이벤트가 추가되었습니다. 이 저장소의 `monitoring-setup` 스킬은 2.1.307이 속하는 「2.1.282 이상」 갈래(`.claude/skills/monitoring-setup/SKILL.md:58`)에서 `CLAUDE_CODE_ENABLE_TELEMETRY`·`OTEL_METRICS_EXPORTER`·`OTEL_LOGS_EXPORTER`를 console로 켜는 env 블록(`:66`~`:68`)을 user-scope 설정이나 셸 export로 배치하도록 안내합니다(`:73`~`:74`). 원문은 이 이벤트가 어느 exporter로 나가는지 밝히지 않으므로, 그 절차로 켠 console 출력에 이 이벤트가 나타나는지는 [가설 — 텔레메트리를 켠 세션에서 훅 차단 1건을 일으켜 console 출력에 `claude_code.safety_event`가 찍히는지 확인하면 판정 가능]입니다. R021 표는 Hard Block 훅으로 stage-blocker, dev-server tmux, rule-deletion-guard를 듭니다(`.claude/rules/MUST-enforcement-policy.md:19`, 보이는 텍스트). 이 중 `exit 2`로 끝나는 차단 경로가 코드에서 확인되는 것은 `.claude/hooks/scripts/stage-blocker.sh:13`과 `.claude/hooks/scripts/rule-deletion-guard.sh`(`:32`, `:46`, `:56`, `:881`)이며(`git show HEAD:.claude/hooks/scripts/stage-blocker.sh | grep -n 'exit 2'`, `git show HEAD:.claude/hooks/scripts/rule-deletion-guard.sh | grep -n 'exit 2'`), 이 이벤트는 이 두 훅이 도구 호출을 멈춘 경우를 세는 결정론적 소스 후보입니다. dev-server tmux 훅은 `.claude/settings.json:52`의 인라인 명령이 `exit 1`로 끝나므로(`git show HEAD:.claude/settings.json | awk 'NR==52' | grep -o -E 'exit [0-9]+'` = `exit 1`) 실제로 도구 호출을 멈추는지가 열린 이슈 #1856에서 아직 실측되지 않았고, 이 이벤트가 그 훅에 대해 기록되는지도 [가설 — #1856의 런타임 차단 실측과 함께 판정]입니다. R010 「Subagent Scope-Creep STOP Protocol」의 2회 trip 계수(`.claude/rules/MUST-orchestrator-coordination.md:262`, 보이는 텍스트)에도 쓸 수 있을지는, 이 이벤트가 서브에이전트의 classifier trip을 다른 차단과 구분해 기록하는지 원문이 밝히지 않으므로 [가설 — 이벤트 속성에 차단 주체와 에이전트 식별자가 있는지 확인하면 판정 가능]입니다. R021 표의 `failure-ledger.sh`(`.claude/rules/MUST-enforcement-policy.md:24`, 보이는 텍스트)는 PostToolUseFailure 훅으로 도구 실패를 원장에 남기는 별도 장치이며, 관측한 범위(`git grep -n safety_event HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'` 0건)에서 이 저장소는 아직 이 이벤트를 참조하지 않습니다.

기타 31건 — 이 저장소 비해당으로 판단한 항목입니다: Claude API 코드를 API 버전 `2026-10-21`로 옮기는 옵트인 명령 `/claude-api api-version`, 맞춤 `ANTHROPIC_BASE_URL` 게이트웨이 뒤와 Foundry에서의 `prompt-caching-scope` 헤더(저장소가 추적하는 `.claude/settings.json`·`templates/.claude/settings.json`에 `ANTHROPIC_BASE_URL` 0건, `git grep -c ANTHROPIC_BASE_URL HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1), Agent SDK 전용 항목(백그라운드 작업이 도는 동안 턴이 때때로 SDK MCP 서버의 최신 도구 없이 시작되던 결함, API 확인이 5초를 넘을 때의 `setModel()` 대기), cloud sessions·self-hosted runner 전용 항목(재시작 뒤 `/autocompact` 창 유지, 재시작 시 `/clear`한 대화가 때때로 되살아나던 결함, 웹 검색 403 사유 표시, 데스크톱 앱 MCP 연결 실패 시의 첫 응답 지연, checkout 훅·인증서·git proxy 등), Claude apps gateway 전용 항목(`CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS`, Desktop 텔레메트리), 앱·도구 연동 세부(Cowork cloud 세션의 WebFetch, 데스크톱 앱 Code 탭의 GitHub MCP 양식, Artifact 도구 읽기의 연결 재사용), CLI 브라우저 로그인 성공 페이지가 뜨는 시점, 큰 붙여넣기 이미지·PDF 읽기가 든 세션의 Remote Control 연결 시간, `/help`·`/` 메뉴의 번들 스킬 설명 표시, WebSearch 예산 소진 안내 문구, VSCode·Cloud sessions·Code Review 전용 항목. 기능어 표본 검색(`git grep -l -i -E 'api-version|prompt-caching-scope|setModel|createSdkMcpServer|CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS|OTEL_EXPORTER_OTLP_HEADERS|Cowork|remote.control|checkout-hook|use-anthropic-git-proxy|self-hosted|WebSearch budget' HEAD -- .claude CLAUDE.md .github package.json`)의 히트 파일은 `.claude/rules/` 아래 8개와 `.github/scripts/send-report.ts` 하나이며, 후자의 히트는 GitHub REST 요청 헤더 `X-GitHub-Api-Version`(`:44`)의 부분 문자열 일치입니다. 룰 파일 8개의 히트는 문맥별로 판정하지 않았고, 기능어가 없는 표시·성능 항목도 검색으로 판정하지 않았습니다. 항목별 저장소 측정은 위 본문 항목에 한해 실행했으므로, 이 31건의 비해당 분류는 [가설 — 룰 파일 8개 히트의 문맥과 기능어 없는 항목의 관련 경로를 항목별로 읽으면 판정 가능]입니다. 실측: `gh release view v2.1.307 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 43건 중 위 본문 12건을 다뤘으므로 43 − 12 = 31건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 관측한 범위에서 저장소가 추적하는 훅·설정·에이전트를 바꿔야 한다고 확정한 항목은 없습니다. 근거는 위 각 항목의 HEAD 측정입니다(`[1m]`·`CLAUDE_CODE_DISABLE_1M_CONTEXT`·`axScreenReader`가 tracked 설정에 없음, 트랜스크립트의 토큰 값을 파싱하는 훅이 위 `git grep`에서 나오지 않음). dev-server tmux 훅의 차단 여부는 이 릴리즈와 별개로 열린 이슈 #1856에서 다룹니다. 룰 문안 변경 가능성은 이 문서에서 판정하지 않습니다.
- 후보: 이 가이드 「Known Platform Issues & Workarounds」의 #1241 항목에 307의 도구 호출 재시도 개선을 본문 참고 문장으로 덧붙일지는, 위 unparseable 항목의 [가설]이 판정된 뒤 결정합니다.
- 307 이전 버전의 다음 관측은 각 조건에서 결함 산물이었을 수 있으므로 원인 진단의 결론으로 쓰지 않습니다: `CLAUDE_CODE_DISABLE_1M_CONTEXT` 설정과 `[1m]` 별칭 모델이 겹친 경우의 model-not-found, PDF 페이지·이미지·큰 도구 결과를 많이 읽는 턴의 "Autocompact is thrashing"(일부), macOS의 `claude -p`에서 로그인 키체인이 잠긴 동안의 MCP "needs authentication", macOS·Linux에서 연결 중 절전이 끼었을 때의 MCP "timed out" 보고와 headless 실행의 실패 상태 지속, 호출 도중 연결이 닫힌 HTTP MCP 호출의 이중 전송, 거부된 셸 명령이 보이지 않던 Recently denied 화면과 auto mode 로컬 classifier가 재시도된 명령을 검사하며 그 화면의 승인을 무시한 재차단, 연결된 앱을 통해 중지된 백그라운드 명령의 "사용자가 중지함" 보고, 스트리밍 응답에 대한 서브에이전트 트랜스크립트의 자리표시 토큰 사용량과 빈 stop reason.
- 룰 문안 변경 제안은 이 문서에 두지 않습니다(R016: CC 지식은 이 가이드에 두고, 룰 파일에는 행동 변화가 필요할 때만 1줄). (307) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.308 (2026-10-22)

> Issue: #1869 — Claude Code v2.1.308 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 이 절의 `awk` 명령이 읽는 `CHANGELOG.md`는 저장소 루트의 같은 이름 파일이 아니라 `gh api -H 'Accept: application/vnd.github.raw' repos/anthropics/claude-code/contents/CHANGELOG.md > CHANGELOG.md`로 받은 Claude Code CHANGELOG이며, 빈 파일이나 저장소 루트 `CHANGELOG.md`(커밋 82a7e4c6의 파일)로도 상한 루프가 0만 출력하므로(2026-10-25 측정) 대상 절 머리(`grep -c -E '^## 2\.1\.(309|310)$' CHANGELOG.md` = 2)를 먼저 확인합니다. 2.1.309·2.1.310 CHANGELOG 절을 각각 잘라 `2.1.308` 문자열과 "Revert"를 검색한 결과 두 절 모두 두 문자열이 0건이었으므로(`for v in 2.1.309 2.1.310; do awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -F -e 2.1.308; awk -v v="$v" '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c -i revert; done` 출력 0 네 줄), 이 릴리즈를 되돌리거나 좁히는 문장은 관측되지 않았습니다. 릴리즈 게시 시각은 2026-10-22T04:34:55Z입니다(`gh release view v2.1.308 -R anthropics/claude-code --json publishedAt`).

### 일반 안정성 개선

- CHANGELOG 원문: "Bug fixes and reliability improvements"
  (308) 이 릴리즈의 노트는 대상 기능을 밝히지 않고 버그 수정과 신뢰성 개선을 한 줄로 묶어 적습니다(`awk -v v=2.1.308 '/^## /{p=($2==v)} p' CHANGELOG.md | grep -c '^- '` = 1). 원문이 대상을 특정하지 않으므로 이 저장소의 훅·서브에이전트·스킬·설정 중 어디에 영향이 있는지 판정할 근거가 원문에 없으며, 저장소 측 조치도 도출하지 않습니다. 2.1.307과 2.1.309 사이에서 관측한 동작 차이를 이 릴리즈로 귀속하려면 버전을 고정해 재현합니다 [가설 — 2.1.307과 2.1.308을 각각 고정 실행해 같은 입력의 결과가 다르면 308 귀속 가능].

기타 0건 — 이 저장소 비해당 항목은 없습니다. 실측: `gh release view v2.1.308 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 1건 중 위 본문 1건을 다뤘으므로 1 − 1 = 0건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 훅·설정·룰 변경 제안은 없습니다. 원문에 구체 항목이 없으므로 이 릴리즈를 근거로 한 진단 재해석도 하지 않습니다.

---

## v2.1.309 (2026-10-22)

> Issue: #1871 — Claude Code v2.1.309 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310). 상한 이후 릴리즈인 2.1.310(게시 2026-10-23T23:39:00Z, `gh release view v2.1.310 -R anthropics/claude-code --json publishedAt`)의 CHANGELOG 절을 잘라 "2.1.309"와 "Revert"를 검색했으며(`gh api -H "Accept: application/vnd.github.raw" repos/anthropics/claude-code/contents/CHANGELOG.md | awk -v v=2.1.310 '/^## /{p=($2==v)} p' | grep -c -F '2.1.309'`=0, 같은 파이프라인 끝을 대소문자 무시 `grep -c -i 'revert'`로 바꾼 결과=0), 이 릴리즈 항목을 되돌리거나 좁히는 문장은 관측되지 않았습니다. 릴리즈 게시 시각은 2026-10-22T22:18:57Z입니다(`gh release view v2.1.309 -R anthropics/claude-code --json publishedAt`).

### 권한 · Bash 권한 검사

- CHANGELOG 원문: "Fixed Bash permission checks not prompting for some compound commands that change directory before running git when the `cd` is wrapped or prefixed, as they do for a plain `cd`"
  (309) 디렉토리를 바꾼 뒤 git을 실행하는 일부 복합 명령에서 `cd`가 감싸이거나(wrapped) 접두어가 붙은(prefixed) 경우, 일반 `cd`일 때와 달리 Bash 권한 검사가 승인을 요청하지 않던 결함이 수정되었습니다. 이제 이런 명령도 일반 `cd`처럼 승인을 요청합니다. R005는 지속 `cd`를 남기지 말고 절대 경로나 서브셸 `( cd <dir> && … )`을 쓰라고 규정하므로(`.claude/rules/MAY-optimization.md:89`, 보이는 본문 줄) 그중 서브셸 형태가 원문의 "wrapped" `cd`에 해당할 수 있습니다 [가설 — 원문은 "wrapped"의 구체 형태를 밝히지 않으므로, 비-bypass 모드에서 `( cd templates && git status )`를 실행해 프롬프트가 뜨는지로 판정]. 같은 계열의 기록으로, R002 버전 노트(`.claude/rules/MUST-permissions.md:125`의 (d), HTML 주석 안)는 2.1.271에서 디렉토리 변경 2회, 서브셸, 또는 `cd`+`git` 체인을 가진 Bash 명령이 bypass·auto 모드의 `permissions.blockReadsOutsideWorkingDirectories`에서 프롬프트를 건너뛰던 결함이 수정되었다고 적습니다. 이 저장소의 두 settings에는 그 키가 없습니다(`git grep -n blockReadsOutsideWorkingDirectories HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1). 저장소의 project settings에는 `Bash(git:*)` allow 규칙이 있으나(`.claude/settings.json:8`) 이 규칙이 `cd` 뒤 git 검사의 프롬프트를 억제하는지는 측정하지 않았습니다. 저장소 자체 절차에도 괄호 서브셸 안에서 `cd` 뒤 git을 실행하는 Bash 호출이 있습니다. `pipeline` 스킬 auto-dev 워크플로의 path-precheck 블록(`.claude/skills/pipeline/workflows/auto-dev.yaml:342`)과 path-precheck-file 블록(`:357`)은 서브셸 안에서 `root=$(git rev-parse --show-toplevel) && cd "$root"` 뒤에 `git ls-files`를 실행합니다. 저장소의 project settings는 `defaultMode: "bypassPermissions"`이고 배포 미러 `templates/.claude/settings.json`에는 `defaultMode`가 없습니다(`git show HEAD:.claude/settings.json | jq -c '{defaultMode: .permissions.defaultMode}'` = `{"defaultMode":"bypassPermissions"}`, `git show HEAD:templates/.claude/settings.json | jq -c '{defaultMode: .permissions.defaultMode}'` = `{"defaultMode":null}`). R010 「Universal bypassPermissions」(제목 줄 `.claude/rules/MUST-orchestrator-coordination.md:579`, 본문 `:588`)는 2.1.257부터 project·local의 `bypassPermissions`가 무시되어, user 값이 `plan`·`auto`·`acceptEdits`처럼 bypass가 아닐 때 `claude -p`에서 `default`로 귀결된다고 기록합니다(#1828, CC 2.1.289 실측). 같은 줄의 원천 목록(managed·local·project·user 설정과 실행 플래그)과 우선순위에 따르면 이 귀결은 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않을 때의 것이며, managed 범위는 R010이 미측정 `[가설]`로 둡니다. 따라서 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않고 user 값이 bypass가 아닌 기기의 `claude -p` 무인 실행에서는 새 프롬프트가 나타날 수 있습니다 [가설 — 같은 본문 줄이 `default`가 실제로 프롬프트를 띄우는지와 TTY 세션을 미관측으로 남기므로, 해당 기기의 비-bypass 실행으로 판정]. `git -C templates status`처럼 디렉토리를 바꾸지 않는 형태는 원문의 대상 조건("change directory before running git")에 들지 않으며, R010 「사전 실측 리터럴」(본문 `.claude/rules/MUST-orchestrator-coordination.md:388`, 코드 블록 줄 `:391`)도 `cd` 없이 `git rev-parse`를 실행하는 형태입니다.
- CHANGELOG 원문: "Fixed the Bash permission check trusting a variable set by a command whose redirect can fail to open"
  (309) 리다이렉트 대상을 열지 못할 수 있는 명령이 설정한 변수를 Bash 권한 검사가 신뢰하던 결함이 수정되었습니다. 원문은 수정 뒤의 결과(승인 요청 여부)를 밝히지 않으므로, 이전에 자동 승인되던 일부 명령이 이제 승인을 요청하는지는 단정하지 않습니다 [가설 — 원문에 결과어가 없으므로 영향 방향은 미확정]. 저장소의 project allow 규칙은 `Bash(git:*)`·`Bash(sed:*)` 같은 접두 규칙이며(`.claude/settings.json:8`, `:16`), 이런 형태(리다이렉트가 붙은 변수 설정 뒤 그 변수를 쓰는 명령)를 지시하는 스킬이 있는지는 측정하지 않았습니다.
- CHANGELOG 원문: "Changed `sed -i` to get the standard Bash prompt and run as written, not a simulated file-edit preview; like other Bash edits, it is no longer restored by `/rewind`"
  (309) `sed -i`가 모의 파일 편집 미리보기 대신 표준 Bash 프롬프트를 받고 쓰인 그대로 실행되도록 바뀌었으며, 다른 Bash 편집처럼 `/rewind`로 복원되지 않습니다. 기본 동작 변경입니다. 저장소의 project settings에는 `Bash(sed:*)` allow 규칙이 있습니다(`.claude/settings.json:16`). 표준 Bash 프롬프트 경로에서는 이 접두 규칙이 `sed -i`에도 적용될 수 있습니다 [가설 — 비-bypass 모드에서 `sed -i` 실행 시 프롬프트 유무로 판정]. 관측한 범위에서 훅·스킬·에이전트·project settings에는 `sed -i` 명령이 없고(`git grep -n -P '\bsed\b[^|;&\n]*\s-i' HEAD -- .claude/hooks .claude/skills .claude/agents .claude/settings.json` rc=1; 이 정규식이 `sed -E -i`·`sed -i.bak` 형태도 잡는 것을 픽스처로 확인; 앞 정규식이 놓치는 `sed -Ei`·`sed --in-place`·`gsed -i`·`$SED -i`·`${SED} -i`까지 잡는 것을 픽스처로 확인한 `git grep -n -P '(\bg?sed\b|\$\{?SED\b)[^|;&\n]*(\s-[A-Za-z]*i|--in-place)' HEAD -- .claude/hooks .claude/skills .claude/agents .claude/settings.json`와, 줄 이음 뒤 다음 줄의 `-i`를 보는 `git grep -n -P -A1 '(\bg?sed\b|\$\{?SED\b)[^\n]*\\\s*$' HEAD -- .claude/hooks .claude/skills .claude/agents .claude/settings.json`도 rc=1) `/rewind`를 쓰는 절차도 없으므로(`git grep -n -F '/rewind' HEAD -- .claude/skills .claude/agents .claude/hooks` rc=1), 관측한 영향 조건은 Claude가 즉석에서 쓰는 `sed -i` 편집입니다. 그런 편집은 이제 `/rewind` 복원 대상이 아닙니다. 즉석 `sed` 편집으로 이어질 수 있는 스킬 경로로는 `dev-refactor` 스킬이 구조 변경 없는 이름 바꾸기에 IDE rename이나 `sed`를 대안으로 권하는 줄(`.claude/skills/dev-refactor/SKILL.md:17`, `:52`)이 있습니다. R005 버전 노트(`.claude/rules/MAY-optimization.md:108`, HTML 주석 안)와 R023 버전 노트(`.claude/rules/SHOULD-verification-ladder.md:351`, HTML 주석 안)는 2.1.269의 `bashEditDiffEnabled`(2.1.269 CHANGELOG: "Added a diff of the files a Bash command changed to the Bash tool result when the Bash tool handles file edits (setting `bashEditDiffEnabled`)")를 셸 편집의 사후 점검 수단으로 기록하며, R005 노트는 이로써 위임받은 에이전트의 `sed -i`가 감사 가능해진다고 적습니다. `sed -i`가 이제 모의 편집 미리보기가 아니라 다른 Bash 편집처럼 처리되므로 그 노트의 전제가 계속 성립하는지는 판정하지 않았습니다 [가설 — `bashEditDiffEnabled`를 켠 세션에서 `sed -i` 실행 결과에 diff가 붙는지로 판정]. 이 저장소의 두 settings에는 `bashEditDiffEnabled`가 없습니다(`git grep -n bashEditDiffEnabled HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1).

### MCP · headless

- CHANGELOG 원문: "Fixed a disabled MCP server being reconnected by a later permission prompt in print and SDK sessions"
  (309) print(`-p`)·SDK 세션에서 비활성화된 MCP 서버가 나중의 권한 프롬프트로 다시 연결되던 결함이 수정되었습니다. v2.1.296 절의 headless 항목(headless 세션이 디렉토리 변경이나 플러그인 재로드 뒤, 그 폴더에서 꺼 둔 `.mcp.json` 서버나 플러그인 MCP 서버를 시작하던 결함)과 같은 계열의 수정입니다. 이 저장소는 `.mcp.json`에 서버 2개(`ontology-rag` stdio, `eraser` http)를 두며(`git cat-file -p HEAD:.mcp.json | jq -c '.mcpServers | to_entries | map({name: .key, type: (.value.type // "stdio")})'`), 두 서버 항목의 키에는 비활성화 키가 없습니다(`git cat-file -p HEAD:.mcp.json | jq -c '.mcpServers | map_values(keys)'` = `{"ontology-rag":["args","command","env","type"],"eraser":["type","url"]}`). 저장소의 project settings는 `enableAllProjectMcpServers: true`, `enabledMcpjsonServers: ["ontology-rag"]`이고 `disabledMcpjsonServers`는 null이며(`git show HEAD:.claude/settings.json | jq -c '{enableAllProjectMcpServers, enabledMcpjsonServers, disabledMcpjsonServers}'`), 배포 미러에서는 세 키가 모두 null로 나옵니다(`git show HEAD:templates/.claude/settings.json | jq -c '{enableAllProjectMcpServers, enabledMcpjsonServers, disabledMcpjsonServers}'`). 따라서 저장소 설정 범위에서는 비활성화된 서버가 관측되지 않았습니다. 사용자가 기기별로 끈 서버의 상태(사용자 `~/.claude.json` 등)는 관측하지 않았습니다 [가설 — 사용자 scope에서 끈 서버가 있고, print(`-p`)·SDK 세션(예: `claude -p`로 실행한 `/fsd`)에서 나중에 권한 프롬프트가 뜬 경우에 해당].

### CLAUDE.md 로딩 · 컨텍스트

- CHANGELOG 원문: "Fixed sessions compacting repeatedly after reading files under a very large nested CLAUDE.md; a nested CLAUDE.md over the size limit now loads only its start"
  (309) 매우 큰 nested CLAUDE.md 아래의 파일을 읽은 뒤 세션이 반복해서 compact되던 결함이 수정되었으며, 크기 한도를 넘는 nested CLAUDE.md는 이제 앞부분만 로드됩니다. 이 저장소의 추적 CLAUDE.md는 2개로, 루트 `CLAUDE.md`(13,846바이트)와 nested `templates/CLAUDE.md`(13,817바이트)입니다(`git ls-files -- '*CLAUDE*.md' '*claude.md'`, `git cat-file -s HEAD:CLAUDE.md`, `git cat-file -s HEAD:templates/CLAUDE.md`). 원문은 크기 한도 값을 밝히지 않으므로 `templates/CLAUDE.md`가 한도를 넘어 앞부분만 로드되는지는 판정하지 못했습니다 [가설 — `templates/` 아래 파일을 읽은 세션에서 `templates/CLAUDE.md`가 끝까지 로드되는지 `/context`나 `InstructionsLoaded` 훅으로 확인하면 판정]. `templates/CLAUDE.md`가 원문의 "very large" 조건에 해당하고, 구버전에서 `templates/` 아래 파일을 읽은 뒤 반복 compaction을 겪었다면 이 결함이 원인 후보입니다 [가설 — 크기 조건 충족 여부와 그런 반복 compaction은 관측하지 않음].

### 서브에이전트 · 팀원 · worktree

- CHANGELOG 원문: "Fixed split-pane agent teammates not inheriting the tool deny and `--tools` rules given on the leader's command line"
  (309) split-pane 에이전트 팀원이 리더의 명령줄에서 준 도구 deny 규칙과 `--tools` 규칙을 상속하지 않던 결함이 수정되었습니다. 저장소 settings(`.claude/settings.json`, `templates/.claude/settings.json`)에는 `teammateMode` 키가 없으므로(`git grep -n teammateMode HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1) 팀원이 split-pane으로 표시되는지는 사용자 settings나 실행 옵션에 달려 있습니다 [가설 — `teammateMode` 값과 split-pane 표시의 대응은 원문 외 미확인]. R018은 `TeamCreate`가 없어도 이름 붙인 `Agent` 스폰이 세션의 암묵적 팀의 팀원을 만든다고 기록합니다(`.claude/rules/MUST-agent-teams.md:22`, 보이는 표 행, CC 2.1.289 실측). 다만 그런 팀원이 split-pane으로 뜨는지는 측정하지 않았습니다 [가설 — 이름 붙인 스폰 뒤 tmux pane 생성 여부로 판정]. 관측한 범위에서 이 저장소의 스킬·훅·워크플로·`package.json`은 `--tools`·`--disallowedTools`·`--allowedTools` 계열 플래그를 쓰지 않으며(`git grep -n -E -e '--tools|--disallowedTools|--disallowed-tools|--allowedTools|--allowed-tools' HEAD -- .claude/skills .claude/hooks .github package.json` rc=1), 가이드 쌍을 뺀 저장소 전체에서 이 플래그 계열이 나오는 파일은 `.claude/rules/MUST-permissions.md`, 그 `templates/` 미러, `wiki/rules/r002.md`입니다(`git grep -l -E -e '--tools|--disallowedTools|--disallowed-tools|--allowedTools|--allowed-tools' HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`). 따라서 상속될 리더 명령줄 규칙은 저장소 쪽에서 관측되지 않았습니다. 사용자가 실행 alias로 이런 플래그를 주는지는 관측하지 않았습니다. 에이전트 frontmatter의 `tools:`·`disallowedTools:` 제한(R010 「Known Limitations (Active Cache)」, 제목 줄 `.claude/rules/MUST-orchestrator-coordination.md:811`)은 원문 대상인 리더 명령줄 규칙과 별개입니다.
- CHANGELOG 원문: "Fixed worktree-isolated sessions accepting some locale-prefixed commands the isolation guard should refuse"
  (309) worktree로 격리된 세션이, 격리 가드가 거부해야 할 일부 locale 접두 명령을 받아들이던 결함이 수정되었습니다. 관측한 범위(`git grep -n -E 'isolation: *"?worktree|EnterWorktree' HEAD -- .claude/agents .claude/skills .claude/settings.json`)에서 에이전트·스킬·project settings가 지시하는 worktree 격리 절차는 `omcustom-auto-improve` 스킬의 `EnterWorktree` 단계입니다(`.claude/skills/omcustom-auto-improve/SKILL.md:59`). 이 pathspec 밖의 worktree 격리 기록은 `git grep -n -E 'isolation: *"?worktree|EnterWorktree' HEAD -- . ':!.claude/agents' ':!.claude/skills' ':!.claude/settings.json' ':!templates'`로 찾을 수 있으며, 다음 세 문장에 든 예는 그 출력에서 고른 표본입니다. 호출 단위 `isolation: "worktree"` 위임 기록의 예로는 worktree 병렬 위임을 다루는 R009 버전 노트(`.claude/rules/MUST-parallel-execution.md:208`, HTML 주석 안), `isolation: "worktree"`로 스폰하는 에이전트를 다루는 이 가이드 v2.1.277 절의 untracked 스킬 디렉터리 항목, 호출 단위 위임을 관련 경로로 두는 v2.1.305 절의 worktree 정리 항목 등이 있습니다. 에이전트 frontmatter `isolation: worktree` 기록의 예로는 R006의 예시(`.claude/rules/MUST-agent-design.md:220`의 `isolation: worktree | sandbox`, HTML 주석 안)와 보이는 가이드 본문(`guides/git-worktree-workflow/README.md:89`, `guides/worktree-lifecycle/README.md:81`, `guides/harness-engineering/README.md:104`, `:161`, `:332`, `:333`) 등이 있습니다. `EnterWorktree` 도구 안내도 보이는 가이드 본문에 있습니다(`guides/git-worktree-workflow/README.md:71`~`:78`, `guides/worktree-lifecycle/README.md:75`, `:79`). 같은 격리 가드에 관한 기록으로, R002 버전 노트는 2.1.257에서 worktree 격리 세션이 git을 건드리지 않는 Bash 반복문·`$VAR` 읽기·`"$(…)"`·heredoc을 거부하던 결함이 수정되었다고 적고(`.claude/rules/MUST-permissions.md:113`의 (e), HTML 주석 안), 2.1.274에서 특정 중첩 셸 확장을 포함한 Bash 명령이 다시 거부되므로 R009 worktree 위임에서 이를 격리 결함으로 진단하지 말고 명령을 단순화하라고 적습니다(같은 파일 `:127`, HTML 주석 안). 이번 수정은 2.1.274처럼 가드가 거부하는 쪽으로 움직이는 변경입니다. `EnterWorktree`로 들어간 세션과 호출 단위 `isolation: "worktree"` 위임 세션이 원문의 "worktree-isolated sessions"에 해당하는지는 측정하지 않았습니다 [가설 — 두 경로에서 locale 접두 명령에 대한 가드의 거부 메시지를 관측하면 판정]. locale 접두(`LC_ALL=C`)는 관측한 범위에서 훅·스킬 스크립트의 코드 줄(`.claude/hooks/scripts/cost-cap-advisor.sh:22`, `:49`, `.claude/skills/agora/scripts/anonymize.sh:266`)에 나타나며(`git grep -n -E '(^|[ ;&|(])(LC_ALL|LANG|LC_[A-Z]+)=' HEAD -- .claude/skills .claude/hooks .claude/agents`), 이는 Bash 도구 명령 문자열이 아니라 스크립트 본문이므로 가드 검사 대상이 아니라고 봅니다 [가설 — 가드가 명령 문자열을 검사한다는 전제].
- CHANGELOG 원문: "Fixed worktree-isolated sessions on zsh accepting some arithmetic commands that the isolation guard should refuse"
  (309) zsh의 worktree 격리 세션이, 격리 가드가 거부해야 할 일부 산술 명령을 받아들이던 결함이 수정되었습니다. R002 버전 노트는 이 저장소의 Bash 도구 실행 셸을 zsh로 기록하므로(`.claude/rules/MUST-permissions.md:113`의 (b), HTML 주석 안) zsh 조건에 해당할 수 있으나, 실제 셸은 사용자 기기마다 다릅니다. 위 항목과 같은 worktree 격리 경로(`EnterWorktree` 단계, 호출 단위 `isolation: "worktree"` 위임)에 관련되며 [가설], 이 수정은 가드가 더 많은 명령을 거부하는 방향이므로 zsh 격리 세션 안의 일부 즉석 산술 명령이 거부될 수 있습니다 [가설 — 거부 대상 산술 형태는 원문에 나오지 않음].

### Bash · 도구 동작 · transcript

- CHANGELOG 원문: "Fixed long tool output previews being cut through an emoji, leaving session transcripts that `jq` could not parse"
  (309) 긴 도구 출력 미리보기가 이모지 중간에서 잘려 `jq`가 파싱할 수 없는 세션 transcript를 남기던 결함이 수정되었습니다. 이 저장소의 R007/R008 drift advisor와 Stop 훅 회고는 transcript를 줄 단위로 나눈 뒤(`split("\n")`, `.claude/hooks/scripts/r007-r008-drift-advisor.sh:227`, `.claude/hooks/scripts/session-reflection.sh:167`) 각 줄을 `fromjson? // empty`로 파싱하므로(같은 파일의 코드 줄 `:228`, `:168`) 파싱할 수 없는 줄은 오류 없이 건너뜁니다. 따라서 구버전 transcript에서 긴 도구 출력 미리보기가 이모지 중간에서 잘린 줄은 판정에서 빠졌을 수 있습니다 [가설 — 잘린 줄이 판정에 쓰이는 레코드였는지는 미조사; 기존 transcript에서 `fromjson`이 실패하는 줄을 세면 판정]. R020 「Self-Violation Counting Is Also Diagnosis」(제목 줄 `.claude/rules/MUST-completion-verification.md:381`)의 표 행(`:389`)은 transcript를 파싱해 실측 집계한 뒤 보고하라고 요구하므로, 2.1.309 이전에 기록된 transcript를 `?` 없는 `jq`로 파싱하면 그런 줄에서 실패할 수 있습니다. 원문은 이미 기록된 transcript를 고친다고 서술하지 않습니다.
- CHANGELOG 원문: "Improved disk-full handling: a Bash command cut off by a full disk now says so and names the folder to free up, and starting on a full temp volume prints a clear message, not a raw ENOSPC error"
  (309) 디스크가 가득 차 Bash 명령이 중단되면 이제 그 사실과 비워야 할 폴더를 알려 주고, 임시 볼륨이 가득 찬 상태로 시작하면 원시 ENOSPC 오류 대신 명확한 메시지를 출력합니다. R020은 실행 중 인터럽트된 셸 명령이 잘렸다는 표시 없이 "Ran 1 shell command"로만 표시되던 v2.1.246 이전 사례를 들어 출력 완결성 확인을 요구합니다(`.claude/rules/MUST-completion-verification.md:532`, 보이는 표 행). 이 개선은 디스크 부족으로 인한 Bash 명령 중단을 명시적으로 보고하는 방향이며, R020의 출력 완결성 확인 의무는 바뀌지 않습니다. v2.1.305 절의 `ENOSPC` 항목은 디스크가 가득 차 명령이 아무것도 실행되지 않은 경우를 다루며 실행 도중 끊긴 경우로 이 문장을 참조합니다. 두 경우는 구분되며, 이 항목처럼 실행 도중 끊긴 명령은 부분 산출물을 남겼을 수 있습니다.

### GitHub 기록

- CHANGELOG 원문: "Fixed Claude notifying unrelated GitHub users by writing role names and placeholders as mentions in PRs, issues and comments"
  (309) Claude가 PR·이슈·코멘트에 역할 이름과 플레이스홀더를 멘션 형태로 써서 무관한 GitHub 사용자에게 알림을 보내던 결함이 수정되었습니다. 이 저장소는 PR·이슈·코멘트를 `gh`로 작성하는 스킬을 두며(`git grep -l -E 'gh (issue|pr) (create|comment)' HEAD -- .claude/skills | wc -l`=5), R015는 에이전트 직접 지정 문법으로 `@{agent-name} {command}`를 규정합니다(`.claude/rules/MUST-intent-transparency.md:40`, 보이는 본문 줄; 예시는 `.claude/skills/intent-detection/SKILL.md:144`의 `@lang-python-expert`). 이 표기가 GitHub 본문에 들어가면 같은 이름의 GitHub 사용자 멘션으로 해석될 수 있었습니다 [가설 — 이 저장소가 작성한 이슈·PR 본문에서 `@<agent-name>` 형태를 검색하면 판정]. `.claude/skills/pipeline/workflows/auto-dev.yaml:504`, `:609`의 `--add-assignee @me`는 `gh` 명령 인자이며 본문 텍스트가 아니므로 원문 대상이 아닙니다.

기타 68건 — 이 저장소 비해당(샌드박스 항목: macOS·Linux 샌드박스의 셸 startup 파일 실행, `denyWrite` symlink glob, `--mcp-config` 파일 보호, 샌드박스 제외 명령의 쓰기 승인, Linux 백그라운드 명령의 write deny, Linux 샌드박스의 PDF Read — 저장소 settings에 `sandbox` 설정 0건(`git grep -n -i sandbox HEAD -- .claude/settings.json templates/.claude/settings.json` rc=1), `--mcp-config` 실행 경로 0건(`git grep -n -e '--mcp-config' HEAD -- .claude .github package.json` rc=1); 단 `.claude/agents/sec-codeql-expert.md:8`의 `isolation: sandbox`(R006 예시의 주석은 "sandbox = restricted bash", `.claude/rules/MUST-agent-design.md:220`, HTML 주석 안)를 CC가 Bash 샌드박스로 취급하는지는 확인하지 않았습니다(R006의 다른 HTML 주석 안 서술 `.claude/rules/MUST-agent-design.md:410`은 `isolation: sandbox`에서 에이전트의 Bash 호출이 제한된 권한으로 실행된다고 하면서도 이를 advisory metadata로, 강제는 실행 환경에 달린 것으로 적습니다) [가설 — 이 에이전트를 스폰해 샌드박스 적용 여부를 관측하면 판정; 해당하면 위 샌드박스 항목 일부가 이 에이전트에 관련]; `Edit(path)` deny 규칙의 Bash 리다이렉트 차단 — 저장소 settings의 deny 규칙 null(`git show HEAD:.claude/settings.json | jq -c '.permissions.deny'`, `git show HEAD:templates/.claude/settings.json | jq -c '.permissions.deny'`); Claude Code가 만드는 worktree·브랜치 체크아웃의 git replace refs 무시 — 원격의 replace ref 0개(`git ls-remote origin 'refs/replace/*' | wc -l`=0); worktree 생성·재사용에서 git이 객체를 on-demand로 가져오지 않도록 한 변경(대상은 일반 clone과, Bash 샌드박스가 설정된 partial clone이며 그런 partial clone은 객체를 먼저 가져옴) — 저장소 settings에 sandbox 설정 0건(위 명령)이고, 일반 clone에서는 on-demand fetch가 일어나지 않는다고 봅니다 [가설 — 일반 clone에서 `EnterWorktree` 전후 git 네트워크 요청 유무로 판정]; `--add-dir` 스킬 이름 충돌 — 실행 경로 0건(`git grep -n -e 'add-dir' HEAD -- .claude/skills .claude/hooks .claude/agents .github package.json` rc=1); `claude ultrareview` workspace trust — 실행 경로 0건(`git grep -n -i ultrareview HEAD -- .claude/skills .claude/hooks .claude/agents .github package.json` rc=1); PowerShell 훅·Windows 전용 수정 — `"shell": "powershell"` 0건(`git grep -n -E '"shell" *: *"powershell"' HEAD -- .claude/settings.json templates/.claude/settings.json .claude/hooks/hooks.json` rc=1); Desktop·VSCode 전용 항목(Desktop app·VS Code의 bypass 모드에서 위험 `rm`·`rmdir` 프롬프트를 즉시 거부하는 변경 포함), Cloud sessions·Claude Tag·Code Review·self-hosted runner, mods(`turn.step` 별칭, hooks module 깊이 오류), artifact 게시·갱신, Amazon Bedrock·gateway keepalive, `/claude-api` 스킬·번들 dataviz 스킬, claude.ai synced plugin·skill, `/verify`·`/code-review`의 nested package 스킬 탐색, 터미널 UI(ctrl+enter, ctrl+o, 키 바인딩 slash command, `/rename`, `/rewind` 목록 표시), macOS Command Line Tools 대화상자, `/privacy-settings`·feedback, `claude remote-control` 상태줄, profile store symlink 보호, Claude Code 자체 git 명령의 Windows 속도·영어 오류 메시지). 이 가운데 `[가설]`을 붙인 두 곳(`sec-codeql-expert`의 `isolation: sandbox` 취급, 일반 clone의 on-demand fetch)은 판정 전까지 비해당이 확정되지 않습니다. 또한 샌드박스·deny 항목의 비해당 판단은 저장소가 추적하는 두 settings만 측정한 것이며, gitignore된 local 범위(`.claude/settings.local.json`)와 사용자·managed 범위 settings의 `sandbox`·`permissions.deny` 값은 관측하지 않았습니다 [가설 — 그런 값을 둔 기기에서는 해당할 수 있으며, 그 기기의 사용자·local·managed settings를 확인하면 판정]. 다만 그중 `--mcp-config` 파일 보호 항목의 판단은 두 settings가 아니라 실행 경로 검색(`git grep -n -e '--mcp-config' HEAD -- .claude .github package.json` rc=1)에 근거하며, 사용자의 실행 명령줄은 관측하지 않았습니다. 실측: `gh release view v2.1.309 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 79건 중 위 본문 11건을 다뤘으므로 79 − 11 = 68건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:

- 본문 11개 항목 가운데 원문이 `Changed`로 시작하는 기본 동작 변경은 `sed -i` 항목 1개입니다(본문 인용 11줄의 첫 단어: Fixed 9, Changed 1, Improved 1). 이 릴리즈 전체의 `- Changed` 불릿은 6개이며(`gh release view v2.1.309 --repo anthropics/claude-code --json body --jq .body | grep -c '^- Changed'`=6) 나머지 5개는 기타로 분류했습니다. 본문의 결함 수정 9개 가운데 이 저장소의 실행에서 승인 요청이나 거부가 늘 수 있는 방향의 항목은 `cd`를 감싸거나 접두어를 붙인 뒤 git을 실행하는 일부 복합 명령, worktree 격리 가드 2건(일부 locale 접두 명령, zsh의 일부 산술 명령 — 해당 세션 경로는 [가설]), 그리고 리더를 deny·`--tools` 명령줄 규칙으로 실행하고 split-pane 팀원을 쓰는 경우의 규칙 상속입니다(본문에서 저장소 쪽 사용은 관측되지 않았고, 사용자의 실행 명령줄은 관측하지 않았습니다). 리다이렉트를 열지 못할 수 있는 명령이 설정한 변수 항목은 원문에 결과어가 없어 방향을 분류하지 않았습니다. 비활성화된 MCP 서버의 재연결 방지는 그 서버를 비활성 상태로 유지하는 수정이므로 위 방향 목록에 넣지 않았습니다. 기타로 분류한 항목에도 거부나 승인 요청이 늘 수 있는 방향의 변경이 있으나(예: 서브셸을 함께 가진 일부 명령에서 `Edit(path)` deny 규칙의 Bash 리다이렉트 차단, `--mcp-config` 파일 보호, 샌드박스가 켜져 있지만 실행할 수 없을 때 샌드박스 제외 명령이 쓰기 목록 경로에 쓰기 전의 승인 요청, 현재 디렉토리를 대상으로 추가 인자를 가진 일부 Windows PowerShell `Set-Location`·`cd` 명령의 승인 요청), 위 「기타 68건」 문단의 측정과 범주 분류에 따라 이 저장소 비해당으로 두었습니다. split-pane 항목이 사용자의 실행 명령줄을 관측하지 않은 것과 마찬가지로, 그 문단의 샌드박스·deny 판단도 사용자·local(gitignore된 `.claude/settings.local.json`)·managed 범위 settings를 관측하지 않은 범위의 판단입니다(`--mcp-config` 파일 보호는 실행 경로 검색 기준이며 사용자의 실행 명령줄은 관측하지 않았습니다). 이 저장소에서 실제로 프롬프트·거부가 생기는지는 아래 후속 실측 후보 (1)·(2)·(5)·(6)으로 남깁니다. 룰·CLAUDE.md·에이전트·훅 문안 변경은 이 절에서 확정하지 않습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때만 1줄).
- 후속 실측 후보: (1) 비-bypass 모드에서 `( cd templates && git status )`가 프롬프트를 띄우는지, `Bash(git:*)`가 이를 억제하는지 확인합니다. 저장소 자체 형태인 auto-dev 워크플로의 path-precheck 블록(`.claude/skills/pipeline/workflows/auto-dev.yaml:342`, `:357`)도 같은 프로브로 확인합니다. (2) 비-bypass 모드에서 `Bash(sed:*)`가 `sed -i`에 적용되는지, `bashEditDiffEnabled`를 켠 세션에서 `sed -i` 결과에 diff가 붙는지 확인합니다. (3) `templates/CLAUDE.md`(13,817바이트)가 nested 크기 한도를 넘는지 확인합니다. (4) 2.1.309 이전 transcript에서 `fromjson`이 실패하는 줄 수를 셉니다. (5) `EnterWorktree` 세션과 호출 단위 `isolation: "worktree"` 위임 세션에서 locale 접두 명령과 zsh 산술 명령이 거부되는지 확인합니다. (6) 리더를 `--disallowedTools`·`--tools`로 실행한 세션에서 이름 붙인 스폰이 split-pane 팀원이 되는지, 그 팀원이 리더의 규칙을 상속하는지 확인합니다.
- (309) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

---

## v2.1.310 (2026-10-23)

> Issue: #1872 — Claude Code v2.1.310 compatibility documentation
> Scope-ceiling check (R017): 조사 시점(2026-10-25)의 최신 릴리즈는 2.1.310입니다(`claude --version`=2.1.310, `npm view @anthropic-ai/claude-code version`=2.1.310, `gh release list -R anthropics/claude-code --limit 3`의 첫 행이 `v2.1.310 Latest`). 이 릴리즈가 스코프 상한이므로 이후 릴리즈의 롤백 확인 대상이 없습니다. 릴리즈 게시 시각은 2026-10-23T23:39:00Z입니다(`gh release view v2.1.310 -R anthropics/claude-code --json publishedAt`).

### Bash · Monitor 도구

- CHANGELOG 원문: "Added the Monitor tool and plugin monitors on Bedrock, Vertex, and Foundry, and when telemetry or nonessential traffic is disabled; long foreground sleeps are now blocked there too"
  (310) Bedrock·Vertex·Foundry에서, 그리고 텔레메트리나 비필수 트래픽을 끈 경우에도 Monitor 도구와 플러그인 monitor가 추가되었고, 그 환경에서도 이제 긴 foreground sleep이 차단됩니다. R002는 Monitor를 Tier 3 도구로 분류합니다(`.claude/rules/MUST-permissions.md:11`, 주석 밖 표 행). 추적되는 프로젝트 settings와 그 `templates/` 미러에는 `env` 키가 없습니다(`for f in .claude/settings.json templates/.claude/settings.json; do git show "HEAD:$f" | jq 'has("env")'; done` = `false`, `false`). `git grep -n -E 'CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)|DISABLE_TELEMETRY|DISABLE_NONESSENTIAL_TRAFFIC' HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`의 출력은 15줄이며, 그중 `CLAUDE_CODE_USE_` 히트는 없습니다. 15줄의 내역은 다음과 같습니다. `.claude/skills/monitoring-setup/SKILL.md`의 4줄 중 `:251`·`:253`은 변수 설명 표이고, `:262`·`:264`는 "Enterprise Configuration" 예시의 `env` 블록에서 `DISABLE_TELEMETRY`와 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`를 `"1"`로 둡니다. `.claude/skills/skills-sh-search/SKILL.md:211`은 skills CLI 텔레메트리를 끄려면 `DISABLE_TELEMETRY=1`을 설정하라고 안내합니다. `guides/claude-code/13-cli-flags.md:141`·`:143`은 변수 설명 표이고, `docs/superpowers/plans/2026-03-29-v0.65.0-release.md:29`는 계획 문서의 작업 항목입니다. 나머지 7줄은 앞의 세 파일(`monitoring-setup` 4줄, `skills-sh-search` 1줄, `13-cli-flags.md` 2줄)의 `templates/` 미러입니다. 앞의 두 변수 설명 표에는 `DO_NOT_TRACK`도 있으나(`guides/claude-code/13-cli-flags.md:145`, `.claude/skills/monitoring-setup/SKILL.md:255`) 15줄을 낸 검색의 정규식에 없어 15줄에 들지 않습니다. 별도 검색 `git grep -n -F DO_NOT_TRACK HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`의 4줄은 이 두 표 행과 그 `templates/` 미러이며, 값을 설정하는 줄은 없습니다. 원문은 어떤 변수(`DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DO_NOT_TRACK` 등)가 "telemetry or nonessential traffic is disabled" 조건을 만드는지 밝히지 않으며, 이 저장소의 두 표(`guides/claude-code/13-cli-flags.md:141`, `.claude/skills/monitoring-setup/SKILL.md:251`)는 `DISABLE_TELEMETRY`를 Claude Code의 "Disable all telemetry collection" 변수로 적습니다. Enterprise Configuration 예시를 적용한 환경(`DISABLE_TELEMETRY`·`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 설정)은 이 릴리즈부터 Monitor 도구를 받고 긴 foreground sleep도 차단되는 조건에 들어갈 수 있습니다 [가설 — 원문이 조건 변수를 밝히지 않으며, 이 예시를 실제로 적용한 사용자 환경은 미관측]. `skills-sh-search`의 안내를 따라 Claude Code가 실행되는 셸에 `DISABLE_TELEMETRY=1`을 export하는 것도 같은 변수를 설정하므로 같은 조건에 들어갈 수 있는 또 하나의 경로입니다 [가설 — 위와 같은 변수 대응 전제이며, 사용자의 export 여부는 미관측]. foreground sleep 쪽은 `git grep -n -P '(?<![A-Za-z_])sleep(?![A-Za-z_])' HEAD -- .claude/skills .claude/hooks .claude/agents`로 재면 30줄이 걸립니다. 그중 셸 `sleep` 명령은 agora 스크립트 watchdog의 `( sleep "$secs"; kill -TERM -- "-$pid" 2>/dev/null ) &` 2줄(`.claude/skills/agora/scripts/judge.sh:140`, `.claude/skills/agora/scripts/reviewers.sh:106`)입니다. 나머지 28줄은 같은 두 스크립트의 주석 6줄, `.claude/skills/claude-code-bible/scripts/fetch-docs.js`의 JS `sleep` 함수 2줄, `fastapi-best-practices`·`java-best-practices` 문서의 Python·Java `sleep` 언급 3줄, `systematic-debugging`의 TS 예시와 임의 대기 반패턴 서술 15줄, 워크플로 스크립트를 사본으로 추출해 검증할 때 사본 수정을 `sleep` 무력화 같은 실행 환경 대체로만 제한하는 `.claude/skills/pipeline/workflows/auto-dev.yaml` 서술 2줄(`:854`, `:860`)입니다. 숫자 인자만 찾는 ERE `git grep -n -E '(^|[^a-zA-Z_])sleep [0-9]' HEAD -- .claude/skills .claude/hooks .claude/agents`는 이 변수 인자 형태를 놓쳐 출력이 없습니다(rc=1). 30줄을 센 PCRE의 경계 조건은 `sleep_interval`처럼 밑줄로 이어진 이름을 빼므로, `pipeline` 스킬 auto-dev 워크플로의 ci-check 단계가 Bash 타임아웃 예산 안에서 poll하라고 지시하는 줄(`.claude/skills/pipeline/workflows/auto-dev.yaml:1551`~`:1554`, `loop_count × sleep_interval`)은 30줄에 들지 않습니다(`git grep -n -E 'sleep_' HEAD -- .claude/skills .claude/hooks .claude/agents`의 출력은 `:1552` 1줄). 같은 지시는 한도 없는 수동 poll loop보다 실행 ID를 지정한 `gh run watch`에 `--exit-status`를 붙인 단일 bounded 호출(선택적으로 `run_in_background`)을 우선하라고 적습니다. 이 지시를 따라 foreground로 실행하는 poll loop의 대기가 원문의 "long foreground sleeps"에 드는지는 [가설 — 원문이 차단 기준 길이를 밝히지 않으므로, 해당 환경에서 ci-check 단계의 poll loop를 실행해 차단 여부를 확인하면 판정]입니다. agora watchdog의 `sleep`은 스크립트 안에서 `&`로 띄운 서브셸에 있으며, 이 차단이 스크립트 안의 그런 sleep에도 적용되는지는 관측하지 않았습니다 [가설 — Bedrock·Vertex·Foundry나 텔레메트리·비필수 트래픽을 끈 환경에서 agora를 실행해 watchdog 서브셸의 sleep이 차단되는지 확인하면 판정].

### 컨텍스트 · compaction · 무인(`-p`) 실행

- CHANGELOG 원문: "Fixed compaction after a "Prompt is too long" error keeping too much of a conversation with dense text, such as base64 or SVG, so the next request could fail again"
  (310) "Prompt is too long" 오류 뒤의 compaction이 base64나 SVG처럼 밀도 높은 텍스트가 든 대화를 너무 많이 남겨, 다음 요청이 다시 실패할 수 있던 결함이 수정되었습니다. 룰에서는 예컨대 R013 노트(`.claude/rules/SHOULD-ecomode.md:99`, `:101`, 주석 밖 본문 줄)가 같은 오류 계열의 compaction 수정을 기록합니다. 이 가이드에서 원문 인용 줄에 "Prompt is too long"이 대소문자 구분 없이 들어간 항목은, 이 절과 v2.1.306 절을 넣기 전(커밋 5600fc87) 기준으로 (284)(288)(290)(302)(304) 5건입니다(`git show 5600fc87:guides/claude-code/15-version-compatibility.md | command grep -n -F 'CHANGELOG 원문: "' | command grep -i -F 'prompt is too long'` = 5줄). 이 절과 함께 추가된 이 가이드 v2.1.306 절의 (306) 항목은 MCP 도구가 많은 세션에서 API 오류가 소문자 "prompt is too long"으로 대체되던 결함을 다루며, 이 항목과 원인 조건이 다른 별개 수정입니다. 이 저장소에서는 `diagram-design` 스킬이 SVG 다이어그램 생성을 목적으로 합니다(`.claude/skills/diagram-design/SKILL.md:3`). 이 스킬로 SVG 텍스트가 많이 쌓인 대화에서 "Prompt is too long" 오류 뒤 compaction을 거친 다음 요청이 다시 실패했다면 구버전의 이 결함이 원인 후보입니다 [가설 — 해당 스킬을 쓴 세션에서 그런 재실패 사례는 미관측]. R013의 임계값 정의는 바뀌지 않습니다.
- CHANGELOG 원문: "Improved memory use of non-interactive sessions (`-p`, Agent SDK) during compaction when the transcript file is very large"
  (310) 트랜스크립트 파일이 매우 클 때 비대화형 세션(`-p`, Agent SDK)이 compaction 중 쓰는 메모리가 개선되었습니다. `/fsd`는 세션이 무인(`claude -p`, 예약 실행)이라 자기 페이싱이 필요할 때 `/goal`·`/loop` 경로를 권장하고(`.claude/skills/fsd/SKILL.md:172`), `claude -p` 경로에서는 env `OMCUSTOM_UNATTENDED=1`을 쓰도록 안내합니다(`:133`). R013은 메모리 사용량이 치명적일 때의 가시적 경고(v2.1.274)를 기록합니다(`.claude/rules/SHOULD-ecomode.md:101`, 주석 밖 본문 줄). 장기 `-p` 실행에서 트랜스크립트 파일이 매우 커지면 이 개선이 해당할 수 있으나, CHANGELOG는 "very large"의 기준을 밝히지 않습니다 [가설 — 트랜스크립트 파일이 매우 큰 장기 `-p` `/fsd` 실행에서 compaction 시점 메모리를 2.1.310 전후로 비교하면 판정]. 룰 변경은 필요하지 않습니다.

### 권한 · permission mode · settings

- CHANGELOG 원문: "Improved auto mode's prompt before the first read outside the working directories: it now says when blocking those reads makes shell commands ask for permission"
  (310) auto mode에서 작업 디렉토리 밖의 첫 읽기 전에 표시되는 프롬프트가 개선되어, 그런 읽기를 차단하면 셸 명령이 권한을 요청하게 되는 경우 이제 그 사실을 알려 줍니다. R002의 v2.1.257 노트는 HTML 주석 안의 DETAIL 블록(자동 주입되지 않음)에 있으며(`.claude/rules/MUST-permissions.md:113`, 주석 시작 `:85`), auto mode에서 작업 디렉토리 밖 첫 파일 읽기 전에 1회 프롬프트를 표시하고 그런 읽기를 차단하는 동작을 `permissions.blockReadsOutsideWorkingDirectories` 설정의 동작으로 서술합니다. 같은 DETAIL 블록에는 이 설정과 셸 명령을 함께 다룬 기록이 더 있습니다. v2.1.271 노트의 (d)(`:125`, HTML 주석 안)는 디렉토리 변경 2회, 서브셸, 또는 `cd`+`git` 체인을 가진 명령이 bypass·auto 모드의 이 설정에서 프롬프트를 건너뛰던 결함의 수정을 기록합니다. v2.1.273/274 노트의 (273) 항목(`:127`, HTML 주석 안)은 권한 검사기가 완전히 분석할 수 없는 Bash 명령이 이 설정에서 프롬프트를 건너뛰던 결함의 수정을 기록합니다. 추적되는 프로젝트 settings와 그 `templates/` 미러에는 이 설정이 없습니다(`for f in .claude/settings.json templates/.claude/settings.json; do git show "HEAD:$f" | jq '(.permissions // {}) | has("blockReadsOutsideWorkingDirectories")'; done` = `false`, `false`). `for f in .claude/settings.json templates/.claude/settings.json; do git show "HEAD:$f" | jq -c '{defaultMode: (.permissions.defaultMode // "unset"), has: ((.permissions // {}) | has("defaultMode"))}'; done`의 출력은 `{"defaultMode":"bypassPermissions","has":true}`, `{"defaultMode":"unset","has":false}`이므로, 추적되는 프로젝트 settings의 `permissions.defaultMode`는 `bypassPermissions`이고 `templates/` 미러에는 이 키가 없습니다. R010은 2.1.257부터 프로젝트·로컬의 `bypassPermissions`가 무시된다고 기록하고, `claude -p` 실측(CC 2.1.289)으로 그 결과를 두 갈래로 나눕니다. 사용자 값이 `bypassPermissions`가 아니면(`plan`/`auto`/`acceptEdits`) 무시된 범위가 `default`로 귀결되어 사용자 값을 덮고, 사용자 값이 `bypassPermissions`이면 결과가 `bypassPermissions`로 남습니다. R010의 원천 목록(managed·local·project·user 설정과 실행 플래그)과 우선순위에 따르면 두 갈래 모두 local·managed 설정이나 실행 플래그가 다른 모드를 정하지 않을 때의 결과이며, managed 범위는 R010이 미측정 `[가설]`로 둡니다. 대화형 TTY 세션의 유효 모드는 R010이 `[가설]`로 남겨 두었습니다(`.claude/rules/MUST-orchestrator-coordination.md:588`, 주석 밖 본문 줄). 사용자·managed settings와 실행 플래그는 저장소 밖에 있으므로, 이 프롬프트가 이 저장소 세션에서 표시되는지는 관측하지 않았습니다 [가설 — 설정을 켠 auto mode 세션에서 작업 디렉토리 밖을 처음 읽을 때 문구를 확인하면 판정].
- CHANGELOG 원문: "Fixed file read permission prompts not showing where a symbolic link leads"
  (310) 파일 읽기 권한 프롬프트가 심볼릭 링크의 대상 위치를 보여 주지 않던 결함이 수정되었습니다. 쓰기 쪽의 같은 계열 수정은 이 가이드의 (280) 항목이 기록하며, 그 수정의 결과는 두 가지입니다. 하나는 심볼릭 링크 경로를 통한 쓰기에서 프롬프트가 실제 쓰기 위치를 표시하는 것이고, 다른 하나는 `acceptEdits`·allow 규칙·auto mode가 밖에 떨어지는 쓰기를 더 이상 승인하지 않는 것입니다. 관측한 범위에서 이 저장소의 추적 심볼릭 링크는 `docs/plans/refs/latest` 1개이며(`git ls-files -s | awk '$1=="120000"{print $4}'`), 대상은 저장소 안의 상대 경로 `../2025-01-25`입니다(`git cat-file -p HEAD:docs/plans/refs/latest`). 이 수정의 대상은 프롬프트에 표시되는 내용이며, `.claude/settings.json`의 `permissions` 규칙은 바뀌지 않습니다.
- CHANGELOG 원문: "Fixed background cleanup deleting some recent files, such as pasted images, when `cleanupPeriodDays` is set to a very large value"
  (310) `cleanupPeriodDays`를 매우 큰 값으로 설정했을 때 백그라운드 정리가 붙여 넣은 이미지 같은 최근 파일 일부를 지우던 결함이 수정되었습니다. 추적되는 프로젝트 settings와 그 `templates/` 미러에는 `cleanupPeriodDays`가 없습니다(`for f in .claude/settings.json templates/.claude/settings.json; do git show "HEAD:$f" | jq 'has("cleanupPeriodDays")'; done` = `false`, `false`). 저장소 안에서는 `git grep -n cleanupPeriodDays HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`의 히트가 R011의 HTML 주석 안 DETAIL 블록(자동 주입되지 않음, 주석 시작 `.claude/rules/SHOULD-memory-integration.md:551`)에 있는 노트(`:552`)와 그 `templates/` 미러, `wiki/rules/r011.md:142` 사본의 서술 3건이며, 이 키를 설정하는 추적 파일은 이 출력에 없습니다. 따라서 저장소 설정 범위에서는 결함 조건(매우 큰 값 설정)이 관측되지 않았습니다. 사용자 settings의 값은 저장소 밖이므로 이 결론에 넣지 않습니다.

### MCP

- CHANGELOG 원문: "Changed the error for an MCP tool call that times out in a non-interactive session while the server's elicitation is unanswered: it now tells Claude that no answer came and not to repeat the call"
  (310) 비대화형 세션에서 서버의 elicitation에 답이 없는 채로 MCP 도구 호출이 타임아웃되면, 이제 오류가 Claude에게 답이 오지 않았다는 사실과 호출을 반복하지 말라는 지시를 함께 알려 줍니다. 이 저장소의 `.mcp.json`은 `ontology-rag`(stdio, 명령 `.venv/bin/python -m ontology_rag.mcp_server`)와 `eraser`(http, `https://app.eraser.io/api/mcp`) 두 서버를 둡니다(`git show HEAD:.mcp.json | jq -c '.mcpServers | to_entries[] | {name: .key, type: .value.type, command: .value.command, args: .value.args, url: .value.url}'`). `ontology-rag`의 서버 소스는 추적 파일 `packages/ontology-rag/src/ontology_rag/mcp_server.py`이며, `git grep -n -i elicit HEAD -- packages`는 출력이 없었습니다(rc=1). 따라서 추적 소스 범위에서 `ontology-rag`가 elicitation을 요청하는 코드는 관측되지 않았습니다. `.venv`에 설치된 실행본이 이 추적 소스와 같은지는 기기 로컬 상태라 확인하지 않았습니다. 원격 http 서버 `eraser`가 elicitation을 요청하는지는 관측하지 않았습니다 [가설 — 서버 동작이나 `-p` 실행 로그로 판정]. 추적되는 프로젝트 settings와 그 `templates/` 미러에는 `Elicitation`·`ElicitationResult` 훅 키가 없습니다(`for f in .claude/settings.json templates/.claude/settings.json; do git show "HEAD:$f" | jq -c '.hooks | {Elicitation: has("Elicitation"), ElicitationResult: has("ElicitationResult")}'; done` = 두 줄 모두 `{"Elicitation":false,"ElicitationResult":false}`). 저장소 전체로 넓힌 `git grep -l -i elicit HEAD -- . ':!guides/claude-code/15-version-compatibility.md' ':!templates/guides/claude-code/15-version-compatibility.md'`의 히트 파일 8개는 R006 훅 카탈로그(`.claude/rules/MUST-agent-design.md`, 히트 줄은 HTML 주석 안)와 그 `templates/` 미러, `tests/unit/core/` 테스트 4개, `wiki/guides/claude-code.md`, `wiki/rules/r006.md`입니다. R004의 Retryable 행은 "Retry up to 3x with backoff (1s, 2s, 4s), then report"를 규정합니다(`.claude/rules/SHOULD-error-handling.md:25`, 주석 밖 표 행). 새 오류 문구는 같은 호출을 반복하지 말라고 지시하므로, `-p` 무인 실행에서 elicitation 미응답 타임아웃 오류를 받으면 R004의 Retryable 행보다 Non-recoverable 행(`:26`)으로 다루는 편이 문구와 맞습니다 [가설 — 이 오류를 실제로 받은 사례는 미관측]. 이 문서는 룰 반영 여부를 정하지 않습니다.

기타 19건 — 이 저장소 비해당(일부 gateway·호환 서버가 `effort-2025-11-24` beta 값이나 대화 중간 system 메시지를 거부할 때 그것들 없이 다시 시도하는 수정, 긴 편집 뒤 외부 편집기를 닫는 순간 질문의 auto-continue 타임아웃이 발화하던 터미널 UI 결함, Git Bash가 없고 훅 명령이 따옴표 문자열뿐일 때 PreToolUse·PermissionRequest 훅이 도구 호출을 통과시키던 Windows 전용 결함, mod `Image` 렌더링, AppArmor 제한이 bubblewrap의 샌드박스 시작을 막을 때 Linux `/sandbox`가 표시하는 안내, `[VSCode]` 2건, `[Cloud sessions]` 7건, `[Claude Tag]` 3건, `[Code Review]` 2건). 실측: `gh release view v2.1.310 --repo anthropics/claude-code --json body --jq .body | grep -c '^- '` = 26건 중 위 본문 7건을 다뤘으므로 26 − 7 = 19건입니다. 계수 범위는 해당 릴리즈 노트의 최상위 불릿 줄(`- `로 시작하는 줄)입니다.

**Action items**:
- 이 릴리즈의 본문 7건은 다음과 같습니다. 추가 1건은 Bedrock·Vertex·Foundry에서, 그리고 텔레메트리나 비필수 트래픽을 끈 경우의 Monitor 도구·플러그인 monitor 제공과 그 환경의 긴 foreground sleep 차단입니다. 결함 수정 3건은 "Prompt is too long" 오류 뒤 dense text 대화의 compaction, 심볼릭 링크 대상을 보여 주지 않던 파일 읽기 권한 프롬프트, `cleanupPeriodDays`가 매우 클 때 최근 파일 일부를 지우던 백그라운드 정리입니다. 개선 2건은 트랜스크립트 파일이 매우 클 때 비대화형 세션의 compaction 메모리, 그리고 auto mode의 작업 디렉토리 밖 첫 읽기 프롬프트입니다. 변경 1건은 비대화형 세션에서 elicitation 미응답으로 타임아웃된 MCP 도구 호출의 오류 문구입니다. 위 항목별 측정(`git show HEAD:`·`jq`·`git grep`·`git cat-file`) 범위에서 추적되는 저장소 설정(`.claude/settings.json`, `templates/.claude/settings.json`, `.mcp.json`)을 바꿔야 하는 항목은 찾지 못했습니다(R016: CC 지식은 이 가이드에 두고 룰 파일에는 행동 변화가 필요할 때만 1줄).
- 후속 실측 후보(본문 `[가설]` 9개에 대응, `awk '/^## v2\.1\.310 /{p=1} p && /^\*\*Action items\*\*/{exit} p' guides/claude-code/15-version-compatibility.md | grep -o '\[가설 —' | wc -l` = 9): (1) Bedrock·Vertex·Foundry나 텔레메트리·비필수 트래픽을 끈 환경에서 Monitor 도구 제공과 긴 foreground sleep 차단을 확인합니다. 이때 `monitoring-setup` 스킬의 Enterprise Configuration 예시(`.claude/skills/monitoring-setup/SKILL.md:262`~`:264`)를 적용한 경로와 `skills-sh-search`의 `DISABLE_TELEMETRY=1` 안내(`.claude/skills/skills-sh-search/SKILL.md:211`)를 셸에 export한 경로를 함께 보고, agora watchdog 서브셸의 `sleep`(`.claude/skills/agora/scripts/judge.sh:140`, `.claude/skills/agora/scripts/reviewers.sh:106`)과 auto-dev 워크플로 ci-check 단계의 poll loop(`.claude/skills/pipeline/workflows/auto-dev.yaml:1551`~`:1554`)가 차단되는지도 확인합니다. (2) `diagram-design`으로 SVG 텍스트가 많이 쌓인 대화에서 "Prompt is too long" 오류 뒤 compaction을 거친 다음 요청이 다시 실패하는지 확인합니다. (3) 트랜스크립트 파일이 매우 큰 장기 `-p` `/fsd` 실행에서 compaction 시점 메모리를 2.1.310 전후로 비교합니다. (4) `permissions.blockReadsOutsideWorkingDirectories`를 켠 auto mode 세션에서 작업 디렉토리 밖 첫 읽기 프롬프트의 문구를 확인합니다. (5) 원격 http 서버 `eraser`가 elicitation을 요청하는지 확인합니다. (6) 비대화형 세션에서 elicitation 미응답 타임아웃 오류를 실제로 받은 사례가 있는지 확인합니다.
- (310) 항목 중 `[가설 — …]` 표기는 판정 기준을 충족하는 측정이 이루어지기 전에는 결론으로 쓰지 않습니다.

## Known Platform Issues & Workarounds

### Agent tool malformed parsing on long / special-character prompts (#1241)

**Symptom**: The Agent (subagent dispatch) tool intermittently fails to parse delegation prompts when they are very long or contain heavy special characters (backticks, consecutive colons, shell-variable syntax), reporting the tool call as `malformed`. This is a Claude Code platform-level serialization issue, not an oh-my-customcode defect.

**Workarounds** (already aligned with existing rules):
- Pre-decompose oversized delegations: when a delegated prompt exceeds ~5000 tokens or spans 3+ unrelated domains, split into parallel domain-scoped agents (R009 giant-prompt anti-pattern).
- In delegation prompts, prefer plain prose over heavy literal blocks; avoid long fenced code with backticks and consecutive `::` sequences where a plain description suffices.
- For unavoidable large payloads, hand off via an artifact file path (R006 Artifact Channel Protocol) instead of inlining the content in the prompt.

> Issue: #1241 — Agent tool malformed-parsing workaround (platform bug; mitigations documented)

---

## References

- #967 — Claude Code v2.1.117 release note
- #968 — Claude Code v2.1.118 release note
- #969 — Claude Code v2.1.119 release note
- #1126 — Claude Code v2.1.139 신규 명령 문서화
- #1134 — Claude Code v2.1.140 release note
- #1137 — Claude Code v2.1.141 compatibility documentation
- #1158 — Claude Code v2.1.142 compatibility documentation
- #1166 — CC v2.1.143 compatibility documentation
- #1147 — .gitignore nested .md pattern limitation note
- #1187 — Claude Code v2.1.144 compatibility documentation
- #1191 — Claude Code v2.1.145 compatibility documentation
- #1205 — Claude Code v2.1.146 compatibility documentation
- #1216 — Claude Code v2.1.147 compatibility documentation
- #1218 — Claude Code v2.1.148 compatibility documentation
- #1219 — Claude Code v2.1.149 compatibility documentation
- #1220 — Claude Code v2.1.150 compatibility documentation
- #1241 — Agent tool malformed-parsing workaround
- #1242 — Claude Code v2.1.152 compatibility documentation
- #1243 — Claude Code v2.1.153 compatibility documentation
- #1244 — Claude Code v2.1.154 compatibility documentation
- #1245 — Claude Code v2.1.156 compatibility documentation
- #1276 — Claude Code v2.1.159 compatibility documentation
- #1280 — Claude Code v2.1.160 compatibility documentation
- #1713 — Claude Code v2.1.278 compatibility documentation
- #1714 — Claude Code v2.1.277 compatibility documentation
- #1716 — Claude Code v2.1.280 compatibility documentation
- #1717 — 컨텍스트 예산 초과 대응: CC 버전 노트 이관 정책 전환(룰 → 가이드)
- #1731 — Claude Code v2.1.281 compatibility documentation
- #1746 — Claude Code v2.1.282 compatibility documentation
- #1747 — Claude Code v2.1.283 compatibility documentation
- #1755 — Claude Code v2.1.284 compatibility documentation
- #1764 — Claude Code v2.1.285 compatibility documentation
- #1765 — Claude Code v2.1.286 compatibility documentation
- #1766 — Claude Code v2.1.287 compatibility documentation
- #1790 — Claude Code v2.1.288 compatibility documentation
- #1791 — Claude Code v2.1.289 compatibility documentation
- #1845 — Claude Code v2.1.290 compatibility documentation
- #1844 — Claude Code v2.1.291 compatibility documentation
- #1847 — Claude Code v2.1.292 compatibility documentation
- #1849 — Claude Code v2.1.293 compatibility documentation
- #1848 — Claude Code v2.1.294 compatibility documentation
- #1850 — Claude Code v2.1.295 compatibility documentation
- #1851 — Claude Code v2.1.296 compatibility documentation
- #1861 — Claude Code v2.1.299 compatibility documentation
- #1862 — Claude Code v2.1.300 compatibility documentation
- #1863 — Claude Code v2.1.301 compatibility documentation
- #1864 — Claude Code v2.1.302 compatibility documentation
- #1865 — Claude Code v2.1.303 compatibility documentation
- #1866 — Claude Code v2.1.304 compatibility documentation
- #1868 — Claude Code v2.1.305 compatibility documentation
- #1867 — Claude Code v2.1.306 compatibility documentation
- #1870 — Claude Code v2.1.307 compatibility documentation
- #1869 — Claude Code v2.1.308 compatibility documentation
- #1871 — Claude Code v2.1.309 compatibility documentation
- #1872 — Claude Code v2.1.310 compatibility documentation
- `.claude/skills/claude-native/` — auto-generation source
- `.claude/rules/SHOULD-hud-statusline.md` — R012 statusline integration
- `.claude/rules/MUST-agent-design.md` — R006 agent frontmatter spec
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 bypassPermissions + /bg flow
- `guides/claude-code/14-token-efficiency.md` — token efficiency guide (관련: plugin details 활용)

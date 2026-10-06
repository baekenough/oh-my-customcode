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
  (288) 차단된 도구가 Bash가 아닌데도 auto mode 거부 메시지가 Bash 권한 규칙을 가리키던 결함이 수정되었습니다. 관측한 범위에서 사용자 scope 유효 permission mode는 `auto`(`jq -r '.permissions.defaultMode // "unset"' ~/.claude/settings.json`)이므로 직접 관련됩니다. R001의 classifier 차단 후 재시도 금지 취지와 R010 STOP Protocol의 진단 정확도가 높아질 뿐 규범은 그대로입니다.
- CHANGELOG 원문: "Improved auto mode: when a conversation grows too long for the client-side safety classifier to review, it is now compacted instead of prompting for, or failing, every tool call"
  (288) auto mode에서 대화가 클라이언트 측 안전 classifier가 검토하기에 너무 길어지면 모든 도구 호출을 묻거나 실패시키는 대신 compact됩니다. 유효 모드가 `auto`인 이 저장소의 긴 세션에 해당합니다. 구버전의 긴 세션에서 도구 호출 거부·프롬프트가 있었다면 모델 규칙 위반으로만 귀속할 수 없습니다 [가설 — 해당 거부·프롬프트가 실제로 있었는지 미관측]. R002·R021 문안 변경은 없습니다.
- CHANGELOG 원문: "Changed the client-side auto mode classifier to ignore an `ANTHROPIC_DEFAULT_SONNET_MODEL` pin that names Claude Sonnet 5.5 or Opus 5.5 and use Claude Sonnet 5 instead"
  (288) 클라이언트 측 auto mode classifier는 Claude Sonnet 5.5 또는 Opus 5.5를 가리키는 `ANTHROPIC_DEFAULT_SONNET_MODEL` 고정을 무시하고 Claude Sonnet 5를 사용합니다. 관측한 범위에서 프로젝트 `.claude/settings.json`에 `env`가 없고 `.claude/settings.local.json`의 env 키는 `CLAUDE_COST_CAP`뿐이어서 이 env 고정은 쓰이지 않습니다(사용자 scope는 미관측). 이 저장소의 에이전트 핀은 frontmatter의 Tier 2 전체 ID(R006)이며, auto mode classifier가 에이전트 핀과 무관한 모델로 동작한다는 점은 R006 모델 설명의 맥락 정보입니다.
- CHANGELOG 원문: "Fixed Bash tool permission check to prompt before a `BASHPID` assignment whose value the shell would evaluate as arithmetic, instead of allowing it silently"
  (288) 셸이 산술식으로 평가할 값을 가진 `BASHPID` 할당을 조용히 허용하지 않고 먼저 확인합니다. R002 Bash 티어(Tier 4 승인) 방향의 플랫폼 수정이며 티어 정책은 바뀌지 않습니다. 저장소에 `BASHPID` 할당 사용은 관측되지 않았습니다.
- CHANGELOG 원문: "Fixed a dangerous `rm` (such as one on `/` or the home directory) inside a `bash -c` or `sh -c` script running without a prompt in bypassPermissions mode or under a shell allow rule (anthropics/claude-code#96300)"
  (288) `bash -c`·`sh -c` 스크립트 안의 위험한 `rm`(예: `/`나 홈 디렉터리 대상)이 bypassPermissions 모드나 셸 allow 규칙 아래에서 프롬프트 없이 실행되던 결함이 수정되었습니다. 이 수정은 (287)의 `rm` 안전장치 수정이 스크립트 래퍼로 확장된 것이며, 가장 직접적인 선행 노트는 R001의 (261) 노트(positional parameter와 큰따옴표 `sh -c` 내부 `rm -rf`까지 확인을 확장)와 (273) 노트(bypass 모드 subshell 안의 `rm`)입니다. 관측한 범위에서 프로젝트 settings.json에는 `Bash(rm:*)` allow와 `defaultMode: bypassPermissions`(R010에 따라 2.1.257부터 프로젝트 scope에서는 무시됩니다)가 있고 `Bash(bash:*)`·`Bash(sh:*)` allow는 없으며, 유효 모드(사용자 scope)는 `auto`입니다. R001 문안 변경은 없고, 이 플랫폼 가드는 R001의 위임 전 blast-radius 열거를 대체하지 않습니다.
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
- `.claude/skills/claude-native/` — auto-generation source
- `.claude/rules/SHOULD-hud-statusline.md` — R012 statusline integration
- `.claude/rules/MUST-agent-design.md` — R006 agent frontmatter spec
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 bypassPermissions + /bg flow
- `guides/claude-code/14-token-efficiency.md` — token efficiency guide (관련: plugin details 활용)

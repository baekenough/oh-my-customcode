# Claude Code Version Compatibility

> Updated: 2026-05-15
> Source: Claude Code release notes (#967, #968, #969, #1126 auto-detected by claude-native skill, #1137, #1158)

## Compatibility Baseline

oh-my-customcode v0.107.0 targets Claude Code v2.1.116+. All v2.1.117-119 additions are backward-compatible — no config changes required.

## v2.1.117 (2026-04-22)

**Key changes relevant to oh-my-customcode:**

- `CLAUDE_CODE_FORK_SUBAGENT=1` enables forked subagents on external builds — relevant for R018 Agent Teams expansion
- Main-thread agent `mcpServers` frontmatter loading via `--agent` — broadens MCP integration scope (affects sys-memory-keeper, claude-mem users)
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

**oh-my-customcode 연관**: `claude-mem`, `ontology-rag` 등 MCP 서버 설정 변경 시 재시작 없이 적용 — 긴 세션 중단 없이 R011 메모리 통합을 재설정할 수 있습니다.

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

**oh-my-customcode 연관**: `claude-mem`, `ontology-rag` 등 원격 MCP 서버를 사용하는 R011/R019 연동에서 타임아웃 문제가 있었다면 이 변수로 해결 가능. 네트워크 지연이 큰 환경에서 MCP 도구 호출 실패율 감소 기대.

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

**oh-my-customcode 연관**: R010 `bypassPermissions` 맥락에서 중요한 개선. 이전에는 `/bg`로 에이전트를 분리하면 `bypassPermissions` 설정이 유실되어 unattended 실행 중 권한 프롬프트가 발생할 수 있었습니다. **v2.1.141+에서는 `/bg` 플로우에서 권한 모드 드롭이 더 이상 발생하지 않음** — R010 Universal bypassPermissions 규칙은 Agent tool 호출에 여전히 필요하지만, `/bg` 전환 시 추가 workaround 불필요.

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

| Version | oh-my-customcode action | Priority |
|---------|------------------------|----------|
| v2.1.117 | None (additive) | — |
| v2.1.118 | Evaluate hooks `type: mcp_tool` for R022/R011 | P3 follow-up |
| v2.1.119 | Audit `--print` CI with disallowedTools agents | P3 follow-up |
| v2.1.139 | None (additive). `/context all` fork skill 비용 모니터링 권장 | P3 follow-up |
| v2.1.140 | P3 audit: managed `extraKnownMarketplaces` 영속화 + plugin.json default folder 무시 경고 | P3 follow-up |
| v2.1.141 | P3: `terminalSequence` hook 검토 + cli-flags `--cwd` 추가. R010 `/bg` 권한 모드 유지 노트 추가 (완료) | P3 follow-up |
| v2.1.142 | Fast Mode Opus 4.7 전환 확인 (필요 시 `CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1`). `MCP_TOOL_TIMEOUT` 선택적 설정. | P3 follow-up |

## References

- #967 — Claude Code v2.1.117 release note
- #968 — Claude Code v2.1.118 release note
- #969 — Claude Code v2.1.119 release note
- #1126 — Claude Code v2.1.139 신규 명령 문서화
- #1134 — Claude Code v2.1.140 release note
- #1137 — Claude Code v2.1.141 compatibility documentation
- #1158 — Claude Code v2.1.142 compatibility documentation
- #1147 — .gitignore nested .md pattern limitation note
- `.claude/skills/claude-native/` — auto-generation source
- `.claude/rules/SHOULD-hud-statusline.md` — R012 statusline integration
- `.claude/rules/MUST-agent-design.md` — R006 agent frontmatter spec
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 bypassPermissions + /bg flow
- `guides/claude-code/14-token-efficiency.md` — token efficiency guide (관련: plugin details 활용)

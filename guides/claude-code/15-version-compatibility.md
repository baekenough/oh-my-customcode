# Claude Code Version Compatibility

> Updated: 2026-05-14
> Source: Claude Code release notes (#967, #968, #969, #1126 auto-detected by claude-native skill, #1137)

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

## Action Items Summary

| Version | oh-my-customcode action | Priority |
|---------|------------------------|----------|
| v2.1.117 | None (additive) | — |
| v2.1.118 | Evaluate hooks `type: mcp_tool` for R022/R011 | P3 follow-up |
| v2.1.119 | Audit `--print` CI with disallowedTools agents | P3 follow-up |
| v2.1.139 | None (additive). `/context all` fork skill 비용 모니터링 권장 | P3 follow-up |
| v2.1.140 | P3 audit: managed `extraKnownMarketplaces` 영속화 + plugin.json default folder 무시 경고 | P3 follow-up |
| v2.1.141 | P3: `terminalSequence` hook 검토 + cli-flags `--cwd` 추가. R010 `/bg` 권한 모드 유지 노트 추가 (완료) | P3 follow-up |

## References

- #967 — Claude Code v2.1.117 release note
- #968 — Claude Code v2.1.118 release note
- #969 — Claude Code v2.1.119 release note
- #1126 — Claude Code v2.1.139 신규 명령 문서화
- #1134 — Claude Code v2.1.140 release note
- #1137 — Claude Code v2.1.141 compatibility documentation
- `.claude/skills/claude-native/` — auto-generation source
- `.claude/rules/SHOULD-hud-statusline.md` — R012 statusline integration
- `.claude/rules/MUST-agent-design.md` — R006 agent frontmatter spec
- `.claude/rules/MUST-orchestrator-coordination.md` — R010 bypassPermissions + /bg flow
- `guides/claude-code/14-token-efficiency.md` — token efficiency guide (관련: plugin details 활용)

# Claude Code Version Compatibility

> Updated: 2026-05-12
> Source: Claude Code release notes (#967, #968, #969, #1126 auto-detected by claude-native skill)

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

---

## Action Items Summary

| Version | oh-my-customcode action | Priority |
|---------|------------------------|----------|
| v2.1.117 | None (additive) | — |
| v2.1.118 | Evaluate hooks `type: mcp_tool` for R022/R011 | P3 follow-up |
| v2.1.119 | Audit `--print` CI with disallowedTools agents | P3 follow-up |
| v2.1.139 | None (additive). `/context all` fork skill 비용 모니터링 권장 | P3 follow-up |
| v2.1.140 | P3 audit: managed `extraKnownMarketplaces` 영속화 + plugin.json default folder 무시 경고 | P3 follow-up |

## References

- #967 — Claude Code v2.1.117 release note
- #968 — Claude Code v2.1.118 release note
- #969 — Claude Code v2.1.119 release note
- #1126 — Claude Code v2.1.139 신규 명령 문서화
- #1134 — Claude Code v2.1.140 release note
- `.claude/skills/claude-native/` — auto-generation source
- `.claude/rules/SHOULD-hud-statusline.md` — R012 statusline integration
- `.claude/rules/MUST-agent-design.md` — R006 agent frontmatter spec
- `guides/claude-code/14-token-efficiency.md` — token efficiency guide (관련: plugin details 활용)

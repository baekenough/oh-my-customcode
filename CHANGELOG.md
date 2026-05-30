# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- R018 (MUST-agent-teams) strengthened: added decision-matrix guidance to prefer standalone parallel Agents over Agent Teams for mechanical disjoint-file refactoring; added "Member Completion Verification (deterministic ground-truth)" subsection (verify via git/grep/scripts, not SendMessage/TaskList; reassign stalled members after ~2min); added member prompt-size cap note. Closes #1261, #1262.

### Removed
- **`codex-exec`, `gemini-exec`, `agora` skills removed** (118 → 115 skills). `codex-exec` and `gemini-exec` are superseded by native plugin paths (`codex-plugin-cc`); `agora` multi-LLM debate skill retired. `/omcustom:agora` slash command removed from CLAUDE.md command table.

### Added
- `codex-plugin-cc` added to recommended plugins table in CLAUDE.md — native plugin replacement for the retired `codex-exec` skill.

## [0.158.0] - 2026-05-30

### Added
- `validate-docs` job in CI (ci.yml) — runs validate-docs.ts --programmatic-only as a blocking PR check, catching phantom slash-commands and count drift before merge instead of after tag creation. Fixes the gap that caused v0.157.0 to fail npm publish (#1258).

## [0.157.1] - 2026-05-29

### Fixed
- Clean publish after the v0.157.0 tag failed `release.yml` at `validate-docs` (phantom `/memory-save` / `/memory-recall` command rows in README + CLAUDE.md guides count `58`→`57`). v0.157.0 never reached npm; v0.157.1 is the published artifact carrying the full #1253 cleanup.

## [0.157.0] - 2026-05-29

### Removed
- **claude-mem and agentmemory MCP backends permanently removed** (#1253). This project now uses native auto memory ONLY (`memory/MEMORY.md` + agent frontmatter `memory:`). Deleted the `memory-recall`, `memory-save`, and `memory-management` skills (121 → 118 skills), the `agentmemory-migration` guide, and all claude-mem/agentmemory references across rules (R011), agents (sys-memory-keeper), ontology, profiles, hooks, guides, and wiki. The `.mcp.json` no longer registers either server.

### Changed
- R011 (SHOULD-memory-integration) rewritten to native-auto-memory-only
- sys-memory-keeper agent rewritten to native MEMORY.md maintenance only
- Removed `claude-mem@thedotmack` plugin from all 4 skill profiles
- Fixed pre-existing guides count drift (58 → 57) and stale ARCHITECTURE_ko/template counts

## [0.156.3] - 2026-05-29

### Changed
- R020 (`MUST-completion-verification`): added "Variant: Parallel Read + Permanent-Change Dispatch" subsection to the Diagnostic Hypothesis Verification section — prohibits running a diagnostic file Read and a permanent change (issue registration, fix dispatch) that depends on it in the same parallel batch, since results arrive together and the hypothesis gets locked in before the Read is seen (observed in #1250 triage-dispatch misdiagnosis)

## [0.156.2] - 2026-05-29

### Fixed
- `Issue Triage Dispatch` workflow (`.github/workflows/triage-dispatch.yml`) failed on every `issues` event because it added a non-existent `triaged` label under `set -euo pipefail`, and called a non-existent `omcustom triage` CLI. Now creates the `triaged` label idempotently, removes the phantom CLI call, and de-duplicates the comment/label steps (#1251)

## [0.156.1] - 2026-05-29

### Changed
- Synced wiki page `wiki/guides/claude-code.md` with the v2.1.152–v2.1.156 compatibility entries and the Known Platform Issues & Workarounds section added in v0.156.0 (#1248)

## [0.156.0] - 2026-05-29

### Added
- Repo-internal `cc-release-monitor` GitHub Actions workflow that auto-creates Claude Code release tracking issues — replaces the deprecated external Airflow DAG that stopped after v2.1.150 (#1246)
- Claude Code v2.1.152–v2.1.156 version-compatibility documentation (#1242 #1243 #1244 #1245)
- "Known Platform Issues & Workarounds" section documenting the Agent tool malformed-parsing workaround for long/special-character delegation prompts (#1241)

### Changed
- claude-native skill: fixed issue title convention to `Claude Code v{version}` and dedup search pattern so it no longer creates duplicates; added non-contiguous patch-number note (#1246)
- Bumped @anthropic-ai/sdk dev dependency 0.97.1 → 0.98.0 (#1240)

## [0.151.1] - 2026-05-24

### Fixed — Maintenance 패치 (#1222 #1223)
- `.claude/skills/intent-detection/patterns/agent-triggers.yaml`: dead `skill-simplify` 라우팅 엔트리를 `skill-dev-refactor`로 교체 — CC v2.1.147에서 `/simplify`→`/code-review` 개명에 따라 존재하지 않는 `simplify` 스킬 라우팅을 실존하는 `dev-refactor` 스킬로 redirect (#1222)
- `wiki/index.yaml`: 미인덱싱 콘텐츠 페이지 3개 추가 (`guides/agent-workflow`, `guides/multi-provider-exec`, `skills/profile`), `meta.total_pages` 271로 정합, GitHub Wiki 네비게이션 페이지 제외 기준 주석 명시 (#1223)

### Maintenance
- Leftover worktree 정리 (#1224) — 로컬 정리, 릴리즈 산출물 없음

## [0.151.0] - 2026-05-24

### Added — CC v2.1.147–v2.1.150 호환성 문서화 (#1216 #1218 #1219 #1220)
- `guides/claude-code/15-version-compatibility.md`: CC v2.1.147–v2.1.150 호환성 섹션
  - v2.1.147: `Workflow` 도구(`CLAUDE_CODE_WORKFLOWS=1`) 도입, `/simplify`→`/code-review` 슬래시 커맨드 개명, plugin agent 복수 `Agent()` 타입 fix (#1216)
  - v2.1.148: Bash 도구 exit 127 regression 수정 (#1218)
  - v2.1.149: `/usage` per-category breakdown, GFM 체크박스 지원, worktree sandbox fix, `find` macOS crash fix (#1219)
  - v2.1.150: 내부 인프라 개선만, 별도 조치 불필요 (#1220)

### Changed — 룰 강화 (#1217)
- R020 (`MUST-completion-verification`): `Diagnostic Hypothesis Verification` 섹션 추가 — 진단 가설을 영구 변경 전 검증 (npm publish E403 오진단 재발 방지)
- R020 (`MUST-completion-verification`): `Test-Skip Is Not Completion` 섹션 추가 — 테스트 skip + threshold 하향 회피 금지
- R017 (`MUST-sync-verification`): `Structural Migration Verification` 섹션 추가 — 디렉토리 재구조화·템플릿 평탄화·브랜치 전략 변경 시 경로/존재성 회귀 사전 검사

## [0.150.1] - 2026-05-21

### Added
- `src/core/installer.ts` `installTestsConfig` function — auto-copy `templates/tests/tsconfig.json` to new projects (#1213)
- 4 new test cases in `tests/unit/core/installer.test.ts`

## [0.150.0] - 2026-05-21

### Added — R010/R015 강화 + tsconfig template + investigation memos (#1208 #1210 #1211 #1212)
- R010 (`MUST-orchestrator-coordination`): Root Meta-File Delegation table — #1208
- R015 (`MUST-intent-transparency`): Git Push Continuation section — #1208
- `templates/tests/tsconfig.json` — #1211
- `guides/agent-teams/troubleshooting.md` — #1210
- `guides/claude-code-tracking.md` — #1212
- Memory: feedback_agent_teams_force_shutdown, feedback_background_agent_progress_tracking

### Changed
- Counts: guides 57 → 58
- Templates synced (templates/guides/agent-teams + templates/guides/claude-code-tracking)
- Wiki synced (wiki/guides/agent-teams.md + index.yaml 286 pages)

## [0.149.0] - 2026-05-21

### Added — 룰 강화 + CC v2.1.146 + claude-mem hook (#1205 #1206 #1207)
- R018 (`MUST-agent-teams`): Self-Check #0 user explicit subagent preference (R000 > R018) — #1206 item #1
- R011 (`SHOULD-memory-integration`): Session-End Self-Check에 omcustom-feedback 권유 (3 places) — #1206 item #3
- R016 (`MUST-continuous-improvement`): Anti-Pattern 5번째 row — calibration during action-oriented tone — #1206 item #4
- `.claude/hooks/scripts/plugin-cache-check.sh`: plugin cache `node_modules` 누락 SessionStart advisory hook (비차단, exit 0) — #1207
- `guides/claude-code/15-version-compatibility.md`: CC v2.1.146 호환성 섹션 — #1205

### Changed
- 룰 3건 + 1 hook 신규 등록 + templates/ 동기화

### Memory
- feedback_r010_root_metafile_exception_rejected (신규): R010 약화 제안 거부 — #1206 item #6
- feedback_plugin_node_modules_missing: v0.149.0/#1207 자동 감지 hook note append

## [0.148.0] - 2026-05-20

### Added — CC v2.1.145 follow-up
- statusline.sh: native `gh.repo` / `gh.pr_number` / `gh.pr_state` segment (#1197)
- statusline.sh: `claude agents --json` 활용 active agents count segment `A:N` (#1195)
- session-reflection.sh: Stop hook input `background_tasks` / `session_crons` 활용 Phase 2 (#1196)

### Changed
- CHANGELOG #1166 entry: `[Unreleased]` → v0.145.0 Added 섹션으로 이동 (#1194)

### Sync — Wiki (R022)
- wiki/skills/systematic-debugging.md: Phase 0-7 구조 + Hard Gates 반영
- wiki/guides/claude-code.md: v2.1.143 / v2.1.144 / v2.1.145 Action Items + 신규 섹션 추가

## [0.147.0] - 2026-05-20

### Added — 룰 강화 (#1188 / #1198 / #1202)
- R000 (`MUST-language-policy`): Honorific Level 섹션 — 합쇼체 강제, 비격식 회귀 anti-pattern 표
- R007 (`MUST-agent-identification`): Short Response Discipline — 짧은 응답에서도 헤더 강제
- R008 (`MUST-tool-identification`): Short Response Discipline — 짧은 응답에서도 도구 prefix 강제
- R010 (`MUST-orchestrator-coordination`): Agent Capability Pre-Check — disallowedTools 사전 점검 + arch-documenter Bash 정책 캐시
- R015 (`MUST-intent-transparency`): Failed Tool Re-Try Discipline — directive persistence 강화
- R016 (`MUST-continuous-improvement`): External Repo Contribution Pre-Check — CONTRIBUTING/AGENTS 사전 점검 의무화 + Defect Matrix row 추가
- R020 (`MUST-completion-verification`): Interrupt Priority Re-Ordering — 인터럽트 시 plan 재정렬 의무화
- `output-styles/korean-engineer.md`: 격식 수준 섹션 (합쇼체 기본)

### Added — Memory (6건 신규)
- `feedback_korean_honorific_regression.md` — 한국어 경어 회귀 방지
- `feedback_short_response_identification_skip.md` — 짧은 응답 식별 헤더 누락 방지
- `feedback_external_repo_convention_lateread.md` — 외부 저장소 컨벤션 사전 확인
- `feedback_arch_documenter_bash_precheck.md` — arch-documenter Bash 권한 사전 점검
- `feedback_interrupt_priority_reorder_skip.md` — 인터럽트 시 plan 재정렬
- `feedback_directive_persistence_break.md` — directive persistence 강화

### Sync — Wiki (R022)
- `wiki/rules/{r000,r007,r008,r010,r015,r016,r020}.md` updated to match source rules

### Fixed
- R010 (`MUST-orchestrator-coordination`): feedback memory 파일명 오타 1건 수정

## [0.146.0] - 2026-05-20

### Added
- 신규 hook `session-reflection.sh` (Stop hook, Phase 1 MVP) — transcript JSONL을 백그라운드 분석하여 R007 (헤더 누락) / R008 (도구 prefix 누락) 위반을 탐지하고 `.claude/outputs/reflections/{date}.md` 에 로컬 로그 작성 (#1190 Phase 1)
- `OMCUSTOM_SESSION_REFLECTION=off` opt-out 환경변수
- `OMCUSTOM_TRANSCRIPT_BASE` / `OMCUSTOM_PROJECT_ROOT` 테스트 격리용 override 환경변수
- 신규 hook 테스트 14건 (`tests/unit/core/session-reflection.test.ts`) — clean / R007 / R008 / opt-out / sample cap / 백그라운드 안정성 fixture 커버
- Hooks 등록: `.claude/hooks/hooks.json` Stop matcher에 session-reflection.sh 추가 (+ templates/ 동기화)

### Changed
- Total hooks count 35 → 36, hook matchers 51 → 52 (template-sync manifest 자동 갱신)

### Investigated
- nohup + glob expansion shell escape 충돌 발견 — worker script를 /tmp 에 분리 생성하는 패턴으로 우회 (mgr-creator 디버깅 노트)

## [0.145.0] - 2026-05-20

### Added
- `systematic-debugging` 스킬 확장: `phases/` 디렉토리에 4개 신규 파일 추가 — `timeline-correlation.md`, `retry-cache-timeout-audit.md`, `amplification-detection.md`, `fault-injection.md`. dev.to "10 Debugging Habits as Prompts" 글에서 신규 가치 항목 4개 (timeline / retry·cache·timeout audit / amplification / fault injection)을 internalize (#1189)
- `systematic-debugging` Hard Gate #7 신설: retry/cache/timeout 변경 시 false-fix 가능성 점검 의무화 (#1189)
- `guides/claude-code/15-version-compatibility.md`에 Claude Code v2.1.143 compatibility guide update 및 templates 동기화 (#1166)
- `guides/claude-code/15-version-compatibility.md`에 Claude Code v2.1.144 / v2.1.145 호환성 노트 + 평가 테이블 + follow-up 후보 3건 (#1187, #1191)
- Action Items Summary 테이블에 v2.1.143 / v2.1.144 / v2.1.145 행 추가

### Changed
- R015 (`MUST-intent-transparency.md`): User Directive Persistence 강화 — Cycle Start Self-Check 3-question mandatory 격상, AskUserQuestion 거절 → free-text 재질문 금지 anti-pattern 추가 (#1188 item #4)
- R020 (`MUST-completion-verification.md`): Task-Type Completion Matrix에 `UI/Frontend` row 추가 — browser render verified + visual diff 필수, type-check 단독 불충분 명시; Common False Completion Patterns에 "UI changes done" / "CSS updated" anti-pattern 추가 (#1188 item #6)
- Wiki sync 부분 갱신: `wiki/rules/r015.md`, `wiki/rules/r020.md` 본 사이클 변경 반영; `wiki/index.yaml` `counts.guides` 드리프트 수정 (63 → 64)

### Investigated
- #1188 (8건 세션 회고) 중 2건만 본 릴리스에서 rule update로 internalize. 나머지 6건은 R016 corpus로 #1188 issue open 유지 (#1190 session-reflection hook의 테스트 corpus 역할)
- New `destructive-git-guard.sh` Bash PreToolUse hook in source/templates: advisory warnings for `git reset --hard`, `git clean -fd/-fdx`, broad `git restore`, `git checkout -- .`, and `git branch -D`, with reflog recovery guidance (#1150).
- New autonomous challenge lessons guide for ground-truth artifact checks, repeated tool-denial avoidance, launcher error discipline, and QA evidence quoting (#1149).

### Changed
- `qa-engineer` now requires code-grep/read evidence before citing selectors, identifiers, mappings, or CLI flags in QA reports (#1149).
- Template manifest/README guide and hook counts updated for the new autonomous challenge guide and destructive git guard hook.

## [0.138.0] - 2026-05-15

### Added
- 신규 `.claude/skills/pipeline/labels.md` — 파이프라인 라벨 의미 표준 정의 (`verify-ready`, `verify-done`, `in-progress`, `needs-review`, `decision-needed`, `automated`, `claude-code-release`, `documentation` semantics) (#1161 G4)
- 신규 `templates/README.md` — `omcustom init` distribution 구조 + 컴포넌트 카운트 heading (Agents 49, Skills 117, Rules 22, Guides 50, Hooks 34) (#1157)
- `.github/workflows/auto-tag.yml`에 milestone auto-close step 추가 — release PR merge 후 마일스톤 open_issues == 0이면 자동 close (#1163)

### Changed
- `/pipeline auto-dev` 강화 (#1161 G3~G7):
  - **G3**: scope-selection에 closed milestone re-use pre-check 추가 — `gh api .../milestones?state=all`로 state별 분기 처리 (closed → halt + bump 권고, open → 그대로 사용)
  - **G4**: labels.md 표준 참조 + 필터 로직 명시 (`verify-ready` preferred, `verify-done`/`needs-review`/`decision-needed` exclude)
  - **G5**: pre-triage Phase 0에 본문 vX.Y.Z 참조 vs git tag 일치 검증 추가 (warning only, do not halt)
  - **G6**: compression_mode 분기 명문화 — scope size ≤ 3 + docs/automated/claude-code-release labels → triage/plan/deep-plan/deep-verify 압축 모드
  - **G7**: pre-triage Phase 0에 메모리 vs git latest tag 일치 비교 추가 (advisory only; hook 자동 감지는 future scope)
- 위키 동기화 (#1164):
  - `wiki/skills/pipeline.md` — auto-dev Phase 0 Sync + verify-build bun test 변경 반영
  - `wiki/guides/claude-code.md` — v2.1.142 섹션 + Known Limitations 반영
  - `wiki/agents/mgr-gitnerd.md` — rustup symlink 교훈 학습 반영

### Maintenance
- Templates 동기화: `templates/.claude/skills/pipeline/workflows/auto-dev.yaml`, `templates/.claude/skills/pipeline/labels.md`
- Agent Teams (`v0138-release`) 사용 — 4 멤버 병렬 (workflow-engineer, wiki-engineer, skill-engineer, readme-writer)
- /pipeline auto-dev G1 (#1159) 자기-개량 검증 — release/v0.137.0 stale ref 자동 cleanup 확인됨

## [0.137.0] - 2026-05-15

### Added
- CC v2.1.142 호환성 가이드 추가 to `guides/claude-code/15-version-compatibility.md` (#1158)
  - 신규 `claude agents` 플래그 8종 인벤토리 (`--add-dir`, `--settings`, `--mcp-config`, `--plugin-dir`, `--permission-mode`, `--model`, `--effort`, `--dangerously-skip-permissions`)
  - Fast mode 기본 모델 Opus 4.7 변경 (`CLAUDE_CODE_OPUS_4_6_FAST_MODE_OVERRIDE=1`로 4.6 고정 가능)
  - Plugin root-level SKILL.md 지원 — omcustom의 `.claude/skills/<name>/SKILL.md` 패턴 영향 없음
  - `MCP_TOOL_TIMEOUT` fix, BG sessions/macOS sleep 회복, daemon 업그레이드 fix 등 인벤토리
- Known Limitations 섹션 추가 to `guides/claude-code/15-version-compatibility.md` (#1147)
  - `.gitignore` `docs/superpowers/plans/*` + `!*.md` 패턴이 nested 디렉토리 미지원 — 현재 영향 없음 (release-plan은 flat path 사용), future-proof reference
- `mgr-gitnerd` agent-memory에 rustup symlink-multiplexer 교훈 학습 데이터 추가 (#1148)
  - `cargo` → `rustup-init` symlink는 정상 (argv[0]-based multiplexer), cache poisoning 아님
  - 올바른 검출 방법: 기능 검증 (`cargo --list | grep test`), 바이너리 식별이 아님
  - 참조: v0.136.0 PR #1143 첫 CI 실패 (commit 7709cab) → fix 7046b95

### Changed
- `/pipeline auto-dev` 강화 (#1159):
  - `pre-triage` step prompt에 Phase 0 Sync 추가 — `git fetch --all --tags --prune` + `behind` 검출 + clean → `git pull --ff-only`, dirty → halt + tag/HEAD 보고
  - 메모리/이슈 본문 stale version 참조 즉시 감지 가능
- `/pipeline auto-dev` 강화 (#1160):
  - `verify-build` step prompt 재작성 — `bun test` MANDATORY (silent skip 차단)
  - Baseline delta 가드: `current FAIL > baseline → halt`, 동적 baseline 채택 (hardcoded 숫자 회피)

### Fixed
- #1156 test-debt 86 pre-existing failures가 v0.136.2 fixes 과정에서 사실상 해소 — 현재 `bun test` 결과 1945 pass / 0 fail. Baseline은 dynamic 채택으로 전환됨 (#1160 정책).

### Maintenance
- Templates 동기화: `templates/guides/claude-code/15-version-compatibility.md` + `templates/.claude/skills/pipeline/workflows/auto-dev.yaml`
- Agent Teams (`v0137-release`) 사용 — 3 멤버 병렬 (docs-writer, memory-writer, skill-enhancer)

## [0.136.2] - 2026-05-15

### Fixed
- **#1154** /pipeline auto-dev release 단계가 `package.json` 및 `templates/manifest.json` version bump를 명시하지 않아 npm publish E403이 발생하던 회귀를 차단 — auto-dev.yaml release prompt에 atomic bump 절차 + `scripts/verify-version-sync.sh` 의무 호출 추가 (mgr-updater 위임 경계 명시)
- **#1155** `verify-template-sync.sh`에 `manifest.json` components[name=guides].files vs 실제 `guides/*/` 디렉토리 카운트 일치 검사 추가 (jq graceful skip)
- **#1144** `templates/.claude/skills/pipeline/workflows/auto-dev.yaml`의 Sensitive Path Handling 섹션이 deprecated `/tmp/*.sh` 패턴이던 것을 source와 1:1 sync (CC v2.1.121+ `bypassPermissions` 패턴)
- **#1145** `wiki/index.yaml` 카운트 드리프트 정정 — `total_pages` 265→268, `counts.skills` 116→117, `counts.rules` 22 추가 + `verify-wiki-sync.sh`에 카운트 일치 검사 추가 (grep/awk fallback, yq 비의존성)
- **#1152** `CONTRIBUTING.md` Prerequisites 섹션 추가 — jq/gh/bun/yq 설치 안내. hook 본체 (`git-delegation-guard.sh:13`)는 이미 graceful skip 적용됨

### Added
- `scripts/verify-version-sync.sh` — `package.json` ↔ `templates/manifest.json` 버전 일치 검증 (jq 미설치 시 warning + skip, mismatch 시 exit 1)
- `CONTRIBUTING.md`에 Prerequisites 섹션 — jq/gh/bun/yq 권장 도구 설치 가이드

### Changed
- `.claude/skills/pipeline/workflows/auto-dev.yaml` release step — mgr-updater 위임 경계 명시, atomic same-dir tmp 패턴, `verify-version-sync.sh` existence guard 적용
- `.github/scripts/verify-template-sync.sh` — Manifest Guides Count Consistency 섹션 +22 lines
- `.github/scripts/verify-wiki-sync.sh` — Wiki Index Count Consistency 섹션 +54 lines (yq 의존성 없는 grep/awk 구현)
- `wiki/index.yaml` — total_pages 268, counts.skills 117, counts.rules 22 추가, updated 2026-05-15

### Maintenance
- deep-verify Round 5: 4 MEDIUM + 2 LOW findings 일괄 fix (cross-device mv → same-dir tmp, delegation boundary 명시, yq 불필요 안내 정정, grep robustness)

## [0.136.1] - 2026-05-15

### Fixed
- 파괴적 git 명령 가드 강화 (#1146): R001 MUST-safety.md에 "Destructive Git Commands" 섹션 신규 추가 — `git reset --hard`, `git checkout -- <path>`, `git clean -fd`, `git branch -D`, `git push --force` 5종 명령에 대해 위험도와 필수 조치를 명시
- mgr-gitnerd 에이전트 Safety Rules 4개 → 9개 불릿으로 확장, git reflog 복구 패턴 추가

### Added
- 신규 가이드 — Git Safety (`guides/git-safety/README.md`): 위험 명령 빠른 참조표, pre-flight 체크 패턴, 복구 절차, AI 에이전트 자율 흐름용 안전 규칙 포함

### Maintenance
- `agent-memory/mgr-gitnerd/MEMORY.md` 및 `agent-memory/mgr-sauron/MEMORY.md` 학습 데이터 추가
- Templates / Wiki sync: rules, agent, guide 변경분 동기화, wiki/index.yaml에 git-safety 등록
- #1150 (destructive-git-guard.sh PreToolUse hook) 다음 릴리즈로 이월

## [0.135.0] - 2026-05-14

### Added
- CC v2.1.141 호환성 가이드 추가 to `guides/claude-code/15-version-compatibility.md` (#1137)
  - `terminalSequence` 훅 필드 — R012 HUD 보완, P3 창 제목 hook 검토 권고
  - `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` 환경 변수 — CI/기업 방화벽 환경 플러그인 설치
  - `ANTHROPIC_WORKSPACE_ID` 환경 변수 — 워크로드 아이덴티티 federation workspace 스코핑
  - `claude agents --cwd <path>` — 디렉토리 스코프 세션 목록, P3 cli-flags 가이드 업데이트 권고
  - `/bg` 백그라운드 에이전트 권한 모드 유지 — R010 규칙 문서에 노트 추가
  - 기타 additive 변경 (Rewind summarize, `/feedback` 세션 범위, auto mode 다이얼로그, IDE diff 복원, `claude agents` 상태 수정)
- R010 `MUST-orchestrator-coordination.md` — `/bg` 권한 모드 유지 노트 추가 (CC v2.1.141+)
- R006 `MUST-agent-design.md` — v2.1.141 버전 호환성 히스토리 항목 추가
- R012 `SHOULD-hud-statusline.md` — `terminalSequence` 필드 참조 추가

### Maintenance
- Claude Code v2.1.141 release reviewed (#1137)

## [0.134.0] - 2026-05-13

### Added
- CC v2.1.140 호환성 가이드 추가 to `guides/claude-code/15-version-compatibility.md` (#1134)
  - Agent tool `subagent_type` 매칭 완화 (case-/separator-insensitive) — strict kebab-case 유지 정책으로 영향 없음
  - `/goal` hanging fix — `omcustom:goal` namespace 별개, 영향 없음
  - Settings/BG/Read tool/Plugin/`/loop` 안정성 fix 인벤토리
  - Managed `extraKnownMarketplaces` 영속화 + Plugins default component folder 무시 경고 — P3 audit 권고 (별도 release)

### Maintenance
- Claude Code v2.1.140 release reviewed (#1134)

## [0.133.0] - 2026-05-13

### Added
- R021 Enforcement Tiers에 `Conversation Block` tier 추가 — PostToolUse hook + `continueOnBlock` (CC v2.1.139+) 패턴 문서화 (#1125)
- `continueOnBlock: true` 적용 to 3 PostToolUse advisory hooks:
  - `stuck-detector.sh` — HARD_BLOCK_THRESHOLD 도달 시 stderr-only → conversation feedback (exit 2)
  - `context-budget-advisor.sh` — task-type threshold 도달 시 ecomode 활성화 신호 (R013 통합)
  - `cost-cap-advisor.sh` — cost cap 100% 도달 시 wrap-up 신호

### Changed
- `stuck-detector.sh` hard block exit code: `exit 1` → `exit 2` (CC hook rejection 규약 정렬, continueOnBlock 페어링)

### Investigated
- Hook `args: string[]` exec form 마이그레이션 검토 (#1124): 현재 hooks.json은 jq 추출 패턴으로 path-safety 모범 사례 준수 — 마이그레이션 실효 후보 ZERO. 신규 hook 작성 가이드라인만 향후 추가 권고.

## [0.132.0] - 2026-05-12

### Added
- Web UI guides browser routes — `/guides` 목록(검색·정렬) + `/guides/[name]` 상세 페이지. 기존 skill/guide creation 페이지(#469) 패턴과 일관 (`packages/serve/src/routes/guides/`)

## [0.131.0] - 2026-05-12

> Note: v0.130.0 was published to npm from a stale `release` branch (containing the backfill_changelog work below). v0.131.0 unifies that lost work with the planned /goal rename + CC v2.1.139 docs work that was only on develop.

### Changed
- `goal` 스킬을 `omcustom:goal` namespace로 rename — CC v2.1.139 네이티브 `/goal` 명령과의 슬래시 라우팅 shadowing 해소 (#1123)

### Added
- CC v2.1.139 신규 명령 (`claude agents`, `/scroll-speed`, `claude plugin details`, `/mcp` reconnect 개선, transcript navigation, `/context all` 정확도 개선) 온보딩 가이드 추가 to `guides/claude-code/15-version-compatibility.md` (#1126)

### Fixed
- `scripts/backfill_changelog.py` robustness (H1 + M1-M3 + L1-L4) (#1116)
- CHANGELOG.md backfill cosmetic polish (M1 + L1-L2) (#1117)

### Maintenance
- Claude Code v2.1.136 reviewed (#1118)
- Claude Code v2.1.137 reviewed (#1119)
- Claude Code v2.1.138 reviewed (#1120)
- `.gitignore` cleanup — agent-memory, caches, plugin artifacts (#1128)

### Dependencies
- @anthropic-ai/sdk: 0.92.0 → 0.95.2 (dev dependency, dependabot #1121)

## [0.130.0] - 2026-05-12

> Note: Published to npm from a stale `release` branch before develop merge. Content superseded by v0.131.0.

### Fixed

- **scripts/backfill_changelog.py robustness** (#1116)
  - `_get_release_date` git fallback wrapped in try/except CalledProcessError — no more uncaught traceback on bad tags / detached HEAD / empty repo
  - Unified non-semver tag sentinel to `(-1,-1,-1)` across `sort_tags_semver` and `_tags_in_range._semver` — pre-release tags like `v1.0.0-rc1` no longer leak into ranges unexpectedly
  - gh jq null-string guard before recording `publishedAt`
  - Empty `start_tag` validation in `main()` (no more silent `(0,0,0)` fallback)
  - Python idioms: tuple-direct `startswith`, single-element tuple removal, bare annotation cleanup
- **CHANGELOG.md backfill cosmetic polish** (#1117)
  - `_RELEASE_PREP_RE` filters noise commits like "bump version to X.Y.Z" and "vX.Y.Z plan"
  - `extract_issue_refs` deduplicates PR refs (`(#1083) (#1083)` → `#1083`)
  - `_looks_like_addition` heuristic classifies "add"/"introduce" prefixed commits as `### Added` instead of `### Changed`

### Maintenance

- Claude Code v2.1.136 release reviewed (#1118) — no oh-my-customcode changes required
- Claude Code v2.1.137 release reviewed (#1119) — no oh-my-customcode changes required
- Claude Code v2.1.138 release reviewed (#1120) — no oh-my-customcode changes required

### Tests

- 57 unittest cases all pass (`tests/scripts/test_backfill_changelog.py`)
- New test classes: `TestGetReleaseDate`, `TestMainRangeValidation`
- Expanded coverage: `TestExtractIssueRefs`, `TestParseCommit`, `TestSortTagsSemver`

## [0.129.0] - 2026-05-08

### Changed
- CHANGELOG.md historical backfill v0.36.0..v0.127.0 (#1111, #1115)

## [0.128.0] - 2026-05-08

### Changed
- forward-looking CHANGELOG [Unreleased] policy (#1113, #1114)

## [0.127.0] - 2026-05-08

### Changed
- add /goal thin wrapper skill (#1109, #1110)

## [0.126.1] - 2026-05-07

### Changed
- CC tracking issues consolidation (#1104, #1105, #1106, #1107)

## [0.126.0] - 2026-05-02

### Changed
- R010 /tmp deprecation + manifest sync gate (#1098, #1101, #1099, #1102)
- deps(dev)(deps-dev): bump @anthropic-ai/sdk from 0.90.0 to 0.92.0 in the development-dependencies group across 1 directory (#1083) (#1083)

## [0.125.1] - 2026-05-01

### Changed
- sync templates/manifest.json

## [0.125.0] - 2026-05-01

### Changed
- bump version to 0.125.0
- v0.125.0 plan + permissions.defaultMode
- regenerate architecture diagrams via Eraser MCP for v0.124.0 (#1092)

### Fixed
- R007/R008 multi-turn self-check + enforcement candidate
- arch-documenter Output Constraints + R018 TaskUpdate discipline

## [0.124.0] - 2026-04-28

### Changed
- single-agent giant prompt anti-pattern (R009/R018) + arch-documenter token threshold (#1086)

## [0.123.0] - 2026-04-27

### Changed
- memory MCP server + skill profile loader (#1079, #1080)

## [0.122.0] - 2026-04-27

### Changed
- memory persistence service (#1077)

## [0.121.0] - 2026-04-27

### Changed
- memory aggregation + dedup layer (#1073)

## [0.120.0] - 2026-04-27

### Changed
- memory unification adapters (#1070, #1071, #1072)

## [0.119.0] - 2026-04-27

### Changed
- OTEL trajectory mode + memory_records table (#1035, #1069)

## [0.118.3] - 2026-04-27

### Changed
- memory unification docs (#1065, #1066, #1067)

## [0.118.2] - 2026-04-27

### Changed
- manager/system agent inline /tmp directive (#1062)

## [0.118.1] - 2026-04-27

### Changed
- wiki sync + R006 skills advisory note ( follow-up) (#1055, #1063)

## [0.118.0] - 2026-04-27

### Changed
- init auto-setup + fork skill split + token observability (#1048, #1054, #1057, #1060)

## [0.117.0] - 2026-04-27

### Changed
- context optimization batch (#1045, #1053, #1056)

## [0.116.2] - 2026-04-27

### Changed
- universal /tmp script bypass directive (#1052, #1058)

## [0.116.1] - 2026-04-27

### Added
- trigger Airflow issue_triage DAG on issue open (#1049)

### Changed
- fix delegation chain sensitive-path directive loss (#1043, #1046)

## [0.116.0] - 2026-04-27

### Changed
- eval-core schema 확장 (drizzle migration, ) (#1036)

## [0.115.0] - 2026-04-26

### Changed
- LangChain harness/middleware 통합 가이드 (#1021, #1022, #1024, #1026)

## [0.114.0] - 2026-04-26

### Changed
- R020 정량 evidence advisory + Phased Opt-in Gate 일관화 + 클러스터 정리

## [0.113.0] - 2026-04-26

### Changed
- agent-eval-framework 4-metric internalization (#1025)

## [0.112.0] - 2026-04-25

### Changed
- Codex Browser Verify 루프 패턴 (#1009)

## [0.111.1] - 2026-04-25

### Changed
- v0.111.1 hotfix — Write→/tmp NOTE 정정 (#1016)

## [0.111.0] - 2026-04-25

### Changed
- sensitive-path Write-tool directive 강제 (#1014)

## [0.110.0] - 2026-04-25

### Changed
- Output Styles + roundtable-debate anti-groupthink 패턴 (#1003, #1007)

## [0.109.0] - 2026-04-24

### Changed
- auto-dev /tmp bypass pattern + R006 fork cross-validation (#1000, #1001)

### Fixed
- resolve context fork cap documentation drift (#984)

## [0.108.0] - 2026-04-24

### Changed
- 5 P3 bundle: ontology/harness/socratic/sample/google (#993, #994, #986, #975, #971)

## [0.107.0] - 2026-04-24

### Changed
- R006 refactor + PAL analysis + CI/docs batch (#982, #989, #990, #991, #992, #967, #968, #969)

## [0.106.1] - 2026-04-24

### Changed
- sdd-dev DR template +  tracker-checkpoint agent (#985, #983)

## [0.106.0] - 2026-04-24

### Changed
- caveman plugin docs +  ouroboros Ralph Loop guide (#964, #966)

## [0.105.1] - 2026-04-24

### Changed
- R006 sensitive-path scope extension to Write/Edit tools (#981)

### Fixed
- correct r006 broken cross-ref and ambiguous wording

## [0.105.0] - 2026-04-24

### Changed
- Deep Insight 내재화 + 경량 외부 통합 묶음 (#963, #970, #972, #973, #974, #976, #977, #980)

## [0.104.1] - 2026-04-24

### Changed
- skill mkdir sensitive-path rule fix + regression guard (#978)

## [0.104.0] - 2026-04-21

### Changed
- CC v2.1.116 compatibility + .claude/ sensitive path fix (#959, #960, #961)
- sync bun lockfile for @anthropic-ai/sdk 0.90.0
- deps(dev)(deps-dev): bump @anthropic-ai/sdk

## [0.103.0] - 2026-04-20

### Changed
- tech stack version updates + bypassPermissions universal mandate (#954, #955)

## [0.102.0] - 2026-04-19

### Changed
- playwright-compress skill + product-strategy skill + design-shotgun skill + browser-automation guide (#949, #948)

## [0.101.0] - 2026-04-19

### Changed
- routing accuracy improvement with skill/guide triggers and wiki-rag enrichment (#946)

## [0.100.1] - 2026-04-19

### Changed
- bypassPermissions propagation fix (#947)

## [0.100.0] - 2026-04-19

### Changed
- token-efficiency-audit skill + pre-generation-arch-check skill + DCP pruning transparency (#938, #935)

## [0.99.3] - 2026-04-19

### Changed
- claude-design wiki page fix

### Fixed
- add claude-design guide wiki page

## [0.99.2] - 2026-04-18

### Changed
- statusline fix + cleanRegistry + Claude Design guide (#931, #928, #924)

## [0.99.1] - 2026-04-18

### Changed
- bypassPermissions enforcement + /idea skill (#926, #930)

### Fixed
- update skill count 106→107 in README and README_ko
- enforce bypassPermissions on all agent spawns, add /idea skill

## [0.99.0] - 2026-04-18

### Changed
- auto-dev pipeline CI-mimic local verification (#927)

## [0.98.0] - 2026-04-18

### Changed
- OpenHarness patterns internalization (#922)

### Fixed
- correct template sync paths for hooks

## [0.97.1] - 2026-04-18

### Added
- add hada-scout v2.0 with LLM pre-scout filtering

### Changed
- hada-scout v2.0 LLM pre-scout filtering (#912)

## [0.97.0] - 2026-04-18

### Changed
- ouroboros capability graph pattern integration (#909, #910)

## [0.96.0] - 2026-04-18

### Changed
- CC v2.1.113-v2.1.114 호환성 문서화 (#905)

## [0.95.0] - 2026-04-18

### Changed
- rules context token optimization (#889)

## [0.94.0] - 2026-04-18

### Changed
- cc-release-monitor workflow removal (Airflow DAG migration) (#894)

## [0.93.0] - 2026-04-18

### Changed
- Airflow 3.1.8 에이전트/스킬/가이드 업데이트 (#890)

## [0.92.0] - 2026-04-18

### Changed
- cc-token-saver integration + harness-synthesizer skill (#886, #888)

## [0.91.0] - 2026-04-17

### Changed
- CC v2.1.111-v2.1.112 compat (#881)

## [0.90.0] - 2026-04-16

### Changed
- CC v2.1.110 compat (#877)

## [0.89.0] - 2026-04-15

### Changed
- CC v2.1.97-v2.1.108 compat (#871)

## [0.88.1] - 2026-04-14

### Changed
- Rule safety expansion  (R020/R015/R011) (#869, #867)

## [0.88.0] - 2026-04-14

### Changed
- registry 격리  + re-exec 후속 번들 (#859, #867, #868)

## [0.87.3] - 2026-04-14

### Fixed
- omcustom update self-update + re-exec 클러스터 v0.87.3 (#862, #863, #864, #865, #866)

## [0.87.2] - 2026-04-14

### Fixed
- omcustom update --all --hard 핫픽스 v0.87.2 (#860, #861)

## [0.87.1] - 2026-04-14

_No user-visible changes (internal only)._

## [0.87.0] - 2026-04-14

### Changed
- Claude Code v2.1.105 feature docs (#856)

## [0.86.1] - 2026-04-13

### Added
- add skill-count-sync advisory hook (#853)

### Changed
- deps update + skill-count-sync hook
- regenerate bun.lock for marked 18.0.0
- regenerate bun.lock for @anthropic-ai/sdk 0.88.0
- deps(dev)(deps-dev): bump @anthropic-ai/sdk
- bump marked from 17.0.6 to 18.0.0

### Fixed
- sync skill-count-reminder hook to templates/.claude/hooks/

## [0.86.0] - 2026-04-13

### Changed
- hada-scout automation (#841)

### Fixed
- sync all README.md skill counts to 105
- sync README.md skill count to 105
- sync templates/CLAUDE.md skill count to 105
- sync manifest.json version to 0.86.0

## [0.85.0] - 2026-04-12

### Changed
- homedir project filter + parallel narrative format + blocker triage

### Fixed
- sync manifest.json version to 0.85.0

## [0.84.0] - 2026-04-12

### Changed
- MemKraft bridge + Multica reference integration

## [0.83.0] - 2026-04-12

### Changed
- Session Auto-Fix hook for previous session issue detection

## [0.82.0] - 2026-04-12

### Changed
- statusLine refreshInterval fix + multi-agent coding guides

### Fixed
- add missing wiki pages for 3 new guides

## [0.81.0] - 2026-04-12

### Added
- v0.81.0 — Wiki system, Adaptive Harness, wiki-rag, R022

### Fixed
- update README.md counts — agents 48, skills 104, rules 22
- update manifest.json and CLAUDE.md counts for v0.81.0
- printf octal interpretation bug in wiki-sync.yml
- add .claude/rules/ to gitignore exceptions, include SHOULD-wiki-sync.md
- CI failures — missing rule, grep macOS compat, wiki pages

## [0.80.0] - 2026-04-11

### Added
- add rule updates and release plan for v0.80.0
- v0.80.0 release — Stop hook fix, R000/R002/R006/R012 updates, CC v2.1.97-101 compatibility

### Changed
- sync manifest.json version to 0.80.0
- bump version to 0.80.0

## [0.79.5] - 2026-04-09

### Changed
- bump version to 0.79.5

### Fixed
- align skills with R010 Protected Paths routing

## [0.79.4] - 2026-04-09

### Changed
- bump version to 0.79.4

### Fixed
- strengthen R010 with Protected Paths for agent/skill/guide creation

## [0.79.3] - 2026-04-09

### Changed
- bump version to 0.79.3

### Fixed
- resolve CI failures for v0.79.3 release
- clean up stale E2E test registry entries

## [0.79.2] - 2026-04-09

### Added
- v0.79.2 — registry-based project detection  + update self-update (#812, #811)

### Fixed
- remove mock.module usage to prevent cross-file test pollution
- isolate mock.module test to prevent cross-file pollution
- v0.79.2 CI failures — lint, version sync, test isolation

## [0.79.1] - 2026-04-08

### Fixed
- v0.79.1 — ARCHITECTURE_ko.md sync (counts, hook table, translations)

## [0.79.0] - 2026-04-08

### Added
- add geeknews-scout CronJob for GeekNews RSS monitoring
- add CC release collector CronJob and rule deletion protection hook

### Changed
- bump version to 0.79.0
- env-based deploy abstraction for cc-release-collector

### Fixed
- sync rule-deletion-guard.sh and hooks.json to templates
- deep-verify findings — SSH injection, hook bypasses, dead code

## [0.78.3] - 2026-04-06

### Changed
- deps(dev)(deps-dev): bump @anthropic-ai/sdk
- deps(dev)(deps-dev): bump @types/nodemailer from 7.0.11 to 8.0.0

### Fixed
- v0.78.3 — dependency updates (@anthropic-ai/sdk 0.82.0, @types/nodemailer 8.0.0)

## [0.78.2] - 2026-04-06

### Added
- v0.78.2 — slack-cli-expert agent for Slack workspace automation (#794)

## [0.78.1] - 2026-04-06

### Fixed
- sync hook-data-flow guide to templates and update guide counts 31 → 32
- v0.78.1 — hook data flow docs + inline hook extraction (#791, #792)

## [0.78.0] - 2026-04-06

### Added
- v0.78.0 — stall detection hook + task-decomposition granularity integration (#788, #789)

### Fixed
- sync new hook scripts to templates for CI template-sync check

## [0.77.0] - 2026-04-06

### Added
- v0.77.0 — adaptive parallel splitting pattern (#786)

## [0.76.2] - 2026-04-06

### Fixed
- v0.76.2 — rename agora skill to omcustom:agora namespace

## [0.76.1] - 2026-04-06

### Added
- v0.76.1 — agora multi-LLM adversarial consensus skill

### Fixed
- update README skill counts 100 → 101 for v0.76.1

## [0.76.0] - 2026-04-05

### Added
- v0.76.0 — deep-plan dependency gate and R009 hard cap expansion (#782, #783)

## [0.75.0] - 2026-04-05

### Added
- v0.75.0 — pre-commit DX and pipeline parallel execution (#778, #779)

## [0.74.0] - 2026-04-05

### Added
- v0.74.0 — ROBOCO CLI feature gaps internalization (#773)

## [0.73.0] - 2026-04-05

### Added
- v0.73.0 — Hermes Agent internalization (skill-extractor, User Model, agentskills.io) (#762)

### Fixed
- auto-close linked issues and delete release branch on merge (#776)

## [0.72.1] - 2026-04-03

### Fixed
- remove deprecated sync-server-repo.yml — server decommissioned since 2026-03-18

## [0.72.0] - 2026-04-03

### Added
- v0.72.0 — Korean localization for analysis skill templates (#767)

## [0.71.0] - 2026-04-03

### Added
- v0.71.0 — pipeline skill migration, claude-native release monitor (#758, #759)

### Fixed
- delete deprecated pr-analysis.yml — Airflow endpoint dead since 2026-03-18

## [0.70.0] - 2026-04-01

### Added
- v0.70.0 — Codex auto-install, SessionStart auto-update, Airflow dead code removal (#752, #754, #756)

### Fixed
- sync omcustom-auto-update hook to templates — fix Template Sync CI

## [0.69.0] - 2026-04-01

### Added
- professor-triage v2.1 multi-perspective analysis + default filter fix (#753, #755)

### Changed
- professor-triage v2.0 — internalize codebase analysis, remove omc_issue_analyzer dependency

## [0.68.2] - 2026-03-31

### Added
- RTK auto-install in init/update/doctor (#742)

## [0.68.1] - 2026-03-31

### Fixed
- self-update cache phantom version guard (#741)

## [0.68.0] - 2026-03-31

### Added
- CC v2.1.88 compat + RTK PreToolUse auto-intercept (#741, #746)

## [0.67.0] - 2026-03-31

### Added
- add rtk-exec skill for RTK CLI proxy integration (#742)

## [0.66.0] - 2026-03-30

### Added
- add gemini-exec skill for native Gemini CLI execution (#739)

## [0.65.2] - 2026-03-30

### Added
- TypeScript 6.0 upgrade release v0.65.2

### Changed
- update bun.lock for typescript v6
- deps(dev)(deps-dev): bump typescript from 5.9.3 to 6.0.2
- update bun.lockb for i18next v26
- bump i18next from 25.10.10 to 26.0.2

## [0.65.1] - 2026-03-30

### Added
- CC v2.1.87 compatibility + auto-dev pre-triage step (#733)

## [0.65.0] - 2026-03-29

### Added
- hook registry expansion + CC feature integration (#725)

## [0.64.3] - 2026-03-28

### Added
- internalize Anthropic harness design insights — evaluator calibration, conditional evaluator, context reset (#728)

## [0.64.2] - 2026-03-28

### Added
- permissionMode tier-based adoption for all 46 agents (#719)

## [0.64.1] - 2026-03-28

### Added
- agent guardrails (maxTurns/limitations/disallowedTools) + harness-eval template sync (#720, #722)

## [0.64.0] - 2026-03-28

### Added
- R002 tool modernization (9→30) + R006 frontmatter sync + Fast Mode (#724, #727)

## [0.63.1] - 2026-03-28

### Fixed
- skill metadata consistency — user-invocable audit, CLAUDE.md sync, effort fix (#718)

## [0.63.0] - 2026-03-28

### Added
- internalize Chroma Context-1 insights — context pruning, retrieval-reasoning separation, recall bias (#714)

## [0.62.5] - 2026-03-28

_No user-visible changes (internal only)._

## [0.62.4] - 2026-03-28

### Added
- graph accessibility — circular nav, aria-live, skip link, focus-visible (#706, #707, #708, #709)

### Fixed
- pass complete PR context to Airflow DAG for accurate analysis

## [0.62.3] - 2026-03-28

### Added
- graph keyboard accessibility & zoom UX improvements (#699, #700)

## [0.62.2] - 2026-03-28

### Fixed
- set config.version in updateInstallConfig after init (#696)

## [0.62.1] - 2026-03-28

### Added
- CI lockfile-sync gate + R016 defect response matrix (#701, #702)

## [0.62.0] - 2026-03-28

### Added
- Web UI dependency graph visualization (#670)

### Changed
- update bun.lockb for d3 dependency

## [0.61.0] - 2026-03-27

### Added
- Permission Mode Guidance + CLI self-update check (#690, #681)

## [0.60.1] - 2026-03-27

### Added
- action-validator + peer-messaging skills, monitoring-setup inspector docs (#684, #685, #686)

## [0.60.0] - 2026-03-27

### Added
- CC v2.1.83-85 compatibility + harness design internalization (#683, #682, #676, #687)

### Fixed
- unify workflow command namespace to /omcustom:workflow

## [0.59.1] - 2026-03-27

### Fixed
- enforce mandatory triage comment posting (#689)

## [0.59.0] - 2026-03-27

### Added
- token optimization via HTML comments in rules/ (#688)

## [0.58.6] - 2026-03-25

### Fixed
- add validation tests, deduplicate CLAUDE.md (#661, #662)

## [0.58.5] - 2026-03-25

### Fixed
- track guides/ directory in git (#665)
- track 7 untracked rule files in git (#665)

## [0.58.4] - 2026-03-25

_No user-visible changes (internal only)._

## [0.58.3] - 2026-03-25

### Fixed
- repair feedback-collector, cost-cap-advisor TSV, updater.ts CRLF (#664, #666, #667)

## [0.58.2] - 2026-03-25

### Added
- show RL/WL renewal countdown in statusline (#674)

### Changed
- include build artifact for v0.58.2

## [0.58.1] - 2026-03-24

### Added
- add post-release-followup step to omcustom-dev workflow

### Changed
- bump version to v0.58.1

### Fixed
- add PR feedback source to followup skill, remove package-lock.json

## [0.58.0] - 2026-03-23

### Added
- v0.58.0 — Impeccable design language integration (#663)

## [0.57.0] - 2026-03-23

### Added
- v0.57.0 — update --hard namespace sync, Web UI fixes, auto-improve skill, eval pipeline

## [0.56.0] - 2026-03-23

### Added
- v0.56.0 — PostCompact R000 enforcement, workflow --list, statusline WL sync, dependency updates

## [0.55.0] - 2026-03-23

### Added
- v0.55.0 — eraser workflow, weekly rate limit statusline

## [0.54.0] - 2026-03-23

### Added
- v0.54.0 — ARCHITECTURE.md v0.53.1 sync, release-plan fix, Eraser diagrams

## [0.53.1] - 2026-03-23

### Fixed
- v0.53.1 — auto-tagging fix, workflow rename, custom workflow templates

## [0.53.0] - 2026-03-23

### Added
- v0.53.0 — dashboard cleanup, project detail, eval-core DB, user feedback

## [0.52.0] - 2026-03-21

### Fixed
- correct README skill counts for v0.52.0 release validation
- v0.52.0 — feedback collector hook, routing miss analysis, improve-report skill, R018 scope constraint

## [0.51.2] - 2026-03-21

### Changed
- bump version to 0.51.2

### Fixed
- v0.51.2 — R018 advisor batch detection, dashboard cleanup, Projects removal

## [0.51.1] - 2026-03-21

### Changed
- bump version to 0.51.1

### Fixed
- v0.51.1 — migration transaction, npm fallback test, CI optimization, Drizzle lesson

## [0.51.0] - 2026-03-21

### Added
- add /scout skill for external URL analysis and project fit evaluation (#616)

### Changed
- bump version to 0.51.0

## [0.50.0] - 2026-03-21

### Added
- lockfile-based smart protection for update + systematic-debugging skill

### Changed
- bump version to 0.50.0

### Fixed
- apply deep-verify findings — template CLAUDE.md skill count (84→90)

## [0.49.0] - 2026-03-21

### Added
- add workflow engine with /workflow:omcustom-dev (#605, #606, #607, #608, #609)

### Changed
- bump version to 0.49.0
- update skill count to 89 and register workflow commands

### Fixed
- apply deep-verify findings — README commands, category count, path validation

## [0.48.5] - 2026-03-21

### Added
- add /release-plan skill for release-unit planning (#603)

### Changed
- bump version to 0.48.5
- bump version to 0.48.5
- update skill count to 86 after release-plan addition

### Fixed
- apply deep-verify findings — scope, security, commands table (#603, #611)
- add bypassPermissions advisory to PostCompact hook (#611)

## [0.48.4] - 2026-03-21

### Added
- add stale-todo-scanner SessionStart hook (#602)

### Changed
- bump version to 0.48.4

### Fixed
- add git add keyword to git-delegation-guard.sh (#600)
- whitelist .claude/hooks/ in .gitignore and track hook scripts (#602)

## [0.48.3] - 2026-03-21

### Changed
- bump version to 0.48.3

### Fixed
- use .claude/* glob pattern for proper gitignore negation (#596)
- whitelist .claude/skills/ in .gitignore and track script files (#596)

## [0.48.2] - 2026-03-21

### Added
- add professor-triage intent-detection trigger (#598)

### Changed
- bump version to 0.48.2 with professor-triage template sync

## [0.48.1] - 2026-03-21

### Added
- expand /deep-verify with philosophy gate and add web-scraping guide (#593)

### Changed
- bump version to 0.48.1

## [0.48.0] - 2026-03-21

### Added
- v0.48.0 — conflict resolution, dashboard cleanup, CI optimization (#586)

### Changed
- bump version to 0.48.0

## [0.47.2] - 2026-03-20

### Changed
- bump version to 0.47.2

### Fixed
- prevent version downgrade and unify version display sources (#584)

## [0.47.1] - 2026-03-20

### Changed
- bump version to 0.47.1

### Fixed
- remove auto-start serve from init to prevent orphan servers (#580)

## [0.47.0] - 2026-03-20

### Added
- add feedback analysis engine and improvement tracking (#545)
- add omcustom-loop skill with SubagentStop prompt hook (#556)
- add omcustom web CLI command with start/stop/status/open (#538, #540)
- add anonymous feedback option and remove gh hard dependency (#547, #555)
- automate release tag creation after PR merge (#533, #551)
- redesign main dashboard to project statistics view (#536, #539)
- session auto-collection with projects and feedback schema (#534, #542)

### Changed
- bump version to 0.47.0
- rebuild dist after json_group_array fix

### Fixed
- replace group_concat with json_group_array for delimiter safety
- address all deep review findings and resolve test failures
- add cwd and parent dir to projects search path (#546, #553)
- align slash command names with actual skill names (#550, #554)
- resolve empty project page when accessing /projects?project=slug (#537, #541)
- improve statusline CTX accuracy with fallback calculation and atomic write (#543, #549)
- add worktree detection to pre-commit hook for lightweight checks (#544, #548)

## [0.46.1] - 2026-03-20

### Fixed
- statusline RL segment ANSI escape codes rendered as raw text
- rename OMCUSTOM_PROJECT_ROOT to OMX_PROJECT_ROOT (#530)
- commit missing sync-source-lockfile.ts and bump to v0.46.1 (#529)

## [0.46.0] - 2026-03-20

### Added
- v0.46.0 — CC v2.1.80 compat, multi-project Web UI, batch update UI, docs refresh

## [0.45.3] - 2026-03-20

### Fixed
- version comparison inconsistency between projects and updater (#525)

## [0.45.2] - 2026-03-20

### Changed
- bump version to 0.45.2

## [0.45.1] - 2026-03-19

### Added
- add omcustom update --all and interactive multi-project update (#518)

### Changed
- bump version to 0.45.1

## [0.45.0] - 2026-03-19

### Added
- add PR analysis workflow with Airflow JWT auth (#515)
- add ambiguity-gate skill — ouroboros-inspired pre-routing analysis (#507)
- add /omcustom:feedback skill for GitHub issue submission (#498)
- add omcustom projects command with lock file infrastructure (#495)
- add SDD (Spec-Driven Development) skill (#506)
- add argument-hint to 5 user-invocable skills (#494)

### Changed
- bump version to 0.45.0

### Fixed
- sync guides count in manifest and README (#507)
- sync skill count to 77 in manifest and README (#494)

## [0.44.6] - 2026-03-19

### Changed
- bump version to 0.44.6

### Fixed
- migrate Airflow CI workflows to JWT token auth for Airflow 3.x

## [0.44.5] - 2026-03-19

### Added
- add Alembic migration expert agent, skill, and guide

## [0.44.4] - 2026-03-19

### Changed
- bump version to 0.44.4

### Fixed
- update issue-analyzer workflow for Docker-based Airflow

## [0.44.3] - 2026-03-19

### Changed
- bump version to 0.44.3

### Fixed
- make GitHub Packages verification non-blocking in verify-release

## [0.44.2] - 2026-03-19

### Added
- autonomous execution mode and long-session compliance improvements (#485, #483)

### Changed
- bump version to 0.44.2

## [0.44.1] - 2026-03-18

### Changed
- bump version to 0.44.1

### Fixed
- make verify-release non-blocking and increase GHP retry count

## [0.44.0] - 2026-03-18

### Added
- add evaluations table and Web UI evaluation pages (#467, #481)
- add sidebar Core category and dashboard analytics (#470, #480)
- add /omcustom:web interactive toggle, remove SessionStart auto-serve (#476, #479)
- add verify-release job to release workflow (#474, #477)

### Changed
- bump version to 0.44.0

### Fixed
- replace truncate with line-clamp-2 for description readability (#475, #478)
- update docs-sync.yml to macos-latest — nuc13 runner removed (#474)

## [0.43.1] - 2026-03-18

### Added
- add skill/guide creation pages and SessionStart auto-serve (#469)

### Changed
- bump version to 0.43.1
- move lightweight jobs to GitHub-hosted runners (#471, #472)

### Fixed
- inline issue number in SSH script to fix JSON parse error

## [0.43.0] - 2026-03-18

### Added
- add omcustom serve/serve-stop commands with auto-start (#466)
- add built-in Web UI — SvelteKit agent/skill/guide/rule explorer (#466)
- add issue analyzer webhook trigger

### Changed
- bump version to 0.43.0

## [0.42.3] - 2026-03-18

### Added
- add git worktree workflow guide + .gitignore update (#463)
- add CLI native modules — scope-filter, lockfile-hasher, file-tree-scanner (#421)

### Changed
- bump version to 0.42.3

### Fixed
- code review fixes — Domain Copy/FromStr/Database, extension_filter rename, bench bug (#421)

## [0.42.2] - 2026-03-18

### Changed
- sauron auto-fix — skill count, context:fork list, template sync
- bump version to 0.42.2

### Fixed
- add sequential-dependency guidance and blocked agent behavior (#457, #461)

## [0.42.1] - 2026-03-16

### Fixed
- v0.42.1 — fix README skill count for release validation
- update skill count 74→75 in README files

## [0.42.0] - 2026-03-16

### Added
- v0.42.0 — Performance

## [0.41.0] - 2026-03-16

### Added
- v0.41.0 — Skills & DX

## [0.40.0] - 2026-03-16

### Added
- v0.40.0 — Rule Clarity & Testing

## [0.39.0] - 2026-03-16

### Added
- v0.39.0 — Quick Fixes & Dependencies

### Changed
- bump drizzle-orm in the production-dependencies group
- deps(dev)(deps-dev): bump drizzle-kit

### Fixed
- sync templates with source hooks for v0.39.0
- sync bun.lock for drizzle-orm update
- sync bun.lock for drizzle-kit update

## [0.38.0] - 2026-03-16

### Added
- upgrade to v0.38.0 — README/ARCHITECTURE rewrite + version bump
- CC v2.1.72~v2.1.74 compatibility updates
- Claude Code v2.1.76 compatibility — PostCompact hook + R006 sync
- add @omcustom/eval-core MVP with bun workspace
- add interactive init wizard with @clack/prompts

### Fixed
- final audit — guide sync, version, context:fork cap, skill categories, code cleanup
- force-add untracked template rule file (MUST-completion-verification.md)
- audit follow-up — template sync + code cleanup + test alignment
- deep audit findings — hooks integrity + eval-core parser safety
- sync templates with source — R011 memory sections + session-env-check CI block
- security audit CI compatibility with bun workspaces

## [0.37.2] - 2026-03-16

### Added
- remove Claude Native Check CI workflow

## [0.37.1] - 2026-03-16

### Added
- activate codex-exec auto-delegation in research and routing skills

### Changed
- bump version to 0.37.1

## [0.37.0] - 2026-03-16

### Added
- v0.37.0 structure optimization — 6 issues across token efficiency and workflow

## [0.36.2] - 2026-03-15

### Fixed
- sync missing hook scripts and hooks.json to templates
- add template-sync CI job to catch .claude/ <-> templates/ desync (#382)

## [0.36.1] - 2026-03-15

### Added
- replace Claude API release-notes CI with in-session skill

### Fixed
- add missing skills to templates for validate-docs CI

## [0.36.0] - 2026-03-15

### Added
- release v0.36.0 — 26 issues across Harness Engineering + codespeak patterns

## [0.35.0] - 2026-03-14

### Added
- **Cost monitoring system**: statusline→hook cost data bridge + cost-cap-advisor hook with 4-level warnings (#339, #340)
- **Pre-flight guards**: Automated 4-level guard system (PASS/INFO/WARN/GATE) for dev-review, dev-refactor, and research skills (#335, #336, #337)
- **Stuck-detector unit tests**: 157 tests covering all 3 detection signals + hard-block behavior (#338)
- **Dynamic pattern tracking**: task-outcome-recorder now infers workflow pattern (sequential/parallel/evaluator-optimizer/worker-reviewer/orchestrator) (#334)

### Fixed
- **stuck-detector bug**: Fixed `jq -n` → `jq -cn` for compact JSON output — advisory and hard-block detection were silently non-functional (#338)
- **index.yaml**: Added missing 12-workflow-patterns guide entry (#333)

## [0.34.0] - 2026-03-14

### Added
- `omcustom:` namespace prefix for 14 harness/package skills (Closes #264)
- "When NOT to Use" guard sections for dev-review, dev-refactor, research skills
- Stopping criteria display for worker-reviewer-pipeline and research skills
- Cost estimate display for research skill
- Pattern Selection guide (workflow-patterns.md)
- Step 0 Pattern Selection in task-decomposition skill
- `pattern_used` field in task-outcome-recorder hook
- New evaluator-optimizer skill (general-purpose EO primitive)
- Conditional hard-block (exit 1) in stuck-detector for 5+ consecutive repetitions

### Changed
- Reclassified 4 skills from core to harness scope (analysis, lists, status, help)
- Skills count: 70 → 71
- context:fork count documentation updated to 9/10

### Fixed
- Sauron verification findings (guide count, context:fork count, template sync)

### Closed
- #264: omcustom: namespace prefix convention
- #328: CI validate-docs false positive
- #329: Documentation informational findings

## [0.33.1] - 2026-03-13

### Added
- **`/deep-plan` skill**: Research-validated planning with 3-phase cycle (Discovery Research → Reality-Check Planning → Plan Verification). Eliminates gap between research assumptions and actual codebase state (#325)

### Fixed
- **validate-docs hook counting**: Fixed false positive where `scripts/` directory was counted as a hook file. Now counts only `.json` files as hooks (#325)

## [0.32.0] - 2026-03-13

### Added
- **Update awareness** (`doctor --updates`): detects when installed oh-my-customcode version is behind the latest npm release and reports available updates (#313)
- **Session advisory**: notifies users at session start when a newer version is available (#314)
- **Protected files**: lockfile module now tracks protected files to prevent accidental overwrites (#315)

### Changed
- **Lockfile module refactor**: centralized `COMPONENT_PATHS`, added `readLockfile` validation, extracted common helpers (#317)

### Fixed
- **i18n key registration**: lockfile debug/warn message keys now properly registered (#317)

### Tests
- 4 additional lockfile integration tests (29 total) (#317)

## [0.31.1] - 2026-03-12

### Fixed
- **Guide count sync**: Corrected guide count from 24 to 25 across README_ko.md and template CLAUDE.md files (PR #308)

## [0.31.0] - 2026-03-12

### Added
- **Ontology-RAG routing enrichment (R019)**: All 4 routing skills (secretary, dev-lead, de-lead, qa-lead) now call `get_agent_for_task` to inject `suggested_skills` into spawned agent prompts. MCP failure is silently skipped — routing is never blocked.
- **ARCHITECTURE.md**: Comprehensive 13-section architecture documentation with Mermaid diagrams (EN + KO)
- **Docs validator as release gate**: CI now validates documentation consistency before release
- **Phantom slash command detection**: Validator detects commands listed in README without corresponding skill directories
- **Flutter development support**: New `fe-flutter-agent`, `flutter-best-practices` skill, and 4 Flutter guides

### Fixed
- **graph_score=0 bug** in ontology-RAG router: `route_with_hybrid()` now passes keyword-best match as `anchor_node` to `hybrid_searcher.search()`, enabling graph proximity scoring (confidence 0.15→0.30+ range)
- **Ontology-RAG MCP server configuration** restored (#294)
- **Korean query routing**: Added particle stripping for mixed Korean-English queries
- **SHA-pin all GitHub Actions** for supply chain security across 12 workflows
- **Guides migration**: All agent/skill references migrated to `templates/guides/` (single source of truth)
- **Flutter `color.withOpacity()` deprecation**: Replaced with `color.withValues()` in performance guide
- **CLAUDE.md count accuracy**: Skills, rules, and guides counts corrected

### Changed
- **Guides architecture**: Root `guides/` removed from git tracking; `templates/guides/` is canonical source
- **java21 guides** moved to `templates/guides/` (#270)
- **README EN/KO alignment**: Structure and ordering synchronized
- **Sprint 1-4 code quality**: java21 refs, rule dedup, guides sync, validator improvements

## [0.23.2] - 2026-03-08

### Fixed
- **Manifest version desync** : `templates/manifest.json` version was stuck at `0.3.0` while package.json was at `0.23.1`, causing `omcustom update` to incorrectly report "no updates available" for users with existing installations

### Added
- **CI version sync guard**: New CI job `version-sync` verifies `package.json` and `templates/manifest.json` versions match on every PR

## [0.23.1] - 2026-03-08

### Fixed
- **dry-run modifies files** (Issue #220): `omcustom update --dry-run` no longer modifies CLAUDE.md or config — entry doc update and config save are now guarded by dry-run check
- **Content loss on update** (Issue #221): `omcustom update` now preserves existing project-specific CLAUDE.md content when no omcustom markers exist, instead of overwriting it entirely

## [0.23.0] - 2026-03-08

### Added
- **Claude Code v2.1.x Compatibility**: Dual `Task|Agent` hook matchers for forward/backward compatibility
- **SubagentStart/SubagentStop** hook events for agent lifecycle tracking
- **Claude Code version detection** in session-env-check.sh with compatibility warnings
- **7 new agent frontmatter fields**: `isolation`, `background`, `maxTurns`, `mcpServers`, `hooks`, `permissionMode`, `disallowedTools` documented in R006
- **`context: fork`** support added to 5 routing/orchestration skills
- **Hooks analysis** in claude-native CI checker for dual matcher verification
- **Claude Code compatibility matrix** in CLAUDE.md

### Changed
- All rule files (R008, R009, R010, R012, R018) updated: "Task tool" → "Agent tool" naming
- All routing skills updated: `Task(...)` → `Agent(...)` in examples
- CLAUDE.md updated with Agent tool naming and compatibility section
- claude-native checker upgraded: new frontmatter fields, hooks analysis, expanded doc pages, model update
- Hook scripts updated with dual Agent/Task tool comments

### Fixed
- hooks.json matchers silently broken in Claude Code v2.1.63+ due to Task→Agent rename (Issue #218)

## [0.22.1] - 2026-03-08

### Fixed
- Fixed MCP tool name references in sys-memory-keeper agent — session-end saves now correctly invoke `mcp__plugin_claude-mem_mcp-search__save_memory` and `mcp__plugin_episodic-memory_episodic-memory__search`
- Updated R011 (SHOULD-memory-integration) rule with correct tool names

## [0.22.0] - 2026-03-08

### Added
- **Worker-Reviewer Pipeline** skill: iterative Worker→Reviewer quality pipeline with configurable quality gates, Agent Teams integration, and review verdict format
- **PR Auto-Improve** skill: opt-in post-PR analysis and improvement suggestions with structured improvement checklist and agent-specific fix delegation
- **Pipeline Guards** skill: safety constraints for pipeline execution including max iterations, timeouts, quality gates, kill switch, and state preservation

### Changed
- Skill count updated: 60 → 63
- README, CLAUDE.md, and manifest.json synchronized

### Completed
- Issue #213 Phase 3 (Pair Pipeline + PR Auto-Improvement) — all phases now complete
- npm publish confirmed for v0.19.4, v0.20.0, v0.21.0

## [0.21.0] - 2026-03-07

### Added
- DAG Orchestration skill — YAML-based workflow engine with Kahn's topological sort and failure strategies
- Task Decomposition skill — auto-decompose large tasks into DAG-compatible parallel subtasks
- Common workflow templates: feature implementation, code review, multi-language, refactoring
- Decomposition heuristics: by file independence, domain separation, and layer

## [0.20.0] - 2026-03-07

### Added
- Model Escalation skill — advisory system tracking task outcomes and recommending model upgrades (haiku→sonnet→opus)
- Task outcome recorder hook (PostToolUse) for logging success/failure of Task tool calls
- Model escalation advisor hook (PreToolUse) with failure threshold and de-escalation support
- Stuck Detection skill — loop detector identifying repetitive errors, edit loops, and tool spam
- Stuck detector hook (PostToolUse) monitoring Edit/Write/Bash/Task for stuck patterns
- Optional `escalation` field in R006 agent design frontmatter

## [0.19.4] - 2026-03-07

### Fixed
- Strengthen R018 Agent Teams spawn completeness check with mandatory self-check box
- Add partial spawn violation examples to R018 and R009 rules
- Add Git workflow reminder to session-env-check.sh hook (branch detection + protected branch warning)
- Force-add gitignored R018/R009 rule files to git tracking

## [0.19.3] - 2026-03-06

### Added
- `/analysis` slash command for automatic project analysis and customization
- Project tech stack detection with agent/skill mapping for 24+ technologies
- Gap analysis comparing detected stack with installed components
- Auto-configuration workflow with dry-run and verbose options

### Fixed
- Correct secret names for CI/CD workflows (OH_MY_CUSTOMCODE, OH_MY_TEAMMATES_GH_PAT)

## [0.19.0] - 2026-03-06

### Added
- Agent Teams advisor hook: automatic R018 eligibility warning on 2+ Task calls (#207)
- Session environment check hook: codex CLI and Agent Teams availability at session start (#207)
- Codex-exec code generation workflow for hybrid Claude+Codex implementation (#207)
- Code generation trigger in intent-detection patterns (#207)

### Changed
- R009 (Parallel Execution): add Agent Teams Gate requiring R018 eligibility check before Task tool (#207)
- R018 (Agent Teams): simplify self-check from 5 conditions to 2 heuristics (3+ agents OR review cycle) (#207)
- R018 (Agent Teams): change tone from cost-avoidant to actively preferred (#207)
- Move "Agent Teams Awareness" from document bottom to "Routing Decision" priority section in all 4 routing skills (#207)
- Add codex-exec hybrid option to dev-lead-routing and de-lead-routing (#207)
- Upgrade research-workflow routing_note to routing_rule (MUST) in agent-triggers.yaml (#207)
- Add codex-exec suggestion to structured-dev-cycle Stage 3 (Implement) (#207)
- Update codex-exec SKILL.md: remove disable-model-invocation note, add code generation workflow (#207)

## [0.18.5] - 2026-03-06

### Fixed
- Extract Stop hook inline script to external `stop-console-audit.sh` with session diagnostics (#206)
- Document Claude Code internal stop evaluator false positive as platform limitation (#206)

### Added
- Comprehensive hook script tests: 52 test cases for stop-console-audit, stage-blocker, git-delegation-guard

## [0.18.4] - 2026-03-05

### Fixed
- Sync root-level `.claude/` files (statusline.sh, install-hooks.sh, uninstall-hooks.sh) during `omcustom update` (#201)
- Remove deprecated/renamed files during `omcustom update` using deprecation manifest (#202)

## [0.18.3] - 2026-03-04

### Fixed
- Resolve npm audit vulnerabilities by updating dependency lock file (#199)
  - rollup: Path Traversal (HIGH, GHSA-mw96-cpmx-2vgc)
  - esbuild: CORS Bypass (MODERATE, GHSA-67mh-4wv8-2f99)

## [0.18.2] - 2026-03-04

### Fixed
- Standardize ontology YAML field naming to hyphen-case (`user_invocable` → `user-invocable`) (#197)

## [0.18.1] - 2026-03-02

### Fixed
- Standardize frontmatter field naming to hyphen-case (`user_invocable` → `user-invocable`) (#195)

## [0.18.0] - 2026-03-01

### Added
- Auto-route research requests to Codex with xhigh reasoning effort (#191)
  - Add `--effort` parameter to codex-exec (minimal, low, medium, high, xhigh)
  - Maps to Codex CLI's `-c model_reasoning_effort` configuration
  - Add research-workflow triggers to intent-detection (조사, 검색, 리서치, etc.)
  - Research Intent Routing with Codex availability check and WebFetch fallback

## [0.17.1] - 2026-03-01

### Added
- Enable custom statusline for `omcustom init` users (#192)
  - Sync template statusline.sh with latest version (cost display, PR caching, OSC 8 hyperlinks)
  - Auto-generate `settings.local.json` with statusLine configuration during init
  - Merge statusLine config into existing settings without overwriting user preferences
  - Set executable permission on statusline.sh automatically

## [0.17.0] - 2026-02-27

### Features
- **Statusline**: Replace model name with API cost estimate ($X.XX) with color coding (#187, #190)
- **Statusline**: Add PR number display and clickable branch link (#182)
- **Statusline**: Add Claude Code statusline script (#162, #180)
- **Memory**: Session-end auto-save and MCP dependency reclassification (#184)

### Fixes
- **R010**: Add git delegation enforcement mechanisms (#186, #188)
- **Statusline**: Fix space between PR and # in display

### Chores
- **Agents**: Remove mgr-sync-checker and clean up mgr-claude-code-bible (#181, #189)

## [0.16.4] - 2026-02-27

### Fixed
- Correct ontology installed path display in init command (#178)

### Changed
- Remove baekgom-agents sync-check CI and verify-sync script

### Dependencies
- Bump @anthropic-ai/sdk from 0.74.0 to 0.78.0 (#177)
- Bump actions/cache from 4 to 5 (#176)

## [0.14.1] - 2026-02-18

### Fixed
- Install `ontology-rag` from Git URL instead of PyPI registry during `omcustom init` (#152)

## [0.14.0] - 2026-02-18

### Added
- Native ontology-rag integration into `omcustom init` pipeline ([#150](https://github.com/baekenough/oh-my-customcode/issues/150))
  - Ontology knowledge graph (`.claude/ontology/`) now installed as a standard component
  - MCP server configuration auto-generated when uv is available
  - `omcustom update` can update ontology files alongside other components

### Changed
- README.md and README_ko.md documentation overhaul
  - Replaced canonical agent/skill ID text blocks with categorized tables
  - Added ontology-rag package section with feature descriptions
  - Added `omcustom security` command to CLI reference
  - Updated project structure to include ontology directory
- Template manifest version bumped to 0.3.0 (7 components including ontology)

## [0.13.3] - 2026-02-18

### Added
- `omcustom security` command for template and configuration security scanning ([#78](https://github.com/baekenough/oh-my-customcode/issues/78))
  - Hook script audit: detects dangerous patterns (rm -rf, curl|bash, sudo, chmod 777, eval, base64 decode)
  - Config secret scan: finds hardcoded credentials (AWS, GitHub tokens, API keys, private keys)
  - Template integrity: checks for .env files and overly permissive file permissions

## [0.13.2] - 2026-02-18

### Fixed
- Release workflow graceful fallback when CHANGELOG.md entry is missing (#133)
  - Replace hard `exit 1` with warning when CHANGELOG entry not found
  - Use GitHub auto-generated release notes as fallback
  - Prevents half-release state (npm published but no GitHub Release)
  - Release Notes Generator workflow now always triggers

## [0.13.1] - 2026-02-18

### Changed
- R010 orchestrator coordination enforcement strengthened (#144)
  - Added mandatory self-check box before any file modification
  - Added Common Violations section with concrete ❌/✓ examples
  - Stricter exception clause: "simple tasks" now means READ-ONLY only
  - CLAUDE.md templates updated with stronger orchestrator wording
- Agent Teams (R018) proactive usage directives strengthened (#145)
  - Changed from "ACTIVELY prefer" to "DEFAULT to Agent Teams" for qualifying tasks
  - Lowered threshold from 3+ to 2+ agents with shared state or iteration
  - Added mandatory STOP-and-check in R018 and all 4 routing skills
  - CLAUDE.md templates updated with stronger default-to language

## [0.13.0] - 2026-02-17

### Added
- Dynamic Agent Creation pattern: routing fallback creates specialized agents on-the-fly when no matching expert exists (#137)
  - Core oh-my-customcode philosophy: "No expert? CREATE one, connect knowledge, and USE it."
  - `mgr-creator` dynamic mode with auto-discovery of skills and guides
  - `--dynamic` option for `create-agent` skill
  - No Match Fallback in all 4 routing skills (secretary, dev-lead, de-lead, qa-lead)
  - `intent-detection` now triggers dynamic creation for specialized unmatched tasks
- Agent Teams hybrid patterns: Codex integration, dynamic creation in teams (#138)
- codex-exec availability check and Agent Teams integration documentation (#139)

### Fixed
- Rule ID alignment with ontology numbering: R014-R017 → R015-R018 (#141)
- Agent frontmatter standardization: removed 13 empty `skills: []`, fixed field order (#140)

### Changed
- Agent Teams rule (R018) strengthened with mandatory self-check, expanded decision matrix, hybrid/dynamic patterns
- CLAUDE.md templates updated with Dynamic Agent Creation section and proactive Agent Teams language
- README.md and README_ko.md updated with Dynamic Agent Creation as key feature
- manifest.json timestamp and context count updated

## [0.12.4] - 2026-02-17

### Changed
- Replace Python dependency with uv for MCP server setup (#135)
  - `checkPythonAvailable()` → `checkUvAvailable()` for reliable detection
  - Create isolated `.venv` via `uv venv` during `omcustom init`
  - Install `ontology-rag` into `.venv` via `uv pip install`
  - Use `.venv/bin/python` in `.mcp.json` instead of system `python`

## [0.12.3] - 2026-02-14

### Added
- `codex-exec` skill for OpenAI Codex CLI integration
  - Node.js wrapper script (`codex-wrapper.cjs`) with environment validation, command building, JSON Lines parsing, and timeout handling
  - Supports hybrid Claude+Codex workflows for specialized code generation tasks
- `/codex-exec` slash command registered in both English and Korean CLAUDE.md templates

### Changed
- Skill count updated from 52 to 53 across README.md and README_ko.md

## [0.12.2] - 2026-02-13

### Breaking Changes
- Removed Codex (OpenAI) provider support - now Claude-only framework

### Changed
- Removed `LlmProvider` type system and `--provider` CLI flag
- Simplified `layout.ts` from dual-provider to single `CLAUDE_LAYOUT` constant
- Simplified `provider.ts` from 197-line detection to always-Claude return
- Removed codex templates (123 files), CI workflows, and e2e tests

### Fixed
- Removed stale provider parameter from updater test calls
- Removed codex references from ontology-rag package

### Added
- Comprehensive self-update integration tests (20 tests with mocked TTY/child_process)
- Doctor check tests for empty directory warn paths (15 tests)
- Git-workflow render tests for bugfix/hotfix patterns
- Total test count: 768 (up from 688), line coverage: 97.87%

## [0.12.1] - 2026-02-13

### Added
- `omcustom init` now checks for newer `oh-my-customcode` releases in interactive sessions and prompts for self-update before initialization.
- Self-update check includes a 24-hour local cache and automatically skips CI/non-interactive environments.

### Changed
- Codex docs fetch/source policy aligned to canonical OpenAI Codex docs URLs with explicit fallback/report output.
- Codex template model taxonomy normalized to `reasoning | balanced | fast` across agents/skills/rules.
- PR CI now includes a path-scoped Codex-native verification gate for Codex-related changes.

## [0.12.0] - 2026-02-13

### Changed
- Documentation copy updated to consistently describe dual-provider support (Claude + Codex) across:
  - `README.md`, `README_ko.md`
  - `docs/index.md`
- CLI command reference (`docs/guide/commands.md`) reconciled with actual CLI options and defaults.
- Codex template/docs references aligned to Codex-native terminology and model profile terms (`reasoning|balanced|fast`).
- Package metadata now explicitly reflects dual-provider scope (`Claude + Codex`).

## [0.11.0] - 2026-02-13

### Added
- ontology-rag context engine package (Phase 1-4) with MCP server providing 8 tools
  - Phase 1: Core ontology system with YAML-based rule indexing and graph-based relationships
  - Phase 2: Semantic caching, token logging, and budget management
  - Phase 3: Community detection, hybrid search (keyword + graph + community), and reranking
  - Phase 4: Rule decomposition with extractive compression, adaptive budget management, monitoring dashboard, and A/B testing framework
- Packages section in root README documenting ontology-rag v0.3.0

### Changed
- docs/index.md: Updated agent count (36 → 42) and skill count (17 → 51)

### Fixed
- Version display message incorrectly showing old version (#111)

### Removed
- AI PR analyzer workflow and related scripts (pr-analyzer.yml, reusable-pr-analyzer.yml, analyze-pr.ts)

## [0.10.3] - 2026-02-12

### Added
- Brand assets (banner, badge, icon) and README/wiki banners (#102)

### Fixed
- Release workflow race condition in npm publish step (#101, #103)

## [0.10.1] - 2026-02-12

### Added
- Path traversal validation for `preserveFiles` configuration (Closes #76)
  - Validates paths to prevent directory traversal attacks
  - Blocks paths containing `..`, absolute paths, and paths starting with `/`
  - Returns clear error messages for invalid paths

### Changed
- Refactored springboot-best-practices SKILL.md: extracted Java code examples into standalone files (Closes #67)
  - Created 9 example files in `examples/` directory
  - Reduced SKILL.md size by 66.7% (219 → 73 lines)
  - Improved maintainability and on-demand loading

## [0.10.0] - 2026-02-12

### Added
- CI security audit workflow: weekly scheduled scan + PR trigger (Closes #86)
- Security audit job in CI pipeline (runs after lint and test)
- Pre-commit coverage enforcement with 95% threshold (Closes #84)
- Dependabot enhanced configuration: scoped commits, reviewer assignment, UTC scheduling
- Bilingual PR analyzer workflow: Claude API-powered PR analysis with EN/KO comments
- `--force-overwrite-all` CLI flag to bypass all file preservation mechanisms
- i18n translations (en/ko) for new CLI option

### Changed
- `noExcessiveCognitiveComplexity` biome rule elevated from `warn` to `error` (Closes #85)
- `parseEntryDoc()` refactored: cognitive complexity 22 → ≤15 via helper extraction
- `update()` refactored: cognitive complexity 16 → ≤15 via helper extraction
- Dependabot group renamed: `dev-dependencies` → `development-dependencies`
- Dependabot labels updated: added `automated` tag
- Reduce redundant `loadConfig()` calls: list module 4→1, updater module 6→1 (Closes #74)
- Clarify `preserveCustomizations` option semantics with JSDoc documentation (Closes #75)

### Fixed
- Entry-merger false positive on markers inside fenced code blocks (Closes #73)
- Pre-commit hook false positive: `grep "0 fail"` matching "10 fail" → `grep -qE '^ *0 fail'`
- CI: `bun pm audit` → `npm audit` (bun pm audit doesn't exist)
- CI: branch pattern `release` → `release/**` for proper matching
- Documentation: skill count 52 → 51 in README.md and README_ko.md
- Documentation: context count 1 → 4 in README.md and README_ko.md
- Documentation: agent category order alignment between EN/KO README files

## [0.9.4] - 2026-02-11

### Added
- `preserveFiles` config field: protect specific files/directories from being overwritten during `omcustom update` (Closes #69)
- CLAUDE.md merge mechanism: `<!-- omcustom:start -->` / `<!-- omcustom:end -->` markers separate template content from user customizations (Closes #70)
- Custom component tracking: `customComponents` config with `managed: false` flag for user-created agents, skills, rules, and guides (Closes #71)
- `omcustom doctor` checks custom component path existence
- `omcustom list` shows `[custom]` tag for unmanaged components
- Entry document merge: preserves user-written sections while updating template-managed sections

### Fixed
- ESM compatibility: replaced `require('node:path')` with module-level imports in `shouldSkipPath`, `getRelativePath`, `isAbsolutePath`
- `customComponents` deduplication now uses path-based comparison instead of broken `Set` reference equality

## [0.9.3] - 2026-02-10

### Added
- Pre-flight CLI version check: automatically checks for outdated CLI tools (claude-code, codex) via Homebrew before running commands (Closes #54)
  - Homebrew integration with npm/npx fallback
  - CI environment auto-detection (skips check in CI)
  - `--skip-version-check` global flag
- `omcustom update` command: update agents, skills, rules, guides, hooks, and contexts to latest version (Closes #52)
  - Component-selective updates (`--agents`, `--skills`, `--rules`, `--guides`, `--hooks`, `--contexts`)
  - Dry-run mode (`--dry-run`), backup support (`--backup`), force update (`--force`)
  - User customization preservation
  - Provider-aware updates (`--provider auto|claude|codex`)

## [0.9.2] - 2026-02-10

### Fixed
- Resolve release workflow conflict by using `workflow_run` trigger instead of duplicate `push: tags` trigger (#59)

## [0.9.1] - 2026-02-10

### Fixed
- Add missing `secretary-routing` skill to templates (Closes #57)

## [0.9.0] - 2026-02-10

### Added
- Dual-mode provider detection (Claude/Codex) with override/config/env/project markers
- Codex templates: `.codex/` tree, `AGENTS.md` templates, `manifest.codex.json`
- Provider export API for layout/detection utilities
- Codex native verification workflow (reusable GitHub Actions)
- Hook and context documentation in READMEs

### Changed
- CLI: `init`, `list`, `doctor` support `--provider` and auto-detection
- Installer/updater now resolve component paths by provider root (`.claude` or `.codex`)
- Config adds `provider` field (default `auto`)

### Fixed
- README agent names now use full filenames (e.g., `lang-golang-expert` not `lang-golang`)
- Routing skill names use exact directory names in documentation
- Orchestration skill count corrected (added qa-lead-routing)
- Code coverage improved to 99.28%

## [0.8.0] - 2026-02-10

### Added
- Data Engineering agent ecosystem: 8 DE agents (de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-iceberg-expert, de-pipeline-architect, de-quality-engineer)
- Database agents: db-postgres and db-redis
- DE lead routing skill for data engineering task delegation
- 8 best-practices skills: airflow, dbt, spark, kafka, snowflake, iceberg, postgres, redis
- 8 reference guides: airflow, dbt, spark, kafka, snowflake, iceberg, postgres, redis
- Pipeline architecture patterns skill

### Changed
- Agent count: 34 → 42
- Skill count: 41 → 51
- Guide count: 14 → 22
- Secretary routing updated with missing agents (mgr-claude-code-bible, sys-memory-keeper, sys-naggy)
- Dev-lead routing updated with missing agents (arch-documenter, arch-speckit-agent, infra-docker-expert, infra-aws-expert)

### Fixed
- README.md/README_ko.md counts updated to reflect new agents/skills/guides
- Hook count corrected (2 → 1) and context count corrected (1 → 4) in README.md
- 100% routing coverage achieved (42/42 agents routable)

## [0.7.0] - 2026-02-10

### Added
- `monitoring-setup` skill: OTel console monitoring enable/disable via `/monitoring-setup`
- Natural language triggers for monitoring activation (Korean/English)

### Changed
- CLAUDE.md.en: Added `/monitoring-setup` to slash commands table
- CLAUDE.md.ko: Added `/monitoring-setup` to slash commands table

### Dependencies
- Merged Dependabot PRs: upload-artifact v6, download-artifact v6, Anthropic SDK 0.74.0, nodemailer v8, @types/nodemailer v7
- Fixed 3 E2E test failures (locale-agnostic assertions)
- Added claude-native-check.yml workflow
- Fixed README_ko.md typo (qa-qa-engineer → qa-engineer)

## [0.6.2] - 2026-02-08

### Fixed
- Release Notes workflow: add fetch-tags: true to checkout to prevent missing tag references
- Release Notes script: wrap git commands in try/catch with fallback for robustness

## [0.6.1] - 2026-02-08

### Fixed
- Release Notes Generator: auto-detect previous tag on tag push events
- Release Notes Generator script: robust fallback using sorted tag list
- E2E symlink test timeout increased to 15s for CI environments

## [0.6.0] - 2026-02-08

### Added
- R018 (SHOULD-agent-teams.md): Agent Teams rule for active usage when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is enabled
- Agent Teams section in CLAUDE.md.en and CLAUDE.md.ko templates
- Decision matrix for Task Tool vs Agent Teams selection

### Changed
- R010: Replace experimental Agent Teams disclaimer with active integration guidance
- index.yaml: Add missing R016, R017 entries and new R018
- index.yaml: Fix R007, R008, R009 priority mismatches (SHOULD/MAY → MUST)
- Rule counts updated from 17 to 18 across all documentation
- manifest.json: Updated rule file count (18 → 19) and timestamp

## [0.5.0] - 2026-02-07

### Added
- Recreated `verify-sync.sh` for read-only template drift detection (replaces deleted version)

### Fixed
- Fix init empty directories bug: `createDirectoryStructure()` pre-created empty dirs causing `installComponent()` to skip file copying for agents, skills, guides, rules, hooks, contexts
- Fix `CLAUDE_SUBDIR_COMPONENTS` missing agents and skills entries in init.ts
- Fix Issue Analyzer workflow missing @anthropic-ai/sdk (Closes #35)
- Fix Release Notes Generator workflow missing @anthropic-ai/sdk (Closes #34)
- Fix sync-check CI workflow referencing deleted verify-sync.sh

### Removed
- Remove deprecated `pipelines` and `examples` directories and all references
- Remove `--production` flag from workflow bun install steps

## [0.4.0] - 2026-02-06

### Added
- Reusable workflow push-guards (prevent phantom CI failures on push)
- mgr-claude-code-bible agent to documentation and tables

### Changed
- Replace all hardcoded "baekgom-agents" references with generic names in templates
- Genericize template project names (my-project, AI Agent System)
- Update sourceRepo URLs to oh-my-customcode
- Fix slash command names to match actual skills (/audit-agents, /dev-review, /sauron-watch)
- Documentation validator uses fs.readdirSync instead of Bun Glob (CI compatibility)

### Removed
- Custom Pipelines section from READMEs (feature was removed)
- Pipeline references from project structure and commands
- sync.sh, sync.sh.example, verify-sync.sh (unused sync scripts)
- tutor-go agent references (agent doesn't exist)

### Fixed
- Rule counts: 18 → 17 (MUST 11, SHOULD 5, MAY 1)
- Agent name typos in README_ko (db-expert → db-supabase-expert, qa-qa-* → qa-*)
- Manager agent count: 6 → 7 (added mgr-claude-code-bible)
- R010 orchestrator coordination rule: all file modifications must be delegated

## [0.3.2] - 2026-02-05

### Changed
- Sync templates from source (36 files updated)
- Release workflow requires CHANGELOG.md entry (fails if missing)
- Branch protection rules simplified to Lint + Test only

### Fixed
- CI: Skip duplicate npm publish if version already exists

## [0.3.1] - 2026-02-05

### Fixed
- Increase e2e test timeout from 10s to 30s to prevent CI timeouts

## [0.3.0] - 2026-02-05

### Added
- Claude API automation workflows (#17)
  - Issue analyzer workflow (Claude-powered)
  - Documentation validator workflow
  - Release notes generator workflow
- Language toggle links in READMEs (English ↔ Korean)

### Changed
- Sync-check runs daily at 04:00 KST with private repo access
- CI simplified to macOS only with consolidated coverage checks
- Clarified release branch publishing workflow in CONTRIBUTING.md
- Release workflow skips publish if version already exists

### Removed
- CodeRabbit integration (too heavy for this project)

## [0.2.1] - 2026-01-28

### Fixed
- Bug fixes and stability improvements

## [0.2.0] - 2026-01-28

### Added
- Official Claude Code format support (flat agent structure)
- Updated agent count to 34
- Updated skill count to 42
- Updated guide count to 13

### Changed
- Migrated from nested to flat agent directory structure
- Updated templates to match baekgom-agents official format

## [0.1.4] - 2026-01-27

### Added

- Sync automation script (`scripts/sync-core.ts`) for baekgom-agents template synchronization
- Sub-agent model specification support in rules (R008, R009, R010)
- `[agent][model] → Tool` identification format in MUST-tool-identification
- New guide: `guides/claude-code/11-sub-agents.md`

### Changed

- Disable Windows CI test matrix for Bun stability
- Update orchestrator rules with model parameter documentation
- Update secretary and dev-lead agent definitions

### Removed

- Remove tech-reviewer agent, guide, and skill (consolidated into baekgom-agents source)
- Remove Windows-incompatible E2E and mock tests

## [0.1.3] - 2026-01-26

### Changed

- **BREAKING**: Rename CLI command from `omcc` to `omcustom`
- Update templates from baekgom-agents (37 agents, 17 skills, 12 guides)
- Add sub-agent model specification support in templates
- Improve test coverage to 99.87% (100% function coverage)
- Adjust CI coverage threshold to 99.5% for Bun V8 compatibility

### Fixed

- Remove unreachable defensive code in doctor.ts
- Fix error handling tests for installer, list, and doctor modules

## [0.1.2] - 2026-01-25

### Added

- GitHub Packages publishing (`@baekenough/oh-my-customcode`)
- Automated release notes from CHANGELOG

### Changed

- Release workflow now publishes to both npm and GitHub Packages

## [0.1.1] - 2026-01-25

### Changed

- Bump `i18next` from 24.2.3 to 25.8.0
- Bump `commander` from 12.1.0 to 14.0.2
- Bump `@biomejs/biome` from 1.9.4 to 2.3.12
- Bump `actions/checkout` from v4 to v6
- Bump `actions/setup-node` from v4 to v6
- Migrate biome.json to v2 schema

### Fixed

- Fix biome lint configuration for v2 compatibility
- Fix unused variable warnings in source files

## [0.1.0] - 2026-01-25

### Added

- **CLI Tool (`omcustom`)** - Command-line interface for managing Claude Code agent systems
  - `omcustom init` - Initialize agent system in current project
  - `omcustom init --lang ko` - Initialize with Korean language support
  - `omcustom init --backup` - Backup existing installation before init
  - `omcustom update` - Update to latest agents and skills
  - `omcustom list` - List all installed components (agents, skills, guides, rules)
  - `omcustom list --format json` - JSON output format support
  - `omcustom doctor` - Verify installation health
  - `omcustom doctor --fix` - Auto-fix common issues

- **Pre-built Agents (36 total)**
  - Orchestrator agents: planner (master), secretary, dev-lead, qa-lead
  - Manager agents: creator, updater, supplier, gitnerd, sync-checker, sauron
  - System agents: memory-keeper, naggy
  - SW Engineer/Frontend: vercel-agent, vuejs-agent, svelte-agent
  - SW Engineer/Backend: fastapi, springboot, go-backend, express, nestjs
  - SW Engineer/Language: golang, python, rust, kotlin, typescript, java21
  - SW Engineer/Tooling: npm-expert, optimizer, bun-expert
  - SW Architect: documenter, speckit-agent
  - Infra Engineer: docker-expert, aws-expert
  - QA Team: qa-planner, qa-writer, qa-engineer

- **Skills (17 total)**
  - Development best practices for Go, Python, TypeScript, Kotlin, Rust, Java
  - Backend framework skills for FastAPI, Spring Boot, Express, NestJS
  - Infrastructure skills for Docker, AWS
  - System skills for memory management, result aggregation
  - Orchestration skills for pipeline execution, intent detection

- **Guides (12 total)**
  - Reference documentation for various technologies
  - Claude Code usage guides

- **Rules (18 total)**
  - MUST rules: Safety, permissions, agent design, identification (enforced)
  - SHOULD rules: Interaction, error handling, memory integration (recommended)
  - MAY rules: Optimization guidelines (optional)

- **Multi-language Support**
  - English (default)
  - Korean (`--lang ko`)

- **Internationalization (i18n)**
  - Full i18next integration
  - Easily extensible for additional languages

- **Template System**
  - Pre-configured templates for agents, skills, guides, and rules
  - Easy customization and extension

### Changed

- Nothing yet (initial release)

### Fixed

- Nothing yet (initial release)

[Unreleased]: https://github.com/baekenough/oh-my-customcode/compare/v0.17.1...HEAD
[0.17.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.16.4...v0.17.0
[0.16.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.14.1...v0.16.4
[0.14.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.13.3...v0.14.0
[0.13.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.12.4...v0.13.0
[0.12.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.12.3...v0.12.4
[0.12.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.10.3...v0.11.0
[0.10.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.10.1...v0.10.3
[0.10.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.4...v0.10.0
[0.9.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/baekenough/oh-my-customcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/baekenough/oh-my-customcode/releases/tag/v0.1.0

# Release v0.150.0

## Highlights
- **R010 enforcement 강화** (#1208): 루트 메타 파일 위임 표준화 (`.gitignore`, `.editorconfig`, `README.md` 등) + Self-Check #5 + R015 push directive persistence 정책
- **omcustom-init tests/tsconfig.json template** (#1211): 신규 프로젝트 부트스트랩 시 `tests/` 디렉토리 타입 추론 지원
- **Investigation memos** (#1210 #1212): Agent Teams force shutdown + Background agent progress tracking 가이드 + CC upstream 추적 정착

## :wrench: Rules
- **R010 (MUST-orchestrator-coordination)**: Root Meta-File Delegation 표 추가 (`.gitignore`/`.npmrc`/`README.md` 등 specialist 매핑) + Common Violations에 "1-line edit" 핑계 anti-pattern + Self-Check #5
- **R015 (MUST-intent-transparency)**: Git Push Continuation 섹션 추가 — first-time strict, follow-up relaxed; 동일 세션 내 동일 브랜치 push directive persistence

## :books: Documentation
- `guides/agent-teams/troubleshooting.md` (NEW): graceful shutdown 5단계 절차 + tmux kill-pane fallback + isActive flag 수동 해제
- `guides/claude-code-tracking.md` (NEW): CC upstream API 추적 — Background Agent Progress API + Agent Teams Force Shutdown 후보 변경 키워드

## :file_folder: Templates
- `templates/tests/tsconfig.json` (NEW): bun-types 타입 + 상위 tsconfig.json 상속

## :brain: Memory
- `feedback_agent_teams_force_shutdown.md` (NEW): tmux kill-pane fallback 절차 — #1210
- `feedback_background_agent_progress_tracking.md` (NEW): CC upstream API 부재, workarounds + monitoring — #1212

## Resource Changes
| Resource | Before (v0.149.0) | After (v0.150.0) | Delta |
|----------|-------------------|-------------------|-------|
| Agents | 50 | 49 | -1 (count correction) |
| Skills | 121 | 121 | 0 |
| Rules | 23 | 23 | 0 |
| Guides | 57 | 58 | +1 (agent-teams 디렉토리 — claude-code-tracking은 기존 claude-code/와 별개 단일 파일) |

## Closed Issues
- #1208 — R010 violation: orchestrator direct .gitignore edit + main push policy inconsistency
- #1210 — Agent Teams graceful shutdown + tmux kill fallback 표준화 (#1206 item 2)
- #1211 — omcustom-init 템플릿에 tests/tsconfig.json 추가 (#1206 item 5)
- #1212 — Background agent 진행 추적 (CC upstream tracking) (#1206 item 7)

## Follow-up
- #1213 — installer 로직 (tests/tsconfig.json 자동 설치) — #1211 follow-up

---
_Release notes generated with Claude Code (oh-my-customcode auto-dev pipeline v2.1.0)_

# Claude Code Upstream Tracking

oh-my-customcode가 의존하는 CC upstream API/기능 추적 목록. 각 항목은 현재 workaround와 정식 API 등장 시 제거할 대상을 명시합니다.

---

## Background Agent Progress API (#1212)

### Status

- **v2.1.146 기준**: 정식 progress API 미제공
- `/bg` 흐름으로 시작한 background agent의 진행 상황을 메인 세션에서 직접 추적 불가

### Workarounds

| 방법 | 구현 | 한계 |
|------|------|------|
| stdout/stderr tail | `/tmp/.claude-bg-<id>.log` 파일을 수동으로 tail | 세션 간 log 파일 위치 불일치 가능 |
| statusline agent count | R012 statusline에 `claude agents --json` (v2.1.144+) active count segment 추가 | count만 표시, 개별 진행률 없음 |
| PostToolUse hook | `BackgroundTask` 이벤트 수신 후 별도 로그 작성 (커스텀) | hook 구현 부담, 이벤트 타입 안정성 미보장 |

### Track

- CC release note에서 background agent 관련 변경사항 모니터
- 정식 progress API 등장 시 위 workaround를 모두 제거하고 공식 API로 대체
- 후보 변경 키워드: `"background"`, `"bg agent"`, `"task progress"`, `"agent status"`

### Reference

- Issue: #1212 (#1206 item 7 분리)
- Memory: `feedback_background_agent_progress_tracking.md`
- Cycle: v0.150.0
- R012: `.claude/rules/SHOULD-hud-statusline.md` (statusline integration)

---

## Agent Teams Force Shutdown (#1210)

### Status

- **v2.1.146 기준**: `TeamDelete`에 `force` 옵션 미제공
- Graceful shutdown 실패 시 tmux kill-pane workaround 필요

### Workaround

tmux 세션 직접 kill + `isActive` flag 수동 해제 절차. 상세 절차는 `guides/agent-teams/troubleshooting.md` 참조.

### Track

- CC release note에서 TeamDelete API 변경사항 모니터
- 정식 `force` 옵션 등장 시 troubleshooting.md의 3-4단계 workaround 제거
- 후보 변경 키워드: `"TeamDelete"`, `"force shutdown"`, `"team teardown"`, `"agent kill"`

### Reference

- Issue: #1210 (#1206 item 2 분리)
- Guide: `guides/agent-teams/troubleshooting.md`
- Cycle: v0.150.0

---

## 추적 방법

### 버전 확인

```bash
# 현재 CC 버전 확인
claude --version

# 또는 CC release notes
# https://github.com/anthropics/claude-code/releases
```

### 모니터링 주기

- 각 릴리즈 사이클(`/pipeline auto-dev`) 시작 시 CC 버전 확인
- 새 버전 확인 시 이 파일의 "Status" 항목 업데이트
- Workaround 제거 가능 시 해당 항목을 "Resolved" 섹션으로 이동

---

## Resolved

> 해결된 항목은 여기에 기록합니다. 완전 제거 전 1개 릴리즈 사이클 동안 유지합니다.

현재 없음.

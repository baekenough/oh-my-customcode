# Agent Teams 트러블슈팅 가이드

## 개요

Agent Teams 운용 중 발생하는 일반적 문제와 해결책. #1206/#1210 보고 기반.

---

## Graceful Shutdown 실패

### 증상

- `shutdown_request` 발신 2회 이상에도 멤버가 idle notification만 반환
- TeamDelete 호출 시 "active members exist" 에러 → 교착 상태

### 원인

- 멤버가 long-running polling loop에 진입하여 외부 신호를 수신하지 못함
- TaskUpdate 미발신 → 코디네이터가 멤버의 실제 상태를 인식 불가
- `isActive` flag를 강제 해제할 수 있는 helper 부재

### 해결 절차

#### 1단계: 정상 graceful shutdown 시도

```
1. shutdown_request 1회 발신 (SendMessage)
2. 30초 대기 후 멤버 status 확인 (TaskList)
3. TaskUpdate(status: "completed") 응답이 오면 정상 종료 진행
```

#### 2단계: 재발신

```
1. shutdown_request 2회 발신
2. 30초 추가 대기
3. 여전히 무응답이면 3단계로 진행
```

#### 3단계: Force kill (last resort)

```bash
# 현재 세션의 tmux 목록 확인
tmux -L claude-swarm-$$ ls

# 특정 pane kill
tmux -L claude-swarm-$$ kill-pane -t <pane-id>

# 또는 전체 swarm 세션 kill
tmux -L claude-swarm-$$ kill-server
```

#### 4단계: isActive flag 수동 해제

tmux kill 후에도 TeamDelete가 실패하는 경우:

```bash
# teams 디렉토리 위치 확인
ls ~/.claude/teams/<team-id>/

# members.json에서 isActive를 false로 강제 설정
jq '.members |= map(.isActive = false)' \
  ~/.claude/teams/<team-id>/members.json \
  > /tmp/m.json \
  && mv /tmp/m.json ~/.claude/teams/<team-id>/members.json
```

> **주의**: `~/.claude/teams/` 경로는 CC 버전에 따라 다를 수 있습니다. 실제 경로는 CC 버전 릴리즈 노트에서 확인하십시오.

#### 5단계: TeamDelete 재시도

`isActive = false` 상태에서 TeamDelete를 재호출합니다. 성공 시 `~/.claude/teams/<team-id>/` 디렉토리가 자동 정리됩니다.

### 예방

- R018 Member TaskUpdate Discipline을 준수하면 코디네이터가 멤버 상태를 항상 추적 가능
- 멤버 작업 시작 시 `TaskUpdate(status: "in_progress")` 즉시 호출
- long-running loop (30초 이상) 마다 description 업데이트

---

## 멤버 무응답 (TaskUpdate 침묵)

### 증상

- 30초 이상 멤버가 `in_progress` 상태 미설정
- 다른 멤버가 동일 task를 claim 시도 → 충돌 및 중복 작업 발생
- 코디네이터가 멤버를 "dead" 로 오판하여 재spawn 시도

### 원인

- 멤버가 복잡한 계산이나 I/O에 진입한 후 TaskUpdate를 호출하지 않음
- R018 Member TaskUpdate Discipline 위반

### 해결 절차

1. TaskList로 현재 task 상태 확인
2. 해당 멤버에게 SendMessage로 상태 요청
3. 60초 이상 무응답 시 Reassign 고려 (R018 Blocked Agent Behavior 참조)

### 예방 (R018 준수)

| 시점 | 필수 호출 |
|------|-----------|
| 작업 시작 | `TaskUpdate(taskId, status: "in_progress")` |
| 30초 이상 분기/체크포인트 | `TaskUpdate(taskId, description: "<진행 상황>")` |
| 완료 | `TaskUpdate(taskId, status: "completed")` |
| 차단 시 | `TaskUpdate(taskId, description: "<차단 사유>")` + `SendMessage` |

---

## TeamDelete 후 잔여 리소스

### 증상

- TeamDelete 성공 후에도 `~/.claude/teams/` 하위에 디렉토리가 남음
- 다음 세션에서 동일 team-id 재사용 시 충돌

### 해결

```bash
# 잔여 팀 디렉토리 수동 정리
rm -rf ~/.claude/teams/<team-id>/
```

---

## CC Upstream 제한사항 (v2.1.146 기준)

| 기능 | 현황 | 대안 |
|------|------|------|
| TeamDelete `force` 옵션 | 미제공 | tmux kill-pane (3단계 절차) |
| 멤버 강제 종료 API | 미제공 | isActive flag 수동 해제 (4단계) |
| Graceful shutdown timeout 설정 | 미제공 | 30초 대기 후 수동 처리 |

CC가 정식 `force shutdown` API를 제공하면 3-4단계 workaround를 제거할 수 있습니다. 추적은 `guides/claude-code-tracking.md` 참조.

---

## Reference

- Issue: #1210 (#1206 item 2 분리)
- Cycle: v0.150.0
- Memory: `feedback_agent_teams_force_shutdown.md`
- R018: `.claude/rules/MUST-agent-teams.md` (Member TaskUpdate Discipline)
- CC Upstream Tracking: `guides/claude-code-tracking.md`

# [SHOULD] Error Handling Rules

> **Priority**: SHOULD | **ID**: R004

## Error Classification

| Level | Symptom | Response |
|-------|---------|----------|
| Warning | Task completes but needs attention | Output warning, continue |
| Error | Current task fails, others possible | Stop task, report cause, suggest alternative |
| Critical | Cannot proceed at all | Stop all, preserve state, report immediately |

## Error Report Format

```
[Error] {type} — Location: {file:line} — Cause: {cause} — Impact: {effect}
Attempted: 1. {try1} -> Failed  2. {try2} -> Failed
Recommended: {action1}, {action2}
```

## Recovery

| Type | Strategy |
|------|----------|
| Retryable | Retry up to 3x with backoff (1s, 2s, 4s), then report |
| Non-recoverable | Save state, rollback if possible, detailed report, wait for user |

> **v2.1.246+**: 비대화형 세션(`-p`, SDK, 클라우드 세션)에서 서버 오류·연결 끊김·정체로 중간에 끊긴 응답을 이제 **자동으로 이어서 완료**한다 — 이전에는 오류로 종료됐다. `/fsd` 등 무인 자율 루프의 신뢰성에 직접 영향 — 구버전에서는 네트워크 일시 장애가 자율 루프 전체를 조기 종료시킬 수 있었다. 위 표의 "Retryable" 재시도 전략이 이제 이 경로에서는 플랫폼이 자동 수행하므로, 무인 루프 중단을 관측했을 때 "재시도 로직 부재"로 오진하기 전에 이 자동-이어짐 경계(오류 종류·세션 종류)를 먼저 확인한다.

## Validation

| When | Checks |
|------|--------|
| Before action | Target exists, permissions available, dependencies met |
| After action | Expected = actual, file integrity, no side effects |

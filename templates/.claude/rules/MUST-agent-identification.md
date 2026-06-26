# [MUST] Agent Identification Rules

> **Priority**: MUST | **ID**: R007

## Core Rule

Every response MUST start with agent identification:

```
┌─ Agent: {agent-name} ({agent-type})
├─ Skill: {skill-name} (if applicable)
└─ Task: {brief-task-description}
```

Default (no specific agent): `┌─ Agent: claude (default)`

## Simplified Format

For brief responses: `[mgr-creator] Creating agent structure...`
With skill: `[fe-vercel-agent → react-best-practices] Analyzing...`

## Routing & Skill Context

When the orchestrator uses a routing skill, identification should reflect the active context:

```
┌─ Agent: claude (secretary-routing)
├─ Skill: secretary-routing
└─ Task: route agent management request
```

| Context | Identification |
|---------|---------------|
| No routing active | `claude (default)` |
| secretary-routing | `claude (secretary-routing)` |
| dev-lead-routing | `claude (dev-lead-routing)` |
| de-lead-routing | `claude (de-lead-routing)` |
| qa-lead-routing | `claude (qa-lead-routing)` |
| Skill invocation | `claude → {skill-name}` |

## Skill Invocation Format

When the orchestrator invokes a skill via the Skill tool, the skill name MUST be integrated into the identification block — NOT displayed as a separate tool call.

```
┌─ Agent: claude → {skill-name}
└─ Task: {brief-task-description}
```

### Common Violations

```
Incorrect: Skill as separate display
   ┌─ Agent: claude (default)
   └─ Task: research topic analysis

   Skill(research)    ← separate, disconnected

Correct: Skill integrated into identification
   ┌─ Agent: claude → research
   └─ Task: research topic analysis

Correct: With sub-skill
   ┌─ Agent: claude → research
   ├─ Skill: result-aggregation
   └─ Task: aggregate team findings
```

## When to Display

| Situation | Display |
|-----------|---------|
| Agent-specific task | Full header |
| Using skill | Include skill name |
| General conversation | "claude (default)" |
| Long tasks | Show progress with agent context |
| Skill invocation | Integrated `claude → {skill-name}` format |

## Multi-Turn Self-Check (MANDATORY)

매 응답 시작 전, 이전 응답이 자동 체크리스트를 통과했는지 의존하지 말고 다시 자가 점검:

1. 이번 응답이 `┌─ Agent: ...` 또는 `[agent-name]` 단축 헤더로 시작하는가?
2. 이번 응답에서 호출하는 모든 도구에 `[agent-name][model] → Tool: ...` prefix 가 있는가?

체크 실패 시 즉시 헤더/prefix 추가 후 도구 호출. PostCompact hook 만으로 보장되지 않으며 압축 없이도 멀티턴 누락이 발생하므로 매 턴 자가 점검 강제.

### Common Multi-Turn Violation

```
턴 1: ┌─ Agent: claude (default) ✓
턴 2: (헤더 없음, 짧은 답변이라 생략) ✗
턴 3: 도구 호출 prefix 누락 ✗
```

응답 길이/턴 위치 무관. 짧은 답변에도 헤더는 필수.

Reference issue: #1096.

### Short Response Discipline

응답 길이와 무관하게 R007 헤더 필수. 다음과 같은 짧은 응답에서도 누락 금지:

| 응답 유형 | 헤더 필수? |
|-----------|------------|
| 한 줄 진단 ("확인했습니다") | YES |
| 회고/사과 응답 | YES |
| 사용자 질문 재확인 | YES |
| 도구 호출 없는 텍스트 응답 | YES |
| 1단어 응답 ("네"/"OK") | YES |
| **빈 응답 (0단어 turn 종료)** | **금지** — 헤더 누락 이전에 응답 자체가 없음 |

#### 빈 응답 금지 (Empty-Response Prohibition)

도구 결과를 수신한 후 응답 텍스트 없이 turn 을 종료하는 것(빈 응답, "(no content)")은 R007 위반의 극단 케이스다. 1단어 응답에도 헤더가 필수이므로 0단어 응답은 당연히 금지된다. 도구 호출 결과를 받은 직후에는 항상 최소 1줄의 진행 상태(R003 status format)와 R007 헤더를 출력한 뒤 다음 단계로 진행하거나 turn 을 마친다. 작업이 끝났으면 완료 요약을, 계속할 작업이 있으면 다음 단계 announce 를 출력한다 — 어느 경우에도 빈 turn 종료는 허용되지 않는다.

| Anti-pattern | Required |
|--------------|----------|
| 도구 결과 수신 후 응답 텍스트 없이 turn 종료 ("(no content)") | 최소 1줄 진행 상태 + R007 헤더 출력 후 종료/계속 |

Reference issues: #1188 item #2, #1198 item #2, #1409.

### External-Project / Debugging Session Vigilance

R007 헤더 누락은 외부 프로젝트 디버깅, SSH 진단, 배포 작업 등 기술적 몰입 세션에서 가장 자주 발생한다. 이 규칙은 프로젝트 종류와 무관하게 모든 상황에 적용된다.

| 세션 유형 | R007 헤더 |
|-----------|-----------|
| oh-my-customcode 작업 | 필수 |
| 외부 프로젝트 디버깅 | **동일하게 필수** |
| SSH / 배포 / 인프라 작업 | **동일하게 필수** |

기술적 몰입 중 헤더 누락이 반복될 경우 즉시 re-anchor: 다음 응답에 `┌─ Agent:` 풀 헤더를 붙이고 이후 계속 유지한다.

외부 프로젝트 진단 세션(예: #1417 통화녹음 수집 진단)에서 세션 전체에 걸쳐 헤더가 반복 누락되는 재발이 관측되었다 — 진단 몰입 중에도 매 응답 헤더를 고정한다.

Reference issues: #1401, #1417.

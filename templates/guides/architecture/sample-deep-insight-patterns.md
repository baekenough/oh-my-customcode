# sample-deep-insight — Pattern Reference

> Source: #975 (AWS aws-samples/sample-deep-insight)
> Scope: REFERENCE — 직접 내재화 비권장 (AWS Bedrock/AgentCore 종속)

## Architecture Summary

AWS Korea SA 팀 공개 샘플. Strands SDK + Amazon Bedrock 기반 계층형 multi-agent 시스템:

```
Coordinator
  └─ Planner
       └─ Supervisor
            └─ Tool agents (N개)
```

### Key Components

| 컴포넌트 | 역할 | omcustom 유사 개념 |
|---------|------|-------------------|
| Coordinator | 최상위 조율, HITL 체크포인트 | orchestrator (main conversation) |
| Planner | 계획 수립, 단계 분해 | deep-plan skill |
| Supervisor | 하위 도구 에이전트 관리 | dag-orchestration skill |
| Tool agents | 실제 실행 단위 | lang-*/be-*/de-* expert |

## Patterns Worth Adopting

### 1. HITL Plan Review (Human-in-the-Loop)

계획 단계에서 사람이 승인/수정 후 실행하는 게이트.

omcustom 적용 후보: `ambiguity-gate` skill 보강 또는 pipeline 체크포인트 강화.

```
Planner → [HITL Gate] → Supervisor → execution
         ↑ 사람이 플랜 수정 가능
```

### 2. Per-Agent Token Tracking

에이전트별 캐시 read/write 세부 토큰 추적.

omcustom 적용 후보: `token-efficiency-audit` skill 개선 힌트.

```python
# 참고 패턴 (개념)
agent_metrics = {
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "output_tokens": 0
}
```

### 3. Skill System (Lazy Discovery)

에이전트가 필요한 스킬을 런타임에 발견하는 패턴.

omcustom의 기존 skill loading 구조와 이미 정합. 추가 작업 불필요.

### 4. Custom Code Interpreter

격리된 컨테이너(Fargate)에서 코드 실행.

omcustom 유사 개념: harness-synthesizer의 2-stage isolation (#986).

## Patterns to Avoid

| 패턴 | 이유 |
|------|------|
| AgentCore Runtime 직접 종속 | AWS 생태계 락인, 로컬 Claude Code 철학과 충돌 |
| Cognito/CloudFront 기반 Web UI | omcustom-web + team-auth 스택으로 대체 가능 |
| Bedrock 전용 모델 호출 | Claude Code native API와 이중화 비효율 |

## Recommendation

패턴 참조로만 활용. 직접 채용 대신:

1. **HITL Plan Review** → 별도 이슈로 ambiguity-gate 강화 검토
2. **Token Tracking** → token-efficiency-audit 개선 이슈로 등록 후보

## Cross-references

- #975 (source issue)
- ambiguity-gate skill
- token-efficiency-audit skill
- harness-synthesizer skill (2-stage isolation — #986)
- deep-plan skill

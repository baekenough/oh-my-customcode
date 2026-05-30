# Google Agents CLI — Pattern Reference

> Source: #971 (news.hada.io/topic?id=28817)
> Scope: REFERENCE — Google Cloud 종속, 직접 내재화 비권장

## What It Is

ADK/MCP/A2A/Agent Runtime 기반 메타 툴. Gemini CLI 또는 Claude Code에 7가지 스킬을 주입하는 구조:

| # | 스킬 | 설명 |
|---|------|------|
| 1 | 워크플로우 설계 | 에이전트 플로우 시각화 |
| 2 | ADK 코드 작성 | Google ADK 기반 에이전트 코드 생성 |
| 3 | 스캐폴딩 | 프로젝트 구조 자동 생성 |
| 4 | 평가 | 에이전트 성능 측정 |
| 5 | 배포 | Google Cloud Agent Runtime 배포 |
| 6 | Enterprise 퍼블리싱 | Gemini Enterprise 등록 |
| 7 | 관측성 | 로그/트레이스 수집 |

## Patterns Worth Referencing

### 1. Discovery-First 설계 원칙

에이전트를 만들기 전에 "왜 이 에이전트가 필요한가"를 먼저 확립하는 접근.

omcustom 적용 후보: `mgr-creator` 출력에 설계 근거(rationale) 섹션 추가.

```markdown
# [에이전트명]

## Why This Agent Exists
<!-- mgr-creator가 생성 시 자동 채움 -->
- Problem: {해결하는 문제}
- Alternative considered: {검토한 대안}
- Chosen because: {선택 이유}
```

### 2. 메타 툴 범용성 (특정 에이전트 무종속)

스킬이 특정 에이전트 런타임에 묶이지 않고 Gemini/Claude Code 양쪽에서 재사용 가능한 설계.

omcustom 관련성: 현재 skills는 Claude Code 전용으로 설계되어 있으나, 범용 설계 원칙은 참고 가치 있음.
외부 코딩 에이전트(Codex, Gemini CLI) 재사용 확장 검토 시 참고.

### 3. 정보 수렴 패턴

여러 에이전트의 출력을 단일 synthesizer가 통합하는 구조.

omcustom에 이미 구현됨: `result-aggregation` skill. 추가 작업 불필요.

## Why Not Direct Adoption

| 컴포넌트 | 종속 대상 | omcustom 대안 |
|---------|----------|--------------|
| ADK | Google Cloud SDK | Claude Code native API |
| A2A protocol | Google 사양 | SendMessage (Agent Teams) |
| Agent Runtime | Google Cloud 배포 전용 | 로컬 Claude Code + k3s |
| Gemini Enterprise | Gemini 생태계 | Anthropic Console |

omcustom은 로컬 Claude Code 중심 철학 → 종속 컴포넌트 직접 채용 가치 낮음.

## Recommendation

두 패턴만 선택적 참조:

1. **Discovery-First** → mgr-creator 프롬프트 템플릿 업데이트 후보 (future issue)
2. **메타 툴 범용성** → 외부 코딩 에이전트 재사용 확장 가능성 검토 (future issue)

나머지 5가지 스킬(ADK 코드 작성, 배포, Enterprise 퍼블리싱 등)은 Google Cloud 생태계 전용이므로 스킵.

## Cross-references

- #971 (source issue)
- mgr-creator 에이전트 (`.claude/agents/mgr-creator.md`)
- result-aggregation skill

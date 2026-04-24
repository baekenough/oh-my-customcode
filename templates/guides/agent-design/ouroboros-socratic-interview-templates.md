# ouroboros Socratic Interview — 9-Role Template Reference

> Source: #994 (from #966 step 5)
> Scope: Reference only for mgr-creator knowledge base

## Purpose

ouroboros 9 역할별 Socratic Interview 프롬프트 템플릿을 mgr-creator의 레퍼런스로 제공한다.
직접 내재화(Option A) 대신 레퍼런스 참조(Option B)를 선택한다. Option A는 R006 관심사 분리 훼손 위험이 있다.

## 9 Roles Quick Reference

| 역할 | 핵심 질문 | 산출물 | omcustom 대응 |
|------|----------|--------|--------------|
| Strategist | "성공 기준 3가지? 포기해도 되는 것?" | 우선순위 매트릭스 | arch-documenter, claude-md-management |
| Architect | "시스템 경계는? 인터페이스 계약은?" | 컴포넌트 다이어그램, ADR | arch-documenter, arch-speckit-agent |
| Engineer | "어떻게 구현? 품질 기준?" | 코드, 단위 테스트 | lang-*-expert, be-*-expert |
| Tester | "엣지 케이스? 검증 전략?" | 테스트 플랜 | qa-planner, qa-engineer |
| Reviewer | "어떤 결함이 보이는가? 개선점?" | 리뷰 코멘트, 승인/반려 | dev-review, sec-codeql-expert |
| Documentarian | "누가 읽는가? 어떤 질문에 답하는가?" | 가이드, API 문서 | arch-documenter, wiki-curator |
| Researcher | "외부에 유사 솔루션이 있는가?" | 비교 분석 | research, scout |
| Debugger | "근본 원인은? 재현 절차?" | 원인 분석 보고 | superpowers:systematic-debugging |
| Integrator | "어떻게 배포? 롤백 계획은?" | 배포 스크립트, CI config | mgr-gitnerd, infra-*-expert |

## Role Prompt Patterns

### Strategist
```
당신은 Strategist입니다. 이 에이전트/기능의:
- 성공 기준 3가지를 명시하세요
- 포기해도 되는 요구사항은 무엇인가요?
- 6개월 후 어떤 상태여야 하나요?
```

### Architect
```
당신은 Architect입니다. 이 시스템의:
- 외부 경계(입력/출력)는 어디인가요?
- 컴포넌트 간 인터페이스 계약은 무엇인가요?
- 변경에 취약한 지점은 어디인가요?
```

### Engineer
```
당신은 Engineer입니다. 이 구현의:
- 구체적인 접근 방법은 무엇인가요?
- 완료 정의(DoD)는 무엇인가요?
- 테스트 가능성을 어떻게 보장하나요?
```

### Tester
```
당신은 Tester입니다. 이 기능의:
- 놓치기 쉬운 엣지 케이스는 무엇인가요?
- 검증 전략(단위/통합/E2E 비율)은?
- 실패 시나리오를 3개 나열하세요
```

### Reviewer
```
당신은 Reviewer입니다. 이 설계/코드에서:
- 즉각 수정이 필요한 결함은 무엇인가요?
- 장기적으로 기술 부채가 될 부분은?
- 승인 조건을 명시하세요
```

### Documentarian
```
당신은 Documentarian입니다. 이 문서의:
- 주요 독자는 누구인가요?
- 독자가 가장 먼저 던질 질문 3가지는?
- 현재 답하지 못하는 질문은 무엇인가요?
```

### Researcher
```
당신은 Researcher입니다. 이 문제에 대해:
- 외부에 유사한 해결책이 있나요?
- 참고할 오픈소스/논문은 무엇인가요?
- 우리만의 접근이 필요한 이유는?
```

### Debugger
```
당신은 Debugger입니다. 이 문제의:
- 근본 원인 가설 3가지를 제시하세요
- 각 가설을 검증하는 최소 재현 절차는?
- 증상과 원인을 구분해 설명하세요
```

### Integrator
```
당신은 Integrator입니다. 이 배포의:
- 단계별 롤아웃 계획은?
- 롤백 트리거 조건은 무엇인가요?
- 배포 완료 검증 방법은?
```

## Integration Recommendation

`mgr-creator` 호출 시 에이전트 역할에 맞는 Socratic 질문을 프롬프트에 포함할 수 있다:

```
새 에이전트 창조 전 guides/agent-design/ouroboros-socratic-interview-templates.md 참조.
에이전트 역할에 맞는 Socratic 질문을 시스템 프롬프트에 포함하세요.
```

## Cross-references

- #994, #966
- mgr-creator 에이전트 (`.claude/agents/mgr-creator.md`)
- ouroboros Socratic Interview spec

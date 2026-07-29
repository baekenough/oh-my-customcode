# Claude Fable 5 프롬프팅 가이드

> 출처: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5
> 범위 제한: 이 문서는 위 출처 URL에 대한 이슈 #1435 본문 요약만을 소스로 합니다. 공식 문서 원문을 직접 확인하지 못했으므로, 코드 스니펫이나 세부 예시 문구를 추측으로 채우지 않습니다. 구체적인 프롬프트 원문이 필요하면 출처 URL을 직접 확인하세요.

## 개요

Claude Fable 5(`claude-fable-5`)는 Mythos-class 모델로, **Opus 4.8 대비** 상위 티어의 GA 역량을 가집니다(GA 시점 기준, R006 Model Aliases 참조). **Opus 5**(`claude-opus-5`, CC v2.1.219+에서 도입되어 현재 CC의 기본 Opus 모델)와의 상대 위계는 공식 자료로 확인되지 않았으므로, 이 문서는 어느 쪽이 상위 티어인지 단정하지 않습니다. Fable 5는 기존 모델 대비 다른 행동 프로파일을 가지므로, 기존 Opus/Sonnet용으로 튜닝된 하네스(rules, skills, system prompt)를 그대로 재사용하면 오히려 품질이 저하될 수 있습니다. 이 문서는 Fable 5 전용 프롬프팅·스캐폴딩 조정 패턴을 정리합니다.

## Opus 4.8 대비 행동 차이

| 항목 | 차이 |
|------|------|
| Long-horizon autonomy | 장시간 자율 작업 수행 능력 향상 — 중간 개입 없이 더 긴 turn을 유지 |
| 병렬 서브에이전트 dispatch | 병렬 서브에이전트 위임의 신뢰성 향상 |
| Instruction following | 지시 준수력이 더 강함 — 규범적(prescriptive) 지시에 더 문자적으로 반응 |

Instruction following이 강해졌다는 것은 장점이자 위험 요인입니다. 장문·과잉 규범적 지시를 그대로 유지하면, Fable 5는 이를 문자 그대로 따르려 하면서 불필요한 형식적 준수에 리소스를 쓰거나, 자연스러운 판단력을 발휘하지 못할 수 있습니다(아래 "핵심 경고" 참조).

## 프롬프팅/하네스 튜닝 패턴

| 패턴 | 설명 | oh-my-customcode 매핑 |
|------|------|------------------------|
| (a) Longer turns 허용 | Long-horizon autonomy를 살리기 위해 turn을 짧게 강제로 끊지 않음 | R009 대규모 작업 분해와 균형 — 도메인 분해는 유지하되 개별 에이전트 turn 길이는 과도하게 제한하지 않음 |
| (b) Effort 전략 | 작업 복잡도에 맞는 effort 레벨 설정 | R006 `effort` frontmatter 필드 — 신규 콘텐츠 (effort 전략 구체화는 이 가이드가 보완) |
| (c) 간결 지시 우선 | 장문·규범적 지시보다 간결하고 명확한 지시가 더 나은 결과를 냄 | R023 shift-left 정신과 정합 — 신규 콘텐츠, "핵심 경고" 섹션 참조 |
| (d) 진행 주장 ground-truth 강제 | "완료했다"는 주장을 실제 산출물로 검증하도록 지시 | R020 완료 검증(Completion Verification)이 이미 선점 — 개념 중복 아닌 보완 |
| (e) Boundary 명시 | 허용/금지 행동 경계를 명시적으로 진술 | R010 Pre-Delegation Privileged-Scope Boundary가 이미 선점 — 보완 |
| (f) 병렬 서브에이전트 | 독립 작업의 병렬 위임 활용 | R009 병렬 실행이 이미 선점 — Fable 5는 병렬 dispatch 신뢰성이 향상되어 R009 효과가 더 커짐 |
| (g) 파일 기반 메모리 | 세션 간 지속성을 위한 파일 기반 메모리 활용 | R011 네이티브 auto memory가 이미 선점 — 보완 |
| (h) Early-stopping/context-budget 방지 문구 | 조기 종료나 컨텍스트 예산 소진으로 인한 작업 중단을 막는 명시적 문구 | 신규 콘텐츠 — R013 ecomode의 context budget 관리와 함께 검토 가치 있음 |
| (i) Intent 컨텍스트 제공 | 작업의 배경 의도(왜 이 작업이 필요한지)를 함께 제공 | 신규 콘텐츠 — R015 Intent Transparency와는 반대 방향(에이전트→사용자가 아니라 사용자/오케스트레이터→에이전트로 의도 전달) |
| (j) 가독성 addendum | 응답 가독성을 높이는 보충 지시 | 신규 콘텐츠 |
| (k) Send-to-user 도구 | 사용자에게 직접 메시지를 보내는 전용 도구 활용 | 신규 콘텐츠 — oh-my-customcode에는 현재 대응 도구 없음(향후 검토 후보) |

## 핵심 경고: 과잉 처방(over-prescription)이 오히려 품질을 저하시킨다

Fable 5는 instruction following이 강하기 때문에, 기존 스킬/룰이 지나치게 규범적(too prescriptive)이면 — 즉 세부 절차를 과도하게 명시하면 — 오히려 Fable 5의 자연스러운 판단력과 long-horizon autonomy 이점을 깎아먹고 품질이 저하될 수 있습니다.

**본 프로젝트 함의**: oh-my-customcode는 `.claude/rules/` 하위에 R000~R023의 장문·규범적 규칙 세트를 보유하고 있습니다. Fable 5를 오케스트레이터 또는 서브에이전트 모델로 채택할 경우:

- 규칙 자체를 축소할 필요는 없지만(다른 모델과의 호환성 유지 필요), Fable 5 대상 에이전트에 전달하는 위임 프롬프트는 규칙 원문을 그대로 재인용하기보다 핵심 제약만 간결하게 요약하는 방식을 우선 검토합니다.
- 신규 Fable 5 전용 에이전트/스킬을 설계할 때는 절차를 과도하게 세분화하지 않고, 목표와 경계(boundary)만 명시한 뒤 판단은 모델에 위임하는 방향을 우선 고려합니다.
- 이 경고는 R023(검증 비용 ladder)의 shift-left 원칙과는 다른 축입니다 — R023은 "어떤 비용으로 검증할지", 이 경고는 "얼마나 규범적으로 지시할지"를 다룹니다.

## GA 사양

| 항목 | 값 |
|------|-----|
| Model ID | `claude-fable-5` |
| GA 일자 | 2026-06-09 |
| 기본 컨텍스트 | 1M 토큰 (기본 포함 — `[1m]` suffix 불필요, R006 Model Aliases 각주 참조) |
| 가격 | $10 / $50 per Mtok |
| 안전 체계 | 안전 분류기 + `stop_reason: "refusal"` fallback |

### Mythos 5 (`claude-mythos-5`)

Mythos 5는 Project Glasswing 한정 공급 모델로, **GA가 아닙니다**. Fable 5(GA)와 혼동하지 않도록 주의합니다.

## 상호 참조

- **R006** (MUST-agent-design.md) — Model Aliases 표에 `fable` alias 정의, effort/model 기본값 정책; Opus 5(v2.1.219+) 도입 및 Fable 5 대비 상대 위계 미확인 각주도 포함
- **R023** (SHOULD-verification-ladder.md) — 검증 비용 ladder shift-left 원칙. 이 문서의 "과잉 처방 경고"는 검증 비용이 아닌 지시 간결성 축이므로 R023과 직교하되 상호 참조 가치가 있음
- **R009** (MUST-parallel-execution.md) — long-lived subagent 재사용 및 병렬 서브에이전트 dispatch 신뢰성 향상과 연관
- **R020** (MUST-completion-verification.md) — 진행 주장 ground-truth 강제 패턴(d)의 기존 선점 규칙
- **R010** (MUST-orchestrator-coordination.md) — boundary 명시 패턴(e)의 기존 선점 규칙(Pre-Delegation Privileged-Scope Boundary)
- **R011** (SHOULD-memory-integration.md) — 파일 기반 메모리 패턴(g)의 기존 선점 규칙(네이티브 auto memory)

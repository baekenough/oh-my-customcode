# Compound AI Workflow

> 모든 완료된 artifact가 다음 세션의 context로 누적된다.

Eugene Yan의 ["How to Work and Compound with AI"](https://eugeneyan.com/writing/working-with-ai/)에서 추출한 5원칙을 oh-my-customcode 인벤토리에 내재화한 레퍼런스 가이드. 이 가이드는 시스템을 처음 접하는 기여자와 기존 사용자 모두를 위한 entry point 역할을 한다.

---

## 1. 개요

**compound effect**란 AI와의 모든 상호작용이 단순히 소비되지 않고, 다음 작업의 질과 속도를 높이는 재료로 누적되는 현상이다. 각 세션에서 생성된 skill, memory, guide, rule이 쌓일수록 시스템은 점점 더 빠르고 정확하게 작동한다.

oh-my-customcode는 이 원리를 아키텍처 전반에 내재화한다:

- **Skills**: 재사용 가능한 워크플로우 지식
- **Agents**: 스킬을 조합한 실행 가능한 전문가
- **Rules**: 시스템 전체에 걸친 행동 제약
- **Memory**: 세션 간 누적되는 패턴과 피드백

---

## 2. Eugene Yan 5원칙

### 원칙 1: Context Infrastructure

구조화된 디렉토리와 annotated indices가 AI에게 풍부한 컨텍스트를 제공한다. 파일이 어디에 있는지, 무슨 역할인지를 AI가 스스로 파악할 수 있도록 레이아웃과 색인이 설계되어야 한다. 임시 파일과 unstructured dump는 AI의 추론 품질을 떨어뜨린다. 잘 정비된 디렉토리 구조는 AI가 "기억 없이도" 프로젝트를 이해하게 만드는 구조적 기억이다.

### 원칙 2: Taste as Configuration

AI의 출력 품질은 사용자의 취향(taste)을 얼마나 잘 설정했느냐에 달려 있다. CLAUDE.md와 규칙 파일은 이 취향을 코드화한 것이다. 스타일, 언어 정책, 금지된 패턴, 선호하는 위임 방식을 선언적으로 정의하면 AI는 매 세션마다 동일한 기준으로 작동한다. 취향은 대화로 가르치는 것이 아니라 설정으로 배포하는 것이다.

### 원칙 3: Verification Ladders

검증은 비용 순서대로 쌓인 사다리여야 한다. 가장 저렴한 결정론적 검사가 먼저 통과되어야 비싼 LLM 검토로 이어진다. hooks, linters, type-checker가 잡을 수 있는 오류를 sonnet/opus에 보내는 것은 낭비다. shift-left 원칙: 문제를 발견하는 시점을 최대한 앞으로 당긴다. 자세한 내용은 R023 (SHOULD-verification-ladder)를 참조.

### 원칙 4: Scaled Delegation

위임의 깊이는 작업의 크기와 위험도에 비례해야 한다. 간단한 파일 편집은 pair-programming 스타일로 직접 호출하고, 복잡한 다단계 작업은 `/pipeline auto-dev`로 완전 위임한다. 위임 스펙트럼을 이해하고 올바른 깊이를 선택하는 것이 AI 협업 효율의 핵심이다.

### 원칙 5: Loop Closure

AI와의 대화 기록(transcript)은 단순 로그가 아니라 패턴 마이닝의 원천이다. 반복적으로 수정하게 되는 패턴, AI가 자주 오해하는 패턴, 성공적인 위임 패턴을 추출해 skill로 승격시키는 것이 loop closure다. 이 루프가 닫혀야 compound effect가 발생한다.

---

## 3. oh-my-customcode 매핑표

| Yan 원칙 | 대응 자산 | 비고 |
|---------|----------|------|
| **Context Infrastructure** | `.claude/agent-memory/`, MEMORY.md, R011 (`SHOULD-memory-integration`), `wiki/` | 에이전트별 project-scoped 메모리 + wiki 색인 |
| **Taste as Configuration** | `CLAUDE.md`, `.claude/rules/` (R000-R023), `.claude/output-styles/` | 규칙 cascade: global → project → agent frontmatter |
| **Verification Ladders** | R023 `SHOULD-verification-ladder`, `deep-verify`, `multi-model-verification`, `adversarial-review`, `mgr-sauron` | Tier 1-4 shift-left ladder |
| **Scaled Delegation** | `structured-dev-cycle`, `dev-lead-routing`, `/pipeline auto-dev` | pair → stage-gated → full delegation 스펙트럼 |
| **Loop Closure** | `skill-extractor` (`--mode failure`), R016 (`MUST-continuous-improvement`), `omcustom-loop` | 패턴 채굴 → skill 승격 자동화 |

---

## 4. Compound Effect: 시스템 사고 프레이밍

oh-my-customcode는 소프트웨어 컴파일과 동일한 구조를 따른다:

| 컴파일 개념 | oh-my-customcode 매핑 | compound 효과 |
|-----------|---------------------|--------------|
| Source code | `.claude/skills/` | 재사용 가능한 지식 누적 |
| Build artifacts | `.claude/agents/` | 스킬 조합으로 전문가 생성 |
| Compiler | `mgr-sauron` (R017) | 구조 정합성 보장 |
| Spec | `.claude/rules/` | 빌드 규칙의 지속적 진화 |
| Linker | Routing skills | 에이전트-작업 연결 최적화 |
| Standard library | `guides/` | 공유 레퍼런스 지식 누적 |

이 메타포에서 compound effect가 발생하는 지점:

1. **세션 1**: 새 패턴 발견 → skill 초안 작성
2. **세션 2**: skill 재사용 → 작업 시간 단축
3. **세션 3**: skill 실패 패턴 채굴 → skill 개선 (R016 + skill-extractor)
4. **세션 N**: 누적된 skill/rule/memory가 신규 작업의 context로 자동 주입

각 artifact(skill, agent, guide, memory)는 독립적 가치가 아니라 **시스템 전체의 지식 밀도**를 높이는 방식으로 기여한다. 하나의 잘 작성된 skill이 10개 세션에서 반복 재사용될 때 compound effect가 실현된다.

---

## 5. Scaled Delegation 스펙트럼

위임 깊이는 작업의 복잡도, 위험도, 반복성에 따라 결정된다.

### 스펙트럼 개요

| 위임 깊이 | 패턴 | 대표 자산 | 적합한 작업 |
|---------|------|----------|-----------|
| **Pair-programming** | 직접 에이전트 호출 | 특정 에이전트 직접 지시 | 단일 파일 수정, ad-hoc 질문, 빠른 확인 |
| **Stage-gated** | structured-dev-cycle | `structured-dev-cycle` (6-stage) | 기능 구현, 리팩토링, 복잡한 버그 수정 |
| **Full delegation** | 파이프라인 자동화 | `/pipeline auto-dev` | 이슈 기반 완전 자동 개발 사이클 |

### 위임 깊이 선택 가이드

```
작업 크기 / 위험도에 따른 선택:

Low risk + 단일 파일 + 명확한 요구사항
  → Pair-programming: "이 함수의 에러 핸들링을 개선해줘"

Medium risk + 다중 파일 + 테스트 필요
  → Stage-gated: structured-dev-cycle
    [Stage 1] 분석 (Read only)
    [Stage 2] 설계 검토
    [Stage 3] 구현 (Write 허용)
    [Stage 4] 검증 (Test 실행)
    [Stage 5] 문서화
    [Stage 6] 완료 검증 (R020)

High volume + 이슈 목록 + CI 검증 가능
  → Full delegation: /pipeline auto-dev
    이슈 선택 → 자동 분석 → 구현 → PR 생성
```

### Stage-gated 상세: structured-dev-cycle

6-stage 워크플로우로 각 단계에서 도구 제한을 적용:

| 단계 | 허용 도구 | 목표 |
|------|---------|------|
| 1. Analysis | Read, Glob, Grep | 현재 상태 파악, 요구사항 명확화 |
| 2. Design | Read, EnterPlanMode | 변경 범위 결정, 아키텍처 검토 |
| 3. Implementation | Read, Write, Edit | 코드 작성, 파일 수정 |
| 4. Verification | Bash (test), Read | 테스트 실행, 정적 분석 |
| 5. Documentation | Write, Edit | 문서 업데이트, changelog |
| 6. Completion | Read | R020 완료 검증, 최종 확인 |

### Full Delegation: /pipeline auto-dev

완전 자동화 사이클. 인간 개입 없이 이슈에서 PR까지:

```
이슈 선택
  ↓
mgr-sauron: 구조 검증
  ↓
dev-lead-routing: 전문 에이전트 배정
  ↓
구현 (전문 에이전트)
  ↓
qa-planner: 검증 계획
  ↓
mgr-gitnerd: PR 생성
  ↓
wiki-curator: 문서 동기화 (R022)
```

**적합한 조건**: 명확한 이슈 스펙, 기존 테스트 커버리지, CI가 통과/실패를 판단 가능한 경우.

---

## 6. 신규 기여자 Entry Point

### 학습 경로

```
1. CLAUDE.md          → 시스템 전체 철학, 강제 규칙 요약
2. 본 가이드           → compound effect 이해, 5원칙 매핑
3. .claude/rules/      → 개별 규칙 상세 (R000-R023)
4. .claude/skills/     → 재사용 가능한 워크플로우 목록
5. .claude/agents/     → 전문 에이전트 역할과 도구 목록
6. guides/             → 도메인별 레퍼런스 문서
```

### 자주 묻는 질문

**"어떤 에이전트를 사용해야 하나?"**
`/omcustom:lists`로 전체 목록 확인. 없으면 `mgr-creator`가 자동 생성.

**"새 skill을 추가하고 싶다"**
`mgr-creator`에게 위임. R006 (MUST-agent-design) 준수 필수.

**"AI가 같은 실수를 반복한다"**
R016 (MUST-continuous-improvement): 룰 업데이트 → commit. `skill-extractor --mode failure`로 패턴 채굴.

**"작업이 너무 오래 걸린다"**
R009 (MUST-parallel-execution): 독립 작업 2개 이상은 병렬 실행 필수.

**"컨텍스트가 너무 길어졌다"**
R013 (SHOULD-ecomode): 80% 이상에서 자동 활성화. `/compact` 또는 ecomode on.

---

## 7. 참고

| 항목 | 링크 |
|------|------|
| Eugene Yan 원글 | https://eugeneyan.com/writing/working-with-ai/ |
| 관련 이슈 | #1172 (scout:internalize compound-ai-workflow) |
| R023 Verification Ladder | `.claude/rules/SHOULD-verification-ladder.md` |
| R016 Continuous Improvement | `.claude/rules/MUST-continuous-improvement.md` |
| R011 Memory Integration | `.claude/rules/SHOULD-memory-integration.md` |
| R013 Ecomode | `.claude/rules/SHOULD-ecomode.md` |
| skill-extractor | `.claude/skills/skill-extractor/SKILL.md` |
| structured-dev-cycle | `.claude/skills/structured-dev-cycle/SKILL.md` |
| 관련 메모리 | [[project-sequencing-alpha-beta-gamma]] |

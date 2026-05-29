# ECC 흡수 결정 아카이브

> **목적**: ECC (Everything Claude Code) 패턴 흡수 검토 이력 보존.
> 미래 기여자가 "왜 흡수했는가 / 왜 거부했는가"를 재검토 없이 파악할 수 있도록 합니다.
>
> 관련 Epic: #1170 (closed), 분리 이슈: #1176

---

## 1. 개요

oh-my-customcode는 **compilation metaphor**를 핵심 아키텍처 철학으로 채택합니다.
ECC (Everything Claude Code) 등 외부 도구의 패턴을 흡수할 때, 이 철학과의 정합성이
흡수 여부의 1차 판단 기준입니다.

| 판단 기준 | 설명 |
|----------|------|
| metaphor 정합성 | `.claude/` 구조를 컴파일러 metaphor로 강화하는가 |
| single-maintainer 비용 | 외부 의존성 추적 부담이 감당 가능한가 |
| 사용자 가치 | 기존 사용자 워크플로우를 개선하는가 |
| 차별점 영향 | ECC와 직접 경쟁(zero-sum)이 되는가 |

본 문서는 v0.142.0 ~ v0.143.0 기간에 검토된 4개 패턴의 결정을 기록합니다.

---

## 2. 흡수된 패턴 (v0.142.0)

### 2-1. sec-agentshield-wrapper (sub-issue #1174)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v0.142.0 |
| 흡수 형태 | pre-flight 보안 wrapper skill |
| 차별점 영향 | **보완** — post-write 자산(CodeQL 등)과 시점 분리 |

**결정: ACCEPT**

ECC의 `agentshield-wrapper`는 실행 전 입력 검증 레이어를 제공합니다.
oh-my-customcode의 `sec-codeql-expert`가 post-write 단계에 집중하므로,
pre-flight 단계를 담당하는 이 패턴은 compilation pipeline을 완성하는
`compiler → linker → loader` 구조에 자연스럽게 편입됩니다.
유지보수 비용: 외부 harness 의존 없음, 내부 skill로 완전 소유.

---

### 2-2. instinct-extractor (sub-issue #1175)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v0.142.0 |
| 흡수 형태 | cross-session 패턴 채굴 skill |
| 차별점 영향 | **보완** — `skill-extractor`와 trigger 분리 |

**결정: ACCEPT**

`skill-extractor`가 현재 세션의 행동 패턴을 skill로 승격한다면,
`instinct-extractor`는 누적 세션에서 반복 패턴을 자동 감지합니다.
두 도구는 trigger가 다릅니다 (단일 세션 vs 누적 히스토리).
R016 Continuous Improvement 루프를 강화하며, 내부 구조(agent-memory + 네이티브 자동 메모리)로
구현 가능하므로 외부 의존성이 없습니다. (원문에서 claude-mem 언급은 #1253에 의해 제거됨)

---

### 2-3. manifest-install --profile (sub-issue #1177)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v0.142.0 |
| 흡수 형태 | manifest profiles 5종 |
| 차별점 영향 | **보완** — deactivation 비용 축소 |

**결정: ACCEPT**

신규 사용자의 진입 비용을 낮추는 profile 기반 설치 패턴입니다.
`--profile minimal`, `--profile de`, `--profile qa` 등 도메인별 subset을
한 번에 활성화합니다. deactivation 비용 문제(한 번 설치된 skill이 불필요해도
삭제 경로가 불명확)를 profile 전환으로 해소합니다.
cross-harness export 거부(#1176)로 발생하는 진입로 공백을 부분 보완합니다.

---

## 3. 거부된 패턴 — Cross-harness Export (#1176)

### 3-1. 개요

ECC는 oh-my-customcode의 `.claude/` 구조를 Cursor, Aider, Codex, Opencode 등
8개 외부 harness 포맷으로 export하는 기능을 제공합니다.
이 패턴을 oh-my-customcode가 흡수할 경우, 내부에 cross-harness export 레이어가
추가됩니다.

---

### 3-2. 분석

**R006 compilation metaphor 영향**

oh-my-customcode의 아키텍처는 다음 매핑을 따릅니다:

```
Source code     → .claude/skills/
Build artifacts → .claude/agents/
Compiler        → mgr-sauron (R017)
Spec            → .claude/rules/
```

cross-harness export를 흡수하면 이 compiler가 N개의 target backend(Cursor,
Aider, Codex 등)를 추가로 지원해야 합니다. 이는 **단일 target 컴파일러에서
multi-target 크로스 컴파일러로의 전환**을 의미합니다.

multi-target 전환의 결과:
- 각 외부 harness의 구조 변경이 oh-my-customcode build system에 직접 영향
- metaphor의 순수성 훼손 (compiler가 external spec을 추적해야 함)
- mgr-sauron (R017) 검증 범위가 외부 harness 포맷으로 확장

**single-maintainer 비용**

외부 harness들은 변동성이 높습니다:

| Harness | 변동 리스크 |
|---------|------------|
| Cursor | 에이전트 폴더 구조 자주 변경 |
| Aider | `.aider` 설정 포맷 semi-annual 변경 |
| Codex | OpenAI 정책 변경 직접 반영 |
| Opencode | 초기 단계, 구조 unstable |

각 harness의 breaking change가 발생할 때마다 R016 (Continuous Improvement)
워크플로우가 트리거됩니다. single-maintainer 환경에서 이는 **core feature
개발 시간의 경쟁 비용**이 됩니다.

**사용자 가치 trade-off**

| 가치 | 유형 |
|------|------|
| 신규 사용자 진입로 확장 | 신규 사용자 |
| 기존 harness 자산 재활용 | 멀티 harness 사용자 |
| ECC와 기능 중복 | zero-sum 경쟁 |

신규 사용자 진입로 문제는 `manifest-install --profile`(#1177)으로 부분 해소됩니다.
멀티 harness 사용자는 ECC를 직접 사용하는 것이 더 효과적입니다.

---

### 3-3. 결정: REJECT (DEFER 옵션 존재)

**권고: REJECT**

거부 사유 (우선순위 순):

1. **compilation metaphor 순수성 보호**
   cross-harness export는 oh-my-customcode의 핵심 차별점인 compilation metaphor를
   직접 훼손합니다. 이 metaphor는 관심사 분리(R006)의 철학적 기반입니다.

2. **ECC와의 zero-sum 경쟁 회피**
   ECC는 이미 이 패턴의 원천(export source)입니다. 흡수하면 동일 기능으로
   경쟁하는 구조가 되며, 두 도구의 차별화가 희석됩니다.

3. **single-maintainer R016 부담**
   외부 harness 8개의 변동을 추적하는 비용이 core feature R016 루프에 경쟁합니다.
   현재 기여자 구성(single-maintainer)에서는 감당 불가 수준으로 판단됩니다.

4. **진입로 문제 대체 해소**
   #1177 `manifest-install --profile`이 신규 사용자 진입 비용을 낮추는 대안으로
   이미 흡수되었습니다.

---

### 3-4. 대안 경로 (DEFER 시나리오)

다음 조건이 충족될 때 재검토를 권장합니다:

| 조건 | 임계값 | 현재 (2026-05-18) |
|------|--------|------------------|
| 한국어 사용자 비율 | 50%+ | 미집계 |
| 외부 기여자 수 | 5명 이상 | 미집계 |

DEFER 기간 동안의 cross-tool integration 우회 경로:

- **RTK proxy skill**: 기존 infra 활용, Cursor 등에서 oh-my-customcode skill 호출
- **Codex/Gemini exec skill**: 외부 LLM executor를 skill로 래핑, harness 종속성 없음

이 우회 경로는 full export와 동일한 가치를 제공하지 않지만,
R016 부담 없이 80% 이상의 use case를 커버합니다.

---

## 4. Cross-harness 거부의 의도된 결과

이 결정으로 두 도구의 포지셔닝이 명확해집니다:

| 도구 | 포지션 |
|------|--------|
| **oh-my-customcode** | compilation metaphor pure-play — `.claude/` 생태계 전문화 |
| **ECC** | cross-harness pragmatist — 다양한 harness 간 이식성 제공 |

사용자는 목적에 따라 도구를 선택할 수 있습니다:
- compilation metaphor 기반 체계적 에이전트 구축 → oh-my-customcode
- 기존 harness 자산의 이식/통합 → ECC

두 도구가 동일한 기능을 제공할 필요가 없으며,
이 차별화가 각 도구의 장기 지속성에 기여합니다.

---

## 5. KPI 모니터링

DEFER 조건 모니터링을 위한 내부 KPI 메모:

> 내부 메모: `.claude/agent-memory/sys-memory-keeper/project_ecc_kpi_internal_metrics.md`

| KPI | 6개월 목표 | 1년 목표 |
|-----|-----------|---------|
| 외부 기여자 수 | 2명 | 5명 |
| 한국어 사용자 비율 | 30% | 50% |
| cross-harness export 요청 수 | 10회 이상 → DEFER 재검토 | 30회 이상 → ACCEPT 재검토 |

KPI 미달 시: REJECT 유지, 대안 경로 개선 검토.
KPI 초과 달성 시: R016 워크플로우로 재검토 트리거.

---

## 6. 참고

| 항목 | 링크 |
|------|------|
| ECC 흡수 Epic | #1170 (closed) |
| Cross-harness 이슈 | #1176 (standalone, decision-needed) |
| sec-agentshield-wrapper | #1174 |
| instinct-extractor | #1175 |
| manifest-install --profile | #1177 |
| 시퀀싱 메모 | `.claude/agent-memory/sys-memory-keeper/` → `[[project-sequencing-alpha-beta-gamma]]` |
| R006 compilation metaphor | `.claude/rules/MUST-agent-design.md` |

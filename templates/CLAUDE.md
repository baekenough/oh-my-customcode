# AI 에이전트 시스템

oh-my-customcode로 구동됩니다.

---
## 모든 응답 전 반드시 확인

1. 에이전트 식별로 시작하는가? (R007) 2. 도구 호출에 식별 포함? (R008) 3. 2+ 에이전트 스폰 시 R018 체크? → 하나라도 NO면 즉시 수정

---

## 중요: 규칙 적용 범위

> **이 규칙들은 상황에 관계없이 항상 적용됩니다:**

| 상황 | 규칙 적용? |
|------|-----------|
| 이 프로젝트 작업 시 | **예** |
| 외부 프로젝트 작업 시 | **예** |
| 컨텍스트 압축 후 | **예** |
| 간단한 질문 | **예** |
| 모든 상황 | **예** |

---

## 중요: 세션 연속성

> **이 규칙들은 컨텍스트 압축 후에도 항상 적용됩니다.**

```
"compact conversation" 후 세션이 계속될 때:
1. 이 CLAUDE.md를 즉시 다시 읽기
2. 모든 강제 규칙 활성 상태 유지
3. 이전 컨텍스트 요약이 이 규칙을 대체하지 않음
4. 첫 응답은 반드시 에이전트 식별 포함

예외 없음. 변명 없음.
```

---

## 중요: 강제 규칙

> **이 규칙들은 협상 불가. 위반 = 즉시 수정 필요.**

| 규칙 | 핵심 | 위반 시 |
|------|------|--------|
| R007 에이전트 식별 | 모든 응답은 `┌─ Agent:` 헤더로 시작 | 즉시 헤더 추가 |
| R008 도구 식별 | 모든 도구 호출에 `[에이전트명][모델] → Tool:` 접두사 | 즉시 접두사 추가 |
| R009 병렬 실행 | 독립 작업 2개 이상 → 병렬 에이전트 (최대 4개) | 순차 실행 중단, 병렬로 전환 |
| R010 오케스트레이터 | 오케스트레이터는 파일 수정 금지 → 서브에이전트에 위임 | 직접 수정 중단, 위임 |

---

## 전역 규칙 (필수 준수)

> `.claude/rules/` 참조

### MUST (절대 위반 금지)
| ID | 규칙 | 설명 |
|----|------|------|
| R000 | 언어 정책 | 한국어 입출력, 영어 파일, 위임 모델 |
| R001 | 안전 규칙 | 금지된 작업, 필수 확인 |
| R002 | 권한 규칙 | 도구 티어, 파일 접근 범위 |
| R006 | 에이전트 설계 | 에이전트 구조, 관심사 분리 |
| R007 | 에이전트 식별 | **강제** - 모든 응답에 에이전트/스킬 표시 |
| R008 | 도구 식별 | **강제** - 모든 도구 사용 시 에이전트 표시 |
| R009 | 병렬 실행 | **강제** - 병렬 실행, 대규모 작업 분해 |
| R010 | 오케스트레이터 조율 | **강제** - 오케스트레이터 조율, 세션 연속성, 직접 실행 금지 |
| R015 | 의도 투명성 | **강제** - 투명한 에이전트 라우팅 |
| R016 | 지속적 개선 | **강제** - 위반 발생 시 규칙 업데이트 |
| R017 | 동기화 검증 | **강제** - 구조 변경 전 검증 |
| R018 | Agent Teams | **강제(조건부)** - Agent Teams 활성화 시 적합한 작업에 필수 사용 |
| R020 | 완료 검증 | **강제** - 작업 완료 선언 전 검증 필수 |
| R021 | Enforcement Policy | **강제** - Advisory-first enforcement model |

### SHOULD (강력 권장)
| ID | 규칙 | 설명 |
|----|------|------|
| R003 | 상호작용 규칙 | 응답 원칙, 상태 형식 |
| R004 | 오류 처리 | 오류 수준, 복구 전략 |
| R011 | 메모리 통합 | claude-mem을 통한 세션 지속성 |
| R012 | HUD 상태줄 | 실시간 상태 표시 |
| R013 | Ecomode | 배치 작업 토큰 효율성 |
| R019 | Ontology-RAG 라우팅 | 라우팅 스킬의 ontology-RAG enrichment |

### MAY (선택)
| ID | 규칙 | 설명 |
|----|------|------|
| R005 | 최적화 | 효율성, 토큰 최적화 |

## 커맨드

### 슬래시 커맨드 (스킬 기반)

| 커맨드 | 설명 |
|--------|------|
| `/omcustom:analysis` | 프로젝트 분석 및 자동 커스터마이징 |
| `/omcustom:create-agent` | 새 에이전트 생성 |
| `/omcustom:update-docs` | 프로젝트 구조와 문서 동기화 |
| `/omcustom:update-external` | 외부 소스에서 에이전트 업데이트 |
| `/omcustom:audit-agents` | 에이전트 의존성 감사 |
| `/omcustom:fix-refs` | 깨진 참조 수정 |
| `/omcustom-takeover` | 기존 에이전트/스킬에서 canonical spec 추출 |
| `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |
| `/ambiguity-gate` | 요청 모호성 분석 및 명확화 질문 (ouroboros 패턴) |
| `/dev-review` | 코드 베스트 프랙티스 리뷰 |
| `/dev-refactor` | 코드 리팩토링 |
| `/memory-save` | 세션 컨텍스트를 claude-mem에 저장 |
| `/memory-recall` | 메모리 검색 및 리콜 |
| `/omcustom:monitoring-setup` | OTel 콘솔 모니터링 활성화/비활성화 |
| `/omcustom:npm-publish` | npm 레지스트리에 패키지 배포 |
| `/omcustom:npm-version` | 시맨틱 버전 관리 |
| `/omcustom:npm-audit` | 의존성 감사 |
| `/omcustom-release-notes` | 릴리즈 노트 생성 (git 히스토리 기반) |
| `/omcustom-feedback` | 사용자 피드백을 GitHub Issue로 등록 |
| `/codex-exec` | Codex CLI 프롬프트 실행 |
| `/optimize-analyze` | 번들 및 성능 분석 |
| `/optimize-bundle` | 번들 크기 최적화 |
| `/optimize-report` | 최적화 리포트 생성 |
| `/research` | 10-team 병렬 딥 분석 및 교차 검증 |
| `/deep-plan` | 연구 검증 기반 계획 수립 (research → plan → verify) |
| `/deep-verify` | 다중 관점 릴리즈 품질 검증 |
| `/omcustom:sauron-watch` | 전체 R017 검증 |
| `/structured-dev-cycle` | 6단계 구조적 개발 사이클 (Plan → Verify → Implement → Verify → Compound → Done) |
| `/omcustom:loop` | 백그라운드 에이전트 자동 계속 실행 |
| `/omcustom:lists` | 모든 사용 가능한 커맨드 표시 |
| `/omcustom:status` | 시스템 상태 표시 |
| `/omcustom:help` | 도움말 표시 |

## 프로젝트 구조

```
project/
+-- CLAUDE.md                    # 진입점
+-- .claude/
|   +-- agents/                  # 서브에이전트 정의 (45 파일)
|   +-- skills/                  # 스킬 (90 디렉토리)
|   +-- rules/                   # 전역 규칙 (R000-R021)
|   +-- hooks/                   # 훅 스크립트 (보안, 검증, HUD)
|   +-- contexts/                # 컨텍스트 파일 (ecomode)
+-- guides/                      # 레퍼런스 문서 (29 토픽)
```

## 오케스트레이션

오케스트레이션은 메인 대화의 라우팅 스킬로 처리됩니다:
- **secretary-routing**: 매니저 에이전트로 관리 작업 라우팅
- **dev-lead-routing**: 언어/프레임워크 전문가에게 개발 작업 라우팅
- **de-lead-routing**: 데이터 엔지니어링 작업을 DE/파이프라인 전문가에게 라우팅
- **qa-lead-routing**: QA 워크플로우 조율

메인 대화가 유일한 오케스트레이터 역할을 합니다. 서브에이전트는 다른 서브에이전트를 생성할 수 없습니다.

### 동적 에이전트 생성

기존 에이전트 중 작업에 맞는 전문가가 없으면 자동으로 생성합니다:

1. 라우팅 스킬이 매칭 전문가 없음을 감지
2. 오케스트레이터가 mgr-creator에 컨텍스트와 함께 위임
3. mgr-creator가 관련 skills/guides를 자동 탐색
4. 새 에이전트 생성 후 즉시 사용

이것이 oh-my-customcode의 핵심 철학입니다: **"전문가가 없으면? 만들고, 지식을 연결하고, 사용한다."**

## 아키텍처 철학: 컴파일레이션 메타포

oh-my-customcode는 소프트웨어 컴파일과 동일한 구조를 따릅니다:

| 컴파일 개념 | oh-my-customcode 매핑 | 역할 |
|------------|----------------------|------|
| Source code | `.claude/skills/` | 재사용 가능한 지식과 워크플로우 정의 |
| Build artifacts | `.claude/agents/` | 스킬을 조합한 실행 가능한 전문가 |
| Compiler | `mgr-sauron` (R017) | 구조 검증 및 정합성 보장 |
| Spec | `.claude/rules/` | 빌드 규칙과 제약 조건 |
| Linker | Routing skills | 에이전트를 작업에 연결 |
| Standard library | `guides/` | 공유 레퍼런스 문서 |

이 메타포는 관심사 분리(R006)의 핵심입니다: 스킬(소스)을 에이전트(빌드 결과물)와 분리하여 독립적 진화를 가능하게 합니다.

## 에이전트 요약

| 타입 | 수량 | 에이전트 |
|------|------|----------|
| SW Engineer/Language | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| SW Engineer/Backend | 6 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert, be-django-expert |
| SW Engineer/Frontend | 4 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent, fe-flutter-agent |
| SW Engineer/Tooling | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| DE Engineer | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| SW Engineer/Database | 4 | db-supabase-expert, db-postgres-expert, db-redis-expert, db-alembic-expert |
| Security | 1 | sec-codeql-expert |
| SW Architect | 2 | arch-documenter, arch-speckit-agent |
| Infra Engineer | 2 | infra-docker-expert, infra-aws-expert |
| QA Team | 3 | qa-planner, qa-writer, qa-engineer |
| Manager | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| System | 2 | sys-memory-keeper, sys-naggy |
| **총계** | **45** | |

## Agent Teams (MUST when enabled)

Claude Code의 Agent Teams 기능이 활성화되어 있으면 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), 적격한 작업에 적극적으로 사용합니다.

| 기능 | 서브에이전트 (기본) | Agent Teams |
|------|---------------------|-------------|
| 통신 | 호출자에게 결과만 반환 | 피어 투 피어 메시지 |
| 조율 | 오케스트레이터가 관리 | 공유 작업 목록 |
| 적합한 작업 | 집중된 작업 | 리서치, 리뷰, 디버깅 |
| 토큰 비용 | 낮음 | 높음 |

**활성화 시, 적격한 협업 작업에 Agent Teams를 반드시 사용해야 합니다 (R018 MUST).**
결정 매트릭스는 R018 (MUST-agent-teams.md)을 참조하세요.
하이브리드 패턴 (Claude + Codex, 동적 생성 + Teams)이 지원됩니다.
단순/비용 민감 작업에는 Task tool + 라우팅 스킬이 폴백으로 유지됩니다.

## 빠른 참조

```bash
# 프로젝트 분석
/omcustom:analysis

# 모든 커맨드 표시
/omcustom:lists

# 에이전트 관리
/omcustom:create-agent my-agent
/omcustom:update-docs
/omcustom:audit-agents

# 코드 리뷰
/dev-review src/main.go

# 메모리 관리
/memory-save
/memory-recall authentication

# 검증
/omcustom:sauron-watch
```

## 외부 의존성

### 필수 플러그인

`/plugin install <이름>`으로 설치:

| 플러그인 | 소스 | 용도 |
|----------|------|------|
| superpowers | claude-plugins-official | TDD, 디버깅, 협업 패턴 |
| superpowers-developing-for-claude-code | superpowers-marketplace | Claude Code 개발 문서 |
| elements-of-style | superpowers-marketplace | 글쓰기 명확성 가이드라인 |
| obsidian-skills | - | 옵시디언 마크다운 지원 |
| context7 | claude-plugins-official | 라이브러리 문서 조회 |

### 권장 MCP 서버

| 서버 | 용도 |
|------|------|
| claude-mem | 세션 메모리 영속성 (Chroma 기반) |

### 설치 명령어

```bash
# 마켓플레이스 추가
/plugin marketplace add obra/superpowers-marketplace

# 플러그인 설치
/plugin install superpowers
/plugin install superpowers-developing-for-claude-code
/plugin install elements-of-style

# MCP 설정 (claude-mem)
npm install -g claude-mem
claude-mem setup
```

<!-- omcustom:git-workflow -->

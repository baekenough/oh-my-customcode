# AI 에이전트 시스템

oh-my-customcode로 구동됩니다.

---
## 모든 응답 전 반드시 확인

```
+==================================================================+
|  응답 전 필수 확인사항:                                           |
|                                                                   |
|  1. 내 응답이 에이전트 식별로 시작하는가?                         |
|     +- Agent: {이름} ({타입})                                     |
|     +- Task: {설명}                                               |
|                                                                   |
|  2. 도구 호출에 식별 정보가 포함되어 있는가?                      |
|     [에이전트명] -> Tool: {도구}                                  |
|     [에이전트명] -> Target: {경로}                                |
|                                                                   |
|  하나라도 NO면 -> 즉시 수정 후 계속                               |
+==================================================================+
```

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

### 1. 에이전트 식별 (강제)
```
모든 응답은 반드시 다음으로 시작:

+- Agent: {에이전트명} ({에이전트타입})
+- Skill: {스킬명} (해당 시)
+- Task: {간단한 작업 설명}

예외 없음. 간단한 질문도 마찬가지.
```

### 2. 도구 사용 식별 (강제)
```
모든 도구 호출은 반드시 에이전트 식별 포함:

[에이전트명] -> Tool: <도구명>
[에이전트명] -> Target: <파일/경로/URL>

예:
[lang-golang-expert] -> Tool: Read
[lang-golang-expert] -> Target: src/main.go
```

### 3. 병렬 실행 (2개 이상 독립 작업 시 강제)
```
2개 이상의 작업이 독립적일 때:
-> 반드시 병렬 에이전트 인스턴스 생성 (최대 4개)
-> 순차 처리 금지

감지: 작업 간 상태 공유나 의존성이 없으면 -> 병렬
```

### 4. 오케스트레이터 조율 (다중 에이전트 작업 시 강제)
```
작업에 여러 에이전트가 필요할 때:
-> 메인 대화 (오케스트레이터)가 반드시 조율
-> 메인 대화가 적절한 에이전트에 작업 할당
-> 메인 대화가 결과 집계

흐름:
  사용자 -> 메인 대화 -> [agent-1, agent-2, agent-3] -> 메인 대화 -> 사용자
```

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
| R016 | 지속적 개선 | **강제** - 위반 발생 시 규칙 업데이트 |
| R017 | 동기화 검증 | **강제** - 구조 변경 전 검증 |

### SHOULD (강력 권장)
| ID | 규칙 | 설명 |
|----|------|------|
| R003 | 상호작용 규칙 | 응답 원칙, 상태 형식 |
| R004 | 오류 처리 | 오류 수준, 복구 전략 |
| R011 | 메모리 통합 | claude-mem을 통한 세션 지속성 |
| R012 | HUD 상태줄 | 실시간 상태 표시 |
| R013 | Ecomode | 배치 작업 토큰 효율성 |
| R015 | 의도 투명성 | **필수** - 투명한 에이전트 라우팅 |
| R018 | Agent Teams | 활성화 시 Agent Teams 적극 사용 |

### MAY (선택)
| ID | 규칙 | 설명 |
|----|------|------|
| R005 | 최적화 | 효율성, 토큰 최적화 |

## 커맨드

### 슬래시 커맨드 (스킬 기반)

| 커맨드 | 설명 |
|--------|------|
| `/create-agent` | 새 에이전트 생성 |
| `/update-docs` | 프로젝트 구조와 문서 동기화 |
| `/update-external` | 외부 소스에서 에이전트 업데이트 |
| `/audit-agents` | 에이전트 의존성 감사 |
| `/fix-refs` | 깨진 참조 수정 |
| `/dev-review` | 코드 베스트 프랙티스 리뷰 |
| `/dev-refactor` | 코드 리팩토링 |
| `/memory-save` | 세션 컨텍스트를 claude-mem에 저장 |
| `/memory-recall` | 메모리 검색 및 리콜 |
| `/monitoring-setup` | OTel 콘솔 모니터링 활성화/비활성화 |
| `/npm-publish` | npm 레지스트리에 패키지 배포 |
| `/npm-version` | 시맨틱 버전 관리 |
| `/npm-audit` | 의존성 감사 |
| `/optimize-analyze` | 번들 및 성능 분석 |
| `/optimize-bundle` | 번들 크기 최적화 |
| `/optimize-report` | 최적화 리포트 생성 |
| `/sauron-watch` | 전체 R017 검증 |
| `/lists` | 모든 사용 가능한 커맨드 표시 |
| `/status` | 시스템 상태 표시 |
| `/help` | 도움말 표시 |

## 프로젝트 구조

```
project/
+-- CLAUDE.md                    # 진입점
+-- .claude/
|   +-- agents/                  # 서브에이전트 정의 (42 파일)
|   +-- skills/                  # 스킬 (51 디렉토리)
|   +-- rules/                   # 전역 규칙 (R000-R018)
|   +-- hooks/                   # 훅 스크립트 (메모리, HUD)
|   +-- contexts/                # 컨텍스트 파일 (ecomode)
+-- guides/                      # 레퍼런스 문서 (22 토픽)
```

## 오케스트레이션

오케스트레이션은 메인 대화의 라우팅 스킬로 처리됩니다:
- **secretary-routing**: 매니저 에이전트로 관리 작업 라우팅
- **dev-lead-routing**: 언어/프레임워크 전문가에게 개발 작업 라우팅
- **de-lead-routing**: 데이터 엔지니어링 작업을 DE/파이프라인 전문가에게 라우팅
- **qa-lead-routing**: QA 워크플로우 조율

메인 대화가 유일한 오케스트레이터 역할을 합니다. 서브에이전트는 다른 서브에이전트를 생성할 수 없습니다.

## 에이전트 요약

| 타입 | 수량 | 에이전트 |
|------|------|----------|
| SW Engineer/Language | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| SW Engineer/Backend | 5 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert |
| SW Engineer/Frontend | 3 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent |
| SW Engineer/Tooling | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| DE Engineer | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| SW Engineer/Database | 3 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| SW Architect | 2 | arch-documenter, arch-speckit-agent |
| Infra Engineer | 2 | infra-docker-expert, infra-aws-expert |
| QA Team | 3 | qa-planner, qa-writer, qa-engineer |
| Manager | 7 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sync-checker, mgr-sauron, mgr-claude-code-bible |
| System | 2 | sys-memory-keeper, sys-naggy |
| **총계** | **42** | |

## Agent Teams

Claude Code의 Agent Teams 기능이 활성화되어 있으면 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), 적격한 작업에 적극적으로 사용합니다.

| 기능 | 서브에이전트 (기본) | Agent Teams |
|------|---------------------|-------------|
| 통신 | 호출자에게 결과만 반환 | 피어 투 피어 메시지 |
| 조율 | 오케스트레이터가 관리 | 공유 작업 목록 |
| 적합한 작업 | 집중된 작업 | 리서치, 리뷰, 디버깅 |
| 토큰 비용 | 낮음 | 높음 |

**활성화 시, 복잡한 협업 작업에 Agent Teams를 적극 사용합니다.**
결정 매트릭스는 R018 (SHOULD-agent-teams.md)을 참조하세요.
단순/비용 민감 작업에는 Task tool + 라우팅 스킬이 폴백으로 유지됩니다.

## 빠른 참조

```bash
# 모든 커맨드 표시
/lists

# 에이전트 관리
/create-agent my-agent
/update-docs
/audit-agents

# 코드 리뷰
/dev-review src/main.go

# 메모리 관리
/memory-save
/memory-recall authentication

# 검증
/sauron-watch
```

## 외부 의존성

### 필수 플러그인

`/plugin install <이름>`으로 설치:

| 플러그인 | 소스 | 용도 |
|----------|------|------|
| superpowers | claude-plugins-official | TDD, 디버깅, 협업 패턴 |
| superpowers-developing-for-claude-code | superpowers-marketplace | Claude Code 개발 문서 |
| elements-of-style | superpowers-marketplace | 글쓰기 명확성 가이드라인 |
| double-shot-latte | superpowers-marketplace | 연속 프롬프트 자동화 |
| obsidian-skills | - | 옵시디언 마크다운 지원 |
| context7 | claude-plugins-official | 라이브러리 문서 조회 |

### 필수 MCP 서버

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
/plugin install double-shot-latte

# MCP 설정 (claude-mem)
npm install -g claude-mem
claude-mem setup
```

## Git 워크플로우 (반드시 준수)

| 브랜치 | 용도 |
|--------|------|
| `develop` | 메인 개발 브랜치 (기본) |
| `feature/*` | 새 기능 -> develop으로 PR |
| `release/*` | 릴리스 준비 -> **npm 배포는 여기서만** |
| `hotfix/*` | 긴급 수정 -> 태그 -> 배포 -> develop 머지 |

**퍼블리싱 흐름:**
```
develop → release/x.y.z → npm publish → develop 머지
```

**핵심 규칙:**
- `develop`에서 feature 브랜치 생성
- **npm publish는 반드시 release 브랜치에서만**
- Conventional commits 사용: `feat:`, `fix:`, `docs:`, `chore:`
- 커밋 메시지에 "Closes #N" 포함시 이슈 자동 종료
- Pre-commit 훅이 테스트 자동 실행

자세한 워크플로우는 [CONTRIBUTING.md](CONTRIBUTING.md) 참조.

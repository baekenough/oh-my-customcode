<div align="center">
  <img src="assets/banner.webp" alt="oh-my-customcode banner" width="800" />
</div>

# oh-my-customcode

> **당신만의 코딩 에이전트 스택, 당신만의 방식으로**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[English Documentation](./README.md)**

**에이전트, 스킬, 규칙으로 Claude Code를 커스터마이징하는 가장 쉬운 방법.**

oh-my-zsh가 쉘 커스터마이징을 혁신했듯이, oh-my-customcode는 코딩 에이전트 워크플로우를 간단하고, 강력하고, 재미있게 개인화합니다.

## 왜 특별한가

| 특징 | 설명 |
|------|------|
| **바로 사용 가능** | 44개 에이전트, 68개 스킬, 24개 가이드, 18개 규칙, 2개 훅, 4개 컨텍스트, 온톨로지 그래프 - 즉시 사용 가능 |
| **서브 에이전트 모델** | 전문화된 역할의 계층적 에이전트 오케스트레이션 지원 |
| **초간단 커스터마이징** | 폴더 + 마크다운 파일 생성 = 새 에이전트 또는 스킬 완성 |
| **자유로운 조합** | 기본 제공 컴포넌트와 직접 만든 것을 자유롭게 섞어 사용 |
| **비파괴적** | 커스터마이징은 기본값과 함께 존재, 절대 덮어쓰지 않음 |
| **동적 에이전트 생성** | 적합한 전문가가 없으면? 시스템이 관련 스킬과 가이드를 연결하여 즉석에서 생성 |

## 빠른 시작

```bash
# 전역 설치
npm install -g oh-my-customcode

# 프로젝트에서 초기화
cd your-project
omcustom init
```

끝. 이제 완벽하게 구성된 에이전트 작업 환경을 갖게 되었습니다.

---

## 커스터마이징이 핵심

oh-my-customcode의 존재 이유입니다. **코딩 워크플로우를 당신 것으로 만드세요.**

### 자연어로 말하면 됩니다

파일을 직접 편집할 필요 없습니다. 원하는 것을 자연어로 말하면 라우팅 스킬과 매니저 에이전트 조합이 적절한 서브 에이전트로 위임합니다:

```
"마이그레이션 리뷰 전문 에이전트를 만들어줘"
"SQL 최적화 스킬을 추가해줘"
"코드 리뷰를 더 엄격하게 해줘"
"배포 전 리뷰 파이프라인을 만들어줘"
```

**동작 흐름:**

```
사용자 (자연어)
  → secretary-routing (라우팅 스킬)
    → mgr-creator:sonnet   — 에이전트 생성, 등록, 검증
    → mgr-updater:sonnet   — 문서 동기화
    → mgr-supplier:haiku   — 의존성 확인
```

라우팅 체인이 요청을 분석하고 적절한 스킬/매니저 에이전트로 매핑하면, 선택된 서브 에이전트가 실행을 자동 처리합니다.

### 서브 에이전트 모델

각 서브 에이전트는 작업 유형에 최적화된 모델로 실행됩니다:

| 모델 | 용도 | 예시 |
|------|------|------|
| `opus` | 복잡한 추론, 아키텍처 설계 | 코드 리뷰, 설계 분석 |
| `sonnet` | 일반 작업 (기본값) | 에이전트 생성, 코드 구현 |
| `haiku` | 빠른 단순 작업 | 파일 검색, 검증 |

Claude Code가 적절한 모델을 선택하고, 독립적인 작업은 병렬 실행합니다 (최대 4개 동시):

```
secretary-routing (라우팅 스킬)
  ├── mgr-creator:sonnet       — 에이전트 스캐폴딩
  └── mgr-supplier:haiku       — 의존성 확인

dev-lead-routing (라우팅 스킬)
  ├── lang-golang-expert:sonnet   — Go 구현
  ├── lang-python-expert:sonnet   — Python 구현
  └── qa-engineer:sonnet   — 테스트 생성
```

### 슬래시 커맨드

모든 커맨드는 Claude Code 대화 내에서 호출합니다.

#### 분석 & 리서치

| 커맨드 | 설명 |
|--------|------|
| `/analysis` | 프로젝트 분석 및 에이전트, 스킬, 규칙 자동 구성 |
| `/research` | 10-team 병렬 딥 분석 및 교차 검증 |

#### 개발

| 커맨드 | 설명 |
|--------|------|
| `/dev-review` | 베스트 프랙티스 기반 코드 리뷰 |
| `/dev-refactor` | 구조 개선을 위한 코드 리팩토링 |

#### 에이전트 관리

| 커맨드 | 설명 |
|--------|------|
| `/create-agent` | 새 에이전트 생성 |
| `/update-docs` | 프로젝트 구조와 문서 동기화 |
| `/update-external` | 외부 소스에서 에이전트 업데이트 |
| `/audit-agents` | 에이전트 의존성 감사 |
| `/fix-refs` | 깨진 참조 수정 |

#### 메모리

| 커맨드 | 설명 |
|--------|------|
| `/memory-save` | 세션 컨텍스트를 claude-mem에 저장 |
| `/memory-recall` | 메모리 검색 및 리콜 |

#### DevOps & 배포

| 커맨드 | 설명 |
|--------|------|
| `/npm-publish` | npm 레지스트리에 패키지 배포 |
| `/npm-version` | 시맨틱 버전 관리 |
| `/npm-audit` | 의존성 보안 감사 |

#### 최적화

| 커맨드 | 설명 |
|--------|------|
| `/optimize-analyze` | 번들 및 성능 분석 |
| `/optimize-bundle` | 번들 크기 최적화 |
| `/optimize-report` | 최적화 리포트 생성 |

#### 검증 & 시스템

| 커맨드 | 설명 |
|--------|------|
| `/sauron-watch` | 전체 R017 동기화 검증 |
| `/monitoring-setup` | OTel 콘솔 모니터링 활성화/비활성화 |
| `/codex-exec` | Codex CLI 프롬프트 실행 |
| `/structured-dev-cycle` | 6단계 구조적 개발 사이클 |
| `/lists` | 모든 사용 가능한 커맨드 표시 |
| `/status` | 시스템 상태 및 헬스 체크 |
| `/help` | 도움말 정보 |

---

## 기본 제공 항목

### 에이전트 (44개)

| 카테고리 | 수 | 에이전트 |
|----------|-----|----------|
| **매니저** | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| **시스템** | 2 | sys-memory-keeper, sys-naggy |
| **언어** | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| **프론트엔드** | 4 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent, fe-flutter-agent |
| **백엔드** | 6 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert, be-django-expert |
| **툴링** | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| **데이터 엔지니어링** | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| **데이터베이스** | 3 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| **아키텍처** | 2 | arch-documenter, arch-speckit-agent |
| **인프라** | 2 | infra-docker-expert, infra-aws-expert |
| **QA** | 3 | qa-planner, qa-writer, qa-engineer |
| **보안** | 1 | sec-codeql-expert |
| **합계** | **44** | |

### 스킬 (68개)

| 카테고리 | 수 | 스킬 |
|----------|-----|------|
| **라우팅** | 4 | secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing |
| **베스트 프랙티스** | 20 | go-best-practices, python-best-practices, typescript-best-practices, kotlin-best-practices, rust-best-practices, react-best-practices, fastapi-best-practices, springboot-best-practices, go-backend-best-practices, django-best-practices, docker-best-practices, aws-best-practices, postgres-best-practices, supabase-postgres-best-practices, redis-best-practices, airflow-best-practices, dbt-best-practices, kafka-best-practices, snowflake-best-practices, flutter-best-practices |
| **개발** | 6 | dev-review, dev-refactor, create-agent, intent-detection, web-design-guidelines, analysis |
| **데이터 엔지니어링** | 2 | spark-best-practices, pipeline-architecture-patterns |
| **최적화** | 3 | optimize-analyze, optimize-bundle, optimize-report |
| **메모리** | 3 | memory-save, memory-recall, memory-management |
| **패키지 관리** | 3 | npm-publish, npm-version, npm-audit |
| **운영** | 7 | update-docs, update-external, audit-agents, fix-refs, sauron-watch, monitoring-setup, claude-code-bible |
| **유틸리티** | 5 | lists, help, status, result-aggregation, writing-clearly-and-concisely |
| **품질 & 워크플로우** | 9 | multi-model-verification, structured-dev-cycle, model-escalation, stuck-recovery, dag-orchestration, task-decomposition, worker-reviewer-pipeline, pr-auto-improve, pipeline-guards |
| **보안** | 2 | cve-triage, jinja2-prompts |
| **리서치** | 1 | research |
| **배포** | 2 | vercel-deploy, codex-exec |
| **외부 연동** | 1 | skills-sh-search |

### 가이드 (24개)

종합 참조 문서:
- 에이전트 생성 및 관리
- 스킬 개발
- 파이프라인 워크플로우
- 서브 에이전트 오케스트레이션
- 베스트 프랙티스 및 패턴
- 데이터 엔지니어링 워크플로우
- 데이터베이스 최적화

### 규칙 (18개)

| 우선순위 | 개수 | 목적 |
|----------|------|------|
| MUST | 12 | 안전, 권한, 에이전트 설계 (강제) |
| SHOULD | 5 | 상호작용, 에러 처리 (권장) |
| MAY | 1 | 최적화 가이드라인 (선택) |

### 훅 (2개)

에이전트 라이프사이클 이벤트(PreToolUse, PostToolUse 등)에 대한 이벤트 기반 자동화.

### 컨텍스트 (4개)

에이전트 간 지식 공유 및 모드 설정을 위한 공유 컨텍스트 파일.

### 패키지

#### [ontology-rag](packages/ontology-rag/)

에이전트 컨텍스트를 지능적으로 로딩하는 Ontology+RAG 엔진.

| 기능 | 설명 |
|------|------|
| **온톨로지 로딩** | YAML 온톨로지 파싱 (에이전트, 스킬, 규칙) |
| **그래프 순회** | BFS 및 PageRank 기반 의존성 그래프 탐색 |
| **시맨틱 라우팅** | LLM 기반 에이전트 선택 (키워드 폴백 포함) |
| **하이브리드 검색** | 4-시그널 랭킹 (키워드, 그래프, 커뮤니티, 중요도) |
| **토큰 예산 관리** | 적응형 예산 관리 — 토큰 사용량 75-95% 절감 |
| **MCP 서버** | MCP 프로토콜을 통한 Claude Code 직접 통합 |

[uv](https://docs.astral.sh/uv/)가 설치되어 있으면 `omcustom init` 시 자동 설정됩니다.

---

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `omcustom init` | 현재 프로젝트에 초기화 |
| `omcustom init --lang ko` | 한국어로 초기화 |
| `omcustom update` | 최신 버전으로 업데이트 |
| `omcustom list` | 설치된 모든 컴포넌트 목록 |
| `omcustom list agents` | 에이전트만 목록 |
| `omcustom doctor` | 설치 상태 검사 |
| `omcustom doctor --fix` | 일반적인 문제 자동 수정 |
| `omcustom security` | 훅 및 설정의 보안 문제 검사 |

**글로벌 옵션:**
| 옵션 | 설명 |
|------|------|
| `--skip-version-check` | CLI 도구 버전 사전 검사 건너뛰기 |
| `-v, --version` | 버전 번호 표시 |
| `-h, --help` | 도움말 표시 |

---

## 프로젝트 구조

`omcustom init` 후:

```
your-project/
├── CLAUDE.md              # Claude 진입점
├── .claude/
│   ├── agents/            # 에이전트 정의 (44개 플랫 .md 파일)
│   │   ├── lang-golang-expert.md
│   │   ├── be-fastapi-expert.md
│   │   ├── mgr-creator.md
│   │   └── ...
│   ├── skills/            # 스킬 모듈 (68개 디렉토리, 각각 SKILL.md 포함)
│   ├── ontology/          # RAG 컨텍스트용 온톨로지 지식 그래프
│   │   ├── schema.yaml
│   │   ├── agents.yaml
│   │   ├── skills.yaml
│   │   ├── rules.yaml
│   │   └── graphs/
│   ├── rules/             # 행동 규칙 (18개)
│   ├── hooks/             # 이벤트 훅 (2개)
│   └── contexts/          # 컨텍스트 파일 (4개)
└── guides/                # 참조 문서 (24개)
```

**참고**: 공식 Claude Code 형식에서는 명령어 레지스트리가 없으며, 슬래시 커맨드나 자연어 에이전트 참조를 사용합니다.

---

## 개발

```bash
bun install          # 의존성 설치
bun run dev          # 개발 모드
bun test             # 테스트 실행
bun run build        # 프로덕션 빌드
```

### 품질 게이트

| 게이트 | 도구 | 기준 |
|--------|------|------|
| 린트 | Biome | 에러 0건 (복잡도 강제) |
| 테스트 커버리지 | Bun test | 95% (pre-commit), 97% (CI) |
| 보안 감사 | bun pm audit | high/critical 취약점 없음 |
| Dependabot | GitHub | 주간 스캔, 업데이트 자동 PR |

Pre-commit 훅이 커밋 전에 린트, 테스트, 커버리지 게이트를 자동으로 적용합니다.

### 요구사항

- Node.js >= 18.0.0
- Claude Code CLI

---

## 기여

기여를 환영합니다! [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

---

## 라이선스

[MIT](LICENSE)

---

<p align="center">
  <strong>당신의 코딩 워크플로우. 당신의 규칙. 당신의 방식.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>

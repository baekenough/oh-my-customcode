# oh-my-customcode

> **당신만의 Claude Code, 당신만의 방식으로**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[English Documentation](./README.md)**

**에이전트, 스킬, 규칙으로 Claude Code를 커스터마이징하는 가장 쉬운 방법.**

oh-my-zsh가 쉘 커스터마이징을 혁신했듯이, oh-my-customcode는 Claude Code 경험을 간단하고, 강력하고, 재미있게 개인화합니다.

## 왜 특별한가

| 특징 | 설명 |
|------|------|
| **바로 사용 가능** | 42개 에이전트, 52개 스킬, 22개 가이드, 18개 규칙, 1개 훅, 1개 컨텍스트 - 즉시 사용 가능 |
| **서브 에이전트 모델** | 전문화된 역할의 계층적 에이전트 오케스트레이션 지원 |
| **초간단 커스터마이징** | 폴더 + 마크다운 파일 생성 = 새 에이전트 또는 스킬 완성 |
| **자유로운 조합** | 기본 제공 컴포넌트와 직접 만든 것을 자유롭게 섞어 사용 |
| **비파괴적** | 커스터마이징은 기본값과 함께 존재, 절대 덮어쓰지 않음 |

## 빠른 시작

```bash
# 전역 설치
npm install -g oh-my-customcode

# 프로젝트에서 초기화
cd your-project
omcustom init
```

끝. 이제 완벽하게 구성된 Claude Code 환경을 갖게 되었습니다.

---

> **Codex CLI 지원**: 실험적 Codex CLI 모드를 지원합니다. Codex 네이티브 설정은 `AGENTS.md`와 `.codex/`를 참고하세요.

## 커스터마이징이 핵심

oh-my-customcode의 존재 이유입니다. **Claude Code를 당신 것으로 만드세요.**

### 자연어로 말하면 됩니다

파일을 직접 편집할 필요 없습니다. 원하는 것을 자연어로 말하면 오케스트레이터가 적절한 에이전트에 위임합니다:

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

secretary가 요청을 분석하고, 적절한 매니저 에이전트에 라우팅하면, 서브 에이전트가 모든 것을 자동으로 처리합니다.

**참고**: 오케스트레이터는 더 이상 별도 에이전트가 아닙니다. 이제 라우팅 스킬로 구현됩니다 - 공식 Claude Code API가 서브 에이전트를 지원하면 다시 에이전트로 전환될 수 있습니다.

### 서브 에이전트 모델

각 서브 에이전트는 작업 유형에 최적화된 모델로 실행됩니다:

| 모델 | 용도 | 예시 |
|------|------|------|
| `opus` | 복잡한 추론, 아키텍처 설계 | 코드 리뷰, 설계 분석 |
| `sonnet` | 일반 작업 (기본값) | 에이전트 생성, 코드 구현 |
| `haiku` | 빠른 단순 작업 | 파일 검색, 검증 |

오케스트레이터가 적절한 모델을 선택하고, 독립적인 작업은 병렬 실행합니다 (최대 4개 동시):

```
secretary-routing (라우팅 스킬)
  ├── mgr-creator:sonnet       — 에이전트 스캐폴딩
  ├── mgr-supplier:haiku       — 의존성 확인
  └── mgr-sync-checker:haiku   — 레지스트리 검증

dev-lead-routing (라우팅 스킬)
  ├── lang-golang-expert:sonnet   — Go 구현
  ├── lang-python-expert:sonnet   — Python 구현
  └── qa-engineer:sonnet   — 테스트 생성
```

### 내장 슬래시 커맨드

| 커맨드 | 에이전트 | 설명 |
|--------|----------|------|
| `/create-agent <name>` | mgr-creator | 새 에이전트 생성 |
| `/update-docs` | mgr-updater | 프로젝트 구조에 맞게 문서 동기화 |
| `/audit-agents` | mgr-supplier | 에이전트 의존성 검증 |
| `/dev-review` | lang-* experts | 전문 에이전트로 코드 리뷰 |
| `/sauron-watch` | mgr-sauron | 전체 동기화 검증 |

또는 에이전트 이름 접두어를 사용할 수 있습니다:

```
"mgr-creator: 새 에이전트 만들어줘"
"lang-golang: main.go 리뷰해줘"
```

---

## 기본 제공 항목

### 에이전트 (42개)

| 카테고리 | 수 | 에이전트 |
|----------|-----|----------|
| **언어** | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| **백엔드** | 5 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert |
| **프론트엔드** | 3 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent |
| **툴링** | 3 | tool-npm-expert, tool-optimizer, tool-bun-expert |
| **데이터 엔지니어링** | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| **데이터베이스** | 3 | db-supabase-expert, db-postgres-expert, db-redis-expert |
| **아키텍처** | 2 | arch-documenter, arch-speckit-agent |
| **인프라** | 2 | infra-docker-expert, infra-aws-expert |
| **QA** | 3 | qa-planner, qa-writer, qa-engineer |
| **매니저** | 7 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sync-checker, mgr-sauron, mgr-claude-code-bible |
| **시스템** | 2 | sys-memory-keeper, sys-naggy |
| **합계** | **42** | |

### 스킬 (52개)

- **개발**: Go, Python, TypeScript, Kotlin, Rust, Java, React, Vercel
- **백엔드**: FastAPI, Spring Boot, Express, NestJS, Go Backend
- **데이터 엔지니어링**: Airflow, dbt, Spark, Kafka, Snowflake, Pipeline
- **데이터베이스**: Supabase, PostgreSQL, Redis
- **인프라**: Docker, AWS
- **시스템**: 메모리 관리, 결과 집계
- **오케스트레이션** (4): secretary-routing, dev-lead-routing, de-lead-routing, qa-lead-routing

### 가이드 (22개)

종합 참조 문서:
- 에이전트 생성 및 관리
- 스킬 개발
- 멀티 에이전트 오케스트레이션
- 베스트 프랙티스 및 패턴
- 데이터 엔지니어링 워크플로우
- 데이터베이스 최적화

### 규칙 (18개)

| 우선순위 | 개수 | 목적 |
|----------|------|------|
| MUST | 11 | 안전, 권한, 에이전트 설계 (강제) |
| SHOULD | 5 | 상호작용, 에러 처리 (권장) |
| MAY | 1 | 최적화 가이드라인 (선택) |

### 훅 (1개)

Claude Code 라이프사이클 이벤트(PreToolUse, PostToolUse 등)에 대한 이벤트 기반 자동화.

### 컨텍스트 (1개)

에이전트 간 지식 공유 및 모드 설정을 위한 공유 컨텍스트 파일.

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
├── CLAUDE.md              # Claude 진입점 (또는 AGENTS.md for Codex)
├── .claude/               # (또는 .codex/)
│   ├── agents/            # 에이전트 정의 (42개 플랫 .md 파일)
│   ├── skills/            # 스킬 모듈 (52개 디렉토리)
│   ├── rules/             # 행동 규칙 (18개)
│   ├── hooks/             # 이벤트 훅 (1개)
│   └── contexts/          # 컨텍스트 파일 (1개)
└── guides/                # 참조 문서 (22개)
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
- Claude Code CLI 또는 OpenAI Codex CLI

---

## 기여

기여를 환영합니다! [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

---

## 라이선스

[MIT](LICENSE)

---

<p align="center">
  <strong>당신의 Claude Code. 당신의 규칙. 당신의 방식.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>

<div align="center">
  <img src="assets/banner.webp" alt="oh-my-customcode banner" width="800" />
</div>

# oh-my-customcode

> **AI 에이전트 스택. 설정이 아닌 컴파일.**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)
[![Security Audit](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/security-audit.yml)

**[English Documentation](./README.md)**

45개 에이전트. 82개 스킬. 21개 규칙. 명령어 하나.

> **v0.46.0** — Rate Limit 모니터링, Skill Effort Override, 멀티프로젝트 Web UI, 일괄 업데이트, SDD 워크플로우, Ambiguity Gate

```bash
npm install -g oh-my-customcode && cd your-project && omcustom init
```

`omcustom init`은 언어, 프레임워크, 팀 모드를 묻는 인터랙티브 마법사를 실행합니다 (@clack/prompts 기반).

---

## 철학

oh-my-customcode는 두 가지 아이디어 위에 세워졌습니다.

**1. 에이전트 시스템은 설정하는 게 아니라 컴파일한다.**

| 컴파일 개념 | oh-my-customcode |
|------------|-----------------|
| 소스코드 | `.claude/skills/` — 재사용 가능한 지식과 워크플로우 |
| 빌드 결과물 | `.claude/agents/` — 스킬을 조합한 실행 가능한 전문가 |
| 컴파일러 | `mgr-sauron` (R017) — 구조 검증과 정합성 보장 |
| 스펙 | `.claude/rules/` — 제약 조건과 빌드 규칙 |
| 링커 | Routing skills — 에이전트를 작업에 연결 |
| 표준 라이브러리 | `guides/` — 공유 레퍼런스 문서 |

스킬이 소스이고, 에이전트가 빌드 결과물이며, Sauron이 빌드를 검증합니다. 이 분리 덕분에 스킬은 에이전트와 독립적으로 진화하고, 에이전트는 갱신된 스킬로 언제든 재컴파일할 수 있습니다.

**2. 안 되면 되게 한다.**

작업에 맞는 전문가가 없을 때, oh-my-customcode는 실패하지 않습니다. 만듭니다.

```
사용자: "이 Terraform 모듈을 리뷰해줘"
  → 라우팅: terraform 전문가 없음
  → mgr-creator가 탐색: infra-aws-expert 스킬 + docker-best-practices 가이드
  → 생성: infra-terraform-expert.md
  → 즉시 리뷰 실행
  → 에이전트는 이후 재사용을 위해 영속 저장
```

이것은 폴백이 아닙니다. 설계입니다. 시스템은 부족한 전문성을 빌드 문제로 취급합니다 — 적합한 스킬을 찾고, 새 에이전트를 컴파일하고, 실행합니다.

---

## 동작 방식

### 오케스트레이션

메인 대화가 싱글톤 오케스트레이터입니다 (R010). 파일을 직접 작성하지 않습니다. 모든 작업은 라우팅 스킬을 통해 전문 에이전트에 위임됩니다.

```
사용자 (자연어)
  → 라우팅 스킬 (의도 감지, 신뢰도 산출)
    → 전문 에이전트 (격리 실행)
      → 오케스트레이터에 결과 반환
        → 사용자에게 응답
```

4개의 라우팅 스킬이 전체 도메인을 커버합니다:

| 라우팅 스킬 | 라우팅 대상 |
|------------|-----------|
| secretary-routing | 매니저 에이전트 (mgr-*), 시스템 에이전트 (sys-*) |
| dev-lead-routing | 언어, 백엔드, 프론트엔드, 툴링, DB, 인프라, 아키텍처 에이전트 |
| de-lead-routing | 데이터 엔지니어링 에이전트 (de-*) |
| qa-lead-routing | QA 팀 (qa-planner, qa-writer, qa-engineer) |

### 모델 선택

각 에이전트는 작업에 최적화된 모델로 실행됩니다:

| 모델 | 사용 시점 | 예시 |
|------|---------|------|
| `opus` | 복잡한 추론, 아키텍처 | 설계 리뷰, 리서치 종합 |
| `sonnet` | 구현, 일반 작업 | 코드 생성, 에이전트 생성 |
| `haiku` | 빠른 검증, 검색 | 파일 검색, 카운트 확인 |

Reasoning sandwich 패턴이 이를 공식화합니다: opus로 사전 분석, sonnet으로 구현, haiku로 사후 검증.

### 병렬 실행

독립 작업은 병렬로 실행됩니다 (R009). 메시지당 최대 4개 동시 에이전트:

```
Agent(lang-golang-expert):sonnet  ┐
Agent(lang-python-expert):sonnet  ├─ 하나의 메시지에서 동시 스폰
Agent(qa-engineer):sonnet         │
Agent(arch-documenter):haiku      ┘
```

---

## 에이전트 (45개)

| 카테고리 | 수 | 에이전트 |
|---------|-----|---------|
| 언어 | 6 | lang-golang, lang-python, lang-rust, lang-kotlin, lang-typescript, lang-java21 |
| 백엔드 | 6 | be-fastapi, be-springboot, be-go-backend, be-express, be-nestjs, be-django |
| 프론트엔드 | 4 | fe-vercel, fe-vuejs, fe-svelte, fe-flutter |
| 데이터 엔지니어링 | 6 | de-airflow, de-dbt, de-spark, de-kafka, de-snowflake, de-pipeline |
| 데이터베이스 | 4 | db-supabase, db-postgres, db-redis, db-alembic |
| 툴링 | 3 | tool-npm, tool-optimizer, tool-bun |
| 아키텍처 | 2 | arch-documenter, arch-speckit |
| 인프라 | 2 | infra-docker, infra-aws |
| QA | 3 | qa-planner, qa-writer, qa-engineer |
| 보안 | 1 | sec-codeql |
| 매니저 | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| 시스템 | 2 | sys-memory-keeper, sys-naggy |

각 에이전트는 YAML 프론트매터에 도구, 모델, 메모리 스코프, 한계를 선언합니다. 에이전트 유형별 도구 예산이 정확도를 위해 강제됩니다.

---

## 스킬 (82개)

| 카테고리 | 수 | 포함 |
|---------|-----|------|
| 베스트 프랙티스 | 24 | Go, Python, TypeScript, Kotlin, Rust, React, FastAPI, Spring Boot, Django, Flutter, Docker, AWS, Postgres, Redis, Kafka, dbt, Spark, Snowflake, Airflow, pipeline-architecture-patterns, alembic 외 |
| 라우팅 | 4 | secretary, dev-lead, de-lead, qa-lead |
| 워크플로우 | 12 | structured-dev-cycle, deep-plan, research, evaluator-optimizer, dag-orchestration, worker-reviewer-pipeline, reasoning-sandwich 외 |
| 개발 | 7 | dev-review, dev-refactor, analysis, create-agent, intent-detection, web-design-guidelines, omcustom-takeover |
| 운영 | 9 | update-docs, audit-agents, sauron-watch, monitoring-setup, fix-refs, release-notes 외 |
| 메모리 | 3 | memory-save, memory-recall, memory-management |
| 패키지 | 3 | npm-publish, npm-version, npm-audit |
| 최적화 | 3 | optimize-analyze, optimize-bundle, optimize-report |
| 보안 | 3 | adversarial-review, cve-triage, jinja2-prompts |
| 기타 | 8 | codex-exec, vercel-deploy, skills-sh-search, result-aggregation, writing-clearly-and-concisely 외 |

스킬은 3-tier scope 시스템을 사용합니다: `core` (범용), `harness` (에이전트/스킬 관리), `package` (프로젝트 특화).

`context:fork` 상한이 12로 확장되었습니다 (현재 11개 활성). 라우팅 스킬은 Codex가 활성화된 경우 자동으로 codex-exec에 위임합니다.

---

## 커맨드

모든 커맨드는 Claude Code 대화 내에서 호출합니다.

### 개발

| 커맨드 | 기능 |
|--------|------|
| `/dev-review` | 베스트 프랙티스 기반 코드 리뷰 |
| `/dev-refactor` | 구조와 패턴 개선 리팩토링 |
| `/structured-dev-cycle` | 6단계 개발: plan → verify → implement → verify → compound → done |
| `/deep-plan` | 연구 검증 기반 계획 수립 |
| `/research` | 10-team 병렬 분석 및 교차 검증 |
| `/sdd-dev` | Spec-Driven Development 워크플로우 |
| `/ambiguity-gate` | 사전 라우팅 모호성 분석 |
| `/adversarial-review` | 공격자 관점 보안 코드 리뷰 |

### 에이전트 관리

| 커맨드 | 기능 |
|--------|------|
| `/omcustom:analysis` | 프로젝트 분석, 에이전트·스킬 자동 구성 |
| `/omcustom:create-agent` | 새 에이전트 생성 |
| `/omcustom-takeover` | 기존 에이전트/스킬에서 canonical spec 추출 |
| `/omcustom:audit-agents` | 에이전트 의존성 감사 |
| `/omcustom:update-docs` | 프로젝트 구조와 문서 동기화 |
| `/omcustom:sauron-watch` | 전체 구조 검증 (5+3 라운드) |
| `/omcustom-feedback` | 피드백을 GitHub 이슈로 등록 |

### Web UI

| 커맨드 | 기능 |
|--------|------|
| `/omcustom:web` | 내장 Web UI 제어 (start, stop, status, open) |

### 패키지 & 릴리즈

| 커맨드 | 기능 |
|--------|------|
| `/omcustom:npm-publish` | npm 배포 |
| `/omcustom:npm-version` | 시맨틱 버전 관리 |
| `/omcustom:npm-audit` | 의존성 보안 감사 |
| `/omcustom-release-notes` | git 히스토리 기반 릴리즈 노트 생성 |

### 메모리 & 시스템

| 커맨드 | 기능 |
|--------|------|
| `/memory-save` | 세션 컨텍스트 저장 |
| `/memory-recall` | 메모리 검색 및 리콜 |
| `/omcustom:monitoring-setup` | OTel 모니터링 토글 |
| `/omcustom:lists` | 전체 커맨드 표시 |
| `/omcustom:status` | 시스템 상태 확인 |

---

## 규칙 (21개)

| 우선순위 | 수 | 목적 |
|---------|-----|------|
| **MUST** | 14 | 안전, 권한, 에이전트 설계, 식별, 오케스트레이션, 검증, 완료 검증, 집행 정책 |
| **SHOULD** | 6 | 상호작용, 오류 처리, 메모리, HUD, ecomode, ontology 라우팅 |
| **MAY** | 1 | 최적화 |

핵심 규칙: R010 (오케스트레이터 직접 쓰기 금지), R009 (병렬 실행 의무), R017 (푸시 전 sauron 검증), R020 (완료 선언 전 검증 의무), R021 (어드바이저리 우선 집행 모델).

---

## 보안

15개 라이프사이클 훅이 도구 호출마다 실행됩니다. 그 중 세 가지 보안 훅:

| 훅 | 트리거 | 동작 |
|----|--------|------|
| secret-filter | Bash, Read 출력 | AWS 키, API 토큰, 개인 키, bearer 토큰 감지 |
| audit-log | Edit, Write, Bash, Agent | `~/.claude/audit.jsonl`에 append-only JSONL 기록 |
| schema-validator | Write, Edit, Bash 입력 | 도구 입력 검증, 위험 패턴 플래그 |

모든 보안 훅은 어드바이저리입니다 (exit 0). 경고만 하고 차단하지 않습니다.

**PostCompact 훅** (Claude Code v2.1.76+)은 컨텍스트 컴팩션 이후 핵심 규칙(R007-R018, R021)을 자동으로 재강화합니다.

---

## CLI

```bash
omcustom init                  # 인터랙티브 마법사로 초기화 (언어, 프레임워크, 팀 모드)
omcustom init --lang ko        # 한국어로 초기화
omcustom init --team           # 팀 모드 활성화
omcustom update                # 최신 버전 업데이트
omcustom list                  # 컴포넌트 목록
omcustom doctor                # 설치 상태 검사
omcustom doctor --fix          # 문제 자동 수정
omcustom security              # 보안 이슈 스캔
omcustom projects              # 관리 프로젝트 목록 및 버전 상태
omcustom update --all          # 모든 구버전 프로젝트 일괄 업데이트
omcustom serve                 # 내장 Web UI 시작
omcustom serve-stop            # Web UI 중지
```

---

## 프로젝트 구조

```
your-project/
├── CLAUDE.md                   # 진입점
├── .claude/
│   ├── agents/                 # 45개 에이전트 정의
│   ├── skills/                 # 82개 스킬 모듈
│   ├── rules/                  # 21개 거버넌스 규칙 (R000-R021)
│   ├── hooks/                  # 15개 라이프사이클 훅 스크립트
│   ├── schemas/                # 도구 입력 검증 스키마
│   ├── specs/                  # 추출된 canonical spec
│   ├── contexts/               # 4개 공유 컨텍스트 파일
│   └── ontology/               # RAG용 지식 그래프
├── packages/
│   └── eval-core/              # LLM 평가 엔진 (세션/턴/결과 수집, SQLite)
└── guides/                     # 28개 레퍼런스 문서
```

---

## 개발

```bash
bun install          # 의존성 설치
bun run dev          # 개발 모드
bun test             # 테스트 실행
bun run build        # 프로덕션 빌드
```

요구사항: Node.js >= 18.0.0, Claude Code CLI.

### @omcustom/eval-core

v0.38.0에서 추가된 LLM 평가 엔진입니다. 세션/턴/결과를 수집하고 SQLite(Drizzle ORM)에 저장합니다.

```bash
cd packages/eval-core
bun install
bun run cli -- --help
```

---

## 라이선스

[MIT](LICENSE)

---

<p align="center">
  <strong>전문가가 없으면? 만들고, 지식을 연결하고, 실행한다.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>

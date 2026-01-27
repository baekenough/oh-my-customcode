# oh-my-customcode

> **당신만의 Claude Code, 당신만의 방식으로**

[![npm version](https://img.shields.io/npm/v/oh-my-customcode.svg)](https://www.npmjs.com/package/oh-my-customcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml/badge.svg)](https://github.com/baekenough/oh-my-customcode/actions/workflows/ci.yml)

**에이전트, 스킬, 규칙으로 Claude Code를 커스터마이징하는 가장 쉬운 방법.**

oh-my-zsh가 쉘 커스터마이징을 혁신했듯이, oh-my-customcode는 Claude Code 경험을 간단하고, 강력하고, 재미있게 개인화합니다.

## 왜 특별한가

| 특징 | 설명 |
|------|------|
| **바로 사용 가능** | 37개 에이전트, 17개 스킬, 12개 가이드 - baekgom-agents 템플릿과 동기화 |
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

## 커스터마이징이 핵심

oh-my-customcode의 존재 이유입니다. **Claude Code를 당신 것으로 만드세요.**

### 커스텀 에이전트 만들기 (파일 2개)

데이터베이스 마이그레이션을 리뷰하는 에이전트가 필요하다면? 그냥 만드세요:

```
agents/sw-engineer/migration-expert/
├── AGENT.md       # 에이전트가 하는 일
└── index.yaml     # 메타데이터
```

**AGENT.md:**
```markdown
# Migration Expert Agent

> **Type**: Worker

## Purpose

Expert in database migrations, schema design, and data integrity.

## Capabilities

1. Review migration files for safety issues
2. Suggest rollback strategies
3. Check for data loss risks
4. Optimize migration performance

## When to Use

- Before running migrations in production
- Designing new database schemas
- Reviewing team members' migrations
```

**index.yaml:**
```yaml
metadata:
  name: migration-expert
  type: worker
  category: sw-engineer
  description: Database migration specialist
```

완료. 커스텀 에이전트가 바로 사용 가능합니다.

### 커스텀 스킬 추가

스킬은 에이전트가 **어떻게** 일하는지 정의합니다. 전문 지식을 만드세요:

```
skills/development/sql-optimization/
├── SKILL.md       # 스킬 지침
└── index.yaml     # 메타데이터
```

**SKILL.md:**
```markdown
# SQL Optimization Skill

## Rules

### Query Optimization
- Always use EXPLAIN ANALYZE before suggesting changes
- Prefer indexes over full table scans
- Avoid SELECT * in production code
- Use CTEs for complex queries

### Migration Safety
- Always include rollback scripts
- Test migrations on production-like data
- Never delete columns without deprecation period
```

### 규칙 수정

규칙은 행동을 제어합니다. `.claude/rules/`에서 편집하세요:

```
.claude/rules/
├── MUST-*.md      # 필수 (안전, 권한)
├── SHOULD-*.md    # 권장 (상호작용, 에러 처리)
└── MAY-*.md       # 선택 (최적화)
```

더 엄격한 코드 리뷰를 원하시나요? `SHOULD-interaction.md`를 편집하세요:

```markdown
## Code Review Standards

### Before Approving Any Code
- [ ] All tests pass
- [ ] No security vulnerabilities
- [ ] Performance impact assessed
- [ ] Documentation updated
```

### 커스텀 파이프라인 생성

`pipelines/`에서 반복 가능한 워크플로우를 정의하세요:

```yaml
# pipelines/deploy-review.yaml
name: deploy-review
description: Pre-deployment review workflow

steps:
  - id: security_scan
    agent: qa-lead
    action: security_review

  - id: performance_check
    agent: optimizer
    action: analyze_performance

  - id: migration_review
    agent: migration-expert  # 방금 만든 커스텀 에이전트!
    action: review_migrations
```

실행: `pipeline:run deploy-review`

### 기본 제공 + 커스텀 조합

진정한 힘은 모든 것을 결합하는 것입니다:

```
your-project/
├── agents/
│   ├── orchestrator/          # 기본 제공: planner, secretary
│   ├── sw-engineer/
│   │   ├── language/          # 기본 제공: golang, python, rust...
│   │   └── migration-expert/  # 당신의 커스텀 에이전트
│   └── your-team/             # 당신 팀 전용 에이전트
├── skills/
│   ├── development/           # 기본 제공: 베스트 프랙티스
│   └── your-company/          # 당신 회사 표준
└── .claude/rules/
    ├── MUST-safety.md         # 기본 제공
    └── MUST-your-policy.md    # 당신 회사 정책
```

---

## 기본 제공 항목

> **[baekgom-agents](https://github.com/baekenough/baekgom-agents)에서 동기화된 템플릿** - 서브 에이전트 오케스트레이션을 지원하는 실전 검증 에이전트 시스템.

### 에이전트 (37개)

| 카테고리 | 수 | 에이전트 |
|----------|-----|----------|
| **오케스트레이터** | 4 | planner, secretary, dev-lead, qa-lead |
| **매니저** | 6 | creator, updater, supplier, gitnerd, sync-checker, sauron |
| **시스템** | 2 | memory-keeper, naggy |
| **언어** | 6 | golang, python, rust, kotlin, typescript, java21 |
| **프론트엔드** | 3 | vercel-agent, vuejs-agent, svelte-agent |
| **백엔드** | 5 | fastapi, springboot, go-backend, express, nestjs |
| **툴링** | 3 | npm-expert, optimizer, bun-expert |
| **아키텍처** | 2 | documenter, speckit-agent |
| **인프라** | 2 | docker-expert, aws-expert |
| **QA** | 3 | qa-planner, qa-writer, qa-engineer |
| **튜터** | 1 | go-tutor |
| **합계** | **37** | |

### 스킬 (17개)

- **개발**: Go, Python, TypeScript, Kotlin, Rust, Java, React, Vercel
- **백엔드**: FastAPI, Spring Boot, Express, NestJS, Go Backend
- **인프라**: Docker, AWS
- **시스템**: 메모리 관리, 결과 집계
- **오케스트레이션**: 파이프라인 실행, 인텐트 감지

### 가이드 (12개)

종합 참조 문서:
- 에이전트 생성 및 관리
- 스킬 개발
- 파이프라인 워크플로우
- 베스트 프랙티스 및 패턴

### 규칙 (18개)

| 우선순위 | 개수 | 목적 |
|----------|------|------|
| MUST | 10 | 안전, 권한, 에이전트 설계 (강제) |
| SHOULD | 6 | 상호작용, 에러 처리 (권장) |
| MAY | 2 | 최적화 가이드라인 (선택) |

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

---

## 프로젝트 구조

`omcustom init` 후:

```
your-project/
├── CLAUDE.md              # Claude 진입점
├── .claude/
│   ├── rules/             # 행동 규칙
│   ├── hooks/             # 이벤트 훅
│   └── contexts/          # 컨텍스트 파일
├── agents/                # 모든 에이전트
├── skills/                # 모든 스킬
├── guides/                # 참조 문서
├── pipelines/             # 워크플로우 정의
└── commands/              # 명령어 정의
```

---

## 개발

```bash
bun install          # 의존성 설치
bun run dev          # 개발 모드
bun test             # 테스트 실행
bun run build        # 프로덕션 빌드
```

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
  <strong>당신의 Claude Code. 당신의 규칙. 당신의 방식.</strong>
</p>

<p align="center">
  Made with care by <a href="https://github.com/baekenough">baekenough</a>
</p>

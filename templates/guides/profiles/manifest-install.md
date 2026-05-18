# Manifest Profiles — Install Guide

> **Source**: `templates/manifest.json#profiles`
> **Related skill**: `.claude/skills/profile/SKILL.md`
> **Issue**: #1177 (ECC manifest-install `--profile minimal/full` pattern)

`--profile` 플래그를 사용하면 설치 시 포함할 에이전트·스킬·가이드 범위를 지정할 수 있습니다. 사용자 진입 비용(deactivation cost)을 줄이고, 목적에 맞는 최소 자산 세트로 빠르게 시작할 수 있습니다.

## 사용 방법

```bash
# 기본 설치 (full — 전체 자산)
omcustom install

# 프로필 지정 설치
omcustom install --profile minimal
omcustom install --profile web-app
omcustom install --profile data-eng
omcustom install --profile harness-dev
omcustom install --profile full
```

## 프로필 목록

| 프로필 | 설명 | 추천 대상 |
|--------|------|-----------|
| `minimal` | 필수 최소 자산 (코어 SW Engineer + Manager) | 학습·실험·경량 환경 |
| `full` | 전체 자산 (기본값) | 프로덕션, 다양한 도메인 |
| `web-app` | 풀스택 웹 앱 개발 자산 | TypeScript/Python 풀스택 팀 |
| `data-eng` | 데이터 엔지니어링 자산 | Airflow/Spark/dbt/Kafka/Snowflake |
| `harness-dev` | oh-my-customcode 하네스 개발 자산 | 에이전트·스킬·룰 작성자 |

---

## 프로필별 포함 자산

### minimal

사용 시나리오: 첫 설치, 학습 환경, 토큰 비용 최소화.

| 카테고리 | 포함 자산 |
|----------|-----------|
| 에이전트 | `mgr-*` (6개), `lang-*-expert` (6개), `sys-memory-keeper` |
| 스킬 | scope: `core` + scope: `harness` 전체 |
| 가이드 | `agent-design`, `git-safety`, `claude-code` |

**배제**: 프레임워크 전문가(BE/FE/DE), QA 팀, 인프라, 보안, DB 전문가.

### full

사용 시나리오: 프로덕션 팀, 다양한 기술 스택, 기본 설치.

| 카테고리 | 포함 자산 |
|----------|-----------|
| 에이전트 | 전체 49개 |
| 스킬 | 전체 119개 |
| 가이드 | 전체 54개 |

`omcustom install` (profile 플래그 생략 시) 와 동일합니다.

### web-app

사용 시나리오: TypeScript/Python 풀스택 웹 앱 개발팀.

| 카테고리 | 포함 자산 |
|----------|-----------|
| 에이전트 | `lang-typescript-expert`, `lang-python-expert`, `fe-vercel-agent`, `fe-design-expert`, `be-fastapi-expert`, `be-express-expert`, `be-nestjs-expert`, `db-postgres-expert`, `db-supabase-expert`, `db-redis-expert`, `infra-docker-expert`, `mgr-*` |
| 스킬 | scope: `core` + `react-best-practices`, `typescript-best-practices`, `fastapi-best-practices`, `nextjs-best-practices` |
| 가이드 | `agent-design`, `git-safety`, `claude-code`, `drizzle-orm`, `docker`, `fastapi`, `nextjs`, `react` |

**배제**: 데이터 엔지니어링(DE), Java/Kotlin/Go/Rust 전문가, QA 팀, 보안.

### data-eng

사용 시나리오: 데이터 파이프라인 엔지니어링 팀.

| 카테고리 | 포함 자산 |
|----------|-----------|
| 에이전트 | `de-*` (6개), `db-postgres-expert`, `db-redis-expert`, `db-alembic-expert`, `lang-python-expert`, `mgr-*` |
| 스킬 | scope: `core` + `airflow-best-practices`, `dbt-best-practices` |
| 가이드 | `agent-design`, `git-safety`, `airflow`, `dbt`, `snowflake` |

**배제**: 프론트엔드, 백엔드 프레임워크, 인프라, QA.

### harness-dev

사용 시나리오: oh-my-customcode 시스템 자체 개발·유지보수.

| 카테고리 | 포함 자산 |
|----------|-----------|
| 에이전트 | `mgr-*` (6개), `arch-*` (2개), `sys-*` (4개 중 sys-naggy 포함), `wiki-curator`, `tracker-checkpoint` |
| 스킬 | scope: `harness` 전체 |
| 가이드 | `agent-design`, `git-safety`, `claude-code`, `skill-authoring`, `agent-workflow` |

**배제**: 언어/프레임워크/DE/QA/인프라 전문가.

---

## include 패턴 레퍼런스

`manifest.json#profiles[].include` 필드에 사용 가능한 패턴:

```json
{
  "include": "*"
}
```
전체 포함 (full 프로필과 동일).

```json
{
  "include": {
    "agents": ["mgr-*", "lang-typescript-expert"],
    "skills": [{"scope": "core"}, "react-best-practices"],
    "guides": ["agent-design", "git-safety"]
  }
}
```
카테고리별 부분 포함.

| 표현식 | 의미 |
|--------|------|
| `"*"` | 카테고리 전체 포함 |
| `"mgr-*"` | 접두사 glob 매칭 |
| `"lang-*-expert"` | 와일드카드 glob 매칭 |
| `{"scope": "core"}` | SKILL.md `scope` 필드 기준 필터 |
| `"react-best-practices"` | 정확한 이름 매칭 |

---

## Plugin Profile vs Manifest Profile

두 프로필 시스템은 **서로 독립**입니다.

| 구분 | 경로 | 역할 | 적용 시점 |
|------|------|------|-----------|
| **Plugin profiles** | `.claude/profiles/*.json` | `~/.claude/settings.json` plugin on/off | 세션 재시작 후 |
| **Manifest profiles** | `templates/manifest.json#profiles` | 설치 시 에이전트·스킬·가이드 범위 | `omcustom install --profile` |

동일한 이름(예: `web-app`)이 두 시스템에 모두 존재하면 각각 독립적으로 적용됩니다:

```bash
# Manifest profile: 설치 자산 범위
omcustom install --profile web-app

# Plugin profile: 플러그인 on/off
/profile load web-app
```

---

## 커스텀 프로필 추가

`templates/manifest.json` 의 `profiles` 객체에 새 키를 추가합니다:

```json
"my-profile": {
  "description": "My custom profile description",
  "include": {
    "agents": ["lang-golang-expert", "be-go-backend-expert", "mgr-*"],
    "skills": [{"scope": "core"}],
    "guides": ["agent-design", "git-safety"]
  }
}
```

커스텀 프로필은 `omcustom install --profile my-profile` 로 즉시 사용 가능합니다.

---

## 관련 자료

- `.claude/skills/profile/SKILL.md` — Plugin profile 전환 스킬
- `templates/manifest.json` — 전체 manifest 및 profiles 정의
- `guides/agent-design/` — 에이전트 설계 가이드
- Issue #1177 — ECC manifest-install 패턴 흡수
- Issue #1170 — ECC 4 패턴 흡수 epic

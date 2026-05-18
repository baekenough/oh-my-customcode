# templates/

> **oh-my-customcode 배포 디렉토리**
>
> `omcustom init` 실행 시 새 프로젝트에 복사되는 파일들의 소스입니다.

---

## 목적 (Purpose)

`templates/`는 oh-my-customcode의 **배포 구조(distribution structure)**입니다.

사용자가 새 프로젝트에서 `omcustom init`을 실행하면, 이 디렉토리의 내용이 대상 프로젝트 루트로 복사됩니다. 즉, 이 디렉토리는 oh-my-customcode가 제공하는 에이전트 시스템의 **완성된 스냅샷**입니다.

```
oh-my-customcode 소스 레포
  └── templates/                   ← 배포 소스 (이 디렉토리)
        ├── .claude/
        ├── guides/
        └── CLAUDE.md

사용자 프로젝트 (omcustom init 후)
  └── your-project/
        ├── .claude/               ← templates/.claude/ 에서 복사
        ├── guides/                ← templates/guides/ 에서 복사
        └── CLAUDE.md              ← templates/CLAUDE.md 에서 복사
```

---

## 메인 README와의 관계

| 문서 | 대상 | 설명 |
|------|------|------|
| [`/README.md`](../README.md) | oh-my-customcode **자체** | 프로젝트 소개, 철학, 설치 가이드 |
| `templates/README.md` (이 파일) | **배포 콘텐츠** | 배포되는 파일 구조와 카운트 |

메인 README는 oh-my-customcode라는 도구를 설명합니다. 이 파일은 그 도구가 배포하는 내용물을 설명합니다.

---

## 디렉토리 구조

```
templates/
├── README.md                        # 이 파일 (배포 콘텐츠 문서)
├── CLAUDE.md                        # 에이전트 시스템 진입점
├── manifest.json                    # 배포 컴포넌트 카운트 및 메타데이터
├── .claude/
│   ├── agents/                      # 에이전트 정의 파일 (*.md, 49개)
│   ├── skills/                      # 스킬 모듈 (각 디렉토리에 SKILL.md, 119개)
│   ├── rules/                       # 전역 규칙 (R000–R023, 23개)
│   ├── hooks/
│   │   ├── hooks.json               # 훅 이벤트 설정 (PreToolUse/PostToolUse 등)
│   │   └── scripts/                 # 훅 셸 스크립트 (34개)
│   ├── contexts/                    # 컨텍스트 설정 파일 (ecomode 등)
│   └── ontology/                    # Ontology-RAG 지식 그래프
└── guides/                          # 레퍼런스 문서 디렉토리 (54개)
```

---

## 컴포넌트 (Components)

아래 카운트는 `templates/manifest.json`과 동기화됩니다.
CI의 `verify-template-sync.sh`가 소스와 templates/ 간 일치를 검증합니다.

### Agents (49)

`.claude/agents/*.md` — 에이전트 정의 파일.

각 파일은 단일 전문가 에이전트를 정의합니다. frontmatter에 `name`, `description`, `model`, `tools`가 필수 포함됩니다.

| 카테고리 | 수량 |
|----------|------|
| SW Engineer / Language | 6 |
| SW Engineer / Backend | 6 |
| SW Engineer / Frontend | 5 |
| SW Engineer / Tooling | 4 |
| DE Engineer | 6 |
| SW Engineer / Database | 4 |
| Security | 1 |
| SW Architect | 2 |
| Infra Engineer | 2 |
| QA Team | 3 |
| Manager | 6 |
| System | 4 |

### Skills (119)

`.claude/skills/*/SKILL.md` — 재사용 가능한 스킬 모듈.

각 스킬 디렉토리에 `SKILL.md`가 있으며, 필요에 따라 `scripts/` 서브디렉토리를 포함합니다.

스킬 범위(`scope`):
- `core` — 범용 개발 도구 (init 시 배포됨)
- `harness` — 에이전트/스킬/룰 유지보수 도구 (init 시 배포됨)
- `package` — 패키지 특화 도구 (선택 배포)

### Rules (23)

`.claude/rules/*.md` — 에이전트 행동 규칙 (R000–R023, R014 없음).

파일명 형식: `{PRIORITY}-{name}.md` (예: `MUST-agent-identification.md`)

| 우선순위 | 의미 | 예 |
|----------|------|-----|
| `MUST` | 절대 준수 | R007 에이전트 식별, R009 병렬 실행 |
| `SHOULD` | 강력 권장 | R003 상호작용, R013 Ecomode |
| `MAY` | 선택 | R005 최적화 |

### Guides (54)

`guides/*/` — 레퍼런스 문서 디렉토리.

각 디렉토리는 단일 토픽에 대한 best practices, 튜토리얼, 또는 설계 가이드를 담습니다. 에이전트가 작업 중 참조합니다 (R006 관심사 분리).

### Hooks (35)

`.claude/hooks/scripts/*.sh` — 라이프사이클 훅 스크립트.

`hooks.json`에 정의된 이벤트(PreToolUse, PostToolUse, Stop 등)에 반응합니다.

주요 훅 스크립트:

| 스크립트 | 역할 |
|----------|------|
| `secret-filter.sh` | API 키/시크릿 노출 방지 |
| `stage-blocker.sh` | 스테이지 게이트 강제 |
| `rule-deletion-guard.sh` | 규칙 파일 삭제 차단 |
| `stuck-detector.sh` | 에이전트 무한루프 감지 |
| `context-budget-advisor.sh` | 컨텍스트 예산 경고 |
| `cost-cap-advisor.sh` | 비용 한도 초과 경고 |

---

## 사용 방법 (Usage)

### omcustom init

```bash
# 전역 설치
npm install -g oh-my-customcode

# 프로젝트에 oh-my-customcode 초기화
cd your-project
omcustom init
```

`omcustom init`은 이 `templates/` 디렉토리의 내용을 대상 프로젝트에 복사합니다:
1. `.claude/` 전체 (agents, skills, rules, hooks, contexts, ontology)
2. `guides/` 전체
3. `CLAUDE.md` (프로젝트 진입점)

### 선택적 업데이트

이미 초기화된 프로젝트를 최신 버전으로 업데이트할 때:

```bash
omcustom update
```

---

## 동기화 검증

소스(`.claude/`, `guides/`)와 `templates/` 간 동기화는 CI에서 자동 검증됩니다.

```bash
# 로컬 검증
bash .github/scripts/verify-template-sync.sh
```

검증 항목:
- 스킬 수 일치 (`.claude/skills/` ↔ `templates/.claude/skills/`)
- 에이전트 수 일치
- 룰 수 일치
- 가이드 수 일치
- 훅 스크립트 수 일치
- `manifest.json` 카운트 일치

소스에 새 파일을 추가할 때는 반드시 `templates/`에도 동기화해야 합니다.
`manifest.json`의 카운트도 함께 업데이트하세요.

---

## 기여 가이드 참조

에이전트, 스킬, 룰 추가/수정 시 3중 동기화가 필요합니다:

1. **원본**: `.claude/agents/`, `.claude/skills/`, `.claude/rules/`, `guides/`
2. **templates 복사**: `templates/.claude/agents/`, `templates/.claude/skills/` 등
3. **카운트 업데이트**: `templates/manifest.json`, `README.md`, `CLAUDE.md` 등

자세한 내용은 프로젝트 루트의 기여 가이드 및 `guides/` 참조 문서를 확인하세요.

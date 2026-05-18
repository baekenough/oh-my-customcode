# CRG (code-review-graph) 통합 가이드

> **출처**: [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)
> **관련 이슈**: #1171 (scout:integrate), #1169 (Phase β AgentMemory 전환)
> **wrapper 스킬**: `.claude/skills/crg-integration/SKILL.md`

## CRG 개요

code-review-graph(CRG)는 Python 기반 MCP(Model Context Protocol) 서버로, 코드베이스를 AST(Abstract Syntax Tree) 기반 지식 그래프로 변환하여 token-efficient한 컨텍스트 검색을 제공한다.

### 핵심 특성

| 항목 | 값 |
|------|-----|
| 구현 | Python MCP server |
| 전체 도구 수 | ~28개 |
| oh-my-customcode 노출 | 4개 (crg-integration 스킬) |
| 토큰 절감 벤치마크 | **8.2×** (AST 검색이 적합한 작업 기준) |
| Precision | 0.38 (recall-우선 튜닝 결과) |
| MRR | 0.35 |

### R013 Ecomode 정합성

CRG의 8.2× 토큰 절감은 R013 ecomode의 목표와 직접 정합한다. ecomode가 context 사용량 ≥ 60%에서 자동 활성화될 때, CRG 호출로 추가 파일 읽기 비용을 대폭 줄일 수 있다.

## ⚠️ Recall vs Precision — 핵심 경고

> **CRG는 recall이 정답이다. 일부 결과가 누락되면 보조 도구(grep, semantic search)를 병행하라.**

CRG는 누락(false negative)보다 잡음(false positive)을 선호하도록 튜닝되어 있다:

- precision 0.38은 "결과의 38%만 정확"이라는 의미가 **아니다**
- recall-우선 튜닝의 trade-off — 관련 없는 노드가 포함될 수 있다
- 결과에 없다고 해서 코드베이스에 없다는 뜻이 아니다
- **항상** grep 또는 semantic search로 교차 검증을 권장한다

## 설치

> **R001 정책**: auto-install 스크립트 또는 hook 작성 금지. 아래 명령어는 개발자가 직접 실행한다.

### 패키지 설치

```bash
# 방법 A: pip (기본)
pip install code-review-graph

# 방법 B: pipx (격리 환경 권장)
pipx install code-review-graph

# 방법 C: uvx (uv 기반 프로젝트)
uvx code-review-graph
```

### .mcp.json 수동 설정

프로젝트 루트 `.mcp.json` 또는 `~/.claude/.mcp.json`을 직접 편집한다:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "code-review-graph",
      "args": []
    }
  }
}
```

**주의**: `.mcp.json`을 자동으로 수정하는 스크립트나 hook은 R001 위반이다. 반드시 수동 편집한다.

설정 후 Claude Code를 재시작하면 MCP 도구가 활성화된다.

### 설치 확인

```bash
# 바이너리 확인
which code-review-graph

# 버전 확인
code-review-graph --version
```

## 초기 인덱싱

CRG는 첫 MCP 호출 시 lazy 인덱싱을 수행하지만, 대용량 코드베이스의 경우 명시적 인덱싱을 권장한다:

```bash
# 프로젝트 루트에서 실행
code-review-graph index

# 특정 경로만 인덱싱
code-review-graph index --path src/
```

인덱싱은 `.code-review-graph/` 캐시 디렉토리에 저장된다. `.gitignore`에 추가를 권장한다:

```
.code-review-graph/
```

## 노출 도구 4종 상세

### `get_minimal_context`

변경 코드의 최소 컨텍스트를 반환한다. 인접 함수, import 그래프만 추출하여 전체 파일 읽기를 대체한다.

```
입력: file path + line number (또는 function name)
출력: code excerpt + AST node list
용도: 디버깅, 특정 함수 컨텍스트 파악
```

### `get_impact_radius`

변경 시 영향 받는 함수/모듈을 recall-우선으로 반환한다.

```
입력: changed_files list (또는 diff)
출력: dependency tree
용도: PR 리뷰 전 변경 폭 파악, 리팩토링 위험도 평가
```

### `query_graph`

AST 노드 그래프에 자연어 쿼리를 실행한다.

```
입력: 자연어 쿼리 (예: "find all callers of process_event")
출력: node graph (함수/모듈 관계)
용도: 코드 검색, 의존성 파악
```

### `detect_changes`

두 Git 시점 간 의미적 차이를 감지한다. 단순 텍스트 diff가 아닌 AST 수준 변경을 추적한다.

```
입력: before_ref, after_ref (Git refs 또는 파일 경로)
출력: semantic diff (이름 변경, 이동, 시그니처 변경 등)
용도: 리팩토링 검증, 의도치 않은 변경 감지
```

## 워크플로우 통합

### /dev-review와 조합

```
1. get_impact_radius(changed_files) → 영향 범위 확인
2. get_minimal_context(hot_spots) → 핵심 컨텍스트 추출
3. /dev-review {focused_files} → 범위를 좁힌 상세 리뷰
```

전체 디렉토리 리뷰 대신 CRG로 영향 범위를 먼저 파악하면 dev-review의 토큰 비용을 줄일 수 있다.

### /adversarial-review와 조합

```
1. get_minimal_context(target_function) → 최소 컨텍스트
2. /adversarial-review {minimal_context} → 보안/논리 취약점 검토
```

> **Cross-ref**: `dev-review` 및 `adversarial-review` 스킬에 CRG 호출 패턴 통합됨 (v0.140.0, #1180).

### R013 Ecomode 활성 시

context ≥ 60%에서 파일 직접 읽기 대신 CRG를 우선 사용한다:

| 기존 방식 | CRG 대체 |
|----------|---------|
| `Read(entire_file)` | `get_minimal_context(file, line)` |
| `Grep(pattern, recursive)` | `query_graph("find all X")` |
| `Read(affected_files[])` | `get_impact_radius(changed)` |

## 벤치마크 사용 시 주의

**8.2× 토큰 절감은 조건부다.**

| 작업 유형 | 절감 효과 |
|----------|----------|
| 함수 호출 그래프 탐색 | **높음** (AST 최적화 대상) |
| 의존성 영향 분석 | **높음** |
| 특정 패턴 코드 검색 | **중간** |
| UI 컴포넌트 리뷰 | **낮음** (자연어 설명 기반) |
| 자연어 검색 ("이 기능 어디에 있나") | **낮음** (semantic search 선호) |
| 설정 파일, YAML, JSON 분석 | **낮음** (AST 비적합) |

## 기존 자산 마이그레이션 매핑

Phase β에서 claude-mem 일부 기능을 CRG로 전환할 예정이다 (#1169).

| 기존 자산 | CRG 대체 도구 | 전환 시점 |
|----------|--------------|---------|
| `claude-mem:smart-explore` | `query_graph` | Phase β |
| `claude-mem:pathfinder` | `get_impact_radius` | Phase β |

**Phase β 완료 전까지**: 두 자산을 병행 사용. CRG를 우선 시도하고, 결과가 불충분하면 기존 자산 사용.

## 트러블슈팅

| 증상 | 원인 | 해결 방법 |
|------|------|---------|
| MCP 도구가 Claude Code에 보이지 않음 | `.mcp.json` 미설정 또는 경로 오류 | `.mcp.json` 위치 및 JSON 문법 확인 후 Claude Code 재시작 |
| `command not found: code-review-graph` | 패키지 미설치 또는 PATH 누락 | `pip install code-review-graph`, `which code-review-graph` 확인 |
| 첫 호출이 느림 | lazy 인덱싱 진행 중 | 정상 동작. `code-review-graph index`로 사전 인덱싱 권장 |
| 결과에 예상 함수가 없음 | recall-tuned — false negative 가능 | grep 또는 semantic search로 교차 검증 |
| 인덱싱 오류 (`index not found`) | 인덱싱 미완료 또는 캐시 손상 | `code-review-graph index --force` 실행 |
| MCP 연결 실패 | CRG 서버 미실행 | MCP 서버 로그 확인, `code-review-graph --version` 으로 바이너리 확인 |

## 참고 자료

- **GitHub**: [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)
- **wrapper 스킬**: `.claude/skills/crg-integration/SKILL.md`
- **관련 이슈**:
  - #1171: scout:integrate CRG (이 가이드의 origin)
  - #1169: Phase β AgentMemory 전환 시퀀싱
- **관련 규칙**:
  - R001 (MUST-safety.md): auto-install 금지 정책
  - R013 (SHOULD-ecomode.md): context budget 관리, ecomode 통합

---
name: crg-integration
description: code-review-graph (CRG) MCP wrapper — token-efficient context retrieval via AST knowledge graph. Exposes 4 core tools from CRG.
scope: core
version: 0.1.0
user-invocable: true
effort: low
---

# CRG Integration Skill

code-review-graph (CRG) MCP 서버의 핵심 4개 도구를 노출하는 wrapper 스킬.
전체 28개 도구 중 oh-my-customcode 워크플로우에서 가장 빈번하게 사용되는 도구만 선별해 사용자 학습 곡선을 축소한다.

## 목적

- **8.2× 토큰 절감** (CRG 공식 벤치마크): AST 기반 지식 그래프로 전체 파일 대신 관련 노드만 추출
- **Recall-우선 설계**: precision 0.38 / MRR 0.35 — 누락 없음이 우선, 잡음은 감수
- **R013 ecomode 보완**: context 사용량 ≥ 60% 시점에 CRG 호출로 추가 컨텍스트 주입 비용 절감

> **⚠️ Recall이 정답이 아니다** — 아래 주의 섹션을 먼저 읽어라.

## 노출 도구 4종

CRG 전체 28개 도구 중 핵심 4개만 노출한다.

| Tool | 용도 | 출력 형식 |
|------|------|----------|
| `get_minimal_context` | 변경 코드의 최소 컨텍스트 (인접 함수, import 그래프) | code excerpt + AST node list |
| `get_impact_radius` | 변경 시 영향 받는 함수/모듈 (recall-우선) | dependency tree |
| `query_graph` | AST 노드 그래프 쿼리 (예: "find all callers of X") | node graph |
| `detect_changes` | 두 시점 간 의미적 차이 감지 | semantic diff |

## 설치 가이드

> R001 정책: auto-install 스크립트 금지. 아래 명령어는 **사용자가 직접** 실행한다.

### 1단계: 패키지 설치

```bash
# 방법 A: pip
pip install code-review-graph

# 방법 B: pipx (격리 환경 권장)
pipx install code-review-graph

# 방법 C: uvx (uv 사용 시)
uvx code-review-graph
```

### 2단계: .mcp.json 수동 설정

프로젝트 루트 또는 `~/.claude/` 아래 `.mcp.json`을 **직접 편집**한다:

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

auto-install hook 또는 스크립트로 `.mcp.json`을 자동 수정하는 방식은 R001 위반이다.

### 3단계: 초기 인덱싱

```bash
# 명시적 인덱싱 (선택 — 첫 MCP 호출 시 lazy 인덱싱도 가능)
code-review-graph index
```

자세한 설치/설정 절차는 `guides/token-efficiency/crg.md` 참조.

## 사용 패턴

### PR 리뷰 전: 변경 폭 파악

```
get_impact_radius(changed_files=[...])
→ dependency tree 확인 → 리뷰 범위 결정
```

### 코드 검색: token-efficient lookup

```
query_graph(query="find all callers of process_event")
→ AST node graph → 전체 파일 읽지 않고 호출 지점만 추출
```

### 디버깅: 관련 함수만 추출

```
get_minimal_context(file="src/handler.py", line=142)
→ code excerpt + AST nodes → 필요한 컨텍스트만 주입
```

### 리팩토링: 의미적 변경 확인

```
detect_changes(before_ref="HEAD~1", after_ref="HEAD")
→ semantic diff → 이름 변경/이동 등 구조 변경 감지
```

## ⚠️ 주의 — Recall이 정답이 아니다

CRG는 recall 최적화 도구다. 다음 사항을 반드시 숙지한다:

| 오해 | 실제 |
|------|------|
| "결과에 없으면 없는 것" | recall-tuned — 일부 관련 코드가 누락될 수 있다 |
| "precision 0.38 = 결과 62% 오답" | recall-우선 튜닝의 precision trade-off. 잡음은 정상 |
| "CRG 하나로 충분" | 누락 발생 시 grep, semantic search 병행 필수 |
| "모든 작업에 8.2× 절감" | AST 검색이 적합한 작업에 한정. UI 리뷰, 자연어 검색은 효과 미미 |

**결론**: CRG는 보조 도구다. 결과를 맹신하지 말고 누락 가능성을 항상 고려한다.

## 다른 자산과의 관계

### 보완 관계 (함께 사용)

| 자산 | 조합 방식 |
|------|----------|
| `dev-review` | CRG로 영향 범위 파악 → dev-review로 상세 리뷰 |
| `adversarial-review` | CRG `get_minimal_context` → adversarial-review 입력 최적화 |
| `semble-integration` | Semble (의미) + CRG (구조) 결합으로 완전한 코드 이해 |

## R013 Ecomode와의 관계

R013 ecomode가 자동 활성화되는 시점 (context 사용량 ≥ 60%)에서 CRG를 적극 활용한다:

| Ecomode 상황 | CRG 활용법 |
|-------------|-----------|
| 파일 전체 읽기 대신 | `get_minimal_context` → 필요한 노드만 추출 |
| 광범위 grep 대신 | `query_graph` → AST 수준 정밀 검색 |
| 변경 범위 파악 대신 | `get_impact_radius` → dependency tree만 수신 |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| MCP 도구가 보이지 않음 | `.mcp.json` 미설정 또는 경로 오류 | `.mcp.json` 확인, Claude Code 재시작 |
| `command not found: code-review-graph` | 패키지 미설치 또는 PATH 누락 | `pip install code-review-graph` 재실행, `which code-review-graph` 확인 |
| 인덱싱 오류 | 초기 인덱싱 미완료 | `code-review-graph index` 실행 후 재시도 |
| 결과 누락 (예상 함수 없음) | recall-tuned 동작 — 정상 | grep 또는 semantic search 병행 |
| 서버 연결 실패 | CRG 서버 미실행 | MCP 서버 로그 확인, Claude Code 재시작 |

## 참고

- 상세 설치/설정: `guides/token-efficiency/crg.md`
- 관련 이슈: #1171 (scout:integrate CRG)
- 기술 출처: [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph)

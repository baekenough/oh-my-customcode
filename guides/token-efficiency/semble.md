# Semble 통합 가이드

> **출처**: [MinishLab/semble](https://github.com/MinishLab/semble)
> **관련 이슈**: #1173 (scout:integrate Semble)
> **wrapper 스킬**: `.claude/skills/semble-integration/SKILL.md`

## Semble 개요

Semble은 [MinishLab](https://github.com/MinishLab)이 개발한 MCP(Model Context Protocol) 서버로, 코드 인식 청킹(Chonkie) + 정적 임베딩(Model2Vec potion-code-16M) + BM25 + RRF 조합으로 의미 기반 코드 검색을 제공한다.

### 핵심 특성

| 항목 | 값 |
|------|-----|
| 구현 | Python MCP server |
| 청킹 엔진 | Chonkie (code-aware chunking) |
| 임베딩 모델 | Model2Vec potion-code-16M (정적 임베딩) |
| 검색 방식 | BM25 + RRF + embedding fusion |
| GitHub | ~1.5k stars (2026-05 기준) |
| 토큰 절감 | **~98%** (grep+Read 대비) |
| 정확도 | NDCG@10 = **0.854** (transformer 모델 수준) |

### R013 Ecomode 정합성

Semble의 ~98% 토큰 절감은 R013 ecomode의 목표와 직접 정합한다. ecomode가 context 사용량 ≥ 60%에서 자동 활성화될 때, Semble 호출로 광범위한 grep+Read 비용을 대폭 줄일 수 있다.

## 벤치마크 요약

| 지표 | 값 | 비고 |
|------|-----|------|
| CPU 인덱싱 | ~250ms (레포당 평균) | GPU 불필요 |
| 쿼리 응답 | ~1.5ms | 실시간 응답 수준 |
| NDCG@10 | 0.854 | transformer 모델 대비 동급 |
| 토큰 사용량 | ~98% 절감 | grep+Read 전략 대비 |

> **출처**: #1173 이슈 본문 및 MinishLab/semble 공식 벤치마크

### CRG와의 비교

| 항목 | Semble | CRG (code-review-graph) |
|------|--------|------------------------|
| 검색 방식 | 의미 기반 (임베딩) | 구조 기반 (AST) |
| 강점 | 자연어 쿼리, 패턴 유사성 | 호출 그래프, 의존성 분석 |
| 약점 | 구조 정보 없음 | 의미 검색 약함 |
| 토큰 절감 | ~98% (grep+Read 대비) | 8.2× |
| 정확도 | NDCG@10 = 0.854 | precision 0.38 (recall-우선) |

두 도구는 서로 다른 검색 축을 담당하며 결합 시 시너지 효과가 크다.

## 설치

> **R001 정책**: auto-install 스크립트 또는 hook 작성 금지. 아래 명령어는 개발자가 직접 실행한다.

### 패키지 설치

```bash
# uv 기반 설치 (권장)
uv tool install semble
```

uv가 없는 경우 먼저 설치한다 (사용자 직접 실행):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### MCP 서버 등록

```bash
# 방법 A: claude mcp 명령어 (권장)
claude mcp add semble -- semble mcp

# 방법 B: .mcp.json 수동 편집
```

`.mcp.json` 수동 설정 (프로젝트 루트 또는 `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "semble": {
      "command": "semble",
      "args": ["mcp"]
    }
  }
}
```

**주의**: `.mcp.json`을 자동으로 수정하는 스크립트나 hook은 R001 위반이다. 반드시 수동 편집한다.

설정 후 Claude Code를 재시작하면 MCP 도구가 활성화된다.

### 설치 확인

```bash
# 바이너리 확인
which semble

# 버전 확인
semble --version
```

## 인덱싱

Semble은 첫 MCP 호출 시 lazy 인덱싱을 수행하지만, 대용량 코드베이스의 경우 명시적 인덱싱을 권장한다:

```bash
# 프로젝트 루트에서 실행
semble index

# 특정 경로만 인덱싱
semble index --path src/
```

인덱싱은 로컬 캐시에 저장된다. `.gitignore`에 추가를 권장한다.

## 사용 시나리오

### 의미 검색 → Semble

자연어 쿼리로 코드 의미를 파악해야 할 때 Semble을 사용한다:

| 작업 | 도구 | 이유 |
|------|------|------|
| "인증 관련 코드 전부 찾기" | Semble | 자연어 의미 검색 |
| "에러 핸들링 컨벤션 파악" | Semble | 패턴 유사성 검색 |
| "이 로직과 비슷한 코드 찾기" | Semble | 의미 유사성 |
| "데이터 직렬화 예시 수집" | Semble | 코드 패턴 검색 |

### 구조 분석 → CRG

코드 구조와 의존성을 파악해야 할 때 CRG를 사용한다:

| 작업 | 도구 | 이유 |
|------|------|------|
| "이 함수의 caller는?" | CRG (`query_graph`) | AST 기반 호출 그래프 |
| "변경 영향 범위 파악" | CRG (`get_impact_radius`) | 의존성 트리 분석 |
| "PR 리뷰 전 변경 폭 파악" | CRG (`detect_changes`) | 의미적 diff |

### 결합 사용 예시

두 도구를 결합하면 의미 + 구조 양면에서 완전한 코드 이해가 가능하다:

```
1. Semble "authentication middleware" → 관련 파일 목록 식별
2. CRG get_impact_radius(identified_files) → 영향 범위 확인
3. Semble "auth error handling" → 에러 처리 패턴 수집
4. /dev-review {focused_files} → 좁혀진 범위의 상세 리뷰
```

## R013 Ecomode 통합

context ≥ 60%에서 광범위한 파일 읽기 대신 Semble을 우선 사용한다:

| 기존 방식 | Semble 대체 |
|----------|-----------|
| `Grep(pattern, recursive)` + `Read(file)` | Semble 의미 검색 단일 호출 |
| `Read(multiple_files[])` 패턴 파악 목적 | Semble 쿼리 → 관련 청크만 수신 |
| grep으로 키워드 검색 후 파일 읽기 | Semble 자연어 쿼리로 직접 청크 추출 |

## Explore 에이전트 힌트

Explore 에이전트가 Semble MCP를 사용 가능한 환경에서는, 코드베이스 탐색 시 grep+Read 조합보다 Semble 의미 검색을 우선 호출하는 것을 권장한다.

> Explore 에이전트 description 갱신은 별도 이슈로 추적 가능 (본 PR scope 외).

## 트러블슈팅

| 증상 | 원인 | 해결 방법 |
|------|------|---------|
| MCP 도구가 Claude Code에 보이지 않음 | `.mcp.json` 미설정 또는 `claude mcp add` 미실행 | MCP 등록 확인 후 Claude Code 재시작 |
| `command not found: semble` | 패키지 미설치 또는 PATH 누락 | `uv tool install semble`, `which semble` 확인 |
| uv 명령어 없음 | uv 미설치 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` 실행 |
| 첫 호출이 느림 | lazy 인덱싱 진행 중 | 정상 동작. `semble index`로 사전 인덱싱 권장 |
| 검색 결과 없음 | 인덱싱 범위 외 또는 쿼리 불명확 | `semble index` 재실행, 쿼리 구체화 |
| MCP 연결 실패 | Semble MCP 서버 미실행 | MCP 서버 로그 확인, `semble --version`으로 바이너리 확인 |
| 인덱싱 실패 | 권한 문제 또는 코드베이스 경로 오류 | 실행 경로 확인, `semble index --path .` 시도 |

## 참고 자료

- **GitHub**: [MinishLab/semble](https://github.com/MinishLab/semble)
- **wrapper 스킬**: `.claude/skills/semble-integration/SKILL.md`
- **관련 이슈**: #1173 (scout:integrate Semble)
- **보완 도구**: `guides/token-efficiency/crg.md` (구조 기반 검색)
- **관련 규칙**:
  - [[r001]] (MUST-safety.md): auto-install 금지 정책
  - [[r013]] (SHOULD-ecomode.md): context budget 관리, ecomode 통합
  - [[crg-integration]]: 구조 기반 검색 — 의미 검색 보완 대상

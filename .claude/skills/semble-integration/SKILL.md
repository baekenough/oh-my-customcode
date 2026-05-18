---
name: semble-integration
description: Semble (MinishLab) MCP wrapper — semantic code search via embeddings (98% token reduction vs grep+read, NDCG@10=0.854)
scope: core
version: 0.1.0
user-invocable: true
effort: low
---

# Semble Integration Skill

[MinishLab/semble](https://github.com/MinishLab/semble) MCP 서버의 의미 기반 코드 검색 도구를 노출하는 wrapper 스킬.
코드 인식 청킹 + 정적 임베딩 + BM25 + RRF 조합으로 transformer 수준 정확도를 CPU에서 달성한다.

## 목적

- **~98% 토큰 절감** (grep+Read 대비): 전체 파일 읽기 없이 의미적으로 관련된 코드 청크만 반환
- **의미 기반 검색**: 자연어 쿼리로 "비슷한 코드 찾기", "에러 핸들링 패턴 검색" 등 구조 검색이 어려운 작업에 특화
- **NDCG@10 = 0.854**: transformer 모델 수준 정확도를 CPU 인덱싱 (~250ms), 쿼리 (~1.5ms)로 달성
- **R013 ecomode 보완**: context 사용량 ≥ 60% 시점에 Semble 호출로 추가 파일 읽기 비용 절감

## CRG와의 보완 관계

Semble과 CRG는 서로 다른 검색 축을 담당하며 상호 보완적이다.

| 도구 | 검색 유형 | 강점 | 약점 |
|------|----------|------|------|
| `crg-integration` | 구조 (AST) | 호출 그래프, 영향 분석, recall-우선 | 의미 검색 약함 |
| `semble-integration` | 의미 (임베딩) | 자연어 쿼리, "비슷한 코드 찾기" | 구조 정보 없음 |

**사용 가이드**:
- "이 함수의 caller는?" → CRG (`query_graph`)
- "에러 핸들링 코드 패턴" → Semble
- "변경 영향 범위" → CRG (`get_impact_radius`)
- "인증 관련 코드 전부 찾기" → Semble (자연어 쿼리)

## 노출 도구

Semble MCP 서버가 제공하는 도구를 통해 다음 기능을 수행한다.
구체적인 tool 이름은 MCP 서버 설치 후 Claude Code MCP introspection으로 확인한다.

| 기능 | 설명 |
|------|------|
| 의미 검색 | 자연어 쿼리로 코드베이스 내 관련 청크 반환 |
| 인덱싱 | 코드베이스를 code-aware 청킹 + 정적 임베딩으로 인덱싱 (CPU ~250ms) |
| 결과 ranking | BM25 + RRF + embedding fusion으로 최종 랭킹 결정 |

> 자세한 tool 사양은 `guides/token-efficiency/semble.md` 참조.

## 설치 가이드

> R001 정책: auto-install 스크립트 금지. 아래 명령어는 **사용자가 직접** 실행한다.

### 1단계: 패키지 설치

```bash
# uv 기반 설치 (권장)
uv tool install semble
```

### 2단계: MCP 서버 등록

```bash
# 방법 A: claude mcp 명령어 (권장)
claude mcp add semble -- semble mcp

# 방법 B: .mcp.json 수동 편집
# 프로젝트 루트 또는 ~/.claude/.mcp.json 직접 수정
```

`.mcp.json` 수동 설정 예시:

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

auto-install hook 또는 스크립트로 `.mcp.json`을 자동 수정하는 방식은 R001 위반이다.

### 3단계: 인덱싱

```bash
# 명시적 인덱싱 (선택 — 첫 MCP 호출 시 lazy 인덱싱도 가능)
semble index
```

자세한 설치/설정 절차는 `guides/token-efficiency/semble.md` 참조.

## 사용 패턴

### 의미 기반 코드 검색

```
"인증 미들웨어 관련 코드 찾아줘"
→ Semble 의미 검색 → 관련 청크 반환 → 전체 파일 읽기 없이 컨텍스트 주입
```

### 패턴 검색

```
"에러 핸들링 컨벤션이 어떻게 되어 있어?"
→ Semble "error handling convention" 쿼리 → 패턴 예시 청크 반환
```

### dev-review/adversarial-review와 조합

```
1. Semble로 유사 패턴 사전 조사
2. /dev-review {focused_files} → 범위를 좁힌 리뷰
```

### CRG와 결합 사용

```
1. Semble "authentication related code" → 관련 파일 목록 식별
2. CRG get_impact_radius(identified_files) → 영향 범위 확인
3. 두 결과를 조합하여 완전한 컨텍스트 구성
```

## R013 Ecomode와의 관계

R013 ecomode가 자동 활성화되는 시점 (context 사용량 ≥ 60%)에서 Semble을 적극 활용한다:

| Ecomode 상황 | Semble 활용법 |
|-------------|--------------|
| 광범위 grep 대신 | Semble 의미 검색 → 관련 청크만 추출 |
| 파일 전체 읽기 대신 | Semble으로 관련 섹션만 수신 |
| 패턴 파악 시 | Semble 쿼리 → 대표 예시만 수집 |

## 다른 자산과의 관계

### 보완 관계 (함께 사용)

| 자산 | 조합 방식 |
|------|----------|
| `crg-integration` | Semble (의미) + CRG (구조) 결합으로 완전한 코드 이해 |
| `dev-review` | Semble로 유사 패턴 사전 조사 → dev-review 입력 최적화 |
| `adversarial-review` | Semble로 관련 보안 패턴 수집 → adversarial-review 컨텍스트 보강 |

### 대체 후보 (일부 use case)

| 기존 방식 | Semble 대체 가능 여부 |
|----------|---------------------|
| `claude-mem:smart-explore` 의 자연어 탐색 | 일부 대체 가능 — 구조 탐색은 CRG 유지 |
| grep + Read 조합의 패턴 검색 | 대체 권장 (98% 토큰 절감) |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| MCP 도구가 보이지 않음 | `.mcp.json` 미설정 또는 `claude mcp add` 미실행 | MCP 등록 확인, Claude Code 재시작 |
| `command not found: semble` | uv tool install 미실행 또는 PATH 누락 | `uv tool install semble` 재실행, `which semble` 확인 |
| 인덱싱 오류 | 초기 인덱싱 미완료 | `semble index` 실행 후 재시도 |
| 검색 결과 없음 | 인덱싱 범위 외 또는 쿼리 불명확 | 인덱싱 재실행, 쿼리 구체화 |
| 서버 연결 실패 | Semble MCP 서버 미실행 | MCP 서버 로그 확인, Claude Code 재시작 |
| uv 미설치 | uv 패키지 매니저 없음 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` (사용자 직접 실행) |

## 참고

- 상세 설치/설정: `guides/token-efficiency/semble.md`
- 관련 이슈: #1173 (scout:integrate Semble)
- 기술 출처: [MinishLab/semble](https://github.com/MinishLab/semble)
- 보완 자산: `crg-integration` (구조 기반 검색)

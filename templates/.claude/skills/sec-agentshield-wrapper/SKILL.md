---
name: sec-agentshield-wrapper
description: Pre-flight security analysis before code changes — identifies trust boundary risks, dangerous patterns, and provides proceed/caution/block advisory before implementation starts
scope: core
version: 0.1.0
user-invocable: true
effort: medium
argument-hint: '"<파일/영역 설명> — <변경 의도>"'
---

# 보안 사전 분석 Wrapper (sec-agentshield-wrapper)

코드 작업을 시작하기 전에 보안 위험을 사전 식별하는 pre-flight 스킬.
작업 진입 전 단계에서 트러스트 경계, 위험 패턴, 권한 변경을 분석하여 진행 여부 advisory를 제공한다.

## 기존 보안 자산과의 차별점

| 자산 | 시점 | 강점 | 약점 |
|------|------|------|------|
| `sec-codeql-expert` | post-write (작성 후 분석) | CodeQL 정적 분석, CVE 매칭, SARIF 출력 | 코드가 이미 작성된 후 문제 발견 |
| `adversarial-review` | post-write (리뷰 단계) | 공격자 마인드, STRIDE+OWASP 4단계 리뷰 | 구현 완료 후 대규모 수정 필요할 수 있음 |
| `cve-triage` | issue-triggered (CVE 발생 후) | CVE 평가, 재현 분석, 패치 검증 | 알려진 CVE에만 반응, 사전 예방 불가 |
| **sec-agentshield-wrapper** | **pre-write (작업 시작 전)** | **사전 차단, 작업 진입 전 위험 식별** | 휴리스틱 기반, 구현 세부사항 미파악 |

**핵심 차별점**: 이 스킬은 코드를 쓰기 _전에_ 실행한다. 작업 범위와 의도만으로 위험 패턴을 식별하여 설계 단계에서 보안 방향을 잡는다.

## 워크플로우

### 입력 형식

```
/sec-agentshield-wrapper "<변경 대상 파일/영역> — <변경 의도>"
```

예시:
```
/sec-agentshield-wrapper "auth-middleware.ts — refresh token 처리 추가"
/sec-agentshield-wrapper "UserController.java — 외부 API 호출 기능 추가"
/sec-agentshield-wrapper "upload.py — 파일 업로드 엔드포인트 신규 구현"
```

### 1단계: 트러스트 경계 영역 식별

변경 대상 파일/영역이 트러스트 경계에 해당하는지 판단한다.

**고위험 영역 분류**:

| 영역 유형 | 예시 | 위험 수준 |
|-----------|------|-----------|
| 인증/인가 로직 | auth, jwt, session, permission | CRITICAL |
| 외부 입력 처리 | request body, query params, file upload | HIGH |
| 외부 API 호출 | HTTP client, SDK wrapper, webhook | HIGH |
| 데이터 직렬화 | JSON parse, YAML, XML | MEDIUM |
| 파일 시스템 접근 | read/write path, temp files | MEDIUM |
| 설정/환경 변수 | config, env, secrets | HIGH |
| 데이터베이스 쿼리 | raw SQL, ORM query builder | HIGH |

CRG `query_graph` 활용 권장 — 변경 함수의 caller 체인을 추적하여 트러스트 경계 도달 여부를 확인한다.

### 2단계: 위험 패턴 매칭

변경 의도에서 다음 위험 패턴을 식별한다:

**자동 트리거 패턴**:

| 패턴 키워드 | 위험 유형 | 체크 항목 |
|-------------|-----------|-----------|
| token, jwt, session | 토큰 위조/재사용 | 서명 검증, 만료 처리, 재사용 방지 |
| refresh, rotation | 토큰 갱신 경쟁 조건 | 원자성, 동시 요청 처리 |
| upload, file, multipart | 파일 업로드 공격 | 확장자 검증, 경로 탐색, 크기 제한 |
| admin, role, permission | 권한 상승 | 역할 검증, 최소 권한, 기본값 |
| external, api, webhook | SSRF/외부 요청 | URL 화이트리스트, 타임아웃, 재시도 |
| query, sql, filter | SQL 인젝션 | 파라미터화 쿼리, ORM 사용 여부 |
| eval, exec, subprocess | 코드 실행 | 입력 새니타이즈, 허용 명령 목록 |
| serialize, deserialize, pickle | 역직렬화 공격 | 신뢰할 수 없는 데이터 처리 여부 |
| redirect, url, callback | 오픈 리다이렉트 | URL 검증, 도메인 화이트리스트 |

### 3단계: Advisory 출력

분석 결과를 3가지 레벨로 출력한다:

- **PROCEED** — 식별된 고위험 패턴 없음, 표준 구현 진행 가능
- **CAUTION** — 주의 필요 항목 존재, 체크리스트와 함께 진행
- **BLOCK** — 설계 재검토 권장, 보안 전문가 리뷰 후 진행

## 출력 형식

```markdown
## 보안 사전 분석 — sec-agentshield-wrapper

**대상**: {파일/영역}
**의도**: {변경 의도}
**Advisory**: PROCEED | CAUTION | BLOCK

### 트러스트 경계 분석

| 영역 | 해당 여부 | 위험 수준 |
|------|-----------|-----------|
| {영역명} | Yes/No | CRITICAL/HIGH/MEDIUM/LOW |

### 식별된 위험 패턴

| 패턴 | 위험 유형 | 권장 사항 |
|------|-----------|-----------|
| {패턴} | {유형} | {권장} |

### 구현 전 체크리스트

- [ ] {체크 항목 1}
- [ ] {체크 항목 2}

### 권장 후속 작업

- 구현 후: `adversarial-review` 로 공격자 관점 리뷰
- 패턴 기반 분석: `sec-codeql-expert` 로 CodeQL 정적 분석
- CVE 관련: `cve-triage` 로 의존성 취약점 확인
```

## 호출 패턴 예시

**단일 파일**:
```
/sec-agentshield-wrapper "auth-middleware.ts — refresh token 처리 추가"
```

**여러 파일/영역**:
```
/sec-agentshield-wrapper "UserService.java, AuthController.java — OAuth2 로그인 플로우 추가"
```

**신규 기능**:
```
/sec-agentshield-wrapper "upload/ 디렉토리 — 사용자 파일 업로드 기능 신규 구현"
```

## 다른 자산과의 조합

권장 보안 파이프라인:

```
sec-agentshield-wrapper (pre-write)
  → 구현
  → adversarial-review (post-write, 공격자 관점)
  → sec-codeql-expert (post-write, 정적 분석)
```

CVE 발생 시 별도 트리거:
```
cve-triage (CVE 이슈 수신 시)
  → sec-codeql-expert (영향 범위 분석)
```

## CRG 통합 (선택)

CRG MCP 연결 시 1단계 트러스트 경계 분석 정확도가 향상된다:

| CRG 도구 | 활용 목적 |
|----------|-----------|
| `query_graph` | 변경 함수의 caller 체인 추적, 트러스트 경계 도달 여부 확인 |
| `get_impact_radius` | 변경의 영향 반경 파악, 위험 확산 범위 예측 |
| `detect_changes` | 보안 관련 함수의 의미적 변경 감지 |

CRG 미연결 시 Grep + Read 조합으로 fallback.

## 한계

- **휴리스틱 기반**: 키워드 매칭과 영역 분류 기반이므로 100% recall을 보장하지 않음
- **구현 세부사항 미파악**: 실제 코드가 없으므로 로직 플로우 분석 불가
- **False positive 가능성**: 보안 관련 키워드가 포함되어도 실제 위험이 없을 수 있음
- **보완 필요**: 구현 후 `adversarial-review` + `sec-codeql-expert` 조합으로 보완 권장

## Permission Mode

이 스킬에서 Agent 도구를 사용하여 에이전트를 스폰할 경우, 항상 `mode: "bypassPermissions"` 를 전달해야 한다. Agent 도구의 기본값(`acceptEdits`)은 에이전트 frontmatter `permissionMode` 를 덮어쓰므로 무인 실행 중 권한 프롬프트가 발생할 수 있다.

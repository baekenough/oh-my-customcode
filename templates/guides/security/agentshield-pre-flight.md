# 보안 사전 분석 패턴 (AgentShield Pre-flight)

코드 변경을 시작하기 전에 보안 위험을 식별하는 pre-flight 패턴에 대한 레퍼런스 가이드.

## 배경

전통적인 보안 검토는 코드가 작성된 후(post-write)에 이루어진다. 이 패턴은 작성 전(pre-write) 단계에서 보안 위험을 식별하여 설계 단계에서 방향을 잡는다.

**ECC(External Code Corpus) 출처**: `sec-agentshield-wrapper` 패턴은 ECC의 AgentShield 구현에서 흡수되었다. 원본은 코드 변경 전 보안 사전 분석 wrapper로 사용되었으며, oh-my-customcode의 기존 보안 자산(`sec-codeql-expert`, `adversarial-review`, `cve-triage`)과 통합된 형태로 재설계되었다.

## 보안 자산 전체 매트릭스

oh-my-customcode의 보안 관련 자산 전체를 시점과 역할 기준으로 정리한다:

| 자산 | 유형 | 실행 시점 | 주요 역할 | 인터페이스 |
|------|------|-----------|-----------|-----------|
| `sec-agentshield-wrapper` | skill | pre-write | 변경 의도 기반 위험 사전 식별 | `/sec-agentshield-wrapper "<설명>"` |
| `adversarial-review` | skill | post-write | 공격자 마인드 4단계 리뷰 | `/adversarial-review <파일>` |
| `sec-codeql-expert` | agent | post-write | CodeQL 정적 분석, CVE 매칭 | `@sec-codeql-expert` |
| `cve-triage` | skill | issue-triggered | CVE 평가, 재현 분석, 패치 검증 | (sec-codeql-expert 내부 호출) |

## Pre-flight 패턴의 필요성

### 기존 방식의 문제

```
기존 흐름:
  요구사항 → 구현 시작 → (보안 문제 포함) 구현 완료 → 코드 리뷰 → 보안 결함 발견 → 재작업
```

재작업 비용이 크다. 특히 인증/인가 로직, 외부 API 연동, 파일 업로드 등 보안 민감 영역에서 설계 단계의 잘못된 방향은 구현 완료 후 전면 수정으로 이어질 수 있다.

### Pre-flight 방식

```
개선된 흐름:
  요구사항 → sec-agentshield-wrapper 실행 → 위험 식별 + 체크리스트 수령 → 안전한 구현 → adversarial-review → sec-codeql-expert
```

변경 의도와 대상 파일만으로 트러스트 경계와 위험 패턴을 사전 식별한다.

## 사용 시나리오

### 시나리오 1: 인증 로직 변경

**상황**: refresh token 처리 로직 추가

```
/sec-agentshield-wrapper "auth-middleware.ts — refresh token rotation 추가"
```

**예상 Advisory**: CAUTION 또는 BLOCK

**식별 위험**:
- 토큰 재사용 공격 (token replay)
- 동시 요청 경쟁 조건 (refresh token race condition)
- 만료 처리 누락

**체크리스트**:
- [ ] refresh token은 1회 사용 후 무효화(rotation)
- [ ] 동시 refresh 요청에 대한 원자적 처리
- [ ] 이전 토큰 즉시 무효화
- [ ] refresh token 만료 시간 설정

### 시나리오 2: 파일 업로드 신규 구현

**상황**: 사용자 파일 업로드 기능 추가

```
/sec-agentshield-wrapper "upload.py — 사용자 이미지 업로드 엔드포인트 신규 구현"
```

**예상 Advisory**: CAUTION

**식별 위험**:
- 파일 확장자 우회 (Content-Type 스푸핑)
- 경로 탐색 (path traversal)
- 파일 크기 미제한

**체크리스트**:
- [ ] MIME 타입 + 확장자 이중 검증 (allowlist 방식)
- [ ] 파일명 새니타이즈 (경로 문자 제거)
- [ ] 최대 파일 크기 제한
- [ ] 저장 경로를 웹 루트 외부로 설정

### 시나리오 3: 외부 API 연동 추가

**상황**: 외부 결제 API 연동

```
/sec-agentshield-wrapper "PaymentService.java — Stripe 웹훅 수신 처리 추가"
```

**예상 Advisory**: CAUTION

**식별 위험**:
- 웹훅 서명 검증 누락
- SSRF 가능성 (URL 파라미터화 시)
- 재시도 처리에서의 중복 결제

**체크리스트**:
- [ ] Stripe 서명 헤더(`Stripe-Signature`) 검증
- [ ] 이벤트 ID 기반 멱등성 처리
- [ ] 웹훅 페이로드 크기 제한

### 시나리오 4: 위험 없는 변경

**상황**: 로깅 포맷 변경

```
/sec-agentshield-wrapper "logger.ts — 로그 출력 포맷 JSON으로 변경"
```

**예상 Advisory**: PROCEED

패턴 매칭 결과 고위험 패턴 없음. 단, 로그에 민감 정보(토큰, PII) 포함 여부는 구현 시 주의.

## 다른 자산과의 조합 패턴

### 표준 보안 파이프라인

보안 민감 기능 개발 시 권장 순서:

```
1. sec-agentshield-wrapper     ← 설계 전 위험 식별
2. 구현
3. adversarial-review          ← 공격자 관점 코드 리뷰
4. sec-codeql-expert           ← 정적 분석 (선택, CI에서도 가능)
```

### CVE 대응 파이프라인

CVE 알림 수신 시:

```
1. cve-triage                  ← CVE 영향 평가
2. sec-codeql-expert           ← 영향 범위 코드 분석
3. 패치 적용
4. adversarial-review          ← 패치 후 회귀 검증
```

### 긴급 핫픽스 시

시간이 제한된 긴급 수정 시:

```
1. sec-agentshield-wrapper     ← 빠른 위험 체크 (5분)
2. 구현
3. adversarial-review --depth quick   ← 빠른 리뷰
```

## 트리거 키워드 참고

다음 키워드가 변경 의도에 포함될 경우 반드시 pre-flight 실행:

**CRITICAL 트리거** (즉시 BLOCK 고려):
- `admin`, `superuser`, `root`, `privilege escalation`
- `bypass`, `skip auth`, `disable security`
- `eval(`, `exec(`, `system(`, `shell`

**HIGH 트리거** (CAUTION 이상 예상):
- `token`, `jwt`, `session`, `cookie`
- `password`, `credential`, `secret`, `key`
- `upload`, `file`, `multipart`
- `external`, `webhook`, `callback`, `redirect`
- `query`, `sql`, `filter`, `search`
- `permission`, `role`, `acl`

**MEDIUM 트리거** (상황에 따라 CAUTION):
- `serialize`, `deserialize`, `parse`
- `config`, `env`, `environment`
- `log`, `audit` (민감 정보 로깅 위험)

## 한계 및 향후 개선

### 현재 한계

1. **휴리스틱 기반**: 키워드와 영역 분류 기반이므로 100% recall 보장 불가
2. **구현 세부사항 부재**: 실제 코드가 없으므로 로직 플로우 분석 불가 — `adversarial-review` 로 보완 필요
3. **False positive**: 보안 관련 키워드 포함 코드가 실제로는 안전할 수 있음
4. **프레임워크 비인식**: Spring Security, Next.js Auth 등 프레임워크 레벨 보안 기능은 인식 못함

### 향후 개선 방향

1. **CRG 통합 강화**: `query_graph`로 caller 체인 자동 분석 → 트러스트 경계 도달 여부 자동 판단
2. **프로젝트별 패턴 학습**: `instinct-extractor` 연동으로 프로젝트 고유 위험 패턴 축적 (#1169)
3. **CI 통합**: PR 생성 시 변경 파일 기반 자동 pre-flight 실행
4. **severity calibration**: 프로젝트 히스토리 기반 false positive 감소

## 관련 자산

- `.claude/skills/sec-agentshield-wrapper/SKILL.md` — 스킬 정의 및 실행 워크플로우
- `.claude/skills/adversarial-review/SKILL.md` — post-write 공격자 관점 리뷰
- `.claude/skills/cve-triage/SKILL.md` — CVE 평가 워크플로우
- `.claude/agents/sec-codeql-expert.md` — CodeQL 정적 분석 에이전트
- `guides/security/agentshield-pre-flight.md` — 이 문서

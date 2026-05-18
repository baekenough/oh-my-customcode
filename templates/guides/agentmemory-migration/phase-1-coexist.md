# AgentMemory Migration — Phase 1: COEXIST (Week 1-2)

> **상태**: 활성 — 2026-05-18 시작 (#1169)
> **다음 단계**: Phase 2 SWITCH (measure 결과 후 GO/NO-GO 결정)
> **이전 단계**: [measure-step-zero.md](./measure-step-zero.md)

---

## 1. 개요

Phase 1 (COEXIST)는 claude-mem과 AgentMemory를 **동시에 운영**하는 단계입니다.
이 단계에서는 어떤 destructive 변경도 발생하지 않습니다:

- claude-mem 기존 Chroma 데이터 유지
- 12 plugin skill 폐기 없음
- 어댑터 코드 활성화 없음 (STUB 상태 유지)
- 자산 처리표 적용 없음

목표는 1주간 실제 사용 데이터를 수집하고, AgentMemory 설치와 공존 운영에 익숙해지는 것입니다.

| 항목 | Phase 1 (COEXIST) | Phase 2 (SWITCH) |
|------|-------------------|------------------|
| claude-mem | 활성 (기존 운영) | 비활성화 예정 |
| AgentMemory | 설치 후 병렬 활성 | 단독 운영 |
| 데이터 마이그레이션 | 없음 | 선택적 (측정 후 결정) |
| 어댑터 코드 | STUB 유지 | 활성화 |
| 자산 처리표 | 적용 보류 | 사용자 검토 후 적용 |

---

## 2. AgentMemory 설치

> **R001 주의**: auto-install 금지. 아래 명령어를 사용자 로컬에서 수동으로 실행합니다.

### 2-1. 패키지 설치

```bash
# 옵션 A: pip
pip install agentmemory

# 옵션 B: pipx (격리 환경 권장)
pipx install agentmemory

# 옵션 C: uvx (uv 사용 시)
uvx agentmemory
```

### 2-2. MCP 서버 등록

```bash
# Claude Code CLI로 등록
claude mcp add agentmemory -- agentmemory mcp

# 또는 .mcp.json 수동 편집 (R001 auto-install 금지)
# {
#   "mcpServers": {
#     "agentmemory": {
#       "command": "agentmemory",
#       "args": ["mcp"]
#     }
#   }
# }
```

### 2-3. 등록 확인

```bash
claude mcp list
# 출력에 agentmemory 서버가 표시되어야 합니다
```

---

## 3. COEXIST 정책

Phase 1 기간 동안 두 backend는 다음 정책에 따라 공존합니다.

### 3-1. 기본 운영 방식

| 작업 | 우선 backend | 비고 |
|------|-------------|------|
| 기존 메모리 조회 | claude-mem | 기존 Chroma 데이터 유지 |
| 신규 메모리 저장 | 둘 다 | COEXIST 기간 중 병렬 저장 권장 |
| 세션 종료 시 저장 | 둘 다 | R011 Session-End Self-Check 참조 |

### 3-2. 쿼리 병합 (memory-aggregator)

두 backend에서 결과가 반환될 경우 `memory-aggregator` 스킬이 결과를 병합합니다:

```
claude-mem.search(query)    →  결과 A
AgentMemory.search(query)   →  결과 B
memory-aggregator           →  A + B 중복 제거 후 반환
```

`memory-aggregator` 스킬이 없는 경우, 두 결과를 순서대로 제시하고 사용자가 선택합니다.

### 3-3. 충돌 방지 원칙

- claude-mem 기존 데이터를 AgentMemory로 자동 복사하지 않음
- 두 backend에 동일 키로 저장 시 별개 항목으로 취급
- 강제 동기화 없음 — Phase 2에서 마이그레이션 여부 결정

---

## 4. Dual-Backend 충돌 Advisory

`.mcp.json`에 두 서버가 동시 등록된 상태를 감지하면 다음 advisory를 출력합니다.

### 4-1. 감지 조건

```
.mcp.json 내 서버 목록:
  - "claude-mem" (또는 관련 tool prefix)
  - "agentmemory"
  → 두 개 동시 존재 시 Phase 1 COEXIST 상태로 간주
```

### 4-2. Advisory 메시지

```
[Advisory] Dual memory backend detected (Phase 1 COEXIST)
  - claude-mem: active (Chroma)
  - agentmemory: active (SQLite)
  현재 Phase 1 COEXIST 정책 적용 중 — 두 backend 병렬 운영
  Phase 2 SWITCH 진입 전까지 두 backend 유지
  가이드: guides/agentmemory-migration/phase-1-coexist.md
```

이 advisory는 경고가 아닙니다. Phase 1에서는 정상 상태입니다.

### 4-3. 강제 선택 (사용자 명시 시)

사용자가 명시적으로 "agentmemory만 사용" 또는 "claude-mem만 사용"을 요청하는 경우,
해당 요청을 따르되 자산 처리표 적용 및 어댑터 활성화는 Phase 2 GO 결정 후 진행합니다.

---

## 5. 사용자 행동 계획

### 5-1. 1주 measure 루틴 (자동 트리거: 2026-05-25)

`scripts/measure-claude-mem-usage.sh` 스크립트를 1주간 실행합니다:

```bash
# 수동 실행 (필요 시)
bash scripts/measure-claude-mem-usage.sh

# 결과는 .claude/outputs/sessions/ 에 저장됩니다
```

측정 항목:
- 일별 호출 횟수 (claude-mem vs AgentMemory)
- 응답 지연 (p50, p95)
- 저장 성공/실패율
- 메모리 용량 (Chroma vs SQLite)

### 5-2. GO/NO-GO 결정 기준 (2026-05-25 예정)

| 지표 | GO 조건 | NO-GO 조건 |
|------|---------|------------|
| 응답 지연 | AgentMemory ≤ claude-mem × 1.2 | AgentMemory > claude-mem × 2.0 |
| 저장 성공률 | ≥ 99% | < 95% |
| 운영 안정성 | 1주 무장애 | 크래시 또는 데이터 손실 |
| 호환성 | 기존 메모리 포맷 읽기 가능 | 포맷 비호환으로 검색 실패 |

### 5-3. 지금 할 수 있는 것

- AgentMemory 설치 및 MCP 등록 (위 섹션 2 참조)
- 신규 세션에서 AgentMemory로도 저장해보기 (실험적)
- measure 스크립트 결과 관찰
- 자산 처리표 (`guides/agentmemory-migration/asset-disposition.md`) 검토 준비

---

## 6. Phase 2 진입 조건

다음 조건이 모두 충족된 경우에만 Phase 2 (SWITCH)로 진행합니다.

### 필수 조건

- [ ] 1주 measure 결과 GO 판정 (5-2 기준 충족)
- [ ] 자산 처리표 사용자 검토 완료 (12 plugin skill 처리 방향 결정)
- [ ] 30분 롤백 절차 검증 완료

### 롤백 절차 검증 (Phase 2 진입 전 필수)

```bash
# 1. Chroma 백업 생성
cp -r ~/.local/share/claude-mem/chroma ~/.local/share/claude-mem/chroma.bak.$(date +%Y%m%d)

# 2. 백업에서 복원 가능 여부 확인
# (실제 복원 수행하지 않고 절차만 검증)
ls -la ~/.local/share/claude-mem/chroma.bak.*

# 3. AgentMemory SQLite 백업
cp ~/.local/share/agentmemory/memories.db ~/.local/share/agentmemory/memories.db.bak.$(date +%Y%m%d)
```

롤백 소요 시간이 30분 이내임을 확인한 후 Phase 2 진행.

---

## 7. 현 단계 한계 및 금지 사항

### 7-1. STUB 상태 유지 (변경 금지)

```
packages/eval-core/src/adapters/agentmemory.ts  ← STUB, 활성화 금지
packages/eval-core/src/db/schema.ts              ← 변경 금지
```

이 파일들은 Phase 2 GO 결정 후 별도 사이클에서 수정합니다.

### 7-2. 자산 처리표 적용 보류

12 plugin skill의 폐기/유지 결정은 measure 결과를 확인한 후 진행합니다:

```
.claude/skills/memory-*/  ← 폐기 여부 보류
.claude/skills/claude-mem-*/  ← 폐기 여부 보류
```

### 7-3. 데이터 마이그레이션 금지

Phase 1에서는 claude-mem Chroma 데이터를 AgentMemory SQLite로 이전하지 않습니다.
이전은 Phase 2에서 사용자가 명시적으로 승인한 경우에만 진행합니다.

---

## 8. R011과의 관계

Phase 1 COEXIST 기간 중 R011 (SHOULD-memory-integration) 적용:

| R011 항목 | COEXIST 수정 사항 |
|-----------|-----------------|
| Primary: Native auto memory | 변경 없음 |
| Supplementary: claude-mem | 변경 없음 (계속 사용) |
| Session-End Self-Check | claude-mem + AgentMemory 둘 다 저장 시도 |
| Failure Policy | 둘 중 하나 실패해도 비차단 |

세션 종료 시 자가 점검 (COEXIST 확장):

```
1. sys-memory-keeper가 MEMORY.md 갱신? → YES
2. claude-mem 저장 시도? → YES (기존)
3. AgentMemory 저장 시도? → YES (COEXIST 추가)
모두 완료 후 사용자에게 확인
```

---

## 9. 참고

- **이슈**: #1169 (AgentMemory 마이그레이션 계획)
- **이전 단계**: [measure-step-zero.md](./measure-step-zero.md)
- **R011**: `.claude/rules/SHOULD-memory-integration.md` (Dual-Backend Advisory 섹션)
- **관련 기억**: [[project-sequencing-alpha-beta-gamma]]
- **자산 처리표**: `guides/agentmemory-migration/asset-disposition.md` (Phase 2 전 검토 필요)
- **measure 스크립트**: `scripts/measure-claude-mem-usage.sh`
- **롤백 가이드**: #1169 본문 조치 4 (30분 롤백 절차)

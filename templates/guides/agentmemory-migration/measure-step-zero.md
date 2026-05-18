# AgentMemory 마이그레이션 — 단계 0: MEASURE (사용 빈도 측정)

> **목적**: Phase 1 (COEXIST) 진입 전, claude-mem skill 실제 호출 빈도 데이터를 수집하여 가설 기반 자산 처리표를 검증한다.
> **관련 이슈**: #1169 본문 조치 5
> **참고 메모리**: `feedback_claude_mem_maintenance`, `project_sequencing_alpha_beta_gamma`

---

## 1. 목적

AgentMemory 마이그레이션 계획(`feedback_claude_mem_maintenance.md`)에는 12개 claude-mem skill의 처리 방향이 가설로 기재되어 있다. 특히 폐기 후보 5종(`make-plan`, `do`, `babysit`, `wowerpoint`, `knowledge-agent`, `pathfinder`)은 "미사용 또는 저빈도"라는 가정 위에 놓여 있다.

이 단계에서는 실측 데이터로 가설을 검증한다. 데이터 없이 Phase 1에 진입하면:
- 실제로 자주 쓰이던 skill을 폐기하여 사용자 워크플로우가 깨질 수 있다.
- 자산 처리표 재설계 비용이 Phase 2~3로 이월된다.

---

## 2. 실행 방법

```bash
# 기본 실행 (최근 7일, 리포트를 ~/.claude/measure-claude-mem-usage-YYYY-MM-DD.md 에 저장)
bash scripts/measure-claude-mem-usage.sh

# 최근 14일 스캔
bash scripts/measure-claude-mem-usage.sh --days 14

# 출력 경로 지정
bash scripts/measure-claude-mem-usage.sh --output ~/Documents/claude-mem-usage.md

# 헤더 없이 실행 (CI/파이프라인 삽입용)
bash scripts/measure-claude-mem-usage.sh --quiet
```

### 스캔 대상 경로

| 경로 | 설명 |
|------|------|
| `~/.claude-mem/archives/` | claude-mem MCP 아카이브 (`.jsonl`, `.json`) |
| `~/.claude/projects/*/session-*.jsonl` | Claude Code 세션 로그 |

둘 중 하나가 없어도 스크립트는 조용히 skip하고 나머지를 스캔한다.

---

## 3. 1주 수집 계획

| 시점 | 작업 |
|------|------|
| **Day 1** | 첫 측정 — 베이스라인 (`--days 7` 기준 기존 archives 기반) |
| **Day 4** | 중간 측정 — 추이 확인 (`--days 4`) |
| **Day 7** | 최종 측정 — 자산 처리표 재검토 및 Phase 1 GO/NO-GO 결정 |

세 시점 모두 `--output` 경로를 달리 지정하여 비교 가능한 파일로 보관한다:

```bash
bash scripts/measure-claude-mem-usage.sh --output ~/.claude/claude-mem-day1.md
bash scripts/measure-claude-mem-usage.sh --days 4 --output ~/.claude/claude-mem-day4.md
bash scripts/measure-claude-mem-usage.sh --days 7 --output ~/.claude/claude-mem-day7.md
```

---

## 4. 해석 기준

| 호출 수 | 신호 | 권장 조치 |
|---------|------|----------|
| **0** | 미사용 | 폐기 안전 — 1주 후 처리 결정 |
| **1-3** | 가끔 사용 | wrapper 또는 대체 도구 매핑 필요 |
| **4+** | 정기 사용 | 폐기 시 대체 도구 명확화 필수 |

폐기 후보 5종 기준 예상:
- `make-plan`, `do`, `babysit` → 0 예상 (native AgentMemory로 대체 완료)
- `wowerpoint`, `knowledge-agent`, `pathfinder` → 0~1 예상 (특수 목적 skill)

실측값이 예상과 다를 경우 자산 처리표를 수정한 후 Phase 1에 진입한다.

---

## 5. 결과 활용

### 5-1. #1169에 리포트 첨부

```bash
gh issue comment 1169 --body-file ~/.claude/claude-mem-day7.md
```

### 5-2. 자산 처리표 갱신

`.claude/agent-memory/sys-memory-keeper/feedback_claude_mem_maintenance.md` 내 "처리 방향" 열을 실측값 기반으로 업데이트한다.

### 5-3. Phase 1 GO/NO-GO 결정

| 조건 | 결정 |
|------|------|
| 폐기 후보 모두 호출 수 0 | GO — Phase 1 진입 |
| 폐기 후보 중 1개 이상 호출 수 1-3 | CONDITIONAL GO — 대체 도구 매핑 완료 후 진입 |
| 폐기 후보 중 1개 이상 호출 수 4+ | NO-GO — 처리표 재설계 후 재측정 |

---

## 6. 한계 및 주의사항

| 항목 | 설명 |
|------|------|
| archives 미존재 | `~/.claude-mem/archives/` 없으면 카운트 0 (정상 — silent skip) |
| 세션 로그 형식 변경 | Claude Code 업데이트로 `session-*.jsonl` 구조가 변경되면 grep 패턴 수정 필요 |
| claude-mem MCP telemetry 미사용 | 외부 도구 의존 최소화 원칙에 따라 MCP 자체 지표는 사용하지 않음 |
| grep 기반 측정 | 같은 파일에 skill 이름이 여러 줄 등장하면 복수 카운트됨 (과대 계산 가능성) |
| macOS/Linux 호환 | `stat` 옵션 차이를 스크립트 내에서 자동 처리 (`-f %m` vs `-c %Y`) |

---

## 7. 참고

- **이슈**: [#1169](../../.github/ — `gh issue view 1169`)
- **자산 처리표**: `.claude/agent-memory/sys-memory-keeper/feedback_claude_mem_maintenance.md`
- **시퀀싱 메모리**: `.claude/agent-memory/mgr-creator/project_sequencing_alpha_beta_gamma.md` (또는 해당 메모리 파일)
- **스크립트**: `scripts/measure-claude-mem-usage.sh`
- **Phase 1 가이드**: `guides/agentmemory-migration/` (이 디렉토리에 추가 예정)

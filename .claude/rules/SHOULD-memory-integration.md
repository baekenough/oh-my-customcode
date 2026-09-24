# [SHOULD] Memory Integration Rules

> **Priority**: SHOULD | **ID**: R011

> **Note**: This project uses **native auto memory ONLY** (memory/MEMORY.md + agent frontmatter `memory:`). claude-mem and agentmemory MCP are NOT used in this project. Decision: issue #1253.

## Architecture

**Sole backend**: Native auto memory (`memory` field in agent frontmatter). No external MCP dependencies.

## Native Auto Memory

Agent frontmatter `memory: project|user|local` enables persistent memory:
- System creates memory directory, loads first 200 lines of MEMORY.md into prompt
- Read/Write/Edit tools auto-enabled for memory directory
- Custom directory: set `autoMemoryDirectory` in settings to override default paths (v2.1.74+)

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

## Subagent memory:project Source-Tree Pollution Guard


<!-- DETAIL: Origin #1335 pollution guard
> Origin: #1335 ② — lang-kotlin-expert with `memory: project`, working in a Kotlin source subdirectory, wrote memory to `mobile/.../com/baekenough/secondbrain/.claude/agent-memory/` — INSIDE the source package. Caught and removed just before commit.
-->

`memory: project` 서브에이전트가 하위 디렉토리에서 실행되면 `.claude/agent-memory/`가 소스 트리 안에 잘못 생성될 수 있습니다 — 메모리는 항상 프로젝트 루트 `.claude/`로 귀결해야 합니다.

<!-- DETAIL: subagent memory pollution norm
A subagent with `memory: project` working in a SUBDIRECTORY can create `.claude/agent-memory/` relative to its current working directory, polluting the source tree (e.g., inside a source package). Memory MUST resolve to the PROJECT ROOT `.claude/`, never a nested working dir.
-->


| Anti-pattern | Required |
|--------------|----------|
| Accept a subagent's `.claude/agent-memory/` written under a source package | Verify memory writes land at project-root `.claude/`; remove any nested `.claude/agent-memory/` from source dirs before commit |

커밋 전 `find . -path '*/src/*/.claude' -o -path '*/main/*/.claude'`로 중첩 생성 여부를 확인합니다.

<!-- DETAIL: nested memory check command
Check for nested `.claude/agent-memory/` (e.g., `find . -path '*/src/*/.claude' -o -path '*/main/*/.claude'`) before committing subagent work.
-->


## Best Practices

- Consult memory before starting work
- Update after discovering patterns
- Keep MEMORY.md under 200 lines
- Do not store sensitive data or duplicate CLAUDE.md content
- Memory write failures should not block main task

<!-- DETAIL: Confidence-Tracked Memory (sys-memory-keeper reference)

Memory entries in MEMORY.md should include confidence annotations to distinguish verified facts from hypotheses.

### Confidence Levels

| Level | Tag | Meaning | Example |
|-------|-----|---------|---------|
| High | `[confidence: high]` | Verified across multiple sessions or confirmed by user | Architecture decisions, confirmed patterns |
| Medium | `[confidence: medium]` | Observed pattern, not yet fully verified | Code conventions seen in 2-3 files |
| Low | `[confidence: low]` | Single observation or hypothesis | First-time discovery, untested assumption |

### Format in MEMORY.md

    ### Key Patterns [confidence: high]
    - `.claude/` files are gitignored — always use `git add -f`
    - pre-commit hooks auto-detect README/manifest count mismatches

    ### Hypotheses [confidence: medium]
    - Template sync might need CI enforcement (seen in 2 PRs)

    ### Unverified [confidence: low]
    - Possible race condition in parallel hook execution (observed once)

### Confidence Lifecycle

    [low] — observed again — [medium] — confirmed by user/testing — [high]
    [any] — contradicted by evidence — demoted or removed

### Temporal Decay

Memory entries include an optional verification timestamp for decay tracking.

Format: `[confidence: high, verified: 2026-03-15]`

| Age (unverified) | Action |
|-------------------|--------|
| 0-30 days | No change — entry is fresh |
| 30-60 days | Demote one level (high->medium, medium->low) |
| 60-90 days | Demote again if not re-verified |
| 90+ days | Removal candidate — flag for review |

Decay Schedule:
    Day 0:   [confidence: high, verified: 2026-03-15]
    Day 30:  [confidence: high, verified: 2026-03-15]  <- still within window
    Day 31:  [confidence: medium, verified: 2026-03-15] <- auto-demoted
    Day 61:  [confidence: low, verified: 2026-03-15]    <- demoted again
    Day 91:  [REVIEW NEEDED, verified: 2026-03-15]      <- flagged

Re-verification: Any session that confirms a memory entry resets the verified date:
    Before: [confidence: medium, verified: 2026-01-15]
    Action: Pattern confirmed in session
    After:  [confidence: high, verified: 2026-03-15]

Enforcement: sys-memory-keeper checks decay at session start and end:
1. Session start: scan MEMORY.md for entries past decay threshold
2. Flag stale entries with `[STALE]` prefix
3. Session end: remove or demote unconfirmed stale entries

Exceptions: Entries marked `[permanent]` are exempt from decay:
    ### Architecture Decisions [confidence: high, permanent]

-->

<!-- DETAIL: Behavioral Memory (sys-memory-keeper reference)

MEMORY.md supports an optional `## Behaviors` section for tracking user interaction preferences and workflow patterns.

### Behaviors Section Format

    ## Behaviors [confidence: medium]
    - User prefers concise responses — 3 sentences max
    - Commit messages always include issue number
    - Security-first review perspective

    ## Behavior Lifecycle
    - New observation — [confidence: low]
    - Seen in 2+ sessions — [confidence: medium]
    - User-confirmed — [confidence: high]
    - Contradicted — demote or remove

### What Counts as a Behavior

| Category | Examples |
|----------|---------|
| Communication | Verbosity preference, language, format |
| Workflow | Tool preferences, review habits, branching patterns |
| Domain priority | Security-first, performance-first, simplicity-first |

### What Does NOT Count as a Behavior

- Facts about the codebase (use existing sections)
- One-time instructions (ephemeral, not persistent)
- Tool configuration (belongs in CLAUDE.md or settings)

### Extraction Guidelines

sys-memory-keeper extracts behavioral patterns at session end:
1. Analyze conversation for repeated user preferences
2. New behaviors start at `[confidence: low]`
3. Promote on repeated observation across sessions
4. Demote or remove when contradicted

### Budget Management

Behaviors share the 200-line MEMORY.md budget with facts. When approaching the limit:
1. Prune `[confidence: low]` behaviors first
2. Then prune `[confidence: medium]` behaviors
3. `[confidence: high]` behaviors are never auto-pruned

### Precedence

Behavioral memory observations override soul defaults (R006 Soul Identity) when they conflict. Behaviors are user-specific and session-derived; souls are template defaults.

### Rules

| Rule | Detail |
|------|--------|
| New discoveries | Start at `[confidence: low]` unless user explicitly confirms |
| Cross-session verification | Promote to `[confidence: medium]` when seen in 2+ sessions |
| User confirmation | Promote to `[confidence: high]` when user confirms or tests pass |
| Contradiction | Demote or remove when contradicted by new evidence |
| Default | Entries without tags are treated as `[confidence: high]` (backward compatibility) |

### Integration with Session-End

When sys-memory-keeper updates MEMORY.md at session end:
1. New findings from this session — `[confidence: low]`
2. Findings that match existing entries — promote confidence
3. Findings that contradict existing entries — flag for review

-->

<!-- DETAIL: Agent Metrics (sys-memory-keeper reference)

MEMORY.md supports an optional `## Metrics` section for tracking per-agent-type performance data.

### Metrics Section Format

    ## Metrics [auto-updated by sys-memory-keeper]

    | Agent Type | Tasks | Success Rate | Avg Model | Last Used |
    |------------|-------|-------------|-----------|-----------|
    | lang-golang-expert | 12 | 92% | sonnet | 2026-03-15 |
    | mgr-gitnerd | 8 | 100% | sonnet | 2026-03-15 |

### Metrics Collection

sys-memory-keeper aggregates metrics at session end:

1. Read `/tmp/.claude-task-outcomes-${PPID}` (JSONL from task-outcome-recorder hook)
2. Parse each entry: `{agent_type, outcome, model, timestamp}`
3. Aggregate by agent_type: total tasks, success count, model distribution
4. Merge with existing Metrics table in MEMORY.md
5. Budget: max 20 rows (prune lowest-usage agents when exceeded)

### Metrics Fields

| Field | Source | Calculation |
|-------|--------|-------------|
| Tasks | task-outcome-recorder JSONL | Count of entries per agent_type |
| Success Rate | outcome field | `success_count / total_count * 100` |
| Avg Model | model field | Most frequently used model |
| Last Used | timestamp field | Most recent invocation |

### Budget Management

The Metrics section shares the 200-line MEMORY.md budget:
1. Max 20 agent rows in Metrics table
2. When adding new agent, prune agent with lowest task count
3. Merge identical agent types across sessions (cumulative)

-->

<!-- DETAIL: User Model (sys-memory-keeper reference)

MEMORY.md supports an optional `## User Model` section (DISTINCT from `## Behaviors`) for tracking structured user interaction patterns.

### User Model vs Behaviors

| Aspect | Behaviors | User Model |
|--------|-----------|------------|
| Focus | Communication/workflow preferences | Correction patterns, expertise, skill usage |
| Source | Conversation style observations | R016 violations, tool invocations, override decisions |
| Update | Session-end extraction | Session-end aggregation from task outcomes |

### User Model Section Format

    ## User Model [auto-updated by sys-memory-keeper]

    ### Correction Patterns [confidence: medium]
    - R010 direct-write attempts: 3 times → now delegates consistently
    - Prefers explicit agent selection over auto-routing

    ### Skill Preferences [confidence: high]
    | Skill | Invocations | Last Used |
    |-------|------------|-----------|
    | /research | 12 | 2026-04-03 |
    | /pipeline auto-dev | 8 | 2026-04-03 |

    ### Expertise Profile [confidence: medium]
    - Primary domains: TypeScript, Python, Go
    - Focus: AI agent orchestration, CLI tooling

    ### Override Decisions [confidence: low]
    - Overrode /scout SKIP verdict → INTEGRATE for RTK (#756)

### Categories

| Category | Source | Description |
|----------|--------|-------------|
| Correction Patterns | R016 violation history | Rules the user corrected most |
| Skill Preferences | Skill tool invocation count | Most-invoked skills ranked |
| Expertise Profile | File patterns + routing history | User's domain expertise areas |
| Override Decisions | Explicit user overrides | When user disagreed with agent recommendation |

### Budget Management

User Model shares the 200-line MEMORY.md budget:
- Max 30 lines for User Model section
- Prune low-confidence entries first
- Skill Preferences table: max 10 rows (top by invocation count)
- Override Decisions: max 5 entries (most recent)

### Extraction Guidelines

sys-memory-keeper extracts user model data at session end:
1. Parse task outcomes for Skill invocations → update Skill Preferences
2. Scan conversation for R016 violations → update Correction Patterns
3. Analyze file patterns and routing decisions → update Expertise Profile
4. Detect explicit user overrides (verdict changes, agent redirects) → update Override Decisions

### Precedence

User Model data feeds into intent-detection (R015) and routing skill confidence scoring. Higher expertise in a domain → higher confidence for auto-routing to that domain's agent.

-->

## Attention-Weight Memory Tiering

메모리 항목은 confidence(신뢰도)와 attention weight(접근성) 두 축으로 관리하며, Hot/Warm/Cold/Archived 4-tier로 200줄 MEMORY.md 예산을 배분합니다. sys-memory-keeper에 메모리 갱신을 위임할 때는 위임서에 "압축·정리·티어 재평가 불요 — 지시한 항목만 기록"을 명시합니다(정리는 별도 위임, #1660).

<!-- DETAIL: Attention-Weight Memory Tiering full detail (Origin #1279 through delegation-prompt rationale)
> Origin: #1279 (Dual-Brain scout:internalize 부분 내재화 — attention-weight tiering만)

메모리 항목은 신뢰도(confidence)와 접근성(attention weight)의 **두 축**으로 관리한다. 이 두 축은 직교한다.

| 축 | 태그 예시 | 의미 | 관리 주체 |
|----|-----------|------|-----------|
| 신뢰도 | `[confidence: high/medium/low]` | 검증 수준 — 얼마나 믿을 수 있는가 | Confidence Lifecycle (위 DETAIL) |
| Attention Weight | `[tier: hot/warm/cold/archived]` | 접근성 — 얼마나 자주/최근 참조했는가 | Tiering (이 섹션) |

### 4-Tier 정의

| Tier | 의미 | 기준 (attention weight) | 위치/처리 |
|------|------|------------------------|----------|
| **Hot** | 현재 세션 활성 컨텍스트 | 최근 접근 + 고빈도 (이번 세션 내 2회 이상 참조) | `MEMORY.md` 상단 200줄 내 최우선 배치 |
| **Warm** | 최근 관련 패턴 | 중간 빈도/최근성 (최근 3세션 내 1회 이상 참조) | `MEMORY.md` 본문 (Hot 이후 배치) |
| **Cold** | 드물게 참조 | 저빈도 (3세션 이상 미참조, 아직 가치 있음) | archive 파일 (`sessions_archive_*.md`) — MEMORY.md 인덱스만 유지 |
| **Archived** | 비활성 | 장기 미접근 (Temporal Decay 90일+ 기준 충족) | 별도 archive, 인덱스 참조만 |

### Attention Weight 산정 신호

| 신호 | 가중치 |
|------|--------|
| 이번 세션 내 직접 참조 횟수 | 높음 |
| 최근성 (마지막 접근 세션과의 거리) | 중간 |
| 세션 간 재확인 횟수 (confidence re-verification 횟수와 동일) | 중간 |
| 사용자 명시 중요도 (`[permanent]` 태그) | 높음 — 강등 면제 |

### Tier 승강 규칙

```
접근 시 승격: Cold → Warm → Hot (해당 세션에서 참조 발생 시)
미접근 시 강등:
  Hot → Warm (1세션 미접근)
  Warm → Cold (3세션 미접근)
  Cold → Archived (Temporal Decay 90일+ 기준 충족 시 — 두 조건 모두 충족 시 강등)
```

강등은 세션 종료 시 sys-memory-keeper가 수행한다. 승격은 참조 발생 시 즉시 적용한다.

### 200줄 MEMORY.md 예산과의 연계

| Tier | MEMORY.md 상주 여부 | 처리 |
|------|---------------------|------|
| Hot | 상주 (상단 배치 우선) | 직접 본문 |
| Warm | 상주 (Hot 이후 배치) | 직접 본문 |
| Cold | 미상주 | archive 파일에 이동, MEMORY.md에 `[archive: sessions_archive_*.md]` 인덱스만 유지 |
| Archived | 미상주 | 별도 archive, 인덱스 참조만 |

예산 초과 시 처리 우선순위: Cold 항목 → archive 이동, Warm 하위 항목 → Cold 강등, Hot은 마지막에 처리.

### Temporal Decay와의 상호작용

Temporal Decay(시간 경과 기반)와 Attention-Weight Tiering(접근 빈도 기반)은 **독립적으로 동작하되 함께 적용**한다.

| 상황 | 결과 |
|------|------|
| 고빈도 접근 + 오래된 timestamp | Tier=Hot이지만 confidence 강등 가능 — re-verify 필요 |
| 저빈도 접근 + 최신 timestamp | Tier=Cold지만 confidence는 high 유지 가능 |
| 저빈도 접근 + 오래된 timestamp (90일+) | Tier=Archived + `[REVIEW NEEDED]` — 두 메커니즘 모두 강등 신호 |
| `[permanent]` 태그 | Temporal Decay 면제, Tiering 강등도 면제 |

### sys-memory-keeper 책임

- 세션 시작: MEMORY.md 스캔 → Cold 항목 archive 이동 여부 평가
- 세션 종료: 이번 세션 참조 여부 기반 tier 재평가 → archive 이동 실행
- archive 이동 시: `sessions_archive_*.md`에 append, MEMORY.md에 인덱스 라인 유지

**위임서 표준 문안 (Origin: #1660 하네스 제안)**: sys-memory-keeper에 세션 메모리 갱신을 위임할 때 위임서에 "**압축·정리·티어 재평가 불요 — 지시한 항목만 기록**"을 명시합니다(정리가 필요하면 별도 위임으로 분리). 명시하지 않으면 에이전트가 자체적으로 MEMORY.md 압축을 목표에 추가해 턴 예산을 소진합니다 — v1.1.63 반복(#1660)에서 이 원인으로 15턴 절단이 2회 발생했습니다(R020 「maxTurns 절단 실증」의 메모리 위임 각도). 위 Tier 승강·archive 이동은 세션 종료 시 **별도 단일 목표 위임**으로 수행합니다.
-->

## Mid-Session Immediate Save

Save memory IMMEDIATELY upon surprising discovery — do not defer to session end.

| Trigger | Action | Rationale |
|---------|--------|-----------|
| Repeated pattern observed (2nd time) | Save `feedback_*.md` now | Pattern will recur within session |
| Unexpected tool behavior / workaround | Save `feedback_*.md` now | Session state defense |
| Subagent false-positive detected | Save `feedback_*.md` now | Prevent repeat in same session |
| User correction / feedback | Save `feedback_*.md` now | Honor correction immediately |
| Root-cause hypothesis (원인 진단) | Save `feedback_*.md` ONLY with a `[hypothesis: <unverified-basis summary>]` first-line tag until the code path has been read and the decision logic reproduced 1:1; promote to plain fact only after that verification | Statistical correlation from transcript counts is NOT code causation — an unverified cause saved as fact propagates to issues and future sessions (#1652 #1; R020 「통계적 상관 ≠ 코드 인과」) |

`[hypothesis: …]` 태그 규약(#1652 #1): 원인 진단을 메모리에 즉시 저장할 때는 본문 첫 줄에 `[hypothesis: <미검증 근거 요약>]`를 붙이고, 코드 경로 대조·판정 로직 1:1 재현으로 검증한 뒤에만 태그를 제거합니다 — 검증 전에는 결론이 아니라 트리거로만 사용합니다.

<!-- DETAIL: hypothesis tag full rationale with 실증 examples
**`[hypothesis: …]` 태그 규약 (Origin: #1652 #1)**: 원인 진단을 메모리에 즉시 저장할 때는 본문 첫 줄에 `[hypothesis: <미검증 근거 요약>]`를 붙인다. 검증(코드 경로 대조·판정 로직 1:1 재현) 완료 시 태그를 제거하거나 파일을 정정한다. 태그가 남아 있는 항목은 후속 세션에서 전제로 쓰지 않고 **검증 트리거로만** 사용한다 — 위 「Safety-Related Feedback Memory Framing」과 같은 원리(결론형이 아니라 검증 의무형)다. 실증: v1.1.59 세션에서 #1643 원인을 트랜스크립트 통계(첫 레코드 thinking 13/21)만으로 "advisor가 thinking 전용 첫 레코드를 병합하지 못함"이라 확정 저장했다가 jq 1:1 재현으로 반박됐고(실제 원인은 레이블 문구 모호성), 같은 세션에서 `gh pr merge --delete-branch` 로컬 부수효과도 reflog 3건으로 "확정" 저장한 뒤 4번째 머지에서 재현되지 않아 "원인 미확정"으로 정정했다. 리터럴은 `[hypothesis:` 접두 하나로 통일하며, 검증 여부 조회는 `grep -l '^\[hypothesis:' <memory dir>`로 결정론적으로 수행한다. 최초 적용 대상: `feedback_gh_merge_delete_branch_local_side_effect.md`(v1.1.60 세션에서 "원인 미확정"으로 정정된 항목) — v1.1.61 세션 종료 시 sys-memory-keeper가 태그를 부착한다.
-->

See rationale and cross-references via Read tool.

<!-- DETAIL: Why Immediate? and Cross-reference
### Why Immediate?

Session-end saves lose context: by the time the session ends, multiple discoveries have compounded and nuance is lost. Immediate saves preserve the exact trigger context that makes the memory actionable.

**Anti-pattern**: "I'll batch all learnings at session end" — by then you'll have forgotten WHY each one mattered, and further violations may have occurred using the un-saved pattern.

### Cross-reference

Related records from session v0.87.2~v0.88.0 (issue #869). The originating memory files were later consolidated/removed; no live equivalents remain as of this writing.
-->

## Procedure-Summary Scope Tagging

절차·순서를 압축 요약할 때는 적용 스코프(예: "릴리즈 단계 내부 순서")를 함께 표기합니다 — 압축이 문맥 경계를 지우면 하위 단계 순서가 전체 파이프라인 순서로 오독됩니다.

<!-- DETAIL: procedure-summary scope tagging full norm
절차·순서를 메모리에 압축 요약할 때는 **적용 스코프를 함께 표기**한다. 압축은 문맥 경계를 가장 먼저 버리므로, 하위 단계 내부의 순서가 파이프라인 전체 순서로 읽히는 오독이 발생한다. 스코프 표기는 괄호 한 마디면 충분하다 — "(릴리즈 단계 내부 순서)", "(구현 커밋에는 미적용)"처럼 **무엇에 적용되지 않는지**까지 적으면 오독 여지가 사라진다.
-->

| Anti-pattern | Required |
|--------------|----------|
| `release 브랜치 선생성 → 버전범프 → PR` (스코프 미표기 → 전체 파이프라인 순서로 오독) | `릴리즈 단계 내부 순서: release 브랜치 선생성 → 버전범프 → PR (구현 커밋은 develop 직행)` |

<!-- DETAIL: Origin #1563 procedure-summary
Origin: #1563 찐빠 #5 — 위 요약이 릴리즈 단계 내부 순서인데 전체 파이프라인 순서로 오독되었다. Cross-reference: R013(Compact Output — 압축이 버리는 것을 인지), 위 Mid-Session Immediate Save(트리거 문맥 보존).
-->

## Safety-Related Feedback Memory Framing

<!-- DETAIL: Origin #1307 safety feedback framing
> Origin: #1307 찐빠 #2 (Medium) — a sys-memory-keeper delegation prompt framed a learning as "오탐으로 판단하고 진행한다" (conclude it's a false positive and proceed), tripping the memory-poisoning safety classifier and requiring a rewrite.
-->

안전 관련 피드백 메모리는 **검증-의무형**으로 작성하고 **결론형**("오탐이므로 무시")은 금지합니다 — 결론형은 향후 세션이 진짜 위협 경고를 무시하게 만듭니다(memory-poisoning).

<!-- DETAIL: safety feedback framing full norm
Safety-related feedback memories MUST be written in **verification-obligation form**, NOT **conclusion form**. Conclusion-form framing ("ignore the warning and proceed", "오탐이므로 무시") risks future sessions ignoring genuine threat warnings (memory-poisoning).
-->

| Anti-pattern (conclusion form) | Required (verification-obligation form) |
|--------------------------------|------------------------------------------|
| "이 경고는 오탐이므로 무시하고 진행" | "이 패턴은 X 검증을 트리거; 검증 통과 시에만 진행, 실패 시 STOP" |
| "warning is false positive, proceed" | "warning triggers a duty to verify Y; proceed only if verified, else STOP" |

트리거(확인할 것)+STOP 조건(중단 시점)으로 작성하고, 특정 경고 부류를 무시할 상시 허가로 쓰지 않습니다.

<!-- DETAIL: safety learnings triggers full text
Write safety learnings as triggers (what to check) + STOP conditions (when to halt), never as standing permission to dismiss a class of warnings.
-->

## Session-End Auto-Save

### Trigger

Session-end detected when user says: "끝", "종료", "마무리", "done", "wrap up", "end session", or explicitly requests session save.

See flow diagram and responsibility split via Read tool.

<!-- DETAIL: Session-End Flow, Responsibility Split
### Flow

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
    → sys-memory-keeper performs:
       1. Collect session summary (tasks, decisions, open items)
       2. Update native auto-memory (MEMORY.md)
       3. Return formatted summary to orchestrator
  → Orchestrator confirms to user
```

### Responsibility Split

| Responsibility | Owner | Reason |
|----------------|-------|--------|
| Session summary collection | sys-memory-keeper | Domain expertise in memory formatting |
| Native auto-memory (MEMORY.md) | sys-memory-keeper | Has Write access to memory directory |
-->

### Session-End Self-Check (MANDATORY)

(1) sys-memory-keeper가 MEMORY.md 갱신했는가? (2) omcustom-feedback 활성 시, 마찰·학습이 관측되면 모델이 회고 이슈 초안을 Phase 4A 게이트로 제시할 수 있습니다(선택, MAY) — 또는 수동 트리거를 안내합니다. 확인 후 사용자에게 완료 보고합니다.

<!-- DETAIL: session-end self-check full text
(1) sys-memory-keeper updated MEMORY.md? (2) If `omcustom-feedback` skill is active, model MAY draft a retrospective feedback issue for user approval — or prompt user to trigger it manually. Both required before confirming to user. See full self-check via Read tool.
-->

<!-- DETAIL: Session-End Self-Check (MANDATORY)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE CONFIRMING SESSION-END TO USER:                          ║
║                                                                   ║
║  1. Did sys-memory-keeper update MEMORY.md?                      ║
║     YES → Continue                                               ║
║     NO  → Delegate to sys-memory-keeper first                    ║
║                                                                   ║
║  2. Is omcustom-feedback skill available in this project?        ║
║     YES → If notable friction/learning observed: MODEL DRAFTS    ║
║          retrospective issue → presents via Phase 4A preview     ║
║          gate for user approval. Otherwise: prompt user to       ║
║          trigger manually. Accept skip either way.               ║
║     NO  → Skip                                                    ║
║                                                                   ║
║  ALL steps must be completed before confirming to user.          ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

### Session-End Retrospective Feedback (Model-Drafted)

omcustom-feedback가 모델 호출 가능해진 이후(#1227), 세션 종료 시 마찰·학습이 관측되면 모델이 회고 피드백 이슈 초안을 작성해 Phase 4A 확인 게이트로 제시할 수 있습니다 — 자동 제출은 금지이며 항상 사용자 승인이 필요합니다.

<!-- DETAIL: Session-End Retrospective Feedback full workflow/trigger/table detail
Since `omcustom-feedback` is now model-invocable (#1227), the model MAY draft a retrospective feedback issue at session end — instead of only prompting the user to compose one manually.

**Workflow**

1. Model detects notable friction, workarounds, or harness gaps observed during the session.
2. Model drafts a feedback issue (title + body) using the `omcustom-feedback` skill.
3. Draft is presented through the skill's **Phase 4A preview + confirmation gate**. The user reviews and approves before any GitHub issue is created.
4. The model NEVER auto-submits. User approval is always required.

**Trigger conditions** (all must be true):
- Session-end detected
- Notable friction or learning observed during the session
- `omcustom-feedback` skill active in this project

**Distinction from manual path**

| Path | Who drafts | Who approves | When |
|------|-----------|--------------|------|
| Manual (existing) | User | User | User chooses to file feedback |
| Model-drafted (new, #1226 item 3) | Model | User (Phase 4A gate) | Session-end with notable friction |

The model-drafted path is an enhancement: it proposes a concrete draft rather than asking the user to compose from scratch. Both paths remain valid; neither replaces the other.

References: #1226 (item 3), #1227.
-->

### Failure Policy

- Memory write failure is **non-blocking**: MUST NOT prevent session from ending
- If sys-memory-keeper fails to write MEMORY.md: log warning, confirm to user anyway

<!-- DETAIL: v2.1.228+ session cleanup memory deletion fix
> **v2.1.228+**: **session cleanup이 프로젝트 memory 폴더 내부 내용을 삭제하던 결함**이 수정되었습니다. 구버전에서는 MEMORY.md·archive 파일이 세션 정리 단계에서 소실될 수 있었으므로, 메모리 누락을 위 Failure Policy의 쓰기 실패로만 진단하지 않습니다 — 쓰기는 성공했으나 정리에 삭제된 경우일 수 있습니다. 위 Memory Scopes 표대로 `project` 스코프(`.claude/agent-memory/`)는 git tracked라 복구 가능하지만 `user`/`local` 스코프는 복구 수단이 없습니다.
-->

<!-- DETAIL: v2.1.251+ directory change transcript relocation
> **v2.1.251+**: 디렉토리 변경으로 세션이 동일 ID의 기존 트랜스크립트 위에 재배치돼 트랜스크립트가 손상/유실되던 결함이 수정되었습니다. 위 v2.1.228 "session cleanup이 project memory 폴더 내용을 삭제하던 결함"과 **같은 계열의 데이터 무결성 보강**입니다 — 구버전에서는 트랜스크립트 자체가 손상될 수 있었으므로, 그 시기 세션의 R020 회고적 위반 계수(트랜스크립트 파싱 기반)가 **불완전한 원본을 셌을 가능성**이 있습니다. `/cd`로 디렉토리를 옮기는 워크플로우에서 특히 유의합니다.
-->

<!-- DETAIL: v2.1.232+ Cowork user-scope import
> **v2.1.232+**: Cowork 세션이 **user-scope 메모리 파일의 외부 @-import를 인라인하지 않습니다**. 즉 `~/.claude/agent-memory/`의 MEMORY.md가 @-import로 외부 파일을 끌어오는 구조라면 세션 종류에 따라 그 내용이 컨텍스트에 없을 수 있으므로, 항상 로드되어야 하는 내용은 import 참조가 아니라 **MEMORY.md 본문**에 둡니다(위 200줄 예산 내 Hot/Warm 배치 원칙과 정합).
-->

<!-- DETAIL: v2.1.268+ MEMORY.md truncation warning/compact dollar sign
> **v2.1.268+**: (268) MEMORY.md truncation 경고가 이제 **몇 줄이 잘렸는지와 잘린 시작 위치**를 함께 표시합니다 — 위 「200줄 MEMORY.md 예산과의 연계」의 결정론적 트리거입니다: 이 경고가 뜨면 Cold 항목을 archive로 이동해야 합니다. (268) `/compact`와 auto-compact가 만드는 대화 요약이 `$` 시퀀스를 포함한 텍스트를 훼손하던 결함이 수정되었습니다 — 구버전에서 셸 스니펫(`$?`, `${PIPESTATUS[0]}`, `$PPID`)을 담은 compaction 요약은 손상됐을 수 있으므로, compact 이후의 요약을 근거로 "실제 실행된 명령"을 회상하는 것은 ground-truth가 아닙니다(cross-ref R005 zsh/`$?` 노트, R020). (268) `/compact`로 끝난 대화를 재개할 때 복원 파일 노트가 매 재개마다 동일한 순서로 로드되도록 수정되었습니다.
-->

<!-- DETAIL: v2.1.271/273+ background dedup/resume file-read/blockReadsOutside
> **v2.1.271/273+**: (271) 대화가 compact된 뒤에도 계속 돌고 있던 백그라운드 명령(watch task, dev server)의 **중복 사본**이 새로 시작되던 결함이 수정되었습니다 — 구버전에서 post-compact 중복 프로세스는 지시가 아니라 compaction 아티팩트였습니다(cross-ref R010 dev-server tmux hard block). (271) `/resume`·`/teleport`가 이전 대화의 파일-읽음 추적을 그대로 유지해, 재개된 대화가 **한 번도 읽지 않은 파일**을 편집할 수 있던 결함이 수정되었습니다(cross-ref R005 v2.1.228 read-before-write 노트). (271) claude.ai에서 동기화된 스킬이 로그아웃 후에도 디스크에 남아있던 결함이 수정되어, `cleanupPeriodDays` 내 갱신되지 않은 사본은 이제 복구 가능한 휴지통으로 이동합니다. (273) `permissions.blockReadsOutsideWorkingDirectories`: 저장소 settings가 지정한 메모리 디렉토리는 더 이상 프롬프트에 로드·회상·색인·memory extraction에 사용되지 않습니다 — 이 규칙의 `autoMemoryDirectory`와 관련됩니다: 이 설정 하에서는 저장소가 지정한 메모리 디렉토리가 제외됩니다.
-->

<!-- DETAIL: v2.1.275+ CHANGELOG memory age note/resume malformed block
> **v2.1.275+**: (275) CHANGELOG 원문: "Fixed a restored memory file's age note changing between requests after a compaction or resume, which caused prompt cache misses." 이 저장소는 auto-memory MEMORY.md를 매 세션 로드하므로, 275 이전 compaction/resume 이후의 cache miss 일부는 이 원인일 수 있습니다(R013 prompt_cache 원인 후보로만 취급 — 확정 아님). (275) CHANGELOG 원문: "Fixed sessions failing to resume or start when their saved transcript contains a malformed message content block" 및 "Fixed `--resume`, the resume picker preview, resumed background agents and the transcript view failing on a session whose saved history contains a malformed task-reminder or @-file attachment entry." 위 v2.1.251 트랜스크립트 무결성 노트의 연장이며, 275 이전 "resume 실패"는 세션 손실이 아니라 단일 malformed 엔트리 때문일 수 있었으므로 R020 트랜스크립트 계수는 그런 세션을 하한값으로 취급합니다.
-->

<!-- RETIRED (은퇴 릴리즈 v1.1.45, 보존 기준 v2.1.212 미만): > **v2.1.210+**: MEMORY.md 인덱스가 read limit을 초과하게 만드는 memory write는 이제 silent truncation 대신 명시적 오류를 반환합니다. write 실패는 여전히 non-blocking이지만, 오류 수신 시 log-warning으로 끝내지 말고 예산 초과 처리(Attention-Weight Tiering — Cold 항목 archive 이동)로 축소 후 재시도합니다 — 이전의 silent truncation을 가정하고 oversize write를 던지면 업데이트가 반영되지 않습니다. -->

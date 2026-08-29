# [SHOULD] Ecomode Rules

> **Priority**: SHOULD | **ID**: R013

## Activation

Auto-activates when: 4+ parallel tasks, batch operations, 80%+ context usage, or explicit "ecomode on".

## Behaviors

**Compact Output**: Agents return `status + summary (1-2 sentences) + key_data only`. Skip intermediate steps, verbose explanations, repeated context, full file contents.

**Aggregation Format**:
```
[Batch Complete] {n}/{total}
├── {agent}: ✓/✗/⚠ {summary}
```

**Compression**: File lists -> count only (unless < 5), error traces -> first/last 3 lines, code -> path:line ref only.

## Config

```yaml
ecomode:
  threshold: 4
  result_format: summary
  max_result_length: 200
```

## Example

Normal: Full agent header + step-by-step analysis + detailed results.
Ecomode: `[lang-golang-expert] ✓ src/main.go reviewed: 1 naming issue (handle_error -> handleError)`

## Override

Disable with: "ecomode off", "verbose mode", or "show full details".

## Pruning Transparency

When ecomode is active, report what was compressed so users can audit context decisions:

```
[Pruned] {n} chunks, ~{tokens} tokens saved | Retained: {m} | Summarized: {k} | Dropped: {j}
```

| When | Report |
|------|--------|
| After input context pruning | `[Pruned]` line in agent output |
| After output compression | `[Compressed]` line in batch summary |
| On request ("what was pruned?") | Full pruning ledger with chunk names |

Pruning transparency is advisory — it adds ~1 line per pruning event. Disable with "ecomode off" or "hide pruning".

## Input Context Pruning — Active removal of irrelevant content. See full spec via Read tool.

<!-- DETAIL: Input Context Pruning

Active removal of irrelevant retrieved content from agent context. Complements output compression by managing the input side of token budget.

> **Terminology**: "Input Context Pruning" (R013) manages retrieved chunks during a task. "Memory Pruning" (R011) manages behavioral memory across sessions. These are distinct concepts.

### Pruning Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Search overflow | Retrieved chunks > 10 | Retain top-K by relevance, prune rest |
| Context pressure | Context usage > 50% | Summarize oldest/lowest-relevance chunks |
| Multi-hop intermediate | Between retrieval hops | Replace previous hop raw results with summary |

### Pruning Strategy

| Strategy | When | Behavior |
|----------|------|----------|
| **Retain** | Directly relevant code/docs | Keep as-is |
| **Summarize** | Background context, prior hop results | Replace with 1-2 line summary |
| **Drop** | Search noise, duplicates, already-reflected info | Remove entirely |

### Rules

- Pruning is irreversible — generate summary BEFORE dropping original
- Prune at document/chunk level, not mid-sentence
- When in doubt, Summarize rather than Drop
- Track pruning decisions: `[Pruned] {N} chunks → {M} retained, {K} summarized, {J} dropped`
-->

## Context Budget Management — Task-type-aware thresholds (research 40%, implementation 50%, review 60%, management 70%, general 80%). See full spec via Read tool.

> **v2.1.238+**: 장시간 대화형 세션에서 subagent tool 결과가 최근 표시 윈도우를 벗어나면 이제 메모리에서 해제되는 unbounded memory growth 결함이 수정되었습니다. 구버전 장기 세션(`/fsd` 등 자율 루프 포함)에서는 subagent tool 결과가 무한 누적되어 컨텍스트/메모리 예산 관리가 왜곡될 수 있었습니다 — 위 Context Budget Management의 task-type 임계값 계산이 이 결함으로 인해 부정확했을 가능성을 회고적으로 시사합니다.

> **v2.1.223+**: `CLAUDE_CODE_DISABLE_1M_CONTEXT`가 native 1M 창을 가진 **모든** Claude 모델을 auto-compaction으로 200K에 유지하도록 확대되었고(이전에는 고정 모델 목록), 미인식 model ID도 가정 컨텍스트 창 내로 유지됩니다(`CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`로 복원). 위 임계값은 **창 대비 백분율**이므로 절대 토큰량은 이 env 설정에 따라 5배까지 달라집니다 — 1M 전제로 예산을 잡기 전 env 설정 여부를 확인합니다(cross-ref R006).

> **v2.1.251+**: Sonnet 5의 기본 auto-compact 창이 **전체 1M 컨텍스트로 변경**되어, 1M 창 세션이 이제 ~934K가 아니라 ~967K 토큰에서 auto-compact됩니다. 위 `CLAUDE_CODE_DISABLE_1M_CONTEXT` 노트와 **직접 상호작용**합니다 — 그 env가 **설정된 환경**에서는 여전히 200K로 강제 유지되지만, **비활성 환경**(기본값)에서는 이번 변경으로 실효 auto-compact 임계값 자체가 상향됩니다. 이 저장소 에이전트 다수가 `claude-sonnet-5`이므로, 위 임계값 표의 백분율 계산은 env 설정 여부에 더해 이 CC 버전 여부까지 함께 확인해야 절대 토큰량이 정확합니다.

<!-- DETAIL: Context Budget Management

Task-type-aware context thresholds that trigger ecomode earlier for context-heavy operations.

### Task Type Thresholds

| Task Type | Context Trigger | Rationale |
|-----------|----------------|-----------|
| Research (/research, multi-team) | 40% | High context consumption from parallel team results |
| Implementation (code generation) | 50% | Moderate context for code + test output |
| Review (code review, audit) | 60% | Moderate context for diff analysis |
| Management (git, deploy, CI) | 70% | Lower context needs |
| General (default) | 80% | Standard threshold |

### Detection

Task type is inferred from active context:
- **Research**: `/research` skill active, 4+ parallel agents
- **Implementation**: Write/Edit tools dominant, code files targeted
- **Review**: Read/Grep dominant, review/audit skill active
- **Management**: git/gh commands, CI/CD operations
- **General**: No specific pattern detected

### Budget Advisor Hook

The `context-budget-advisor.sh` hook monitors context usage and emits warnings when task-specific thresholds are approached:

```
[Context Budget] Task: research | Threshold: 40% | Current: 38%
[Context Budget] ⚠ Approaching budget limit — consider /compact or ecomode
```

### Integration

- Works with existing ecomode activation (R013)
- Does NOT override explicit user settings
- Advisory only — never blocks operations
- Context percentage from statusline data when available
-->

## Deep Insight Context Handoff Pattern — 에이전트 간 핸드오프 시 context window 한계를 극복하는 패턴. per-agent budget 할당 + artifact channel 전달. See full spec via Read tool.

<!-- DETAIL: Deep Insight Context Handoff Pattern

에이전트 간 핸드오프 시 context window 한계를 극복하기 위한 패턴. 기존 task-type threshold에 **per-agent budget** 차원을 추가합니다.

### Per-Agent Budget

| 상황 | 권장 할당 |
|------|----------|
| 오케스트레이터 (메인 대화) | 총 컨텍스트 40-50% |
| 전문가 서브에이전트 | 총 컨텍스트 20-30% per instance |
| 리서치 에이전트 (Explore) | 총 컨텍스트 10-20% per instance |

task-type threshold와 곱연산 — 예: research 40% × 전문가 30% = 실질 12% 할당.

### Handoff Protocol

1. **Inline transfer 금지** — 에이전트 간 결과 전달 시 본문을 직접 다음 에이전트 프롬프트에 포함하지 않음
2. **Artifact channel 사용** — 결과를 `.claude/outputs/sessions/{date}/{skill}-{HH}.md`에 저장, 다음 에이전트에는 경로만 전달 (R006 Artifact Channel Protocol)
3. **result-aggregation 스킬** — N개 에이전트 결과를 단일 요약으로 압축 후 후속 에이전트에 전달

### 참조

- R006 `MUST-agent-design.md` Artifact Channel Protocol (R013과 쌍으로 작동)
- `result-aggregation` 스킬 — channel 읽기 패턴
- `ecomode` + `cc-token-saver` Token Guardian 공존 (기존 섹션)
-->

## Token Guardian Coexistence — R013 context budget (usage-based) + cc-token-saver Token Guardian (time-based) can run simultaneously.

<!-- DETAIL: Token Guardian Coexistence (cc-token-saver)

| Component | Trigger | Scope |
|-----------|---------|-------|
| `context-budget-advisor.sh` (R013) | Context usage % approaching threshold | In-session budget |
| Token Guardian (cc-token-saver) | 1h cache TTL idle detection | Cross-session cost |

Both can run simultaneously — different triggers, complementary coverage. R013's context budget is usage-based (approaching limit), Token Guardian is time-based (idle cache expiry).
-->

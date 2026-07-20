# [MUST] Parallel Execution Rules

> **Priority**: MUST | **ID**: R009

## Core Rule

**2+ independent tasks should execute in parallel.** Sequential execution of parallelizable tasks does not follow this rule.

## Detection Criteria

Independent (MUST parallelize):
- No shared mutable state between tasks
- No sequential dependencies
- Each completes independently

Examples: creating multiple agents, reviewing multiple files, batch operations on different resources.

### File-Disjoint ≠ Independent (Local Git State)

로컬 git 상태를 변경하는 작업(`checkout` / `pull` / `branch` 생성·삭제·rename / `commit` / `stash` / `merge` / `rebase`)은 편집 대상 파일이 disjoint하더라도 **워킹트리·브랜치 포인터·인덱스·HEAD**라는 프로세스 수준 단일 공유 가변 상태를 경합하므로 **직렬화**한다. 실무 규칙: **동시 실행하는 git 상태변경 에이전트는 1개**. git 단계를 먼저 직렬로 끝낸 뒤 나머지를 병렬화한다. read-only 조회(`git status`/`log`/`diff`, `gh` 조회)는 병렬 가능 — 제한 대상은 상태 변경뿐이다.

| Anti-pattern | Required |
|--------------|----------|
| 편집 파일이 disjoint하다는 이유로 git 상태변경 에이전트 2개 이상을 병렬 스폰 | git 상태변경은 동시 1개로 직렬화; 완료 후 나머지 작업 병렬화 |

Origin: #1518 (찐빠 #1 — git 에이전트 2개 근접 실행으로 작업 브랜치 stale; 편집 파일은 disjoint였음).

## Agent Teams Gate (R018)

> Before spawning 2+ parallel agents, evaluate Agent Teams eligibility.
> Skipping this check does not follow R009 and R018.
>
> **See R018 (MUST-agent-teams.md) for the complete self-check and decision matrix.**
>
> Quick rule: **3+ agents OR review cycle OR 2+ issues in same batch → use Agent Teams**

## Self-Check

Before writing/editing multiple files:
1. Are files independent? → YES: spawn parallel agents
2. Using Write/Edit sequentially for 2+ files? → parallelize instead
3. Specialized agent available? → Use it (not general-purpose)
4. Agent Teams available? → **Check R018 criteria before spawning 2+ agents; for a 3+ agent batch, announce the gate result (Agent Tool fallback reason or Agent Teams choice) — see R018 Self-Check "Gate Transparency"**
5. Running agent stalled (2x+ duration)? → Spawn independent follow-up tasks immediately
6. Announced a parallel dispatch in prose? → **발화 직전 카운트 대조**: announce 산문이 명시한 도구 개수 N == 이 메시지에 실제 포함된 tool_use 블록 개수. 불일치면 보완한 뒤 발화 (announce-execution consistency)
   - 누락 방향은 무작위다 — verify Bash가 빠지기도(v1.1.22/23), action delegate가 빠지기도(v1.1.27 세션) 했다. 방향별 서술 강화는 3회 재발로 실패가 실증됐으므로, 유일한 실효 방어선은 N↔N 카운트 대조다. Origin: #1512, #1503.

### Common Violations to Avoid

```
❌ WRONG: Write(file1.kt) → Write(file2.kt) → ... (sequential)
✓ CORRECT: Agent(agent1→file1.kt) + Agent(agent2→file2.kt) + ... (same message, parallel)

❌ WRONG: Single agent receives massive multi-domain prompt (>5000 tokens, e.g., M2 plan with 12 tasks across 7 areas)
   → Latency timeout, user cancellation, context waste, no review loop
✓ CORRECT: Pre-decompose by domain, spawn parallel agents per area (R009) or use Agent Teams (R018)

❌ WRONG: Announce N개 병렬 도구(예: verify Bash + action delegate)를 예고했으나 메시지에 tool_use가 N-1개만 포함 — 누락 방향은 무작위(Bash가 빠지기도, delegate가 빠지기도)
✓ CORRECT: 발화 직전 announce의 N과 tool_use 블록 개수를 대조해 일치시킨 뒤 같은 메시지로 발화
```

> **Token threshold heuristic**: When a delegated agent prompt exceeds ~5000 tokens or spans 3+ unrelated domains, decompose by domain and spawn parallel agents. See R018 for Agent Teams criteria when review cycles are needed. Reference: #1085.

### LLM Batch Output Token Budget

The giant-prompt heuristic above governs INPUT tokens. The symmetric OUTPUT-side rule: when a single LLM call processes N items (scoring/classifying/extracting) and must emit structured output (e.g. JSON) per item, pre-compute the output budget = N × per-item output tokens BEFORE the call. Exceeding `max_tokens` truncates the response mid-structure → silent parse failure (the call "succeeds" but JSON.parse throws).

| Anti-pattern | Required |
|--------------|----------|
| Single batch call over a variable-size list with a fixed small max_tokens | Chunk into ≤40-item batches; constrain per-item output length (e.g. reason ≤10 words); raise max_tokens to fit one chunk |
| Raising max_tokens alone | Insufficient — defers the failure as the list grows. Chunking is the invariant fix. |

Reference: #1320 (fix), #1321 (session 113 retrospective 찐빠 #1), `feedback_llm_batch_truncation.md`.

<!-- DETAIL: Full violation examples (4 pairs)
❌ WRONG: Writing files one by one
   Write(file1.kt) → Write(file2.kt) → Write(file3.kt) → Write(file4.kt)
✓ CORRECT: Spawn parallel agents — all in single message

❌ WRONG: Project scaffolding sequentially
   Write(package.json) → Write(tsconfig.json) → Write(src/index.ts) → ...
✓ CORRECT: Agent(agent1→"Create package.json, tsconfig.json") + Agent(agent2→"Create src/cli.ts, src/index.ts") parallel

❌ WRONG: Secretary writes domain/, usecase/, infrastructure/ sequentially
✓ CORRECT: Agent(lang-kotlin-expert→domain) + Agent(be-springboot-expert→infrastructure) + Agent(lang-kotlin-expert→usecase)

❌ WRONG: Agent(dev-lead → "coordinate lang-kotlin-expert and be-springboot-expert") — creates SEQUENTIAL bottleneck
✓ CORRECT: Agent(lang-kotlin-expert→usecase commands) + Agent(lang-kotlin-expert→usecase queries) + Agent(be-springboot-expert→persistence) + Agent(be-springboot-expert→security) — all spawned together
-->

> **Agent Teams partial spawn** → See R018 (MUST-agent-teams.md) "Spawn Completeness Check".

<!--
> **v2.1.161+**: Parallel tool calls in a single batch are now independent — a failed Bash command no longer cancels the other calls in the same batch; each tool returns its own result. This strengthens R009 batching: one failing call in a parallel dispatch no longer aborts its siblings, so independent work bundled in the same message completes regardless of a single failure. Lowers the safety cost of the announce-execution consistency self-check (#6).

> **v2.1.202+**: `/config`에 "Dynamic workflow size" 설정이 추가되었습니다(small/medium/large agent 수 — advisory 가이드, 강제 cap 아님) — Workflow tool의 agent 수 규모 조정에 관련. R009 병렬 규모 판단의 플랫폼 신호. R018 Agent Teams 규모 판단과도 관련(cross-ref).
-->


## Execution Rules

| Rule | Detail |
|------|--------|
| Max instances | 5 concurrent (soft default: 4) |
| Not parallelizable | Orchestrator (must stay singleton) |
| Instance independence | Isolated context, no shared state |
| Large tasks (>3 min) | MUST split into parallel sub-tasks |

> **Fable 5 long-lived subagent reuse (Origin: #1435)**: Fable 5는 long-lived subagent 재사용(단일 subagent가 여러 단계를 이어서 수행)에 강함 — 현행 R009 병렬 실행 원칙과 상충하지 않으며, Fable 5 실행 시 short-lived 병렬 다수 대신 long-lived 재사용도 유효한 선택지. 상세는 `guides/claude-code/16-fable5-prompting.md`.

## Adaptive Parallel Splitting

Runtime detection and splitting of stalled parallel agents. Complements pre-execution parallelization.

See detection signals, splitting rules, and example via Read tool.

<!-- DETAIL: Adaptive Parallel Splitting — Detection, Splitting Rules, Example
### Detection

| Signal | Threshold | Action |
|--------|-----------|--------|
| Duration imbalance | Agent takes 2x+ longer than completed peers | Evaluate independent follow-up tasks |
| Task granularity | Agent assigned 10+ files | Consider layer-based splitting (domain → adapter → handler) |
| Pipeline bottleneck | One agent blocking subsequent phases | Spawn dependency-free next tasks immediately |

### Splitting Rules

1. **Dependency analysis first**: Only spawn tasks with NO dependency on the stalled agent
2. **Don't cancel the stalled agent**: Let it continue — spawn new agents for independent work
3. **Respect max instances**: New spawns still obey the 5 hard cap
4. **Report the split**: `[Split] Stalled: {agent} | Spawned: {new-agents} | Reason: {signal}`

### Example

```
Before (sequential bottleneck):
  P3 ████████████████████░░░░░░░░░░░░  (stalled, 10+ files)
  P4                                    (waiting — no P3 dependency)
  P5                                    (waiting — no P3 dependency)

After (adaptive split):
  P3 ████████████████████████████████  (continuing)
  P4 ████████████████████████████████  (spawned immediately)
  P5 ████████████████████████████████  (spawned immediately)
```
-->

## Stability Testing Protocol

Soft default: 4 concurrent agents; hard cap: 5. Reduce to 4 if latency >2x, failure rate >10%, or context errors. See full protocol via Read tool.

<!-- DETAIL: Stability Testing Protocol
When testing 5 concurrent agents (above the soft default of 4):

| Observation | Threshold | Action |
|-------------|-----------|--------|
| Response latency | > 2x normal | Reduce to 4 |
| Agent failure rate | > 10% | Reduce to 4 |
| Context errors | Any | Reduce to 4 |

5-agent concurrency is supported but should be monitored during initial adoption. Fall back to 4 if instability is observed.
-->

## Agent Tool Requirements

- Use specific `subagent_type` (not "general-purpose" when specialist exists)
- Use `model` parameter for cost optimization (haiku for search, sonnet for code, opus for reasoning)
- Each independent unit = separate Agent tool call in the SAME message

## Display Format

```
[1] mgr-creator:sonnet → Create Go agent
[2] lang-python-expert:sonnet → Review Python code
[3] Explore:haiku → Search codebase
```

Must use `[N] {subagent_type}:{model}` format. `[N]` is 1-indexed and MUST match the `description` parameter prefix of the Agent tool call for Running display correlation.

Single agent spawns do NOT use the `[N]` prefix.

## Narrative Announcement Format (Before Spawn)

Use markdown list format (not inline comma-separated) for parallel dispatch announcements. See correct/incorrect examples via Read tool.

<!-- DETAIL: Narrative Announcement Format (Before Spawn)
When announcing a parallel dispatch in prose text (not the Agent tool call itself), use a markdown list rather than inline comma-separated description:

### Correct

```
병렬 실행:
- [1] {agent-a}: {task-a}
- [2] {agent-b}: {task-b}
```

### Incorrect

```
병렬 실행: [1] {agent-a}가 {task-a}, [2] {agent-b}가 {task-b}.
```

The list form mirrors the tool-call `[N]` prefix pattern and scales better to 3+ concurrent agents.
-->

## Result Aggregation

```
[Summary] {succeeded}/{total} tasks completed
  ✓ agent-1: success
  ✗ agent-2: failed (reason)
```

## Parallel Feature Integration Gate

> Origin: #1335 ③ — parallel lang-kotlin-expert rounds each reported "build green", but the COMBINED runtime had a DataStore singleton crash, a Settings→Dashboard nav crash, a recording 400, and cursor pre-advance bugs — caught only by on-device testing.

Per-subagent "build green" does NOT guarantee integrated runtime correctness. When parallel feature subagents edit interdependent code, the orchestrator MUST run an INTEGRATION verification gate after the parallel work merges — a combined build PLUS a runtime/smoke check (or device test for apps) — before declaring the feature done. Independent green builds can still combine into runtime crashes (shared singletons, navigation, API contracts).

| Anti-pattern | Required |
|--------------|----------|
| Trust each parallel subagent's "build green" and declare done | Orchestrator runs a combined build + runtime/smoke gate on the merged result first |

Cross-reference: R020 (actual outcome ≠ attempt; completion verification).

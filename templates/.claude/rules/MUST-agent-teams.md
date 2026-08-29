# [MUST] Agent Teams Rules (Conditional)

> **Priority**: MUST | **ID**: R018
> **Condition**: Agent Teams enabled — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **AND** `TeamCreate` present in the tool list (see Detection)
> **Fallback**: When disabled, R009/R010 apply

## Detection

Agent Teams is active only when the **team-creation path actually exists** — `TeamCreate` present in the tool list. The environment variable alone is NOT sufficient: it expresses intent to enable the feature, not the feature's availability.

| Observed state | Teams active? |
|----------------|---------------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **and** `TeamCreate` present | Yes |
| env var set, `TeamCreate` **absent** | **No** — a team cannot be created, so no member can be spawned |
| `SendMessage` present, `TeamCreate` absent | **No** — peer/cross-session messaging is a separate capability (see Scope below), not evidence of Teams |

Rationale: since v2.1.233, `TeamCreate`/`TeamDelete` are absent from the tool list in this runtime (measured — R002 "Todo/Task 도구 기본 제거"), so a set env var cannot make teams creatable. Detection therefore rests on the tools actually being present, not on the env var alone — "the tool exists" is itself a claim requiring measurement (R020).

When Detection resolves to **No**, this entire rule is dormant and R009/R010 govern.

## Decision Matrix

| Scenario | Preferred | Reason |
|----------|-----------|--------|
| Simple independent subtasks | Agent Tool | Lower cost, no coordination overhead |
| Sequential-dependency init/scaffolding | Agent Tool | Blocked agents waste tokens polling; single agent faster |
| Multi-step with shared state | **Agent Teams** | Shared task list, peer messaging |
| Research requiring discussion | **Agent Teams** | Iterative discovery, synthesis |
| Cost-sensitive batch ops | Agent Tool | Minimal token overhead |
| Complex debugging across modules | **Agent Teams** | Cross-module state sharing |
| Code review + fix cycle | **Agent Teams** | Review → fix → re-review loop |
| Single file operations | Agent Tool | Overkill for simple tasks |
| Dynamic agent creation + usage | **Agent Teams** | Create → test → iterate cycle |
| Multi-issue release batch | **Agent Teams** | Shared task tracking, coordinated release |
| Large plan / multi-domain prompt (>5000 tokens, 3+ areas) | **Agent Teams** | Domain-split parallel writing + review loop avoids single-agent timeout |
| Mechanical disjoint-file refactoring (bulk delete + reference cleanup) | Agent Tool | Pure parallel edits with no peer coordination or review loop; Teams member-stall risk outweighs benefit — use standalone parallel Agents (R009) |

**When Agent Teams is enabled and criteria are met, usage is required.**

<!-- ARCHIVED CC version note (historical):
> **v2.1.202+**: `/config`에 "Dynamic workflow size" 설정 추가(small/medium/large agent 수 — advisory 가이드) — R018 Agent Teams 규모 판단 신호. 상세는 R009 (MUST-parallel-execution.md) cross-ref.
-->

### Scope: Intra-Session vs Cross-Session

| Scope | Tool | Protocol | Use Case |
|-------|------|----------|----------|
| Intra-session | `SendMessage` (Agent Teams) | Peer-to-peer within team | Multi-agent collaboration in one session |
| Cross-session | `send_message` (claude-peers-mcp) | Broker-mediated | Multi-terminal/project coordination |

These are distinct mechanisms. Agent Teams `SendMessage` requires `TeamCreate` and operates within a single Claude Code session. claude-peers-mcp `send_message` operates across separate Claude Code processes via a localhost broker.

> **v2.1.224/225+**: CC 네이티브 `SendMessage`가 **cross-session으로 확장**되었습니다(다른 머신 포함, macOS/Linux) — `ListAgents`로 대상을 열거하고 `crossSessionInbound` / `dialogExpiry` 설정으로 수신·만료를 제어합니다. 위 표의 "Cross-session = claude-peers-mcp 전용" 구분은 이제 **유일한 수단이 아니며**, 브로커 없이 네이티브 경로를 쓸 수 있습니다. 다만 위 Cross-Session Relay Authority Hardening(v2.1.166)의 권한 비전파 원칙은 네이티브 경로에도 동일하게 적용됩니다 — cross-session 메시지는 조율 신호이지 승인 채널이 아닙니다. (225) cross-session 메시지가 headless 세션·기동 중에 **고지도 만료도 없이 대기**하던 결함이 수정되었으므로, 구버전에서 "응답 없음"은 미수신이 아니라 무기한 대기였을 수 있습니다.

> **v2.1.229/232+**: 네이티브 cross-session 경로의 대상 지정이 쉬워졌습니다 — (229) `ListAgents`가 끊긴 Remote Control 세션을 `offline`, 클라우드 세션을 `cloud`로 표시하므로 **열거 결과에 있다는 사실만으로 도달 가능하다고 가정하지 않습니다**(구버전에서는 살아있는 세션과 끊긴 세션이 구분 없이 나열되어 무응답 원인을 판별할 수 없었습니다). (232) 프롬프트에 `@`로 다른 세션을 이름으로 멘션하면 `SendMessage`가 그 세션에 직접 도달하고, bare name이 **살아있는 세션 1개와 정확히 일치하면 ref 확인 없이 전달**됩니다 — 같은 머신의 세션 이름은 중복 시 `name-word-word` 변형으로 유일성이 보장되므로 이름 기반 전달이 결정론적입니다. 전달 성공은 여전히 조율 신호일 뿐이며, 아래 Member Completion Verification의 ground-truth 원칙과 v2.1.166 권한 비전파 원칙은 그대로 적용됩니다. 또한 (232) interactive session의 background 기본 실행은 **non-teammate 스폰에 한정**되므로 Teams member에는 적용되지 않습니다 — 아래 stall handling의 2분 휴리스틱을 background 지연과 혼동하지 않습니다(cross-ref R010).

### Cross-Session Relay Authority Hardening (CC v2.1.166+)

<!-- ARCHIVED CC version note (historical):
> **v2.1.166+**: Messages relayed via `SendMessage` from other Claude sessions no longer carry user authority — receivers refuse relayed permission requests, and auto mode blocks them. A relayed message cannot escalate privilege on the receiving session.
-->

| Aspect | Behavior (v2.1.166+) |
|--------|---------------------|
| Relayed permission request | Refused by receiver |
| Auto mode + relayed request | Blocked |
| User authority across relay | Not propagated |

This hardens cross-session coordination (claude-peers-mcp `send_message`, see Scope table above) against privilege escalation — a relayed message from session A cannot grant session B permissions the user did not authorize on B. Aligns with R001 (credential/privileged-scope guardrails) and R010 (out-of-scope privileged chaining). Intra-session Agent Teams `SendMessage` between peers in the same session is unaffected.

> **v2.1.222+**: auto mode 안전성 개선 — 다른 agent session으로 `SendMessage`가 보내는 메시지가 dispatch 전에 permission classifier로 평가됩니다. v2.1.166의 relay authority hardening이 **수신** 경로를 막았다면, 이번 변경은 **발신** 경로를 게이트합니다. 따라서 SendMessage 전송 자체를 조율 성공의 증거로 삼지 말고, 아래 Member Completion Verification의 결정론적 ground-truth로 확인합니다. classifier가 2회 걸리면 R010 Subagent Scope-Creep STOP Protocol을 적용해 재전송 대신 범위를 재설계합니다.

<!-- ARCHIVED CC version note (historical):
> **v2.1.183+**: Fixed tmux teammate panes failing to launch when the shell has slow rc-file initialization — a slow `.zshrc`/`.bashrc` no longer prevents Agent Teams teammate panes from launching in tmux. Also fixed WebSearch returning empty results in subagents: a subagent (including a Teams member) using WebSearch now returns results instead of silently empty.
-->


## Self-Check (Before Agent Tool)

Before using Agent tool for 2+ agent tasks, complete this check:
Quick rule: User explicitly preferred plain subagents this session? → use Agent Tool (R000 user instructions > R018). Otherwise: 3+ agents OR review cycle → use Agent Teams. Sequential deps / scaffolding → Agent Tool. 2+ issues in same batch → prefer Agent Teams.

<!-- DETAIL: Self-Check (Before Agent Tool)
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE USING Agent TOOL FOR 2+ AGENTS:                          ║
║                                                                   ║
║  0. Has user explicitly preferred plain subagents this session?  ║
║     YES → Use Agent tool (R000 user instructions > R018)         ║
║     NO  → Continue to #1                                          ║
║                                                                   ║
║  1. Is Agent Teams available?                                    ║
║     YES → check criteria #2-#5                                  ║
║     NO  → Proceed with Agent tool                               ║
║                                                                   ║
║  2. Will 3+ agents be involved?                                  ║
║     YES → use Agent Teams                                        ║
║     NO  → Check #3                                               ║
║                                                                   ║
║  3. Is there a review → fix → re-review cycle?                  ║
║     YES → use Agent Teams                                        ║
║     NO  → Check #4                                               ║
║                                                                   ║
║  4. Are 2+ issues being fixed in the same release batch?        ║
║     YES → prefer Agent Teams (coordination benefit)              ║
║     NO  → Check #5                                               ║
║                                                                   ║
║  5. Are tasks sequentially dependent (init/scaffold)?            ║
║     YES → prefer Agent Tool (single agent, no coordination)     ║
║     NO  → Continue with Agent Teams                              ║
║                                                                   ║
║  Simple rule: 3+ agents OR review cycle → use Agent Teams        ║
║  Sequential deps / scaffolding → Agent Tool (single agent)       ║
║  2+ issues in same batch → prefer Agent Teams                    ║
║  Everything else → Agent tool                                    ║
╚══════════════════════════════════════════════════════════════════╝
-->

### Gate Transparency

When the gate resolves to **Agent Tool** for a 3+ agent dispatch (e.g. mechanical disjoint-file editing with no review loop), announce the gate result in one line BEFORE spawning — e.g. `R018 게이트: 3개 disjoint-file 도메인, 리뷰 사이클 없음 → Agent Tool 폴백`. Silently selecting Agent Tool on a 3+ agent batch loses the gate-evaluation audit trail and reads as if the R018/R009 Self-Check #4 gate was skipped.

| Anti-pattern | Required |
|--------------|----------|
| 3+ 에이전트 병렬 스폰 announce에 게이트 평가 결과 누락 | 스폰 전 한 줄로 게이트 결과 명시 (Agent Tool 폴백 사유 또는 Agent Teams 선택 사유) |

Origin: #1293 (Session 110 retrospective, Low).

#### Gate Transparency Scope — Agent Teams Enabled Only (#1341 ②)

> Origin: #1341 찐빠 #2 (low-confidence) — 4+ 병렬 Agent Tool 스폰 시 `[N]` prefix는 표기했으나 "R018 게이트: … → Agent Tool 폴백" announce를 생략한 것을 자가 위반으로 의심. 그러나 R018은 조건부 규칙이라 Agent Teams 비활성 환경에서는 게이트 투명성 자체가 미적용이다.

R018 전체(게이트 투명성 포함)는 Agent Teams 활성 시에만 적용되는 조건부 규칙이다 — 활성 조건은 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` **AND** `TeamCreate` 도구 존재이며, `SendMessage` 단독 존재는 활성 근거가 아니다(상세는 위 `## Detection`). Agent Teams **비활성** 환경에서는:

- 게이트 투명성 announce 의무가 없다 — R009 `[N]` prefix 만으로 충분하다.
- 3+ 병렬 Agent Tool 스폰을 "게이트 announce 누락"으로 자가 플래그하지 않는다 (false-positive 방지).

게이트 투명성 announce는 Agent Teams가 활성이고 게이트가 Agent Tool로 해소될 때만 의무다.

| Anti-pattern | Required |
|--------------|----------|
| Agent Teams 비활성 환경에서 게이트 announce 누락을 자가 위반으로 플래그 | 비활성 시 R009 `[N]` prefix 만으로 충분; 게이트 announce는 활성 환경 전용 |

### Spawn Completeness Check

All members must be spawned in a single message. Partial spawning needs correction per R018 and R009.

<!-- DETAIL: Self-Check (Spawn Completeness)
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE SPAWNING TEAM MEMBERS:                                   ║
║                                                                   ║
║  1. How many members does this team need?  N = ___               ║
║  2. Am I spawning ALL N members in THIS message?                 ║
║     YES → Good. Continue.                                        ║
║     NO  → Spawn all N members in this message before proceeding. ║
║                                                                   ║
║  Partial spawn (e.g., 1/3) = needs correction                    ║
║  Sequential spawn (one per message) = needs correction           ║
║  All at once in single message = correct                         ║
╚══════════════════════════════════════════════════════════════════╝
-->

<!-- DETAIL: External Skill Conflict Resolution
When an external skill instructs using Agent tool but R018 criteria are met:

| Skill says | R018 requires | Resolution |
|------------|--------------|------------|
| "Use Agent tool for N tasks" | 3+ agents → Teams | Use Agent Teams, follow skill logic |
| "Sequential agent spawning" | Independent tasks → parallel | Parallelize per R009 |
| "Skip coordination" | Shared state → Teams | Use Teams for coordination |

Rule: External skills define the WORKFLOW. R018 defines the EXECUTION METHOD.
The skill's steps are followed, but agent spawning uses Teams when criteria are met.
-->

## Common Violations

```
❌ WRONG: 3+ tasks using Agent tool instead of Agent Teams
   Agent(Explore):haiku → Analysis 1
   Agent(Explore):haiku → Analysis 2
   Agent(Explore):haiku → Analysis 3

✓ CORRECT: TeamCreate → spawn researchers → coordinate via shared task list
   TeamCreate("research-team") + Agent(researcher-1/2/3) + SendMessage(coordinate)
```

```
❌ WRONG: Single agent receives 9000-token M2 plan covering metrics + DSL + risk gate + UI
   Agent(arch-documenter, prompt: <huge multi-domain plan>)
   → Timeout, cancellation, no decomposition opportunity

✓ CORRECT: TeamCreate("plan-team") + parallel domain leads + reviewer
   TeamCreate("plan-team") + Agent(metrics-lead) + Agent(dsl-lead) + Agent(risk-lead) + Agent(reviewer) + SendMessage(coordinate)
```

<!-- DETAIL: Common Violations (full examples)
❌ WRONG: Agent Teams enabled, 3+ research tasks using Agent tool
   Agent(Explore):haiku → Analysis 1
   Agent(Explore):haiku → Analysis 2
   Agent(Explore):haiku → Analysis 3

✓ CORRECT: TeamCreate → spawn researchers → coordinate via shared task list
   TeamCreate("research-team")
   Agent(researcher-1) → Analysis 1  ┐
   Agent(researcher-2) → Analysis 2  ├─ Spawned as team members
   Agent(researcher-3) → Analysis 3  ┘
   SendMessage(coordinate)

❌ WRONG: Code review + fix as independent Agents
   Agent(reviewer) → "Review code"
   (receive result)
   Agent(implementer) → "Fix issues"
   (receive result)
   Agent(reviewer) → "Re-review"

✓ CORRECT: Agent Teams for review-fix cycle
   TeamCreate("review-fix")
   Agent(reviewer) + Agent(implementer) → team members
   reviewer → SendMessage(implementer, "issues found")
   implementer → fixes → SendMessage(reviewer, "fixed")
   reviewer → re-reviews → done

❌ WRONG: Spawning team members one at a time
   TeamCreate("research-team")
   Message 1: Agent(researcher-1) → Analysis 1   (only 1/3 spawned)
   Message 2: Agent(researcher-2) → Analysis 2   (late spawn)
   Message 3: Agent(researcher-3) → Analysis 3   (late spawn)

✓ CORRECT: All members in a single message
   TeamCreate("research-team")
   Single message:
     Agent(researcher-1) → Analysis 1  ┐
     Agent(researcher-2) → Analysis 2  ├─ ALL spawned together
     Agent(researcher-3) → Analysis 3  ┘

❌ WRONG: Completed member modifies other member's files
   svelte-projects completes task → browses TaskList → edits agent-teams-advisor.sh (hook-fixer's scope)

✓ CORRECT: Completed member reports and waits
   svelte-projects completes task → SendMessage("Task complete") → waits silently
-->

## Cost Guidelines

| Criteria | Agent Tool | Agent Teams |
|----------|-----------|-------------|
| Agent count | 1-2 | 3+ |
| Inter-task dependency | None | Present |
| Iteration cycles | None | Present (review→fix→re-review) |
| Estimated duration | < 3 min | > 3 min |
| Shared state needed | No | Yes |

## Team Patterns

Standard: Research (researcher-1 + researcher-2 + synthesizer), Development (implementer + reviewer + tester), Debug (investigator-1 + investigator-2 + fixer).
Hybrid: Review+Fix, Create+Validate, Multi-Expert, Dynamic Creation.

<!-- DETAIL: Team Patterns
### Standard Patterns
- Research: researcher-1 + researcher-2 + synthesizer
- Development: implementer + reviewer + tester
- Debug: investigator-1 + investigator-2 + fixer

### Hybrid Patterns
- Review+Fix: reviewer + implementer (reviewer finds issues → implementer fixes → reviewer re-checks)
- Create+Validate: mgr-creator + qa-engineer (create agent → validate → iterate)
- Multi-Expert: expert-1 + expert-2 + coordinator (cross-domain tasks requiring multiple specialties)

### Dynamic Patterns
- Dynamic Creation: mgr-creator + domain-expert (create new agent → immediately use for pending task)

### Dynamic Agent Creation in Teams
When Agent Teams creates a new agent via mgr-creator:
1. Team lead identifies missing expertise
2. Spawns mgr-creator as team member
3. mgr-creator creates agent with auto-discovered skills
4. New agent joins team immediately
5. Team continues with expanded capabilities
-->

## Blocked Agent Behavior

When a team member is blocked: prefer Deferred spawn (no wasted tokens) > Silent wait (short waits) > Reassign (blocked >2 min).
Post-completion: report via SendMessage, wait silently. Do NOT browse TaskList or modify files outside scope.

<!-- DETAIL: Blocked Agent Behavior
| Strategy | When | Benefit |
|----------|------|---------|
| Deferred spawn | Dependency chain is clear | No wasted tokens; spawn after blocker completes |
| Silent wait | Agent already spawned, short wait expected | Minimal overhead |
| Reassign | Agent blocked >2 min with no progress | Reuse agent for unblocked work |

### Prompt Guidelines for Team Members
When spawning agents that may be blocked:
1. Include explicit instruction: "If your task is blocked, wait silently. Do NOT send periodic status messages."
2. Set check interval: "Check TaskList once per minute, not continuously."
3. Prefer deferred spawn when the dependency resolution time is unpredictable.
4. Post-completion instruction: "After completing your task, report via SendMessage and wait. Do NOT explore or modify files outside your scope."
5. Explicit scope boundary: "Your scope is limited to: {file list or directory}. Do NOT modify files outside this scope."

### Anti-Pattern: Idle Polling
❌ WRONG: Blocked agent sends repeated status messages
   docker-dev: "Task #1 still pending..."  (×5 messages, wasting tokens)

✓ CORRECT: Deferred spawn after dependency resolves
   (Task #1 completes) → then spawn docker-dev for Task #3

✓ ALSO CORRECT: Silent wait with infrequent checks
   docker-dev spawned with: "Wait silently if blocked. Check TaskList once per minute."

### Post-Completion Scope Constraint
| Behavior | Correct | Wrong |
|----------|---------|-------|
| Task completed | Report completion via SendMessage, wait silently | Browse TaskList for other work |
| No more tasks | Exit or wait for team shutdown | Explore/modify files outside original scope |
| See unfinished work | Report to team lead, do NOT self-assign | Edit files that belong to other members |

### Self-Check (After Task Completion)
╔══════════════════════════════════════════════════════════════════╗
║  AFTER COMPLETING YOUR ASSIGNED TASK:                            ║
║                                                                   ║
║  1. Did I complete ONLY my assigned task?                        ║
║     YES → Report completion                                      ║
║     NO  → Revert scope-violation changes                         ║
║                                                                   ║
║  2. Are there files modified outside my task scope?              ║
║     YES → This is a violation — revert                           ║
║     NO  → Good                                                    ║
║                                                                   ║
║  3. Am I about to explore/modify files for "other tasks"?        ║
║     YES → STOP. Report to team lead instead                      ║
║     NO  → Good. Wait silently or exit                            ║
╚══════════════════════════════════════════════════════════════════╝
-->

## Lifecycle

`TeamCreate → TaskCreate → Agent(spawn members) → SendMessage → TaskUpdate → ... → TeamDelete`. See full lifecycle via Read tool.

<!-- DETAIL: Lifecycle diagram
```
TeamCreate → TaskCreate → Agent(spawn members) → SendMessage(coordinate)
  → TaskUpdate(progress) → ... → shutdown members → TeamDelete
```
-->

## Fallback

When Agent Teams unavailable: use Agent tool with R009/R010 rules.
When Agent Teams available: actively prefer it for qualifying tasks.

## Cost Awareness

Agent Teams actively preferred for qualifying collaborative tasks. Use Agent tool only when:
- 1-2 agents with no inter-dependency
- No review → fix cycles
- Simple independent subtasks

Do NOT avoid Agent Teams solely for cost reasons when criteria are met.

**Active preference rule**: When Agent Teams is available, default to using it for any multi-step or multi-issue work. Only fall back to Agent tool for truly simple, single-issue tasks with no verification needs.

## Member TaskUpdate Discipline

Agent Teams 멤버는 long-running 작업 중 진행 상태를 TaskUpdate 로 명시적으로 알려야 한다. 침묵은 코디네이터가 죽었거나 멤버가 막혔다고 오인하게 만든다.

> **도구 가용성 선확인 (v2.1.233+)**: `TaskCreate/Get/Update/List`는 현행 모델(Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 이상)에서 기본 제거되어 이 저장소 실행 환경에 **존재하지 않는다** — 실측은 R002 「Todo/Task 도구 기본 제거」. 아래 표는 Task 도구가 가용할 때(구모델 또는 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`)의 규정이며, **부재 시 아래 대체 규약을 따른다**. 없는 도구의 호출을 의무로 남겨두면 실행 불가능한 규정이 된다.

| 시점 | 호출 |
|------|------|
| 작업 시작 | TaskUpdate(taskId, status: "in_progress") |
| 의미 있는 진행 (≥30s 분기/체크포인트) | TaskUpdate(taskId, description 업데이트 또는 메타데이터) |
| 완료 | TaskUpdate(taskId, status: "completed") |
| 차단 시 | TaskUpdate(taskId, description: 차단 사유) — 그 후 SendMessage |

### Common Violations

- 30초 이상 작업하면서 in_progress 미설정 → 다른 멤버가 task 를 claim 시도해 충돌
- 완료 후 status 미갱신 → 후속 작업이 영원히 blocked
- 차단 사유를 SendMessage 로만 보내고 task description 업데이트 누락 → TaskList 만 보는 멤버는 사유를 모름

Reference issue: #1087.

### Task 도구 부재 시 대체 규약 (Origin: #1582)

| 시점 | 대체 수단 |
|------|-----------|
| 시작 / 완료 / 차단 | `SendMessage` 1줄 보고 (`summary`에 상태 단어 포함) |
| 장문 진행 보고 | 아티팩트 파일 경로만 전달 (R006 Artifact Channel Protocol) — SendMessage 본문은 v2.1.222+ 조용히 절단된다 |
| 코디네이터의 완료 판정 | SendMessage 보고가 아니라 **결정론적 ground-truth** (아래 Member Completion Verification) |

`TaskList` 부재로 **공유 작업 목록이라는 조율 기반 자체가 사라지므로**, 아래 Member Completion Verification의 "보고는 신호일 뿐, 판정은 실측"이 보조 원칙이 아니라 **유일한 방어선**이 된다.

## Member Completion Verification (deterministic ground-truth)

Agent Teams member completion MUST be verified by deterministic ground-truth — NOT by SendMessage reports or TaskList status alone. Members may edit files without updating task status (task stays `pending`) or go idle without executing at all.

**Verification sources (in order of reliability):**

| Source | Reliability | Examples |
|--------|-------------|---------|
| `git status` / `git diff` | High — ground truth | Check that expected files changed |
| `grep` / file existence | High — deterministic | Verify expected content written |
| Validation scripts | High — deterministic | `validate-docs`, linters, test runs |
| TaskList status | Low — member may not update | Use as a signal only |
| SendMessage report | Low — member may stall before sending | Use as a signal only |

Cross-reference: R020 ("actual outcome ≠ attempt" — verifying that a command ran is not the same as verifying it succeeded).

> **v2.1.224+**: `SendMessage`가 **teammate inbox 쓰기에 실패해도 "Message sent"로 보고**하던 결함이 수정되어, 이제 실패가 오류로 보고됩니다. 위 표의 "SendMessage report = Low reliability"가 **전송 자체에도** 해당했다는 실증입니다 — 구버전에서는 "Message sent"가 수신은커녕 기록 성공조차 보장하지 않았습니다. 수정 후에도 전송 성공은 **수신자가 작업을 수행했다는 증거가 아니므로**, 위 표의 결정론적 ground-truth 확인은 그대로 유지합니다.

> **v2.1.222+**: `SendMessage`가 긴 summary를 문자 수 제한으로 거부하던 동작이 **절단(truncate)**으로 변경되어 전송이 실패하지 않습니다. 전송 실패가 사라진 대신 **조용한 절단**이라는 새 실패 모드가 생겼으므로, 위 표의 "SendMessage report = Low reliability" 원칙이 오히려 강화됩니다. 긴 보고가 필요하면 SendMessage 본문 대신 아티팩트 파일 경로 전달(R006 Artifact Channel Protocol)로 대체합니다.

> **★★ v2.1.246+**: `maxTurns` 한도에 도달해 멈춘 서브에이전트의 결과가 이제 **partial로 표시**되고 `SendMessage`로 이어가라는 힌트가 붙습니다 — **이전에는 완료된 것처럼 보였습니다.**
>
> **확정된 것 (v1.1.50 세션 실측)**: `maxTurns` 절단은 R020 「Verification-Delegation Non-Termination」이 누적 14회로 기록한 "서브에이전트가 판정 없이 turn을 종료" 증상의 **실재하는 원인 중 하나**다 — 더 이상 가설이 아니다. v1.1.50 릴리즈 세션에서 오케스트레이터가 4개 그룹을 병렬 위임했고, 그중 **3개 그룹이 20턴 `maxTurns` 한도로 절단**되어 통지에 `stopped at its 20-turn limit (partial result)`이 명시됐다:
> - 한 건은 문장 중간에서 절단(진행도 불명 — 실측 필요).
> - 다른 한 건은 "Templates 미러를 동기화합니다" 직후 절단 — 오케스트레이터는 이 문구로 **미실행**을 추정했으나, 재개 후 실측 결과 작업은 **이미 완료돼 있었다**. 절단 위치(마지막 출력 문장)로부터 진행도를 추론하는 것 자체가 불가능함을 재확인한 사례다 — R020 「증상만으로 결과를 넘겨짚지 않는다」의 세 방향 중 "(c) 실제가 보고보다 앞섬"의 재현.
> - 세 번째 건은 "Now R020 — three items. Let's find suitable locations."라는 **다음 작업 예고 직후** 절단 — 착수 여부조차 미실측 상태로 끊겼다.
>
> **v2.1.246 이전이었다면 이 partial 표시가 없어 세 건 모두 완료 보고로 읽혔을 것이다.**
>
> **확정되지 않은 것**: R020이 기록한 과거 14회 각각이 이 원인이었는지는 미검증이다 — 사례별 귀속은 turn 수·소요 시간을 `maxTurns` 한도와 대조하는 별도 검증이 필요하다.
>
> **행동 함의**: 이 원인은 R020의 clause 강화("판정 없이 종료하지 말라")가 14회 내내 실패했던 이유를 설명한다 — **절단 주체가 에이전트의 판단이 아니라 플랫폼의 turn 한도이면, 에이전트를 향한 지시는 애초에 닿지 않는다.** 대칭적으로 R020 「위임 경계를 Phase 개수로 설계」(단일 목표로 분할)가 효과적이었던 이유도 설명된다 — 작업이 작으면 `maxTurns` 안에서 자연히 끝나기 때문이지, 에이전트가 더 순종적이어서가 아니다.
>
> **낮추지 말 것**: 원인이 확정됐다고 해서 위 표의 결정론적 ground-truth 검증 원칙을 낮추지 않는다 — 절단이 아닌 원인(위임 경계 미분할, 에이전트 자체 판단 종료)도 계속 존재한다. 또한 **partial 표시는 v2.1.246 이상에서만 나타나므로**, 그 이전 버전에서 관측된 mid-step 종료 사례를 재해석할 때는 이 신호 자체가 부재했다는 것을 전제로 한다 — "partial 표시가 없었다"가 "maxTurns 절단이 아니었다"의 증거는 아니다.

> **v2.1.251+**: Agent Teams 팀원의 최종 답변이 팀 리드에 도달하지 못하던 결함이 수정되어, 이제 idle notification에 실려 도착합니다(이전에는 내용 없는 "available" 알림만 떴습니다). 위 v2.1.224 "SendMessage teammate inbox 쓰기 실패 시에도 Message sent로 보고" 수정의 **후속 실증**입니다 — 구버전에서는 팀원이 정상 완료해도 리드가 그 답변을 못 받을 수 있었으므로, "결정론적 ground-truth로 확인"이라는 위 표의 원칙이 이 시점 이전 세션에서는 특히 중요했습니다.

> **v2.1.234+**: `/config`의 "Default teammate model" 설정이 **제거**되어, agent-team teammate는 이제 spawn이 모델을 지정하지 않는 한 **leader의 모델**을 사용합니다. 이전에는 teammate 모델을 전역 설정값으로 지정할 수 있었으므로, 과거 세션의 "teammate가 어떤 모델로 실행됐는지" 서술은 이 변경 이전 버전 기준일 수 있습니다.

<!-- ARCHIVED CC version note (historical):
> **CC v2.1.162+**: `claude agents --json` now includes a `waitingFor` field showing what a waiting session is blocked on (e.g. a permission prompt). Use it as an additional deterministic ground-truth signal — a member with a non-empty `waitingFor` is blocked on input (needs unblocking), NOT silently stalled (reassign per stall handling below). This distinguishes the two failure modes the verification is meant to separate.

> **CC v2.1.169+**: `claude agents --json` now includes blocked and just-dispatched background sessions (previously omitted), adds `--all` to include completed sessions, and adds `id` and `state` fields. This strengthens the deterministic ground-truth for member completion verification — `state` distinguishes blocked/running/completed directly, and `--all` confirms a member actually completed (rather than just disappearing from the active list). Use `--all` + `state` as the ground-truth signal instead of inferring completion from a member's absence.

> **v2.1.198+**: Agent Teams에서 teammate가 API 오류로 죽으면 이제 lead에 "failed"를 보고하고, stuck teammate에게 메시지를 보내면 즉시 wake시켜 retry하게 합니다. 이는 v2.1.169 `state` 필드 기반 deterministic ground-truth를 보강하지만, SendMessage report 자체는 여전히 low-reliability 신호로 취급한다(위 표의 원칙 불변).

> **v2.1.199+**: subagent가 rate limit/server error로 잘리면 partial work를 parent에 반환하며, subagent가 API 오류(usage limit reached 등)를 성공 결과로 오보하던 문제가 수정되어 이제 오류를 parent agent에 정확히 보고합니다. 플랫폼이 false-success 자가보고를 줄였으나, deterministic ground-truth(`git status`/`grep`/validation scripts) 검증 원칙은 여전히 유효하다.
-->

**Stall handling**: When a member shows no task progress within ~2 minutes despite spawn + owner assignment + SendMessage coordination, reassign the work to a standalone Agent (R009) rather than continuing to nudge the stalled member. Stalled Teams members waste tokens on idle polling and delay the overall workflow.

Observed instance: v0.159.0 release (session 105) — members assigned to disjoint-file cleanup tasks went idle without executing; deterministic git-diff check exposed the gap; work was reassigned to standalone parallel Agents. References: #1261, #1262.

<!-- ARCHIVED CC version note (historical):
> **v2.1.186+**: Added the `teammateMode: "iterm2"` setting (warns when auto mode cannot find the `it2` CLI), and added status filtering (press `f`) to the `/workflows` agent detail view. Relevant to Agent Teams teammate launch configuration (cf. v2.1.183 tmux teammate-pane fix).
-->


## Member Prompt Size Cap

Keep per-member delegation prompts under ~5000 tokens and within a single domain. Oversized or multi-domain prompts risk malformed-parsing truncation in the CC platform (see R009 giant-prompt heuristic and `feedback_agent_malformed_parsing.md`). Large multi-file delegations should be decomposed and split across multiple members or standalone Agents.

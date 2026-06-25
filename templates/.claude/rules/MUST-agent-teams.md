# [MUST] Agent Teams Rules (Conditional)

> **Priority**: MUST | **ID**: R018
> **Condition**: Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
> **Fallback**: When disabled, R009/R010 apply

## Detection

Available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` or TeamCreate/SendMessage tools present.

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

### Scope: Intra-Session vs Cross-Session

| Scope | Tool | Protocol | Use Case |
|-------|------|----------|----------|
| Intra-session | `SendMessage` (Agent Teams) | Peer-to-peer within team | Multi-agent collaboration in one session |
| Cross-session | `send_message` (claude-peers-mcp) | Broker-mediated | Multi-terminal/project coordination |

These are distinct mechanisms. Agent Teams `SendMessage` requires `TeamCreate` and operates within a single Claude Code session. claude-peers-mcp `send_message` operates across separate Claude Code processes via a localhost broker.

### Cross-Session Relay Authority Hardening (CC v2.1.166+)

> **v2.1.166+**: Messages relayed via `SendMessage` from other Claude sessions no longer carry user authority — receivers refuse relayed permission requests, and auto mode blocks them. A relayed message cannot escalate privilege on the receiving session.

| Aspect | Behavior (v2.1.166+) |
|--------|---------------------|
| Relayed permission request | Refused by receiver |
| Auto mode + relayed request | Blocked |
| User authority across relay | Not propagated |

This hardens cross-session coordination (claude-peers-mcp `send_message`, see Scope table above) against privilege escalation — a relayed message from session A cannot grant session B permissions the user did not authorize on B. Aligns with R001 (credential/privileged-scope guardrails) and R010 (out-of-scope privileged chaining). Intra-session Agent Teams `SendMessage` between peers in the same session is unaffected.

> **v2.1.183+**: Fixed tmux teammate panes failing to launch when the shell has slow rc-file initialization — a slow `.zshrc`/`.bashrc` no longer prevents Agent Teams teammate panes from launching in tmux. Also fixed WebSearch returning empty results in subagents: a subagent (including a Teams member) using WebSearch now returns results instead of silently empty.

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

R018 전체(게이트 투명성 포함)는 Agent Teams 활성 시에만 적용되는 조건부 규칙이다 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 또는 TeamCreate/SendMessage 도구 존재). Agent Teams **비활성** 환경에서는:

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

> **CC v2.1.162+**: `claude agents --json` now includes a `waitingFor` field showing what a waiting session is blocked on (e.g. a permission prompt). Use it as an additional deterministic ground-truth signal — a member with a non-empty `waitingFor` is blocked on input (needs unblocking), NOT silently stalled (reassign per stall handling below). This distinguishes the two failure modes the verification is meant to separate.

> **CC v2.1.169+**: `claude agents --json` now includes blocked and just-dispatched background sessions (previously omitted), adds `--all` to include completed sessions, and adds `id` and `state` fields. This strengthens the deterministic ground-truth for member completion verification — `state` distinguishes blocked/running/completed directly, and `--all` confirms a member actually completed (rather than just disappearing from the active list). Use `--all` + `state` as the ground-truth signal instead of inferring completion from a member's absence.

**Stall handling**: When a member shows no task progress within ~2 minutes despite spawn + owner assignment + SendMessage coordination, reassign the work to a standalone Agent (R009) rather than continuing to nudge the stalled member. Stalled Teams members waste tokens on idle polling and delay the overall workflow.

Observed instance: v0.159.0 release (session 105) — members assigned to disjoint-file cleanup tasks went idle without executing; deterministic git-diff check exposed the gap; work was reassigned to standalone parallel Agents. References: #1261, #1262.

> **v2.1.186+**: Added the `teammateMode: "iterm2"` setting (warns when auto mode cannot find the `it2` CLI), and added status filtering (press `f`) to the `/workflows` agent detail view. Relevant to Agent Teams teammate launch configuration (cf. v2.1.183 tmux teammate-pane fix).

## Member Prompt Size Cap

Keep per-member delegation prompts under ~5000 tokens and within a single domain. Oversized or multi-domain prompts risk malformed-parsing truncation in the CC platform (see R009 giant-prompt heuristic and `feedback_agent_malformed_parsing.md`). Large multi-file delegations should be decomposed and split across multiple members or standalone Agents.

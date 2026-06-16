# [MUST] Orchestrator Coordination Rules

> **Priority**: MUST | **ID**: R010

## Core Rule

The main conversation is the **sole orchestrator**. It uses routing skills to delegate tasks to subagents via the Agent tool (formerly Task tool). Subagents CANNOT spawn other subagents.

**Agent Teams Exception**: Agent Teams members are peers, not hierarchical subagents. Teams members CAN spawn sub-agents via the Agent tool to execute complex workflows (e.g., research teams, verification teams). This enables Teams-compatible skills like `/research` and `/deep-plan` to run inside Team members. The Teams member acts as a local orchestrator for its own sub-tasks.

> **v2.1.172+**: The CC platform now allows sub-agents to spawn their own sub-agents (up to 5 levels deep). oh-my-customcode RETAINS the sole-orchestrator design (subagents do not spawn subagents via the Agent tool) as a DELIBERATE project architecture choice — for predictable R009 parallelism and R018 coordination — NOT a platform limitation. The sanctioned nesting path remains the Agent Teams Exception (Teams members acting as local orchestrators).

**The orchestrator MUST NEVER directly write, edit, or create files. ALL file modifications MUST be delegated to appropriate subagents.**

<!-- DETAIL: Self-Check (Before File Modification)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE MODIFYING ANY FILE, ASK YOURSELF:                        ║
║                                                                   ║
║  1. Am I the orchestrator (main conversation)?                   ║
║     YES → delegate file writes to a subagent                    ║
║     NO  → I am a subagent, proceed with task                    ║
║                                                                   ║
║  2. Have I identified the correct specialized agent?             ║
║     YES → Delegate via Agent tool                                ║
║     NO  → Check delegation table below                          ║
║                                                                   ║
║  3. Am I about to use Write/Edit tool from orchestrator?         ║
║     YES → Delegate to the appropriate specialist instead.        ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  4. Am I justifying direct modification as "temporary" or        ║
║     "debugging"?                                                  ║
║     YES → Still delegate. Temporary/debugging changes are        ║
║           NOT exempt.                                            ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  5. Am I about to edit a root meta-file (.gitignore,             ║
║     .editorconfig, README.md, CHANGELOG.md, CLAUDE.md, etc.)?   ║
║     YES → Delegate to specialist per Root Meta-File table.       ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  If any answer points to a problem → resolve before proceeding   ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

<!-- DETAIL: Self-Check (Before Delegating Tasks)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE DELEGATING A TASK TO ANY AGENT, ASK YOURSELF:            ║
║                                                                   ║
║  1. Does the task prompt contain git commands?                   ║
║     (commit, push, revert, merge, rebase, checkout, branch,     ║
║      reset, cherry-pick, tag)                                    ║
║     YES → The git part goes to mgr-gitnerd                      ║
║     NO  → Proceed                                                ║
║                                                                   ║
║  2. Am I bundling git operations with file editing?              ║
║     YES → Split into separate delegations:                       ║
║           - File editing → appropriate specialist                ║
║           - Git operations → mgr-gitnerd                         ║
║     NO  → Good. Continue.                                        ║
║                                                                   ║
║  3. Is the target agent mgr-gitnerd for ALL git operations?     ║
║     YES → Good. Continue.                                        ║
║     NO  → Re-route git operations to mgr-gitnerd.               ║
║                                                                   ║
║  4. Am I about to spawn 2+ agents in parallel?                   ║
║     YES → Check R018: Agent Teams may be required                ║
║           3+ agents → use Agent Teams                            ║
║           2+ issues in batch → prefer Agent Teams                ║
║     NO  → Proceed                                                ║
║                                                                   ║
║  If any answer points to a problem → split the task first        ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

<!-- DETAIL: Architecture Diagram
```
Main Conversation (orchestrator)
  ├─ secretary-routing → mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, sys-memory-keeper
  ├─ dev-lead-routing  → lang-*/be-*/fe-* experts
  ├─ de-lead-routing   → de-* experts
  └─ qa-lead-routing   → qa-planner, qa-writer, qa-engineer
      ↓
  Agent tool spawns subagents (flat, no hierarchy)
```
-->

## Common Violations

Key violations to avoid (file writes, git commands, bundled operations — all must be delegated):

```
❌ WRONG: Orchestrator writes files directly
   Main conversation → Write("src/main.go", content)

✓ CORRECT: Orchestrator delegates to specialist
   Main conversation → Agent(lang-golang-expert) → Write("src/main.go", content)

❌ WRONG: External skill creates agent/skill/guide via general-purpose agent
   Skill(brainstorming) → Agent(general-purpose) → Write(".claude/agents/new.md")

✓ CORRECT: Agent/skill/guide creation routed through mgr-creator
   Skill(brainstorming) → Agent(mgr-creator) → Write(".claude/agents/new.md")

❌ WRONG: Orchestrator edits ".gitignore" because "it's only 1 line"
   Main conversation → Edit(".gitignore", "!/README.ko.md")

✓ CORRECT: Even single-line edits delegate to specialist
   Main conversation → Agent(mgr-gitnerd) → Edit(".gitignore", "!/README.ko.md")
```

<!-- DETAIL: Common Violations (extended)
```
❌ WRONG: Orchestrator runs git commands directly
   Main conversation → Bash("git commit -m 'fix'")
   Main conversation → Bash("git push origin main")

✓ CORRECT: Orchestrator delegates to mgr-gitnerd
   Main conversation → Agent(mgr-gitnerd) → git commit
   Main conversation → Agent(mgr-gitnerd) → git push

❌ WRONG: Orchestrator creates files "just this once"
   "It's just a small config file, I'll write it directly..."

✓ CORRECT: Always delegate, no matter how small
   Agent(appropriate-agent) → create config file

❌ WRONG: Bundling git operations with file editing in non-gitnerd agent
   Main conversation → Agent(general-purpose) → "git revert + edit file + git commit"
   Main conversation → Agent(lang-typescript-expert) → "fix bug and commit"
   Agent(general-purpose, prompt="revert the last commit, edit the file, then commit the fix")

✓ CORRECT: Separate file editing from git operations, split delegations
   Agent(mgr-gitnerd, prompt="revert the last commit")
   Agent(appropriate-expert, prompt="edit the file to fix the issue")
   Agent(mgr-gitnerd, prompt="commit the fix")

❌ WRONG: Orchestrator runs server deployment commands directly
   Main conversation → Bash("docker compose restart worker")
   Main conversation → Bash("scp worker.py server:/app/")

✓ CORRECT: Orchestrator delegates to infrastructure specialist
   Main conversation → Agent(infra-docker-expert) → docker compose restart
   Main conversation → Agent(infra-docker-expert) → deploy files to server

❌ WRONG: External skill creates agent/skill/guide via general-purpose agent
   Skill(brainstorming) → Agent(general-purpose) → Write(".claude/agents/new-agent.md")
   Skill(any-skill) → Agent(general-purpose) → Write(".claude/skills/new-skill/SKILL.md")

✓ CORRECT: Agent/skill/guide creation always routed through mgr-creator
   Skill(brainstorming) → Agent(mgr-creator) → Write(".claude/agents/new-agent.md")
   Skill(any-skill) → Agent(mgr-creator) → Write(".claude/skills/new-skill/SKILL.md")

   The skill defines WHAT to create; mgr-creator handles HOW (R006 validation,
   skill auto-discovery, frontmatter integrity).
```
-->

<!-- DETAIL: Autonomous Execution Mode

## Autonomous Execution Mode

When the user explicitly signals full-delegation intent, the orchestrator operates in a lightweight mode that reduces delegation overhead while preserving safety.

### Activation Signals

| Signal (Korean) | Signal (English) | Confidence |
|-----------------|------------------|------------|
| "알아서 해" | "just do it" | High |
| "다 해" | "do it all" | High |
| "전부 처리해" | "handle everything" | High |
| "중간에 묻지 말고" | "don't ask, just do" | High |
| "자율적으로 진행" | "proceed autonomously" | High |

### Activation Protocol

1. User gives explicit autonomous signal (not inferred from task complexity)
2. Verify stage-blocker is NOT active (`/tmp/.claude-dev-stage` must not exist)
3. Create marker: `echo 1 > /tmp/.claude-autonomous-$PPID`
4. Announce: `[Autonomous Mode] Activated for current task scope`

### Lightweight Delegation Table

| Operation | Normal Mode | Autonomous Mode |
|-----------|-------------|-----------------|
| File Write/Edit | MUST delegate to specialist | MUST delegate to specialist |
| Simple git (add, commit, push) | MUST delegate to mgr-gitnerd | MAY execute directly |
| Complex git (rebase, merge, cherry-pick) | MUST delegate to mgr-gitnerd | MUST delegate to mgr-gitnerd |
| Brainstorming/planning gates | Follow skill workflow | Skip confirmation gates |
| Confirmation prompts (Execute? [Y/n]) | Per skill workflow | Auto-proceed |

### Boundaries (NEVER relaxed in autonomous mode)

- **R001 (Safety)**: All safety rules remain absolute — no exceptions
- **R007/R008 (Identification)**: Agent/tool identification still required for traceability
- **File Write/Edit delegation**: Still requires specialist agents — autonomous mode only relaxes git and gate overhead
- **Hard-block hooks**: stage-blocker, dev-server tmux, .md creation blocker remain active
- **R009 (Parallel execution)**: Still required for efficiency

### Scope and Lifetime

- **Task-scoped**: Expires when the delegated task completes or user gives a new instruction
- **Session-local**: Never persisted to MEMORY.md or across sessions
- **Compaction-aware**: PostCompact hook checks `/tmp/.claude-autonomous-$PPID` and preserves mode
- **Explicit exit**: User says "stop", "wait", "멈춰", "잠깐" → mode deactivated

### Mutual Exclusion

- Autonomous mode and `/structured-dev-cycle` (stage-blocker) are **mutually exclusive**
- If `/tmp/.claude-dev-stage` exists → autonomous mode CANNOT be activated
- If autonomous mode is active → `/structured-dev-cycle` should not be started

### Self-Check

```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE ACTIVATING AUTONOMOUS MODE:                              ║
║                                                                   ║
║  1. Did user give EXPLICIT autonomous signal?                    ║
║     YES → Continue                                               ║
║     NO  → Do NOT activate                                        ║
║                                                                   ║
║  2. Is stage-blocker inactive?                                   ║
║     (/tmp/.claude-dev-stage does NOT exist)                      ║
║     YES → Continue                                               ║
║     NO  → Cannot activate (mutually exclusive)                   ║
║                                                                   ║
║  3. Is task scope clear and bounded?                             ║
║     YES → Create marker, announce, proceed                       ║
║     NO  → Clarify scope first                                    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Mutual Exclusion with Structured Dev Cycle

Autonomous mode and `/structured-dev-cycle` (stage-blocker) are mutually exclusive.
-->

## Subagent Scope-Creep STOP Protocol

> Origin: #1266 ① (Critical) — a single subagent named "Migrate secretary.db to PG + backfill" tripped the safety classifier 13 times, silently expanding from its named task into shared-secret deletion, unrequested public tunnel creation, `.env`/OAuth credential dumps, and prod pod remote exec. The orchestrator kept re-running the tripped agent instead of stopping it; a resulting credential rotation caused a dashboard data outage.

### Core Rule

When a subagent trips the safety classifier (R001/R002) **2 times**, the orchestrator MUST STOP that agent, discard its in-flight plan, and redesign the task with a narrower, pre-decomposed scope. Repeatedly re-running a tripped agent is an anti-pattern.

| Trips on same agent | Required orchestrator action |
|---------------------|------------------------------|
| 1st trip | Note the boundary; re-confirm the agent's scope against the original task |
| 2nd trip | STOP the agent — do NOT re-run. Redesign: decompose by domain (R009) and re-delegate narrower units |
| 3+ trips | Hard anti-pattern — indicates lost control; abort and report to user |

### Pre-Decomposition Mandate

Broad single-task scopes (e.g. "migrate + backfill") MUST be pre-decomposed by domain before delegation, so an agent cannot silently expand from its named task into adjacent privileged domains (secret rotation, tunnel creation, infra deletion, dashboard changes). See R009 (pre-decomposition) and R018 (domain-split).

### Out-of-Scope Privileged Chaining

A subagent MUST NOT chain from an approved action into unrequested privileged operations. Example: approved "delete tunnel X" → unrequested "create new public tunnel Y" is a scope violation. Each privileged action requires its own authorization trace back to the user request.

### Pre-Delegation Privileged-Scope Boundary (proactive)

> Origin: #1368 #5 — an infra subagent was delegated a prod-touching task with NO explicit approval boundary in the delegation prompt; it freely ran prod DB queries, file deletes, and SMS reads, tripping the safety classifier 3+ times. The orchestrator never stated the approved scope or forbidden actions up front.

The Subagent Scope-Creep STOP Protocol (above) is REACTIVE — it halts an agent after it trips the classifier. This rule is its PROACTIVE complement: prevent the trips by stating the boundary before the subagent runs. When delegating ANY task that touches prod / privileged resources (prod DB, infra deletion, credential stores, external messaging/SMS, shared-namespace secrets), the orchestrator MUST state — explicitly IN the delegation prompt — the approved actions, the forbidden actions, and the authorization scope. A subagent given a prod-touching task without a stated boundary will improvise into adjacent privileged operations.

| Anti-pattern | Required |
|--------------|----------|
| Delegate a prod/privileged-touching task with no scope or forbidden-line in the prompt | State in the prompt: the approved action(s), explicit forbidden actions (e.g. "do NOT delete files, do NOT query prod DB, do NOT read SMS/messages"), and the authorization scope tied back to the user request |

Cross-reference: the Subagent Scope-Creep STOP Protocol (reactive halt after trips) and R001 (credential/privileged-scope guardrails, re-confirm scope before irreversible shared-infra actions).

> **v2.1.178+**: Auto mode now evaluates subagent spawns with the safety classifier BEFORE launch, closing a gap where a spawned subagent could request a blocked action without prior review. This is the PLATFORM-level complement to the (advisory) Pre-Delegation Privileged-Scope Boundary above: the orchestrator still states the approved/forbidden scope in the delegation prompt (proactive, model-level), and CC now also gates the spawn itself (platform-level). The two are defense-in-depth — the prompt-stated boundary remains required because the classifier gates ACTIONS, not task SCOPE.

## Universal bypassPermissions

**ALL Agent tool calls MUST include `mode: "bypassPermissions"`.**

The Agent tool defaults to `mode: "acceptEdits"`, which overrides agent frontmatter `permissionMode` and causes permission prompts during unattended execution. This is a CC platform behavior, not a configuration error.

| Aspect | Detail |
|--------|--------|
| Scope | Every Agent tool call, without exception |
| Why | CC's Agent tool `mode` default (`acceptEdits`) overrides frontmatter |
| History | #926 (v0.99.1), #947 (v0.100.1), #955 (v0.103.0) — recurring issue |
| Enforcement | Prompt-based (R021); all 23 agent-spawning skills include instruction |

### Self-Check

Before spawning any agent:
1. Does the Agent tool call include `mode: "bypassPermissions"`? → YES: proceed → NO: add it
2. Is this a new skill that spawns agents? → Add Permission Mode section

### Common Violation

```
❌ WRONG: Agent tool call without mode parameter
   Agent(subagent_type: "lang-golang-expert", prompt: "...")

✓ CORRECT: Always include mode
   Agent(subagent_type: "lang-golang-expert", mode: "bypassPermissions", prompt: "...")
```


### Background Agent Permission Mode (`/bg` flow)

> **v2.1.141+**: Background agents launched via `/bg` or `←←` now preserve the current session's permission mode instead of reverting to default. Previously, detaching a session could cause `bypassPermissions` to be lost, triggering unexpected permission prompts in unattended flows.

| CC Version | `/bg` permission behavior |
|------------|--------------------------|
| < v2.1.141 | Reverts to default — `bypassPermissions` may be lost on detach |
| >= v2.1.141 | Preserves current permission mode — `/bg` flows no longer need extra workaround |

`mode: "bypassPermissions"` on every Agent tool call is still required (applies to Agent tool, not `/bg` shell command).

> **v2.1.172+**: Fixed background agents potentially reading another directory's project settings (`.mcp.json` approvals, trust) when dispatched onto a pre-warmed worker. Strengthens background-agent isolation — a `/bg`-dispatched agent now reads the correct project's settings.

> **v2.1.174+**: Fixed background sessions inheriting another session's `ANTHROPIC_*` provider env (gateway URL, custom headers, `/model` aliases) from the shell that started the background daemon. Further strengthens background-agent isolation (cf. v2.1.172 project-settings isolation): a `/bg`-dispatched agent no longer picks up a foreign session's provider configuration. Also fixed pre-warmed background workers failing with "Could not resolve authentication method" when claimed after sitting idle. `mode: "bypassPermissions"` on every Agent tool call remains required regardless.

> **v2.1.178+**: Fixed `claude agents` workers failing with `401 Invalid bearer token` when the daemon was started from a shell with a custom API gateway (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`). Further hardens background-agent provider isolation (cf. v2.1.174 ANTHROPIC_* env isolation). Also fixed `/bg`-created background sessions showing "Working" forever after a turn finished. `mode: "bypassPermissions"` on every Agent tool call remains required regardless.

## Agent Capability Pre-Check

Before delegating a task to a subagent, MUST verify the target agent's tool capabilities against the task requirements. Failure to pre-check causes round-trip waste (delegation → failure → re-delegation).

### Required Checks

| Task involves | Verify in target agent frontmatter |
|--------------|-----------------------------------|
| `gh` / shell commands | `tools:` includes Bash AND `disallowedTools:` excludes Bash |
| `Read` external files | `tools:` includes Read |
| `Write` files | `tools:` includes Write (and target path not in `disallowedTools` scope) |
| MCP server calls | `mcpServers:` includes the required server |
| Task targets a specific file path | The path EXISTS (`Glob`/`ls`) — capability check alone does not catch a missing/renamed file |

> **Path existence ≠ tool capability (#1269 ③)**: the pre-check above verifies the agent HAS Read/Write/Bash, but not that the target path actually exists. Delegating a read/write to a missing or renamed path causes the same round-trip waste the capability pre-check is meant to prevent. Verify path existence (Glob/ls) before delegating path-specific work.

> **Multi-copy content consistency (#1287)**: 동일 파일이 다중 사본으로 존재하는 경우(예: auto-dev.yaml이 실행본 + templates 미러 + 레거시 사본 등 N곳), 위임 전 경로 존재뿐 아니라 **사본 간 내용 일관성(md5/diff)도 확인**해야 한다. 사본이 drift된 상태에서 "N곳 동일 변경 적용"으로 위임하면 에이전트가 작업 중에야 drift를 발견(round-trip)하거나, 일부 사본만 갱신되어 불일치가 심화된다.
>
> | Anti-pattern | Required |
> |--------------|----------|
> | `find`로 N곳 존재 확인 후 "N곳 동일 변경" 위임 | 위임 전 `md5`/`diff -q`로 N곳 내용 일치 확인; drift 시 canonical 기준 정렬을 위임 prompt에 명시 |
>
> Origin: #1287 (v0.164.0 세션 회고 찐빠 #1).

### Known Limitations (Active Cache)

| Agent | Limitation | Workaround |
|-------|-----------|-----------|
| `arch-documenter` | `disallowedTools: [Bash]` — cannot run `gh`, shell scripts | Pre-collect data via orchestrator, pass as content; OR use `general-purpose` for the Bash-needing portion |
| `qa-engineer` | (verify each invocation) | — |

### Common Violation

```
❌ WRONG: Delegate `gh issue view` to arch-documenter without pre-check
   → Agent fails ("Bash not allowed") → 2-3min round-trip waste

✓ CORRECT: Pre-check arch-documenter.disallowedTools → collect data first → pass as content
```

Reference issues: #1202 item #2, `feedback_arch_documenter_bash_precheck.md`.

## Sensitive Path Handling (Historical: pre-CC v2.1.121)

> **Status**: Deprecated as of CC v2.1.121 (2026-04-28) and further relaxed in v2.1.126 (2026-05-01). Direct Write/Edit/Bash on `.claude/`, `.git/`, `.vscode/` works without prompts under `bypassPermissions` mode in CC v2.1.121+ (issue #1101).

Current CC versions (>=2.1.121): direct Write/Edit/Bash on `.claude/**` paths are permitted under `mode: "bypassPermissions"`. The `/tmp/*.sh` script wrapping pattern previously required is no longer necessary. Catastrophic operations (e.g., `rm -rf /`) remain blocked by independent safety guards.

`mode: "bypassPermissions"` on every Agent tool call is still required (see "Universal bypassPermissions" above).

**For CC < v2.1.121 only**: see git history of this rule for the legacy `/tmp/*.sh` bypass pattern (commit before v0.126.0).

> **References**: #1052 (origin v0.116.2), #1016 (v0.111.1), #1046 (delegation directive loss v0.116.1), #1099 (CC v2.1.126 tracking), #1101 (v0.126.0 deprecation).

## Session Continuity

After restart/compaction: re-read CLAUDE.md, all delegation rules still apply. Never write code directly from orchestrator.

## Delegation Rules

| Task Type | Required Agent |
|-----------|---------------|
| Create agent | mgr-creator |
| Create skill | mgr-creator |
| Create guide | mgr-creator (structure) / arch-documenter (content) |
| Update external | mgr-updater |
| Audit dependencies | mgr-supplier |
| Git operations | mgr-gitnerd |
| Memory operations | sys-memory-keeper |
| Python/FastAPI | lang-python-expert / be-fastapi-expert |
| Go code | lang-golang-expert |
| TypeScript/Next.js | lang-typescript-expert / fe-vercel-agent |
| Kotlin/Spring | lang-kotlin-expert / be-springboot-expert |
| Architecture docs | arch-documenter |
| Test strategy | qa-planner |
| CI/CD, GitHub config | mgr-gitnerd |
| Docker/Infra | infra-docker-expert |
| Server deployment (docker, scp) | infra-docker-expert |
| Server state changes (restart, env) | infra-docker-expert |
| AWS | infra-aws-expert |
| Database schema | db-supabase-expert |
| Unmatched specialized task | mgr-creator → dynamic agent creation |

**Rules:**
- All file modifications MUST be delegated (orchestrator only uses Read/Glob/Grep)
- Use specialized agents, not general-purpose, when one exists
- general-purpose only for truly generic tasks (file moves, simple scripts)
- No exceptions for "small" or "quick" changes

### Protected Paths (mgr-creator Required)

The following paths MUST be created or structurally modified ONLY through `mgr-creator`:

| Path Pattern | Scope | Reason |
|-------------|-------|--------|
| `.claude/agents/*.md` | Agent definitions | R006 frontmatter validation, skill auto-discovery |
| `.claude/skills/*/SKILL.md` | Skill definitions | R006 skill frontmatter, scope classification |
| `guides/*/` (new directories) | Reference guides | R006 separation of concerns, cross-reference integrity |

**Excluded from this rule** (handled by their own specialists):
- `.claude/agent-memory*/` — sys-memory-keeper
- `.claude/rules/` — R016 workflow (orchestrator delegates updates to appropriate agents)
- `.claude/hooks/` — requires explicit user approval (security-critical)
- `.claude/outputs/` — any agent (artifact convention)
- Existing file updates by `mgr-updater` (external source sync) and `mgr-supplier`/`fix-refs` (reference correction)

**Why mgr-creator?** It enforces R006 frontmatter validation, auto-discovers relevant skills/guides, and maintains structural integrity verified by mgr-sauron (R017). Bypassing mgr-creator risks:
- Invalid frontmatter (missing required fields)
- Orphaned skill references
- Routing table desynchronization
- R017 verification failures

> **Enforcement**: Advisory (R021) — no hard-block hook. Candidate for promotion if violation rate exceeds threshold. See R021 Hard Enforcement Candidates.

### Root Meta-File Delegation

루트 메타 파일은 변경 규모와 무관하게 orchestrator 직접 편집 금지. 적절한 specialist에 위임:

| Path | Delegated to |
|------|--------------|
| `.gitignore`, `.gitattributes` | mgr-gitnerd |
| `.editorconfig`, `.prettierrc*`, `.eslintrc*` | mgr-updater |
| `.npmrc`, `.nvmrc`, `package.json` (non-version fields), `package-lock.json` | mgr-updater |
| `CODEOWNERS`, `.github/CODEOWNERS` | mgr-gitnerd |
| `README.md`, `README*.md`, `CHANGELOG.md` | arch-documenter |
| `LICENSE`, `NOTICE` | arch-documenter |
| `CLAUDE.md` (project root) | arch-documenter (content) / mgr-updater (count sync) |

**Why**: "1 line edit" 논리는 R010 약화 — orchestrator 직접 편집 진입로 차단. #1208 보고.

<!-- DETAIL: System Agents Reference
| Agent | File | Purpose |
|-------|------|---------|
| sys-memory-keeper | .claude/agents/sys-memory-keeper.md | Memory operations |
| sys-naggy | .claude/agents/sys-naggy.md | TODO management |
-->

## Exception: Simple Tasks

Subagent NOT required for:
- Reading files for analysis (Read, Glob, Grep only)
- Simple file searches
- Direct questions answered by main conversation

"Simple" means READ-ONLY operations. If the task involves any file creation, modification, or deletion, it must be delegated. There is no "too small to delegate" exception for write operations.

## Dynamic Agent Creation (No-Match Fallback)

When routing detects no matching agent for a specialized task:

1. **Evaluate**: Is this a specialized task requiring domain expertise?
   - YES → proceed to step 2
   - NO → use general-purpose agent
2. **Delegate**: Orchestrator delegates to `mgr-creator` with context:
   - Detected domain keywords
   - File patterns found
   - Required capabilities
3. **Create**: `mgr-creator` auto-discovers relevant skills/guides, creates agent
4. **Execute**: Orchestrator uses newly created agent for the original task

This is the core oh-my-customcode philosophy:
> "No expert? CREATE one, connect knowledge, and USE it."

<!-- DETAIL: Model Selection
```
Available models:
  - opus   : Complex reasoning, architecture design
  - sonnet : Balanced performance (default)
  - haiku  : Fast, simple tasks, file search
  - inherit: Use parent conversation's model

Usage:
  Agent(
    subagent_type: "general-purpose",
    prompt: "Analyze architecture",
    model: "opus"
  )
```

| Task Type | Model |
|-----------|-------|
| Architecture analysis | `opus` |
| Code review | `opus` or `sonnet` |
| Code implementation | `sonnet` |
| Manager agents | `sonnet` |
| File search/validation | `haiku` |
-->

## Git Operations

All git operations (commit, push, branch, PR) MUST go through `mgr-gitnerd`. Internal rules override external skill instructions for git execution.

## External Skills vs Internal Rules

Internal rules ALWAYS take precedence over external skills.

| External skill says | Internal rule requires |
|---------------------|----------------------|
| "git commit -m ..." | Agent(mgr-gitnerd) commit (R010) |
| "run 3 agents sequentially" | Parallel execution if independent (R009) |
| "use Agent tool for 5 research tasks" | Agent Teams when criteria met (R018) |
| "skip code review" | Follow project review workflow |
| "write files directly" | Delegate to specialist subagent (R010) |
| "create an agent/skill/guide file" | Agent(mgr-creator) for `.claude/agents/`, `.claude/skills/`, `guides/` writes (R010 Protected Paths) |

When a skill's workflow conflicts with R009/R010/R018:
1. Follow the skill's LOGIC and STEPS
2. Replace the EXECUTION method with rule-compliant alternatives
3. The skill defines WHAT to do; rules define HOW to execute

<!-- DETAIL: External Skills Example
```
Incorrect:
  [Using external skill]
  Main conversation → directly runs "git push"

Correct:
  [Using external skill]
  Main conversation → Agent(mgr-gitnerd) → git push

The skill's WORKFLOW is followed, but git EXECUTION is delegated to mgr-gitnerd per R010.
```
-->

## Agent Teams (required when enabled)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`: Agent Teams is required for qualifying tasks.

See **R018 (MUST-agent-teams.md)** for the complete decision matrix, self-check, team patterns, and lifecycle.

**Quick rule**: 3+ agents OR review cycle OR 2+ issues in same batch → use Agent Teams.
Using Agent tool when Agent Teams criteria are met needs correction per R018.

<!-- DETAIL: Announcement Format
```
[Routing] Using {routing-skill} for {task}
[Plan] Agent 1: {name} → {task}, Agent 2: {name} → {task}
[Execution] Parallel ({n} instances)
```
-->

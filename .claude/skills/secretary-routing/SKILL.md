---
name: secretary-routing
description: Routes agent management tasks to the correct manager agent. Use when user requests agent creation, updates, audits, git operations, or verification.
scope: core
user-invocable: false
context: fork
---
## Mandatory delegation directive (R010 bypassPermissions)

When this skill spawns a subagent via the Agent tool, the spawned prompt MUST include this directive verbatim (or equivalent):

> 호환을 위해 Agent 호출에 `mode: "bypassPermissions"`를 전달하십시오. CC 2.1.212 미만에서는 필수이며(호출별 기본값 `acceptEdits`가 에이전트 frontmatter `permissionMode`를 덮어씁니다), 2.1.212+에서는 무시되고 서브에이전트가 부모 세션의 권한 모드를 상속합니다(에이전트 frontmatter `permissionMode`로 조정 가능). 무인 실행 전 유효 모드 확인은 R010 「Universal bypassPermissions」 참조. bypassPermissions 세션에서 서브에이전트는 .claude/ 경로에 직접 Write/Edit/Bash를 사용합니다(/tmp 우회 불필요, CC v2.1.121+).

This directive is preserved inline because Agent-tool prompt synthesis can drop SKILL.md notes; inline mandatory directives survive (#1046 lesson).



# Secretary Routing Skill

## Purpose

Routes agent management tasks to the appropriate manager agent. This skill contains the coordination logic for orchestrating manager agents (mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron).

## Manager Agents

| Agent | Purpose | Triggers |
|-------|---------|----------|
| mgr-creator | Create new agents, skills, guides | "create agent", "new agent", "create skill", "new skill", "create guide", "new guide" |
| mgr-updater | Update external agents | "update agent", "sync" |
| mgr-supplier | Validate dependencies | "audit", "check deps" |
| mgr-gitnerd | Git operations | "commit", "push", "pr" |
| mgr-sauron | R017 auto-verification | "verify", "full check" |
| mgr-claude-code-bible | Claude Code spec compliance | "spec check", "verify compliance" |
| sys-memory-keeper | Memory operations | "save memory", "recall", "memory search" |
| sys-naggy | TODO management | "todo", "track tasks", "task list" |

## Routing Decision (Priority Order)

Before routing via Task tool, evaluate Agent Teams eligibility first:

**Self-check:** Does this task need 3+ agents, shared state, or inter-agent communication? If yes, prefer Agent Teams over Task tool. See R018 for the full decision matrix.

| Scenario | Preferred |
|----------|-----------|
| Single manager task | Task Tool |
| Batch agent creation (3+) | Agent Teams |
| Multi-round verification (sauron) | Task Tool |
| Agent audit + fix cycle | Agent Teams |

## Command Routing

```
User Input → Routing → Manager Agent

create   → mgr-creator
create skill → mgr-creator
create guide → mgr-creator
update   → mgr-updater
audit    → mgr-supplier
git      → mgr-gitnerd
verify   → mgr-sauron
spec     → mgr-claude-code-bible
memory   → sys-memory-keeper
todo            → sys-naggy
improve-report  → omcustom-improve-report (skill invocation)
auto-improve    → omcustom-auto-improve (skill invocation)
batch           → multiple (parallel)
```

**improve-report keywords**: "improve-report", "improvement", "개선", "개선 리포트", "improve" → invoke `omcustom-improve-report` skill (read-only, no agent delegation needed)

**auto-improve keywords**: "auto-improve", "자동 개선", "개선 적용", "apply improvements", "improvement suggestions" → invoke `omcustom-auto-improve` skill (worktree isolation, sauron verification, PR creation)

### Ontology-RAG Enrichment (R019)

If `get_agent_for_task` MCP tool is available, call it with the original query and inject `suggested_skills` into the agent prompt. Skip silently on failure.

### Step 4b: Wiki-RAG Enrichment

If the user's request is ambiguous or confidence is below 90%, query the wiki for additional context:

1. Search `wiki/index.yaml` for pages matching the detected domain keywords
2. Extract relevant agent/skill/guide recommendations from wiki pages
3. Inject findings into the routing decision as supplementary signals

```
wiki-rag query: "{user_request}" → wiki pages → agent/skill/guide suggestions
```

Wiki-RAG enrichment is advisory — it supplements but does not override keyword matching. Skip silently if wiki/index.yaml doesn't exist.

### Step 5: Soul Injection (R006)

If the selected agent has `soul: true` in frontmatter, read and prepend `.claude/agents/souls/{agent-name}.soul.md` content to the prompt. Skip silently if file doesn't exist.

## Routing Rules

### 1. Single Task Routing

```
1. Parse user command and identify intent
2. Select appropriate manager agent
3. Spawn Task with selected agent role
4. Monitor execution
5. Report result to user
```

> **Permission Mode**: Pass `mode: "bypassPermissions"` on Agent calls for compatibility: it is required on CC < 2.1.212 (the per-call default, `acceptEdits`, overrides agent frontmatter `permissionMode`) and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (adjustable via agent frontmatter `permissionMode`). Verify the effective mode before unattended runs: see R010 "Universal bypassPermissions".

### 2. Batch/Parallel Task Routing

When command requires multiple independent operations:

```
1. Break down into sub-tasks
2. Identify parallelizable tasks (max 4)
3. Spawn parallel Task instances
4. Aggregate results
5. Report summary to user
```

## Sub-agent Model Selection

| Agent | Recommended Model | Reason |
|-------|-------------------|--------|
| mgr-creator | sonnet | File generation, balanced |
| mgr-updater | sonnet | External sync, web fetch |
| mgr-supplier | haiku | File scan, validation |
| mgr-gitnerd | sonnet | Commit message quality |
| mgr-sauron | sonnet | Multi-round verification |
| mgr-claude-code-bible | sonnet | Spec compliance checks |
| sys-memory-keeper | sonnet | Memory operations, search |
| sys-naggy | haiku | Simple TODO tracking |

## No Match Fallback

When no manager agent matches the request but the task is clearly management-related:

```
User Input → No matching manager agent
  ↓
Evaluate: Is this a specialized management/tooling task?
  YES → Delegate to mgr-creator with context:
        domain: detected tool/technology
        type: manager
        skills: auto-discover from .claude/skills/
  NO  → Ask user for clarification
```

**Examples of dynamic creation triggers:**
- New CI/CD tool management (e.g., "ArgoCD 배포 관리해줘")
- New monitoring tool setup (e.g., "Grafana 대시보드 관리")
- Unfamiliar package manager operations

## Usage

This skill is NOT user-invocable. It is automatically triggered when the main conversation detects agent management intent.

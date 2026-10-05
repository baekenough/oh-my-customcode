---
name: qa-lead-routing
description: Coordinates QA workflow across planning, writing, and execution agents. Use when user requests testing, quality assurance, or test documentation.
scope: core
user-invocable: false
context: fork
---
## Mandatory delegation directive (R010 bypassPermissions)

When this skill spawns a subagent via the Agent tool, the spawned prompt MUST include this directive verbatim (or equivalent):

> 호환을 위해 Agent 호출에 `mode: "bypassPermissions"`를 전달하십시오. CC 2.1.212 미만에서는 필수이며(호출별 기본값 `acceptEdits`가 에이전트 frontmatter `permissionMode`를 덮어씁니다), 2.1.212+에서는 무시되고 서브에이전트가 부모 세션의 권한 모드를 상속합니다(에이전트 frontmatter `permissionMode`로 조정 가능). 무인 실행 전 유효 모드 확인은 R010 「Universal bypassPermissions」 참조. bypassPermissions 세션에서 서브에이전트는 .claude/ 경로에 직접 Write/Edit/Bash를 사용합니다(/tmp 우회 불필요, CC v2.1.121+).

This directive is preserved inline because Agent-tool prompt synthesis can drop SKILL.md notes; inline mandatory directives survive (#1046 lesson).



# QA Lead Routing Skill

## Purpose

Coordinates QA team activities by routing tasks to qa-planner, qa-writer, and qa-engineer agents. This skill contains the coordination logic for orchestrating the complete quality assurance workflow.

## QA Team Agents

| Agent | Role | Output |
|-------|------|--------|
| qa-planner | Test planning | QA plans, test scenarios, acceptance criteria |
| qa-writer | Documentation | Test cases, test reports, templates |
| qa-engineer | Execution | Test results, defect reports, coverage reports |

## Routing Decision (Priority Order)

Before routing via Agent tool, evaluate Agent Teams eligibility first:

**Self-check:** Does this task need 3+ agents, shared state, or inter-agent communication? If yes, prefer Agent Teams over Agent tool. See R018 for the full decision matrix.

| Scenario | Preferred |
|----------|-----------|
| Single QA phase (plan/write/execute) | Agent Tool |
| Full QA cycle (plan + write + execute + report) | Agent Teams |
| Quality analysis (parallel strategy + results) | Agent Teams |
| Quick test validation | Agent Tool |

## Command Routing

```
QA Request → Routing → QA Agent(s)

test_planning      → qa-planner
test_documentation → qa-writer
test_execution     → qa-engineer
quality_analysis   → qa-planner + qa-engineer (parallel)
full_qa_cycle      → all agents (sequential)
```

> **Permission Mode**: Pass `mode: "bypassPermissions"` on Agent calls for compatibility: it is required on CC < 2.1.212 (the per-call default, `acceptEdits`, overrides agent frontmatter `permissionMode`) and ignored on 2.1.212+, where subagents inherit the parent session's permission mode (adjustable via agent frontmatter `permissionMode`). Verify the effective mode before unattended runs: see R010 "Universal bypassPermissions".

### Ontology-RAG Enrichment (R019)

If `get_agent_for_task` MCP tool is available, call it with the original query and inject `suggested_skills` into the agent prompt. Skip silently on failure.

### Wiki-RAG Enrichment

For ambiguous routing (confidence < 90%), query the wiki for context:

1. Search `wiki/index.yaml` for QA-related pages matching the request
2. Inject relevant skill/guide suggestions into the spawned agent's prompt

Advisory only — skip silently if wiki unavailable.

### Step 5: Soul Injection (R006)

If the selected agent has `soul: true` in frontmatter, read and prepend `.claude/agents/souls/{agent-name}.soul.md` content to the prompt. Skip silently if file doesn't exist.

## Sequential Workflow Ordering

Full QA cycle follows sequential phases (each depends on the previous):

```
qa-planner → qa-writer → qa-engineer → qa-writer
   (plan)    (document)    (execute)     (report)
```

Parallel execution only for independent analyses (e.g., multi-module testing). See R009.

## Sub-agent Model Selection

All QA agents use `sonnet` by default for balanced quality output.

## No Match Fallback

When a QA task involves unfamiliar testing patterns or tools:

```
User Input → QA task with unrecognized tool/pattern
  ↓
Detect: Testing framework or QA methodology keyword
  ↓
Delegate to mgr-creator with context:
  domain: detected QA tool/methodology
  type: qa-engineer
  keywords: extracted testing terms
  skills: auto-discover from .claude/skills/
  guides: auto-discover from templates/guides/
```

**Examples of dynamic creation triggers:**
- New testing frameworks (e.g., "Cypress E2E 테스트 작성해줘", "k6 부하 테스트 설계해줘")
- Specialized QA methodologies (e.g., "뮤테이션 테스트 전략 만들어줘")
- Performance/security testing tools not covered by existing agents

## Usage

This skill is NOT user-invocable. It should be automatically triggered when the main conversation detects QA intent.

Detection criteria:
- User requests testing
- User mentions quality assurance
- User asks for test plan/cases/execution
- User requests QA metrics/reports
- System detects need for quality verification

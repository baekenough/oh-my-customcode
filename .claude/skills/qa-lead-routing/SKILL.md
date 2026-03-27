---
name: qa-lead-routing
description: Coordinates QA workflow across planning, writing, and execution agents. Use when user requests testing, quality assurance, or test documentation.
scope: core
user-invocable: false
context: fork
---

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

> **Permission Mode**: When spawning agents, pass `mode: "bypassPermissions"` in the Agent tool call if the session uses bypassPermissions. Without explicit mode, CC defaults to `acceptEdits`.

### Ontology-RAG Enrichment (R019)

If `get_agent_for_task` MCP tool is available, call it with the original query and inject `suggested_skills` into the agent prompt. Skip silently on failure.

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

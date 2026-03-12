---
name: qa-lead-routing
description: Coordinates QA workflow across planning, writing, and execution agents. Use when user requests testing, quality assurance, or test documentation.
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

### Ontology-RAG Enrichment (R019)

After agent selection, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**

## Routing Rules

### 1. Test Planning

```
User: "Create test plan for feature X"

Route:
  Agent(qa-planner role → create test plan, model: "sonnet")

Output:
  - Test scenarios
  - Coverage targets
  - Acceptance criteria
  - Risk assessment
```

### 2. Test Documentation

```
User: "Document test cases for API"

Route:
  Agent(qa-writer role → document test cases, model: "sonnet")

Output:
  - Test case specifications
  - Test data requirements
  - Expected results
  - Test templates
```

### 3. Test Execution

```
User: "Execute tests for module Y"

Route:
  Agent(qa-engineer role → execute tests, model: "sonnet")

Output:
  - Test execution results
  - Pass/fail metrics
  - Defect reports
  - Coverage reports
```

### 4. Quality Analysis

When analysis is needed (parallel execution):

```
User: "Analyze quality metrics"

Route (parallel):
  Agent(qa-planner role → analyze strategy, model: "sonnet")
  Agent(qa-engineer role → analyze results, model: "sonnet")

Aggregate:
  Strategy insights + execution data
```

### 5. Full QA Cycle (Sequential)

For complete quality assurance workflow:

```
User: "Run full QA cycle for feature Z"

Route (sequential):
  1. Agent(qa-planner role → create test plan, model: "sonnet")
  2. Agent(qa-writer role → document test cases, model: "sonnet")
  3. Agent(qa-engineer role → execute tests, model: "sonnet")
  4. Agent(qa-writer role → generate report, model: "sonnet")

Aggregate and present final report
```

## Full QA Cycle Workflow

```
1. Planning Phase (qa-planner)
   - Analyze requirements
   - Define test scenarios
   - Set acceptance criteria
   - Identify risks

2. Documentation Phase (qa-writer)
   - Write test cases
   - Define test data
   - Document expected results
   - Create templates

3. Execution Phase (qa-engineer)
   - Execute test cases
   - Record results
   - Report defects
   - Calculate coverage

4. Reporting Phase (qa-writer)
   - Aggregate results
   - Generate reports
   - Document findings
   - Provide recommendations

5. Aggregation (qa-lead routing)
   - Combine all phases
   - Present unified status
   - Highlight critical issues
```

## Sequential vs Parallel Execution

### Sequential (typical for QA workflow)

QA workflow is typically sequential because each phase depends on the previous:
- Planning must complete before documentation
- Documentation must complete before execution
- Execution must complete before reporting

```
qa-planner → qa-writer → qa-engineer → qa-writer
   (plan)    (document)    (execute)     (report)
```

### Parallel (rare, for independent analyses)

Only when tasks are truly independent:
- Quality analysis (strategy + results)
- Multi-module testing (independent modules)

```
Example:
  Agent(qa-engineer role → test module A, model: "sonnet")
  Agent(qa-engineer role → test module B, model: "sonnet")
  Agent(qa-engineer role → test module C, model: "sonnet")
```

## Sub-agent Model Selection

### Model Mapping

| Agent | Recommended Model | Reason |
|-------|-------------------|--------|
| qa-planner | `sonnet` | Strategy requires balanced reasoning |
| qa-writer | `sonnet` | Documentation quality matters |
| qa-engineer | `sonnet` | Test execution needs accuracy |

All QA agents typically use `sonnet` for balanced quality output.

### Agent Call Examples

```
# Test planning
Agent(
  subagent_type: "general-purpose",
  prompt: "Create comprehensive test plan for authentication feature following qa-planner guidelines",
  model: "sonnet"
)

# Test documentation
Agent(
  subagent_type: "general-purpose",
  prompt: "Document test cases for API endpoints following qa-writer guidelines",
  model: "sonnet"
)

# Test execution
Agent(
  subagent_type: "general-purpose",
  prompt: "Execute integration tests and report results following qa-engineer guidelines",
  model: "sonnet"
)
```

## Display Format

### Full QA Cycle

```
[Planning] Delegating to qa-planner...
  → Test plan created (15 scenarios)

[Documentation] Delegating to qa-writer...
  → 15 test cases documented

[Execution] Delegating to qa-engineer...
  → 13 passed, 2 failed

[Report] Generating summary...
  Coverage: 85%
  Pass Rate: 87%
  Defects: 2 (1 High, 1 Medium)

[Done] QA cycle completed
```

### Parallel Quality Analysis

```
[Analyzing] Spawning parallel analysis...

[Instance 1] strategy-analysis:sonnet → qa-planner
[Instance 2] results-analysis:sonnet → qa-engineer

[Progress] ████████████ 2/2

[Summary]
  Strategy: Coverage targets met, add edge cases
  Results: 85% pass rate, 2 critical defects

Analysis completed.
```

## Integration with Other Agents

- **Receives requirements from**: arch-speckit-agent (sw-architect)
- **Reports quality status to**: dev-lead
- **Coordinates with**: Language experts for automated tests
- **Provides feedback to**: Development team via dev-lead

## Metrics Tracking

QA lead routing should aggregate these metrics:

```yaml
metrics:
  test_coverage: percentage
  pass_rate: percentage
  defect_count: number
  defect_severity: [critical, high, medium, low]
  execution_time: duration
  test_case_count: number
```

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

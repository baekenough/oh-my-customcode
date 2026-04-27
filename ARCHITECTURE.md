# Architecture

> oh-my-customcode v0.74.0

## 1. System Overview

oh-my-customcode is a batteries-included agent harness for Claude Code. It ships 49 pre-built subagents, 115 skills, 22 governing rules, and a comprehensive hook system — all wired together so that any Claude Code session inherits a complete multi-agent operating model without additional configuration. The reference library ships 49 guide documents spanning agent design, best practices, and integration patterns. The core philosophy is: **"No expert? CREATE one, connect knowledge, and USE it."** When a task arrives with no matching specialist, the system auto-creates one by discovering relevant skills and guides, then immediately executes the task.

The harness operates on three engineering pillars — **Context Engineering** (what goes into the prompt), **Architectural Constraints** (rules that shape agent behavior), and **Entropy Management** (hooks, verification, and observability that keep the system coherent at scale).

Current version: **0.74.0** — distributed as `oh-my-customcode` on npm, CLI: `omcustom`.

---

## 2. High-Level Architecture

<p align="center">
  <img src="assets/diagrams/01-system-architecture.png" alt="System Architecture" width="800" />
</p>

### 2.1 Compilation Metaphor

oh-my-customcode treats agent harness authoring as a compilation problem. Skills, rules, and guides are "source code" that compiles into agent behavior at runtime. This metaphor drives several design decisions:

| Compilation Concept | Harness Equivalent |
|--------------------|--------------------|
| Source code | Skills (SKILL.md), Rules (.claude/rules/), Guides (guides/) |
| Compiler | Routing skills + mgr-creator (transforms specs into agent prompts) |
| Linker | Orchestrator (connects agent outputs into coherent workflows) |
| Runtime | Claude Code session (executes the compiled agent system) |
| Type checker | mgr-sauron (R017 verification — validates structural integrity) |
| Linter | Pre/PostToolUse hooks (advisory warnings, format enforcement) |
| Reverse compiler | omcustom-takeover skill (code to spec reverse compilation) |

The takeover pattern — reverse-compiling an existing codebase into structured specs that can then drive agent creation — is a core capability for onboarding new projects.

<p align="center">
  <img src="assets/diagrams/05-compilation-metaphor.png" alt="Compilation Metaphor" width="800" />
</p>

---

## 3. Component Inventory

### 3.1 Rule System (R000–R021, no R014)

| ID | Priority | Name | Description |
|----|----------|------|-------------|
| R000 | MUST | Language Policy | Korean I/O, English files, delegation model |
| R001 | MUST | Safety Rules | Prohibited actions, destructive-op gates |
| R002 | MUST | Permissions | Tool tier policy, file access scope |
| R003 | SHOULD | Interaction Rules | Response principles, status format |
| R004 | SHOULD | Error Handling | Error levels, recovery strategies |
| R005 | MAY | Optimization | Efficiency, token optimization |
| R006 | MUST | Agent Design | Agent file format, separation of concerns, soul identity |
| R007 | MUST | Agent Identification | Every response starts with agent header |
| R008 | MUST | Tool Identification | Every tool call includes agent+model prefix |
| R009 | MUST | Parallel Execution | 2+ independent tasks MUST run in parallel |
| R010 | MUST | Orchestrator Coordination | Orchestrator never writes files directly |
| R011 | SHOULD | Memory Integration | Native auto-memory + MCP supplementary, temporal decay |
| R012 | SHOULD | HUD Statusline | Real-time session status display |
| R013 | SHOULD | Ecomode | Task-type-aware context budget thresholds |
| R015 | MUST | Intent Transparency | Display routing reasoning before execution |
| R016 | MUST | Continuous Improvement | Rule violation -> update rule -> continue |
| R017 | MUST | Sync Verification | 5+3 round verification before push |
| R018 | MUST (conditional) | Agent Teams | Mandatory when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 |
| R019 | SHOULD | Ontology-RAG Routing | Enriches agent selection with contextual skill suggestions |
| R020 | MUST | Completion Verification | Task-type-specific verification before declaring [Done] |
| R021 | MUST | Enforcement Policy | Advisory-first enforcement model, promotion criteria |

### 3.2 Agent Taxonomy (49 agents)

| Category | Count | Agents |
|----------|-------|--------|
| SW Engineer / Language | 6 | lang-golang-expert, lang-python-expert, lang-rust-expert, lang-kotlin-expert, lang-typescript-expert, lang-java21-expert |
| SW Engineer / Backend | 6 | be-fastapi-expert, be-springboot-expert, be-go-backend-expert, be-express-expert, be-nestjs-expert, be-django-expert |
| SW Engineer / Frontend | 5 | fe-vercel-agent, fe-vuejs-agent, fe-svelte-agent, fe-flutter-agent, fe-design-expert |
| SW Engineer / Tooling | 4 | tool-npm-expert, tool-optimizer, tool-bun-expert, slack-cli-expert |
| Data Engineering | 6 | de-airflow-expert, de-dbt-expert, de-spark-expert, de-kafka-expert, de-snowflake-expert, de-pipeline-expert |
| Database | 4 | db-supabase-expert, db-postgres-expert, db-redis-expert, db-alembic-expert |
| Security | 1 | sec-codeql-expert |
| Architecture | 2 | arch-documenter, arch-speckit-agent |
| Infrastructure | 2 | infra-docker-expert, infra-aws-expert |
| QA | 3 | qa-planner, qa-writer, qa-engineer |
| Manager | 6 | mgr-creator, mgr-updater, mgr-supplier, mgr-gitnerd, mgr-sauron, mgr-claude-code-bible |
| System | 3 | sys-memory-keeper, sys-naggy, wiki-curator |
| **Total** | **48** | |

Each agent is defined in `.claude/agents/{name}.md` with YAML frontmatter specifying model, tools, skills, memory scope, and optional features (soul identity, escalation policy, isolation mode).

### 3.3 Skill Catalog (115 skills)

**Routing skills (4, context: fork)**

| Skill | Routes To |
|-------|-----------|
| secretary-routing | mgr-* and sys-* agents |
| dev-lead-routing | lang-*, be-*, fe-*, tool-*, db-*, arch-*, infra-* agents |
| de-lead-routing | de-* agents |
| qa-lead-routing | qa-* agents |

**Workflow/orchestration skills (6, context: fork)**

dag-orchestration, task-decomposition, worker-reviewer-pipeline, deep-plan, professor-triage, roundtable-debate

**Best-practices skills (~26)**

go-best-practices, go-backend-best-practices, python-best-practices, rust-best-practices, kotlin-best-practices, typescript-best-practices, java21-best-practices, react-best-practices, web-design-guidelines, fastapi-best-practices, springboot-best-practices, django-best-practices, flutter-best-practices, docker-best-practices, aws-best-practices, postgres-best-practices, supabase-postgres-best-practices, redis-best-practices, kafka-best-practices, dbt-best-practices, spark-best-practices, snowflake-best-practices, airflow-best-practices, pipeline-architecture-patterns, vercel-deploy, writing-clearly-and-concisely

**Slash command / user-invocable skills**

analysis, create-agent, update-docs, update-external, audit-agents, fix-refs, dev-review, dev-refactor, memory-save, memory-recall, monitoring-setup, npm-publish, npm-version, npm-audit, codex-exec, optimize-analyze, optimize-bundle, optimize-report, research, deep-plan, sauron-watch, structured-dev-cycle, omcustom-release-notes, omcustom-takeover, skill-extractor, lists, status, help, adversarial-review, ambiguity-gate, scout, professor-triage, release-plan, deep-verify, omcustom-workflow, omcustom-workflow-resume, improve-report, omcustom-feedback, omcustom-web, omcustom-loop, sdd-dev, harness-synthesizer

**System / internal skills**

intent-detection, model-escalation, stuck-recovery, result-aggregation, multi-model-verification, pr-auto-improve, memory-management, claude-code-bible, cve-triage, jinja2-prompts, skills-sh-search, reasoning-sandwich, evaluator-optimizer, systematic-debugging, workflow-runner, alembic-best-practices, action-validator, peer-messaging

### 3.4 Guide Library (49 topics)

| Category | Guides |
|----------|--------|
| Internal | claude-code, git-worktree-workflow, worktree-lifecycle, skill-bundle-design, agents-md-quality, hook-data-flow, multi-model-routing |
| Language | golang, python, rust, kotlin, typescript, java21 |
| Frontend | flutter, web-design |
| Backend | fastapi, springboot, go-backend, django-best-practices |
| Infrastructure | docker, aws |
| Data Engineering | airflow, dbt, kafka, spark, snowflake, iceberg |
| Database | supabase-postgres, postgres, redis, alembic, drizzle-orm |
| Design | impeccable-design |
| Writing | elements-of-style |
| Communication | slack-cli |
| Token Optimization | cc-token-saver |
| Web Scraping | web-scraping |

### 3.5 Hook System

The hook system provides cross-cutting concerns across all agent operations. Hooks are advisory-only by design: PostToolUse hooks record state, PreToolUse hooks advise, but neither blocks execution (except stage-blocker and dev-server tmux enforcement).

| Event | Scripts / Handlers | Purpose |
|-------|--------------------|---------|
| SessionStart | session-env-check.sh, stale-todo-scanner.sh | Detect codex CLI + Agent Teams availability; scan for stale TODOs |
| PreToolUse (Write/Edit) | stage-blocker.sh | Block writes outside implement stage |
| PreToolUse (Bash dev server) | inline script | Force dev servers into tmux |
| PreToolUse (Edit) | content-hash-validator.sh | Advisory staleness warning via content hash |
| PreToolUse (Write/Edit/Bash) | schema-validator.sh | Schema-based tool input validation (advisory) |
| PreToolUse (Agent/Task) | HUD display, git-delegation-guard.sh, agent-teams-advisor.sh, model-escalation-advisor.sh | Spawn display, R010 enforcement, R018 advisory, escalation advisory |
| PostToolUse (Edit TS/JS) | prettier, tsc, console.log detector | Auto-format + type-check JS/TS |
| PostToolUse (Edit Go) | gofmt | Auto-format Go files |
| PostToolUse (Edit Py) | ruff, ty | Auto-format + type-check Python |
| PostToolUse (Bash) | PR URL logger | Log PR URL after `gh pr create` |
| PostToolUse (Agent/Task) | task-outcome-recorder.sh | Record outcomes for model escalation |
| PostToolUse (Read) | content-hash-validator.sh | Store content hashes for staleness detection |
| PostToolUse (Bash/Read) | secret-filter.sh | Detect potential secrets in output (advisory) |
| PostToolUse (Edit/Write/Bash/Agent) | audit-log.sh | Append-only audit log for state-changing operations |
| PostToolUse (any tool) | context-budget-advisor.sh, stuck-detector.sh, cost-cap-advisor.sh | Ecomode advisory, loop detection, cost monitoring |
| PostCompact | compact-rules-reinforcement (inline) | Re-inject R007/R008/R009/R010/R018 identity and delegation rules after context compaction |
| SubagentStart | HUD inline display | Log agent type:model when subagent starts |
| SubagentStop | task-outcome-recorder.sh | Record final outcome |
| Stop | stop-console-audit.sh, eval-core-batch-save.sh, feedback-collector.sh, R011 prompt | Final audit, batch evaluation save, session feedback extraction and improvementActions insert, memory checkpoint |

#### Observability Hooks (Harness Engineering)

Four hooks form the observability backbone, added as part of the Harness Engineering adoption:

| Hook | Type | Description |
|------|------|-------------|
| audit-log.sh | PostToolUse | Append-only audit trail of all state-changing tool calls (Edit, Write, Bash, Agent). Writes to `/tmp/.claude-audit-$PPID.jsonl`. |
| secret-filter.sh | PostToolUse | Pattern-based detection of secrets (API keys, tokens, passwords) in Bash/Read output. Advisory warning only. |
| schema-validator.sh | PreToolUse | Validates tool input structure against expected schemas. Phase 1 advisory mode. |
| content-hash-validator.sh | Pre+PostToolUse | Stores MD5 hashes on Read, warns on Edit if file changed since last Read (stale edit detection). |

---

## 4. Orchestration Pattern

### 4.1 Singleton Orchestrator (R010)

The main conversation is the **sole orchestrator**. It coordinates via routing skills and the Agent tool. It NEVER writes or edits files directly — all file mutations are delegated to subagents. The only exception: Agent Teams members act as local orchestrators for their own sub-tasks and CAN spawn sub-agents.

<p align="center">
  <img src="assets/diagrams/02-orchestration-flow.png" alt="Orchestration Flow" width="800" />
</p>

### 4.2 Routing Architecture

<p align="center">
  <img src="assets/diagrams/03-routing-architecture.png" alt="Routing Architecture" width="800" />
</p>

### 4.3 Ontology-RAG Enrichment (R019)

After static routing selects an agent, the orchestrator optionally calls `get_agent_for_task(query)` via MCP to extract `suggested_skills`. These are prepended to the spawned agent's prompt as contextual hints. MCP failure is silently ignored — Ontology-RAG is advisory only and never blocks routing.

Known limitation: `context: fork` skills cannot access MCP tools, so `get_agent_for_task` in routing SKILL.md files is effectively dead letter. The call must be made at the orchestrator level before spawning the agent.

### 4.4 Dynamic Agent Creation

When routing detects no matching specialist:

<p align="center">
  <img src="assets/diagrams/04-dynamic-agent-creation.png" alt="Dynamic Agent Creation" width="800" />
</p>

### 4.5 Intent Detection (R015)

Intent is scored before routing is executed:

| Factor | Weight |
|--------|--------|
| Keywords | 40% |
| File patterns | 30% |
| Action verbs | 20% |
| Context (prior agent, cwd) | 10% |

| Confidence | Action |
|------------|--------|
| >= 90% | Auto-execute, display intent block |
| 70-89% | Request confirmation, show alternatives |
| < 70% | List options for user to choose |

### 4.6 Completion Verification (R020)

Before declaring any task `[Done]`, the orchestrator (or subagent) must verify completion against task-type-specific criteria. This prevents false completion declarations that erode trust and cause downstream failures.

| Task Type | Required Verification |
|-----------|----------------------|
| Release | All issues closed, version bumped, PR merged, GitHub Release created |
| Implementation | Code compiles/passes lint, tests pass, no TODO markers left |
| Documentation | Links valid, counts accurate, cross-references updated |
| Git Operations | Operation succeeded (check exit code), working tree clean |
| Code Review | All findings addressed or explicitly deferred |
| Agent/Skill Creation | Frontmatter valid, referenced skills exist, routing updated |

Complex tasks declare a **Completion Contract** upfront with specific, verifiable criteria, then report evidence for each criterion at completion.

---

## 5. Execution Patterns

### 5.1 Parallel Execution (R009)

Two or more independent tasks MUST run in parallel (max 4 concurrent). Sequential execution of parallelizable tasks is a rule violation.

```
Agent(task-1):sonnet   ┐
Agent(task-2):sonnet   ├─ Single message — all spawned together
Agent(task-3):haiku    │
Agent(task-4):haiku    ┘
```

Large tasks exceeding 3 minutes MUST be split into parallel sub-tasks. Before spawning 2+ agents, Agent Teams eligibility must be evaluated (see 5.2). Each parallel spawn includes a `[N]` prefix in the Agent `description` parameter for correlation with the Running display (R008).

### 5.2 Agent Teams (R018, conditional)

Active when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. When enabled and criteria are met, use is MANDATORY.

| Criteria | Agent Tool | Agent Teams (MUST) |
|----------|-----------|-------------------|
| 1-2 agents, independent | Yes | |
| 3+ agents | | Yes |
| Review -> fix -> re-review cycle | | Yes |
| Shared state / coordination needed | | Yes |
| Cost-sensitive batch ops | Yes | |

Lifecycle: `TeamCreate -> TaskCreate -> Agent(spawn all members in one message) -> SendMessage -> TaskUpdate -> TeamDelete`

Agent Teams members are peers, not hierarchical subagents. Members CAN spawn sub-agents via the Agent tool to execute complex workflows (R010 exception). This enables teams-compatible skills like `/research` and `/deep-plan` to run inside team members.

### 5.3 Evaluator-Optimizer Pattern

The evaluator-optimizer skill implements an iterative refinement loop:

```mermaid
flowchart LR
    G[Generator] --> E[Evaluator]
    E -->|Pass| D[Done]
    E -->|Fail + feedback| G
```

The generator produces output, the evaluator scores it against criteria, and failures loop back with specific feedback until quality thresholds are met. This pattern underpins code review cycles, agent creation validation, and research synthesis.

### 5.4 Research Pattern (/research)

10 research teams across 5 domains, executed in 3 batches per R009:

```
Batch 1: T1(Arch-breadth), T2(Arch-depth), T3(Sec-breadth), T4(Sec-depth)
Batch 2: T5(Intg-breadth), T6(Intg-depth), T7(Comp-breadth), T8(Comp-depth)
Batch 3: T9(Innov-breadth), T10(Innov-depth)

Phase 2: Cross-verification (2-5 rounds, opus + codex-exec)
Phase 3: Synthesis (opus) -> ADOPT / ADAPT / AVOID taxonomy
Phase 4: Structured report + GitHub issue
```

When Agent Teams is enabled, research teams run as team members with peer-to-peer messaging for cross-verification, rather than isolated subagents.

### 5.5 Deep Plan Pattern (/deep-plan)

Three-phase planning with research validation:

```
Phase 1: /research on the problem domain
Phase 2: Plan generation informed by research findings
Phase 3: Plan verification against research constraints
```

The deep-plan skill is teams-compatible (`teams-compatible: true` in frontmatter) and runs inside Agent Teams members when the feature is enabled.

### 5.6 Structured Development Cycle (/structured-dev-cycle)

Six-stage gated workflow:

```
Plan -> Verify -> Implement -> Verify -> Compound -> Done
```

The stage-blocker hook enforces Write/Edit restrictions outside the implement stage. Each stage transition requires explicit verification.

### 5.7 Reasoning Sandwich

The reasoning-sandwich skill structures prompts with context-instruction-context layering to maximize model attention on critical information. It is an internal skill used by routing and orchestration workflows to improve prompt effectiveness.

### 5.8 Workflow Engine (/omcustom:workflow)

<p align="center">
  <img src="assets/diagrams/09-workflow-engine.png" alt="Workflow Engine" width="800" />
</p>

YAML-defined workflow pipelines in `workflows/` directory. Each workflow defines sequential steps that invoke skills or actions.

Available workflows:
- `auto-dev` — Full-auto release pipeline: triage → plan → implement → verify → PR

Custom workflows can be defined by users in `workflows/` with any `^[a-z0-9-]+$` name.

### 5.9 Professor Triage (/professor-triage)

Analyzes GitHub issues directly against the current codebase. 5-phase workflow:
1. Collect `professor` labeled issues
2. Codebase analysis: search relevant code, assess impact, check if already resolved
3. Cross-analyze: common patterns, duplicates, priority matrix
4. Output: artifact report + mandatory issue comments
5. Act: auto-close resolved/duplicates, add priority labels

### 5.10 Release Plan (/release-plan)

Collects verify-done issues, groups by priority and size into release units. Generates structured release plan documents with implementation order and agent suggestions.

### 5.11 Autonomous Mode (R010)

When user signals full-delegation intent ("진행시켜", "알아서 해"), the orchestrator operates in lightweight mode: file write/edit delegation still required, but simple git operations and confirmation gates are relaxed.

---

## 6. Memory Architecture

### 6.1 Native Auto-Memory

Enabled by `memory:` field in agent frontmatter. The system creates a memory directory and injects the first 200 lines of `MEMORY.md` into the agent's system prompt.

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

### 6.2 Confidence-Tracked Memory

Memory entries carry confidence annotations to distinguish verified facts from hypotheses:

| Level | Tag | Lifecycle |
|-------|-----|-----------|
| High | `[confidence: high]` | Verified across sessions or confirmed by user |
| Medium | `[confidence: medium]` | Observed in 2+ sessions, not fully verified |
| Low | `[confidence: low]` | Single observation or hypothesis |

Promotion: `low -> medium` (observed again) -> `high` (user-confirmed). Demotion: contradicted by evidence -> demoted or removed.

### 6.3 Temporal Decay

Memory entries have an implicit temporal relevance. The system applies decay heuristics:

| Memory Type | Decay Rate | Rationale |
|-------------|-----------|-----------|
| Architecture decisions | Slow | Stable over months |
| Issue/PR status | Fast | Changes within hours/days |
| Version numbers | Fast | Updates every release |
| Behavioral patterns | Medium | Evolves over weeks |
| Key patterns | Slow | Structural knowledge persists |

Session-end updates by sys-memory-keeper re-evaluate temporal relevance: stale entries (e.g., closed issues still listed as open, outdated version numbers) are pruned or updated. The 200-line MEMORY.md budget enforces natural pruning pressure.

### 6.4 Behavioral Memory

An optional `## Behaviors` section in MEMORY.md tracks user interaction preferences and workflow patterns. Behaviors are user-specific and session-derived, distinct from soul identity defaults (R006). When behaviors conflict with soul defaults, behavioral memory takes precedence.

| Category | Examples |
|----------|---------|
| Communication | Verbosity preference, language, format |
| Workflow | Tool preferences, review habits, branching patterns |
| Domain priority | Security-first, performance-first, simplicity-first |

### 6.5 User Model

Introduced in v0.73.0. sys-memory-keeper maintains a structured `## User Model` section in MEMORY.md that tracks:

| Dimension | Tracked Data |
|-----------|-------------|
| Correction patterns | Recurring corrections the user makes to agent behavior |
| Skill preferences | Skills the user frequently invokes or explicitly prefers |
| Expertise profile | Domains where the user has demonstrated deep knowledge |

This structured model enables agents to anticipate user preferences rather than requiring repeated corrections across sessions. sys-memory-keeper updates the User Model at session end alongside the standard behavioral memory update.

### 6.6 MCP Memory (Supplementary)

MCP tools are orchestrator-scoped — subagents cannot access them.

| System | Tool | Use Case |
|--------|------|----------|
| claude-mem | `mcp__plugin_claude-mem_mcp-search__save_memory` | Cross-session search, temporal queries |

Episodic-memory auto-indexes conversations after session end — no manual action is needed. Use native auto-memory first; fall back to MCP only for cross-session search or temporal queries.

### 6.7 Session-End Flow

<p align="center">
  <img src="assets/diagrams/07-session-end-memory.png" alt="Session-End Memory Flow" width="800" />
</p>

MCP saves are non-blocking — failure does not prevent session end.

### 6.8 Agent Metrics and Skill Effectiveness Tracking

<p align="center">
  <img src="assets/diagrams/10-feedback-loop.png" alt="Feedback Analysis Loop" width="800" />
</p>

The task-outcome-recorder hook (PostToolUse + SubagentStop) records success/failure for each agent type and model combination. This data feeds two systems:

**Model Escalation (model-escalation-advisor.sh)**: When an agent type accumulates failures exceeding the configured threshold, the hook advises the orchestrator to escalate to a higher model (e.g., haiku -> sonnet -> opus). This is advisory-only — the orchestrator decides whether to accept.

**Skill Effectiveness**: Routing skills can correlate suggested skills with task outcomes to identify which skill combinations yield the highest success rates. This data accumulates in PPID-scoped temp files (`/tmp/.claude-task-outcomes-$PPID`) during a session and informs memory updates at session end.

<p align="center">
  <img src="assets/diagrams/08-metrics-observability.png" alt="Metrics and Observability" width="800" />
</p>

---

## 7. CI/CD Pipeline

<p align="center">
  <img src="assets/diagrams/06-cicd-pipeline.png" alt="CI/CD Pipeline" width="800" />
</p>

### 7.1 Quality Gates

| Gate | Tool / Script | Threshold |
|------|---------------|-----------|
| Code coverage | bun test --coverage | 98% |
| Version sync | manifest.json <-> package.json | Exact match |
| Docs validation | validate-docs.ts | README count consistency |
| Sauron verification | mgr-sauron (R017) | All 5+3 rounds pass |
| TypeScript | tsc --noEmit | Zero errors |
| Lint | biome check | Zero errors |
| Dependency audit | npm audit / security-audit.yml | No critical/high vulnerabilities |

### 7.2 CI Jobs

| Job | Workflow | Purpose |
|-----|----------|---------|
| Lint | ci.yml | biome check on source files |
| Test | ci.yml | bun test with coverage threshold |
| Rust Tests | ci.yml | cargo test for Rust components |
| Version Sync | ci.yml | manifest.json matches package.json |
| Template Sync | ci.yml | Verify template files match source, skill script file parity |
| Dependency Security Audit | security-audit.yml | Automated vulnerability scanning |
| Auto Tag | auto-tag.yml | Create version tag on release PR merge |
| Release Cleanup | release-cleanup.yml | Auto-close linked issues + delete release branches on merge |
| Daily Report | reusable-daily-report.yml | Scheduled issue/PR reporting |

---

## 8. Distribution Model

### 8.1 npm Package

```
Package: oh-my-customcode
CLI:     omcustom
Registry: registry.npmjs.org (public)

Exports:
  dist/         — compiled CLI + library
  templates/    — .claude/ directory structure for target projects
```

Runtime deps: commander, i18next, yaml. Build/runtime: bun. Node >=18 required.

npm publish is triggered only by the CI/CD pipeline on `release/*` branches — never run locally. Release workflow: create `release/*` branch + GitHub Release tag, CI handles the rest.

Version tagging is automated via `auto-tag.yml`: when a `release/*` PR is merged to `develop`, the workflow extracts the version from `package.json` and creates an annotated tag on the merge commit. `.npmrc` contains `git-tag-version=false` to prevent `npm version` from creating conflicting local tags.

### 8.2 Template System

`templates/` mirrors `.claude/` so that `omcustom` can scaffold agent systems into any project. `manifest.json` declares counts of agents, skills, hooks, contexts, and guides; CI enforces these counts match the filesystem. The `templates/.claude/hooks/` directory contains `hooks.json` plus a `scripts/` subdirectory — validators must use `.endsWith('.json')` filtering to count hooks correctly.

### 8.3 Packages

`packages/eval-core/` is a standalone SQLite-backed evaluation package introduced in v0.38.0. It provides session/turn/outcome collection for measuring agent performance outside the main harness runtime.

```
packages/eval-core/
  src/db/       — SQLite schema + migrations
  src/collect/  — session, turn, and outcome collectors
  src/query/    — aggregation and reporting queries
```

### 8.4 Init Wizard

The interactive setup flow at `src/cli/wizard.ts` guides first-time users through project initialization: selecting target language/framework, installing relevant agents and skills, and writing `.claude/` configuration. Invoked via `omcustom init`.

### 8.5 Takeover Pattern

The omcustom-takeover skill enables reverse compilation: analyzing an existing codebase and generating structured agent/skill specs from observed patterns. This is the primary onboarding mechanism for new projects that already have code but lack agent harness configuration.

### 8.6 Built-in Web UI (packages/serve/)

`packages/serve/` is a SvelteKit application providing a dashboard for inspecting agents, skills, guides, rules, and evaluations. Features include:
- Dashboard with analytics (session counts, success rates, top agents/skills)
- Project overview with resource counts
- Evaluations page with session summaries from eval-core SQLite
- Project selection via `?project=X` query parameter
- **Dependency graph** (`/graph`): D3.js force-directed interactive visualization of agent→skill→guide relationships with zoom, pan, drag, search, and type filters
- **Graph accessibility**: WCAG-compliant keyboard navigation (circular arrows, Enter/Space activation), aria-live announcements, skip link, focus-visible styling, prefers-reduced-motion support
- **Playwright E2E tests**: 11 accessibility tests with axe-core audit, `.pw.ts` extension for bun test isolation

---

## 9. Claude Code Compatibility

| Feature | < v2.1.63 | >= v2.1.63 | oh-my-customcode |
|---------|-----------|-----------|------------------|
| Subagent tool name | Task | Agent | Dual support (Agent/Task) |
| subagent_type field | Yes | Yes (unchanged) | Yes |
| Hook matcher | `tool == "Task"` | `tool == "Agent"` | `tool == "Task" \|\| tool == "Agent"` |
| SubagentStart event | No | Yes | Yes (v0.23.0+) |
| SubagentStop event | No | Yes | Yes (v0.23.0+) |
| Agent Teams | No | Yes (experimental) | Yes, enforced by R018 when enabled |
| Agent isolation/background | No | Yes | Yes (frontmatter: isolation, background) |
| Agent maxTurns | No | Yes | Yes (frontmatter: maxTurns) |
| Agent hooks | No | Yes | Yes (frontmatter: hooks) |
| Agent permissionMode | No | Yes | Yes (frontmatter: permissionMode) |
| PostCompact hook event | No | Yes (v2.1.72+) | Yes (v0.38.0+) — rules reinforcement after compaction |
| Skill effort frontmatter | No | Yes (v2.1.80+) | Yes (R006 documented) |
| Statusline rate_limits | No | Yes (v2.1.80+) | Yes (statusline.sh, R012) |
| source: 'settings' plugins | No | Yes (v2.1.80+) | Not adopted |
| --bare flag (skip hooks/skills/memory) | No | Yes (v2.1.81+) | Documented: harness fully disabled in bare mode (opt-in, zero impact on normal usage) |
| --channels permission relay | No | Yes (v2.1.81+) | Compatible — no changes required (opt-in UX feature) |
| CwdChanged/FileChanged hook events | No | Yes (v2.1.83+) | Yes (R006 documented) |
| managed-settings.d/ drop-in directory | No | Yes (v2.1.83+) | Yes (R006 documented) |
| Conditional hook `if` field | No | Yes (v2.1.85+) | Yes (R006 documented, permission rule syntax) |
| `defer` PreToolUse return | No | Yes (v2.1.89+) | Yes (R006 documented) — human-in-the-loop hook approval |
| `PermissionDenied` hook retry | No | Yes (v2.1.89+) | Yes (R006 documented) — `{retry: true}` response |
| `/powerup` interactive lessons | No | Yes (v2.1.90+) | Compatible — no changes required (opt-in UX feature) |
| `disableSkillShellExecution` | No | Yes (v2.1.91+) | Yes (R006 documented) — shell hardening option |
| MCP result size override 500K | No | Yes (v2.1.91+) | Compatible — MCP tools benefit from larger payloads |
| `forceRemoteSettingsRefresh` | No | Yes (v2.1.92+) | Compatible — enterprise policy setting |
| Effort default medium→high | No | Yes (v2.1.94+) | Yes (R006 documented) — agents use explicit effort field |
| `keep-coding-instructions` | No | Yes (v2.1.94+) | Yes (R006 documented) — plugin output style field |
| Plugin skill name from frontmatter | No | Yes (v2.1.94+) | Already compatible — omcustom uses `name:` frontmatter |
| `refreshInterval` statusline setting | No | Yes (v2.1.97+) | Yes (R012 documented) — auto-refresh interval for status line command |
| Bash tool permission hardening | No | Yes (v2.1.97+) | Compatible — security improvements, no action required |
| Monitor tool for background scripts | No | Yes (v2.1.98+) | Yes (R006 documented) — streaming events from background processes |
| Subprocess sandboxing (PID namespace) | No | Yes (v2.1.98+) | Yes (R006 documented) — `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, `CLAUDE_CODE_SCRIPT_CAPS` |
| Settings resilience (unknown hook events) | No | Yes (v2.1.101+) | Yes (R006 documented) — unrecognized hook event names no longer break settings.json |
| `/team-onboarding` command | No | Yes (v2.1.101+) | Compatible — opt-in UX feature, no changes required |
| EnterWorktree `path` parameter | No | Yes (v2.1.105+) | Compatible — switch into existing worktree |
| PreCompact hook block support | No | Yes (v2.1.105+) | Yes (R006 documented) — exit 2 / `{"decision":"block"}` |
| Plugin `monitors` manifest key | No | Yes (v2.1.105+) | Yes (R006 documented) — background monitors at session start |
| Skill description cap 250→1,536 chars | No | Yes (v2.1.105+) | Yes (R006 documented) — longer skill descriptions supported |
| `ENABLE_PROMPT_CACHING_1H` env var | No | Yes (v2.1.108+) | Compatible — opt-in prompt cache TTL control |
| Skill tool built-in command discovery | No | Yes (v2.1.108+) | Compatible — model can invoke `/init`, `/review`, `/security-review` via Skill tool |
| `/recap` session context feature | No | Yes (v2.1.108+) | Compatible — opt-in session recap |
| `/undo` alias for `/rewind` | No | Yes (v2.1.108+) | Compatible — command alias, no changes required |
| `/tui` command + `tui` setting | No | Yes (v2.1.110+) | Compatible — opt-in fullscreen rendering |
| PushNotification tool | No | Yes (v2.1.110+) | Yes (R002 documented) — mobile push via Remote Control |
| `autoScrollEnabled` config | No | Yes (v2.1.110+) | Compatible — opt-in fullscreen scroll setting |
| `TRACEPARENT`/`TRACESTATE` env vars | No | Yes (v2.1.110+) | Compatible — opt-in distributed trace linking |
| Bash tool max timeout enforcement | No | Yes (v2.1.110+) | Compatible — enforces documented max timeout |
| Write tool IDE diff feedback | No | Yes (v2.1.110+) | Compatible — informs model when user edits proposed content |
| `--resume`/`--continue` scheduled task resurrection | No | Yes (v2.1.110+) | Compatible — resurrects unexpired scheduled tasks |
| `/focus` command | No | Yes (v2.1.110+) | Compatible — focus view separated from Ctrl+O |
| `xhigh` effort level | No | Yes (v2.1.111+) | Yes (R006 documented) — Opus 4.7 exclusive, other models fall back to `high` |
| `/effort` interactive slider | No | Yes (v2.1.111+) | Compatible — arrow-key navigation when called without arguments |
| Auto mode without `--enable-auto-mode` | No | Yes (v2.1.111+) | Compatible — auto mode available by default for Max subscribers |
| PowerShell tool | No | Yes (v2.1.111+) | Yes (R002 documented) — progressive rollout, `CLAUDE_CODE_USE_POWERSHELL_TOOL` env var |
| Read-only bash glob no permission prompt | No | Yes (v2.1.111+) | Compatible — `ls *.ts` and `cd <dir> &&` prefixed commands skip permission prompt |
| `/less-permission-prompts` built-in skill | No | Yes (v2.1.111+) | Compatible — scans transcripts for common read-only tool calls |
| `/ultrareview` parallel code review | No | Yes (v2.1.111+) | Compatible — cloud-based multi-agent analysis and critique |
| `/skills` token count sorting | No | Yes (v2.1.111+) | Compatible — press `t` to sort skills by estimated token count |
| `OTEL_LOG_RAW_API_BODIES` env var | No | Yes (v2.1.111+) | Compatible — full API request/response body logging |
| Plan files named after prompt | No | Yes (v2.1.111+) | Compatible — plan files use prompt-derived names instead of random words |
| Plugin error handling improvements | No | Yes (v2.1.111+) | Compatible — dependency conflict errors, stale version recovery, install recovery |
| Opus 4.7 auto mode fix | No | Yes (v2.1.112+) | Compatible — hotfix for "claude-opus-4-7 is temporarily unavailable" |
| sandbox.network.deniedDomains | No | Yes (v2.1.113+) | Compatible — domain blocking within allowedDomains wildcards |
| Subagent 10-min stall timeout | No | Yes (v2.1.113+) | Compatible — mid-stream stall detection with auto-fail |
| Bash `find -exec`/`-delete` deny | No | Yes (v2.1.113+) | Compatible — no longer auto-approved under `Bash(find:*)` allow rules |
| Bash deny exec wrapper matching | No | Yes (v2.1.113+) | Compatible — deny rules match `env`/`sudo`/`watch`/`ionice`/`setsid` wrappers |
| Native binary spawning | No | Yes (v2.1.113+) | Compatible — per-platform optional dependency replaces bundled JavaScript |
| `/loop` Esc cancel | No | Yes (v2.1.113+) | Compatible — Esc now cancels pending wakeups |

Tested and compatible with Claude Code v2.1.72 through v2.1.114+.

---

## 10. Context Budget

| Item | Approximate Size |
|------|-----------------|
| CLAUDE.md | ~5K tokens |
| Rules (21 files) | ~28K tokens |
| Total mandatory load | ~33K tokens / session |

Skills and guides are loaded on-demand when invoked — not pre-loaded. The `context: fork` designation (10 active, 12 cap) provides isolated context for routing and orchestration skills, preventing skill execution from consuming the main conversation's context.

**Ecomode (R013)** auto-activates based on task type and context usage:

| Task Type | Context Trigger |
|-----------|----------------|
| Research (/research, 10-team) | 40% |
| Implementation (code generation) | 50% |
| Review (code review, audit) | 60% |
| Management (git, deploy, CI) | 70% |
| General (default) | 80% |

The `context-budget-advisor.sh` PostToolUse hook monitors usage and emits advisory warnings as thresholds are approached. The `cost-cap-advisor.sh` hook provides complementary cost monitoring, warning when session cost approaches configurable limits.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| Orchestrator | The main Claude Code conversation; the sole coordinator. Never writes files. |
| Subagent | An isolated agent instance spawned by the orchestrator via the Agent tool. |
| Routing skill | A `context: fork` skill that maps user intent to the correct specialist agent. |
| Agent Teams | Claude Code experimental feature (R018) enabling peer-to-peer agent messaging via TeamCreate/SendMessage. |
| Hook | A script bound to a Claude Code lifecycle event (PreToolUse, PostToolUse, etc.) in hooks.json. |
| Native auto-memory | The `memory:` frontmatter field that injects MEMORY.md into an agent's context each session. |
| Dynamic creation | The fallback pattern where mgr-creator auto-builds a new specialist when no existing agent matches. |
| Ecomode | Compact output mode that activates automatically when context usage exceeds task-type thresholds. |
| context: fork | A SKILL.md frontmatter flag that runs the skill in an isolated context — used for routing and orchestration skills (10 active, 12 cap). |
| R017 (Sauron) | The 5-round manager + 3-round deep-review verification cycle required before any structural push. |
| Compilation metaphor | The conceptual framework treating skill/rule authoring as source code that compiles into agent behavior. |
| Takeover | Reverse compilation — analyzing existing code to generate structured agent/skill specs. |
| Completion contract | An upfront declaration of verifiable criteria that must be satisfied before declaring a task done (R020). |
| Temporal decay | Memory heuristic where entries lose relevance over time; fast-changing data (issues, versions) decays faster than structural knowledge. |
| Soul identity | Optional per-agent personality layer (`.claude/agents/souls/{name}.soul.md`) that separates communication style from capabilities. |
| Harness Engineering | The three-pillar framework (Context Engineering, Architectural Constraints, Entropy Management) underlying the agent harness design. |
| Advisory hook | A hook that warns or suggests but never blocks execution — the dominant hook pattern in oh-my-customcode. |
| Skill effectiveness | The correlation of skill combinations with task outcomes to identify high-success-rate patterns. |
| Model escalation | Advisory mechanism that suggests upgrading an agent's model after repeated failures (haiku -> sonnet -> opus). |
| PostCompact hook | A Claude Code lifecycle event (v2.1.72+) that fires after context compaction; used to re-inject critical rules. |
| eval-core | Standalone `packages/eval-core/` package providing SQLite-backed session/turn/outcome collection for offline evaluation. |
| Init wizard | Interactive first-run setup flow (`omcustom init`) that configures `.claude/` for a new project. |
| User Model | Structured section in MEMORY.md maintained by sys-memory-keeper; tracks correction patterns, skill preferences, and expertise profile across sessions (v0.73.0+). |
| skill-extractor | The 100th skill; analyzes recorded task trajectories to propose reusable SKILL.md candidates from successful patterns. |
| omcustom sync | CLI command that compares current `.claude/` state against a lockfile to detect configuration drift; can export team snapshots via `--export`. |

---

## 12. Version History

| Version | Key Changes |
|---------|-------------|
| v0.79.0 | CC v2.1.89-v2.1.96 compat; effort default change docs; defer PreToolUse; disableSkillShellExecution; cc-release-collector CronJob; rule-deletion-guard hook |
| v0.80.0–v0.88.1 | Registry isolation; omcustom update self-update + re-exec; Rule safety expansion (R020/R015/R011) |
| v0.89.0 | CC v2.1.97-v2.1.108 compat; prompt caching 1h TTL env vars; Skill tool built-in command discovery; /recap session context; compat table expansion (v2.1.97-v2.1.108 14 rows) |
| v0.90.0 | CC v2.1.110 compat; PushNotification tool (R002); /tui fullscreen; /focus command; autoScrollEnabled; TRACEPARENT/TRACESTATE; Bash max timeout enforcement; Write tool IDE diff feedback; --resume scheduled task resurrection; compat table expansion (v2.1.110 8 rows) |
| v0.99.1 | bypassPermissions enforcement + /idea skill (#926, #930) | 0 | 1 | 0 | 0 |
| v0.99.0 | auto-dev pipeline CI-mimic local verification (#927) | 0 | 0 | 0 | 0 |
| v0.98.0 | OpenHarness patterns internalization (#922); PreCompact hook for task state serialization before compaction; PostCompact task state restoration; multi-provider-exec guide (38th guide); guides count 38→39 |
| v0.97.1 | hada-scout v2.0 LLM pre-scout filtering (#912); keyword regex→haiku LLM pre-scoring; false positive 30-40%→5-10%; user-invocable; scope package→core |
| v0.97.0 | ouroboros PR #353 capability graph pattern integration; action-validator capability hints (safety/parallel/approval); reasoning-sandwich Opus 4.7 considerations; R005 capability-aware tool scheduling; auto-dev pipeline v2.0.0 |
| v0.96.0 | CC v2.1.113-v2.1.114 compat; sandbox.network.deniedDomains; subagent stall timeout; find -exec deny; R006 Note 6 items; compat table expansion (v2.1.113-v2.1.114 6 rows) |
| v0.95.0 | Rules context token optimization (#889); PostCompact R001/R002 security gap fix; R006 Hook Event Types HTML comment; 8 rules HTML comment application; CLAUDE.md command table simplification |
| v0.94.0 | cc-release-monitor workflow and infra/cc-release-collector removal (Airflow DAG migration); geeknews-scout README cross-reference fix |
| v0.93.0 | Airflow 3.1.8 agent/skill/guide update (airflow.sdk imports, TaskFlow API, AIP-72/AIP-44, Asset replaces Dataset, dag.test()) |
| v0.92.0 | cc-token-saver plugin integration guide (37th guide); harness-synthesizer skill (106th skill, AutoHarness-inspired verifier/filter/policy generation); R012 external plugin statusline conflict section; R013 Token Guardian coexistence section; action-validator Code Harness Integration section |
| v0.91.0 | CC v2.1.111-v2.1.112 compat; xhigh effort level + Opus 4.7 model alias (R006); PowerShell tool (R002); /ultrareview built-in; /less-permission-prompts built-in; read-only bash glob permission skip; compat table expansion (v2.1.111-v2.1.112 12 rows) |
| v0.74.0 | `omcustom sync` (drift detection + team snapshot export); `omcustom init --from-snapshot` (team reproducibility); `analysis --interview` mode; Release cleanup automation (auto-close issues + delete branches on merge) |
| v0.73.0 | skill-extractor (100th skill — task trajectory analysis for SKILL.md candidates); User Model in R011 + sys-memory-keeper (correction patterns, skill preferences, expertise profile); agentskills.io source in skills-sh-search |
| v0.72.1 | sync-server-repo.yml dead workflow removal (customclaw server decommissioned 2026-03-18) |
| v0.72.0 | Korean template unification for 4 analysis skills (scout, professor-triage, release-plan, post-release-followup); professor-triage v2.2.0 |
| v0.71.0 | workflow→pipeline migration (3 skills deleted + 1 pipeline installed); /omcustom:claude-native skill; pr-analysis.yml deleted (last Airflow workflow removed); Skills 100→99→100 |
| v0.70.0 | codex-installer.ts; SessionStart auto-update hook; omcustom-feedback Airflow dead code removal; DI pattern refactor; coverage 98% |
| v0.69.0 | professor-triage v2.1 multi-perspective analysis (Phase 4A-4F); Codex CLI v0.117.0; /scout skill integration |
| v0.68.0–v0.68.2 | CC v2.1.88 compat; RTK PreToolUse auto-intercept; PermissionDenied hook event (20th); phantom version guard; RTK auto-install in init/update/doctor |
| v0.67.0 | rtk-exec skill; RTK CLI proxy integration; 100 skills milestone |
| v0.66.0 | gemini-exec skill for native Gemini CLI execution |
| v0.65.0–v0.65.2 | Hook Registry Expansion (7→14 events); CC Feature Integration (CLI flags, OTel monitoring); CC v2.1.87 compat; auto-dev pre-triage step; TypeScript 6.0 upgrade |
| v0.64.0–v0.64.3 | R002 Tool Modernization (9→30 tools, 4→6 tiers); R006 Frontmatter Sync (7 new skill fields); agent guardrails (maxTurns, limitations, disallowedTools); permissionMode tier-based adoption; Anthropic harness design internalization |
| v0.63.0–v0.63.1 | Chroma Context-1 internalize; R013 Input Context Pruning; skill metadata consistency (34 skills user-invocable); R002 Tool Modernization prep |
| v0.62.5 | Playwright accessibility E2E tests for graph page (11 tests, axe-core audit) |
| v0.62.4 | Graph circular keyboard nav, aria-live announcements, skip link, focus-visible styling |
| v0.62.3 | Graph keyboard accessibility, zoom-responsive labels, tooltip clamping |
| v0.62.0–v0.62.2 | D3 force-directed dependency graph; CI lockfile-sync gate; R016 defect response matrix; installer config.version fix |
| v0.61.0 | Permission Mode Guidance R006; CLI self-update check |
| v0.60.0–v0.60.1 | CC v2.1.83-85 compat; action-validator + peer-messaging skills; monitoring-setup Inspector |
| v0.59.0–v0.59.1 | HTML comment token optimization (CLAUDE.md 550→286 lines, 10 rules); professor-triage Phase 5B mandatory |
| v0.58.5–v0.58.6 | CI template-sync validation; test suite expansion; CLAUDE.md dedup 48% reduction |
| v0.58.4 | Documentation sync to v0.58.4 |
| v0.58.3 | feedback-collector fix, cost-cap-advisor TSV, updater.ts CRLF |
| v0.58.2 | RL/WL renewal countdown in statusline |
| v0.58.1 | post-release-followup skill, auto-dev workflow 7th step |
| v0.58.0 | Impeccable AI design language (fe-design-expert, 4 guides) |
| v0.57.0 | `omcustom update --hard`, `/omcustom:auto-improve`, Epic #535 completion |
| v0.56.0 | PostCompact R000 enforcement, workflow --list |
| v0.55.0 | Statusline WL segment, eraser workflow |
| v0.54.0 | ARCHITECTURE.md full synchronization, Eraser diagrams |
| v0.53.1 | Auto-tagging fix (.npmrc git-tag-version=false); /omcustom:workflow rename; custom workflow templates |
| v0.53.0 | Dashboard All Projects removal; project detail view; eval-core DB connection for evaluations; user feedback integration (#562) |
| v0.52.0 | Feedback collector hook; routing miss analysis; /omcustom:improve-report; R018 scope constraint |
| v0.51.0–v0.51.2 | /scout skill; Agent Teams first usage; R018 advisor batch detection; dashboard cleanup |
| v0.50.0 | Lockfile-based smart protection for omcustom update; systematic-debugging skill |
| v0.49.0 | Workflow engine (/omcustom:workflow); workflow-runner; auto-dev.yaml |
| v0.48.0–v0.48.5 | 20-issue deep fix (Drizzle, group_concat, busy_timeout); /professor-triage; /release-plan; stale-todo-scanner; bypassPermissions advisory |
| v0.47.0–v0.47.2 | Built-in Web UI improvements; orphan server fix; downgrade prevention; version display unification |
| v0.44.0–v0.46.1 | Sidebar/dashboard/evaluations; Autonomous Mode; feedback skill; SDD; ambiguity-gate; CC v2.1.80 compat; multi-project Web UI |
| v0.43.0 | Built-in Web UI (packages/serve SvelteKit) |
| v0.42.0–v0.42.3 | Mermaid fixes; jq guard; Stop hook; Dependabot; R021 enforcement policy |
| v0.39.0–v0.41.0 | Adversarial review; Rust CLI components |
| v0.38.0 | PostCompact hook (R007/R008/R009/R010/R018 reinforcement after compaction); eval-core package (`packages/eval-core/` SQLite session/turn/outcome collection); init wizard (`src/cli/wizard.ts`); context:fork cap raised 10→12 (11 active); hook system cleanup; template full sync; Claude Code v2.1.72–v2.1.76 compatibility |
| v0.37.0–v0.37.3 | Structure Optimization: rule compression, skill compression, agent-skill wiring, hook optimization, routing compression, domain gating |
| v0.36.0–v0.36.1 | Harness Engineering (26 issues): R020, security hooks, tool reduction, frontmatter extensions, reasoning-sandwich, omcustom-takeover, sauron structural linting, memory temporal decay, agent metrics, skill effectiveness; /omcustom:release-notes |
| v0.35.x | Cost monitoring, pre-flight guards, Agent Teams compatibility (R010 Teams exception), episodic-memory session-end fix |
| v0.34.0 | Evaluator-optimizer, workflow-patterns, stuck-detector hard-block, pre-flight guards |
| v0.30.0–v0.33.x | deep-plan skill, structured-dev-cycle, confidence-tracked memory, context budget, drift detection |

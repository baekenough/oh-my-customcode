---
name: deep-plan
description: Research-validated planning — research → plan → verify cycle for high-confidence implementation plans
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<topic-or-issue>"
---

# Deep Plan Skill

Research-validated planning that eliminates the gap between research assumptions and actual code. Orchestrates a 3-phase cycle: Discovery Research → Reality-Check Planning → Plan Verification.

**Orchestrator-only** — only the main conversation uses this skill (R010). All phases execute as subagents.

## Usage

```
/deep-plan <topic-or-issue>
/deep-plan "implement caching layer for API responses"
/deep-plan #325 new authentication system
/deep-plan Rust async runtime migration
```

## Problem Solved

Research-only analysis (like `/research`) produces findings based on assumptions about the codebase. These assumptions often diverge from reality:

| Assumption | Reality | Impact |
|------------|---------|--------|
| "Feature X is missing" | Already implemented | Wasted effort on duplicate work |
| "Pattern Y is needed" | Partially exists | Over-engineering existing code |
| "Library Z is required" | Already a dependency | Unnecessary integration effort |

`/deep-plan` solves this by cross-referencing research findings against actual code before committing to a plan.

## Architecture — 3 Phases

### Phase 1: Discovery Research

Invoke the `/research` skill internally for comprehensive topic analysis.

```
Phase 1: Discovery Research
├── Skill(research, args="<topic>")
├── 10-team parallel analysis (3 batches × 4/4/2)
├── Cross-verification loop (opus + codex)
├── ADOPT / ADAPT / AVOID taxonomy
└── Output: research report (artifact)
```

**Execution**: Delegates to `/research` skill via `Skill(research, args="<topic>")`. The orchestrator waits for completion before proceeding to Phase 2.

**Output**: Full research report with ADOPT/ADAPT/AVOID taxonomy.

### Phase 2: Reality-Check Planning

Ground-truth the research findings against the actual codebase.

```
Phase 2: Reality-Check Planning
├── EnterPlanMode
├── Explore agents (up to 3 parallel)
│   ├── Explore 1: Verify ADOPT items exist/don't exist
│   ├── Explore 2: Check ADAPT items for current state
│   └── Explore 3: Validate AVOID alternatives
├── Gap analysis table
├── Refined plan (real gaps only)
└── ExitPlanMode → user approval
```

**Steps**:

1. **Enter Plan Mode**: `EnterPlanMode` to activate planning context
2. **Codebase Exploration**: Spawn up to 3 Explore agents in parallel to verify research assumptions:
   - Each ADOPT item: Does it already exist? Partially implemented?
   - Each ADAPT item: What is the current state to adapt from?
   - Each AVOID item: Are the alternatives already available?
3. **Gap Analysis**: Build a reconciliation table:

   ```
   | Research Finding | Actual Code State | Gap Type | Action |
   |-----------------|-------------------|----------|--------|
   | "No caching"    | Redis client exists | Overestimate | Remove from plan |
   | "Need auth middleware" | No auth layer | Real gap | Keep in plan |
   | "Migrate to v3" | Already on v3.1 | Overestimate | Remove from plan |
   | "Add rate limiting" | Basic limiter exists | Partial gap | Adapt existing |
   ```

4. **Refined Plan**: Write implementation plan containing ONLY real gaps:
   - Remove overestimates (already implemented)
   - Adjust partial gaps (adapt, don't rebuild)
   - Prioritize real gaps by impact
5. **User Approval**: `ExitPlanMode` presents the refined plan for user review

### Phase 3: Plan Verification Research

Validate the refined plan with focused research before implementation begins.

```
Phase 3: Plan Verification Research
├── 3-team focused verification
│   ├── T1: Technical feasibility
│   ├── T2: Conflict/duplication check
│   └── T3: Test strategy & risk
├── Verdict: PASS or REVISE
├── PASS → implementation advisory
└── REVISE → return to Phase 2
```

**Teams** (3 parallel, NOT full 10-team):

| Team | Focus | Verifies |
|------|-------|----------|
| T1 | Technical feasibility | Can the plan be implemented with current stack/deps? |
| T2 | Conflict & duplication | Does the plan conflict with in-flight work or duplicate existing code? |
| T3 | Test strategy & risk | Is the plan testable? What are the failure modes? |

**Model selection**: sonnet for teams, opus for synthesis.

**Verdict**:
- **PASS**: Plan is verified. Display implementation advisory.
- **REVISE**: Issues found. Return to Phase 2 with feedback for plan refinement.
- **REVISE limit**: After 2 REVISE cycles, escalate to user for manual judgment.

## Workflow Diagram

```
User: /deep-plan "topic"
  │
  ├─ Phase 1: Discovery Research
  │   ├─ Skill(research, args="topic")
  │   ├─ 10-team analysis → ADOPT/ADAPT/AVOID
  │   └─ Output: research artifact
  │
  ├─ Phase 2: Reality-Check Planning
  │   ├─ EnterPlanMode
  │   ├─ Explore agents (up to 3 parallel)
  │   ├─ Gap analysis: research vs actual code
  │   ├─ Refined plan (real gaps only)
  │   └─ ExitPlanMode → user approval
  │
  └─ Phase 3: Plan Verification
      ├─ 3-team focused research
      ├─ Verdict: PASS or REVISE
      ├─ PASS → implementation advisory
      └─ REVISE → loop back to Phase 2 (max 2 cycles)
```

## Differentiation

| Skill | Scope | Code Verification | Phases |
|-------|-------|-------------------|--------|
| `/research` | Analysis only | None — assumption-based | 1 |
| Plan mode | Planning only | Yes — code exploration | 1 |
| `/structured-dev-cycle` | Full implementation | Yes — stage-by-stage | 6 |
| **`/deep-plan`** | **Analysis + Planning + Verification** | **3-pass cross-verification** | **3** |

`/deep-plan` fills the gap between research (which lacks code grounding) and implementation (which lacks upfront analysis). It produces a **verified plan** ready for execution.

## Display Format

Before execution:
```
[Deep Plan] {topic}
├── Phase 1: Discovery Research (10 teams, 3 batches)
├── Phase 2: Reality-Check Planning (up to 3 Explore agents)
└── Phase 3: Plan Verification (3 focused teams)

Estimated phases: 3 | Models: sonnet → opus
Execute? [Y/n]
```

Phase transitions:
```
[Deep Plan] Phase 1/3 — Discovery Research
├── Research skill active...
└── Awaiting 10-team results

[Deep Plan] Phase 2/3 — Reality-Check Planning
├── Gap analysis: 6 ADOPT items → 2 real gaps, 4 overestimates
└── Refined plan: 5 action items (down from 12)

[Deep Plan] Phase 3/3 — Plan Verification
├── T1 (feasibility): ✓ PASS
├── T2 (conflicts): ✓ PASS
├── T3 (test/risk): ✓ PASS
└── Verdict: PASS — ready for implementation
```

## Post-Completion Advisory

After PASS verdict:
```
[Advisory] Verified plan ready for implementation.
├── For complex implementations (10+ files): /structured-dev-cycle
├── For parallel task execution: subagent-driven-development
└── For simple tasks (< 3 files): proceed directly
```

## Execution Rules

| Rule | Detail |
|------|--------|
| Phase 1 | Full `/research` skill invocation (10 teams) |
| Phase 2 | Max 3 parallel Explore agents (R009) |
| Phase 3 | Max 3 parallel verification teams (R009) |
| Orchestrator only | Main conversation manages all phases (R010) |
| Intent display | Show phase plan before execution (R015) |
| Ecomode | Auto-activate for team result aggregation (R013) |
| REVISE limit | Max 2 cycles before user escalation |

## Model Selection

| Phase | Component | Model | Rationale |
|-------|-----------|-------|-----------|
| Phase 1 | Research teams | sonnet | Delegated to /research skill |
| Phase 1 | Verification | opus | Delegated to /research skill |
| Phase 2 | Explore agents | haiku | Fast codebase search |
| Phase 2 | Gap analysis | opus | Complex reconciliation reasoning |
| Phase 3 | Verification teams | sonnet | Balanced analysis |
| Phase 3 | Synthesis/verdict | opus | Final judgment |

## Integration

| Component | Integration |
|-----------|-------------|
| `/research` | Phase 1 full invocation + Phase 3 reduced invocation pattern |
| EnterPlanMode/ExitPlanMode | Phase 2 plan creation and user approval |
| Explore agents | Phase 2 codebase verification (up to 3 parallel) |
| R009 | Phase 1 (10 teams batched), Phase 2 (3 Explore), Phase 3 (3 teams) |
| R010 | Orchestrator manages all 3 phases; teams are subagents |
| R013 | Ecomode for team result aggregation |
| R015 | Phase transition intent display |
| result-aggregation | Phase 1 and 3 result formatting |
| subagent-driven-development | Post-PASS implementation advisory |

## Fallback Behavior

| Scenario | Fallback |
|----------|----------|
| Phase 1 `/research` fails | Manual analysis, then proceed to Phase 2 |
| Phase 2 EnterPlanMode unavailable | Perform analysis without plan mode context |
| Phase 3 REVISE ≥ 2 times | Escalate to user for manual judgment |
| Explore agent failure | Reduce parallel count, retry with remaining |
| Partial team failure | Synthesize from available results, note gaps |

## Artifact Persistence

Phase 1 research artifact is persisted by the `/research` skill.

Phase 3 verification report is persisted by the final synthesis agent:
```
.claude/outputs/sessions/{YYYY-MM-DD}/deep-plan-{HHmmss}.md
```

With metadata header:
```markdown
---
skill: deep-plan
date: {ISO-8601 with timezone}
query: "{original user query}"
phases_completed: 3
verdict: PASS|REVISE
---
```

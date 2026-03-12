---
name: research
description: 10-team parallel deep analysis with cross-verification for any topic, repository, or technology. Use when user invokes /research or asks for comprehensive research.
user-invocable: true
---

# Research Skill

Orchestrates 10 parallel research teams for comprehensive deep analysis of any topic, GitHub repository, or technology. Produces a structured report with ADOPT/ADAPT/AVOID taxonomy.

**Orchestrator-only** — only the main conversation uses this skill (R010). Teams execute as subagents.

## Usage

```
/research <topic-or-url>
/research https://github.com/user/repo
/research "distributed consensus algorithms"
/research Rust async runtime comparison
```

## Architecture — 4 Phases

### Phase 1: Parallel Research (10 teams, batched per R009)

Teams operate in breadth/depth pairs across 5 domains:

| Pair | Domain | Team | Role | Focus |
|------|--------|------|------|-------|
| 1 | Architecture | T1 | Breadth | Survey, catalog, enumerate structure |
| | | T2 | Depth | Deep-dive patterns, validate assumptions |
| 2 | Security | T3 | Breadth | Vulnerability scan, attack surface enumeration |
| | | T4 | Depth | Exploit validation, risk quantification |
| 3 | Integration | T5 | Breadth | Compatibility mapping, dependency analysis |
| | | T6 | Depth | Effort estimation, value assessment |
| 4 | Comparative | T7 | Breadth | Alternative survey, market landscape |
| | | T8 | Depth | Feature comparison, benchmark data |
| 5 | Innovation | T9 | Breadth | Novel pattern identification, idea extraction |
| | | T10 | Depth | Feasibility validation, adaptation design |

**Batching order** (max 4 concurrent per R009):
```
Batch 1: T1, T2, T3, T4    (Architecture + Security)
Batch 2: T5, T6, T7, T8    (Integration + Comparative)
Batch 3: T9, T10            (Innovation)
```

### Phase 2: Cross-Verification Loop (min 2, max 30 rounds)

```
Team findings ──→ opus 4.6 verification ──→ codex-exec xhigh verification
       │                                              │
       └── Contradiction detected? ── YES ──→ Round N+1
                                      NO  ──→ Consensus reached → Phase 3
```

Each round:
1. **opus 4.6**: Deep reasoning verification — checks logical consistency, identifies gaps, challenges assumptions
2. **codex-exec xhigh** (if available): Independent code-level verification — validates technical claims, tests feasibility
3. **Contradiction resolution**: Reconcile divergent findings between teams and verifiers
4. **Convergence check**: All major claims verified with no outstanding contradictions → proceed

Convergence expected by round 3. Hard stop at round 30.

### Phase 3: Synthesis

1. Cross-team gap analysis — identify areas no team covered
2. Unified priority ranking — weight findings by confidence and impact
3. ADOPT / ADAPT / AVOID taxonomy generation

### Phase 4: Output

1. Structured markdown report (see Output Format below)
2. GitHub issue auto-created with findings
3. Action items with effort estimates

## Execution Rules

| Rule | Detail |
|------|--------|
| Max parallel teams | 4 concurrent (R009) |
| Batching | T1-T4 → T5-T8 → T9-T10 |
| Agent Teams gate | If enabled, use for cross-team coordination (R018) |
| Orchestrator only | Main conversation manages all phases (R010) |
| Ecomode | Auto-activate for team result aggregation (R013) |
| Intent display | Show research plan before execution (R015) |

## Model Selection

| Phase | Model | Rationale |
|-------|-------|-----------|
| Phase 1 (Research teams) | sonnet | Balanced speed/quality for parallel research |
| Phase 2 (opus verification) | opus | Deep reasoning for cross-verification |
| Phase 2 (codex verification) | codex xhigh | Code-level validation of technical claims |
| Phase 3 (Synthesis) | opus | Complex multi-source reasoning and taxonomy |

## Team Prompt Templates

### Breadth Teams (T1, T3, T5, T7, T9)

```
Role: {domain} breadth analyst
Scope: {topic}

Tasks:
1. Survey the full landscape of {focus area}
2. Catalog all {artifacts/components/alternatives} found
3. Enumerate {structure/surface/compatibility/options/patterns}
4. Produce structured inventory with confidence levels

Output format:
- Inventory table (item | description | confidence)
- Coverage map (what was examined vs what remains)
- Key observations (max 5)
- Questions for depth team
```

### Depth Teams (T2, T4, T6, T8, T10)

```
Role: {domain} depth analyst
Scope: {topic}

Tasks:
1. Deep-dive into {specific patterns/risks/efforts/benchmarks/feasibility}
2. Validate assumptions from breadth analysis (if available)
3. Quantify {quality/risk/effort/performance/value}
4. Produce evidence-backed assessment

Output format:
- Detailed analysis (claim | evidence | confidence)
- Validated/invalidated assumptions
- Quantified metrics where possible
- Risk/opportunity assessment
```

## Verification Loop Detail

```
Round N:
  Input:  All 10 team findings + previous round feedback (if any)
  Step 1: opus reviews each team pair for:
          - Internal consistency (breadth ↔ depth alignment)
          - Cross-domain consistency (security ↔ architecture)
          - Evidence quality (claims without backing)
  Step 2: codex-exec validates technical claims:
          - Code patterns actually exist
          - Benchmarks are reproducible
          - Dependencies resolve correctly
  Step 3: Compile contradiction list
          - 0 contradictions → CONVERGED
          - >0 contradictions → feedback to relevant teams → Round N+1
```

## Output Format

```markdown
# Research Report: {topic}

## Executive Summary
{2-3 paragraph overview of findings, key recommendation, confidence level}

## Team Findings

### Architecture (Teams 1-2)
**Breadth**: {inventory summary}
**Depth**: {analysis summary}
**Confidence**: {High/Medium/Low}

### Security (Teams 3-4)
**Breadth**: {attack surface summary}
**Depth**: {risk assessment summary}
**Confidence**: {High/Medium/Low}

### Integration (Teams 5-6)
**Breadth**: {compatibility summary}
**Depth**: {effort/value summary}
**Confidence**: {High/Medium/Low}

### Comparative (Teams 7-8)
**Breadth**: {landscape summary}
**Depth**: {benchmark summary}
**Confidence**: {High/Medium/Low}

### Innovation (Teams 9-10)
**Breadth**: {pattern summary}
**Depth**: {feasibility summary}
**Confidence**: {High/Medium/Low}

## Cross-Verification Results
**Rounds completed**: {N}
**Contradictions found**: {count}
**Resolution**: {summary of how contradictions were resolved}

## Taxonomy

### ADOPT (Safe + High Value)
| Item | Rationale | Confidence |
|------|-----------|------------|

### ADAPT (Valuable but needs modification)
| Item | Required Changes | Effort |
|------|-----------------|--------|

### AVOID (Risk > Value)
| Item | Risk | Alternatives |
|------|------|-------------|

## Action Items
| # | Item | Effort | Priority | Owner |
|---|------|--------|----------|-------|
```

## Post-Research Advisory

After research completion, the orchestrator SHOULD display:

```
[Advisory] Research complete.
├── For complex implementations (10+ files): /structured-dev-cycle
├── For quick planning: EnterPlanMode (plan mode)
└── For simple tasks (< 3 files): proceed directly
```

This advisory is informational only and does not block execution.

## Fallback Behavior

| Scenario | Fallback |
|----------|----------|
| codex-exec unavailable | opus-only verification (still min 2 rounds) |
| Agent Teams unavailable | Standard Agent tool with R009 batching |
| Partial team failure | Synthesize from available results, note gaps in report |
| GitHub issue creation fails | Output report to conversation only |

## Display Format

Before execution:
```
[Research Plan] {topic}
├── Phase 1: 10 teams (3 batches × 4/4/2)
├── Phase 2: Cross-verification (2-5 rounds, opus + codex)
├── Phase 3: Synthesis (opus)
└── Phase 4: Report + GitHub issue

Estimated: {time} | Teams: 10 | Models: sonnet → opus → codex
Execute? [Y/n]
```

Progress:
```
[Research Progress] Phase 1 — Batch 2/3
├── T1-T4: ✓ Complete
├── T5-T8: → Running
└── T9-T10: ○ Pending
```

## Integration

| Rule | Integration |
|------|-------------|
| R009 | Max 4 parallel teams; batch in groups of 4/4/2 |
| R010 | Orchestrator manages all phases; teams are subagents |
| R013 | Ecomode auto-activates for 10-team aggregation |
| R015 | Display research plan with team breakdown before execution |
| R018 | Agent Teams for cross-team coordination if enabled |
| dag-orchestration | Phase sequencing follows DAG pattern |
| result-aggregation | Team results formatted per aggregation skill |
| multi-model-verification | Phase 2 uses multi-model verification pattern |

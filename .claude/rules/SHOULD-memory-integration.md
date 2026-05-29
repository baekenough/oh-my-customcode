# [SHOULD] Memory Integration Rules

> **Priority**: SHOULD | **ID**: R011

> **Note**: This project uses **native auto memory ONLY** (memory/MEMORY.md + agent frontmatter `memory:`). claude-mem and agentmemory MCP are NOT used in this project. Decision: issue #1253.

## Architecture

**Sole backend**: Native auto memory (`memory` field in agent frontmatter). No external MCP dependencies.

## Native Auto Memory

Agent frontmatter `memory: project|user|local` enables persistent memory:
- System creates memory directory, loads first 200 lines of MEMORY.md into prompt
- Read/Write/Edit tools auto-enabled for memory directory
- Custom directory: set `autoMemoryDirectory` in settings to override default paths (v2.1.74+)

| Scope | Location | Git Tracked |
|-------|----------|-------------|
| `user` | `~/.claude/agent-memory/<name>/` | No |
| `project` | `.claude/agent-memory/<name>/` | Yes |
| `local` | `.claude/agent-memory-local/<name>/` | No |

## Best Practices

- Consult memory before starting work
- Update after discovering patterns
- Keep MEMORY.md under 200 lines
- Do not store sensitive data or duplicate CLAUDE.md content
- Memory write failures should not block main task

<!-- DETAIL: Confidence-Tracked Memory (sys-memory-keeper reference)

Memory entries in MEMORY.md should include confidence annotations to distinguish verified facts from hypotheses.

### Confidence Levels

| Level | Tag | Meaning | Example |
|-------|-----|---------|---------|
| High | `[confidence: high]` | Verified across multiple sessions or confirmed by user | Architecture decisions, confirmed patterns |
| Medium | `[confidence: medium]` | Observed pattern, not yet fully verified | Code conventions seen in 2-3 files |
| Low | `[confidence: low]` | Single observation or hypothesis | First-time discovery, untested assumption |

### Format in MEMORY.md

    ### Key Patterns [confidence: high]
    - `.claude/` files are gitignored — always use `git add -f`
    - pre-commit hooks auto-detect README/manifest count mismatches

    ### Hypotheses [confidence: medium]
    - Template sync might need CI enforcement (seen in 2 PRs)

    ### Unverified [confidence: low]
    - Possible race condition in parallel hook execution (observed once)

### Confidence Lifecycle

    [low] — observed again — [medium] — confirmed by user/testing — [high]
    [any] — contradicted by evidence — demoted or removed

### Temporal Decay

Memory entries include an optional verification timestamp for decay tracking.

Format: `[confidence: high, verified: 2026-03-15]`

| Age (unverified) | Action |
|-------------------|--------|
| 0-30 days | No change — entry is fresh |
| 30-60 days | Demote one level (high->medium, medium->low) |
| 60-90 days | Demote again if not re-verified |
| 90+ days | Removal candidate — flag for review |

Decay Schedule:
    Day 0:   [confidence: high, verified: 2026-03-15]
    Day 30:  [confidence: high, verified: 2026-03-15]  <- still within window
    Day 31:  [confidence: medium, verified: 2026-03-15] <- auto-demoted
    Day 61:  [confidence: low, verified: 2026-03-15]    <- demoted again
    Day 91:  [REVIEW NEEDED, verified: 2026-03-15]      <- flagged

Re-verification: Any session that confirms a memory entry resets the verified date:
    Before: [confidence: medium, verified: 2026-01-15]
    Action: Pattern confirmed in session
    After:  [confidence: high, verified: 2026-03-15]

Enforcement: sys-memory-keeper checks decay at session start and end:
1. Session start: scan MEMORY.md for entries past decay threshold
2. Flag stale entries with `[STALE]` prefix
3. Session end: remove or demote unconfirmed stale entries

Exceptions: Entries marked `[permanent]` are exempt from decay:
    ### Architecture Decisions [confidence: high, permanent]

-->

<!-- DETAIL: Behavioral Memory (sys-memory-keeper reference)

MEMORY.md supports an optional `## Behaviors` section for tracking user interaction preferences and workflow patterns.

### Behaviors Section Format

    ## Behaviors [confidence: medium]
    - User prefers concise responses — 3 sentences max
    - Commit messages always include issue number
    - Security-first review perspective

    ## Behavior Lifecycle
    - New observation — [confidence: low]
    - Seen in 2+ sessions — [confidence: medium]
    - User-confirmed — [confidence: high]
    - Contradicted — demote or remove

### What Counts as a Behavior

| Category | Examples |
|----------|---------|
| Communication | Verbosity preference, language, format |
| Workflow | Tool preferences, review habits, branching patterns |
| Domain priority | Security-first, performance-first, simplicity-first |

### What Does NOT Count as a Behavior

- Facts about the codebase (use existing sections)
- One-time instructions (ephemeral, not persistent)
- Tool configuration (belongs in CLAUDE.md or settings)

### Extraction Guidelines

sys-memory-keeper extracts behavioral patterns at session end:
1. Analyze conversation for repeated user preferences
2. New behaviors start at `[confidence: low]`
3. Promote on repeated observation across sessions
4. Demote or remove when contradicted

### Budget Management

Behaviors share the 200-line MEMORY.md budget with facts. When approaching the limit:
1. Prune `[confidence: low]` behaviors first
2. Then prune `[confidence: medium]` behaviors
3. `[confidence: high]` behaviors are never auto-pruned

### Precedence

Behavioral memory observations override soul defaults (R006 Soul Identity) when they conflict. Behaviors are user-specific and session-derived; souls are template defaults.

### Rules

| Rule | Detail |
|------|--------|
| New discoveries | Start at `[confidence: low]` unless user explicitly confirms |
| Cross-session verification | Promote to `[confidence: medium]` when seen in 2+ sessions |
| User confirmation | Promote to `[confidence: high]` when user confirms or tests pass |
| Contradiction | Demote or remove when contradicted by new evidence |
| Default | Entries without tags are treated as `[confidence: high]` (backward compatibility) |

### Integration with Session-End

When sys-memory-keeper updates MEMORY.md at session end:
1. New findings from this session — `[confidence: low]`
2. Findings that match existing entries — promote confidence
3. Findings that contradict existing entries — flag for review

-->

<!-- DETAIL: Agent Metrics (sys-memory-keeper reference)

MEMORY.md supports an optional `## Metrics` section for tracking per-agent-type performance data.

### Metrics Section Format

    ## Metrics [auto-updated by sys-memory-keeper]

    | Agent Type | Tasks | Success Rate | Avg Model | Last Used |
    |------------|-------|-------------|-----------|-----------|
    | lang-golang-expert | 12 | 92% | sonnet | 2026-03-15 |
    | mgr-gitnerd | 8 | 100% | sonnet | 2026-03-15 |

### Metrics Collection

sys-memory-keeper aggregates metrics at session end:

1. Read `/tmp/.claude-task-outcomes-${PPID}` (JSONL from task-outcome-recorder hook)
2. Parse each entry: `{agent_type, outcome, model, timestamp}`
3. Aggregate by agent_type: total tasks, success count, model distribution
4. Merge with existing Metrics table in MEMORY.md
5. Budget: max 20 rows (prune lowest-usage agents when exceeded)

### Metrics Fields

| Field | Source | Calculation |
|-------|--------|-------------|
| Tasks | task-outcome-recorder JSONL | Count of entries per agent_type |
| Success Rate | outcome field | `success_count / total_count * 100` |
| Avg Model | model field | Most frequently used model |
| Last Used | timestamp field | Most recent invocation |

### Budget Management

The Metrics section shares the 200-line MEMORY.md budget:
1. Max 20 agent rows in Metrics table
2. When adding new agent, prune agent with lowest task count
3. Merge identical agent types across sessions (cumulative)

-->

<!-- DETAIL: User Model (sys-memory-keeper reference)

MEMORY.md supports an optional `## User Model` section (DISTINCT from `## Behaviors`) for tracking structured user interaction patterns.

### User Model vs Behaviors

| Aspect | Behaviors | User Model |
|--------|-----------|------------|
| Focus | Communication/workflow preferences | Correction patterns, expertise, skill usage |
| Source | Conversation style observations | R016 violations, tool invocations, override decisions |
| Update | Session-end extraction | Session-end aggregation from task outcomes |

### User Model Section Format

    ## User Model [auto-updated by sys-memory-keeper]

    ### Correction Patterns [confidence: medium]
    - R010 direct-write attempts: 3 times → now delegates consistently
    - Prefers explicit agent selection over auto-routing

    ### Skill Preferences [confidence: high]
    | Skill | Invocations | Last Used |
    |-------|------------|-----------|
    | /research | 12 | 2026-04-03 |
    | /pipeline auto-dev | 8 | 2026-04-03 |

    ### Expertise Profile [confidence: medium]
    - Primary domains: TypeScript, Python, Go
    - Focus: AI agent orchestration, CLI tooling

    ### Override Decisions [confidence: low]
    - Overrode /scout SKIP verdict → INTEGRATE for RTK (#756)

### Categories

| Category | Source | Description |
|----------|--------|-------------|
| Correction Patterns | R016 violation history | Rules the user corrected most |
| Skill Preferences | Skill tool invocation count | Most-invoked skills ranked |
| Expertise Profile | File patterns + routing history | User's domain expertise areas |
| Override Decisions | Explicit user overrides | When user disagreed with agent recommendation |

### Budget Management

User Model shares the 200-line MEMORY.md budget:
- Max 30 lines for User Model section
- Prune low-confidence entries first
- Skill Preferences table: max 10 rows (top by invocation count)
- Override Decisions: max 5 entries (most recent)

### Extraction Guidelines

sys-memory-keeper extracts user model data at session end:
1. Parse task outcomes for Skill invocations → update Skill Preferences
2. Scan conversation for R016 violations → update Correction Patterns
3. Analyze file patterns and routing decisions → update Expertise Profile
4. Detect explicit user overrides (verdict changes, agent redirects) → update Override Decisions

### Precedence

User Model data feeds into intent-detection (R015) and routing skill confidence scoring. Higher expertise in a domain → higher confidence for auto-routing to that domain's agent.

-->

## Mid-Session Immediate Save

Save memory IMMEDIATELY upon surprising discovery — do not defer to session end.

| Trigger | Action | Rationale |
|---------|--------|-----------|
| Repeated pattern observed (2nd time) | Save `feedback_*.md` now | Pattern will recur within session |
| Unexpected tool behavior / workaround | Save `feedback_*.md` now | Session state defense |
| Subagent false-positive detected | Save `feedback_*.md` now | Prevent repeat in same session |
| User correction / feedback | Save `feedback_*.md` now | Honor correction immediately |

See rationale and cross-references via Read tool.

<!-- DETAIL: Why Immediate? and Cross-reference
### Why Immediate?

Session-end saves lose context: by the time the session ends, multiple discoveries have compounded and nuance is lost. Immediate saves preserve the exact trigger context that makes the memory actionable.

**Anti-pattern**: "I'll batch all learnings at session end" — by then you'll have forgotten WHY each one mattered, and further violations may have occurred using the un-saved pattern.

### Cross-reference

Related records from session v0.87.2~v0.88.0 (issue #869):
- `feedback_subagent_pre_existing_claims.md`
- `feedback_github_workflows_inventory.md`
- `feedback_bun_mock_module.md`
-->

## Session-End Auto-Save

### Trigger

Session-end detected when user says: "끝", "종료", "마무리", "done", "wrap up", "end session", or explicitly requests session save.

See flow diagram and responsibility split via Read tool.

<!-- DETAIL: Session-End Flow, Responsibility Split
### Flow

```
User signals session end
  → Orchestrator delegates to sys-memory-keeper
    → sys-memory-keeper performs:
       1. Collect session summary (tasks, decisions, open items)
       2. Update native auto-memory (MEMORY.md)
       3. Return formatted summary to orchestrator
  → Orchestrator confirms to user
```

### Responsibility Split

| Responsibility | Owner | Reason |
|----------------|-------|--------|
| Session summary collection | sys-memory-keeper | Domain expertise in memory formatting |
| Native auto-memory (MEMORY.md) | sys-memory-keeper | Has Write access to memory directory |
-->

### Session-End Self-Check (MANDATORY)

(1) sys-memory-keeper updated MEMORY.md? (2) If `omcustom-feedback` skill is active, model MAY draft a retrospective feedback issue for user approval — or prompt user to trigger it manually. Both required before confirming to user. See full self-check via Read tool.

<!-- DETAIL: Session-End Self-Check (MANDATORY)
```
╔══════════════════════════════════════════════════════════════════╗
║  BEFORE CONFIRMING SESSION-END TO USER:                          ║
║                                                                   ║
║  1. Did sys-memory-keeper update MEMORY.md?                      ║
║     YES → Continue                                               ║
║     NO  → Delegate to sys-memory-keeper first                    ║
║                                                                   ║
║  2. Is omcustom-feedback skill available in this project?        ║
║     YES → If notable friction/learning observed: MODEL DRAFTS    ║
║          retrospective issue → presents via Phase 4A preview     ║
║          gate for user approval. Otherwise: prompt user to       ║
║          trigger manually. Accept skip either way.               ║
║     NO  → Skip                                                    ║
║                                                                   ║
║  ALL steps must be completed before confirming to user.          ║
╚══════════════════════════════════════════════════════════════════╝
```
-->

### Session-End Retrospective Feedback (Model-Drafted)

Since `omcustom-feedback` is now model-invocable (#1227), the model MAY draft a retrospective feedback issue at session end — instead of only prompting the user to compose one manually.

**Workflow**

1. Model detects notable friction, workarounds, or harness gaps observed during the session.
2. Model drafts a feedback issue (title + body) using the `omcustom-feedback` skill.
3. Draft is presented through the skill's **Phase 4A preview + confirmation gate**. The user reviews and approves before any GitHub issue is created.
4. The model NEVER auto-submits. User approval is always required.

**Trigger conditions** (all must be true):
- Session-end detected
- Notable friction or learning observed during the session
- `omcustom-feedback` skill active in this project

**Distinction from manual path**

| Path | Who drafts | Who approves | When |
|------|-----------|--------------|------|
| Manual (existing) | User | User | User chooses to file feedback |
| Model-drafted (new, #1226 item 3) | Model | User (Phase 4A gate) | Session-end with notable friction |

The model-drafted path is an enhancement: it proposes a concrete draft rather than asking the user to compose from scratch. Both paths remain valid; neither replaces the other.

References: #1226 (item 3), #1227.

### Failure Policy

- Memory write failure is **non-blocking**: MUST NOT prevent session from ending
- If sys-memory-keeper fails to write MEMORY.md: log warning, confirm to user anyway

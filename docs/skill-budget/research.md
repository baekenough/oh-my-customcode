# Skill Budget Research: Static Profile vs Memory-Derived Dynamic Activation

**Epic**: #1047 — per-spawn skill enumeration overhead reduction
**Related**: #1041 (token over-spend root cause), #1055 (follow-up), #1066 (this document)
**Status**: Research only — no implementation

---

## 1. Baseline Measurement (from #1041)

| Component | Size | Notes |
|-----------|------|-------|
| Orchestrator skill descriptions | ~14.5 KB | 115 skills × avg description |
| Per-spawn enumeration block | ~22–40 KB | Plugin skills dominate; varies by active plugins |
| Per-turn auto-injected payload | ~29 K tokens | Includes rules, CLAUDE.md, skill manifest |

**Root cause**: Every agent spawn injects the full skill list regardless of task domain.
A Go code review spawn receives the same enumeration as an Airflow pipeline spawn.
At 4 parallel agents, the overhead multiplies to ~120–160 KB before task content.

---

## 2. Option 1: Static Profiles

### Mechanism

- Introduce `.claude/profiles/{name}.json` — a curated allow-list of skill names per persona (e.g., `backend-dev`, `data-engineer`, `qa`).
- User activates a profile at session start via slash command: `/profile backend-dev`.
- Orchestrator filters the skill enumeration block to only listed skills before injecting into any spawned agent prompt.
- Profile files are checked into version control; maintained by `mgr-creator` or manually.

### Profile schema (draft)

```json
{
  "name": "backend-dev",
  "description": "Go/Python/Kotlin backend development sessions",
  "skills": [
    "dev-review", "dev-refactor", "structured-dev-cycle",
    "sdd-dev", "deep-verify", "adversarial-review"
  ],
  "always-include": ["task-decomposition", "dag-orchestration"]
}
```

### Effect estimate

- Typical backend profile: 15–25 skills vs 115 full set → **60–70% reduction** in enumeration block.
- Per-spawn payload drops from ~22–40 KB to ~7–15 KB.
- Benefit compounds at high parallelism (R009 4-agent default).

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| UX burden: user must remember to activate | Medium | Default profile = full set (no regression) |
| Profile staleness as skills are added | Medium | CI lint check profiles against skill manifest |
| Wrong profile active → missing skill | Low | Fallback: user can override with full enumeration |
| Maintenance overhead (47+ guides to curate) | Low | Start with 3–4 profiles covering 80% of sessions |

---

## 3. Option 2: Memory-Derived Dynamic Activation

### Mechanism

- `claude-mem` stores an invocation log: each skill invocation writes `{skill, timestamp, session_id}` to memory.
- A scoring function computes an activity score per skill: `score = Σ(recency_weight × invocation_count)` over a rolling 30-day window.
- At session start, the orchestrator queries claude-mem, ranks skills by score, and activates the top-N (e.g., top 30).
- Skills below threshold are excluded from the per-spawn enumeration block unless explicitly requested.

### Effect estimate

- If top-30 active skills cover 80%+ of actual usage, enumeration block shrinks by ~74%.
- Zero explicit user action after the initial warm-up period (after ~5 sessions).

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Cold start: no history → full enumeration | High | Fall back to full set for first N sessions |
| Infrequent skill drop: legitimate but rare skill excluded | Medium | Always-include override list per agent frontmatter |
| claude-mem unavailable → no scoring | High | Graceful degrade to full enumeration |
| Scoring bias toward recent activity | Low | Apply time-decay, not pure recency |
| Privacy: invocation log stored externally | Low | Log skill names only, no payload content |

---

## 4. Option 3: Hybrid

### Mechanism

- A base static profile defines a **floor** (always-included skills, never scored out).
- Memory-derived scoring adjusts the **ceiling**: dynamically adds skills above the floor based on recent activity.
- Effective set = `profile.always-include ∪ top_scored_skills`.
- User can activate a domain profile (`/profile data-engineer`) to shift the floor.

### Effect estimate

- Reduction: 55–65% (slightly less aggressive than pure dynamic due to guaranteed floor).
- Risk profile: lower than Option 2 (floor prevents cold-start failures), lower UX burden than Option 1.

---

## 5. Comparison Matrix

| Dimension | Option 1: Static | Option 2: Dynamic | Option 3: Hybrid |
|-----------|:-----------------:|:-----------------:|:----------------:|
| Implementation cost | Low | High | Medium |
| UX impact | Medium (manual activate) | None after warm-up | Low |
| Expected reduction | 60–70% | 70–80% | 55–65% |
| Risk level | Low | High (cold start) | Medium |
| claude-mem dependency | None | Required | Optional |
| Maintenance burden | Medium (profile curation) | Low | Medium |
| Time to value | Immediate | 5+ sessions warm-up | 5+ sessions |
| Graceful degrade | Yes (full set default) | Yes (full set fallback) | Yes |

---

## 6. Recommendation

**Implement Option 1 first** to validate the UX assumption (do users adopt profile activation?), measure the real-world reduction, and establish baseline metrics before introducing scoring infrastructure.

Rationale:
- No external dependency (claude-mem not required).
- Immediately measurable: compare per-spawn token counts before/after.
- If profile adoption is low (users forget to activate), that invalidates the UX assumption and shifts the recommendation toward Option 2 or 3.
- If adoption is high, profile curation effort is justified and Option 3 becomes the natural evolution.

**Evaluation gate**: After 2 weeks of Option 1 usage, measure (a) profile activation rate, (b) actual token reduction vs baseline, (c) "missing skill" incidents. Use these to decide whether to invest in Option 2 scoring infrastructure.

---

## 7. Open Questions

1. **UX assumption validity**: Will users reliably activate a profile at session start, or does this create friction that leads to abandoning the feature? No data yet.

2. **Minimum effective profile count**: How many profiles cover 80%+ of session types? Hypothesis: 4 (backend-dev, data-engineer, qa, docs-only) — needs session log analysis.

3. **claude-mem availability baseline**: What fraction of sessions have claude-mem configured? Option 2/3 value depends on this. Current estimate: unknown.

4. **Always-include list authority**: Should `always-include` be defined per profile (Option 1) or per agent frontmatter (Option 2/3)? Conflict resolution policy needed.

5. **Scoring window**: Is 30 days appropriate for skill activity decay, or should it be session-count based (e.g., last 20 sessions)? Temporal vs usage-count decay TBD.

6. **CI enforcement**: Should missing skills in a profile cause CI failure, or only a warning? Strict enforcement reduces drift but increases maintenance overhead.

7. **Interaction with plugin skills**: Plugin-injected skills dominate the 22–40 KB range. Do profiles need to filter plugin skill enumeration, or only core/harness skills? Plugin skill filtering may require a different hook point.

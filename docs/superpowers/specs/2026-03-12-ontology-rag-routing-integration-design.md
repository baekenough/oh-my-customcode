# Design Spec: Ontology-RAG Routing Integration

**Date**: 2026-03-12
**Status**: Approved
**Rule**: R019 (SHOULD-ontology-rag-routing)
**Related issue**: #294 (ontology-rag zero usage)

---

## Problem

oh-my-customcode's 4 routing skills use static keyword/extension mapping tables:

- `secretary-routing`
- `dev-lead-routing`
- `de-lead-routing`
- `qa-lead-routing`

The ontology-RAG MCP server exposes `get_agent_for_task` but is entirely unused. (Internally, `get_agent_for_task` calls `router.route_with_hybrid()` — confirmed in `mcp_tools.py` line 346.) A bug in `router.py` causes `graph_score` to always be 0, capping composite confidence at 0.15–0.18 (theoretical ceiling: 0.70). This prevents any confidence-dependent integration.

---

## Approach: Option C + H (2-Phase)

Ontology-RAG enriches routing; it does not replace it. Static routing remains the primary decision path throughout both phases.

### Phase 1 — Immediate

| Step | Description |
|------|-------------|
| 1 | **Fix graph_score bug** in `router.py:279` — pass keyword-best match as `anchor_node` to `hybrid_searcher.search()` |
| 2 | **Create R019** (`SHOULD-ontology-rag-routing.md`) — documents ontology-RAG as enrichment layer |
| 3 | **Option H** — extract `suggested_skills` from `get_agent_for_task` response and inject into spawned agent prompt; modify all 4 routing SKILL.md files |

### Phase 2 — After confidence improvement verified

| Step | Description |
|------|-------------|
| 4 | **Option C** — when static routing confidence is low (< 0.35 post-fix), call `get_agent_for_task` to cross-validate agent selection |
| 5 | **Option G** — add `get_relevant_context(domain)` call in `mgr-creator`'s Phase 2 (auto-discovery) to seed skill selection |

---

## Architecture

```
User request
    │
    ▼
Static routing (unchanged, always primary)
    │
    ├──[Option H, Phase 1]──────────────────────────────────────────────┐
    │   get_agent_for_task(query)                                       │
    │   └── Extract suggested_skills → inject into spawned agent prompt │
    │                                                                   │
    └──[Option C, Phase 2] IF static confidence < 0.35─────────────────┘
        get_agent_for_task(query)
        └── Cross-validate agent selection (log discrepancy if mismatch)

mgr-creator dynamic creation:
    Phase 2 auto-discovery
        └──[Option G, Phase 2] get_relevant_context(domain)
            └── Seed skill discovery with ontology context
```

---

## Bug Fix: graph_score = 0

**File**: `packages/ontology-rag/src/ontology_rag/router.py`
**Location**: `route_with_hybrid()`, line 279

### Root Cause

`hybrid_searcher.search()` accepts an optional `anchor_node` parameter. When `anchor_node=None`, `_precompute_bfs_depths(None)` returns `None`, which flows into `_compute_graph_score(node_id, bfs_depths=None)` and returns `0.0` for every result. The caller never passes an anchor node.

### Fix (3–5 lines)

```python
# Before (line 279):
results = self.hybrid_searcher.search(query, entity_type="Agent", top_k=1)

# After:
# Use the keyword-best match as anchor to enable graph scoring
kw_result = self.route_with_keywords(query)
anchor = kw_result.agent if kw_result.agent else None
results = self.hybrid_searcher.search(query, anchor_node=anchor, top_k=1, entity_type="Agent")
```

**Expected outcome**: `graph_score` becomes non-zero for all routing queries; composite confidence rises to 0.30–0.40 range.

> **Edge case**: `route_with_keywords()` returns `agent=""` (empty string) when no keyword match is found. An empty string evaluates to `False` in Python, so `anchor = kw_result.agent if kw_result.agent else None` correctly falls back to `anchor=None` in that case.

### Scoring Formula (for reference)

```
final_score = 0.50 * keyword_score
            + 0.30 * graph_score      ← currently always 0
            + 0.15 * community_score
            + 0.05 * importance_score
```

---

## Option H: suggested_skills Injection

### What changes

Each routing SKILL.md adds a post-routing enrichment step:

```
After agent selection:
  1. Call get_agent_for_task(original_query)
  2. Extract suggested_skills from response
  3. If suggested_skills non-empty, prepend to spawned agent prompt:
     "Ontology context suggests these skills may be relevant: {suggested_skills}"
  4. On MCP failure: skip silently, proceed with unmodified prompt
```

> **Insertion point**: This step should be inserted as the final step in each routing skill's "Routing Decision (Priority Order)" section, after the existing expert agent selection step.

### Why this option

- Does not depend on confidence score — works even with 0.15–0.18 confidence
- Pure enrichment — no routing decision altered
- Token cost: ~300 tokens per routing decision
- MCP failure: zero impact on routing

---

## Option C: Low-Confidence Cross-Validation (Phase 2)

### Trigger condition

Static routing confidence < 0.35 (post-fix expected range: 0.30–0.40; threshold chosen to catch genuinely ambiguous queries while avoiding noise).

### Behavior

```
IF static_confidence < 0.35:
    result = get_agent_for_task(query)
    IF result.agent != static_selected_agent:
        log "[Routing] Ontology suggests {result.agent}, static selected {static_selected_agent}"
        # Static selection stands; log is informational
    proceed with static_selected_agent
```

Phase 2 will evaluate whether to act on discrepancies or continue logging only.

> **Threshold note**: The 0.35 threshold is estimated based on the expected post-fix confidence range (0.30–0.40). Measure actual confidence distribution after the graph_score fix and recalibrate the threshold before deploying Option C.

### Token cost

~300 tokens added only on low-confidence queries (~30% of decisions based on current distribution).

---

## Option G: mgr-creator Context Seeding (Phase 2)

### Where

`mgr-creator` Phase 2 (auto-discovery of relevant skills/guides before creating a new agent).

### Change

```
Before auto-discovery:
  1. Extract domain keyword from task context
  2. Call get_relevant_context(domain)
  3. Merge returned skill/rule suggestions into discovery candidates
  4. Proceed with existing auto-discovery logic
  On MCP failure: skip, proceed with existing discovery only
```

---

## Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `packages/ontology-rag/src/ontology_rag/router.py` | Pass `anchor_node` to `hybrid_searcher.search()` in `route_with_hybrid()` | 1 |
| `.claude/rules/SHOULD-ontology-rag-routing.md` | New R019 rule file | 1 |
| `.claude/skills/secretary-routing/SKILL.md` | Add `suggested_skills` extraction step [^fork] | 1 |
| `.claude/skills/dev-lead-routing/SKILL.md` | Add `suggested_skills` extraction step [^fork] | 1 |
| `.claude/skills/de-lead-routing/SKILL.md` | Add `suggested_skills` extraction step [^fork] | 1 |
| `.claude/skills/qa-lead-routing/SKILL.md` | Add `suggested_skills` extraction step [^fork] | 1 |
| `CLAUDE.md` | Add R019 to rules table; update ontology-rag description | 1 |
| `.claude/agents/mgr-creator.md` | Add `get_relevant_context` call in Phase 2 | 2 |

[^fork]: If `context:fork` lacks MCP access, Option H changes move from these 4 SKILL.md files to the orchestrator level (CLAUDE.md or a new pre-routing step in the orchestrator's behavior).

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| SHOULD, not MUST for R019 | Confidence 0.15–0.18 too low for mandatory routing. MCP failure must not block routing. |
| Enrichment over replacement | `suggested_skills` adds value without confidence dependency. Full `get_relevant_context` post-spawn has high CLAUDE.md overlap, making it low-value. |
| Option C threshold 0.35 | After graph fix, confidence expected 0.30–0.40. Threshold below typical range catches only genuinely ambiguous queries. Post-fix confidence (0.30–0.40) remains below R015's lowest threshold (<70%); R015 display behavior is unchanged. |
| graph_score fix first | All confidence-dependent features need this prerequisite. 3–5 lines, highest ROI. |
| Option B rejected | Highest token cost (1,350–3,600/session), rare in practice, complex dual-result UX. |
| Option A deferred | Requires graph_score fix + confidence reaching 0.60+ consistently. Future evaluation after data collection. |

---

## Constraints

**context:fork MCP access** — Routing skills use `context: fork`. Whether forked contexts inherit MCP tool access is unverified. Empirical test required before Phase 1 SKILL.md changes. If unavailable, Option H/C calls move to an orchestrator pre-routing step instead.

**Token budget** — Option H: ~300 tokens per routing decision. Option C: ~300 tokens on ~30% of decisions. Combined average well under 500-token target.

**Korean queries** — ontology `agents.yaml` already has Korean keywords (PR #306). Monitor coverage and extend as needed.

**Stale ontology** — `mgr-creator` should call `rebuild_ontology` after creating new agents to keep the ontology current for future routing.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| `graph_score` contribution | > 0 for all routing queries (currently always 0) |
| Confidence after fix | 0.30–0.40 range (currently 0.15–0.18) |
| Routing accuracy improvement | Measurable via Go backend disambiguation test case |
| Token overhead | < 500 tokens/routing decision average |
| MCP failure impact | Zero — fallback to static routing without user-visible error |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `context:fork` lacks MCP access | Empirical test before Phase 1 SKILL.md changes. Fallback: orchestrator pre-routing call. |
| `anchor_node` bias suppresses alternatives | Keyword-best as anchor may over-weight nearby graph nodes. Monitor result diversity post-fix. |
| Korean query coverage gaps | ontology has Korean keywords (PR #306); extend if gaps observed. |
| Stale ontology after `mgr-creator` | Add `rebuild_ontology` call to `mgr-creator` post-creation flow. |

---

## Out of Scope

- **Option A** (primary routing replacement) — deferred; requires confidence > 0.60 consistently
- **Option B** (advisory dual-path) — rejected (cost/UX)
- **Option D** (full `get_relevant_context` post-spawn) — rejected (CLAUDE.md overlap)
- **Option E** (session-init snapshot) — rejected (solves non-problem)
- **intent-detection skill** modifications — deferred to future iteration
- **agent-triggers.yaml** changes — static tables maintained as-is

---

## Implementation Order

```
Phase 1
  └─ 1. Fix graph_score bug (router.py)                ← prerequisite for Phase 2
  └─ 2. Create R019 rule file
  └─ 3. Verify context:fork MCP access empirically
         ├─ Available → modify 4 routing SKILL.md files (Option H)
         └─ Unavailable → implement Option H as orchestrator pre-routing step
  └─ 4. Update CLAUDE.md (R019 entry)

Phase 2  [after Phase 1 confidence data collected, ~2 weeks]
  └─ 5. Implement Option C (cross-validation on confidence < 0.35)
  └─ 6. Implement Option G (mgr-creator context seeding)
  └─ 7. Evaluate Option A eligibility based on observed confidence distribution
```

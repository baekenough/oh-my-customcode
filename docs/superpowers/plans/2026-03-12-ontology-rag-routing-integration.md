# Ontology-RAG Routing Integration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the graph_score=0 bug, create R019 rule, and implement Option H (suggested_skills injection) in all 4 routing skills to make ontology-RAG an active enrichment layer for routing decisions.

**Architecture:** Static routing remains primary. Ontology-RAG enriches routing by injecting suggested_skills from `get_agent_for_task` into spawned agent prompts. The graph_score bug fix is a prerequisite that enables future confidence-dependent features (Phase 2).

**Tech Stack:** Python (ontology-rag package), Markdown (SKILL.md files, rules), pytest

---

## Files to Modify

```
packages/ontology-rag/src/ontology_rag/router.py        (bug fix: ~3 lines changed)
packages/ontology-rag/tests/test_router.py              (new test: ~20 lines)
.claude/rules/SHOULD-ontology-rag-routing.md            (new file: ~60 lines)
.claude/skills/dev-lead-routing/SKILL.md                (add Step 4: ~15 lines)
.claude/skills/secretary-routing/SKILL.md               (add enrichment section: ~15 lines)
.claude/skills/de-lead-routing/SKILL.md                 (add Step 4: ~15 lines)
.claude/skills/qa-lead-routing/SKILL.md                 (add enrichment section: ~15 lines)
CLAUDE.md                                               (add R019 to SHOULD table: 1 line)
```

---

## Task 1: Fix graph_score=0 Bug (TDD)

**Files:**
- Modify: `packages/ontology-rag/tests/test_router.py`
- Modify: `packages/ontology-rag/src/ontology_rag/router.py` (line 279)

**Bug details:** In `route_with_hybrid()` at line 279, `self.hybrid_searcher.search(query, entity_type="Agent", top_k=1)` never passes `anchor_node`, so `_precompute_bfs_depths(None)` returns `None`, and `_compute_graph_score(node_id, bfs_depths=None)` returns `0.0` for all results. The scoring formula weights graph_score at 0.30, so the fix raises composite confidence from 0.15–0.18 to an expected 0.30–0.40.

**Edge case:** `route_with_keywords()` returns `agent=""` when no keyword match is found. The expression `kw_result.agent if kw_result.agent else None` correctly falls back to `anchor=None` in that case because empty string is falsy in Python.

- [ ] **Step 1: Write the failing test**

Add to the end of `packages/ontology-rag/tests/test_router.py`:

```python
def test_route_with_hybrid_has_nonzero_graph_score(sample_ontology_dir):
    """route_with_hybrid should produce non-zero graph_score when keyword match exists."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    searcher = HybridSearcher(onto, graph)
    router = SemanticRouter(onto, graph, hybrid_searcher=searcher)
    result = router.route_with_hybrid("golang code review")
    # After fix: graph_score should be non-zero because keyword match provides anchor
    assert "graph=" in result.reasoning
    # Extract graph score from reasoning string "Hybrid search: kw=X.XX graph=X.XX community=X.XX"
    parts = result.reasoning.split("graph=")
    graph_val = float(parts[1].split(" ")[0])
    assert graph_val > 0, f"graph_score should be > 0 but was {graph_val}"
```

- [ ] **Step 2: Run test to verify it fails**

```
cd packages/ontology-rag && python -m pytest tests/test_router.py::test_route_with_hybrid_has_nonzero_graph_score -v
```

Expected: `FAILED` — `AssertionError: graph_score should be > 0 but was 0.0`

- [ ] **Step 3: Implement the fix**

In `packages/ontology-rag/src/ontology_rag/router.py`, replace line 279:

```python
# BEFORE (line 279):
        results = self.hybrid_searcher.search(query, entity_type="Agent", top_k=1)

# AFTER:
        # Use keyword-best match as anchor to enable graph scoring
        kw_result = self.route_with_keywords(query)
        anchor = kw_result.agent if kw_result.agent else None
        results = self.hybrid_searcher.search(query, anchor_node=anchor, top_k=1, entity_type="Agent")
```

- [ ] **Step 4: Run test to verify it passes**

```
cd packages/ontology-rag && python -m pytest tests/test_router.py::test_route_with_hybrid_has_nonzero_graph_score -v
```

Expected: `PASSED`

- [ ] **Step 5: Run full test suite to verify no regressions**

```
cd packages/ontology-rag && python -m pytest tests/ -v
```

Expected: All tests `PASSED`

- [ ] **Step 6: Commit**

Delegate to mgr-gitnerd:

```bash
git add packages/ontology-rag/src/ontology_rag/router.py \
        packages/ontology-rag/tests/test_router.py
git commit -m "fix: pass anchor_node to hybrid search to enable graph_score

The route_with_hybrid() method never passed anchor_node to
hybrid_searcher.search(), causing _precompute_bfs_depths(None) to
return None, which made _compute_graph_score() return 0.0 for all
results. Now uses keyword-best match as anchor node.

Closes part of #294"
```

---

## Task 2: Create R019 Rule File

**Files:**
- Create: `.claude/rules/SHOULD-ontology-rag-routing.md`

- [ ] **Step 1: Create the R019 rule file**

Create `.claude/rules/SHOULD-ontology-rag-routing.md` with the following content:

```markdown
# [SHOULD] Ontology-RAG Assisted Routing

> **Priority**: SHOULD | **ID**: R019

## Core Rule

Routing skills SHOULD use ontology-RAG's `get_agent_for_task` MCP tool to enrich agent
selection with contextual skill suggestions. Ontology-RAG is an enrichment layer — it
does NOT replace static routing.

## Integration Pattern

After static routing selects an agent, call `get_agent_for_task(query)` and extract
`suggested_skills` from the response. Inject these into the spawned agent's prompt as
contextual hints.

```
Static routing → agent selected
  ↓
get_agent_for_task(original_query)
  ↓
Extract suggested_skills
  ↓
Prepend to spawned agent prompt:
  "Ontology context suggests these skills may be relevant: {suggested_skills}"
```

## Failure Handling

| Scenario | Action |
|----------|--------|
| MCP server unavailable | Skip silently, proceed with unmodified prompt |
| get_agent_for_task returns empty suggested_skills | Proceed with unmodified prompt |
| Response parsing error | Skip silently, log warning |

**MCP failure MUST NOT block or delay routing.** Ontology-RAG is advisory only.

## Scope

| Applies to | Details |
|------------|---------|
| secretary-routing | Enriches manager agent selection |
| dev-lead-routing | Enriches language/framework expert selection |
| de-lead-routing | Enriches data engineering expert selection |
| qa-lead-routing | Enriches QA workflow routing |

## Interaction with Other Rules

| Rule | Interaction |
|------|-------------|
| R010 | Orchestrator calls MCP tool; subagent receives enriched prompt |
| R015 | Post-fix confidence (0.30–0.40) remains below R015's 70% threshold; display behavior unchanged |
| R009 | Ontology-RAG call adds ~300 tokens per routing decision; no parallelism impact |

## Context:fork Caveat

Routing skills use `context: fork`. If forked contexts cannot access MCP tools, move the
`get_agent_for_task` call to an orchestrator pre-routing step instead of the SKILL.md.
Verify MCP access empirically before deploying SKILL.md changes.
```

- [ ] **Step 2: Verify the file was created correctly**

```
head -5 .claude/rules/SHOULD-ontology-rag-routing.md
```

Expected: Shows `# [SHOULD] Ontology-RAG Assisted Routing` and `> **Priority**: SHOULD | **ID**: R019`

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add .claude/rules/SHOULD-ontology-rag-routing.md
git commit -m "docs: add R019 SHOULD-ontology-rag-routing rule

Defines ontology-RAG as enrichment layer for routing skills.
MCP failure must not block routing. suggested_skills injection
is the primary integration pattern.

Part of #294"
```

---

## Task 3: Add Option H to dev-lead-routing

**Files:**
- Modify: `.claude/skills/dev-lead-routing/SKILL.md`

**Insertion point:** After the `### Step 3: Expert Agent Selection` section (line 108 in current file), before `## Routing Rules` (line 110).

- [ ] **Step 1: Add Step 4 (Ontology-RAG Enrichment) after Step 3**

Insert the following block between `### Step 3: Expert Agent Selection` and `## Routing Rules` in `.claude/skills/dev-lead-routing/SKILL.md`:

```markdown
### Step 4: Ontology-RAG Enrichment (R019)

After agent selection, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` is non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure or empty result: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**
```

- [ ] **Step 2: Verify the insertion order is correct**

```
grep -n "Step 3\|Step 4\|## Routing Rules" .claude/skills/dev-lead-routing/SKILL.md
```

Expected output (line numbers will vary, order must match):
```
NNN:### Step 3: Expert Agent Selection
NNN:### Step 4: Ontology-RAG Enrichment (R019)
NNN:## Routing Rules
```

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add .claude/skills/dev-lead-routing/SKILL.md
git commit -m "feat: add ontology-RAG enrichment step to dev-lead-routing (R019)

Adds Step 4 to routing decision flow: after agent selection,
call get_agent_for_task to extract suggested_skills and inject
into spawned agent prompt. MCP failure is silently skipped.

Part of #294"
```

---

## Task 4: Add Option H to secretary-routing

**Files:**
- Modify: `.claude/skills/secretary-routing/SKILL.md`

**Insertion point:** After the `## Command Routing` section's closing code block (line 54 in current file), before `## Routing Rules` (line 56).

- [ ] **Step 1: Add Ontology-RAG Enrichment section after Command Routing**

Insert the following block between the `## Command Routing` code block and `## Routing Rules` in `.claude/skills/secretary-routing/SKILL.md`:

```markdown
## Ontology-RAG Enrichment (R019)

After selecting a manager agent, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` is non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure or empty result: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**
```

- [ ] **Step 2: Verify the insertion order is correct**

```
grep -n "## Command Routing\|## Ontology-RAG Enrichment\|## Routing Rules" .claude/skills/secretary-routing/SKILL.md
```

Expected: `## Command Routing` → `## Ontology-RAG Enrichment (R019)` → `## Routing Rules`

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add .claude/skills/secretary-routing/SKILL.md
git commit -m "feat: add ontology-RAG enrichment step to secretary-routing (R019)

Part of #294"
```

---

## Task 5: Add Option H to de-lead-routing

**Files:**
- Modify: `.claude/skills/de-lead-routing/SKILL.md`

**Insertion point:** After `### Step 3: Expert Selection` (line 73 in current file), before `## Command Routing` (line 76).

- [ ] **Step 1: Add Step 4 (Ontology-RAG Enrichment) after Step 3**

Insert the following block between `### Step 3: Expert Selection` and `## Command Routing` in `.claude/skills/de-lead-routing/SKILL.md`:

```markdown
### Step 4: Ontology-RAG Enrichment (R019)

After agent selection, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` is non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure or empty result: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**
```

- [ ] **Step 2: Verify the insertion order is correct**

```
grep -n "Step 3\|Step 4\|## Command Routing" .claude/skills/de-lead-routing/SKILL.md
```

Expected: `Step 3: Expert Selection` → `Step 4: Ontology-RAG Enrichment (R019)` → `## Command Routing`

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add .claude/skills/de-lead-routing/SKILL.md
git commit -m "feat: add ontology-RAG enrichment step to de-lead-routing (R019)

Part of #294"
```

---

## Task 6: Add Option H to qa-lead-routing

**Files:**
- Modify: `.claude/skills/qa-lead-routing/SKILL.md`

**Insertion point:** After the `## Command Routing` section's closing code block (line 45 in current file), before `## Routing Rules` (line 47).

- [ ] **Step 1: Add Ontology-RAG Enrichment section after Command Routing**

Insert the following block between the `## Command Routing` code block and `## Routing Rules` in `.claude/skills/qa-lead-routing/SKILL.md`:

```markdown
## Ontology-RAG Enrichment (R019)

After selecting a QA agent, enrich the spawned agent's prompt with ontology context:

1. Call `get_agent_for_task(original_query)` via MCP
2. Extract `suggested_skills` from response
3. If `suggested_skills` is non-empty, prepend to spawned agent prompt:
   `"Ontology context suggests these skills may be relevant: {suggested_skills}"`
4. On MCP failure or empty result: skip silently, proceed with unmodified prompt

**This step is advisory only — it never changes which agent is selected.**
```

- [ ] **Step 2: Verify the insertion order is correct**

```
grep -n "## Command Routing\|## Ontology-RAG Enrichment\|## Routing Rules" .claude/skills/qa-lead-routing/SKILL.md
```

Expected: `## Command Routing` → `## Ontology-RAG Enrichment (R019)` → `## Routing Rules`

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add .claude/skills/qa-lead-routing/SKILL.md
git commit -m "feat: add ontology-RAG enrichment step to qa-lead-routing (R019)

Part of #294"
```

---

## Task 7: Update CLAUDE.md with R019

**Files:**
- Modify: `CLAUDE.md`

**Insertion point:** After the `| R013 | Ecomode | 배치 작업 토큰 효율성 |` row in the `### SHOULD (강력 권장)` table (line 140 in current file).

- [ ] **Step 1: Add R019 to the SHOULD rules table**

Insert after the R013 row in `CLAUDE.md`:

```markdown
| R019 | Ontology-RAG 라우팅 | 라우팅 스킬의 ontology-RAG enrichment |
```

The SHOULD table should end with:
```
| R013 | Ecomode | 배치 작업 토큰 효율성 |
| R019 | Ontology-RAG 라우팅 | 라우팅 스킬의 ontology-RAG enrichment |
```

- [ ] **Step 2: Verify the row was added correctly**

```
grep "R019" CLAUDE.md
```

Expected: `| R019 | Ontology-RAG 라우팅 | 라우팅 스킬의 ontology-RAG enrichment |`

- [ ] **Step 3: Commit**

Delegate to mgr-gitnerd:

```bash
git add CLAUDE.md
git commit -m "docs: add R019 ontology-RAG routing to CLAUDE.md rules table

Part of #294"
```

---

## Task 8: Run Full Verification

- [ ] **Step 1: Run ontology-rag tests**

```
cd packages/ontology-rag && python -m pytest tests/ -v
```

Expected: All tests `PASSED`

- [ ] **Step 2: Run project-level linting**

```
bun run lint
```

Expected: No errors

- [ ] **Step 3: Run project-level tests**

```
bun test
```

Expected: All tests `PASSED`

- [ ] **Step 4: Verify R019 rule file is valid**

```
head -3 .claude/rules/SHOULD-ontology-rag-routing.md
```

Expected: `# [SHOULD] Ontology-RAG Assisted Routing`

- [ ] **Step 5: Confirm all 4 routing skills contain the enrichment step**

```
grep -l "Ontology-RAG Enrichment" .claude/skills/secretary-routing/SKILL.md \
  .claude/skills/dev-lead-routing/SKILL.md \
  .claude/skills/de-lead-routing/SKILL.md \
  .claude/skills/qa-lead-routing/SKILL.md | wc -l
```

Expected: `4`

---

## Task Dependencies

```
Task 1 (graph_score fix)    ← no deps; do first (prerequisite for Phase 2)
Task 2 (R019 rule)          ← no deps; parallel with Task 1
Task 3 (dev-lead-routing)   ← no deps; parallel with Tasks 1-2
Task 4 (secretary-routing)  ← no deps; parallel with Tasks 1-3
Task 5 (de-lead-routing)    ← no deps; parallel with Tasks 1-4
Task 6 (qa-lead-routing)    ← no deps; parallel with Tasks 1-5
Task 7 (CLAUDE.md R019)     ← no deps; parallel with Tasks 1-6
Task 8 (verification)       ← depends on ALL Tasks 1-7 completing
```

Tasks 1-7 are fully independent and can be executed in parallel (max 4 at a time per R009). Task 8 must run last.

---

## Context:fork Gating Note

Before executing Tasks 3-6, verify that `context: fork` skills can access MCP tools:

```
# Empirical test: invoke secretary-routing and call get_agent_for_task from within it.
# If MCP call succeeds → proceed with SKILL.md changes (Tasks 3-6).
# If MCP call fails → implement Option H as an orchestrator pre-routing step instead.
```

The spec (design doc section "Constraints") explicitly flags this as unverified. If MCP is unavailable in forked context, Tasks 3-6 are replaced by a single orchestrator-level change (a pre-routing step in the main conversation behavior, not in individual SKILL.md files). Task 8 verification still applies.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| `graph_score` contribution | > 0 for all routing queries (currently always 0) |
| Confidence after fix | 0.30–0.40 range (currently 0.15–0.18) |
| R019 rule file | Present at `.claude/rules/SHOULD-ontology-rag-routing.md` |
| All 4 routing skills | Contain `get_agent_for_task` enrichment step |
| CLAUDE.md | R019 listed in SHOULD table |
| MCP failure behavior | Zero impact on routing — silent skip |
| All tests | PASSED (no regressions) |

---

## Reference

- Spec: `docs/superpowers/specs/2026-03-12-ontology-rag-routing-integration-design.md`
- Related issue: #294 (ontology-rag zero usage)
- Rule to create: R019 (`SHOULD-ontology-rag-routing`)
- Phase 2 scope: Option C (cross-validation on confidence < 0.35), Option G (mgr-creator seeding) — not covered here

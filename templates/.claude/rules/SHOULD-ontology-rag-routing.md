# [SHOULD] Routing Enrichment Rules

> **Priority**: SHOULD | **ID**: R019

## Core Rule

Routing skills SHOULD use enrichment layers to improve agent/skill/guide selection accuracy. Two enrichment sources are available — they complement each other and both are advisory only.

## Enrichment Layers

### Layer 1: Ontology-RAG (MCP-based)

When the `ontology-rag` MCP server is available, routing skills call `get_agent_for_task(query)` to get `suggested_skills` from the ontology graph. Inject suggestions into the spawned agent's prompt.

```
Static routing → agent selected
  ↓
get_agent_for_task(original_query) [MCP]
  ↓
Extract suggested_skills
  ↓
Prepend to spawned agent prompt
```

### Layer 2: Wiki-RAG (wiki index-based)

When routing confidence is below 90%, query `wiki/index.yaml` for relevant agent/skill/guide pages. Inject findings as supplementary routing signals.

```
Static routing → ambiguous (confidence < 90%)
  ↓
wiki/index.yaml search for matching pages
  ↓
Extract agent/skill/guide suggestions
  ↓
Inject as suggested_context in agent prompt
```

## Failure Handling

| Scenario | Action |
|----------|--------|
| MCP server unavailable | Skip silently, proceed without ontology enrichment |
| wiki/index.yaml missing | Skip silently, proceed without wiki enrichment |
| Either returns empty | Proceed with unmodified prompt |
| Parsing error | Skip silently, log warning |

**Enrichment failure MUST NOT block or delay routing.** Both layers are advisory only.

## Scope

| Applies to | Ontology-RAG | Wiki-RAG |
|------------|:------------:|:--------:|
| secretary-routing | ✓ | ✓ |
| dev-lead-routing | ✓ | ✓ |
| de-lead-routing | ✓ | ✓ |
| qa-lead-routing | ✓ | ✓ |

## Interaction with Other Rules

| Rule | Interaction |
|------|-------------|
| R010 | Orchestrator calls enrichment tools; subagent receives enriched prompt |
| R015 | Enrichment does not change R015 confidence thresholds — display behavior unchanged |
| R009 | Each enrichment call adds ~300 tokens; no parallelism impact |
| R022 | Wiki-RAG depends on up-to-date wiki pages — stale wiki reduces enrichment quality |

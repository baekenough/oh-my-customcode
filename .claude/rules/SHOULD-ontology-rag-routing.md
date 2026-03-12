# [SHOULD] Ontology-RAG Assisted Routing

> **Priority**: SHOULD | **ID**: R019

## Core Rule

Routing skills SHOULD use ontology-RAG's `get_agent_for_task` MCP tool to enrich agent selection with contextual skill suggestions. Ontology-RAG is an enrichment layer — it does NOT replace static routing.

## Integration Pattern

After static routing selects an agent, call `get_agent_for_task(query)` and extract `suggested_skills` from the response. Inject these into the spawned agent's prompt as contextual hints.

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
| get_agent_for_task returns empty | Proceed with unmodified prompt |
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
| R015 | Post-fix confidence (0.30-0.40) remains below R015's 70% threshold; display behavior unchanged |
| R009 | Ontology-RAG call adds ~300 tokens; no parallelism impact |

# [SHOULD] Routing Enrichment Rules

> **Priority**: SHOULD | **ID**: R019

## Core Rule

Routing skills SHOULD use Wiki-RAG enrichment to improve agent/skill/guide selection accuracy. Enrichment is advisory only.

## Enrichment Layer

### Wiki-RAG (wiki index-based)

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
| wiki/index.yaml missing | Skip silently, proceed without wiki enrichment |
| Returns empty | Proceed with unmodified prompt |
| Parsing error | Skip silently, log warning |

**Enrichment failure MUST NOT block or delay routing.** Wiki-RAG is advisory only.

## Scope

| Applies to | Wiki-RAG |
|------------|:--------:|
| secretary-routing | ✓ |
| dev-lead-routing | ✓ |
| de-lead-routing | ✓ |
| qa-lead-routing | ✓ |

## Interaction with Other Rules

| Rule | Interaction |
|------|-------------|
| R010 | The routing skill reads `wiki/index.yaml` read-only; the spawned subagent receives the enriched prompt |
| R015 | Enrichment does not change R015 confidence thresholds — display behavior unchanged |
| R009 | Wiki lookup adds the extracted suggestions (`suggested_context`) to the prompt; no parallelism impact |
| R022 | Wiki-RAG depends on up-to-date wiki pages — stale wiki reduces enrichment quality |

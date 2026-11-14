---
paths:
  - ".claude/skills/secretary-routing/**"
  - ".claude/skills/dev-lead-routing/**"
  - ".claude/skills/de-lead-routing/**"
  - ".claude/skills/qa-lead-routing/**"
  - ".claude/skills/intent-detection/**"
  - "wiki/index.yaml"
---

# [SHOULD] Routing Enrichment Rules

> **Priority**: SHOULD | **ID**: R019

라우팅 스킬(secretary·dev-lead·de-lead·qa-lead)은 확신도가 90% 미만일 때 `wiki/index.yaml`을 조회해 agent/skill/guide 제안을 `suggested_context`로 프롬프트에 주입해야 합니다(SHOULD, advisory). 스킬은 이 파일을 읽기만 하며(R010) R015 임계값·표시는 바뀌지 않습니다. 위키가 stale하면 품질이 떨어집니다(R022).

<!-- DETAIL: Core Rule, original wording
## Core Rule

Routing skills SHOULD use Wiki-RAG enrichment to improve agent/skill/guide selection accuracy. Enrichment is advisory only.
-->



<!-- DETAIL: Enrichment Layer, original wording
## Enrichment Layer
-->



<!-- DETAIL: Wiki-RAG (wiki index-based), original wording
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
-->

`wiki/index.yaml` 부재·빈 결과는 조용히 건너뛰고 원 프롬프트로 진행하며, 파싱 오류는 조용히 건너뛰고 경고를 로그합니다. **Enrichment failure MUST NOT block or delay routing.**

<!-- DETAIL: Failure Handling, original wording
## Failure Handling

| Scenario | Action |
|----------|--------|
| wiki/index.yaml missing | Skip silently, proceed without wiki enrichment |
| Returns empty | Proceed with unmodified prompt |
| Parsing error | Skip silently, log warning |

**Enrichment failure MUST NOT block or delay routing.** Wiki-RAG is advisory only.
-->



<!-- DETAIL: Scope, original wording
## Scope

| Applies to | Wiki-RAG |
|------------|:--------:|
| secretary-routing | ✓ |
| dev-lead-routing | ✓ |
| de-lead-routing | ✓ |
| qa-lead-routing | ✓ |
-->



<!-- DETAIL: Interaction with Other Rules, original wording
## Interaction with Other Rules

| Rule | Interaction |
|------|-------------|
| R010 | The routing skill reads `wiki/index.yaml` read-only; the spawned subagent receives the enriched prompt |
| R015 | Enrichment does not change R015 confidence thresholds — display behavior unchanged |
| R009 | Wiki lookup adds the extracted suggestions (`suggested_context`) to the prompt; no parallelism impact |
| R022 | Wiki-RAG depends on up-to-date wiki pages — stale wiki reduces enrichment quality |
-->

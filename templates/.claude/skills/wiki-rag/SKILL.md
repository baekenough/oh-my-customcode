---
name: wiki-rag
description: Use the project wiki as RAG knowledge source — search wiki pages to answer codebase questions before exploring raw files
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "<question>"
effort: medium
---

# Wiki RAG Skill

Query the project wiki to answer questions about the codebase. The wiki is a pre-compiled knowledge base — searching it is faster and more accurate than exploring raw source files.

## Usage

```
/omcustom:wiki-rag "how does orchestration work?"
/omcustom:wiki-rag "what agents handle database tasks?"
/omcustom:wiki-rag "explain the compilation metaphor"
```

Also triggered automatically by intent-detection when a user asks about project architecture, agent roles, skill purposes, or rule behavior.

## Workflow

### Step 1: Load Index

Read and parse `wiki/index.yaml` to get the full page catalog. If `wiki/index.yaml` does not exist, report:

```
[wiki-rag] Wiki not initialized. Run /omcustom:wiki first to create wiki/index.yaml.
```

Then abort.

### Step 2: Identify Relevant Pages

From the question and the index, identify 3–7 most relevant wiki pages. Selection criteria:

| Criterion | Detail |
|-----------|--------|
| Title/summary keyword match | Direct term overlap with the question |
| Category relevance | Architecture questions → `architecture/`; agent questions → `agents/` |
| Cross-reference chains | Follow `[[related]]` links to surface adjacent context |

### Step 3: Read Pages (Parallel)

Read identified pages in parallel per R009. Extract sections relevant to the question; ignore unrelated sections to control context size (R013).

### Step 4: Synthesize Answer

Compose a direct answer citing wiki pages inline:

```
[wiki/architecture/orchestration.md] 참조 — 메인 대화가 유일한 오케스트레이터...
```

Answer format:

- **Direct answer first** (2–3 sentences)
- Supporting details from wiki pages
- Inline citations to specific wiki pages (`[wiki/path/to/page.md]`)
- "See also" links for further reading

### Step 5: Evaluate Coverage

After synthesizing, assess whether the wiki alone was sufficient.

| Coverage Level | Condition | Action |
|---------------|-----------|--------|
| Full | Wiki pages answer the question completely | Return wiki-sourced answer |
| Partial | Wiki covers some aspects; gaps remain | Supplement with raw codebase exploration (Read/Glob/Grep); offer to ingest |
| Miss | Wiki has no relevant pages | Full raw exploration; offer to create wiki page |

If raw file exploration was needed, offer to persist the new knowledge:

```
[wiki-rag] This answer required raw file exploration. Save findings to wiki? [Y/n]
```

If yes: delegate wiki page creation/update to the wiki-curator agent (R010 — orchestrator delegates all wiki writes).

### Step 6: Log Query

Insert into `wiki/log.duckdb`:

```bash
duckdb wiki/log.duckdb "INSERT INTO wiki_log (operation, target, pages_consulted, coverage, details) VALUES ('query', '{question}', N, 'full/partial/miss', '{\"fallback\": false, \"new_page_created\": false}');"
```

Log writes are delegated to a subagent (R010).

## Integration with Intent Detection

The following trigger patterns route user questions to wiki-rag automatically:

| Trigger Keywords | Language | Confidence | Action |
|-----------------|----------|------------|--------|
| "어떻게 작동", "how does X work" | KO/EN | 85% | wiki-rag |
| "무슨 에이전트", "which agent" | KO/EN | 80% | wiki-rag |
| "규칙", "rule R0XX" | KO/EN | 75% | wiki-rag |
| "아키텍처", "architecture" | KO/EN | 90% | wiki-rag |
| "워크플로우", "workflow" | KO/EN | 85% | wiki-rag |

Patterns should be registered in `.claude/skills/intent-detection/patterns/agent-triggers.yaml` when that file is updated.

## Fallback Strategy

| Wiki Coverage | Action |
|--------------|--------|
| Full (answer from wiki alone) | Return wiki-sourced answer |
| Partial (wiki + raw files needed) | Supplement with raw exploration, offer to ingest findings |
| Miss (wiki has nothing relevant) | Full raw exploration, offer to create new wiki page |

For partial and miss cases: always acknowledge what the wiki covered before pivoting to raw exploration. Do not silently fall back.

## Execution Rules

| Rule | Requirement |
|------|-------------|
| R000 | Answers to user in Korean; wiki content and citations reference English file paths |
| R009 | Parallel reads for identified wiki pages (Step 3) |
| R010 | All wiki write operations (log.duckdb, new pages) delegated to subagents |
| R013 | Ecomode: return concise answers when context pressure is high; suppress "See also" section |

## What Makes a Good Wiki-RAG Answer

- **Cites specific wiki pages** — not vague "the wiki says..." but `[wiki/agents/mgr-creator.md]`
- **Provides actionable information** — tells the user what to do, not just what exists
- **Links to related pages** for readers who want to go deeper
- **Acknowledges gaps honestly** — never hallucinate content not found in the wiki
- **Offers to improve wiki coverage** when gaps are found — compounding the knowledge base over time

## Integration with /omcustom:wiki

| Skill | Role |
|-------|------|
| `wiki` | Builds and maintains the wiki (ingest, update, lint) |
| `wiki-rag` | Queries the wiki as a RAG source; surfaces gaps; triggers ingest offers |

wiki-rag is the read-path; wiki is the write-path. They share `wiki/index.yaml` and `wiki/log.duckdb` as the coordination layer.

## Integration

| Rule / Skill | Integration |
|--------------|-------------|
| R009 | Parallel page reads in Step 3 |
| R010 | Log writes and wiki page creation delegated to subagents |
| R000 | Korean user responses; English wiki content and paths |
| R013 | Ecomode: suppress extended "See also" section; summary answer only |
| R015 | Intent detection routes architecture/agent/rule questions here at 75–90% confidence |
| wiki | Counterpart write-path skill; wiki-rag triggers ingest offers to wiki when gaps found |
| intent-detection | Registers trigger patterns for auto-routing user questions to wiki-rag |

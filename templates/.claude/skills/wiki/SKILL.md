---
name: wiki
description: Generate and maintain a persistent codebase wiki — LLM-built interlinked markdown knowledge base (Karpathy LLM Wiki pattern)
scope: core
version: 1.0.0
user-invocable: true
argument-hint: "[ingest|query|lint] [args...]"
effort: high
---

<!-- Inspired by Andrej Karpathy's "LLM Wiki" pattern:
     https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
     Core idea: the LLM incrementally builds and maintains a persistent wiki of
     interlinked markdown files — a compounding artifact that grows richer over time. -->

# Wiki Skill

Builds and maintains a persistent, interlinked markdown wiki for the project codebase. Each run is incremental — only pages whose sources changed are rewritten. Over time the wiki becomes the fastest path to codebase understanding for both humans and LLMs.

## Usage

```
/omcustom:wiki                          # Full wiki generation / incremental update
/omcustom:wiki ingest <path>            # Ingest a specific file or directory
/omcustom:wiki ingest .claude/agents/  # Ingest all agent definitions
/omcustom:wiki query <question>         # Query the wiki with natural language
/omcustom:wiki lint                     # Health check — orphans, broken refs, stale pages
```

## Wiki Directory Structure

The wiki lives at `wiki/` in the project root (git-tracked). Create on first run if absent.

```
wiki/
├── index.yaml                 # Structured content catalog — YAML for machine-parseable page index
├── log.duckdb                 # Append-only operation log — DuckDB for SQL-queryable analytics
├── architecture/              # Architecture & design pages
├── agents/                    # Agent documentation pages
├── skills/                    # Skill documentation pages
├── rules/                     # Rule analysis pages
├── guides/                    # Guide summary pages
├── workflows/                 # Workflow & process pages
└── concepts/                  # Cross-cutting concept pages
```

## Operations

### Default — Full Wiki Generation / Incremental Update

Invoked with `/omcustom:wiki` (no arguments).

**Step 1 — Scan codebase structure**

Read the following sources:
- `.claude/agents/*.md` — all agent definitions
- `.claude/skills/*/SKILL.md` — all skill definitions
- `.claude/rules/*.md` — all rule files
- `guides/*/` — all guide directories (read README or first `.md` found)
- `CLAUDE.md` — project overview

**Step 2 — Determine what needs updating (incremental mode)**

For each source file: compare its modification date against the `updated` field of the corresponding wiki page frontmatter (if the page exists). Only regenerate pages where the source is newer than the wiki page, or the wiki page does not yet exist.

On first run, generate all pages.

**Step 3 — Generate wiki pages (parallel, per R009)**

Split work by category across parallel subagents (max 4 concurrent per R009):

| Batch | Categories |
|-------|------------|
| Batch 1 | agents/, skills/ |
| Batch 2 | rules/, guides/ |
| Batch 3 | architecture/, workflows/, concepts/ |

Each subagent:
1. Reads its assigned source files
2. Creates or updates wiki pages following the Wiki Page Format below
3. Writes pages to the correct subdirectory

**Step 4 — Update index.yaml**

After all page batches complete, regenerate `index.yaml` with current page list.

**Step 5 — Insert into log.duckdb**

```
## [YYYY-MM-DD HH:MM] full_update | Full wiki update
- Pages created: N
- Pages updated: M
- Sources scanned: K
```

**Step 6 — Display summary**

```
[wiki] Full update complete
├── Created: N new pages
├── Updated: M pages
├── Unchanged: K pages
└── Index: wiki/index.yaml
```

---

### `ingest <path>` — Targeted Ingest

Ingest one or more specific files or a directory. Useful after adding a new agent or skill.

**Step 1** — Read the specified path(s). If a directory, read all `.md` files within.

**Step 2** — For each source file, determine which wiki pages it should affect:
- Direct page: the primary page for that entity
- Cross-reference pages: pages that link to or depend on this entity

A single source file typically affects 5–15 wiki pages (primary + all pages that reference it).

**Step 3** — Update affected wiki pages: rewrite cross-reference sections in related pages, update the primary page with new content.

**Step 4** — Update `index.yaml` if new pages were created.

**Step 5** — Insert into `log.duckdb`:

```
## [YYYY-MM-DD HH:MM] ingest | <path>
- Source: <path>
- Pages created: N
- Pages updated: M
- Cross-references updated: K
```

---

### `query <question>` — Wiki Query

Answer a natural language question using wiki content as the knowledge base.

**Step 1** — Read and parse `wiki/index.yaml` to identify the 3–7 most relevant pages for the question.

**Step 2** — Read those pages in parallel (R009).

**Step 3** — Synthesize a direct answer. Cite specific wiki pages inline: `[wiki/agents/mgr-creator.md]`.

**Step 4** — If the synthesized answer itself is a valuable insight not captured in any existing page, offer: `"This synthesis could be saved as a new wiki page. Save it? [Y/n]"`

If yes, delegate to the subagent to create the page in `wiki/concepts/`.

**Step 5** — Insert into `log.duckdb`:

```
## [YYYY-MM-DD HH:MM] query | <question>
- Pages consulted: N
- New concept page created: yes/no
```

---

### `lint` — Wiki Health Check

**Step 1 — Collect inventory**

- All wiki pages: glob `wiki/**/*.md` (exclude index.yaml, log.duckdb)
- All links within wiki pages: extract `[[...]]` wikilinks and `[text](path)` markdown links
- All source files: scan `.claude/agents/`, `.claude/skills/`, `.claude/rules/`, `guides/`

**Step 2 — Run checks**

| Check | How to Detect |
|-------|---------------|
| Orphan pages | Wiki pages with zero inbound links from other wiki pages |
| Broken cross-references | `[[page-name]]` or `(path)` link targets that don't exist in `wiki/` |
| Stale pages | Source file modification date newer than page's `updated` frontmatter field |
| Missing pages | Source entities that exist in codebase but have no corresponding wiki page |
| Contradictions | Pages that make conflicting claims about the same entity (heuristic: search for conflicting status/count statements) |

**Step 3 — Report findings**

```
[wiki lint] Health check results
├── Orphan pages (N): wiki/agents/old-agent.md, ...
├── Broken refs (N): wiki/skills/foo.md → [[missing-page]]
├── Stale pages (N): wiki/rules/r007.md (source updated 2026-04-10, wiki 2026-03-15)
├── Missing pages (N): .claude/agents/new-agent.md has no wiki page
└── Contradictions (N): wiki/architecture/overview.md vs wiki/concepts/orchestration.md
```

**Step 4 — Suggest fixes**

For each category: suggest the command to fix (e.g., `/omcustom:wiki ingest .claude/agents/new-agent.md`).

**Step 5 — Insert into log.duckdb**

```
## [YYYY-MM-DD HH:MM] lint | Health check
- Orphans: N | Broken refs: M | Stale: K | Missing: J | Contradictions: L
- Status: HEALTHY / NEEDS ATTENTION
```

---

## Wiki Page Format

Every wiki page follows this template exactly:

```markdown
---
title: Page Title
type: architecture|agent|skill|rule|guide|workflow|concept
updated: YYYY-MM-DD
sources:
  - path/to/source1.md
  - path/to/source2.md
related:
  - [[related-page-1]]
  - [[related-page-2]]
---

# Page Title

Brief description (1-2 sentences).

## Overview

Main content — purpose, key capabilities, design intent.

## Key Details

Specifics: configuration, fields, options, constraints.

## Relationships

- **Depends on**: [[page-a]], [[page-b]]
- **Used by**: [[page-c]]
- **See also**: [[page-d]]

## Sources

- `path/to/source.md` — what was extracted from this source
```

### Wikilink Style

Use BOTH formats for cross-references so the wiki is readable in Obsidian and in standard markdown viewers:

- Wikilinks (Obsidian-compatible): `[[page-name]]`
- Standard markdown links: `[Page Name](../category/page-name.md)`

Example: `[[mgr-creator]]` and `[mgr-creator](../agents/mgr-creator.md)`

---

## index.yaml Format

```yaml
# wiki/index.yaml — Machine-parseable wiki page index
# Updated by /omcustom:wiki after every operation

meta:
  updated: "2026-04-12"
  total_pages: 231
  total_sources: 203

pages:
  architecture:
    - file: architecture/overview.md
      title: System Architecture Overview
      summary: Three-layer structure and compilation metaphor
    - file: architecture/orchestration.md
      title: Orchestration
      summary: Main conversation as sole orchestrator with routing skills

  agents:
    - file: agents/lang-golang-expert.md
      title: Go Language Expert
      summary: Expert Go developer for idiomatic, performant Go code
    # ... one entry per agent

  skills:
    - file: skills/wiki.md
      title: Wiki Skill
      summary: Generate and maintain persistent codebase wiki
    # ... one entry per skill

  rules:
    - file: rules/r000.md
      title: "R000: Language & Delegation Policy"
      summary: Korean I/O, English files, delegation model
    # ... one entry per rule

  guides:
    - file: guides/golang.md
      title: Go Guide
      summary: Reference documentation for Go development
    # ... one entry per guide

  workflows:
    - file: workflows/development-workflow.md
      title: Development Workflow
      summary: Intent detection to implementation pipeline

  concepts:
    - file: concepts/compilation-metaphor.md
      title: Compilation Metaphor
      summary: Core design philosophy mapping software compilation to agent system
```

Advantages over markdown index:
- Machine-parseable: LLMs and scripts can filter by category, search by title
- Structured: each entry has file, title, summary as discrete fields
- Queryable: `yq '.pages.agents[] | select(.title | contains("Go"))'`

---

## log.duckdb Format

The wiki log uses DuckDB — a single-file analytical database for SQL-queryable operation history.

### Schema

```sql
CREATE TABLE IF NOT EXISTS wiki_log (
  id INTEGER PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT current_timestamp,
  operation VARCHAR NOT NULL,     -- 'full_update' | 'ingest' | 'query' | 'lint'
  target VARCHAR,                 -- file path or question text
  pages_created INTEGER DEFAULT 0,
  pages_updated INTEGER DEFAULT 0,
  pages_consulted INTEGER DEFAULT 0,
  coverage VARCHAR,               -- 'full' | 'partial' | 'miss' (for queries)
  details JSON                    -- flexible metadata
);
```

### Writing entries

```bash
duckdb wiki/log.duckdb "INSERT INTO wiki_log (operation, target, pages_created, pages_updated, details) VALUES ('full_update', 'all', 231, 0, '{\"sources_scanned\": 203}');"
```

### Querying

```bash
# Recent operations
duckdb wiki/log.duckdb "SELECT timestamp, operation, target, pages_created FROM wiki_log ORDER BY timestamp DESC LIMIT 10;"

# Query coverage stats
duckdb wiki/log.duckdb "SELECT coverage, COUNT(*) FROM wiki_log WHERE operation='query' GROUP BY coverage;"

# Operations per day
duckdb wiki/log.duckdb "SELECT DATE_TRUNC('day', timestamp) as day, COUNT(*) FROM wiki_log GROUP BY day ORDER BY day;"
```

### Fallback

If `duckdb` CLI is not installed, fall back to appending JSON lines to `wiki/log.jsonl`:
```json
{"timestamp":"2026-04-12T10:00:00","operation":"full_update","target":"all","pages_created":231,"pages_updated":0,"details":{"sources_scanned":203}}
```

Install DuckDB: `brew install duckdb` (macOS) or `pip install duckdb`

---

## Execution Rules

| Rule | Requirement |
|------|-------------|
| R000 | Wiki page content in English; user communication in Korean |
| R009 | Parallel agents for independent category batches (max 4 concurrent) |
| R010 | Orchestrator delegates ALL wiki file writes to subagents |
| R006 | Only SKILL.md is created by this skill; wiki pages are runtime artifacts |
| Git tracking | `wiki/` directory is git-tracked (not in .gitignore) |
| Incremental | On re-runs, skip pages whose sources haven't changed |
| First run | Create `wiki/` directory structure before writing any pages |
| log.duckdb | Always insert; never delete or rewrite existing log entries |

### Parallel Execution Pattern (Full Update)

```
Orchestrator
├── [1] subagent: agents/ category (reads .claude/agents/*.md, writes wiki/agents/*.md)
├── [2] subagent: skills/ category (reads .claude/skills/*/SKILL.md, writes wiki/skills/*.md)
├── [3] subagent: rules/ category (reads .claude/rules/*.md, writes wiki/rules/*.md)
└── [4] subagent: guides/ category (reads guides/*/, writes wiki/guides/*.md)
  [wait for batch 1 to complete]
├── [5] subagent: architecture/ + workflows/ + concepts/ (synthesizes from all sources)
  [wait]
└── [6] subagent: index.yaml + log.duckdb update
```

---

## What Makes a Good Wiki Page

A wiki page is NOT a file summary — it is a synthesized knowledge article. Good pages:

- **Explain purpose and design intent**, not just what fields exist
- **Show relationships** — what depends on this, what this depends on
- **Highlight non-obvious constraints** — gotchas, ordering requirements, exceptions
- **Cross-reference liberally** — 5–10 outbound links per page is healthy
- **Stay concise** — aim for 150–300 words of body text; tables over prose where possible

---

## Tips

- The wiki is just markdown — viewable in Obsidian, VS Code, GitHub, and any markdown renderer
- `wiki/index.yaml` acts as the LLM's "search engine" at moderate scale — keep it accurate
- Over time, the wiki becomes the fastest way to understand the codebase for new contributors and LLMs alike
- Run `lint` regularly (after major structural changes) to keep the wiki healthy
- When a query answer synthesizes something genuinely new, file it as a `concepts/` page — it compounds value
- The `log.duckdb` provides an SQL-queryable audit trail of how the wiki evolved

## Integration

| Rule / Skill | Integration |
|--------------|-------------|
| R009 | Parallel agents for category batches; max 4 concurrent |
| R010 | All wiki writes delegated to subagents; orchestrator reads only |
| R000 | Wiki content in English; responses to user in Korean |
| R013 | Ecomode auto-activates when 4+ parallel agents writing pages |
| R015 | Display operation plan with page counts before execution |
| result-aggregation | Aggregate per-batch page counts for final summary |
| update-docs | Complement: update-docs syncs CLAUDE.md counts; wiki syncs knowledge content |

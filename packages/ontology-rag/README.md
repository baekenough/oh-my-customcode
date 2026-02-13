# ontology-rag

Ontology+RAG context engine for oh-my-customcode agent systems.

## Features

- **Ontology Loading**: Parse YAML ontologies (agents, skills, rules)
- **Graph Traversal**: Navigate dependency graphs with BFS
- **Semantic Routing**: LLM-based agent selection with keyword fallback
- **Hierarchical Loading**: Load context summaries first, expand on-demand
- **Token Budget Management**: Classify query complexity and allocate budgets

## Installation

```bash
# From the ontology-rag directory
pip install -e ".[dev]"
```

## Usage

```python
from ontology_rag import Ontology, OntologyGraph, SemanticRouter, HierarchicalLoader

# Load ontology
onto = Ontology("path/to/ontology")
graph = OntologyGraph("path/to/graphs")

# Route query to agent
router = SemanticRouter(onto, graph)
result = router.route_with_keywords("review golang code")
print(f"Agent: {result.agent}, Confidence: {result.confidence}")

# Load hierarchical context
loader = HierarchicalLoader(onto, graph)
context = loader.load_for_agent(result.agent, token_budget=5000)
print(context.to_context_string())
```

## Architecture

- No external ML dependencies (uses keyword matching + optional LLM)
- Pure Python 3.10+
- Minimal dependencies: pyyaml, networkx, mcp

## Phase 3: GraphRAG Pipeline

### Community Detection

`CommunityEngine` detects communities of related agents, skills, and rules using Louvain algorithm (NetworkX). For small graphs (<20 nodes), falls back to class-based grouping.

```python
from ontology_rag import CommunityEngine, Ontology, OntologyGraph

ontology = Ontology(ontology_dir)
graph = OntologyGraph(ontology_dir / "graphs")
engine = CommunityEngine(ontology, graph)
engine.detect_communities()

# Get community for a node
community = engine.get_community_for_node("lang-golang-expert")
print(community.summary)  # "LanguageExpert: 2 members. Roles: go, golang, python"

# Find relevant communities
relevant = engine.get_relevant_communities(["golang", "review"], top_k=3)
```

### Hybrid Search

`HybridSearcher` combines 4 ranking signals:

| Signal | Weight | Source |
|--------|--------|--------|
| Keyword match | 50% | Inverted index from ontology |
| Graph proximity | 30% | BFS depth from anchor node |
| Community relevance | 15% | Jaccard similarity with community keywords |
| Node importance | 5% | PageRank scores |

```python
from ontology_rag import HybridSearcher

searcher = HybridSearcher(ontology, graph, community_engine=engine)
results = searcher.search("golang review", anchor_node="lang-golang-expert")
# results[0].score, .keyword_score, .graph_score, .community_score, .importance_score

# Multi-hop query
rules = searcher.search_multihop("what rules apply", start_node="lang-golang-expert")
```

### Reranking

`Reranker` adjusts scores using PageRank and diversity penalties:

```
reranked_score = original_score * 0.7 + pagerank_normalized * 0.3 - diversity_penalty
```

### File Change Detection

`OntologyWatcher` detects file changes via mtime comparison (zero dependencies). Optional watchdog support for real-time monitoring.

```python
from ontology_rag import OntologyWatcher

watcher = OntologyWatcher(ontology_dir)
if watcher.check_for_changes():  # < 0.1ms
    # Trigger rebuild
    pass
watcher.mark_rebuilt()
```

## Testing

```bash
# Install with dev dependencies first
pip install -e ".[dev]"

# Run all tests
pytest tests/ -v
```

## MCP Server

The package includes an MCP server for direct integration with Claude Code.

### Running the Server

```bash
# Via entry point (after pip install)
ontology-rag-server

# Via Python module
python -m ontology_rag.mcp_server

# With custom ontology directory
ONTOLOGY_DIR=/path/to/ontology python -m ontology_rag.mcp_server
```

### MCP Tools

| Tool | Description | Input |
|------|-------------|-------|
| `get_relevant_context` | Get ontology context for a query with budget management | `query`, `max_tokens` (optional) |
| `get_agent_for_task` | Route a query to the best agent | `query` |
| `load_skill_with_deps` | Load a skill and its dependencies | `skill_name`, `depth` (optional) |
| `ontology_traverse` | Traverse the ontology graph | `start`, `relation` (optional), `depth` (optional) |
| `rebuild_ontology` | Force rebuild of ontology graph and caches | None |

### MCP Resources

| URI | Description |
|-----|-------------|
| `ontology://schema` | Schema definition with class hierarchies |
| `ontology://agent/{name}` | Agent detail with skills and rules |
| `ontology://rule/{id}` | Rule summary or full markdown text |

### Claude Code Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "ontology-rag": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "ontology_rag.mcp_server"],
      "env": {
        "ONTOLOGY_DIR": ".claude/ontology"
      }
    }
  }
}
```

### Caching

Query results are cached in `{ontology_dir}/.cache/queries.db` (SQLite).

- Exact match: hash-based lookup
- Fuzzy match: Jaccard word-set similarity (threshold: 0.85)
- TTL: 1 hour (configurable via `ONTOLOGY_CACHE_TTL` env var)

### Token Logging

All tool calls are logged to `{ontology_dir}/.cache/token_usage.jsonl` for monitoring.

## Phase 4: Advanced Optimization + Monitoring

### Overview

Phase 4 introduces intelligent context compression, adaptive budgeting, real-time monitoring, and A/B testing to reduce token usage from 3,000 to 1,500 average while maintaining quality.

### Components

#### Context Compressor

`ContextCompressor` uses `RuleDecomposer` to analyze rule markdown structure and extract query-relevant sections:

```python
from ontology_rag import ContextCompressor, RuleDecomposer

compressor = ContextCompressor(RuleDecomposer())
loader = HierarchicalLoader(ontology, graph, compressor=compressor)

# Compression activates when query is provided
context = loader.load_for_agent("lang-golang-expert", token_budget=5000, query="how to create an agent")
print(context.compression_stats)  # {"rules_compressed": 3, "tokens_saved": 1200}
```

#### Adaptive Budget Manager

`AdaptiveBudgetManager` learns from token usage history and adjusts budgets dynamically:

```python
from ontology_rag import AdaptiveBudgetManager

budget_mgr = AdaptiveBudgetManager(token_logger=logger)
analysis = budget_mgr.adapt_from_history(lookback_hours=24)
print(f"Optimal budget: {analysis.optimal_budget} (samples: {analysis.samples})")

# Detect waste
waste = budget_mgr.detect_waste(query="simple fix", used=200, allocated=5000)
if waste:
    print(f"Wasted {waste['waste_pct']}% of budget")
```

#### Monitoring Dashboard

`MonitoringDashboard` provides real-time metrics and phase comparison:

```python
from ontology_rag import MonitoringDashboard

monitor = MonitoringDashboard(token_logger)
monitor.set_baseline(3000.0)  # Phase 3 baseline

snapshot = monitor.get_snapshot(period_hours=24)
print(f"Queries: {snapshot.total_queries}, Tokens: {snapshot.total_tokens}")

comparison = monitor.compare_phases(period_hours=24)
print(f"Improvement: {comparison.improvement_pct}%")

# Generate markdown report
report = monitor.generate_report(period_hours=24)
```

#### A/B Test Runner

`ABTestRunner` manages control vs treatment experiments:

```python
from ontology_rag import ABTestRunner, ABResult

ab_runner = ABTestRunner(cache_dir)

# Record results
ab_runner.record_result(ABResult(
    query="review code", group="control", tokens_used=3000, duration_ms=50.0
))
ab_runner.record_result(ABResult(
    query="review code", group="treatment", tokens_used=1500, duration_ms=40.0
))

summary = ab_runner.get_summary()
print(f"Winner: {summary.winner}, Reduction: {summary.token_reduction_pct}%")
```

### New MCP Tools

| Tool | Description | Input |
|------|-------------|-------|
| `ontology_monitor` | Get monitoring snapshot | `period_hours` (optional) |
| `ontology_compare_phases` | Compare current phase vs baseline | `period_hours` (optional) |
| `ontology_report` | Generate markdown report | `period_hours` (optional) |

### Token Reduction Target

| Phase | Avg Tokens | Strategy |
|-------|------------|----------|
| Phase 3 | 3,000 | Hierarchical loading + caching |
| Phase 4 | 1,500 | + Query-aware compression + adaptive budgets |

## Dependencies

### Required
- `pyyaml>=6.0` — YAML ontology parsing
- `mcp>=1.0.0` — MCP server protocol
- `networkx>=3.0` — Graph algorithms (PageRank, community detection)

### Optional
- `watchdog>=4.0` — Real-time file monitoring (`pip install ontology-rag[watch]`)

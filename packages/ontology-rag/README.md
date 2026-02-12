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
- Only runtime dependency: pyyaml

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

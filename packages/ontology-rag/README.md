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
pytest tests/ -v
```

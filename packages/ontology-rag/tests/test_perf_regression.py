"""Performance regression guard for graph operations.

Ensures BFS and PageRank complete within acceptable time bounds.
These tests use the Python fallback path, so Rust is not required.
"""

import time
import json
import pytest
from pathlib import Path


def _build_synthetic_graph(tmp_path: Path, num_nodes: int = 100, num_edges: int = 300) -> Path:
    """Create a synthetic graph JSON for testing."""
    import random

    random.seed(42)
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir(parents=True)

    node_ids = [f"node_{i}" for i in range(num_nodes)]
    nodes = {nid: {"type": "Agent", "class": "TestNode"} for nid in node_ids}

    edges = []
    edge_set = set()
    attempts = 0
    while len(edges) < num_edges and attempts < num_edges * 10:
        src = random.choice(node_ids)
        tgt = random.choice(node_ids)
        if src != tgt and (src, tgt) not in edge_set:
            edges.append({"source": src, "target": tgt, "relation": "depends_on"})
            edge_set.add((src, tgt))
        attempts += 1

    graph_data = {
        "description": "Synthetic test graph",
        "version": "1.0.0",
        "nodes": nodes,
        "edges": edges,
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


@pytest.fixture
def synthetic_graph_dir(tmp_path):
    return _build_synthetic_graph(tmp_path)


def test_bfs_completes_within_time_limit(synthetic_graph_dir):
    """BFS on 100-node graph must complete within 1 second."""
    from ontology_rag.graph import OntologyGraph

    graph = OntologyGraph(synthetic_graph_dir / "graphs")
    start_node = "node_0"

    t0 = time.perf_counter()
    result = graph.bfs(start_node, max_depth=3)
    elapsed = time.perf_counter() - t0

    assert isinstance(result, dict)
    assert elapsed < 1.0, f"BFS took {elapsed:.3f}s, exceeds 1s limit"


def test_pagerank_completes_within_time_limit(synthetic_graph_dir):
    """PageRank on 100-node graph must complete within 2 seconds."""
    from ontology_rag.graph import OntologyGraph

    graph = OntologyGraph(synthetic_graph_dir / "graphs")

    t0 = time.perf_counter()
    result = graph.pagerank()
    elapsed = time.perf_counter() - t0

    # PageRank returns empty dict when networkx/numpy not available — that's acceptable
    assert isinstance(result, dict)
    assert elapsed < 2.0, f"PageRank took {elapsed:.3f}s, exceeds 2s limit"


def test_neighbors_completes_within_time_limit(synthetic_graph_dir):
    """neighbors() on 100-node graph must complete within 0.1 seconds."""
    from ontology_rag.graph import OntologyGraph

    graph = OntologyGraph(synthetic_graph_dir / "graphs")

    t0 = time.perf_counter()
    for i in range(100):
        graph.neighbors(f"node_{i}")
    elapsed = time.perf_counter() - t0

    assert elapsed < 0.1, f"100 neighbors() calls took {elapsed:.3f}s, exceeds 0.1s limit"


def test_bfs_result_structure(synthetic_graph_dir):
    """BFS returns dict mapping node IDs to integer depths."""
    from ontology_rag.graph import OntologyGraph

    graph = OntologyGraph(synthetic_graph_dir / "graphs")
    result = graph.bfs("node_0", max_depth=2)

    assert "node_0" in result
    assert result["node_0"] == 0
    for node_id, depth in result.items():
        assert isinstance(node_id, str)
        assert isinstance(depth, int)
        assert depth <= 2

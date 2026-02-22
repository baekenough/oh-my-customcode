"""Comprehensive integration tests for the Rust/NetworkX backend dispatch.

Tests the full backend <-> Python integration including:
- Dispatch logic in graph.py (HAS_RUST path via mocked _rust_backend)
- Result parity between mocked-Rust path and pure-Python fallback
- Fallback behavior when NetworkX / Rust are unavailable
- Edge cases: empty graphs, cycles, disconnected components
- ONTOLOGY_RAG_DISABLE_RUST env-var control
- HAS_RUST_BACKEND package export
- hybrid_search.py Rust batch-scoring path via mocked _rust_backend
- Reload state consistency

NOTE: ``ontology_graph_rs`` (the actual Rust native module) is NOT compiled
in this environment.  All tests that exercise the Rust-active path do so by
directly patching ``ontology_rag._rust_backend`` module attributes
(``_rust`` and ``HAS_RUST``), and similarly patching ``HAS_RUST`` in
``ontology_rag.graph`` and ``ontology_rag.hybrid_search`` (which import it at
module load time).
"""

import importlib
import json
import os
import unittest.mock as mock
from collections import deque
from pathlib import Path

import pytest


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_fake_rust():
    """Return a MagicMock that implements Rust algorithms in pure Python.

    The fake implements the same algorithmic contract as the real Rust module so
    that parity tests can compare Rust-path results to the Python-fallback.
    """
    fake = mock.MagicMock()

    def fake_bfs(adjacency, start, max_depth, relation_filter=None):
        visited = {start: 0}
        queue = deque([(start, 0)])
        filter_set = set(relation_filter) if relation_filter else None
        while queue:
            node, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for rel, targets in adjacency.get(node, {}).items():
                if filter_set and rel not in filter_set:
                    continue
                for target in targets:
                    if target not in visited:
                        visited[target] = depth + 1
                        queue.append((target, depth + 1))
        return visited

    def fake_neighbors(adjacency, node_id, relation=None):
        adj = adjacency.get(node_id, {})
        if relation:
            return list(adj.get(relation, []))
        return [n for targets in adj.values() for n in targets]

    def fake_reverse_neighbors(reverse_adjacency, node_id, relation=None):
        radj = reverse_adjacency.get(node_id, {})
        if relation:
            return list(radj.get(relation, []))
        return [n for sources in radj.values() for n in sources]

    def fake_pagerank(node_ids, edges, damping=0.85, max_iter=100, tolerance=1e-6):
        if not node_ids:
            return {}
        n = len(node_ids)
        return {nid: 1.0 / n for nid in node_ids}

    def fake_batch_hybrid_score(
        node_ids, keyword_scores, bfs_depths, community_scores,
        pagerank_scores, weights,
    ):
        kw_w, graph_w, comm_w, imp_w = weights
        pr_values = list(pagerank_scores.values())
        pr_max = max(pr_values) if pr_values else 0.0

        results = []
        for nid in node_ids:
            kw = keyword_scores.get(nid, 0.0)
            depth = bfs_depths.get(nid)
            gs = 1.0 / (depth + 1) if depth is not None else 0.0
            cs = community_scores.get(nid, 0.0)
            pr = pagerank_scores.get(nid, 0.0)
            imp = pr / pr_max if pr_max > 0 else 0.0
            final = kw_w * kw + graph_w * gs + comm_w * cs + imp_w * imp
            results.append((nid, final, kw, gs, cs, imp))
        return results

    fake.bfs = mock.MagicMock(side_effect=fake_bfs)
    fake.neighbors = mock.MagicMock(side_effect=fake_neighbors)
    fake.reverse_neighbors = mock.MagicMock(side_effect=fake_reverse_neighbors)
    fake.pagerank = mock.MagicMock(side_effect=fake_pagerank)
    fake.batch_hybrid_score = mock.MagicMock(side_effect=fake_batch_hybrid_score)
    return fake


def _enable_fake_rust(fake_rust):
    """Patch _rust_backend, graph, and hybrid_search to activate the Rust path."""
    import ontology_rag._rust_backend as rb
    import ontology_rag.graph as graph_mod
    import ontology_rag.hybrid_search as hs_mod

    rb._rust = fake_rust
    rb.HAS_RUST = True
    graph_mod.HAS_RUST = True
    hs_mod.HAS_RUST = True


def _disable_fake_rust():
    """Restore HAS_RUST=False in all modules after a test."""
    import ontology_rag._rust_backend as rb
    import ontology_rag.graph as graph_mod
    import ontology_rag.hybrid_search as hs_mod

    rb._rust = None
    rb.HAS_RUST = False
    graph_mod.HAS_RUST = False
    hs_mod.HAS_RUST = False


# ─── Graph fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def simple_graph_dir(tmp_path):
    """Create a simple test graph for integration testing."""
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()

    graph_data = {
        "description": "Integration test graph",
        "version": "1.0.0",
        "nodes": {
            "A": {"type": "Agent", "class": "TestAgent"},
            "B": {"type": "Skill", "class": "TestSkill"},
            "C": {"type": "Rule", "class": "TestRule"},
            "D": {"type": "Agent", "class": "TestAgent"},
            "E": {"type": "Skill", "class": "TestSkill"},
        },
        "edges": [
            {"source": "A", "target": "B", "relation": "requires"},
            {"source": "A", "target": "C", "relation": "depends_on"},
            {"source": "B", "target": "C", "relation": "depends_on"},
            {"source": "D", "target": "E", "relation": "requires"},
            {"source": "E", "target": "C", "relation": "depends_on"},
        ],
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


@pytest.fixture
def cycle_graph_dir(tmp_path):
    """Create a graph with cycles for testing cycle-handling."""
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()

    graph_data = {
        "description": "Cycle test graph",
        "version": "1.0.0",
        "nodes": {
            "X": {"type": "Agent", "class": "Test"},
            "Y": {"type": "Agent", "class": "Test"},
            "Z": {"type": "Agent", "class": "Test"},
        },
        "edges": [
            {"source": "X", "target": "Y", "relation": "requires"},
            {"source": "Y", "target": "Z", "relation": "requires"},
            {"source": "Z", "target": "X", "relation": "requires"},
        ],
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


@pytest.fixture
def empty_graph_dir(tmp_path):
    """Create an empty graph."""
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()

    graph_data = {
        "description": "Empty graph",
        "version": "1.0.0",
        "nodes": {},
        "edges": [],
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


@pytest.fixture
def single_node_graph_dir(tmp_path):
    """Create a graph with a single isolated node."""
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()

    graph_data = {
        "description": "Single node",
        "version": "1.0.0",
        "nodes": {"solo": {"type": "Agent", "class": "Test"}},
        "edges": [],
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


@pytest.fixture
def large_graph_dir(tmp_path):
    """Create a larger graph for stress testing (200 nodes, ~600 edges)."""
    import random

    random.seed(42)
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()

    num_nodes = 200
    node_ids = [f"node_{i}" for i in range(num_nodes)]
    nodes = {nid: {"type": "Agent", "class": "Test"} for nid in node_ids}

    edges = []
    edge_set: set[tuple[str, str]] = set()
    for _ in range(600):
        src = random.choice(node_ids)
        tgt = random.choice(node_ids)
        if src != tgt and (src, tgt) not in edge_set:
            edges.append({"source": src, "target": tgt, "relation": "depends_on"})
            edge_set.add((src, tgt))

    graph_data = {
        "description": "Large test graph",
        "version": "1.0.0",
        "nodes": nodes,
        "edges": edges,
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_path


# ─── Pure-Python BFS reference ────────────────────────────────────────────────


def _python_bfs(
    adjacency: dict,
    start: str,
    max_depth: int,
    relation_filter: list[str] | None = None,
) -> dict[str, int]:
    """Pure-Python BFS identical to the non-NetworkX fallback in graph.py."""
    visited: dict[str, int] = {start: 0}
    queue: deque[tuple[str, int]] = deque([(start, 0)])

    while queue:
        node, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for rel, targets in adjacency.get(node, {}).items():
            if relation_filter and rel not in relation_filter:
                continue
            for target in targets:
                if target not in visited:
                    visited[target] = depth + 1
                    queue.append((target, depth + 1))

    return visited


def _build_adjacency(graph_dir: Path) -> dict:
    """Build a plain adjacency dict directly from the JSON file."""
    path = graph_dir / "graphs" / "full-graph.json"
    data = json.loads(path.read_text())
    adj: dict[str, dict[str, list[str]]] = {}
    for edge in data.get("edges", []):
        src, tgt, rel = edge["source"], edge["target"], edge["relation"]
        adj.setdefault(src, {}).setdefault(rel, []).append(tgt)
    return adj


# ─── 1. TestDispatchLogic ─────────────────────────────────────────────────────


class TestDispatchLogic:
    """Verify graph.py methods dispatch to the Rust module when HAS_RUST=True."""

    def test_bfs_dispatches_to_rust(self, simple_graph_dir):
        """bfs() must call _rust.bfs when HAS_RUST=True."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.bfs("A", max_depth=2)
            fake_rust.bfs.assert_called_once()
            assert isinstance(result, dict)
            assert "A" in result
        finally:
            _disable_fake_rust()

    def test_neighbors_dispatches_to_rust(self, simple_graph_dir):
        """neighbors() must call _rust.neighbors when HAS_RUST=True."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.neighbors("A", "requires")
            fake_rust.neighbors.assert_called_once()
            assert "B" in result
        finally:
            _disable_fake_rust()

    def test_reverse_neighbors_dispatches_to_rust(self, simple_graph_dir):
        """reverse_neighbors() must call _rust.reverse_neighbors when HAS_RUST=True."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.reverse_neighbors("C", "depends_on")
            fake_rust.reverse_neighbors.assert_called_once()
            assert set(result) >= {"A", "B"}
        finally:
            _disable_fake_rust()

    def test_pagerank_dispatches_to_rust(self, simple_graph_dir):
        """pagerank() must call _rust.pagerank when HAS_RUST=True."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.pagerank()
            fake_rust.pagerank.assert_called_once()
            assert isinstance(result, dict)
        finally:
            _disable_fake_rust()

    def test_bfs_falls_back_when_rust_disabled(self, simple_graph_dir):
        """bfs() must use the Python/NetworkX fallback when HAS_RUST=False."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        # HAS_RUST is already False in this environment
        result = graph.bfs("A", max_depth=2)
        assert isinstance(result, dict)
        assert result["A"] == 0
        assert "B" in result

    def test_neighbors_falls_back_when_rust_disabled(self, simple_graph_dir):
        """neighbors() must use the Python/NetworkX fallback when HAS_RUST=False."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.neighbors("A", "requires")
        assert "B" in result

    def test_pagerank_falls_back_when_rust_disabled(self, simple_graph_dir):
        """pagerank() must use NetworkX fallback when HAS_RUST=False."""
        from ontology_rag.graph import OntologyGraph, HAS_NETWORKX

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.pagerank()
        if HAS_NETWORKX:
            assert isinstance(result, dict)
        else:
            assert result == {}


# ─── 2. TestResultParity ──────────────────────────────────────────────────────


class TestResultParity:
    """Verify fake-Rust path and pure-Python fallback produce identical results."""

    def test_bfs_results_identical(self, simple_graph_dir):
        """BFS results via mocked Rust must match the pure-Python BFS."""
        from ontology_rag.graph import OntologyGraph

        adjacency = _build_adjacency(simple_graph_dir)
        py_result = _python_bfs(adjacency, "A", max_depth=3)

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            rust_result = graph.bfs("A", max_depth=3)
        finally:
            _disable_fake_rust()

        assert rust_result == py_result

    def test_bfs_with_relation_filter_identical(self, simple_graph_dir):
        """BFS with relation filter must match between Rust path and pure-Python."""
        from ontology_rag.graph import OntologyGraph

        adjacency = _build_adjacency(simple_graph_dir)
        py_result = _python_bfs(
            adjacency, "A", max_depth=3, relation_filter=["requires"]
        )

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            rust_result = graph.bfs("A", max_depth=3, relation_filter=["requires"])
        finally:
            _disable_fake_rust()

        assert rust_result == py_result

    def test_neighbors_results_identical(self, simple_graph_dir):
        """neighbors() via mocked Rust must match the raw adjacency list."""
        from ontology_rag.graph import OntologyGraph

        adjacency = _build_adjacency(simple_graph_dir)
        py_result = sorted(
            [n for targets in adjacency.get("A", {}).values() for n in targets]
        )

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            rust_result = sorted(graph.neighbors("A"))
        finally:
            _disable_fake_rust()

        assert rust_result == py_result

    def test_neighbors_with_relation_filter_identical(self, simple_graph_dir):
        """neighbors() with relation filter must match the raw adjacency data."""
        from ontology_rag.graph import OntologyGraph

        adjacency = _build_adjacency(simple_graph_dir)
        py_result = sorted(adjacency.get("A", {}).get("requires", []))

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            rust_result = sorted(graph.neighbors("A", "requires"))
        finally:
            _disable_fake_rust()

        assert rust_result == py_result

    def test_pagerank_sums_to_one_in_both_paths(self, simple_graph_dir):
        """PageRank from mocked Rust must sum to approximately 1.0."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(simple_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.pagerank()
        finally:
            _disable_fake_rust()

        assert isinstance(result, dict)
        if result:
            total = sum(result.values())
            assert abs(total - 1.0) < 0.01, f"PageRank sum = {total}"


# ─── 3. TestEdgeCases ─────────────────────────────────────────────────────────


class TestEdgeCases:
    """Test edge cases for BFS and graph operations."""

    def test_empty_graph_bfs_nonexistent_node(self, empty_graph_dir):
        """BFS from a nonexistent node in an empty graph returns only the start."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(empty_graph_dir / "graphs")
        result = graph.bfs("nonexistent", max_depth=2)
        assert isinstance(result, dict)
        assert result.get("nonexistent") == 0

    def test_empty_graph_neighbors_returns_empty(self, empty_graph_dir):
        """neighbors() on an empty graph returns an empty list."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(empty_graph_dir / "graphs")
        result = graph.neighbors("nonexistent")
        assert result == []

    def test_empty_graph_pagerank_returns_empty(self, empty_graph_dir):
        """pagerank() on an empty graph returns an empty dict."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(empty_graph_dir / "graphs")
        result = graph.pagerank()
        assert result == {}

    def test_single_node_bfs_returns_only_start(self, single_node_graph_dir):
        """BFS on a single-node graph returns only the start node."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(single_node_graph_dir / "graphs")
        result = graph.bfs("solo", max_depth=2)
        assert result == {"solo": 0}

    def test_single_node_neighbors_returns_empty(self, single_node_graph_dir):
        """neighbors() on an isolated node returns an empty list."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(single_node_graph_dir / "graphs")
        result = graph.neighbors("solo")
        assert result == []

    def test_cycle_bfs_no_infinite_loop(self, cycle_graph_dir):
        """BFS on a cyclic graph must terminate and visit each node once."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(cycle_graph_dir / "graphs")
        result = graph.bfs("X", max_depth=10)
        assert len(result) == 3
        assert result["X"] == 0
        assert result["Y"] == 1
        assert result["Z"] == 2

    def test_cycle_bfs_rust_path_no_infinite_loop(self, cycle_graph_dir):
        """Rust-path BFS on a cyclic graph must terminate without looping."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(cycle_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.bfs("X", max_depth=10)
        finally:
            _disable_fake_rust()

        assert isinstance(result, dict)
        assert result["X"] == 0

    def test_bfs_zero_max_depth_returns_only_start(self, simple_graph_dir):
        """BFS with max_depth=0 returns only the starting node."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.bfs("A", max_depth=0)
        assert result == {"A": 0}

    def test_nonexistent_node_neighbors_returns_empty(self, simple_graph_dir):
        """neighbors() for a node not in the graph returns an empty list."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.neighbors("does-not-exist")
        assert result == []

    def test_nonexistent_node_reverse_neighbors_returns_empty(self, simple_graph_dir):
        """reverse_neighbors() for a node not in the graph returns an empty list."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.reverse_neighbors("does-not-exist")
        assert result == []

    def test_large_graph_bfs_completes(self, large_graph_dir):
        """BFS on a 200-node graph must complete without error."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(large_graph_dir / "graphs")
        result = graph.bfs("node_0", max_depth=5)
        assert isinstance(result, dict)
        assert "node_0" in result
        assert result["node_0"] == 0

    def test_large_graph_bfs_rust_path_completes(self, large_graph_dir):
        """BFS via Rust path on a 200-node graph must complete without error."""
        from ontology_rag.graph import OntologyGraph

        fake_rust = _make_fake_rust()
        graph = OntologyGraph(large_graph_dir / "graphs")
        try:
            _enable_fake_rust(fake_rust)
            result = graph.bfs("node_0", max_depth=5)
        finally:
            _disable_fake_rust()

        assert isinstance(result, dict)
        assert result["node_0"] == 0

    def test_disconnected_components_bfs(self, simple_graph_dir):
        """BFS from node D must not reach nodes in the A-B component."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result = graph.bfs("D", max_depth=5)
        assert "D" in result
        assert "E" in result
        assert "C" in result
        assert "A" not in result
        assert "B" not in result


# ─── 4. TestEnvControl ────────────────────────────────────────────────────────


class TestEnvControl:
    """Verify ONTOLOGY_RAG_DISABLE_RUST env-var disables the Rust backend."""

    def test_disable_rust_env_var_forces_has_rust_false(self):
        """ONTOLOGY_RAG_DISABLE_RUST=1 must set HAS_RUST=False after reload."""
        import ontology_rag._rust_backend as rb

        original_has_rust = rb.HAS_RUST
        original_rust = rb._rust
        try:
            with mock.patch.dict(os.environ, {"ONTOLOGY_RAG_DISABLE_RUST": "1"}):
                importlib.reload(rb)
                assert rb.HAS_RUST is False
        finally:
            rb.HAS_RUST = original_has_rust
            rb._rust = original_rust

    def test_all_functions_return_none_when_disabled(self):
        """All _rust_backend functions return None when ONTOLOGY_RAG_DISABLE_RUST=1."""
        import ontology_rag._rust_backend as rb

        original_has_rust = rb.HAS_RUST
        original_rust = rb._rust
        try:
            with mock.patch.dict(os.environ, {"ONTOLOGY_RAG_DISABLE_RUST": "1"}):
                importlib.reload(rb)
                assert rb.bfs({}, "start", 2) is None
                assert rb.neighbors({}, "node") is None
                assert rb.reverse_neighbors({}, "node") is None
                assert rb.pagerank([], []) is None
                assert rb.batch_hybrid_score(
                    [], {}, {}, {}, {}, (0.5, 0.3, 0.15, 0.05)
                ) is None
        finally:
            rb.HAS_RUST = original_has_rust
            rb._rust = original_rust


# ─── 5. TestReloadState ───────────────────────────────────────────────────────


class TestReloadState:
    """Verify graph operations produce consistent results before and after reload."""

    def test_bfs_consistent_after_reload(self, simple_graph_dir):
        """BFS results must be identical before and after reload()."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result_before = graph.bfs("A", max_depth=2)
        graph.reload()
        result_after = graph.bfs("A", max_depth=2)
        assert result_before == result_after

    def test_neighbors_consistent_after_reload(self, simple_graph_dir):
        """neighbors() must produce the same list before and after reload()."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result_before = sorted(graph.neighbors("A"))
        graph.reload()
        result_after = sorted(graph.neighbors("A"))
        assert result_before == result_after

    def test_pagerank_consistent_after_reload(self, simple_graph_dir):
        """pagerank() must produce approximately equal values after reload()."""
        from ontology_rag.graph import OntologyGraph, HAS_NETWORKX

        if not HAS_NETWORKX:
            pytest.skip("NetworkX not installed")

        graph = OntologyGraph(simple_graph_dir / "graphs")
        result_before = graph.pagerank()
        graph.reload()
        result_after = graph.pagerank()

        for node_id, score in result_before.items():
            assert node_id in result_after
            assert abs(score - result_after[node_id]) < 1e-9

    def test_node_count_consistent_after_reload(self, simple_graph_dir):
        """Node count must be identical before and after reload()."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        count_before = len(graph.nodes)
        graph.reload()
        count_after = len(graph.nodes)
        assert count_before == count_after

    def test_adjacency_cache_cleared_on_reload(self, simple_graph_dir):
        """_adjacency_cache must be None immediately after reload()."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        _ = graph.adjacency  # Populate cache
        assert graph._adjacency_cache is not None

        graph.reload()
        assert graph._adjacency_cache is None


# ─── 6. TestHybridSearchRustPath ─────────────────────────────────────────────


class TestHybridSearchRustPath:
    """Test HybridSearcher integration with the mocked Rust batch-scoring path."""

    def test_search_works_with_rust_disabled(self, sample_ontology_dir):
        """search() must return results even without Rust (pure-Python path)."""
        from ontology_rag.ontology import Ontology
        from ontology_rag.graph import OntologyGraph
        from ontology_rag.hybrid_search import HybridSearcher

        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        searcher = HybridSearcher(ontology, graph)

        results = searcher.search("golang", top_k=5)
        assert len(results) > 0
        assert results[0].node_id == "lang-golang-expert"

    def test_search_dispatches_to_batch_hybrid_score_when_rust_active(
        self, sample_ontology_dir
    ):
        """search() must call _rust.batch_hybrid_score when HAS_RUST=True."""
        from ontology_rag.ontology import Ontology
        from ontology_rag.graph import OntologyGraph
        from ontology_rag.hybrid_search import HybridSearcher

        fake_rust = _make_fake_rust()
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        searcher = HybridSearcher(ontology, graph)

        try:
            _enable_fake_rust(fake_rust)
            results = searcher.search("golang", top_k=5)
            fake_rust.batch_hybrid_score.assert_called_once()
            assert len(results) > 0
        finally:
            _disable_fake_rust()

    def test_top_result_ordering_consistent_between_rust_and_python(
        self, sample_ontology_dir
    ):
        """Top result must be the same whether using Rust path or Python path."""
        from ontology_rag.ontology import Ontology
        from ontology_rag.graph import OntologyGraph
        from ontology_rag.hybrid_search import HybridSearcher

        ontology = Ontology(sample_ontology_dir)

        # Python fallback result
        graph_py = OntologyGraph(sample_ontology_dir / "graphs")
        searcher_py = HybridSearcher(ontology, graph_py)
        py_results = searcher_py.search("golang", top_k=5)
        py_top = py_results[0].node_id if py_results else None

        # Rust path result
        fake_rust = _make_fake_rust()
        graph_rust = OntologyGraph(sample_ontology_dir / "graphs")
        searcher_rust = HybridSearcher(ontology, graph_rust)
        try:
            _enable_fake_rust(fake_rust)
            rust_results = searcher_rust.search("golang", top_k=5)
            rust_top = rust_results[0].node_id if rust_results else None
        finally:
            _disable_fake_rust()

        assert py_top == rust_top, (
            f"Top result mismatch: Python={py_top}, Rust={rust_top}"
        )


# ─── 7. TestInitExports ───────────────────────────────────────────────────────


class TestInitExports:
    """Verify HAS_RUST_BACKEND is correctly exported from the ontology_rag package."""

    def test_has_rust_backend_exported_from_package(self):
        """HAS_RUST_BACKEND must be a bool accessible from ontology_rag."""
        import ontology_rag

        assert hasattr(ontology_rag, "HAS_RUST_BACKEND")
        assert isinstance(ontology_rag.HAS_RUST_BACKEND, bool)

    def test_has_rust_backend_in_all(self):
        """HAS_RUST_BACKEND must appear in ontology_rag.__all__."""
        import ontology_rag

        assert "HAS_RUST_BACKEND" in ontology_rag.__all__


# ─── 8. TestHasNetworkxFlag ───────────────────────────────────────────────────


class TestHasNetworkxFlag:
    """Verify the HAS_NETWORKX flag governs dispatch at module level."""

    def test_has_networkx_is_bool(self):
        """HAS_NETWORKX must be a plain bool."""
        from ontology_rag.graph import HAS_NETWORKX

        assert isinstance(HAS_NETWORKX, bool)

    def test_has_networkx_exported_from_init(self):
        """HAS_NETWORKX must be exported from the package __init__."""
        import ontology_rag

        assert hasattr(ontology_rag, "HAS_NETWORKX")
        assert isinstance(ontology_rag.HAS_NETWORKX, bool)

    def test_has_networkx_in_all(self):
        """HAS_NETWORKX must appear in __all__."""
        import ontology_rag

        assert "HAS_NETWORKX" in ontology_rag.__all__

    def test_pagerank_empty_when_networkx_flag_false(
        self, simple_graph_dir, monkeypatch
    ):
        """pagerank() must return {} when HAS_NETWORKX is False."""
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        assert graph.pagerank() == {}

    def test_get_nx_graph_none_when_networkx_flag_false(
        self, simple_graph_dir, monkeypatch
    ):
        """get_nx_graph() must return None when HAS_NETWORKX is False."""
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        assert graph.get_nx_graph() is None

    def test_get_undirected_none_when_networkx_flag_false(
        self, simple_graph_dir, monkeypatch
    ):
        """get_undirected() must return None when HAS_NETWORKX is False."""
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        assert graph.get_undirected() is None

    def test_adjacency_empty_when_networkx_absent_at_load(
        self, simple_graph_dir, monkeypatch
    ):
        """When HAS_NETWORKX is False at load time, adjacency must be empty.

        graph.py stores edges exclusively in the NetworkX DiGraph during
        _load().  When NetworkX is unavailable at construction, no edge data is
        stored anywhere, so the adjacency property returns an empty dict.
        """
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        assert graph.adjacency == {}

    def test_reverse_adjacency_empty_when_networkx_absent_at_load(
        self, simple_graph_dir, monkeypatch
    ):
        """When HAS_NETWORKX is False at load time, reverse_adjacency must be empty."""
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        assert graph.reverse_adjacency == {}

    def test_adjacency_populated_when_networkx_available(self, simple_graph_dir):
        """When NetworkX is available, adjacency is correctly populated from edges."""
        from ontology_rag.graph import OntologyGraph, HAS_NETWORKX

        if not HAS_NETWORKX:
            pytest.skip("NetworkX not installed")

        graph = OntologyGraph(simple_graph_dir / "graphs")
        adj = graph.adjacency
        assert "B" in adj.get("A", {}).get("requires", [])


# ─── 9. TestSubgraphAndPaths ─────────────────────────────────────────────────


class TestSubgraphAndPaths:
    """Verify subgraph extraction and path finding work across both backends."""

    def test_subgraph_contains_start_node(self, simple_graph_dir):
        """subgraph() must always include the start node."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        sub = graph.subgraph("A", max_depth=2)
        assert "A" in sub["nodes"]

    def test_subgraph_edges_within_reachable(self, simple_graph_dir):
        """All edges in subgraph() must connect nodes within the subgraph."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        sub = graph.subgraph("A", max_depth=2)
        node_ids = set(sub["nodes"].keys())
        for edge in sub["edges"]:
            assert edge.source in node_ids
            assert edge.target in node_ids

    def test_find_path_returns_valid_path(self, simple_graph_dir):
        """find_path() must return a path from start to end inclusive."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        path = graph.find_path("A", "C")
        assert path is not None
        assert path[0] == "A"
        assert path[-1] == "C"

    def test_find_path_no_path_returns_none(self, simple_graph_dir):
        """find_path() must return None when no path exists."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        # C has no outgoing edges; no path from C to A
        path = graph.find_path("C", "A", max_depth=2)
        assert path is None

    def test_find_path_same_node(self, simple_graph_dir):
        """find_path(x, x) must return [x]."""
        from ontology_rag.graph import OntologyGraph

        graph = OntologyGraph(simple_graph_dir / "graphs")
        path = graph.find_path("A", "A")
        assert path == ["A"]

    def test_find_path_returns_none_when_networkx_absent_at_load(
        self, simple_graph_dir, monkeypatch
    ):
        """find_path() returns None when no edge data is available.

        When HAS_NETWORKX is False at construction, _load() stores no edges.
        find_path() calls neighbors() internally, which returns [] for every
        node.  With an empty adjacency, no path can be found.
        """
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        path = graph.find_path("A", "C")
        assert path is None

    def test_find_path_same_node_works_without_networkx(
        self, simple_graph_dir, monkeypatch
    ):
        """find_path(x, x) must return [x] even when NetworkX is absent."""
        import ontology_rag.graph as graph_mod

        monkeypatch.setattr(graph_mod, "HAS_NETWORKX", False)
        graph = graph_mod.OntologyGraph(simple_graph_dir / "graphs")
        path = graph.find_path("A", "A")
        assert path == ["A"]

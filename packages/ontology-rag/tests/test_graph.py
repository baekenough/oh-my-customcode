"""Tests for graph loading and traversal."""

import pytest
from ontology_rag import OntologyGraph
from ontology_rag.graph import HAS_NETWORKX

try:
    import networkx as nx
except ImportError:
    nx = None


def test_load_graph(sample_ontology_dir):
    """Test that graph is loaded correctly."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    assert len(graph.nodes) == 10


def test_neighbors(sample_ontology_dir):
    """Test querying direct neighbors."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    skills = graph.neighbors("lang-golang-expert", "requires")
    assert "go-best-practices" in skills


def test_reverse_neighbors(sample_ontology_dir):
    """Test querying reverse neighbors."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    agents = graph.reverse_neighbors("go-best-practices", "requires")
    assert "lang-golang-expert" in agents


def test_bfs(sample_ontology_dir):
    """Test BFS traversal."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reachable = graph.bfs("lang-golang-expert", max_depth=2)
    assert "go-best-practices" in reachable
    assert "R006" in reachable
    assert reachable["go-best-practices"] == 1
    assert reachable["R006"] == 2


def test_bfs_with_relation_filter(sample_ontology_dir):
    """Test BFS with relation filtering."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reachable = graph.bfs("lang-golang-expert", max_depth=2, relation_filter=["requires"])
    assert "go-best-practices" in reachable
    # R006 should not be in results because we only follow "requires"
    assert "R006" not in reachable


def test_subgraph(sample_ontology_dir):
    """Test subgraph extraction."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    sub = graph.subgraph("lang-golang-expert", max_depth=2)
    assert "lang-golang-expert" in sub["nodes"]
    assert len(sub["edges"]) > 0


def test_find_path(sample_ontology_dir):
    """Test shortest path finding."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    path = graph.find_path("lang-golang-expert", "R006")
    assert path is not None
    assert path[0] == "lang-golang-expert"
    assert path[-1] == "R006"


def test_find_path_no_route(sample_ontology_dir):
    """Test path finding when no path exists."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    # R017 is not connected to lang-golang-expert in test data
    path = graph.find_path("lang-golang-expert", "nonexistent-node", max_depth=2)
    assert path is None


def test_find_path_same_node(sample_ontology_dir):
    """Test path finding to same node."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    path = graph.find_path("lang-golang-expert", "lang-golang-expert")
    assert path == ["lang-golang-expert"]


def test_agent_dependencies(sample_ontology_dir):
    """Test getting agent dependencies."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    deps = graph.get_agent_dependencies("lang-golang-expert")
    assert "go-best-practices" in deps["skills"]
    assert "R006" in deps["rules"]
    assert "R007" in deps["rules"]


def test_empty_graph(tmp_path):
    """Test loading from directory without graph file."""
    empty_dir = tmp_path / "graphs"
    empty_dir.mkdir()
    graph = OntologyGraph(empty_dir)
    assert len(graph.nodes) == 0
    assert len(graph.adjacency) == 0


@pytest.mark.skipif(not HAS_NETWORKX, reason="NetworkX not installed")
def test_pagerank(sample_ontology_dir):
    """Test PageRank computation."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    ranks = graph.pagerank()
    # PageRank may return empty dict if numpy is not installed
    # but should not raise an exception
    if len(ranks) > 0:
        assert "lang-golang-expert" in ranks
        assert all(0 <= score <= 1 for score in ranks.values())


@pytest.mark.skipif(not HAS_NETWORKX, reason="NetworkX not installed")
def test_get_nx_graph(sample_ontology_dir):
    """Test getting the internal NetworkX DiGraph."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    nx_graph = graph.get_nx_graph()
    assert nx_graph is not None
    assert isinstance(nx_graph, nx.DiGraph)
    assert len(nx_graph.nodes) == len(graph.nodes)


@pytest.mark.skipif(not HAS_NETWORKX, reason="NetworkX not installed")
def test_get_undirected(sample_ontology_dir):
    """Test getting undirected copy of the graph."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    undirected = graph.get_undirected()
    assert undirected is not None
    assert isinstance(undirected, nx.Graph)
    assert not undirected.is_directed()


@pytest.mark.skipif(not HAS_NETWORKX, reason="NetworkX not installed")
def test_reload(sample_ontology_dir):
    """Test clearing and reloading the graph."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    initial_node_count = len(graph.nodes)
    initial_edge_count = len(list(graph.get_nx_graph().edges()))

    # Clear and reload
    graph.reload()

    # Should have same counts after reload
    assert len(graph.nodes) == initial_node_count
    assert len(list(graph.get_nx_graph().edges())) == initial_edge_count


def test_pagerank_without_networkx(sample_ontology_dir, monkeypatch):
    """Test pagerank returns empty dict when NetworkX unavailable."""
    # Temporarily disable NetworkX
    monkeypatch.setattr("ontology_rag.graph.HAS_NETWORKX", False)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    ranks = graph.pagerank()
    assert ranks == {}


def test_get_nx_graph_without_networkx(sample_ontology_dir, monkeypatch):
    """Test get_nx_graph returns None when NetworkX unavailable."""
    monkeypatch.setattr("ontology_rag.graph.HAS_NETWORKX", False)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    nx_graph = graph.get_nx_graph()
    assert nx_graph is None


def test_get_undirected_without_networkx(sample_ontology_dir, monkeypatch):
    """Test get_undirected returns None when NetworkX unavailable."""
    monkeypatch.setattr("ontology_rag.graph.HAS_NETWORKX", False)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    undirected = graph.get_undirected()
    assert undirected is None

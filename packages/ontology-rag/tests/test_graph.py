"""Tests for graph loading and traversal."""

from ontology_rag import OntologyGraph


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

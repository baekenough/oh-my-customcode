"""Tests for hybrid search module."""

import pytest
from ontology_rag.ontology import Ontology
from ontology_rag.graph import OntologyGraph
from ontology_rag.hybrid_search import HybridSearcher, SearchResult, _strip_korean_particles


@pytest.fixture
def ontology_with_graph(sample_ontology_dir):
    """Create Ontology and Graph instances from sample data."""
    ontology = Ontology(sample_ontology_dir)
    graphs_dir = sample_ontology_dir / "graphs"
    graph = OntologyGraph(graphs_dir)
    return ontology, graph


@pytest.fixture
def searcher(ontology_with_graph):
    """Create HybridSearcher instance."""
    ontology, graph = ontology_with_graph
    return HybridSearcher(ontology, graph, community_engine=None)


def test_search_returns_results(searcher):
    """Test that basic search returns non-empty list."""
    results = searcher.search("golang", top_k=5)

    assert isinstance(results, list)
    assert len(results) > 0
    assert all(isinstance(r, SearchResult) for r in results)


def test_search_keyword_match(searcher):
    """Test that 'golang' query returns lang-golang-expert first."""
    results = searcher.search("golang", top_k=5)

    assert len(results) > 0
    # The first result should be lang-golang-expert due to keyword match
    assert results[0].node_id == "lang-golang-expert"
    assert results[0].keyword_score > 0.0


def test_search_python_match(searcher):
    """Test that 'python' query returns lang-python-expert first."""
    results = searcher.search("python", top_k=5)

    assert len(results) > 0
    # The first result should be lang-python-expert
    assert results[0].node_id == "lang-python-expert"
    assert results[0].keyword_score > 0.0


def test_search_result_structure(searcher):
    """Test that SearchResult has all required score fields."""
    results = searcher.search("go", top_k=1)

    assert len(results) > 0
    result = results[0]

    # Check all fields are present
    assert hasattr(result, "node_id")
    assert hasattr(result, "node_type")
    assert hasattr(result, "score")
    assert hasattr(result, "keyword_score")
    assert hasattr(result, "graph_score")
    assert hasattr(result, "community_score")
    assert hasattr(result, "importance_score")

    # Check score is combination of all components
    assert isinstance(result.score, float)
    assert result.score >= 0.0


def test_search_with_anchor(searcher):
    """Test that anchor node boosts graph score for nearby nodes."""
    # Search with lang-golang-expert as anchor
    results_with_anchor = searcher.search(
        "best practices", anchor_node="lang-golang-expert", top_k=10
    )

    # Find go-best-practices in results
    go_bp_result = next(
        (r for r in results_with_anchor if r.node_id == "go-best-practices"), None
    )

    assert go_bp_result is not None
    # Graph score should be > 0 because go-best-practices is connected to lang-golang-expert
    assert go_bp_result.graph_score > 0.0


def test_search_entity_type_filter(searcher):
    """Test that filter by 'Agent' returns only agents."""
    results = searcher.search("golang", entity_type="Agent", top_k=10)

    assert len(results) > 0
    # All results should be agents
    assert all(r.node_type == "Agent" for r in results)


def test_search_top_k_limit(searcher):
    """Test that results are limited to top_k."""
    top_k = 3
    results = searcher.search("go python agent", top_k=top_k)

    # Should return at most top_k results
    assert len(results) <= top_k


def test_search_multihop(searcher):
    """Test multi-hop search finds rules reachable from agent."""
    # Start from lang-golang-expert, find rules it depends on
    results = searcher.search_multihop(
        query="rules", start_node="lang-golang-expert", max_hops=3, top_k=10
    )

    # Should find R006 and R007 (connected via go-best-practices)
    rule_ids = [r.node_id for r in results]

    assert "R006" in rule_ids or "R007" in rule_ids
    # Graph scores should be based on hop distance
    for result in results:
        if result.node_id in ("R006", "R007"):
            # These are 2 hops away: agent -> skill -> rule
            # graph_score = 1/(depth+1) = 1/3 ≈ 0.33
            assert result.graph_score > 0.0


def test_search_no_match(searcher):
    """Test that nonsense query returns empty or low-score results."""
    results = searcher.search("xyzzy123nonexistent", top_k=10)

    # Either empty or all have zero keyword score
    if results:
        assert all(r.keyword_score == 0.0 for r in results)


def test_rebuild_index(searcher, ontology_with_graph):
    """Test that after rebuild, search still works."""
    # Initial search
    results1 = searcher.search("golang", top_k=3)
    assert len(results1) > 0

    # Rebuild index
    searcher.rebuild_index()

    # Search again
    results2 = searcher.search("golang", top_k=3)
    assert len(results2) > 0

    # Results should be the same
    assert results1[0].node_id == results2[0].node_id


# ---------------------------------------------------------------------------
# Korean particle stripping unit tests
# ---------------------------------------------------------------------------


class TestStripKoreanParticles:
    """Unit tests for _strip_korean_particles."""

    def test_strips_ro(self):
        assert _strip_korean_particles("go로") == "go"

    def test_strips_euro_ro(self):
        assert _strip_korean_particles("서버로") == "서버"

    def test_strips_reul(self):
        assert _strip_korean_particles("서버를") == "서버"

    def test_strips_eul(self):
        assert _strip_korean_particles("코드를") == "코드"

    def test_strips_neun(self):
        assert _strip_korean_particles("파이썬은") == "파이썬"

    def test_strips_eseo(self):
        assert _strip_korean_particles("팀에서") == "팀"

    def test_no_particle_unchanged(self):
        assert _strip_korean_particles("golang") == "golang"

    def test_no_particle_korean_unchanged(self):
        # "파이썬" has no trailing particle
        assert _strip_korean_particles("파이썬") == "파이썬"

    def test_does_not_strip_entire_word(self):
        # "로" alone should not strip to empty string
        assert _strip_korean_particles("로") == "로"

    def test_longest_particle_first(self):
        # "으로부터" should be stripped before "으로" or "부터"
        assert _strip_korean_particles("서버으로부터") == "서버"

    def test_euroseo_stripped(self):
        assert _strip_korean_particles("팀에서부터") == "팀"


# ---------------------------------------------------------------------------
# Korean particle handling in hybrid search
# ---------------------------------------------------------------------------


def test_search_korean_particle_ro(searcher):
    """'go로' should match lang-golang-expert via particle stripping."""
    results_with_particle = searcher.search("go로", top_k=5)
    results_exact = searcher.search("go", top_k=5)

    # Both should find lang-golang-expert
    particle_ids = [r.node_id for r in results_with_particle]
    assert "lang-golang-expert" in particle_ids

    # Keyword score with particle should be slightly lower than exact
    golang_exact = next(r for r in results_exact if r.node_id == "lang-golang-expert")
    golang_particle = next(
        r for r in results_with_particle if r.node_id == "lang-golang-expert"
    )
    assert golang_particle.keyword_score <= golang_exact.keyword_score


def test_search_korean_sentence(searcher):
    """'go로 rest api 서버를 만들어줘' should still match lang-golang-expert."""
    results = searcher.search("go로 rest api 서버를 만들어줘", top_k=5)
    node_ids = [r.node_id for r in results]
    assert "lang-golang-expert" in node_ids

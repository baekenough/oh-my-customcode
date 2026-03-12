"""Tests for semantic routing."""

from ontology_rag import Ontology, OntologyGraph, SemanticRouter
from ontology_rag.hybrid_search import HybridSearcher


def test_keyword_routing(sample_ontology_dir):
    """Test keyword-based routing to Go expert."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("review golang code")
    assert result.agent == "lang-golang-expert"
    assert result.confidence > 0


def test_python_routing(sample_ontology_dir):
    """Test routing to Python expert."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("fix python script")
    assert result.agent == "lang-python-expert"


def test_file_pattern_routing(sample_ontology_dir):
    """Test routing based on file patterns."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("update main.go")
    assert result.agent == "lang-golang-expert"


def test_no_match_routing(sample_ontology_dir):
    """Test routing when no agent matches."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("something completely unrelated xyz")
    assert result.confidence == 0.0
    assert result.agent == ""


def test_routing_includes_dependencies(sample_ontology_dir):
    """Test that routing result includes skills and rules."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("golang goroutine")
    assert len(result.suggested_skills) > 0
    assert len(result.suggested_rules) > 0


def test_routing_confidence_scoring(sample_ontology_dir):
    """Test that confidence increases with more keyword matches."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result_single = router.route_with_keywords("golang")
    result_multiple = router.route_with_keywords("golang go goroutine")

    assert result_multiple.confidence >= result_single.confidence


def test_routing_agent_category(sample_ontology_dir):
    """Test that routing result includes agent category."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("python code")
    assert result.category == "LanguageExpert"


def test_routing_matched_keywords(sample_ontology_dir):
    """Test that matched keywords are recorded."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("golang code review")
    assert "golang" in result.matched_keywords or "go" in result.matched_keywords


def test_keyword_index_building(sample_ontology_dir):
    """Test that keyword index is built correctly."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    # Verify index contains expected keywords
    assert "golang" in router.keyword_index
    assert "python" in router.keyword_index
    assert any(
        entry[0] == "agent" and entry[1] == "lang-golang-expert"
        for entry in router.keyword_index["golang"]
    )


def test_route_with_hybrid_fallback(sample_ontology_dir):
    """route_with_hybrid falls back to keywords when no hybrid searcher."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)
    result = router.route_with_hybrid("golang code review")
    assert result.agent == "lang-golang-expert"
    assert result.confidence > 0


def test_route_with_hybrid_with_searcher(sample_ontology_dir):
    """route_with_hybrid uses hybrid searcher when available."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    searcher = HybridSearcher(onto, graph)
    router = SemanticRouter(onto, graph, hybrid_searcher=searcher)
    result = router.route_with_hybrid("golang code review")
    assert result.agent != ""
    assert result.confidence > 0
    assert "Hybrid search" in result.reasoning


# ---------------------------------------------------------------------------
# Korean particle handling in router
# ---------------------------------------------------------------------------


def test_korean_particle_ro_routing(sample_ontology_dir):
    """'go로 rest api 서버를 만들어줘' should route to lang-golang-expert."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("go로 rest api 서버를 만들어줘")
    assert result.agent == "lang-golang-expert"
    assert result.confidence > 0


def test_korean_particle_stripped_keyword_in_matched(sample_ontology_dir):
    """Stripped keyword ('go') should appear in matched_keywords."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result = router.route_with_keywords("go로 코드 리뷰")
    # "go" (stripped from "go로") should be recorded
    assert "go" in result.matched_keywords or "golang" in result.matched_keywords


def test_korean_particle_lower_confidence_than_exact(sample_ontology_dir):
    """Particle-matched routing confidence should be <= exact match confidence."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(onto, graph)

    result_exact = router.route_with_keywords("golang")
    result_particle = router.route_with_keywords("golang으로")
    assert result_particle.confidence <= result_exact.confidence


def test_route_with_hybrid_has_nonzero_graph_score(sample_ontology_dir):
    """route_with_hybrid should produce non-zero graph_score when keyword match exists."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    searcher = HybridSearcher(onto, graph)
    router = SemanticRouter(onto, graph, hybrid_searcher=searcher)
    result = router.route_with_hybrid("golang code review")
    # After fix: graph_score should be non-zero because keyword match provides anchor
    assert "graph=" in result.reasoning
    # Extract graph score from reasoning string "Hybrid search: kw=X.XX graph=X.XX community=X.XX"
    parts = result.reasoning.split("graph=")
    graph_val = float(parts[1].split(" ")[0])
    assert graph_val > 0, f"graph_score should be > 0 but was {graph_val}"

"""Tests for semantic routing."""

from ontology_rag import Ontology, OntologyGraph, SemanticRouter


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

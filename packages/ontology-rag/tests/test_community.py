"""Tests for community detection module."""

import pytest

from ontology_rag.ontology import Ontology
from ontology_rag.graph import OntologyGraph, HAS_NETWORKX
from ontology_rag.community import CommunityEngine, Community


pytestmark = pytest.mark.skipif(not HAS_NETWORKX, reason="NetworkX not available")


@pytest.fixture
def community_engine(sample_ontology_dir):
    """Create a CommunityEngine with sample ontology and graph."""
    ontology = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    engine = CommunityEngine(ontology, graph)
    return engine


def test_detect_communities_small_graph(community_engine):
    """Test that small graphs use class-based fallback."""
    communities = community_engine.detect_communities()

    # Should use class-based approach for small graph
    assert len(communities) > 0
    assert all(isinstance(c, Community) for c in communities)


def test_detect_communities_returns_communities(community_engine):
    """Test that detect_communities returns non-empty result."""
    communities = community_engine.detect_communities()

    assert len(communities) > 0
    assert isinstance(communities[0], Community)


def test_community_has_members(community_engine):
    """Test that each community has at least one member."""
    communities = community_engine.detect_communities()

    for community in communities:
        assert len(community.members) > 0
        assert all(isinstance(m, str) for m in community.members)


def test_community_has_keywords(community_engine):
    """Test that keywords are populated from ontology."""
    communities = community_engine.detect_communities()

    # At least one community should have keywords
    has_keywords = any(len(c.keywords) > 0 for c in communities)
    assert has_keywords

    for community in communities:
        # Keywords should be lowercase
        for keyword in community.keywords:
            assert keyword == keyword.lower()


def test_community_has_summary(community_engine):
    """Test that summary is non-empty and contains member count."""
    communities = community_engine.detect_communities()

    for community in communities:
        assert community.summary
        assert str(len(community.members)) in community.summary


def test_community_importance_computed(community_engine):
    """Test that importance is computed and non-negative."""
    communities = community_engine.detect_communities()

    for community in communities:
        assert community.importance >= 0


def test_get_community_for_node(community_engine):
    """Test getting community for a known node."""
    community_engine.detect_communities()

    # lang-golang-expert should be in a community
    community = community_engine.get_community_for_node("lang-golang-expert")
    assert community is not None
    assert "lang-golang-expert" in community.members


def test_get_community_for_unknown_node(community_engine):
    """Test that unknown node returns None."""
    community_engine.detect_communities()

    community = community_engine.get_community_for_node("unknown-node-xyz")
    assert community is None


def test_get_relevant_communities(community_engine):
    """Test getting communities sorted by relevance."""
    community_engine.detect_communities()

    # Search for "go" and "golang" keywords
    relevant = community_engine.get_relevant_communities(
        ["go", "golang"], top_k=2
    )

    # Should return communities
    assert len(relevant) <= 2

    if relevant:
        # Should have some keywords
        assert all(len(c.keywords) > 0 for c in relevant)


def test_get_relevant_communities_no_match(community_engine):
    """Test that empty keywords returns empty result."""
    community_engine.detect_communities()

    relevant = community_engine.get_relevant_communities([])
    assert relevant == []


def test_rebuild_clears_and_redetects(community_engine):
    """Test that rebuild clears and redetects communities."""
    # First detection
    communities1 = community_engine.detect_communities()
    count1 = len(communities1)

    # Rebuild
    community_engine.rebuild()
    count2 = len(community_engine.communities)

    # Should have same number of communities
    assert count2 == count1
    assert len(community_engine._node_to_community) > 0


def test_node_to_community_mapping(community_engine):
    """Test that every node in graph has a community."""
    community_engine.detect_communities()

    # All graph nodes should be mapped to a community
    for node_id in community_engine.graph.nodes:
        community = community_engine.get_community_for_node(node_id)
        assert community is not None
        assert node_id in community.members


def test_community_name_from_class(community_engine):
    """Test that community names come from node classes."""
    communities = community_engine.detect_communities()

    # Should have meaningful names
    names = [c.name for c in communities]
    assert all(name for name in names)

    # Should match known classes from test fixture
    class_names = {
        "LanguageExpert",
        "ManagerAgent",
        "BestPracticeSkill",
        "ManagementSkill",
        "RoutingSkill",
        "MustRule",
    }
    for name in names:
        assert name in class_names


def test_jaccard_similarity_calculation(community_engine):
    """Test Jaccard similarity calculation."""
    # Test internal method
    set1 = {"a", "b", "c"}
    set2 = {"b", "c", "d"}

    similarity = community_engine._jaccard_similarity(set1, set2)

    # Intersection: {b, c} = 2
    # Union: {a, b, c, d} = 4
    # Jaccard: 2/4 = 0.5
    assert similarity == 0.5


def test_jaccard_similarity_no_overlap(community_engine):
    """Test Jaccard similarity with no overlap."""
    set1 = {"a", "b"}
    set2 = {"c", "d"}

    similarity = community_engine._jaccard_similarity(set1, set2)
    assert similarity == 0.0


def test_jaccard_similarity_empty_sets(community_engine):
    """Test Jaccard similarity with empty sets."""
    similarity = community_engine._jaccard_similarity(set(), {"a", "b"})
    assert similarity == 0.0

    similarity = community_engine._jaccard_similarity({"a", "b"}, set())
    assert similarity == 0.0

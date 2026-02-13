"""Tests for reranker."""

from dataclasses import dataclass

import pytest

from ontology_rag.graph import OntologyGraph
from ontology_rag.reranker import Reranker, RerankedResult


@dataclass
class MockSearchResult:
    """Mock SearchResult for testing without importing hybrid_search.

    Attributes:
        node_id: Unique identifier for the node.
        node_type: Type of node (Agent, Skill, Rule).
        score: Final weighted score.
        keyword_score: Keyword match contribution.
        graph_score: Graph structure contribution.
        community_score: Community membership contribution.
        importance_score: Node importance contribution.
    """

    node_id: str
    node_type: str
    score: float
    keyword_score: float = 0.0
    graph_score: float = 0.0
    community_score: float = 0.0
    importance_score: float = 0.0


def test_rerank_returns_results(sample_ontology_dir):
    """Reranking non-empty input returns non-empty output."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    results = [
        MockSearchResult("lang-golang-expert", "Agent", 0.8),
        MockSearchResult("lang-python-expert", "Agent", 0.6),
    ]
    reranked = reranker.rerank(results)
    assert len(reranked) == 2
    assert all(isinstance(r, RerankedResult) for r in reranked)


def test_rerank_empty_input(sample_ontology_dir):
    """Reranking empty list returns empty list."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)
    assert reranker.rerank([]) == []


def test_reranked_score_combines_original_and_pagerank(sample_ontology_dir):
    """Reranked score is weighted combination of original + PageRank."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    results = [MockSearchResult("lang-golang-expert", "Agent", 1.0)]
    reranked = reranker.rerank(results)

    r = reranked[0]
    assert r.reranked_score > 0
    assert r.original_score == 1.0
    assert r.pagerank_score >= 0


def test_rerank_top_k_limit(sample_ontology_dir):
    """Rerank respects top_k limit."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    results = [
        MockSearchResult("lang-golang-expert", "Agent", 0.9),
        MockSearchResult("lang-python-expert", "Agent", 0.8),
        MockSearchResult("mgr-creator", "Agent", 0.7),
    ]
    reranked = reranker.rerank(results, top_k=2)
    assert len(reranked) == 2


def test_rerank_sorted_by_score(sample_ontology_dir):
    """Results are sorted by reranked_score descending."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    results = [
        MockSearchResult("lang-python-expert", "Agent", 0.3),
        MockSearchResult("lang-golang-expert", "Agent", 0.9),
        MockSearchResult("mgr-creator", "Agent", 0.5),
    ]
    reranked = reranker.rerank(results)
    scores = [r.reranked_score for r in reranked]
    assert scores == sorted(scores, reverse=True)


def test_rerank_without_community_engine(sample_ontology_dir):
    """Works without community engine (no diversity penalty)."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph, community_engine=None)

    results = [MockSearchResult("lang-golang-expert", "Agent", 0.8)]
    reranked = reranker.rerank(results)
    assert reranked[0].diversity_penalty == 0.0


def test_invalidate_cache(sample_ontology_dir):
    """Cache invalidation clears pagerank cache."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    # Trigger cache population
    results = [MockSearchResult("lang-golang-expert", "Agent", 0.8)]
    reranker.rerank(results)
    assert reranker._pagerank_cache is not None

    reranker.invalidate_cache()
    assert reranker._pagerank_cache is None


def test_reranked_score_non_negative(sample_ontology_dir):
    """Reranked scores should never be negative."""
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    reranker = Reranker(graph)

    results = [MockSearchResult("lang-golang-expert", "Agent", 0.01)]
    reranked = reranker.rerank(results)
    assert all(r.reranked_score >= 0 for r in reranked)

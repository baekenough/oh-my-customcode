"""Phase 3 integration and edge case tests."""

import json
import time

import pytest

from ontology_rag import (
    Ontology, OntologyGraph, SemanticRouter, HierarchicalLoader,
    CommunityEngine, HybridSearcher, Reranker, OntologyWatcher,
    BudgetManager, SemanticCache, TokenLogger, HAS_NETWORKX,
)


class TestEndToEndIntegration:
    """Test full Phase 3 pipeline end-to-end."""

    def test_full_pipeline_query(self, sample_ontology_dir, sample_rules_dir):
        """Complete pipeline: query → route → load context with community."""
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        
        # Phase 3 components
        engine = CommunityEngine(ontology, graph)
        engine.detect_communities()
        searcher = HybridSearcher(ontology, graph, engine)
        reranker = Reranker(graph, engine)
        
        # Router with hybrid
        router = SemanticRouter(ontology, graph, hybrid_searcher=searcher)
        loader = HierarchicalLoader(ontology, graph, rules_dir=sample_rules_dir, community_engine=engine)
        
        # Route
        result = router.route_with_hybrid("review golang code")
        assert result.agent != ""
        assert result.confidence > 0
        
        # Load context
        ctx = loader.load_for_agent(result.agent, token_budget=5000)
        assert ctx.agent_summary != ""
        assert ctx.community_summary != ""  # Phase 3 Level 0.5
        assert ctx.total_tokens > 0
        
        # Search + rerank
        search_results = searcher.search("golang review", anchor_node=result.agent)
        reranked = reranker.rerank(search_results)
        assert len(reranked) > 0

    def test_full_pipeline_with_watcher(self, sample_ontology_dir, tmp_path):
        """Test that watcher detects changes and triggers rebuild."""
        watcher = OntologyWatcher(sample_ontology_dir)
        assert watcher.check_for_changes() is False
        
        # Simulate file change
        time.sleep(0.05)
        (sample_ontology_dir / "agents.yaml").write_text(
            (sample_ontology_dir / "agents.yaml").read_text() + "\n# changed"
        )
        assert watcher.check_for_changes() is True
        watcher.mark_rebuilt()
        assert watcher.check_for_changes() is False


class TestEdgeCases:
    """Edge case tests."""

    def test_empty_ontology(self, tmp_path):
        """All components handle empty ontology gracefully."""
        empty_dir = tmp_path / "empty_ontology"
        empty_dir.mkdir()
        (empty_dir / "graphs").mkdir()
        
        ontology = Ontology(empty_dir)
        graph = OntologyGraph(empty_dir / "graphs")
        
        engine = CommunityEngine(ontology, graph)
        communities = engine.detect_communities()
        assert communities == []
        
        searcher = HybridSearcher(ontology, graph, engine)
        results = searcher.search("anything")
        assert results == []
        
        reranker = Reranker(graph, engine)
        reranked = reranker.rerank([])
        assert reranked == []
        
        router = SemanticRouter(ontology, graph, hybrid_searcher=searcher)
        route = router.route_with_hybrid("anything")
        assert route.agent == ""

    def test_single_node_graph(self, tmp_path):
        """Handle graph with single node."""
        ontology_dir = tmp_path / "single"
        ontology_dir.mkdir()
        graphs_dir = ontology_dir / "graphs"
        graphs_dir.mkdir()
        
        import yaml
        
        # Minimal agents
        agents_data = {
            "classes": {"Solo": {"agents": ["solo-agent"]}},
            "agents": {
                "solo-agent": {
                    "class": "Solo",
                    "description": "Lone agent",
                    "model": "sonnet",
                    "summary": "A solo agent",
                    "keywords": ["solo"],
                    "skills": [],
                    "tools": [],
                    "file_patterns": [],
                },
            },
        }
        (ontology_dir / "agents.yaml").write_text(yaml.dump(agents_data))
        (ontology_dir / "skills.yaml").write_text(yaml.dump({"classes": {}, "skills": {}}))
        (ontology_dir / "rules.yaml").write_text(yaml.dump({"categories": {}, "rules": {}}))
        
        graph_data = {
            "nodes": {"solo-agent": {"type": "Agent", "class": "Solo"}},
            "edges": [],
            "adjacency": {},
        }
        (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
        
        ontology = Ontology(ontology_dir)
        graph = OntologyGraph(graphs_dir)
        
        engine = CommunityEngine(ontology, graph)
        engine.detect_communities()
        assert len(engine.communities) == 1
        assert "solo-agent" in engine.communities[0].members
        
        searcher = HybridSearcher(ontology, graph, engine)
        results = searcher.search("solo")
        assert len(results) == 1
        assert results[0].node_id == "solo-agent"

    def test_multihop_query(self, sample_ontology_dir):
        """Multi-hop: find rules used by golang expert."""
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        
        engine = CommunityEngine(ontology, graph)
        engine.detect_communities()
        searcher = HybridSearcher(ontology, graph, engine)
        
        # Multi-hop from golang expert should find rules
        results = searcher.search_multihop(
            "what rules apply",
            start_node="lang-golang-expert",
            max_hops=3,
        )
        rule_ids = [r.node_id for r in results if r.node_type == "Rule"]
        assert "R006" in rule_ids or "R007" in rule_ids

    def test_community_diversity_penalty(self, sample_ontology_dir):
        """Verify diversity penalty reduces same-community scores."""
        from dataclasses import dataclass
        
        @dataclass
        class FakeResult:
            node_id: str
            node_type: str
            score: float
            keyword_score: float = 0.0
            graph_score: float = 0.0
            community_score: float = 0.0
            importance_score: float = 0.0
        
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        engine = CommunityEngine(ontology, graph)
        engine.detect_communities()
        
        reranker = Reranker(graph, engine)
        
        # Two agents from same community (LanguageExpert)
        results = [
            FakeResult("lang-golang-expert", "Agent", 0.9),
            FakeResult("lang-python-expert", "Agent", 0.85),
        ]
        reranked = reranker.rerank(results)
        
        # Second result should have diversity penalty > 0 (if same community)
        golang_community = engine.get_community_for_node("lang-golang-expert")
        python_community = engine.get_community_for_node("lang-python-expert")
        
        if golang_community and python_community and golang_community.id == python_community.id:
            # Same community: second result has penalty
            second = [r for r in reranked if r.node_id == "lang-python-expert"][0]
            assert second.diversity_penalty > 0


class TestPerformance:
    """Performance sanity checks."""

    def test_watcher_check_speed(self, sample_ontology_dir):
        """Watcher check should complete in < 1ms."""
        watcher = OntologyWatcher(sample_ontology_dir)
        
        start = time.time()
        for _ in range(100):
            watcher.check_for_changes()
        elapsed_ms = (time.time() - start) * 1000
        
        # 100 checks should take < 100ms (< 1ms each)
        assert elapsed_ms < 100, f"Watcher too slow: {elapsed_ms:.1f}ms for 100 checks"

    def test_search_speed(self, sample_ontology_dir):
        """Hybrid search should complete in < 10ms for small graph."""
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        searcher = HybridSearcher(ontology, graph)
        
        start = time.time()
        for _ in range(100):
            searcher.search("golang review")
        elapsed_ms = (time.time() - start) * 1000
        
        # 100 searches < 1000ms (< 10ms each)
        assert elapsed_ms < 1000, f"Search too slow: {elapsed_ms:.1f}ms for 100 searches"

    def test_community_detection_speed(self, sample_ontology_dir):
        """Community detection should be fast for small graphs."""
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        engine = CommunityEngine(ontology, graph)
        
        start = time.time()
        engine.detect_communities()
        elapsed_ms = (time.time() - start) * 1000
        
        # Should be < 50ms for 10-node graph
        assert elapsed_ms < 50, f"Community detection too slow: {elapsed_ms:.1f}ms"

    def test_pagerank_available(self, sample_ontology_dir):
        """Verify PageRank works (may need numpy)."""
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        pr = graph.pagerank()
        # PageRank might return empty if numpy not installed
        # But it should NOT raise an exception
        assert isinstance(pr, dict)

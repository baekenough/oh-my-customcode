"""Phase 4 integration tests — test interaction between components."""

import json
import time
import pytest
from pathlib import Path

from ontology_rag.ontology import Ontology
from ontology_rag.graph import OntologyGraph
from ontology_rag.loader import HierarchicalLoader
from ontology_rag.budget import BudgetManager, AdaptiveBudgetManager
from ontology_rag.token_logger import TokenLogger
from ontology_rag.compressor import ContextCompressor, RuleDecomposer
from ontology_rag.monitor import MonitoringDashboard
from ontology_rag.ab_test import ABTestRunner, ABResult


@pytest.fixture
def phase4_setup(sample_ontology_dir, sample_rules_dir, tmp_path):
    """Set up all Phase 4 components together."""
    ontology = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    cache_dir = tmp_path / "cache"
    token_logger = TokenLogger(cache_dir)
    compressor = ContextCompressor(RuleDecomposer())
    adaptive_budget = AdaptiveBudgetManager(token_logger=token_logger)
    monitor = MonitoringDashboard(token_logger)
    ab_runner = ABTestRunner(cache_dir)

    loader = HierarchicalLoader(
        ontology,
        graph,
        rules_dir=sample_rules_dir,
        compressor=compressor,
    )

    return {
        "ontology": ontology,
        "graph": graph,
        "loader": loader,
        "token_logger": token_logger,
        "compressor": compressor,
        "adaptive_budget": adaptive_budget,
        "monitor": monitor,
        "ab_runner": ab_runner,
        "cache_dir": cache_dir,
    }


# --- Compressor + Loader integration ---


class TestCompressorLoaderIntegration:
    """Test compressor integration with hierarchical loader."""

    def test_loader_uses_compressor_when_query_provided(
        self, phase4_setup, sample_rules_dir
    ):
        """Loading with query activates section-aware compression."""
        loader = phase4_setup["loader"]
        # Write richer rule content for testing compression
        (sample_rules_dir / "MUST-agent-design.md").write_text(
            "# Agent Design Rules\n\n"
            "> **Priority**: MUST | **ID**: R006\n\n"
            "## Core Rule\n\nAgent files must follow standard format.\n\n"
            "## Requirements\n\n"
            "| Field | Required |\n|-------|----------|\n| name | yes |\n\n"
            "## Examples\n\n```yaml\nname: my-agent\nmodel: sonnet\n```\n\n"
            "## References\n\n- See R007\n"
        )

        context = loader.load_for_agent(
            "lang-golang-expert", token_budget=5000, query="how to create an agent"
        )
        # Should have compression stats when compressor is active
        assert isinstance(context.compression_stats, dict)

    def test_loader_without_query_no_compression(self, phase4_setup):
        """Loading without query falls back to Phase 3 behavior."""
        loader = phase4_setup["loader"]
        context = loader.load_for_agent("lang-golang-expert", token_budget=5000)
        # No compression stats when no query
        assert context.compression_stats == {}

    def test_loader_without_compressor_backward_compat(
        self, sample_ontology_dir, sample_rules_dir
    ):
        """Loader without compressor behaves like Phase 3."""
        ontology = Ontology(sample_ontology_dir)
        graph = OntologyGraph(sample_ontology_dir / "graphs")
        loader = HierarchicalLoader(ontology, graph, rules_dir=sample_rules_dir)

        context = loader.load_for_agent(
            "lang-golang-expert", token_budget=5000, query="how to design"
        )
        assert context.compression_stats == {}
        # Should still load rules
        assert context.agent_summary != ""


# --- Adaptive Budget + TokenLogger integration ---


class TestAdaptiveBudgetIntegration:
    """Test adaptive budget with token logger history."""

    def test_adapt_after_logging(self, phase4_setup):
        """Budget adapts after sufficient log entries."""
        logger = phase4_setup["token_logger"]
        budget = phase4_setup["adaptive_budget"]

        # Log enough entries (> MIN_SAMPLES=10)
        now = time.time()
        for i in range(15):
            logger.log(
                tool="get_relevant_context",
                query=f"test query {i}",
                tokens_used=1000 + i * 50,
                duration_ms=30.0,
            )

        analysis = budget.adapt_from_history(lookback_hours=1)
        assert analysis.samples == 15
        assert analysis.avg_tokens_used > 0
        assert analysis.optimal_budget > 0

    def test_adapt_insufficient_history(self, phase4_setup):
        """Budget falls back with insufficient history."""
        budget = phase4_setup["adaptive_budget"]
        analysis = budget.adapt_from_history(lookback_hours=1)
        assert analysis.samples == 0
        assert analysis.optimal_budget == 0

    def test_waste_detection_integration(self, phase4_setup):
        """Waste detection works with real budget allocations."""
        budget = phase4_setup["adaptive_budget"]
        waste = budget.detect_waste("simple fix", used=200, allocated=5000)
        assert waste is not None
        assert waste["waste_pct"] > 0.5


# --- Monitor + TokenLogger integration ---


class TestMonitorIntegration:
    """Test monitoring dashboard with real token logger."""

    def test_snapshot_with_data(self, phase4_setup):
        """Monitor produces valid snapshot from logged data."""
        logger = phase4_setup["token_logger"]
        monitor = phase4_setup["monitor"]

        for i in range(5):
            logger.log(
                tool="get_relevant_context",
                query=f"query {i}",
                tokens_used=1500,
                duration_ms=40.0,
            )

        snapshot = monitor.get_snapshot(period_hours=1)
        assert snapshot.total_queries == 5
        assert snapshot.total_tokens == 7500
        assert snapshot.avg_tokens_per_query == 1500.0

    def test_snapshot_empty(self, phase4_setup):
        """Monitor handles empty log gracefully."""
        monitor = phase4_setup["monitor"]
        snapshot = monitor.get_snapshot(period_hours=1)
        assert snapshot.total_queries == 0

    def test_phase_comparison(self, phase4_setup):
        """Phase comparison with baseline."""
        logger = phase4_setup["token_logger"]
        monitor = phase4_setup["monitor"]
        monitor.set_baseline(3000.0)

        for i in range(5):
            logger.log(
                tool="get_relevant_context",
                query=f"query {i}",
                tokens_used=1500,
                duration_ms=40.0,
            )

        comparison = monitor.compare_phases(period_hours=1)
        assert comparison is not None
        assert comparison.improvement_pct == 50.0

    def test_report_generation(self, phase4_setup):
        """Report generates valid markdown."""
        logger = phase4_setup["token_logger"]
        monitor = phase4_setup["monitor"]

        logger.log(
            tool="get_relevant_context",
            query="test",
            tokens_used=1500,
            duration_ms=40.0,
        )

        report = monitor.generate_report(period_hours=1)
        assert isinstance(report, str)
        assert "#" in report  # Markdown headers


# --- A/B Test integration ---


class TestABTestIntegration:
    """Test A/B test framework with real data flow."""

    def test_record_and_summarize(self, phase4_setup):
        """Record results and get summary."""
        runner = phase4_setup["ab_runner"]

        for i in range(6):
            runner.record_result(
                ABResult(
                    query=f"control {i}",
                    group="control",
                    tokens_used=3000,
                    duration_ms=50.0,
                )
            )
            runner.record_result(
                ABResult(
                    query=f"treatment {i}",
                    group="treatment",
                    tokens_used=1500,
                    duration_ms=40.0,
                )
            )

        summary = runner.get_summary()
        assert summary.control_count == 6
        assert summary.treatment_count == 6
        assert summary.winner == "treatment"
        assert summary.token_reduction_pct == 50.0

    def test_should_use_ontology(self, phase4_setup):
        """Decision function works correctly."""
        runner = phase4_setup["ab_runner"]
        # With no data, should default to True (try new system)
        assert runner.should_use_ontology("any query") is True


# --- End-to-end Phase 4 flow ---


class TestEndToEndPhase4:
    """Test complete Phase 4 flow from query to monitoring."""

    def test_full_flow(self, phase4_setup, sample_rules_dir):
        """Complete flow: load → log → monitor → compare."""
        loader = phase4_setup["loader"]
        logger = phase4_setup["token_logger"]
        monitor = phase4_setup["monitor"]
        monitor.set_baseline(3000.0)

        # 1. Load context with compression
        context = loader.load_for_agent(
            "lang-golang-expert", token_budget=5000, query="how to create an agent"
        )

        # 2. Log the usage
        logger.log(
            tool="get_relevant_context",
            query="how to create an agent",
            tokens_used=context.total_tokens,
            agent="lang-golang-expert",
            duration_ms=50.0,
        )

        # 3. Check monitoring
        snapshot = monitor.get_snapshot(period_hours=1)
        assert snapshot.total_queries == 1
        assert snapshot.total_tokens == context.total_tokens

    def test_imports_work(self):
        """Verify all Phase 4 exports are importable."""
        from ontology_rag import (
            ContextCompressor,
            RuleDecomposer,
            DecomposedRule,
            RuleSection,
            AdaptiveBudgetManager,
            BudgetAnalysis,
            MonitoringDashboard,
            MonitoringSnapshot,
            PhaseComparison,
            ABTestRunner,
            ABResult,
            ABSummary,
        )

        assert ContextCompressor is not None
        assert ABTestRunner is not None

    def test_version_updated(self):
        """Verify version is 0.3.0."""
        import ontology_rag

        assert ontology_rag.__version__ == "0.3.0"

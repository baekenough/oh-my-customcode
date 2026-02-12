"""Tests for monitoring dashboard functionality."""

import json
import time

import pytest

from ontology_rag.monitor import MonitoringDashboard, MonitoringSnapshot, PhaseComparison
from ontology_rag.token_logger import TokenLogger


@pytest.fixture
def populated_logger(tmp_path):
    """Create a TokenLogger with pre-populated JSONL data.

    Creates 20 sample entries with varying patterns:
    - Mix of cache hits and misses
    - Consistent token usage patterns
    - Timestamps spread over last 20 minutes
    """
    logger = TokenLogger(tmp_path / "cache")

    now = time.time()
    entries = [
        {
            "tool": "get_relevant_context",
            "query": f"query {i}",
            "tokens_used": 1000 + i * 100,
            "cache_hit": i % 3 == 0,
            "cache_hit_type": "exact" if i % 3 == 0 else "",
            "agent": "lang-golang-expert",
            "duration_ms": 50.0 + i * 2,
            "timestamp": now - i * 60,
        }
        for i in range(20)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    return logger


@pytest.fixture
def dashboard(populated_logger):
    """Create a MonitoringDashboard with populated data."""
    return MonitoringDashboard(populated_logger)


# MonitoringSnapshot tests


def test_get_snapshot_basic(dashboard):
    """Test that get_snapshot returns valid snapshot with all fields."""
    snapshot = dashboard.get_snapshot(period_hours=1)

    assert isinstance(snapshot, MonitoringSnapshot)
    assert snapshot.timestamp > 0
    assert snapshot.period_hours == 1
    assert snapshot.total_queries >= 0
    assert snapshot.total_tokens >= 0
    assert snapshot.avg_tokens_per_query >= 0
    assert 0 <= snapshot.cache_hit_rate <= 1
    assert isinstance(snapshot.waste_alerts, list)
    assert isinstance(snapshot.by_complexity, dict)
    assert isinstance(snapshot.by_tool, dict)
    assert isinstance(snapshot.recommendations, list)


def test_get_snapshot_empty(tmp_path):
    """Test get_snapshot with no data returns zero counts."""
    logger = TokenLogger(tmp_path / "empty_cache")
    dashboard = MonitoringDashboard(logger)

    snapshot = dashboard.get_snapshot()

    assert snapshot.total_queries == 0
    assert snapshot.total_tokens == 0
    assert snapshot.avg_tokens_per_query == 0.0
    assert snapshot.cache_hit_rate == 0.0
    assert len(snapshot.waste_alerts) == 0
    assert len(snapshot.by_tool) == 0


def test_get_snapshot_period(dashboard):
    """Test that get_snapshot respects period_hours parameter."""
    # All entries are within last hour (20 minutes)
    snapshot_1h = dashboard.get_snapshot(period_hours=1)
    snapshot_0_1h = dashboard.get_snapshot(period_hours=0.1)

    assert snapshot_1h.total_queries >= snapshot_0_1h.total_queries
    assert snapshot_1h.total_tokens >= snapshot_0_1h.total_tokens


def test_snapshot_avg_tokens(dashboard):
    """Test that average tokens calculation is correct."""
    snapshot = dashboard.get_snapshot(period_hours=1)

    if snapshot.total_queries > 0:
        expected_avg = snapshot.total_tokens / snapshot.total_queries
        assert abs(snapshot.avg_tokens_per_query - expected_avg) < 0.1


def test_snapshot_cache_hit_rate(dashboard):
    """Test that cache hit rate matches logger stats."""
    snapshot = dashboard.get_snapshot(period_hours=1)
    stats = dashboard.token_logger.get_stats(since=time.time() - 3600)

    assert snapshot.cache_hit_rate == stats["cache_hit_rate"]


def test_snapshot_by_tool(dashboard):
    """Test that tool breakdown is correct."""
    snapshot = dashboard.get_snapshot(period_hours=1)

    assert "get_relevant_context" in snapshot.by_tool
    tool_data = snapshot.by_tool["get_relevant_context"]
    assert "calls" in tool_data
    assert "tokens" in tool_data
    assert tool_data["calls"] > 0
    assert tool_data["tokens"] > 0


# Waste detection tests


def test_detect_waste_no_entries(tmp_path):
    """Test waste detection with no entries returns empty list."""
    logger = TokenLogger(tmp_path / "empty")
    dashboard = MonitoringDashboard(logger)

    waste = dashboard.detect_waste_patterns()

    assert waste == []


def test_detect_waste_finds_low_usage(tmp_path):
    """Test that waste detection flags entries with very low token usage."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with one outlier
    entries = [
        {
            "tool": "search",
            "query": f"normal query {i}",
            "tokens_used": 1000,
            "timestamp": now - i * 10,
        }
        for i in range(5)
    ]

    # Add a low-usage entry
    entries.append({
        "tool": "search",
        "query": "waste query",
        "tokens_used": 100,  # Much lower than average
        "timestamp": now,
    })

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    waste = dashboard.detect_waste_patterns(period_hours=1)

    assert len(waste) > 0
    assert any("waste query" in alert["query"] for alert in waste)


def test_detect_waste_normal_usage(tmp_path):
    """Test that waste detection produces no alerts for normal usage."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with consistent token usage
    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 1000 + i * 10,  # Slight variation
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    waste = dashboard.detect_waste_patterns(period_hours=1)

    # Should have few or no alerts for consistent usage
    assert len(waste) <= 2


# Phase comparison tests


def test_compare_no_baseline(dashboard):
    """Test that compare_phases returns None when no baseline is set."""
    result = dashboard.compare_phases()

    assert result is None


def test_compare_with_baseline_improvement(tmp_path):
    """Test phase comparison shows positive improvement."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with lower avg than baseline
    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 500,  # Lower than baseline
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    dashboard.set_baseline(1000.0)  # Higher baseline

    comparison = dashboard.compare_phases(period_hours=1)

    assert comparison is not None
    assert comparison.baseline_avg == 1000.0
    assert comparison.current_avg < 1000.0
    assert comparison.improvement_pct > 0  # Positive = improvement


def test_compare_with_baseline_regression(tmp_path):
    """Test phase comparison shows negative improvement (regression)."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with higher avg than baseline
    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 2000,  # Higher than baseline
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    dashboard.set_baseline(1000.0)  # Lower baseline

    comparison = dashboard.compare_phases(period_hours=1)

    assert comparison is not None
    assert comparison.baseline_avg == 1000.0
    assert comparison.current_avg > 1000.0
    assert comparison.improvement_pct < 0  # Negative = regression


def test_compare_empty_data(tmp_path):
    """Test compare_phases returns None with no calls in period."""
    logger = TokenLogger(tmp_path / "empty")
    dashboard = MonitoringDashboard(logger)
    dashboard.set_baseline(1000.0)

    comparison = dashboard.compare_phases()

    assert comparison is None


def test_set_baseline(dashboard):
    """Test that set_baseline updates _baseline_avg."""
    dashboard.set_baseline(1500.0)

    assert dashboard._baseline_avg == 1500.0


# Report generation tests


def test_generate_report_basic(dashboard):
    """Test that generate_report returns markdown string."""
    report = dashboard.generate_report(period_hours=1)

    assert isinstance(report, str)
    assert len(report) > 0


def test_generate_report_has_sections(dashboard):
    """Test that report contains expected headers."""
    report = dashboard.generate_report(period_hours=1)

    assert "# Ontology-RAG Monitoring Report" in report
    assert "## Summary" in report
    assert "## Cache Performance" in report
    assert "## Per-Tool Breakdown" in report


def test_generate_report_empty_data(tmp_path):
    """Test that report generation handles empty data gracefully."""
    logger = TokenLogger(tmp_path / "empty")
    dashboard = MonitoringDashboard(logger)

    report = dashboard.generate_report()

    assert "# Ontology-RAG Monitoring Report" in report
    assert "## Summary" in report
    # Should not crash, should show zeros


def test_generate_report_with_baseline(tmp_path):
    """Test that report includes comparison section when baseline is set."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 800,
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    dashboard.set_baseline(1000.0)

    report = dashboard.generate_report(period_hours=1)

    assert "## Phase Comparison" in report
    assert "Baseline Avg" in report
    assert "Current Avg" in report


# Recommendations tests


def test_recommendations_low_cache(tmp_path):
    """Test that low cache hit rate generates recommendation."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with no cache hits
    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 1000,
            "cache_hit": False,
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    snapshot = dashboard.get_snapshot(period_hours=1)

    # Should recommend increasing cache TTL
    assert any("cache" in rec.lower() for rec in snapshot.recommendations)


def test_recommendations_high_avg(tmp_path):
    """Test that high average tokens generates recommendation."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    # Create entries with high token usage
    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 5000,  # Very high
            "timestamp": now - i * 10,
        }
        for i in range(10)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    snapshot = dashboard.get_snapshot(period_hours=1)

    # Should recommend adaptive budget
    assert any(
        "adaptive budget" in rec.lower() or "high" in rec.lower()
        for rec in snapshot.recommendations
    )


def test_waste_alert_truncates_long_query(tmp_path):
    """Test that waste alerts truncate long queries to 100 chars."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    long_query = "x" * 200

    entries = [
        {
            "tool": "search",
            "query": "normal query",
            "tokens_used": 1000,
            "timestamp": now - 100,
        },
        {
            "tool": "search",
            "query": long_query,
            "tokens_used": 100,  # Low usage
            "timestamp": now,
        },
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    waste = dashboard.detect_waste_patterns(period_hours=1)

    # Find the alert for the long query
    long_query_alerts = [
        alert for alert in waste if alert["query"].startswith("xxx")
    ]

    assert len(long_query_alerts) > 0
    assert len(long_query_alerts[0]["query"]) <= 100
    assert long_query_alerts[0]["query"].endswith("...")


def test_phase_comparison_fields(tmp_path):
    """Test that PhaseComparison has all expected fields."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    entries = [
        {
            "tool": "search",
            "query": f"query {i}",
            "tokens_used": 600,
            "timestamp": now - i * 10,
        }
        for i in range(5)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    dashboard.set_baseline(1000.0)

    comparison = dashboard.compare_phases(period_hours=1)

    assert comparison is not None
    assert hasattr(comparison, "baseline_avg")
    assert hasattr(comparison, "current_avg")
    assert hasattr(comparison, "improvement_pct")
    assert hasattr(comparison, "period_hours")
    assert hasattr(comparison, "sample_count")
    assert comparison.sample_count == 5


def test_snapshot_by_complexity(tmp_path):
    """Test that snapshot includes complexity breakdown from metadata."""
    logger = TokenLogger(tmp_path / "cache")
    now = time.time()

    entries = [
        {
            "tool": "search",
            "query": f"simple {i}",
            "tokens_used": 500,
            "metadata": {"complexity": "simple"},
            "timestamp": now - i * 10,
        }
        for i in range(3)
    ] + [
        {
            "tool": "search",
            "query": f"complex {i}",
            "tokens_used": 2000,
            "metadata": {"complexity": "complex"},
            "timestamp": now - i * 10,
        }
        for i in range(2)
    ]

    with open(logger.log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")

    dashboard = MonitoringDashboard(logger)
    snapshot = dashboard.get_snapshot(period_hours=1)

    assert "simple" in snapshot.by_complexity
    assert "complex" in snapshot.by_complexity
    assert snapshot.by_complexity["simple"]["count"] == 3
    assert snapshot.by_complexity["complex"]["count"] == 2

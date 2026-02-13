"""Tests for adaptive budget management."""

import json
import time
from pathlib import Path

import pytest

from ontology_rag.budget import AdaptiveBudgetManager, BudgetAnalysis, QueryComplexity


def write_log_entries(log_path: Path, entries: list[dict]):
    """Helper to write JSONL entries for testing.

    Args:
        log_path: Path to the log file.
        entries: List of log entry dictionaries.
    """
    with open(log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")


class MockTokenLogger:
    """Mock TokenLogger for testing."""

    def __init__(self, log_path: Path):
        """Initialize with log path.

        Args:
            log_path: Path to log file.
        """
        self.log_path = log_path

    def get_stats(self, since: float = 0) -> dict:
        """Get statistics from log entries.

        Args:
            since: Unix timestamp filter.

        Returns:
            Statistics dictionary.
        """
        if not self.log_path.exists():
            return {"total_calls": 0, "total_tokens": 0, "by_tool": {}}

        entries = []
        with open(self.log_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("timestamp", 0) >= since:
                        entries.append(entry)
                except json.JSONDecodeError:
                    continue

        total_tokens = sum(e.get("tokens_used", 0) for e in entries)
        by_tool = {}

        for entry in entries:
            tool = entry.get("tool", "unknown")
            tokens = entry.get("tokens_used", 0)
            if tool not in by_tool:
                by_tool[tool] = {"calls": 0, "tokens": 0}
            by_tool[tool]["calls"] += 1
            by_tool[tool]["tokens"] += tokens

        return {
            "total_calls": len(entries),
            "total_tokens": total_tokens,
            "by_tool": by_tool,
        }


@pytest.fixture
def temp_log_dir(tmp_path):
    """Create temporary directory for log files.

    Args:
        tmp_path: pytest tmp_path fixture.

    Returns:
        Path to temporary log directory.
    """
    return tmp_path / "logs"


@pytest.fixture
def token_logger(temp_log_dir):
    """Create mock TokenLogger with temp log file.

    Args:
        temp_log_dir: Temporary log directory fixture.

    Returns:
        MockTokenLogger instance.
    """
    temp_log_dir.mkdir(parents=True, exist_ok=True)
    log_path = temp_log_dir / "tokens.jsonl"
    return MockTokenLogger(log_path)


def test_adaptive_inherits_budget_manager():
    """Test that AdaptiveBudgetManager inherits from BudgetManager."""
    mgr = AdaptiveBudgetManager()
    from ontology_rag.budget import BudgetManager

    assert isinstance(mgr, BudgetManager)
    assert isinstance(mgr, AdaptiveBudgetManager)


def test_adapt_no_logger():
    """Test adapt_from_history returns empty analysis when no token_logger."""
    mgr = AdaptiveBudgetManager()
    analysis = mgr.adapt_from_history()

    assert isinstance(analysis, BudgetAnalysis)
    assert analysis.avg_tokens_used == 0
    assert analysis.waste_ratio == 0
    assert analysis.optimal_budget == 0
    assert analysis.samples == 0
    assert analysis.by_component == {}


def test_adapt_insufficient_samples(token_logger):
    """Test adapt returns partial analysis when samples < MIN_SAMPLES."""
    now = time.time()
    entries = [
        {"timestamp": now, "tool": "Read", "tokens_used": 150},
        {"timestamp": now, "tool": "Write", "tokens_used": 200},
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    analysis = mgr.adapt_from_history()

    assert analysis.samples == 2
    assert analysis.optimal_budget == 0  # Not enough samples
    assert analysis.avg_tokens_used > 0


def test_adapt_from_history_basic(token_logger):
    """Test adapt_from_history with enough samples adjusts budgets."""
    now = time.time()
    entries = [
        {"timestamp": now - i * 10, "tool": "Read", "tokens_used": 100 + i * 10}
        for i in range(15)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    original_total = mgr.budgets[QueryComplexity.SIMPLE].total

    analysis = mgr.adapt_from_history()

    assert analysis.samples == 15
    assert analysis.optimal_budget > 0
    assert analysis.avg_tokens_used > 0
    # Budgets should be adjusted (may increase or decrease based on data)
    assert mgr.budgets[QueryComplexity.SIMPLE].total != original_total


def test_adapt_p90_calculation(token_logger):
    """Test that p90 is correctly computed from token usage."""
    now = time.time()
    # 20 entries: sorted, p90 index = 18, so p90 should be 180 (element at index 18)
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": i * 10}
        for i in range(20)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    analysis = mgr.adapt_from_history()

    # p90 of [0, 10, 20, ..., 180, 190] at index 18 = 180
    # optimal = 180 * 1.2 = 216
    assert analysis.samples == 20
    assert analysis.optimal_budget == int(180 * mgr.HEADROOM_RATIO)


def test_adapt_headroom(token_logger):
    """Test that optimal budget includes 20% headroom above p90."""
    now = time.time()
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 100} for i in range(12)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    analysis = mgr.adapt_from_history()

    # p90 = 100, optimal = 100 * 1.2 = 120
    assert analysis.optimal_budget == 120


def test_adapt_min_budget_floor(token_logger):
    """Test that budgets never go below MIN_BUDGETS."""
    now = time.time()
    # Very low token usage
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 10} for i in range(15)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    mgr.adapt_from_history()

    # Even with low usage, should not go below MIN_BUDGETS
    assert mgr.budgets[QueryComplexity.SIMPLE].total >= mgr.MIN_BUDGETS[
        QueryComplexity.SIMPLE
    ]
    assert mgr.budgets[QueryComplexity.MODERATE].total >= mgr.MIN_BUDGETS[
        QueryComplexity.MODERATE
    ]
    assert mgr.budgets[QueryComplexity.COMPLEX].total >= mgr.MIN_BUDGETS[
        QueryComplexity.COMPLEX
    ]


def test_adapt_scales_components(token_logger):
    """Test that rules/skills/agent/reserve scale proportionally."""
    now = time.time()
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 1000 + i * 50}
        for i in range(15)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    original = mgr.budgets[QueryComplexity.SIMPLE]
    original_ratio = original.rules / original.total

    mgr.adapt_from_history()

    new = mgr.budgets[QueryComplexity.SIMPLE]
    new_ratio = new.rules / new.total

    # Ratio should be approximately preserved (within 10% tolerance)
    assert abs(new_ratio - original_ratio) < 0.1


def test_detect_waste_over_50pct():
    """Test detect_waste returns dict when >50% unused."""
    mgr = AdaptiveBudgetManager()
    waste = mgr.detect_waste("test query", used=200, allocated=500)

    assert waste is not None
    assert waste["allocated"] == 500
    assert waste["used"] == 200
    assert waste["wasted"] == 300
    assert waste["waste_pct"] == 0.6


def test_detect_waste_under_50pct():
    """Test detect_waste returns None when ≤50% unused."""
    mgr = AdaptiveBudgetManager()
    waste = mgr.detect_waste("test query", used=400, allocated=500)

    assert waste is None


def test_detect_waste_zero_allocated():
    """Test detect_waste returns None for zero allocated tokens."""
    mgr = AdaptiveBudgetManager()
    waste = mgr.detect_waste("test query", used=100, allocated=0)

    assert waste is None


def test_adapt_caches_result(token_logger):
    """Test that _adaptation_cache is set after adapt_from_history."""
    now = time.time()
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 150} for i in range(15)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    assert mgr._adaptation_cache is None

    analysis = mgr.adapt_from_history()

    assert mgr._adaptation_cache is not None
    assert mgr._adaptation_cache == analysis
    assert mgr._last_adapted_at > 0


def test_get_budget_for_query_works():
    """Test that inherited get_budget_for_query method still works."""
    mgr = AdaptiveBudgetManager()
    budget = mgr.get_budget_for_query("fix typo in readme")

    assert budget.total == 2000  # Simple query
    assert budget.rules > 0


def test_classify_complexity_works():
    """Test that inherited classify_complexity method still works."""
    mgr = AdaptiveBudgetManager()
    complexity = mgr.classify_complexity("architect the system")

    assert complexity == QueryComplexity.COMPLEX


def test_read_log_entries_empty(token_logger):
    """Test _read_log_entries returns empty list when log file missing."""
    mgr = AdaptiveBudgetManager(token_logger=token_logger)

    # Log file doesn't exist yet
    entries = mgr._read_log_entries(since=0)
    assert entries == []


def test_by_component_averages(token_logger):
    """Test that by_component contains correct per-tool averages."""
    now = time.time()
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 100} for i in range(5)
    ] + [
        {"timestamp": now - i, "tool": "Write", "tokens_used": 200} for i in range(5)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    analysis = mgr.adapt_from_history()

    assert "Read" in analysis.by_component
    assert "Write" in analysis.by_component
    assert analysis.by_component["Read"] == 100
    assert analysis.by_component["Write"] == 200


def test_waste_ratio_calculation(token_logger):
    """Test waste_ratio is calculated correctly."""
    now = time.time()
    # All entries use 100 tokens
    entries = [
        {"timestamp": now - i, "tool": "Read", "tokens_used": 100} for i in range(15)
    ]
    write_log_entries(token_logger.log_path, entries)

    mgr = AdaptiveBudgetManager(token_logger=token_logger)
    analysis = mgr.adapt_from_history()

    # avg_used = 100, avg_allocated = sum of default budgets / 4
    avg_allocated = sum(b.total for b in mgr.BUDGETS.values()) / len(mgr.BUDGETS)
    expected_waste = (avg_allocated - 100) / avg_allocated

    assert abs(analysis.waste_ratio - expected_waste) < 0.01

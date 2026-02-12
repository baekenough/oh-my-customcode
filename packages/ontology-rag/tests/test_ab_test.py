"""Tests for A/B testing framework."""

import json
import time
from pathlib import Path

import pytest

from ontology_rag.ab_test import ABResult, ABSummary, ABTestRunner


@pytest.fixture
def runner(tmp_path: Path) -> ABTestRunner:
    """Create a fresh ABTestRunner instance."""
    return ABTestRunner(tmp_path / "ab_results")


@pytest.fixture
def populated_runner(runner: ABTestRunner) -> ABTestRunner:
    """Create runner with pre-populated results.

    10 control results averaging ~3000 tokens.
    10 treatment results averaging ~1500 tokens.
    """
    now = time.time()

    # Control group: 10 results with avg ~3000 tokens
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"control query {i}",
                group="control",
                tokens_used=2500 + i * 100,
                duration_ms=50.0 + i,
                timestamp=now - i * 60,
            )
        )

    # Treatment group: 10 results with avg ~1500 tokens
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"treatment query {i}",
                group="treatment",
                tokens_used=1200 + i * 60,
                duration_ms=40.0 + i,
                cache_hit=i % 2 == 0,
                timestamp=now - i * 60,
            )
        )

    return runner


def test_record_result_creates_file(runner: ABTestRunner) -> None:
    """JSONL file should be created after recording first result."""
    assert not runner.results_path.exists()

    result = ABResult(
        query="test query",
        group="control",
        tokens_used=1000,
        duration_ms=50.0,
    )
    runner.record_result(result)

    assert runner.results_path.exists()


def test_record_result_sets_timestamp(runner: ABTestRunner) -> None:
    """Timestamp should be auto-set when 0."""
    before = time.time()

    result = ABResult(
        query="test query",
        group="control",
        tokens_used=1000,
        duration_ms=50.0,
        timestamp=0.0,
    )
    runner.record_result(result)

    after = time.time()

    # Read back and verify timestamp is in valid range
    entries = runner._read_results()
    assert len(entries) == 1
    assert before <= entries[0]["timestamp"] <= after


def test_record_result_preserves_timestamp(runner: ABTestRunner) -> None:
    """Non-zero timestamp should be preserved."""
    custom_timestamp = 1234567890.0

    result = ABResult(
        query="test query",
        group="control",
        tokens_used=1000,
        duration_ms=50.0,
        timestamp=custom_timestamp,
    )
    runner.record_result(result)

    entries = runner._read_results()
    assert len(entries) == 1
    assert entries[0]["timestamp"] == custom_timestamp


def test_get_summary_empty(runner: ABTestRunner) -> None:
    """Summary should return zeroed values when no results exist."""
    summary = runner.get_summary()

    assert summary.control_count == 0
    assert summary.treatment_count == 0
    assert summary.control_avg_tokens == 0
    assert summary.treatment_avg_tokens == 0
    assert summary.token_reduction_pct == 0
    assert summary.control_avg_duration_ms == 0
    assert summary.treatment_avg_duration_ms == 0
    assert summary.control_cache_rate == 0
    assert summary.treatment_cache_rate == 0
    assert summary.winner == "inconclusive"


def test_get_summary_with_data(populated_runner: ABTestRunner) -> None:
    """Summary should compute correct averages from populated data."""
    summary = populated_runner.get_summary()

    assert summary.control_count == 10
    assert summary.treatment_count == 10

    # Control: 2500, 2600, 2700, ..., 3400 → avg = 2950
    assert summary.control_avg_tokens == 2950.0

    # Treatment: 1200, 1260, 1320, ..., 1740 → avg = 1470
    assert summary.treatment_avg_tokens == 1470.0

    # Duration checks
    assert summary.control_avg_duration_ms > 0
    assert summary.treatment_avg_duration_ms > 0


def test_get_summary_winner_treatment(populated_runner: ABTestRunner) -> None:
    """Treatment should win when using fewer tokens."""
    summary = populated_runner.get_summary()

    assert summary.winner == "treatment"
    assert summary.treatment_avg_tokens < summary.control_avg_tokens


def test_get_summary_winner_control(runner: ABTestRunner) -> None:
    """Control should win when using fewer tokens."""
    # Control group: low token usage
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"control {i}",
                group="control",
                tokens_used=1000 + i * 10,
                duration_ms=50.0,
            )
        )

    # Treatment group: high token usage
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"treatment {i}",
                group="treatment",
                tokens_used=3000 + i * 10,
                duration_ms=50.0,
            )
        )

    summary = runner.get_summary()
    assert summary.winner == "control"
    assert summary.control_avg_tokens < summary.treatment_avg_tokens


def test_get_summary_inconclusive_few_samples(runner: ABTestRunner) -> None:
    """Winner should be inconclusive when fewer than 5 samples in a group."""
    # Only 3 control samples
    for i in range(3):
        runner.record_result(
            ABResult(
                query=f"control {i}",
                group="control",
                tokens_used=1000,
                duration_ms=50.0,
            )
        )

    # 10 treatment samples
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"treatment {i}",
                group="treatment",
                tokens_used=2000,
                duration_ms=50.0,
            )
        )

    summary = runner.get_summary()
    assert summary.winner == "inconclusive"


def test_token_reduction_pct(populated_runner: ABTestRunner) -> None:
    """Token reduction percentage should be calculated correctly."""
    summary = populated_runner.get_summary()

    # Expected: (2950 - 1470) / 2950 * 100 = 50.17%
    expected = (2950.0 - 1470.0) / 2950.0 * 100
    assert abs(summary.token_reduction_pct - expected) < 0.1


def test_should_use_ontology_treatment_wins(
    populated_runner: ABTestRunner,
) -> None:
    """Should use ontology when treatment is winning."""
    assert populated_runner.should_use_ontology("any query") is True


def test_should_use_ontology_control_wins(runner: ABTestRunner) -> None:
    """Should not use ontology when control is winning."""
    # Control uses fewer tokens
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"control {i}",
                group="control",
                tokens_used=1000,
                duration_ms=50.0,
            )
        )

    # Treatment uses more tokens
    for i in range(10):
        runner.record_result(
            ABResult(
                query=f"treatment {i}",
                group="treatment",
                tokens_used=3000,
                duration_ms=50.0,
            )
        )

    assert runner.should_use_ontology("any query") is False


def test_should_use_ontology_inconclusive(runner: ABTestRunner) -> None:
    """Should use ontology by default when inconclusive."""
    # Not enough samples
    runner.record_result(
        ABResult(
            query="control 1",
            group="control",
            tokens_used=1000,
            duration_ms=50.0,
        )
    )

    assert runner.should_use_ontology("any query") is True


def test_export_results(populated_runner: ABTestRunner) -> None:
    """Exported results should be valid JSON with summary and entries."""
    exported = populated_runner.export_results()
    data = json.loads(exported)

    assert data["total_results"] == 20
    assert "summary" in data
    assert "results" in data

    summary = data["summary"]
    assert summary["control_count"] == 10
    assert summary["treatment_count"] == 10
    assert summary["winner"] == "treatment"

    assert len(data["results"]) == 20


def test_clear_results(populated_runner: ABTestRunner) -> None:
    """Clear should remove the results file."""
    assert populated_runner.results_path.exists()

    populated_runner.clear()

    assert not populated_runner.results_path.exists()

    # Should return empty summary after clear
    summary = populated_runner.get_summary()
    assert summary.control_count == 0
    assert summary.treatment_count == 0


def test_cache_rate_calculation(populated_runner: ABTestRunner) -> None:
    """Cache hit rate should be calculated correctly for both groups."""
    summary = populated_runner.get_summary()

    # Treatment: cache_hit for even indices (0, 2, 4, 6, 8) → 5/10 = 0.5
    assert summary.treatment_cache_rate == 0.5

    # Control: no cache hits → 0/10 = 0.0
    assert summary.control_cache_rate == 0.0


def test_multiple_results_same_query(runner: ABTestRunner) -> None:
    """Should handle multiple results for the same query."""
    for i in range(5):
        runner.record_result(
            ABResult(
                query="same query",
                group="control",
                tokens_used=1000 + i,
                duration_ms=50.0,
            )
        )

    entries = runner._read_results()
    assert len(entries) == 5
    assert all(e["query"] == "same query" for e in entries)


def test_jsonl_format_valid(runner: ABTestRunner) -> None:
    """Each line in JSONL file should be valid JSON."""
    runner.record_result(
        ABResult(
            query="query 1",
            group="control",
            tokens_used=1000,
            duration_ms=50.0,
        )
    )
    runner.record_result(
        ABResult(
            query="query 2",
            group="treatment",
            tokens_used=1500,
            duration_ms=60.0,
        )
    )

    with open(runner.results_path, encoding="utf-8") as f:
        lines = f.readlines()

    assert len(lines) == 2

    for line in lines:
        data = json.loads(line.strip())
        assert "query" in data
        assert "group" in data
        assert "tokens_used" in data


def test_malformed_jsonl_handling(runner: ABTestRunner) -> None:
    """Should skip malformed JSONL lines gracefully."""
    # Write valid entry
    runner.record_result(
        ABResult(
            query="valid",
            group="control",
            tokens_used=1000,
            duration_ms=50.0,
        )
    )

    # Manually append malformed line
    with open(runner.results_path, "a", encoding="utf-8") as f:
        f.write("this is not json\n")
        f.write("\n")  # Empty line

    # Write another valid entry
    runner.record_result(
        ABResult(
            query="valid 2",
            group="treatment",
            tokens_used=1500,
            duration_ms=60.0,
        )
    )

    # Should only return valid entries
    entries = runner._read_results()
    assert len(entries) == 2
    assert all(e["query"].startswith("valid") for e in entries)

"""Tests for the token usage logger."""

import json
import time
import pytest
from ontology_rag.token_logger import TokenLogger


@pytest.fixture
def logger(tmp_path):
    """Create a TokenLogger with a temporary directory."""
    return TokenLogger(cache_dir=tmp_path / ".cache")


class TestTokenLoggerBasic:
    """Test basic logging operations."""

    def test_log_creates_file(self, logger):
        """Test that logging creates the JSONL file."""
        logger.log(tool="test_tool", query="test query", tokens_used=100)
        assert logger.log_path.exists()

    def test_log_appends_entry(self, logger):
        """Test that entries are appended as JSONL."""
        logger.log(tool="tool1", query="query1", tokens_used=100)
        logger.log(tool="tool2", query="query2", tokens_used=200)

        lines = logger.log_path.read_text().strip().split("\n")
        assert len(lines) == 2

        entry1 = json.loads(lines[0])
        assert entry1["tool"] == "tool1"
        assert entry1["tokens_used"] == 100

        entry2 = json.loads(lines[1])
        assert entry2["tool"] == "tool2"

    def test_log_all_fields(self, logger):
        """Test that all fields are logged correctly."""
        logger.log(
            tool="get_relevant_context",
            query="review go code",
            tokens_used=500,
            cache_hit=True,
            cache_hit_type="exact",
            agent="lang-golang-expert",
            duration_ms=42.5,
            metadata={"budget": 5000},
        )

        lines = logger.log_path.read_text().strip().split("\n")
        entry = json.loads(lines[0])

        assert entry["tool"] == "get_relevant_context"
        assert entry["query"] == "review go code"
        assert entry["tokens_used"] == 500
        assert entry["cache_hit"] is True
        assert entry["cache_hit_type"] == "exact"
        assert entry["agent"] == "lang-golang-expert"
        assert entry["duration_ms"] == 42.5
        assert entry["metadata"] == {"budget": 5000}
        assert "timestamp" in entry

    def test_log_default_values(self, logger):
        """Test default values for optional fields."""
        logger.log(tool="tool", query="query", tokens_used=10)

        lines = logger.log_path.read_text().strip().split("\n")
        entry = json.loads(lines[0])

        assert entry["cache_hit"] is False
        assert entry["cache_hit_type"] == ""
        assert entry["agent"] == ""
        assert entry["duration_ms"] == 0
        assert "metadata" not in entry


class TestTokenLoggerStats:
    """Test statistics aggregation."""

    def test_stats_empty(self, logger):
        """Test stats with no entries."""
        stats = logger.get_stats()
        assert stats["total_calls"] == 0
        assert stats["total_tokens"] == 0
        assert stats["cache_hits"] == 0
        assert stats["cache_hit_rate"] == 0.0

    def test_stats_aggregation(self, logger):
        """Test stats aggregation across multiple entries."""
        logger.log(
            tool="tool_a",
            query="q1",
            tokens_used=100,
            cache_hit=False,
            duration_ms=10
        )
        logger.log(
            tool="tool_a",
            query="q2",
            tokens_used=200,
            cache_hit=True,
            duration_ms=5
        )
        logger.log(
            tool="tool_b",
            query="q3",
            tokens_used=150,
            cache_hit=False,
            duration_ms=20
        )

        stats = logger.get_stats(since=time.time() - 60)

        assert stats["total_calls"] == 3
        assert stats["total_tokens"] == 450
        assert stats["cache_hits"] == 1
        assert stats["cache_hit_rate"] == pytest.approx(0.333, abs=0.01)

        assert "tool_a" in stats["by_tool"]
        assert stats["by_tool"]["tool_a"]["calls"] == 2
        assert stats["by_tool"]["tool_a"]["tokens"] == 300
        assert stats["by_tool"]["tool_a"]["cache_hits"] == 1

        assert "tool_b" in stats["by_tool"]
        assert stats["by_tool"]["tool_b"]["calls"] == 1
        assert stats["by_tool"]["tool_b"]["tokens"] == 150

    def test_stats_time_filtering(self, logger):
        """Test that stats respect the since parameter."""
        logger.log(tool="tool", query="old", tokens_used=100)

        # Stats from future timestamp should show no entries
        stats = logger.get_stats(since=time.time() + 60)
        assert stats["total_calls"] == 0


class TestTokenLoggerClear:
    """Test log clearing."""

    def test_clear_all(self, logger):
        """Test clearing all entries."""
        logger.log(tool="tool", query="q1", tokens_used=100)
        logger.log(tool="tool", query="q2", tokens_used=200)

        logger.clear()
        assert not logger.log_path.exists()

    def test_clear_before_timestamp(self, logger):
        """Test clearing entries before a timestamp."""
        logger.log(tool="tool", query="old", tokens_used=100)
        cutoff = time.time() + 0.1
        time.sleep(0.2)
        logger.log(tool="tool", query="new", tokens_used=200)

        logger.clear(before=cutoff)

        lines = logger.log_path.read_text().strip().split("\n")
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["query"] == "new"

    def test_clear_nonexistent_file(self, logger):
        """Test clearing when no log file exists."""
        logger.clear()  # Should not raise

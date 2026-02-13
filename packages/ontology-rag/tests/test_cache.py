"""Tests for the semantic query cache."""

import json
import time
import pytest
from ontology_rag.cache import SemanticCache


@pytest.fixture
def cache(tmp_path):
    """Create a SemanticCache with a temporary directory."""
    return SemanticCache(cache_dir=tmp_path / ".cache", ttl=3600)


class TestSemanticCacheBasic:
    """Test basic CRUD operations."""

    def test_put_and_get_exact(self, cache):
        """Test exact match cache hit."""
        cache.put(
            "review go code",
            "get_relevant_context",
            {"context": "go stuff"},
            tokens_used=100
        )

        result = cache.get("review go code", "get_relevant_context")
        assert result is not None
        assert result["cache_hit_type"] == "exact"
        assert result["result"] == {"context": "go stuff"}
        assert result["tokens_used"] == 100

    def test_get_miss(self, cache):
        """Test cache miss returns None."""
        result = cache.get("nonexistent query", "some_tool")
        assert result is None

    def test_tool_scoping(self, cache):
        """Test that cache entries are scoped by tool name."""
        cache.put("query", "tool_a", {"a": 1}, tokens_used=50)
        cache.put("query", "tool_b", {"b": 2}, tokens_used=60)

        result_a = cache.get("query", "tool_a")
        result_b = cache.get("query", "tool_b")

        assert result_a is not None
        assert result_a["result"] == {"a": 1}
        assert result_b is not None
        assert result_b["result"] == {"b": 2}

    def test_put_overwrite(self, cache):
        """Test that putting the same key overwrites the value."""
        cache.put("query", "tool", {"old": True}, tokens_used=10)
        cache.put("query", "tool", {"new": True}, tokens_used=20)

        result = cache.get("query", "tool")
        assert result is not None
        assert result["result"] == {"new": True}
        assert result["tokens_used"] == 20

    def test_string_result(self, cache):
        """Test caching string results."""
        cache.put("query", "tool", "some text result", tokens_used=50)
        result = cache.get("query", "tool")
        assert result is not None
        assert result["result"] == "some text result"


class TestSemanticCacheTTL:
    """Test TTL expiration."""

    def test_expired_entry_not_returned(self, tmp_path):
        """Test that expired entries are not returned."""
        cache = SemanticCache(cache_dir=tmp_path / ".cache", ttl=1)
        cache.put("query", "tool", {"data": True}, tokens_used=10)

        # Should be available immediately
        assert cache.get("query", "tool") is not None

        # Wait for expiration
        time.sleep(1.1)
        assert cache.get("query", "tool") is None

    def test_cleanup_expired(self, tmp_path):
        """Test cleanup of expired entries."""
        cache = SemanticCache(cache_dir=tmp_path / ".cache", ttl=1)
        cache.put("query1", "tool", {"data": 1}, tokens_used=10)
        cache.put("query2", "tool", {"data": 2}, tokens_used=20)

        time.sleep(1.1)
        cache.cleanup_expired()

        stats = cache.stats()
        assert stats["total_entries"] == 0


class TestSemanticCacheJaccard:
    """Test Jaccard similarity matching."""

    def test_fuzzy_match(self, cache):
        """Test fuzzy matching with similar queries."""
        cache.put(
            "review golang code for errors",
            "tool",
            {"match": True},
            tokens_used=100
        )

        # Similar query should match (high Jaccard similarity)
        result = cache.get("review golang code for bugs", "tool")
        # "review golang code for errors" vs "review golang code for bugs"
        # Words: {review, golang, code, for, errors} vs
        #        {review, golang, code, for, bugs}
        # Intersection: {review, golang, code, for} = 4
        # Union: {review, golang, code, for, errors, bugs} = 6
        # Jaccard: 4/6 = 0.667 < 0.85
        # This should NOT match with default threshold 0.85
        assert result is None

    def test_fuzzy_match_high_similarity(self, tmp_path):
        """Test fuzzy match with very similar queries."""
        cache = SemanticCache(
            cache_dir=tmp_path / ".cache",
            similarity_threshold=0.7
        )
        cache.put(
            "review go code in main.go file",
            "tool",
            {"found": True},
            tokens_used=50
        )

        # Very similar query
        result = cache.get("review go code in main.go", "tool")
        # {review, go, code, in, main.go, file} vs
        # {review, go, code, in, main.go}
        # Intersection: 5, Union: 6, Jaccard: 5/6 = 0.833 > 0.7
        assert result is not None
        assert result["cache_hit_type"] == "fuzzy"
        assert "similarity" in result

    def test_no_fuzzy_match_different_tool(self, tmp_path):
        """Test that fuzzy matching is scoped by tool."""
        cache = SemanticCache(
            cache_dir=tmp_path / ".cache",
            similarity_threshold=0.5
        )
        cache.put(
            "some query words here",
            "tool_a",
            {"a": True},
            tokens_used=10
        )

        result = cache.get("some query words here now", "tool_b")
        # Different tool, should not match even if similar
        assert result is None


class TestSemanticCacheInvalidation:
    """Test cache invalidation."""

    def test_invalidate_all(self, cache):
        """Test invalidating all entries."""
        cache.put("q1", "tool", {"d": 1}, tokens_used=10)
        cache.put("q2", "tool", {"d": 2}, tokens_used=20)

        cache.invalidate()
        assert cache.get("q1", "tool") is None
        assert cache.get("q2", "tool") is None

    def test_invalidate_by_tool(self, cache):
        """Test invalidating entries by tool name."""
        cache.put("q", "tool_a", {"a": True}, tokens_used=10)
        cache.put("q", "tool_b", {"b": True}, tokens_used=20)

        cache.invalidate(tool_name="tool_a")
        assert cache.get("q", "tool_a") is None
        assert cache.get("q", "tool_b") is not None


class TestSemanticCacheStats:
    """Test cache statistics."""

    def test_stats_empty(self, cache):
        """Test stats on empty cache."""
        stats = cache.stats()
        assert stats["total_entries"] == 0
        assert stats["total_tokens_cached"] == 0

    def test_stats_with_entries(self, cache):
        """Test stats with cache entries."""
        cache.put("q1", "tool", {"d": 1}, tokens_used=100)
        cache.put("q2", "tool", {"d": 2}, tokens_used=200)

        stats = cache.stats()
        assert stats["total_entries"] == 2
        assert stats["total_tokens_cached"] == 300

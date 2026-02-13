"""Semantic query cache using SQLite for persistent storage."""

import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Optional


class SemanticCache:
    """Cache query results with exact and fuzzy matching.

    Uses SQLite for persistent storage. Supports exact hash matching
    and Jaccard word-set similarity for near-match detection.

    Attributes:
        db_path: Path to the SQLite database file.
        ttl: Time-to-live for cache entries in seconds.
        similarity_threshold: Minimum Jaccard similarity for fuzzy matching (0.0-1.0).
    """

    def __init__(
        self,
        cache_dir: str | Path,
        ttl: int | None = None,
        similarity_threshold: float = 0.85,
    ):
        """Initialize semantic cache.

        Args:
            cache_dir: Directory to store the cache database.
            ttl: Cache TTL in seconds. Defaults to ONTOLOGY_CACHE_TTL env var or 3600.
            similarity_threshold: Minimum Jaccard similarity for fuzzy matching.
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / "queries.db"
        self.ttl = ttl if ttl is not None else int(os.environ.get("ONTOLOGY_CACHE_TTL", "3600"))
        self.similarity_threshold = similarity_threshold
        self._init_db()

    def _init_db(self):
        """Create the cache table if it doesn't exist."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS query_cache (
                    query_hash TEXT PRIMARY KEY,
                    query_text TEXT NOT NULL,
                    query_words TEXT NOT NULL,
                    tool_name TEXT NOT NULL,
                    result TEXT NOT NULL,
                    tokens_used INTEGER DEFAULT 0,
                    created_at REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tool_name ON query_cache(tool_name)
            """)

    def _hash_query(self, query: str, tool_name: str) -> str:
        """Create a deterministic hash for a query + tool combination."""
        normalized = " ".join(query.lower().split())
        return hashlib.sha256(f"{tool_name}:{normalized}".encode()).hexdigest()

    def _get_words(self, query: str) -> set[str]:
        """Extract word set from query for Jaccard similarity."""
        return set(query.lower().split())

    def _jaccard_similarity(self, set_a: set[str], set_b: set[str]) -> float:
        """Compute Jaccard similarity between two word sets."""
        if not set_a or not set_b:
            return 0.0
        intersection = set_a & set_b
        union = set_a | set_b
        return len(intersection) / len(union)

    def get(self, query: str, tool_name: str) -> Optional[dict]:
        """Look up a cached result.

        First checks for exact match (hash), then falls back to
        Jaccard similarity matching within the same tool.

        Args:
            query: The query string.
            tool_name: The tool name for scoping.

        Returns:
            Cached result dict with keys: result, tokens_used, cache_hit_type
            or None if not found.
        """
        now = time.time()
        query_hash = self._hash_query(query, tool_name)

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row

            # 1. Exact match
            row = conn.execute(
                "SELECT * FROM query_cache WHERE query_hash = ? AND created_at > ?",
                (query_hash, now - self.ttl),
            ).fetchone()

            if row:
                return {
                    "result": json.loads(row["result"]),
                    "tokens_used": row["tokens_used"],
                    "cache_hit_type": "exact",
                }

            # 2. Fuzzy match (Jaccard similarity)
            query_words = self._get_words(query)
            rows = conn.execute(
                "SELECT * FROM query_cache WHERE tool_name = ? AND created_at > ?",
                (tool_name, now - self.ttl),
            ).fetchall()

            best_match = None
            best_similarity = 0.0

            for r in rows:
                cached_words = set(json.loads(r["query_words"]))
                similarity = self._jaccard_similarity(query_words, cached_words)
                if similarity > best_similarity and similarity >= self.similarity_threshold:
                    best_similarity = similarity
                    best_match = r

            if best_match:
                return {
                    "result": json.loads(best_match["result"]),
                    "tokens_used": best_match["tokens_used"],
                    "cache_hit_type": "fuzzy",
                    "similarity": best_similarity,
                }

        return None

    def put(self, query: str, tool_name: str, result: dict | str, tokens_used: int = 0):
        """Store a result in the cache.

        Args:
            query: The query string.
            tool_name: The tool name for scoping.
            result: The result to cache (dict or string).
            tokens_used: Number of tokens used to generate this result.
        """
        query_hash = self._hash_query(query, tool_name)
        query_words = list(self._get_words(query))
        result_json = json.dumps(result)

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO query_cache
                   (query_hash, query_text, query_words, tool_name, result, tokens_used, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (query_hash, query, json.dumps(query_words), tool_name, result_json, tokens_used, time.time()),
            )

    def invalidate(self, tool_name: str | None = None):
        """Invalidate cache entries.

        Args:
            tool_name: If provided, only invalidate entries for this tool.
                       If None, invalidate all entries.
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            if tool_name:
                conn.execute("DELETE FROM query_cache WHERE tool_name = ?", (tool_name,))
            else:
                conn.execute("DELETE FROM query_cache")

    def cleanup_expired(self):
        """Remove expired cache entries."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "DELETE FROM query_cache WHERE created_at < ?",
                (time.time() - self.ttl,),
            )

    def stats(self) -> dict:
        """Get cache statistics.

        Returns:
            Dict with total_entries, total_tokens_saved, oldest_entry, newest_entry.
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("""
                SELECT COUNT(*) as total,
                       COALESCE(SUM(tokens_used), 0) as total_tokens,
                       MIN(created_at) as oldest,
                       MAX(created_at) as newest
                FROM query_cache
                WHERE created_at > ?
            """, (time.time() - self.ttl,)).fetchone()

            return {
                "total_entries": row[0],
                "total_tokens_cached": row[1],
                "oldest_entry": row[2],
                "newest_entry": row[3],
            }

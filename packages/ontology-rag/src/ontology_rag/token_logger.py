"""Token usage logging for monitoring and optimization."""

import json
import time
from pathlib import Path
from typing import Optional


class TokenLogger:
    """Append-only JSONL logger for token usage tracking.

    Logs every MCP tool call with token usage, cache hit status,
    and timing information. Supports basic aggregation.

    Attributes:
        log_path: Path to the JSONL log file.
    """

    def __init__(self, cache_dir: str | Path):
        """Initialize token logger.

        Args:
            cache_dir: Directory to store the log file.
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.cache_dir / "token_usage.jsonl"

    def log(
        self,
        tool: str,
        query: str,
        tokens_used: int,
        cache_hit: bool = False,
        cache_hit_type: str = "",
        agent: str = "",
        duration_ms: float = 0,
        metadata: Optional[dict] = None,
    ):
        """Log a tool invocation.

        Args:
            tool: Tool name (e.g., "get_relevant_context").
            query: The query string.
            tokens_used: Estimated tokens used in the response.
            cache_hit: Whether the result was served from cache.
            cache_hit_type: "exact", "fuzzy", or "" if no cache hit.
            agent: Agent name if available.
            duration_ms: Execution time in milliseconds.
            metadata: Optional extra metadata.
        """
        entry = {
            "tool": tool,
            "query": query,
            "tokens_used": tokens_used,
            "cache_hit": cache_hit,
            "cache_hit_type": cache_hit_type,
            "agent": agent,
            "duration_ms": round(duration_ms, 2),
            "timestamp": time.time(),
        }
        if metadata:
            entry["metadata"] = metadata

        with open(self.log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def get_stats(self, since: Optional[float] = None) -> dict:
        """Aggregate token usage statistics.

        Args:
            since: Unix timestamp to filter entries from. Defaults to last 24 hours.

        Returns:
            Dict with aggregated stats per tool and overall.
        """
        if since is None:
            since = time.time() - 86400  # Last 24 hours

        tool_stats: dict[str, dict] = {}
        total_tokens = 0
        total_calls = 0
        cache_hits = 0

        if not self.log_path.exists():
            return {
                "period_start": since,
                "total_calls": 0,
                "total_tokens": 0,
                "cache_hits": 0,
                "cache_hit_rate": 0.0,
                "by_tool": {},
            }

        with open(self.log_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("timestamp", 0) < since:
                    continue

                tool = entry.get("tool", "unknown")
                tokens = entry.get("tokens_used", 0)
                is_cache_hit = entry.get("cache_hit", False)

                if tool not in tool_stats:
                    tool_stats[tool] = {
                        "calls": 0,
                        "tokens": 0,
                        "cache_hits": 0,
                        "avg_duration_ms": 0,
                        "total_duration_ms": 0,
                    }

                tool_stats[tool]["calls"] += 1
                tool_stats[tool]["tokens"] += tokens
                tool_stats[tool]["total_duration_ms"] += entry.get("duration_ms", 0)
                if is_cache_hit:
                    tool_stats[tool]["cache_hits"] += 1
                    cache_hits += 1

                total_tokens += tokens
                total_calls += 1

        # Calculate averages
        for stats in tool_stats.values():
            if stats["calls"] > 0:
                stats["avg_duration_ms"] = round(
                    stats["total_duration_ms"] / stats["calls"], 2
                )
            del stats["total_duration_ms"]

        return {
            "period_start": since,
            "total_calls": total_calls,
            "total_tokens": total_tokens,
            "cache_hits": cache_hits,
            "cache_hit_rate": round(cache_hits / total_calls, 3) if total_calls > 0 else 0.0,
            "by_tool": tool_stats,
        }

    def clear(self, before: Optional[float] = None):
        """Clear log entries.

        Args:
            before: If provided, only clear entries before this timestamp.
                   If None, clear all entries.
        """
        if before is None:
            if self.log_path.exists():
                self.log_path.unlink()
            return

        if not self.log_path.exists():
            return

        kept_lines = []
        with open(self.log_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("timestamp", 0) >= before:
                        kept_lines.append(line)
                except json.JSONDecodeError:
                    continue

        with open(self.log_path, "w") as f:
            for line in kept_lines:
                f.write(line + "\n")

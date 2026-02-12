"""Monitoring dashboard for ontology-rag system.

Provides real-time monitoring, waste detection, phase comparison,
and automated reporting for token usage patterns.
"""

import json
import time
from dataclasses import dataclass
from pathlib import Path

from ontology_rag.token_logger import TokenLogger


@dataclass
class MonitoringSnapshot:
    """Snapshot of monitoring data for a time period.

    Attributes:
        timestamp: Unix timestamp when snapshot was created.
        period_hours: Hours covered by this snapshot.
        total_queries: Total number of queries in period.
        total_tokens: Total tokens used in period.
        avg_tokens_per_query: Average tokens per query.
        cache_hit_rate: Cache hit rate (0.0 to 1.0).
        waste_alerts: List of waste alert dicts.
        by_complexity: Breakdown by complexity level.
        by_tool: Breakdown by tool name.
        recommendations: List of optimization recommendations.
    """

    timestamp: float
    period_hours: float
    total_queries: int
    total_tokens: int
    avg_tokens_per_query: float
    cache_hit_rate: float
    waste_alerts: list[dict]
    by_complexity: dict[str, dict]
    by_tool: dict[str, dict]
    recommendations: list[str]


@dataclass
class PhaseComparison:
    """Comparison between baseline and current phase performance.

    Attributes:
        baseline_avg: Baseline average tokens per query.
        current_avg: Current average tokens per query.
        improvement_pct: Percentage improvement (negative = regression).
        period_hours: Hours covered by current measurement.
        sample_count: Number of queries in current period.
    """

    baseline_avg: float
    current_avg: float
    improvement_pct: float
    period_hours: float
    sample_count: int


class MonitoringDashboard:
    """Monitoring dashboard for ontology-rag system.

    Provides comprehensive monitoring capabilities including:
    - Real-time statistics snapshots
    - Waste pattern detection
    - Phase-to-phase performance comparison
    - Automated monthly reporting

    Attributes:
        token_logger: TokenLogger instance for data access.
    """

    def __init__(self, token_logger: TokenLogger):
        """Initialize monitoring dashboard.

        Args:
            token_logger: TokenLogger instance to monitor.
        """
        self.token_logger = token_logger
        self._baseline_avg: float | None = None

    def get_snapshot(self, period_hours: float = 24) -> MonitoringSnapshot:
        """Get a monitoring snapshot for the specified period.

        Args:
            period_hours: Number of hours to analyze (default 24).

        Returns:
            MonitoringSnapshot with comprehensive statistics.
        """
        since = time.time() - period_hours * 3600
        stats = self.token_logger.get_stats(since=since)

        total_calls = stats.get("total_calls", 0)
        total_tokens = stats.get("total_tokens", 0)
        avg_tokens = total_tokens / total_calls if total_calls > 0 else 0.0

        # Read raw entries for complexity breakdown
        entries = self._read_entries(since)
        by_complexity = self._compute_complexity_breakdown(entries)

        # Detect waste patterns
        waste_alerts = self.detect_waste_patterns(period_hours)

        # Generate recommendations
        recommendations = self._generate_recommendations(stats)

        return MonitoringSnapshot(
            timestamp=time.time(),
            period_hours=period_hours,
            total_queries=total_calls,
            total_tokens=total_tokens,
            avg_tokens_per_query=round(avg_tokens, 1),
            cache_hit_rate=stats.get("cache_hit_rate", 0.0),
            waste_alerts=waste_alerts,
            by_complexity=by_complexity,
            by_tool=stats.get("by_tool", {}),
            recommendations=recommendations,
        )

    def detect_waste_patterns(self, period_hours: float = 24) -> list[dict]:
        """Detect queries that wasted tokens.

        A query wastes tokens when tokens_used is less than 30% of
        the expected range for typical queries.

        Args:
            period_hours: Number of hours to analyze (default 24).

        Returns:
            List of waste alert dicts with keys:
            - query: Query string (truncated to 100 chars)
            - tokens_used: Actual tokens used
            - expected_range: Expected token range
            - tool: Tool name
            - timestamp: Unix timestamp
        """
        since = time.time() - period_hours * 3600
        entries = self._read_entries(since)

        if not entries:
            return []

        # Calculate average tokens per tool
        tool_avg: dict[str, float] = {}
        tool_counts: dict[str, int] = {}

        for entry in entries:
            tool = entry.get("tool", "unknown")
            tokens = entry.get("tokens_used", 0)
            tool_avg[tool] = tool_avg.get(tool, 0) + tokens
            tool_counts[tool] = tool_counts.get(tool, 0) + 1

        for tool in tool_avg:
            if tool_counts[tool] > 0:
                tool_avg[tool] = tool_avg[tool] / tool_counts[tool]

        # Find entries with unusually low token usage
        waste_alerts = []
        waste_threshold = 0.3  # 30% of average

        for entry in entries:
            tool = entry.get("tool", "unknown")
            tokens_used = entry.get("tokens_used", 0)
            avg = tool_avg.get(tool, 0)

            if avg > 0 and tokens_used < avg * waste_threshold:
                query = entry.get("query", "")
                if len(query) > 100:
                    query = query[:97] + "..."

                expected_low = int(avg * 0.7)
                expected_high = int(avg * 1.3)

                waste_alerts.append({
                    "query": query,
                    "tokens_used": tokens_used,
                    "expected_range": f"{expected_low}-{expected_high}",
                    "tool": tool,
                    "timestamp": entry.get("timestamp", 0),
                })

        return waste_alerts

    def set_baseline(self, avg_tokens: float):
        """Set the baseline average tokens for phase comparison.

        Args:
            avg_tokens: The average tokens per query for the previous phase.
        """
        self._baseline_avg = avg_tokens

    def compare_phases(self, period_hours: float = 24) -> PhaseComparison | None:
        """Compare current performance against baseline.

        Args:
            period_hours: Number of hours to analyze (default 24).

        Returns:
            PhaseComparison object if baseline is set, None otherwise.
        """
        if self._baseline_avg is None:
            return None

        stats = self.token_logger.get_stats(
            since=time.time() - period_hours * 3600
        )
        total_calls = stats.get("total_calls", 0)

        if total_calls == 0:
            return None

        current_avg = stats["total_tokens"] / total_calls
        improvement = (
            (self._baseline_avg - current_avg) / self._baseline_avg * 100
        )

        return PhaseComparison(
            baseline_avg=self._baseline_avg,
            current_avg=round(current_avg, 1),
            improvement_pct=round(improvement, 1),
            period_hours=period_hours,
            sample_count=total_calls,
        )

    def generate_report(self, period_hours: float = 720) -> str:
        """Generate a markdown monthly report.

        Args:
            period_hours: Hours to cover (default 720 = 30 days).

        Returns:
            Markdown formatted report string.
        """
        snapshot = self.get_snapshot(period_hours)
        phase_cmp = self.compare_phases(period_hours)

        lines = [
            "# Ontology-RAG Monitoring Report",
            "",
            f"**Period**: Last {period_hours} hours ({period_hours/24:.0f} days)",
            f"**Generated**: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## Summary",
            "",
            f"- **Total Queries**: {snapshot.total_queries:,}",
            f"- **Total Tokens**: {snapshot.total_tokens:,}",
            f"- **Avg Tokens/Query**: {snapshot.avg_tokens_per_query:.1f}",
            f"- **Cache Hit Rate**: {snapshot.cache_hit_rate * 100:.1f}%",
            "",
        ]

        # Cache performance
        cache_hits = int(snapshot.total_queries * snapshot.cache_hit_rate)
        tokens_saved = cache_hits * snapshot.avg_tokens_per_query
        lines.extend([
            "## Cache Performance",
            "",
            f"- **Cache Hits**: {cache_hits:,}",
            f"- **Estimated Tokens Saved**: {tokens_saved:,.0f}",
            "",
        ])

        # Per-tool breakdown
        if snapshot.by_tool:
            lines.extend([
                "## Per-Tool Breakdown",
                "",
                "| Tool | Calls | Tokens | Avg Tokens | Cache Hits | Avg Duration (ms) |",
                "|------|-------|--------|------------|------------|-------------------|",
            ])

            for tool, data in snapshot.by_tool.items():
                calls = data.get("calls", 0)
                tokens = data.get("tokens", 0)
                avg = tokens / calls if calls > 0 else 0
                cache = data.get("cache_hits", 0)
                duration = data.get("avg_duration_ms", 0)

                lines.append(
                    f"| {tool} | {calls:,} | {tokens:,} | {avg:.1f} | "
                    f"{cache:,} | {duration:.1f} |"
                )

            lines.append("")

        # Waste alerts
        if snapshot.waste_alerts:
            lines.extend([
                "## Waste Alerts",
                "",
                f"Found {len(snapshot.waste_alerts)} queries with "
                f"unusually low token usage:",
                "",
            ])

            for alert in snapshot.waste_alerts[:10]:  # Limit to 10
                lines.append(
                    f"- **{alert['tool']}**: Used {alert['tokens_used']} tokens "
                    f"(expected {alert['expected_range']})"
                )
                lines.append(f"  Query: `{alert['query']}`")

            if len(snapshot.waste_alerts) > 10:
                lines.append(
                    f"\n_... and {len(snapshot.waste_alerts) - 10} more_"
                )

            lines.append("")

        # Phase comparison
        if phase_cmp:
            direction = "↓" if phase_cmp.improvement_pct > 0 else "↑"
            lines.extend([
                "## Phase Comparison",
                "",
                f"- **Baseline Avg**: {phase_cmp.baseline_avg:.1f} tokens/query",
                f"- **Current Avg**: {phase_cmp.current_avg:.1f} tokens/query",
                f"- **Change**: {direction} {abs(phase_cmp.improvement_pct):.1f}%",
                f"- **Sample Size**: {phase_cmp.sample_count:,} queries",
                "",
            ])

        # Recommendations
        if snapshot.recommendations:
            lines.extend([
                "## Recommendations",
                "",
            ])
            for rec in snapshot.recommendations:
                lines.append(f"- {rec}")
            lines.append("")

        return "\n".join(lines)

    def _read_entries(self, since: float) -> list[dict]:
        """Read raw JSONL log entries since timestamp.

        Args:
            since: Unix timestamp to filter from.

        Returns:
            List of entry dicts.
        """
        if not self.token_logger.log_path.exists():
            return []

        entries = []
        with open(self.token_logger.log_path) as f:
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

        return entries

    def _compute_complexity_breakdown(
        self, entries: list[dict]
    ) -> dict[str, dict]:
        """Compute token usage by complexity level.

        Args:
            entries: List of log entry dicts.

        Returns:
            Dict mapping complexity level to {count, avg_tokens}.
        """
        complexity_data: dict[str, dict] = {}

        for entry in entries:
            # Try to extract complexity from metadata
            metadata = entry.get("metadata", {})
            complexity = metadata.get("complexity", "unknown")
            tokens = entry.get("tokens_used", 0)

            if complexity not in complexity_data:
                complexity_data[complexity] = {"count": 0, "total_tokens": 0}

            complexity_data[complexity]["count"] += 1
            complexity_data[complexity]["total_tokens"] += tokens

        # Calculate averages
        for complexity, data in complexity_data.items():
            count = data["count"]
            total = data["total_tokens"]
            data["avg_tokens"] = total / count if count > 0 else 0.0
            del data["total_tokens"]

        return complexity_data

    def _generate_recommendations(self, stats: dict) -> list[str]:
        """Generate optimization recommendations based on stats.

        Args:
            stats: Statistics dict from TokenLogger.

        Returns:
            List of recommendation strings.
        """
        recommendations = []

        cache_rate = stats.get("cache_hit_rate", 0)
        if cache_rate < 0.3:
            recommendations.append(
                "Cache hit rate is low (<30%). "
                "Consider increasing cache TTL or reviewing query patterns."
            )

        total_calls = stats.get("total_calls", 0)
        total_tokens = stats.get("total_tokens", 0)

        if total_calls > 0:
            avg = total_tokens / total_calls
            if avg > 3000:
                recommendations.append(
                    f"Average tokens per query ({avg:.0f}) is high. "
                    "Consider enabling adaptive budget management."
                )
            elif avg < 500:
                recommendations.append(
                    f"Average tokens per query ({avg:.0f}) is very low. "
                    "Verify that queries are being answered completely."
                )

        # Check for tools with high token usage
        by_tool = stats.get("by_tool", {})
        for tool, data in by_tool.items():
            calls = data.get("calls", 0)
            tokens = data.get("tokens", 0)
            if calls > 0:
                avg = tokens / calls
                if avg > 5000:
                    recommendations.append(
                        f"Tool '{tool}' has high average token usage ({avg:.0f}). "
                        "Review queries targeting this tool."
                    )

        return recommendations

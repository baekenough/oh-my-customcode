"""A/B testing framework for comparing ontology-rag vs baseline context loading.

This module provides a simple A/B testing framework that records control
(baseline) and treatment (ontology-optimized) results to JSONL files for
easy analysis and external processing.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass
class ABResult:
    """Single A/B test observation.

    Attributes:
        query: The query string being tested.
        group: Test group identifier ("control" or "treatment").
        tokens_used: Number of tokens consumed for this query.
        duration_ms: Time taken to process query in milliseconds.
        cache_hit: Whether this query resulted in a cache hit.
        agent: Name of the agent that processed this query.
        timestamp: Unix timestamp when result was recorded.
    """

    query: str
    group: Literal["control", "treatment"]
    tokens_used: int
    duration_ms: float
    cache_hit: bool = False
    agent: str = ""
    timestamp: float = field(default=0.0)


@dataclass
class ABSummary:
    """Summary comparison of control vs treatment groups.

    Attributes:
        control_count: Number of control group observations.
        treatment_count: Number of treatment group observations.
        control_avg_tokens: Average tokens used in control group.
        treatment_avg_tokens: Average tokens used in treatment group.
        token_reduction_pct: Percentage reduction in token usage.
        control_avg_duration_ms: Average duration for control group.
        treatment_avg_duration_ms: Average duration for treatment group.
        control_cache_rate: Cache hit rate for control group (0.0-1.0).
        treatment_cache_rate: Cache hit rate for treatment group (0.0-1.0).
        winner: Which group performed better ("control", "treatment", or "inconclusive").
    """

    control_count: int
    treatment_count: int
    control_avg_tokens: float
    treatment_avg_tokens: float
    token_reduction_pct: float
    control_avg_duration_ms: float
    treatment_avg_duration_ms: float
    control_cache_rate: float
    treatment_cache_rate: float
    winner: Literal["control", "treatment", "inconclusive"]


class ABTestRunner:
    """A/B test framework with JSONL persistence.

    Records control (no optimization) vs treatment (with optimization) results.
    Uses JSONL for storage, making it easy to analyze externally.

    Example:
        >>> runner = ABTestRunner("/tmp/ab_results")
        >>> result = ABResult(
        ...     query="test query",
        ...     group="treatment",
        ...     tokens_used=1500,
        ...     duration_ms=45.2
        ... )
        >>> runner.record_result(result)
        >>> summary = runner.get_summary()
        >>> print(f"Winner: {summary.winner}")
    """

    def __init__(self, results_dir: str | Path) -> None:
        """Initialize A/B test runner.

        Args:
            results_dir: Directory to store JSONL results file.
        """
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.results_path = self.results_dir / "ab_results.jsonl"

    def record_result(self, result: ABResult) -> None:
        """Record a single A/B test result.

        Sets timestamp if not already set.
        Appends to JSONL file.

        Args:
            result: The ABResult instance to record.
        """
        if result.timestamp == 0.0:
            result.timestamp = time.time()

        entry = {
            "query": result.query,
            "group": result.group,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms,
            "cache_hit": result.cache_hit,
            "agent": result.agent,
            "timestamp": result.timestamp,
        }

        with open(self.results_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def get_summary(self) -> ABSummary:
        """Compute summary statistics comparing control and treatment groups.

        Returns:
            ABSummary instance with comparison statistics.

        Note:
            If one group has no data, its averages are 0.
            Winner is determined by which group uses fewer tokens on average.
            Returns "inconclusive" if fewer than 5 samples in either group.
        """
        entries = self._read_results()

        control = [e for e in entries if e["group"] == "control"]
        treatment = [e for e in entries if e["group"] == "treatment"]

        # Calculate token averages
        ctrl_tokens = [e["tokens_used"] for e in control]
        treat_tokens = [e["tokens_used"] for e in treatment]

        ctrl_avg = sum(ctrl_tokens) / len(ctrl_tokens) if ctrl_tokens else 0
        treat_avg = sum(treat_tokens) / len(treat_tokens) if treat_tokens else 0

        # Calculate duration averages
        ctrl_dur = [e["duration_ms"] for e in control]
        treat_dur = [e["duration_ms"] for e in treatment]

        ctrl_avg_dur = sum(ctrl_dur) / len(ctrl_dur) if ctrl_dur else 0
        treat_avg_dur = sum(treat_dur) / len(treat_dur) if treat_dur else 0

        # Calculate cache hit rates
        ctrl_cache = (
            sum(1 for e in control if e.get("cache_hit")) / len(control)
            if control
            else 0
        )
        treat_cache = (
            sum(1 for e in treatment if e.get("cache_hit")) / len(treatment)
            if treatment
            else 0
        )

        # Calculate token reduction percentage
        reduction = (
            (ctrl_avg - treat_avg) / ctrl_avg * 100
            if ctrl_avg > 0
            else 0
        )

        # Determine winner
        winner = self._determine_winner(
            len(control), len(treatment), ctrl_avg, treat_avg
        )

        return ABSummary(
            control_count=len(control),
            treatment_count=len(treatment),
            control_avg_tokens=round(ctrl_avg, 1),
            treatment_avg_tokens=round(treat_avg, 1),
            token_reduction_pct=round(reduction, 1),
            control_avg_duration_ms=round(ctrl_avg_dur, 1),
            treatment_avg_duration_ms=round(treat_avg_dur, 1),
            control_cache_rate=round(ctrl_cache, 3),
            treatment_cache_rate=round(treat_cache, 3),
            winner=winner,
        )

    def should_use_ontology(self, query: str) -> bool:
        """Decide whether to use ontology-based context based on A/B results.

        Args:
            query: The query string (unused, kept for API consistency).

        Returns:
            True if treatment is winning or inconclusive (prefer new system).
            False only if control is clearly better.
        """
        summary = self.get_summary()
        return summary.winner != "control"

    def export_results(self) -> str:
        """Export all results as a formatted JSON string.

        Returns:
            JSON string with all entries and summary.
        """
        entries = self._read_results()
        summary = self.get_summary()

        return json.dumps(
            {
                "total_results": len(entries),
                "summary": {
                    "control_count": summary.control_count,
                    "treatment_count": summary.treatment_count,
                    "control_avg_tokens": summary.control_avg_tokens,
                    "treatment_avg_tokens": summary.treatment_avg_tokens,
                    "token_reduction_pct": summary.token_reduction_pct,
                    "winner": summary.winner,
                },
                "results": entries,
            },
            indent=2,
        )

    def clear(self) -> None:
        """Clear all recorded results by removing the JSONL file."""
        if self.results_path.exists():
            self.results_path.unlink()

    def _read_results(self) -> list[dict]:
        """Read all results from JSONL file.

        Returns:
            List of result dictionaries. Empty list if file doesn't exist.
        """
        if not self.results_path.exists():
            return []

        entries = []
        with open(self.results_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    # Skip malformed lines
                    continue
        return entries

    @staticmethod
    def _determine_winner(
        control_count: int,
        treatment_count: int,
        control_avg: float,
        treatment_avg: float,
    ) -> Literal["control", "treatment", "inconclusive"]:
        """Determine which group performed better.

        Args:
            control_count: Number of control observations.
            treatment_count: Number of treatment observations.
            control_avg: Average tokens for control group.
            treatment_avg: Average tokens for treatment group.

        Returns:
            "treatment" if treatment uses fewer tokens, "control" if control
            uses fewer tokens, or "inconclusive" if not enough data.
        """
        if control_count < 5 or treatment_count < 5:
            return "inconclusive"

        if treatment_avg < control_avg:
            return "treatment"

        if control_avg < treatment_avg:
            return "control"

        return "inconclusive"

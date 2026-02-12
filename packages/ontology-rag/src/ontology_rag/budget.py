"""Token budget management for context loading."""

import json
import time
from dataclasses import dataclass, replace
from enum import Enum


class QueryComplexity(Enum):
    """Query complexity levels for token budget allocation."""

    SIMPLE = "simple"  # Single-file operation, clear intent
    MODERATE = "moderate"  # Multi-file or ambiguous intent
    COMPLEX = "complex"  # Multi-agent, architectural decisions
    BATCH = "batch"  # Parallel execution, batch operations


@dataclass
class TokenBudget:
    """Token budget allocation for different context components.

    Attributes:
        total: Total token budget.
        rules: Budget allocated for rules.
        skills: Budget allocated for skills.
        agent: Budget allocated for agent info.
        reserve: Buffer for safety.
    """

    total: int
    rules: int
    skills: int
    agent: int
    reserve: int


class BudgetManager:
    """Manage token budgets for context loading based on query complexity.

    This class determines appropriate token budgets based on query complexity
    classification. Different complexity levels get different budgets to
    balance context richness with token efficiency.

    Attributes:
        budgets: Dictionary mapping complexity levels to TokenBudget objects.
    """

    # Default budgets per complexity level
    BUDGETS = {
        QueryComplexity.SIMPLE: TokenBudget(
            total=2000, rules=800, skills=600, agent=200, reserve=400
        ),
        QueryComplexity.MODERATE: TokenBudget(
            total=5000, rules=2000, skills=1500, agent=500, reserve=1000
        ),
        QueryComplexity.COMPLEX: TokenBudget(
            total=10000, rules=4000, skills=3000, agent=1000, reserve=2000
        ),
        QueryComplexity.BATCH: TokenBudget(
            total=3000, rules=1200, skills=800, agent=300, reserve=700
        ),
    }

    def __init__(self, custom_budgets: dict = None):
        """Initialize budget manager.

        Args:
            custom_budgets: Optional dictionary to override default budgets.
        """
        self.budgets = {k: replace(v) for k, v in self.BUDGETS.items()}
        if custom_budgets:
            self.budgets.update(custom_budgets)

    def classify_complexity(self, query: str, agent_count: int = 1) -> QueryComplexity:
        """Classify query complexity based on heuristics.

        This method analyzes the query string and agent count to determine
        the appropriate complexity level.

        Args:
            query: User query string.
            agent_count: Number of agents involved.

        Returns:
            QueryComplexity enum value.
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())

        # Batch: multiple agents or explicit batch keywords
        if agent_count >= 4 or query_words & {"batch", "parallel"} or "all agents" in query_lower:
            return QueryComplexity.BATCH

        # Complex: architectural/multi-agent keywords
        if query_words & {
            "architect",
            "design",
            "refactor",
            "migration",
            "analyze",
            "comprehensive",
            "full",
        } or "review all" in query_lower:
            return QueryComplexity.COMPLEX

        # Simple: clear single-action keywords
        if query_words & {"fix", "typo", "rename", "add", "remove", "delete", "format"}:
            return QueryComplexity.SIMPLE

        # Default: moderate
        return QueryComplexity.MODERATE

    def get_budget(self, complexity: QueryComplexity) -> TokenBudget:
        """Get token budget for given complexity level.

        Args:
            complexity: QueryComplexity enum value.

        Returns:
            TokenBudget for that complexity level.
        """
        return self.budgets[complexity]

    def get_budget_for_query(self, query: str, agent_count: int = 1) -> TokenBudget:
        """Get token budget based on query analysis.

        This is a convenience method that combines classification and budget lookup.

        Args:
            query: User query string.
            agent_count: Number of agents involved.

        Returns:
            Appropriate TokenBudget for the query.
        """
        complexity = self.classify_complexity(query, agent_count)
        return self.get_budget(complexity)


@dataclass
class BudgetAnalysis:
    """Analysis result from adaptive budget optimization.

    Attributes:
        avg_tokens_used: Average tokens used across analyzed samples.
        waste_ratio: Ratio of wasted tokens (allocated - used) / allocated.
        optimal_budget: Recommended total budget based on p90 + headroom.
        samples: Number of samples analyzed.
        by_component: Average tokens per component (tool name → avg tokens).
    """

    avg_tokens_used: float
    waste_ratio: float
    optimal_budget: int
    samples: int
    by_component: dict[str, float]


class AdaptiveBudgetManager(BudgetManager):
    """Budget manager that adapts based on TokenLogger history.

    Uses p90 actual usage to set budgets with 20% headroom.
    Falls back to static budgets when insufficient history.

    This manager analyzes historical token usage patterns and adjusts budgets
    dynamically to minimize waste while maintaining adequate headroom for
    complex queries.

    Attributes:
        token_logger: Optional TokenLogger instance for reading usage history.
        _adaptation_cache: Cached result from last adaptation.
        _last_adapted_at: Timestamp of last adaptation.
    """

    MIN_SAMPLES = 10  # Minimum samples before adapting
    HEADROOM_RATIO = 1.2  # 20% headroom above p90

    # Minimum budgets (never go below these)
    MIN_BUDGETS = {
        QueryComplexity.SIMPLE: 500,
        QueryComplexity.MODERATE: 1500,
        QueryComplexity.COMPLEX: 3000,
        QueryComplexity.BATCH: 1000,
    }

    def __init__(self, token_logger=None, custom_budgets: dict = None):
        """Initialize with optional TokenLogger for history-based adaptation.

        Args:
            token_logger: TokenLogger instance for reading usage history.
            custom_budgets: Optional custom budget overrides.
        """
        super().__init__(custom_budgets)
        self.token_logger = token_logger
        self._adaptation_cache = None
        self._last_adapted_at = 0.0

    def adapt_from_history(self, lookback_hours: int = 24) -> BudgetAnalysis:
        """Analyze token usage history and adapt budgets.

        Uses p90 of actual usage + 20% headroom.
        Never reduces below MIN_BUDGETS.

        Args:
            lookback_hours: Hours of history to analyze.

        Returns:
            BudgetAnalysis with optimization results.
        """
        if not self.token_logger:
            return BudgetAnalysis(
                avg_tokens_used=0,
                waste_ratio=0,
                optimal_budget=0,
                samples=0,
                by_component={},
            )

        since = time.time() - (lookback_hours * 3600)
        stats = self.token_logger.get_stats(since=since)

        total_calls = stats.get("total_calls", 0)
        if total_calls < self.MIN_SAMPLES:
            return BudgetAnalysis(
                avg_tokens_used=stats.get("total_tokens", 0) / max(total_calls, 1),
                waste_ratio=0,
                optimal_budget=0,
                samples=total_calls,
                by_component={
                    tool: data.get("tokens", 0) / max(data.get("calls", 1), 1)
                    for tool, data in stats.get("by_tool", {}).items()
                },
            )

        # Read raw log entries for p90 calculation
        entries = self._read_log_entries(since)
        if not entries:
            return BudgetAnalysis(
                avg_tokens_used=0,
                waste_ratio=0,
                optimal_budget=0,
                samples=0,
                by_component={},
            )

        # Calculate p90 of actual token usage
        token_values = sorted([e.get("tokens_used", 0) for e in entries])
        p90_index = int(len(token_values) * 0.9)
        p90_tokens = token_values[min(p90_index, len(token_values) - 1)]

        # Optimal budget: p90 + headroom
        optimal = int(p90_tokens * self.HEADROOM_RATIO)

        # Calculate average and waste
        avg_used = sum(token_values) / len(token_values)
        avg_allocated = sum(b.total for b in self.budgets.values()) / len(
            self.budgets
        )
        waste_ratio = (
            (avg_allocated - avg_used) / avg_allocated if avg_allocated > 0 else 0
        )

        # Adapt budgets based on complexity distribution
        # Scale each complexity level proportionally
        for complexity in QueryComplexity:
            current = self.budgets[complexity]
            min_budget = self.MIN_BUDGETS.get(complexity, 500)
            ratio = current.total / avg_allocated if avg_allocated > 0 else 1.0
            new_total = max(min_budget, int(optimal * ratio))

            # Scale components proportionally
            if current.total > 0:
                scale = new_total / current.total
                self.budgets[complexity] = TokenBudget(
                    total=new_total,
                    rules=max(200, int(current.rules * scale)),
                    skills=max(150, int(current.skills * scale)),
                    agent=max(50, int(current.agent * scale)),
                    reserve=max(100, int(current.reserve * scale)),
                )

        # Per-component averages
        by_component = {}
        for tool, data in stats.get("by_tool", {}).items():
            calls = data.get("calls", 1)
            by_component[tool] = data.get("tokens", 0) / max(calls, 1)

        self._last_adapted_at = time.time()

        analysis = BudgetAnalysis(
            avg_tokens_used=avg_used,
            waste_ratio=round(waste_ratio, 3),
            optimal_budget=optimal,
            samples=len(entries),
            by_component=by_component,
        )
        self._adaptation_cache = analysis
        return analysis

    def detect_waste(self, query: str, used: int, allocated: int) -> dict | None:
        """Detect if a query wasted tokens (used much less than allocated).

        Args:
            query: The query string.
            used: Actual tokens used.
            allocated: Tokens that were allocated.

        Returns:
            Waste info dict if waste detected (>50% unused), None otherwise.
        """
        if allocated <= 0:
            return None
        waste_pct = (allocated - used) / allocated
        if waste_pct > 0.5:
            return {
                "query": query[:100],
                "allocated": allocated,
                "used": used,
                "wasted": allocated - used,
                "waste_pct": round(waste_pct, 3),
            }
        return None

    def _read_log_entries(self, since: float) -> list[dict]:
        """Read raw log entries from TokenLogger's JSONL file.

        Args:
            since: Unix timestamp to filter entries from.

        Returns:
            List of log entry dictionaries.
        """
        if not self.token_logger or not self.token_logger.log_path.exists():
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

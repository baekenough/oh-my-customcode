"""Token budget management for context loading."""

from dataclasses import dataclass
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
        self.budgets = dict(self.BUDGETS)
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

        # Batch: multiple agents or explicit batch keywords
        if agent_count >= 4 or any(
            kw in query_lower for kw in ["batch", "all agents", "parallel"]
        ):
            return QueryComplexity.BATCH

        # Complex: architectural/multi-agent keywords
        if any(
            kw in query_lower
            for kw in [
                "architect",
                "design",
                "refactor",
                "migration",
                "review all",
                "analyze",
                "comprehensive",
                "full",
            ]
        ):
            return QueryComplexity.COMPLEX

        # Simple: clear single-action keywords
        if any(
            kw in query_lower
            for kw in ["fix", "typo", "rename", "add", "remove", "delete", "format"]
        ):
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

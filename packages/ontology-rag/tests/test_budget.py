"""Tests for token budget management."""

from dataclasses import replace

from ontology_rag import BudgetManager, QueryComplexity


def test_simple_classification():
    """Test classification of simple queries."""
    mgr = BudgetManager()
    c = mgr.classify_complexity("fix typo in readme")
    assert c == QueryComplexity.SIMPLE


def test_complex_classification():
    """Test classification of complex queries."""
    mgr = BudgetManager()
    c = mgr.classify_complexity("architect the new authentication system")
    assert c == QueryComplexity.COMPLEX


def test_batch_classification():
    """Test classification of batch queries."""
    mgr = BudgetManager()
    c = mgr.classify_complexity("review all files", agent_count=4)
    assert c == QueryComplexity.BATCH


def test_batch_classification_by_keyword():
    """Test batch classification by keyword."""
    mgr = BudgetManager()
    c = mgr.classify_complexity("run batch processing on all agents")
    assert c == QueryComplexity.BATCH


def test_moderate_default():
    """Test that moderate is the default classification."""
    mgr = BudgetManager()
    c = mgr.classify_complexity("update the documentation")
    assert c == QueryComplexity.MODERATE


def test_budget_values():
    """Test budget values for different complexity levels."""
    mgr = BudgetManager()

    simple_budget = mgr.get_budget(QueryComplexity.SIMPLE)
    assert simple_budget.total == 2000

    complex_budget = mgr.get_budget(QueryComplexity.COMPLEX)
    assert complex_budget.total == 10000


def test_budget_for_query():
    """Test getting budget directly from query."""
    mgr = BudgetManager()
    budget = mgr.get_budget_for_query("fix typo")
    assert budget.total == 2000


def test_custom_budgets():
    """Test custom budget configuration."""
    original = BudgetManager.BUDGETS[QueryComplexity.SIMPLE]
    custom_budget = replace(original, total=3000)
    custom = {QueryComplexity.SIMPLE: custom_budget}

    mgr = BudgetManager(custom_budgets=custom)
    budget = mgr.get_budget(QueryComplexity.SIMPLE)
    assert budget.total == 3000


def test_budget_components():
    """Test that budget has all components."""
    mgr = BudgetManager()
    budget = mgr.get_budget(QueryComplexity.MODERATE)

    assert budget.total > 0
    assert budget.rules > 0
    assert budget.skills > 0
    assert budget.agent > 0
    assert budget.reserve > 0


def test_complex_keywords():
    """Test various complex query keywords."""
    mgr = BudgetManager()

    for keyword in ["refactor", "migration", "analyze", "comprehensive"]:
        c = mgr.classify_complexity(f"{keyword} the codebase")
        assert c == QueryComplexity.COMPLEX


def test_simple_keywords():
    """Test various simple query keywords."""
    mgr = BudgetManager()

    for keyword in ["rename", "add", "remove", "delete", "format"]:
        c = mgr.classify_complexity(f"{keyword} this file")
        assert c == QueryComplexity.SIMPLE


def test_agent_count_override():
    """Test that high agent count triggers batch mode."""
    mgr = BudgetManager()

    # Simple query, but many agents
    c = mgr.classify_complexity("fix this", agent_count=5)
    assert c == QueryComplexity.BATCH

    # Same query, few agents
    c = mgr.classify_complexity("fix this", agent_count=1)
    assert c == QueryComplexity.SIMPLE

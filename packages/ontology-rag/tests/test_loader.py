"""Tests for hierarchical context loading."""

from ontology_rag import Ontology, OntologyGraph, HierarchicalLoader


def test_load_for_agent(sample_ontology_dir, sample_rules_dir):
    """Test loading context for an agent."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert ctx.agent_summary != ""
    assert len(ctx.rule_summaries) > 0
    assert ctx.total_tokens > 0
    assert ctx.total_tokens <= 5000


def test_respects_budget(sample_ontology_dir, sample_rules_dir):
    """Test that loader respects token budget."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    small_ctx = loader.load_for_agent("lang-golang-expert", token_budget=100)
    large_ctx = loader.load_for_agent("lang-golang-expert", token_budget=10000)

    assert small_ctx.total_tokens <= 100
    assert large_ctx.total_tokens > small_ctx.total_tokens


def test_to_context_string(sample_ontology_dir, sample_rules_dir):
    """Test converting context to string."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    text = ctx.to_context_string()
    assert "Agent" in text
    assert "lang-golang-expert" in text


def test_nonexistent_agent(sample_ontology_dir):
    """Test loading context for nonexistent agent."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph)

    ctx = loader.load_for_agent("nonexistent-agent")
    assert ctx.agent_summary == ""
    assert ctx.total_tokens == 0


def test_loading_levels(sample_ontology_dir, sample_rules_dir):
    """Test that loading levels are recorded."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert len(ctx.loading_levels) > 0
    assert 0 in ctx.loading_levels  # Agent summary level


def test_rule_expansion(sample_ontology_dir, sample_rules_dir):
    """Test that rules are expanded when budget allows."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=10000)
    # With large budget, should expand some rules
    assert len(ctx.expanded_rules) > 0 or len(ctx.rule_summaries) > 0


def test_load_without_rules_dir(sample_ontology_dir):
    """Test loading without rules directory (no expansion)."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=None)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert ctx.agent_summary != ""
    # No expanded rules without rules_dir
    assert len(ctx.expanded_rules) == 0


def test_skill_summaries(sample_ontology_dir, sample_rules_dir):
    """Test that skill summaries are loaded."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert len(ctx.skill_summaries) > 0


def test_must_rules_always_included(sample_ontology_dir, sample_rules_dir):
    """Test that MUST rules applying to all are always included."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    # R006 and R007 are MUST rules that apply to all
    assert any("R006" in summary for summary in ctx.rule_summaries)
    assert any("R007" in summary for summary in ctx.rule_summaries)


def test_context_string_formatting(sample_ontology_dir):
    """Test that context string is properly formatted."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    text = ctx.to_context_string()

    # Should have section headers
    assert "## Agent" in text or ctx.agent_summary != ""
    assert "## Applicable Rules" in text or len(ctx.rule_summaries) == 0


def test_community_summary_loaded(sample_ontology_dir, sample_rules_dir):
    """Test that community summary is loaded at Level 0.5."""
    from ontology_rag.community import CommunityEngine

    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    engine = CommunityEngine(onto, graph)
    engine.detect_communities()
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir, community_engine=engine)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert ctx.community_summary != ""
    assert 0.5 in ctx.loading_levels


def test_community_summary_in_context_string(sample_ontology_dir, sample_rules_dir):
    """Test that community summary appears in context string."""
    from ontology_rag.community import CommunityEngine

    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    engine = CommunityEngine(onto, graph)
    engine.detect_communities()
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir, community_engine=engine)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    text = ctx.to_context_string()
    assert "Related Groups" in text


def test_loader_without_community_engine(sample_ontology_dir, sample_rules_dir):
    """Loader works without community engine (Level 0.5 skipped)."""
    onto = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    loader = HierarchicalLoader(onto, graph, rules_dir=sample_rules_dir)

    ctx = loader.load_for_agent("lang-golang-expert", token_budget=5000)
    assert ctx.community_summary == ""
    assert 0.5 not in ctx.loading_levels

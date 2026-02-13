"""Tests for ontology loading and querying."""

from ontology_rag import Ontology


def test_load_agents(sample_ontology_dir):
    """Test that agents are loaded correctly."""
    onto = Ontology(sample_ontology_dir)
    assert len(onto.agents) == 3
    assert "lang-golang-expert" in onto.agents


def test_agent_info(sample_ontology_dir):
    """Test that agent information is parsed correctly."""
    onto = Ontology(sample_ontology_dir)
    agent = onto.get_agent("lang-golang-expert")
    assert agent is not None
    assert agent.model == "sonnet"
    assert "go-best-practices" in agent.skills


def test_agents_by_class(sample_ontology_dir):
    """Test querying agents by class."""
    onto = Ontology(sample_ontology_dir)
    experts = onto.get_agents_by_class("LanguageExpert")
    assert len(experts) == 2


def test_load_skills(sample_ontology_dir):
    """Test that skills are loaded correctly."""
    onto = Ontology(sample_ontology_dir)
    assert len(onto.skills) == 4
    skill = onto.get_skill("go-best-practices")
    assert skill is not None
    assert not skill.user_invocable


def test_load_rules(sample_ontology_dir):
    """Test that rules are loaded correctly."""
    onto = Ontology(sample_ontology_dir)
    assert len(onto.rules) == 3
    rule = onto.get_rule("R007")
    assert rule is not None
    assert rule.rule_class == "MustRule"


def test_rules_by_category(sample_ontology_dir):
    """Test querying rules by category."""
    onto = Ontology(sample_ontology_dir)
    rules = onto.get_rules_by_category("agent-design")
    assert len(rules) == 2


def test_search_by_keywords(sample_ontology_dir):
    """Test keyword search across entities."""
    onto = Ontology(sample_ontology_dir)
    results = onto.search_by_keywords(["golang", "go"])
    assert len(results) > 0
    assert results[0][1].name == "lang-golang-expert"


def test_get_agent_context(sample_ontology_dir):
    """Test getting complete agent context."""
    onto = Ontology(sample_ontology_dir)
    ctx = onto.get_agent_context("lang-golang-expert")
    assert "agent" in ctx
    assert ctx["agent"].name == "lang-golang-expert"
    assert len(ctx["skills"]) > 0
    assert len(ctx["rules"]) > 0


def test_nonexistent_agent(sample_ontology_dir):
    """Test querying nonexistent agent returns None."""
    onto = Ontology(sample_ontology_dir)
    agent = onto.get_agent("nonexistent-agent")
    assert agent is None


def test_empty_ontology_dir(tmp_path):
    """Test loading from empty directory doesn't crash."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    onto = Ontology(empty_dir)
    assert len(onto.agents) == 0
    assert len(onto.skills) == 0
    assert len(onto.rules) == 0

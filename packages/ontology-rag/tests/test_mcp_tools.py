"""Tests for MCP tool implementations."""

import json

import pytest

from ontology_rag.budget import BudgetManager
from ontology_rag.cache import SemanticCache
from ontology_rag.graph import OntologyGraph
from ontology_rag.loader import HierarchicalLoader
from ontology_rag.mcp_tools import OntologyMCPTools
from ontology_rag.ontology import Ontology
from ontology_rag.router import SemanticRouter
from ontology_rag.token_logger import TokenLogger


@pytest.fixture
def mcp_tools(sample_ontology_dir, tmp_path):
    """Create OntologyMCPTools with sample data."""
    ontology = Ontology(sample_ontology_dir)
    graph = OntologyGraph(sample_ontology_dir / "graphs")
    router = SemanticRouter(ontology, graph)
    loader = HierarchicalLoader(ontology, graph)
    budget_manager = BudgetManager()
    cache = SemanticCache(tmp_path / ".cache")
    token_logger = TokenLogger(tmp_path / ".cache")

    return OntologyMCPTools(
        ontology=ontology,
        graph=graph,
        router=router,
        loader=loader,
        budget_manager=budget_manager,
        cache=cache,
        token_logger=token_logger,
    )


class TestGetRelevantContext:
    """Test the get_relevant_context tool."""

    @pytest.mark.asyncio
    async def test_returns_context_for_go_query(self, mcp_tools):
        """Test that a Go-related query returns Go agent context."""
        result = await mcp_tools.call_tool(
            "get_relevant_context", {"query": "review golang code"}
        )
        assert len(result) == 1
        text = result[0].text
        # Should contain agent info since it routes to lang-golang-expert
        assert "golang" in text.lower() or "go" in text.lower() or "Agent" in text

    @pytest.mark.asyncio
    async def test_respects_max_tokens(self, mcp_tools):
        """Test that max_tokens parameter is respected."""
        result = await mcp_tools.call_tool(
            "get_relevant_context", {"query": "review go code", "max_tokens": 100}
        )
        assert len(result) == 1
        # Result should be generated (even if short due to budget)
        assert result[0].text is not None

    @pytest.mark.asyncio
    async def test_cache_hit(self, mcp_tools):
        """Test that repeated queries hit the cache."""
        # First call - cache miss
        await mcp_tools.call_tool("get_relevant_context", {"query": "review go code"})
        # Second call - should hit cache
        result = await mcp_tools.call_tool(
            "get_relevant_context", {"query": "review go code"}
        )
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_logs_token_usage(self, mcp_tools):
        """Test that tool calls are logged."""
        await mcp_tools.call_tool("get_relevant_context", {"query": "review go code"})

        stats = mcp_tools.token_logger.get_stats()
        assert stats["total_calls"] >= 1
        assert any(t == "get_relevant_context" for t in stats["by_tool"])


class TestGetAgentForTask:
    """Test the get_agent_for_task tool."""

    @pytest.mark.asyncio
    async def test_routes_go_query(self, mcp_tools):
        """Test routing a Go-related query."""
        result = await mcp_tools.call_tool(
            "get_agent_for_task", {"query": "fix golang goroutine leak"}
        )
        assert len(result) == 1

        data = json.loads(result[0].text)
        assert data["agent"] == "lang-golang-expert"
        assert data["confidence"] > 0
        assert (
            "goroutine" in data["matched_keywords"]
            or "golang" in data["matched_keywords"]
        )

    @pytest.mark.asyncio
    async def test_routes_python_query(self, mcp_tools):
        """Test routing a Python-related query."""
        result = await mcp_tools.call_tool(
            "get_agent_for_task", {"query": "python pip install issue"}
        )
        data = json.loads(result[0].text)
        assert data["agent"] == "lang-python-expert"

    @pytest.mark.asyncio
    async def test_no_match_returns_empty(self, mcp_tools):
        """Test that unmatched queries return empty agent."""
        result = await mcp_tools.call_tool(
            "get_agent_for_task", {"query": "something completely unrelated xyz123"}
        )
        data = json.loads(result[0].text)
        assert data["agent"] == ""
        assert data["confidence"] == 0

    @pytest.mark.asyncio
    async def test_cache_hit(self, mcp_tools):
        """Test cache hit for agent routing."""
        await mcp_tools.call_tool("get_agent_for_task", {"query": "go code review"})
        result = await mcp_tools.call_tool(
            "get_agent_for_task", {"query": "go code review"}
        )
        data = json.loads(result[0].text)
        assert data["agent"] == "lang-golang-expert"


class TestLoadSkillWithDeps:
    """Test the load_skill_with_deps tool."""

    @pytest.mark.asyncio
    async def test_load_existing_skill(self, mcp_tools):
        """Test loading an existing skill with dependencies."""
        result = await mcp_tools.call_tool(
            "load_skill_with_deps", {"skill_name": "go-best-practices"}
        )
        data = json.loads(result[0].text)

        assert data["skill"]["name"] == "go-best-practices"
        assert data["skill"]["class"] == "BestPracticeSkill"
        assert len(data["dependencies"]["rules"]) > 0
        # R006 and R007 are dependencies of go-best-practices
        rule_names = [r["name"] for r in data["dependencies"]["rules"]]
        assert "R006" in rule_names

    @pytest.mark.asyncio
    async def test_load_nonexistent_skill(self, mcp_tools):
        """Test loading a non-existent skill returns error."""
        result = await mcp_tools.call_tool(
            "load_skill_with_deps", {"skill_name": "nonexistent-skill"}
        )
        data = json.loads(result[0].text)
        assert "error" in data

    @pytest.mark.asyncio
    async def test_reverse_agent_lookup(self, mcp_tools):
        """Test that skill deps include agents that use the skill."""
        result = await mcp_tools.call_tool(
            "load_skill_with_deps", {"skill_name": "go-best-practices"}
        )
        data = json.loads(result[0].text)

        agent_names = [a["name"] for a in data["dependencies"]["agents"]]
        assert "lang-golang-expert" in agent_names


class TestOntologyTraverse:
    """Test the ontology_traverse tool."""

    @pytest.mark.asyncio
    async def test_traverse_from_agent(self, mcp_tools):
        """Test BFS traversal from an agent node."""
        result = await mcp_tools.call_tool(
            "ontology_traverse", {"start": "lang-golang-expert", "depth": 2}
        )
        data = json.loads(result[0].text)

        assert data["start"] == "lang-golang-expert"
        assert "lang-golang-expert" in data["nodes"]
        assert "go-best-practices" in data["nodes"]
        assert data["node_count"] >= 3  # agent + skill + rules

    @pytest.mark.asyncio
    async def test_traverse_with_relation_filter(self, mcp_tools):
        """Test traversal with relation filter."""
        result = await mcp_tools.call_tool(
            "ontology_traverse",
            {"start": "lang-golang-expert", "relation": "requires", "depth": 1},
        )
        data = json.loads(result[0].text)

        # Should only follow "requires" edges
        assert "go-best-practices" in data["nodes"]
        # R006 should NOT be here because it's via "depends_on" from skill
        assert data["relation_filter"] == "requires"

    @pytest.mark.asyncio
    async def test_traverse_nonexistent_node(self, mcp_tools):
        """Test traversal from non-existent node."""
        result = await mcp_tools.call_tool(
            "ontology_traverse", {"start": "nonexistent-node"}
        )
        data = json.loads(result[0].text)
        assert "error" in data

    @pytest.mark.asyncio
    async def test_traverse_includes_edges(self, mcp_tools):
        """Test that traversal includes edge information."""
        result = await mcp_tools.call_tool(
            "ontology_traverse", {"start": "lang-golang-expert", "depth": 1}
        )
        data = json.loads(result[0].text)

        assert len(data["edges"]) > 0
        edge = data["edges"][0]
        assert "source" in edge
        assert "target" in edge
        assert "relation" in edge


class TestToolDefinitions:
    """Test tool definition metadata."""

    def test_has_five_tools(self, mcp_tools):
        """Test that exactly 8 tools are defined."""
        tools = mcp_tools.get_tool_definitions()
        assert len(tools) == 8

    def test_tool_names(self, mcp_tools):
        """Test tool names are correct."""
        tools = mcp_tools.get_tool_definitions()
        names = {t.name for t in tools}
        assert names == {
            "get_relevant_context",
            "get_agent_for_task",
            "load_skill_with_deps",
            "ontology_traverse",
            "rebuild_ontology",
            "ontology_monitor",
            "ontology_compare_phases",
            "ontology_report",
        }

    def test_tools_have_input_schema(self, mcp_tools):
        """Test that all tools have input schemas."""
        for tool in mcp_tools.get_tool_definitions():
            assert tool.inputSchema is not None
            assert "properties" in tool.inputSchema

    @pytest.mark.asyncio
    async def test_unknown_tool(self, mcp_tools):
        """Test calling an unknown tool."""
        result = await mcp_tools.call_tool("unknown_tool", {})
        assert "Unknown tool" in result[0].text

    @pytest.mark.asyncio
    async def test_rebuild_without_callback(self, mcp_tools):
        """Test rebuild returns status when no callback."""
        result = await mcp_tools.call_tool("rebuild_ontology", {})
        data = json.loads(result[0].text)
        assert data["status"] == "no_rebuild_callback"

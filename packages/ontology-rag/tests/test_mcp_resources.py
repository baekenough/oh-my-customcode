"""Tests for MCP resource implementations."""

import json

import pytest

from ontology_rag.mcp_resources import OntologyMCPResources
from ontology_rag.ontology import Ontology


@pytest.fixture
def mcp_resources(sample_ontology_dir, sample_rules_dir):
    """Create OntologyMCPResources with sample data."""
    ontology = Ontology(sample_ontology_dir)
    resources = OntologyMCPResources(
        ontology=ontology, ontology_dir=sample_ontology_dir
    )
    return resources, sample_rules_dir


class TestResourceList:
    """Test resource listing."""

    def test_lists_schema_resource(self, mcp_resources):
        """Test that schema resource is listed."""
        resources_obj, _ = mcp_resources
        resources = resources_obj.get_resource_list()

        uris = [str(r.uri) for r in resources]
        assert "ontology://schema" in uris

    def test_lists_agent_resources(self, mcp_resources):
        """Test that agent resources are listed."""
        resources_obj, _ = mcp_resources
        resources = resources_obj.get_resource_list()

        uris = [str(r.uri) for r in resources]
        assert "ontology://agent/lang-golang-expert" in uris
        assert "ontology://agent/lang-python-expert" in uris
        assert "ontology://agent/mgr-creator" in uris

    def test_lists_rule_resources(self, mcp_resources):
        """Test that rule resources are listed."""
        resources_obj, _ = mcp_resources
        resources = resources_obj.get_resource_list()

        uris = [str(r.uri) for r in resources]
        assert "ontology://rule/R006" in uris
        assert "ontology://rule/R007" in uris
        assert "ontology://rule/R017" in uris

    def test_resource_count(self, mcp_resources):
        """Test total resource count (1 schema + 3 agents + 3 rules)."""
        resources_obj, _ = mcp_resources
        resources = resources_obj.get_resource_list()
        assert len(resources) == 7  # 1 schema + 3 agents + 3 rules


class TestSchemaResource:
    """Test ontology://schema resource."""

    @pytest.mark.asyncio
    async def test_read_schema(self, mcp_resources):
        """Test reading the schema resource."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://schema")
        data = json.loads(result)

        assert "agent_classes" in data
        assert "skill_classes" in data
        assert "rule_categories" in data
        assert "stats" in data

    @pytest.mark.asyncio
    async def test_schema_stats(self, mcp_resources):
        """Test schema statistics."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://schema")
        data = json.loads(result)

        assert data["stats"]["total_agents"] == 3
        assert data["stats"]["total_skills"] == 4
        assert data["stats"]["total_rules"] == 3

    @pytest.mark.asyncio
    async def test_schema_class_hierarchies(self, mcp_resources):
        """Test class hierarchies in schema."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://schema")
        data = json.loads(result)

        assert "LanguageExpert" in data["agent_classes"]
        assert "lang-golang-expert" in data["agent_classes"]["LanguageExpert"]


class TestAgentResource:
    """Test ontology://agent/{name} resource."""

    @pytest.mark.asyncio
    async def test_read_agent(self, mcp_resources):
        """Test reading agent details."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource(
            "ontology://agent/lang-golang-expert"
        )
        data = json.loads(result)

        assert data["agent"]["name"] == "lang-golang-expert"
        assert data["agent"]["class"] == "LanguageExpert"
        assert data["agent"]["model"] == "sonnet"
        assert len(data["skills"]) > 0
        assert len(data["rules"]) > 0

    @pytest.mark.asyncio
    async def test_read_agent_includes_skills(self, mcp_resources):
        """Test that agent details include skill information."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource(
            "ontology://agent/lang-golang-expert"
        )
        data = json.loads(result)

        skill_names = [s["name"] for s in data["skills"]]
        assert "go-best-practices" in skill_names

    @pytest.mark.asyncio
    async def test_read_nonexistent_agent(self, mcp_resources):
        """Test reading a non-existent agent returns error."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://agent/nonexistent")
        data = json.loads(result)
        assert "error" in data

    @pytest.mark.asyncio
    async def test_agent_token_estimate(self, mcp_resources):
        """Test that agent details include token estimate."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource(
            "ontology://agent/lang-golang-expert"
        )
        data = json.loads(result)
        assert "token_estimate" in data
        assert data["token_estimate"] > 0


class TestRuleResource:
    """Test ontology://rule/{id} resource."""

    @pytest.mark.asyncio
    async def test_read_rule(self, mcp_resources):
        """Test reading rule details."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://rule/R006")
        data = json.loads(result)

        assert data["name"] == "R006"
        assert data["class"] == "MustRule"
        assert data["title"] == "Agent Design Rules"
        assert len(data["summary"]) > 0

    @pytest.mark.asyncio
    async def test_read_nonexistent_rule(self, mcp_resources):
        """Test reading a non-existent rule returns error."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://rule/R999")
        data = json.loads(result)
        assert "error" in data

    @pytest.mark.asyncio
    async def test_rule_includes_categories(self, mcp_resources):
        """Test that rule details include categories."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://rule/R006")
        data = json.loads(result)
        assert "agent-design" in data["categories"]


class TestInvalidURIs:
    """Test error handling for invalid URIs."""

    @pytest.mark.asyncio
    async def test_invalid_scheme(self, mcp_resources):
        """Test invalid URI scheme."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("invalid://schema")
        data = json.loads(result)
        assert "error" in data

    @pytest.mark.asyncio
    async def test_unknown_resource_type(self, mcp_resources):
        """Test unknown resource type."""
        resources_obj, _ = mcp_resources
        result = await resources_obj.read_resource("ontology://unknown/thing")
        data = json.loads(result)
        assert "error" in data

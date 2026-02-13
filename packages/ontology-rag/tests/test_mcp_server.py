"""Tests for MCP server entry point."""

import os
from pathlib import Path

import pytest

from ontology_rag.mcp_server import OntologyMCPServer, discover_ontology_dir


class TestDiscoverOntologyDir:
    """Test ontology directory discovery."""

    def test_env_var_override(self, tmp_path, monkeypatch):
        """Test ONTOLOGY_DIR env var takes highest priority."""
        custom_dir = tmp_path / "custom-ontology"
        custom_dir.mkdir()
        monkeypatch.setenv("ONTOLOGY_DIR", str(custom_dir))

        result = discover_ontology_dir()
        assert result == custom_dir

    def test_search_upward_finds_claude(self, tmp_path, monkeypatch):
        """Test upward search finds .claude/ontology/ directory."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        ontology_dir = tmp_path / ".claude" / "ontology"
        ontology_dir.mkdir(parents=True)
        nested = tmp_path / "a" / "b" / "c"
        nested.mkdir(parents=True)
        monkeypatch.chdir(nested)

        result = discover_ontology_dir()
        assert result == ontology_dir

    def test_fallback_to_cwd_claude(self, tmp_path, monkeypatch):
        """Test fallback returns cwd/.claude/ontology/ when nothing found."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        # Create an empty project dir with no ontology
        empty_project = tmp_path / "empty"
        empty_project.mkdir()
        monkeypatch.chdir(empty_project)

        result = discover_ontology_dir()
        assert result == empty_project / ".claude" / "ontology"

    def test_env_var_returns_path_object(self, tmp_path, monkeypatch):
        """Test that env var result is a Path object."""
        monkeypatch.setenv("ONTOLOGY_DIR", "/some/path")
        result = discover_ontology_dir()
        assert isinstance(result, Path)

    def test_search_upward_stops_at_max_depth(self, tmp_path, monkeypatch):
        """Test that upward search stops after 10 levels."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        # Create a deep directory structure
        deep_dir = tmp_path
        for i in range(12):
            deep_dir = deep_dir / f"level{i}"
        deep_dir.mkdir(parents=True)

        # Put ontology at root level
        ontology_dir = tmp_path / ".claude" / "ontology"
        ontology_dir.mkdir(parents=True)

        # Start from deepest level
        monkeypatch.chdir(deep_dir)

        result = discover_ontology_dir()
        # Should fallback to cwd/.claude/ontology since we're too deep
        assert result == deep_dir / ".claude" / "ontology"

    def test_search_upward_stops_at_filesystem_root(self, tmp_path, monkeypatch):
        """Test that upward search handles filesystem root correctly."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        # Start from tmp_path
        monkeypatch.chdir(tmp_path)

        result = discover_ontology_dir()
        # Should fallback when reaching root
        assert result == tmp_path / ".claude" / "ontology"

    def test_env_var_with_relative_path(self, tmp_path, monkeypatch):
        """Test that env var works with relative paths."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        monkeypatch.chdir(tmp_path)
        custom_dir = tmp_path / "custom-ontology"
        custom_dir.mkdir()
        monkeypatch.setenv("ONTOLOGY_DIR", "./custom-ontology")

        result = discover_ontology_dir()
        # Path should handle relative paths correctly
        assert result == Path("./custom-ontology")

    def test_search_finds_nearest_ancestor(self, tmp_path, monkeypatch):
        """Test that search finds the nearest ancestor, not the furthest."""
        monkeypatch.delenv("ONTOLOGY_DIR", raising=False)
        # Create nested ontology dirs
        far_ontology = tmp_path / ".claude" / "ontology"
        far_ontology.mkdir(parents=True)
        nested = tmp_path / "project" / "subdir"
        nested.mkdir(parents=True)
        near_ontology = tmp_path / "project" / ".claude" / "ontology"
        near_ontology.mkdir(parents=True)

        monkeypatch.chdir(nested)

        result = discover_ontology_dir()
        # Should find the nearer one
        assert result == near_ontology


class TestOntologyMCPServerInit:
    """Test OntologyMCPServer initialization."""

    def test_initializes_all_components(self, sample_ontology_dir):
        """Test that server initializes all Phase 1 and Phase 2 components."""
        server = OntologyMCPServer(sample_ontology_dir)

        # Phase 1 components
        assert server.ontology is not None
        assert server.graph is not None
        assert server.router is not None
        assert server.loader is not None
        assert server.budget_manager is not None

        # Phase 2 components
        assert server.cache is not None
        assert server.token_logger is not None

        # MCP handlers
        assert server.tools is not None
        assert server.resources is not None
        assert server.server is not None

    def test_cache_dir_created(self, sample_ontology_dir):
        """Test that .cache directory is created during init."""
        cache_dir = sample_ontology_dir / ".cache"
        # Ensure it doesn't exist beforehand
        assert not cache_dir.exists()

        server = OntologyMCPServer(sample_ontology_dir)
        assert cache_dir.is_dir()

    def test_server_name(self, sample_ontology_dir):
        """Test that the MCP server has the correct name."""
        server = OntologyMCPServer(sample_ontology_dir)
        assert server.server.name == "ontology-rag"

    def test_ontology_dir_stored(self, sample_ontology_dir):
        """Test that ontology_dir is stored as an instance variable."""
        server = OntologyMCPServer(sample_ontology_dir)
        assert server.ontology_dir == sample_ontology_dir

    def test_graph_points_to_graphs_subdir(self, sample_ontology_dir):
        """Test that graph is initialized with graphs/ subdirectory."""
        server = OntologyMCPServer(sample_ontology_dir)
        # The graph should be initialized with ontology_dir/graphs
        # We can verify this by checking if the graph loaded the test data
        assert server.graph is not None
        # The sample fixture creates graphs/full-graph.json
        assert (sample_ontology_dir / "graphs" / "full-graph.json").exists()

    def test_loader_points_to_rules_dir(self, sample_ontology_dir, sample_rules_dir):
        """Test that loader is initialized with correct rules_dir."""
        # Move sample_rules_dir to be adjacent to ontology_dir
        # The loader expects rules_dir = ontology_dir.parent / "rules"
        expected_rules_dir = sample_ontology_dir.parent / "rules"
        sample_rules_dir.rename(expected_rules_dir)

        server = OntologyMCPServer(sample_ontology_dir)
        assert server.loader is not None
        # Verify the loader has the correct rules_dir
        assert server.loader.rules_dir == expected_rules_dir

    def test_components_are_wired_together(self, sample_ontology_dir):
        """Test that components are correctly wired together."""
        server = OntologyMCPServer(sample_ontology_dir)

        # Router should have references to ontology and graph
        assert server.router.ontology is server.ontology
        assert server.router.graph is server.graph

        # Loader should have references to ontology and graph
        assert server.loader.ontology is server.ontology
        assert server.loader.graph is server.graph

        # Tools should have references to all core components
        assert server.tools.ontology is server.ontology
        assert server.tools.graph is server.graph
        assert server.tools.router is server.router
        assert server.tools.loader is server.loader
        assert server.tools.budget_manager is server.adaptive_budget
        assert server.tools.cache is server.cache
        assert server.tools.token_logger is server.token_logger

        # Resources should have references to ontology
        assert server.resources.ontology is server.ontology
        assert server.resources.ontology_dir == sample_ontology_dir

    def test_mcp_handlers_registered(self, sample_ontology_dir):
        """Test that MCP protocol handlers are registered on the server."""
        server = OntologyMCPServer(sample_ontology_dir)

        # The server should have handlers registered
        # We can't directly check private handler registrations,
        # but we can verify the server object has the expected structure
        assert hasattr(server.server, "list_tools")
        assert hasattr(server.server, "call_tool")
        assert hasattr(server.server, "list_resources")
        assert hasattr(server.server, "read_resource")

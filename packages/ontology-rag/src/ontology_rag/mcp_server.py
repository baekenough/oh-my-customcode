"""MCP server entry point for ontology-rag context engine."""

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Resource, TextContent, Tool

from ontology_rag.ab_test import ABTestRunner
from ontology_rag.budget import AdaptiveBudgetManager, BudgetManager
from ontology_rag.cache import SemanticCache
from ontology_rag.community import CommunityEngine
from ontology_rag.compressor import ContextCompressor, RuleDecomposer
from ontology_rag.graph import OntologyGraph
from ontology_rag.hybrid_search import HybridSearcher
from ontology_rag.loader import HierarchicalLoader
from ontology_rag.mcp_resources import OntologyMCPResources
from ontology_rag.mcp_tools import OntologyMCPTools
from ontology_rag.monitor import MonitoringDashboard
from ontology_rag.ontology import Ontology
from ontology_rag.reranker import Reranker
from ontology_rag.router import SemanticRouter
from ontology_rag.token_logger import TokenLogger
from ontology_rag.watcher import OntologyWatcher

logger = logging.getLogger(__name__)


def discover_ontology_dir() -> Path:
    """Discover the ontology directory.

    Search order:
    1. ONTOLOGY_DIR environment variable
    2. Search upward from cwd for .claude/ontology/
    3. Fallback: cwd/.claude/ontology/

    Returns:
        Path to the ontology directory.
    """
    # 1. Environment variable
    env_dir = os.environ.get("ONTOLOGY_DIR")
    if env_dir:
        return Path(env_dir)

    # 2. Search upward from cwd
    current = Path.cwd()
    for _ in range(10):  # Max 10 levels up
        candidate = current / ".claude" / "ontology"
        if candidate.is_dir():
            return candidate
        parent = current.parent
        if parent == current:
            break
        current = parent

    # 3. Fallback
    return Path.cwd() / ".claude" / "ontology"


class OntologyMCPServer:
    """MCP Server for ontology-rag context engine.

    Wraps the ontology query engine as an MCP server,
    providing tools and resources via stdio transport.
    """

    def __init__(self, ontology_dir: Path):
        """Initialize the MCP server.

        Args:
            ontology_dir: Path to the ontology directory containing YAML files
                         and graphs/ subdirectory.
        """
        self.ontology_dir = ontology_dir

        # Initialize Phase 1 components
        self.ontology = Ontology(ontology_dir)
        self.graph = OntologyGraph(ontology_dir / "graphs")
        self.budget_manager = BudgetManager()

        # Initialize Phase 2 components
        cache_dir = ontology_dir / ".cache"
        self.cache = SemanticCache(cache_dir)
        self.token_logger = TokenLogger(cache_dir)

        # Initialize Phase 3 components
        self.community_engine = CommunityEngine(self.ontology, self.graph)
        self.community_engine.detect_communities()

        self.hybrid_searcher = HybridSearcher(
            self.ontology, self.graph, self.community_engine
        )
        self.reranker = Reranker(self.graph, self.community_engine)
        self.watcher = OntologyWatcher(ontology_dir)

        # Initialize Phase 4 components
        self.compressor = ContextCompressor(RuleDecomposer())
        self.adaptive_budget = AdaptiveBudgetManager(token_logger=self.token_logger)
        self.monitor = MonitoringDashboard(self.token_logger)
        self.monitor.set_baseline(3000.0)  # Phase 3 average
        self.ab_runner = ABTestRunner(cache_dir)

        # Inject Phase 3 into Phase 1/2 components
        self.router = SemanticRouter(
            self.ontology, self.graph, hybrid_searcher=self.hybrid_searcher
        )
        self.loader = HierarchicalLoader(
            self.ontology,
            self.graph,
            rules_dir=ontology_dir.parent / "rules",
            community_engine=self.community_engine,
            compressor=self.compressor,
        )

        # Initialize MCP handlers
        self.tools = OntologyMCPTools(
            ontology=self.ontology,
            graph=self.graph,
            router=self.router,
            loader=self.loader,
            budget_manager=self.adaptive_budget,
            cache=self.cache,
            token_logger=self.token_logger,
            watcher=self.watcher,
            rebuild_callback=self._rebuild_ontology,
            monitor=self.monitor,
            ab_runner=self.ab_runner,
        )
        self.resources = OntologyMCPResources(
            ontology=self.ontology,
            ontology_dir=ontology_dir,
        )

        # Initialize MCP server
        self.server = Server("ontology-rag")
        self._register_handlers()

    def _rebuild_ontology(self):
        """Rebuild all components after ontology file changes."""
        # Reload core data
        self.ontology = Ontology(self.ontology_dir)
        self.graph = OntologyGraph(self.ontology_dir / "graphs")

        # Rebuild Phase 3 components
        self.community_engine = CommunityEngine(self.ontology, self.graph)
        self.community_engine.detect_communities()
        self.hybrid_searcher = HybridSearcher(
            self.ontology, self.graph, self.community_engine
        )
        self.reranker = Reranker(self.graph, self.community_engine)

        # Rebuild Phase 1/2 with updated Phase 3
        self.router = SemanticRouter(
            self.ontology, self.graph, hybrid_searcher=self.hybrid_searcher
        )
        self.loader = HierarchicalLoader(
            self.ontology,
            self.graph,
            rules_dir=self.ontology_dir.parent / "rules",
            community_engine=self.community_engine,
            compressor=self.compressor,
        )

        # Update tools handler
        self.tools = OntologyMCPTools(
            ontology=self.ontology,
            graph=self.graph,
            router=self.router,
            loader=self.loader,
            budget_manager=self.adaptive_budget,
            cache=self.cache,
            token_logger=self.token_logger,
            watcher=self.watcher,
            rebuild_callback=self._rebuild_ontology,
            monitor=self.monitor,
            ab_runner=self.ab_runner,
        )

        # Invalidate caches
        self.cache.invalidate()
        self.watcher.mark_rebuilt()

    def _register_handlers(self):
        """Register MCP protocol handlers."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            return self.tools.get_tool_definitions()

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
            try:
                return await self.tools.call_tool(name, arguments)
            except Exception as e:
                logger.exception("Tool execution failed: %s", e)
                return [TextContent(type="text", text=f"Error: {e!s}")]

        @self.server.list_resources()
        async def list_resources() -> list[Resource]:
            return self.resources.get_resource_list()

        @self.server.read_resource()
        async def read_resource(uri: str) -> str:
            try:
                return await self.resources.read_resource(str(uri))
            except Exception as e:
                logger.exception("Resource read failed: %s", e)
                return f"Error: {e!s}"

    async def run(self):
        """Run the MCP server via stdio transport."""
        logger.info("Starting ontology-rag MCP server (ontology_dir=%s)", self.ontology_dir)

        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options(),
            )


async def async_main():
    """Async entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    ontology_dir = discover_ontology_dir()
    logger.info("Ontology directory: %s", ontology_dir)

    if not ontology_dir.is_dir():
        logger.error("Ontology directory not found: %s", ontology_dir)
        logger.error("Set ONTOLOGY_DIR environment variable or run from a project with .claude/ontology/")
        return

    server = OntologyMCPServer(ontology_dir)
    await server.run()


def main():
    """Entry point for the MCP server."""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()

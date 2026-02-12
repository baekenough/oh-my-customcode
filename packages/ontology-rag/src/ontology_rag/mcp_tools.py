"""MCP tool definitions and handlers for ontology-rag."""

import json
import time
from typing import Any

from mcp.types import TextContent, Tool

from ontology_rag.ab_test import ABTestRunner
from ontology_rag.budget import BudgetManager
from ontology_rag.cache import SemanticCache
from ontology_rag.graph import OntologyGraph
from ontology_rag.loader import HierarchicalLoader
from ontology_rag.monitor import MonitoringDashboard
from ontology_rag.ontology import Ontology
from ontology_rag.router import SemanticRouter
from ontology_rag.token_logger import TokenLogger


class OntologyMCPTools:
    """MCP tool implementations wrapping the ontology query engine.

    Provides 5 tools:
    - get_relevant_context: Get context for a query with budget management
    - get_agent_for_task: Route a query to the best agent
    - load_skill_with_deps: Load a skill and its dependencies
    - ontology_traverse: Traverse the ontology graph from a starting node
    - rebuild_ontology: Force rebuild of the ontology graph and caches
    """

    def __init__(
        self,
        ontology: Ontology,
        graph: OntologyGraph,
        router: SemanticRouter,
        loader: HierarchicalLoader,
        budget_manager: BudgetManager,
        cache: SemanticCache,
        token_logger: TokenLogger,
        watcher=None,
        rebuild_callback=None,
        monitor: "MonitoringDashboard | None" = None,
        ab_runner: "ABTestRunner | None" = None,
    ):
        self.ontology = ontology
        self.graph = graph
        self.router = router
        self.loader = loader
        self.budget_manager = budget_manager
        self.cache = cache
        self.token_logger = token_logger
        self.watcher = watcher
        self._rebuild_callback = rebuild_callback
        self.monitor = monitor
        self.ab_runner = ab_runner

    def get_tool_definitions(self) -> list[Tool]:
        """Return MCP tool definitions."""
        return [
            Tool(
                name="get_relevant_context",
                description=(
                    "Get relevant ontology context for a user query. "
                    "Returns agent info, applicable rules, and skills "
                    "formatted as markdown, optimized within a token budget."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The user query or task description",
                        },
                        "max_tokens": {
                            "type": "integer",
                            "description": (
                                "Maximum tokens for the context "
                                "(default: auto-detected based on complexity)"
                            ),
                            "default": 0,
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="get_agent_for_task",
                description=(
                    "Route a query to the most appropriate agent. "
                    "Returns agent name, confidence score, matched keywords, "
                    "and suggested skills/rules."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The task description to route",
                        },
                    },
                    "required": ["query"],
                },
            ),
            Tool(
                name="load_skill_with_deps",
                description=(
                    "Load a skill and its dependencies from the ontology "
                    "graph. Returns the skill info plus related rules and "
                    "agents."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "skill_name": {
                            "type": "string",
                            "description": (
                                "Name of the skill "
                                "(e.g., 'go-best-practices')"
                            ),
                        },
                        "depth": {
                            "type": "integer",
                            "description": (
                                "Traversal depth for dependencies (default: 2)"
                            ),
                            "default": 2,
                        },
                    },
                    "required": ["skill_name"],
                },
            ),
            Tool(
                name="ontology_traverse",
                description=(
                    "Traverse the ontology graph from a starting node. "
                    "Returns nodes, edges, and depths within the traversal."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "start": {
                            "type": "string",
                            "description": (
                                "Starting node ID "
                                "(agent, skill, or rule name)"
                            ),
                        },
                        "relation": {
                            "type": "string",
                            "description": (
                                "Optional relation filter "
                                "(e.g., 'requires', 'depends_on', 'routes_to')"
                            ),
                            "default": "",
                        },
                        "depth": {
                            "type": "integer",
                            "description": "Maximum traversal depth (default: 2)",
                            "default": 2,
                        },
                    },
                    "required": ["start"],
                },
            ),
            Tool(
                name="rebuild_ontology",
                description=(
                    "Force rebuild of the ontology graph and all caches. "
                    "Useful after modifying agent, skill, or rule files."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            Tool(
                name="ontology_monitor",
                description=(
                    "Get monitoring snapshot of ontology-rag performance. "
                    "Shows token usage, cache hit rates, and waste alerts."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "period_hours": {
                            "type": "number",
                            "description": "Hours to look back (default: 24)",
                            "default": 24,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="ontology_compare_phases",
                description=(
                    "Compare current Phase 4 performance against "
                    "Phase 3 baseline. Shows token reduction percentage."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "period_hours": {
                            "type": "number",
                            "description": "Hours to look back (default: 24)",
                            "default": 24,
                        },
                    },
                    "required": [],
                },
            ),
            Tool(
                name="ontology_report",
                description=(
                    "Generate a monthly performance report for the "
                    "ontology-rag system in markdown format."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "period_hours": {
                            "type": "number",
                            "description": "Hours to cover (default: 720 = 30 days)",
                            "default": 720,
                        },
                    },
                    "required": [],
                },
            ),
        ]

    async def call_tool(
        self, name: str, arguments: dict[str, Any]
    ) -> list[TextContent]:
        """Dispatch a tool call to the appropriate handler."""
        handlers = {
            "get_relevant_context": self._get_relevant_context,
            "get_agent_for_task": self._get_agent_for_task,
            "load_skill_with_deps": self._load_skill_with_deps,
            "ontology_traverse": self._ontology_traverse,
            "rebuild_ontology": self._rebuild_ontology,
            "ontology_monitor": self._ontology_monitor,
            "ontology_compare_phases": self._ontology_compare_phases,
            "ontology_report": self._ontology_report,
        }

        handler = handlers.get(name)
        if not handler:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

        return await handler(arguments)

    async def _get_relevant_context(
        self, args: dict[str, Any]
    ) -> list[TextContent]:
        """Get relevant context for a query with budget management and caching."""
        query = args["query"]
        max_tokens = args.get("max_tokens", 0)
        start = time.time()

        # Check for ontology changes
        if self.watcher and self.watcher.check_for_changes():
            if self._rebuild_callback:
                self._rebuild_callback()

        # Check cache
        cached = self.cache.get(query, "get_relevant_context")
        if cached:
            duration_ms = (time.time() - start) * 1000
            self.token_logger.log(
                tool="get_relevant_context",
                query=query,
                tokens_used=cached["tokens_used"],
                cache_hit=True,
                cache_hit_type=cached["cache_hit_type"],
                duration_ms=duration_ms,
            )
            return [TextContent(type="text", text=cached["result"])]

        # Determine token budget
        if max_tokens > 0:
            token_budget = max_tokens
        else:
            budget = self.budget_manager.get_budget_for_query(query)
            token_budget = budget.total

        # Route to best agent
        routing = self.router.route_with_hybrid(query)

        # Load context
        if routing.agent:
            context = self.loader.load_for_agent(routing.agent, token_budget, query=query)
        else:
            context = self.loader.load_for_agent("", token_budget, query=query)

        result_text = context.to_context_string()
        tokens_used = context.total_tokens
        duration_ms = (time.time() - start) * 1000

        # Cache the result
        self.cache.put(query, "get_relevant_context", result_text, tokens_used)

        # Log
        self.token_logger.log(
            tool="get_relevant_context",
            query=query,
            tokens_used=tokens_used,
            cache_hit=False,
            agent=routing.agent,
            duration_ms=duration_ms,
        )

        return [TextContent(type="text", text=result_text)]

    async def _get_agent_for_task(
        self, args: dict[str, Any]
    ) -> list[TextContent]:
        """Route a query to the best agent with caching."""
        query = args["query"]
        start = time.time()

        # Check for ontology changes
        if self.watcher and self.watcher.check_for_changes():
            if self._rebuild_callback:
                self._rebuild_callback()

        # Check cache
        cached = self.cache.get(query, "get_agent_for_task")
        if cached:
            duration_ms = (time.time() - start) * 1000
            self.token_logger.log(
                tool="get_agent_for_task",
                query=query,
                tokens_used=0,
                cache_hit=True,
                cache_hit_type=cached["cache_hit_type"],
                duration_ms=duration_ms,
            )
            result = cached["result"]
            if isinstance(result, str):
                return [TextContent(type="text", text=result)]
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        # Route
        routing = self.router.route_with_hybrid(query)

        result = {
            "agent": routing.agent,
            "confidence": routing.confidence,
            "reasoning": routing.reasoning,
            "matched_keywords": routing.matched_keywords,
            "category": routing.category,
            "suggested_skills": routing.suggested_skills,
            "suggested_rules": routing.suggested_rules,
        }

        result_json = json.dumps(result, indent=2)
        duration_ms = (time.time() - start) * 1000

        # Cache
        self.cache.put(query, "get_agent_for_task", result, 0)

        # Log
        self.token_logger.log(
            tool="get_agent_for_task",
            query=query,
            tokens_used=0,
            cache_hit=False,
            agent=routing.agent,
            duration_ms=duration_ms,
        )

        return [TextContent(type="text", text=result_json)]

    async def _load_skill_with_deps(
        self, args: dict[str, Any]
    ) -> list[TextContent]:
        """Load a skill and its dependencies."""
        skill_name = args["skill_name"]
        depth = args.get("depth", 2)
        start = time.time()

        # Get skill info
        skill = self.ontology.get_skill(skill_name)
        if not skill:
            error_msg = json.dumps({"error": f"Skill not found: {skill_name}"})
            return [TextContent(type="text", text=error_msg)]

        # BFS from skill node to find dependencies
        reachable = self.graph.bfs(skill_name, max_depth=depth)

        # Classify dependencies
        rules = []
        agents = []
        for node_id, node_depth in reachable.items():
            if node_id == skill_name:
                continue
            node = self.graph.nodes.get(node_id)
            if node:
                if node.type == "Rule":
                    rule_info = self.ontology.get_rule(node_id)
                    if rule_info:
                        rules.append(
                            {
                                "name": rule_info.name,
                                "title": rule_info.title,
                                "summary": rule_info.summary,
                                "depth": node_depth,
                            }
                        )
                elif node.type == "Agent":
                    agent_info = self.ontology.get_agent(node_id)
                    if agent_info:
                        agents.append(
                            {
                                "name": agent_info.name,
                                "summary": agent_info.summary,
                                "depth": node_depth,
                            }
                        )

        # Also find agents that use this skill (reverse lookup)
        users = self.graph.reverse_neighbors(skill_name, "requires")
        for user_id in users:
            if not any(a["name"] == user_id for a in agents):
                agent_info = self.ontology.get_agent(user_id)
                if agent_info:
                    agents.append(
                        {
                            "name": agent_info.name,
                            "summary": agent_info.summary,
                            "depth": -1,  # Reverse relation
                        }
                    )

        result = {
            "skill": {
                "name": skill.name,
                "class": skill.skill_class,
                "description": skill.description,
                "summary": skill.summary,
                "keywords": skill.keywords,
                "user_invocable": skill.user_invocable,
                "rule_references": skill.rule_references,
            },
            "dependencies": {
                "rules": rules,
                "agents": agents,
            },
        }

        result_json = json.dumps(result, indent=2)
        duration_ms = (time.time() - start) * 1000
        tokens_used = int(len(result_json.split()) * 1.3)

        self.token_logger.log(
            tool="load_skill_with_deps",
            query=skill_name,
            tokens_used=tokens_used,
            duration_ms=duration_ms,
        )

        return [TextContent(type="text", text=result_json)]

    async def _ontology_traverse(
        self, args: dict[str, Any]
    ) -> list[TextContent]:
        """Traverse the ontology graph from a starting node."""
        start_node = args["start"]
        relation = args.get("relation", "") or None
        depth = args.get("depth", 2)
        start = time.time()

        # Check node exists
        if start_node not in self.graph.nodes:
            error_msg = json.dumps({"error": f"Node not found: {start_node}"})
            return [TextContent(type="text", text=error_msg)]

        # BFS with optional relation filter
        relation_filter = [relation] if relation else None
        reachable = self.graph.bfs(
            start_node, max_depth=depth, relation_filter=relation_filter
        )

        # Build result with node details
        nodes = {}
        for node_id, node_depth in reachable.items():
            node = self.graph.nodes.get(node_id)
            if node:
                nodes[node_id] = {
                    "type": node.type,
                    "class": node.node_class,
                    "depth": node_depth,
                }

        # Collect edges within the subgraph
        edges = []
        for src in reachable:
            for rel, targets in self.graph.adjacency.get(src, {}).items():
                if relation and rel != relation:
                    continue
                for tgt in targets:
                    if tgt in reachable:
                        edges.append(
                            {
                                "source": src,
                                "target": tgt,
                                "relation": rel,
                            }
                        )

        result = {
            "start": start_node,
            "depth": depth,
            "relation_filter": relation,
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        }

        result_json = json.dumps(result, indent=2)
        duration_ms = (time.time() - start) * 1000
        tokens_used = int(len(result_json.split()) * 1.3)

        self.token_logger.log(
            tool="ontology_traverse",
            query=f"{start_node} (depth={depth}, relation={relation})",
            tokens_used=tokens_used,
            duration_ms=duration_ms,
        )

        return [TextContent(type="text", text=result_json)]

    async def _rebuild_ontology(self, args: dict[str, Any]) -> list[TextContent]:
        """Force rebuild of ontology and all caches."""
        start = time.time()

        if self._rebuild_callback:
            self._rebuild_callback()
            duration_ms = (time.time() - start) * 1000

            self.token_logger.log(
                tool="rebuild_ontology",
                query="manual_rebuild",
                tokens_used=0,
                duration_ms=duration_ms,
            )

            return [
                TextContent(
                    type="text",
                    text=json.dumps({
                        "status": "rebuilt",
                        "duration_ms": round(duration_ms, 2),
                    }),
                )
            ]

        return [
            TextContent(
                type="text",
                text=json.dumps({"status": "no_rebuild_callback"}),
            )
        ]

    async def _ontology_monitor(self, args: dict[str, Any]) -> list[TextContent]:
        """Get monitoring snapshot."""
        period_hours = args.get("period_hours", 24)

        if not self.monitor:
            return [TextContent(type="text", text=json.dumps({"error": "Monitoring not available"}))]

        snapshot = self.monitor.get_snapshot(period_hours=period_hours)
        result = {
            "period_hours": snapshot.period_hours,
            "total_queries": snapshot.total_queries,
            "total_tokens": snapshot.total_tokens,
            "avg_tokens_per_query": round(snapshot.avg_tokens_per_query, 1),
            "cache_hit_rate": snapshot.cache_hit_rate,
            "waste_alerts": snapshot.waste_alerts[:10],
            "by_tool": snapshot.by_tool,
            "recommendations": snapshot.recommendations,
        }
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    async def _ontology_compare_phases(self, args: dict[str, Any]) -> list[TextContent]:
        """Compare current vs baseline performance."""
        period_hours = args.get("period_hours", 24)

        if not self.monitor:
            return [TextContent(type="text", text=json.dumps({"error": "Monitoring not available"}))]

        comparison = self.monitor.compare_phases(period_hours=period_hours)
        if not comparison:
            return [TextContent(type="text", text=json.dumps({"status": "no_baseline_set"}))]

        result = {
            "baseline_avg_tokens": comparison.baseline_avg,
            "current_avg_tokens": comparison.current_avg,
            "improvement_pct": comparison.improvement_pct,
            "period_hours": comparison.period_hours,
            "sample_count": comparison.sample_count,
        }
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    async def _ontology_report(self, args: dict[str, Any]) -> list[TextContent]:
        """Generate monthly performance report."""
        period_hours = args.get("period_hours", 720)

        if not self.monitor:
            return [TextContent(type="text", text=json.dumps({"error": "Monitoring not available"}))]

        report = self.monitor.generate_report(period_hours=period_hours)
        return [TextContent(type="text", text=report)]

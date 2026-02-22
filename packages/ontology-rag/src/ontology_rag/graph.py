"""JSON graph loading and traversal."""

import json
from pathlib import Path
from collections import deque
from dataclasses import dataclass
from typing import Optional

try:
    import networkx as nx
    HAS_NETWORKX = True
except ImportError:
    HAS_NETWORKX = False

from ontology_rag._rust_backend import HAS_RUST
import ontology_rag._rust_backend as _rust


@dataclass
class GraphNode:
    """A node in the ontology graph."""

    id: str
    type: str  # "Agent", "Skill", "Rule"
    node_class: str  # e.g., "LanguageExpert", "BestPracticeSkill"


@dataclass
class GraphEdge:
    """An edge in the ontology graph."""

    source: str
    target: str
    relation: str  # "requires", "depends_on", "routes_to"


class OntologyGraph:
    """Load and traverse the ontology dependency graph.

    This class loads the full-graph.json file and provides graph traversal
    methods including BFS, neighbor queries, and path finding.

    Attributes:
        graphs_dir: Path to the directory containing graph JSON files.
        nodes: Dictionary mapping node IDs to GraphNode objects.
        adjacency: Forward adjacency list (node -> relation -> [targets]).
        reverse_adjacency: Reverse adjacency list for backwards traversal.
    """

    def __init__(self, graphs_dir: str | Path):
        """Initialize graph loader.

        Args:
            graphs_dir: Path to directory containing full-graph.json
        """
        self.graphs_dir = Path(graphs_dir)
        self.nodes: dict[str, GraphNode] = {}
        self._nx_graph: Optional[object] = nx.DiGraph() if HAS_NETWORKX else None
        self._adjacency_cache: Optional[dict[str, dict[str, list[str]]]] = None
        self._reverse_adjacency_cache: Optional[dict[str, dict[str, list[str]]]] = None
        self._load()

    def _load(self):
        """Load full-graph.json."""
        path = self.graphs_dir / "full-graph.json"
        if not path.exists():
            return

        data = json.loads(path.read_text())

        # Load nodes
        for node_id, node_data in data.get("nodes", {}).items():
            node = GraphNode(
                id=node_id,
                type=node_data.get("type", ""),
                node_class=node_data.get("class", ""),
            )
            self.nodes[node_id] = node

            # Add to NetworkX graph if available
            if HAS_NETWORKX and self._nx_graph is not None:
                self._nx_graph.add_node(
                    node_id,
                    type=node.type,
                    node_class=node.node_class
                )

        # Load edges
        for edge in data.get("edges", []):
            src, tgt, rel = edge["source"], edge["target"], edge["relation"]

            # Add to NetworkX graph if available
            if HAS_NETWORKX and self._nx_graph is not None:
                self._nx_graph.add_edge(src, tgt, relation=rel)

        # Also load adjacency from precomputed section if available
        if HAS_NETWORKX and self._nx_graph is not None:
            for node_id, adj in data.get("adjacency", {}).items():
                for rel, targets in adj.items():
                    for target in targets:
                        # Only add if edge doesn't already exist
                        if not self._nx_graph.has_edge(node_id, target):
                            self._nx_graph.add_edge(node_id, target, relation=rel)

        # Clear caches
        self._adjacency_cache = None
        self._reverse_adjacency_cache = None

    @property
    def adjacency(self) -> dict[str, dict[str, list[str]]]:
        """Build forward adjacency list from NetworkX graph.

        Returns:
            Dictionary mapping node IDs to relation dictionaries to target lists.
        """
        if self._adjacency_cache is not None:
            return self._adjacency_cache

        adj: dict[str, dict[str, list[str]]] = {}

        if HAS_NETWORKX and self._nx_graph is not None:
            for src, tgt, data in self._nx_graph.edges(data=True):
                rel = data.get("relation", "")
                adj.setdefault(src, {}).setdefault(rel, []).append(tgt)

        self._adjacency_cache = adj
        return adj

    @property
    def reverse_adjacency(self) -> dict[str, dict[str, list[str]]]:
        """Build reverse adjacency list from NetworkX graph.

        Returns:
            Dictionary mapping node IDs to relation dictionaries to source lists.
        """
        if self._reverse_adjacency_cache is not None:
            return self._reverse_adjacency_cache

        radj: dict[str, dict[str, list[str]]] = {}

        if HAS_NETWORKX and self._nx_graph is not None:
            for src, tgt, data in self._nx_graph.edges(data=True):
                rel = data.get("relation", "")
                radj.setdefault(tgt, {}).setdefault(rel, []).append(src)

        self._reverse_adjacency_cache = radj
        return radj

    def neighbors(self, node_id: str, relation: Optional[str] = None) -> list[str]:
        """Get direct neighbors of a node.

        Args:
            node_id: ID of the node to query.
            relation: Optional relation filter (e.g., "requires", "depends_on").

        Returns:
            List of neighbor node IDs.
        """
        if HAS_RUST:
            result = _rust.neighbors(self.adjacency, node_id, relation)
            if result is not None:
                return result

        if HAS_NETWORKX and self._nx_graph is not None:
            if node_id not in self._nx_graph:
                return []

            neighbors_list = []
            for _, target, data in self._nx_graph.out_edges(node_id, data=True):
                edge_relation = data.get("relation", "")
                if relation is None or edge_relation == relation:
                    neighbors_list.append(target)
            return neighbors_list

        # Fallback to adjacency property
        adj = self.adjacency.get(node_id, {})
        if relation:
            return adj.get(relation, [])
        return [n for targets in adj.values() for n in targets]

    def reverse_neighbors(self, node_id: str, relation: Optional[str] = None) -> list[str]:
        """Get nodes that point TO this node.

        Args:
            node_id: ID of the node to query.
            relation: Optional relation filter.

        Returns:
            List of source node IDs that point to this node.
        """
        if HAS_RUST:
            result = _rust.reverse_neighbors(self.reverse_adjacency, node_id, relation)
            if result is not None:
                return result

        if HAS_NETWORKX and self._nx_graph is not None:
            if node_id not in self._nx_graph:
                return []

            sources_list = []
            for source, _, data in self._nx_graph.in_edges(node_id, data=True):
                edge_relation = data.get("relation", "")
                if relation is None or edge_relation == relation:
                    sources_list.append(source)
            return sources_list

        # Fallback to reverse_adjacency property
        radj = self.reverse_adjacency.get(node_id, {})
        if relation:
            return radj.get(relation, [])
        return [n for sources in radj.values() for n in sources]

    def bfs(
        self,
        start: str,
        max_depth: int = 2,
        relation_filter: Optional[list[str]] = None,
    ) -> dict[str, int]:
        """BFS traversal from start node.

        Args:
            start: Starting node ID.
            max_depth: Maximum depth to traverse.
            relation_filter: Optional list of relations to follow.

        Returns:
            Dictionary mapping reachable node IDs to their depth from start.
        """
        if HAS_RUST:
            result = _rust.bfs(self.adjacency, start, max_depth, relation_filter)
            if result is not None:
                return result

        visited = {start: 0}
        queue = deque([(start, 0)])

        while queue:
            node, depth = queue.popleft()
            if depth >= max_depth:
                continue

            if HAS_NETWORKX and self._nx_graph is not None:
                # Use NetworkX graph
                if node not in self._nx_graph:
                    continue
                for _, target, data in self._nx_graph.out_edges(node, data=True):
                    rel = data.get("relation", "")
                    if relation_filter and rel not in relation_filter:
                        continue
                    if target not in visited:
                        visited[target] = depth + 1
                        queue.append((target, depth + 1))
            else:
                # Fallback to adjacency property
                adj = self.adjacency.get(node, {})
                for rel, targets in adj.items():
                    if relation_filter and rel not in relation_filter:
                        continue
                    for target in targets:
                        if target not in visited:
                            visited[target] = depth + 1
                            queue.append((target, depth + 1))

        return visited

    def subgraph(self, start: str, max_depth: int = 2) -> dict:
        """Extract a subgraph around a node.

        Args:
            start: Center node ID.
            max_depth: Maximum distance from center node.

        Returns:
            Dictionary with keys: nodes, edges, depths.
        """
        reachable = self.bfs(start, max_depth)
        nodes = {nid: self.nodes[nid] for nid in reachable if nid in self.nodes}
        edges = []

        for src in reachable:
            for rel, targets in self.adjacency.get(src, {}).items():
                for tgt in targets:
                    if tgt in reachable:
                        edges.append(GraphEdge(src, tgt, rel))

        return {"nodes": nodes, "edges": edges, "depths": reachable}

    def find_path(
        self, start: str, end: str, max_depth: int = 5
    ) -> Optional[list[str]]:
        """Find shortest path between two nodes using BFS.

        Args:
            start: Starting node ID.
            end: Target node ID.
            max_depth: Maximum path length to search.

        Returns:
            List of node IDs forming the path, or None if no path found.
        """
        if start == end:
            return [start]

        visited = {start}
        queue = deque([(start, [start])])

        while queue:
            node, path = queue.popleft()
            if len(path) > max_depth:
                continue

            for target in self.neighbors(node):
                if target == end:
                    return path + [target]
                if target not in visited:
                    visited.add(target)
                    queue.append((target, path + [target]))

        return None

    def get_agent_dependencies(self, agent_name: str) -> dict:
        """Get all dependencies for an agent.

        This includes skills (via "requires" relation) and rules (via "depends_on"
        from those skills), plus any routers that route to this agent.

        Args:
            agent_name: Name of the agent.

        Returns:
            Dictionary with keys: agent, skills, rules, routed_by.
        """
        skills = self.neighbors(agent_name, "requires")

        # Get rules referenced by skills
        rules = set()
        for skill in skills:
            skill_rules = self.neighbors(skill, "depends_on")
            rules.update(skill_rules)

        # Get routers for this agent
        routers = self.reverse_neighbors(agent_name, "routes_to")

        return {
            "agent": agent_name,
            "skills": skills,
            "rules": list(rules),
            "routed_by": routers,
        }

    def pagerank(self) -> dict[str, float]:
        """Compute PageRank scores for all nodes.

        Returns:
            Dictionary mapping node IDs to PageRank scores.
            Empty dict if NetworkX is not available or if numpy is missing.
        """
        if HAS_RUST:
            node_ids = list(self.nodes.keys())
            edges = []
            if HAS_NETWORKX and self._nx_graph is not None:
                edges = [(s, t) for s, t in self._nx_graph.edges()]
            else:
                for src, rels in self.adjacency.items():
                    for targets in rels.values():
                        for tgt in targets:
                            edges.append((src, tgt))
            result = _rust.pagerank(node_ids, edges)
            if result is not None:
                return result

        if not HAS_NETWORKX or self._nx_graph is None:
            return {}

        try:
            return nx.pagerank(self._nx_graph)
        except (ImportError, ModuleNotFoundError):
            # PageRank requires numpy/scipy which may not be installed
            return {}

    def get_nx_graph(self):
        """Return the internal NetworkX DiGraph.

        Returns:
            NetworkX DiGraph object, or None if NetworkX is not available.
        """
        if not HAS_NETWORKX:
            return None
        return self._nx_graph

    def get_undirected(self):
        """Return an undirected copy of the graph.

        Useful for community detection algorithms.

        Returns:
            NetworkX Graph object, or None if NetworkX is not available.
        """
        if not HAS_NETWORKX or self._nx_graph is None:
            return None
        return self._nx_graph.to_undirected()

    def reload(self):
        """Clear and reload the graph from JSON files.

        This clears all nodes and edges, then re-reads the graph structure
        from full-graph.json.
        """
        # Clear existing data
        self.nodes.clear()
        if HAS_NETWORKX and self._nx_graph is not None:
            self._nx_graph.clear()
        self._adjacency_cache = None
        self._reverse_adjacency_cache = None

        # Reload from disk
        self._load()

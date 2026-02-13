"""Community detection and extractive summarization."""

from dataclasses import dataclass, field
from typing import Optional

from ontology_rag.graph import OntologyGraph, HAS_NETWORKX
from ontology_rag.ontology import Ontology

if HAS_NETWORKX:
    import networkx as nx


@dataclass
class Community:
    """A detected community of related ontology nodes."""

    id: int
    name: str
    members: list[str]
    keywords: set[str]
    summary: str
    importance: float


class CommunityEngine:
    """Detect communities and generate extractive summaries."""

    def __init__(self, ontology: Ontology, graph: OntologyGraph):
        """Initialize the community detection engine.

        Args:
            ontology: Ontology instance with agent/skill/rule metadata.
            graph: OntologyGraph instance with graph structure.
        """
        self.ontology = ontology
        self.graph = graph
        self.communities: list[Community] = []
        self._node_to_community: dict[str, int] = {}

    def detect_communities(self) -> list[Community]:
        """Detect communities using Louvain algorithm.

        For small graphs (<20 nodes): fall back to class-based grouping.
        For larger graphs: use Louvain community detection on undirected graph.

        Returns:
            List of detected communities.
        """
        self.communities.clear()
        self._node_to_community.clear()

        # No NetworkX or empty graph
        if not HAS_NETWORKX or not self.graph.nodes:
            return []

        # Small graph: use class-based fallback
        if len(self.graph.nodes) < 20:
            return self._class_based_communities()

        # Large graph: use Louvain
        return self._louvain_communities()

    def _class_based_communities(self) -> list[Community]:
        """Fallback: group by agent_class/skill_class/rule_class.

        Uses ontology.agent_classes to create communities based on
        the existing class hierarchy.
        """
        communities = []
        community_id = 0

        # Get pagerank scores for importance calculation
        pagerank_scores = self.graph.pagerank()

        # Group agents by class
        for class_name, agent_names in self.ontology.agent_classes.items():
            members = [name for name in agent_names if name in self.graph.nodes]
            if not members:
                continue

            keywords = self._collect_keywords(members)
            summary = self._generate_summary(members, class_name)
            importance = self._calculate_importance(members, pagerank_scores)

            community = Community(
                id=community_id,
                name=class_name,
                members=members,
                keywords=keywords,
                summary=summary,
                importance=importance,
            )
            communities.append(community)

            for member in members:
                self._node_to_community[member] = community_id

            community_id += 1

        # Group skills by class
        for class_name, skill_names in self.ontology.skill_classes.items():
            members = [name for name in skill_names if name in self.graph.nodes]
            if not members:
                continue

            keywords = self._collect_keywords(members)
            summary = self._generate_summary(members, class_name)
            importance = self._calculate_importance(members, pagerank_scores)

            community = Community(
                id=community_id,
                name=class_name,
                members=members,
                keywords=keywords,
                summary=summary,
                importance=importance,
            )
            communities.append(community)

            for member in members:
                self._node_to_community[member] = community_id

            community_id += 1

        # Group rules by class
        rules_by_class: dict[str, list[str]] = {}
        for rule_name, rule_info in self.ontology.rules.items():
            if rule_name in self.graph.nodes:
                rules_by_class.setdefault(rule_info.rule_class, []).append(rule_name)

        for class_name, rule_names in rules_by_class.items():
            keywords = self._collect_keywords(rule_names)
            summary = self._generate_summary(rule_names, class_name)
            importance = self._calculate_importance(rule_names, pagerank_scores)

            community = Community(
                id=community_id,
                name=class_name,
                members=rule_names,
                keywords=keywords,
                summary=summary,
                importance=importance,
            )
            communities.append(community)

            for member in rule_names:
                self._node_to_community[member] = community_id

            community_id += 1

        self.communities = communities
        return communities

    def _louvain_communities(self) -> list[Community]:
        """Use Louvain algorithm for community detection.

        Returns:
            List of detected communities.
        """
        undirected = self.graph.get_undirected()
        if undirected is None or len(undirected) == 0:
            return []

        # Run Louvain with fixed seed for determinism
        louvain_communities = nx.community.louvain_communities(
            undirected, seed=42
        )

        pagerank_scores = self.graph.pagerank()
        communities = []

        for community_id, member_set in enumerate(louvain_communities):
            members = list(member_set)

            # Name community after most common node_class
            class_name = self._get_most_common_class(members)

            keywords = self._collect_keywords(members)
            summary = self._generate_summary(members, class_name)
            importance = self._calculate_importance(members, pagerank_scores)

            community = Community(
                id=community_id,
                name=class_name,
                members=members,
                keywords=keywords,
                summary=summary,
                importance=importance,
            )
            communities.append(community)

            for member in members:
                self._node_to_community[member] = community_id

        self.communities = communities
        return communities

    def _get_most_common_class(self, members: list[str]) -> str:
        """Get the most common node_class among members.

        Args:
            members: List of node IDs.

        Returns:
            Most common node_class, or "Mixed" if tie or no members.
        """
        class_counts: dict[str, int] = {}

        for member in members:
            node = self.graph.nodes.get(member)
            if node:
                class_counts[node.node_class] = class_counts.get(node.node_class, 0) + 1

        if not class_counts:
            return "Mixed"

        return max(class_counts, key=class_counts.get)

    def _collect_keywords(self, members: list[str]) -> set[str]:
        """Collect all keywords from member agents/skills/rules.

        Args:
            members: List of node IDs.

        Returns:
            Set of lowercase keywords.
        """
        keywords: set[str] = set()

        for member in members:
            # Check agents
            agent = self.ontology.agents.get(member)
            if agent:
                keywords.update(kw.lower() for kw in agent.keywords)

            # Check skills
            skill = self.ontology.skills.get(member)
            if skill:
                keywords.update(kw.lower() for kw in skill.keywords)

            # Check rules
            rule = self.ontology.rules.get(member)
            if rule:
                keywords.update(kw.lower() for kw in rule.keywords)

        return keywords

    def _generate_summary(self, members: list[str], community_name: str) -> str:
        """Generate extractive summary for a community.

        Template: "{name}: {n} members. Roles: {keywords}"
        Uses member keywords aggregated from ontology metadata.

        Args:
            members: List of node IDs.
            community_name: Name of the community.

        Returns:
            Extractive summary string.
        """
        keywords = self._collect_keywords(members)
        top_keywords = sorted(keywords)[:5]

        if not top_keywords:
            return f"{community_name}: {len(members)} members"

        keywords_str = ", ".join(top_keywords)
        return f"{community_name}: {len(members)} members. Roles: {keywords_str}"

    def _calculate_importance(
        self, members: list[str], pagerank_scores: dict[str, float]
    ) -> float:
        """Calculate importance as average PageRank of members.

        Args:
            members: List of node IDs.
            pagerank_scores: Dictionary of PageRank scores.

        Returns:
            Average PageRank score, or 0.0 if no members or no scores.
        """
        if not members:
            return 0.0

        total = sum(pagerank_scores.get(member, 0.0) for member in members)
        return total / len(members)

    def get_community_for_node(self, node_id: str) -> Optional[Community]:
        """Get the community containing a specific node.

        Args:
            node_id: Node ID to query.

        Returns:
            Community object if found, None otherwise.
        """
        community_id = self._node_to_community.get(node_id)
        if community_id is not None and community_id < len(self.communities):
            return self.communities[community_id]
        return None

    def get_relevant_communities(
        self, keywords: list[str], top_k: int = 3
    ) -> list[Community]:
        """Get communities most relevant to given keywords.

        Uses Jaccard similarity between query keywords and community keywords.
        Returns top_k communities sorted by similarity.

        Args:
            keywords: List of query keywords.
            top_k: Number of top communities to return.

        Returns:
            List of top_k communities sorted by relevance.
        """
        if not keywords:
            return []

        query_keywords = set(kw.lower() for kw in keywords)
        scored_communities = []

        for community in self.communities:
            similarity = self._jaccard_similarity(query_keywords, community.keywords)
            if similarity > 0:
                scored_communities.append((similarity, community))

        # Sort by similarity descending
        scored_communities.sort(key=lambda x: x[0], reverse=True)

        return [comm for _, comm in scored_communities[:top_k]]

    def _jaccard_similarity(self, set1: set[str], set2: set[str]) -> float:
        """Calculate Jaccard similarity between two sets.

        Args:
            set1: First set.
            set2: Second set.

        Returns:
            Jaccard similarity coefficient (0.0 to 1.0).
        """
        if not set1 or not set2:
            return 0.0

        intersection = len(set1 & set2)
        union = len(set1 | set2)

        return intersection / union if union > 0 else 0.0

    def rebuild(self):
        """Clear and rebuild communities from current graph state."""
        self.communities.clear()
        self._node_to_community.clear()
        self.detect_communities()

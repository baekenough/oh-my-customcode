"""Hybrid search combining keyword, graph, and community signals."""

from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

from ontology_rag.graph import OntologyGraph
from ontology_rag.ontology import Ontology
from ontology_rag._rust_backend import HAS_RUST
import ontology_rag._rust_backend as _rust

if TYPE_CHECKING:
    from ontology_rag.community import CommunityEngine


# Common Korean particles (조사) to strip from query words.
# Sorted by length descending so longer particles match first
# (e.g., "으로" before "로" to avoid partial stripping).
_KOREAN_PARTICLES = sorted(
    [
        "으로부터", "으로서", "으로써",
        "로부터", "로서", "로써",
        "에서부터", "에서",
        "한테서", "한테",
        "에게서", "에게",
        "보다", "처럼", "같이", "부터", "까지",
        "으로", "로",
        "를", "을", "는", "은", "이", "가",
        "와", "과", "의", "도", "만",
        "께",
    ],
    key=len,
    reverse=True,
)


def _strip_korean_particles(word: str) -> str:
    """Strip Korean particles from a word to improve keyword matching.

    Tries each particle from longest to shortest. Returns the stripped form
    on the first match, or the original word if no particle is found.

    Args:
        word: A single lowercase query word.

    Returns:
        The word with the trailing Korean particle removed, or the original
        word if no particle suffix was detected.

    Examples:
        >>> _strip_korean_particles("go로")
        'go'
        >>> _strip_korean_particles("서버를")
        '서버'
        >>> _strip_korean_particles("golang")
        'golang'
    """
    for particle in _KOREAN_PARTICLES:
        if word.endswith(particle) and len(word) > len(particle):
            return word[: -len(particle)]
    return word


@dataclass
class SearchResult:
    """A single hybrid search result."""

    node_id: str
    node_type: str  # "Agent", "Skill", "Rule"
    score: float  # Final weighted score
    keyword_score: float
    graph_score: float
    community_score: float
    importance_score: float


class HybridSearcher:
    """Weighted hybrid search across keyword, graph, and community dimensions.

    Combines multiple ranking signals to provide comprehensive search results:
    - Keyword matching: Direct text similarity to query terms
    - Graph proximity: Structural closeness to anchor nodes
    - Community relevance: Membership in related communities
    - Node importance: Global importance via PageRank

    Attributes:
        ontology: Ontology instance with agents/skills/rules.
        graph: OntologyGraph instance for dependency traversal.
        community_engine: Optional CommunityEngine for community scoring.
    """

    # Scoring weights
    KEYWORD_WEIGHT = 0.50
    GRAPH_WEIGHT = 0.30
    COMMUNITY_WEIGHT = 0.15
    IMPORTANCE_WEIGHT = 0.05

    def __init__(
        self,
        ontology: Ontology,
        graph: OntologyGraph,
        community_engine: Optional["CommunityEngine"] = None,
    ):
        """Initialize hybrid searcher.

        Args:
            ontology: Ontology instance with agents/skills/rules
            graph: OntologyGraph instance for dependency traversal
            community_engine: Optional CommunityEngine for community scoring
        """
        self.ontology = ontology
        self.graph = graph
        self.community_engine = community_engine
        self._keyword_index: dict[str, list[tuple[str, str, float]]] = {}
        self._pagerank_cache: Optional[dict[str, float]] = None
        self._pagerank_max: float = 0.0  # Cached max PageRank value
        self._build_keyword_index()

    def _build_keyword_index(self):
        """Build inverted index from ontology entities for keyword scoring.

        Creates an inverted index mapping keywords to entities with weights:
        - Agent keywords: weight 1.0
        - Agent file patterns: weight 0.8
        - Skill keywords: weight 0.7
        - Rule keywords: weight 0.5
        """
        self._keyword_index.clear()

        # Index agent keywords and file patterns
        for agent in self.ontology.agents.values():
            for kw in agent.keywords:
                self._keyword_index.setdefault(kw.lower(), []).append(
                    ("Agent", agent.name, 1.0)
                )
            for pattern in agent.file_patterns:
                self._keyword_index.setdefault(pattern.lower(), []).append(
                    ("Agent", agent.name, 0.8)
                )

        # Index skill keywords
        for skill in self.ontology.skills.values():
            for kw in skill.keywords:
                self._keyword_index.setdefault(kw.lower(), []).append(
                    ("Skill", skill.name, 0.7)
                )

        # Index rule keywords
        for rule in self.ontology.rules.values():
            for kw in rule.keywords:
                self._keyword_index.setdefault(kw.lower(), []).append(
                    ("Rule", rule.name, 0.5)
                )

    def _precompute_bfs_depths(self, anchor_node: Optional[str]) -> Optional[dict[str, int]]:
        """Precompute BFS depths from anchor node.

        Args:
            anchor_node: Starting node for BFS traversal

        Returns:
            Dictionary mapping node_id to depth from anchor_node,
            or None if no anchor node provided.
        """
        if anchor_node is None:
            return None
        return self.graph.bfs(anchor_node, max_depth=5)

    def search(
        self,
        query: str,
        anchor_node: Optional[str] = None,
        top_k: int = 10,
        entity_type: Optional[str] = None,
    ) -> list[SearchResult]:
        """Execute hybrid search.

        Args:
            query: Search query string
            anchor_node: Optional node for graph distance scoring
            top_k: Number of results to return
            entity_type: Filter by type ("Agent", "Skill", "Rule", or None for all)

        Returns:
            List of SearchResult sorted by score descending.

        Scoring formula:
            final_score = 0.50 * keyword_score + 0.30 * graph_score
                        + 0.15 * community_score + 0.05 * importance_score
        """
        query_words = [w.lower() for w in query.split()]

        # Collect all nodes to search
        all_nodes: list[tuple[str, str]] = []  # (node_id, node_type)

        for agent in self.ontology.agents.values():
            if entity_type is None or entity_type == "Agent":
                all_nodes.append((agent.name, "Agent"))

        for skill in self.ontology.skills.values():
            if entity_type is None or entity_type == "Skill":
                all_nodes.append((skill.name, "Skill"))

        for rule in self.ontology.rules.values():
            if entity_type is None or entity_type == "Rule":
                all_nodes.append((rule.name, "Rule"))

        # Precompute BFS depths from anchor (ONCE, not per-node)
        bfs_depths = self._precompute_bfs_depths(anchor_node)

        # Try Rust batch scoring
        if HAS_RUST:
            all_node_ids = [nid for nid, _ in all_nodes]
            node_type_map = {nid: ntype for nid, ntype in all_nodes}

            kw_scores = {nid: self._compute_keyword_score(query_words, nid) for nid in all_node_ids}
            comm_scores = {nid: self._compute_community_score(query_words, nid) for nid in all_node_ids}

            if self._pagerank_cache is None:
                self._pagerank_cache = self.graph.pagerank()
                self._pagerank_max = max(self._pagerank_cache.values()) if self._pagerank_cache else 0.0

            weights = (self.KEYWORD_WEIGHT, self.GRAPH_WEIGHT, self.COMMUNITY_WEIGHT, self.IMPORTANCE_WEIGHT)

            batch_result = _rust.batch_hybrid_score(
                all_node_ids, kw_scores,
                bfs_depths if bfs_depths else {},
                comm_scores, self._pagerank_cache, weights,
            )

            if batch_result is not None:
                results = [
                    SearchResult(
                        node_id=nid, node_type=node_type_map[nid],
                        score=final, keyword_score=kw, graph_score=gs,
                        community_score=cs, importance_score=imp,
                    )
                    for nid, final, kw, gs, cs, imp in batch_result
                ]
                results.sort(key=lambda r: r.score, reverse=True)
                return results[:top_k]

        # Score each node (Python fallback)
        results = []
        for node_id, node_type in all_nodes:
            keyword_score = self._compute_keyword_score(query_words, node_id)
            graph_score = self._compute_graph_score(node_id, bfs_depths)
            community_score = self._compute_community_score(query_words, node_id)
            importance_score = self._compute_importance_score(node_id)

            final_score = (
                self.KEYWORD_WEIGHT * keyword_score
                + self.GRAPH_WEIGHT * graph_score
                + self.COMMUNITY_WEIGHT * community_score
                + self.IMPORTANCE_WEIGHT * importance_score
            )

            results.append(
                SearchResult(
                    node_id=node_id,
                    node_type=node_type,
                    score=final_score,
                    keyword_score=keyword_score,
                    graph_score=graph_score,
                    community_score=community_score,
                    importance_score=importance_score,
                )
            )

        # Sort by score descending and return top_k
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def search_multihop(
        self,
        query: str,
        start_node: str,
        max_hops: int = 3,
        top_k: int = 10,
    ) -> list[SearchResult]:
        """Multi-hop graph-aware search for relationship queries.

        For queries like "what rules does golang expert use?"
        1. Start from start_node
        2. BFS traverse up to max_hops
        3. Score reachable nodes using hybrid scoring (graph score = 1/(depth+1))
        4. Return top_k results

        Args:
            query: Search query string
            start_node: Starting node for traversal
            max_hops: Maximum number of hops to traverse
            top_k: Number of results to return

        Returns:
            List of SearchResult sorted by score descending.
        """
        query_words = [w.lower() for w in query.split()]

        # BFS to find reachable nodes with depths (computed once)
        bfs_depths = self.graph.bfs(start_node, max_depth=max_hops)

        # Score each reachable node
        results = []
        for node_id, depth in bfs_depths.items():
            if node_id == start_node:
                continue  # Skip the start node itself

            # Determine node type
            node_type = ""
            if node_id in self.graph.nodes:
                node_type = self.graph.nodes[node_id].type

            keyword_score = self._compute_keyword_score(query_words, node_id)
            graph_score = 1.0 / (depth + 1)  # Closer nodes score higher
            community_score = self._compute_community_score(query_words, node_id)
            importance_score = self._compute_importance_score(node_id)

            final_score = (
                self.KEYWORD_WEIGHT * keyword_score
                + self.GRAPH_WEIGHT * graph_score
                + self.COMMUNITY_WEIGHT * community_score
                + self.IMPORTANCE_WEIGHT * importance_score
            )

            results.append(
                SearchResult(
                    node_id=node_id,
                    node_type=node_type,
                    score=final_score,
                    keyword_score=keyword_score,
                    graph_score=graph_score,
                    community_score=community_score,
                    importance_score=importance_score,
                )
            )

        # Sort by score descending and return top_k
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def _compute_keyword_score(self, query_words: list[str], node_id: str) -> float:
        """Compute keyword match score for a node.

        Checks if any query word matches the node's keywords in the inverted index.
        Applies three matching strategies in order:

        1. Exact match (weight 1.0x)
        2. Korean particle-stripped match (weight 0.9x) — e.g. "go로" -> "go"
        3. Substring match — keyword contained in query word (weight 0.3x)
           e.g. query word "golang" contains keyword "go"

        Returns normalized score (0.0-1.0).

        Args:
            query_words: Lowercase query words
            node_id: Node ID to score

        Returns:
            Keyword match score normalized to [0.0, 1.0]
        """
        total_weight = 0.0

        for word in query_words:
            # 1. Exact match
            if word in self._keyword_index:
                for entity_type, entity_name, weight in self._keyword_index[word]:
                    if entity_name == node_id:
                        total_weight += weight

            # 2. Korean particle-stripped match
            stripped = _strip_korean_particles(word)
            if stripped != word and stripped in self._keyword_index:
                for entity_type, entity_name, weight in self._keyword_index[stripped]:
                    if entity_name == node_id:
                        total_weight += weight * 0.9

            # 3. Substring match: keyword contained in query word
            #    Only consider keywords longer than 2 chars to avoid noise.
            for kw, entries in self._keyword_index.items():
                if len(kw) > 2 and kw in word and kw != word:
                    for entity_type, entity_name, weight in entries:
                        if entity_name == node_id:
                            total_weight += weight * 0.3

        # Normalize: 3 keyword matches = 1.0, capped at 1.0
        return min(total_weight / 3.0, 1.0)

    def _compute_graph_score(
        self, node_id: str, bfs_depths: Optional[dict[str, int]]
    ) -> float:
        """Compute graph proximity score from precomputed BFS depths.

        Args:
            node_id: Node ID to score
            bfs_depths: Precomputed BFS depth map from anchor node

        Returns:
            Graph proximity score in [0.0, 1.0].
            Returns 1.0 / (depth + 1) if node is reachable, else 0.0.
        """
        if bfs_depths is None:
            return 0.0

        depth = bfs_depths.get(node_id)
        if depth is None:
            return 0.0

        return 1.0 / (depth + 1)

    def _compute_community_score(self, query_words: list[str], node_id: str) -> float:
        """Compute community relevance score.

        Jaccard similarity between query keywords and the community keywords
        of the community containing node_id.
        Returns 0.0 if no community_engine.

        Args:
            query_words: Lowercase query words
            node_id: Node ID to score

        Returns:
            Community relevance score in [0.0, 1.0]
        """
        if self.community_engine is None:
            return 0.0

        community = self.community_engine.get_community_for_node(node_id)
        if community is None:
            return 0.0

        # Jaccard similarity: |intersection| / |union|
        query_set = set(query_words)
        community_keywords = set(kw.lower() for kw in community.keywords)

        intersection = query_set & community_keywords
        union = query_set | community_keywords

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def _compute_importance_score(self, node_id: str) -> float:
        """Compute importance score from PageRank.

        Returns PageRank normalized to [0, 1] range.
        Caches pagerank results and max value.

        Args:
            node_id: Node ID to score

        Returns:
            Normalized PageRank score in [0.0, 1.0]
        """
        if self._pagerank_cache is None:
            self._pagerank_cache = self.graph.pagerank()
            self._pagerank_max = (
                max(self._pagerank_cache.values()) if self._pagerank_cache else 0.0
            )

        if not self._pagerank_cache or self._pagerank_max == 0.0:
            return 0.0

        node_pr = self._pagerank_cache.get(node_id, 0.0)
        return node_pr / self._pagerank_max

    def rebuild_index(self):
        """Rebuild all internal indexes after ontology changes.

        Call this method after the ontology has been modified to ensure
        search results reflect the latest data.
        """
        self._keyword_index.clear()
        self._pagerank_cache = None
        self._pagerank_max = 0.0
        self._build_keyword_index()

"""Score-based reranking with diversity penalties."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from ontology_rag.graph import OntologyGraph

if TYPE_CHECKING:
    from ontology_rag.community import CommunityEngine
    from ontology_rag.hybrid_search import SearchResult


@dataclass
class RerankedResult:
    """A reranked search result with adjusted score.

    Attributes:
        node_id: Unique identifier for the node.
        node_type: Type of node (Agent, Skill, Rule).
        original_score: Score before reranking.
        reranked_score: Final score after reranking.
        pagerank_score: Normalized PageRank contribution.
        diversity_penalty: Penalty applied for diversity.
    """

    node_id: str
    node_type: str
    original_score: float
    reranked_score: float
    pagerank_score: float
    diversity_penalty: float


class Reranker:
    """Rerank search results using PageRank and diversity penalties.

    Reranking formula:
        reranked_score = original_score * 0.7 + pagerank_normalized * 0.3 - diversity_penalty

    Diversity penalty: results from the same community get penalized
    to promote diverse results. First result from a community: no penalty.
    Second: -0.05. Third: -0.10. Etc.

    Attributes:
        SCORE_WEIGHT: Weight for original score (0.7).
        PAGERANK_WEIGHT: Weight for PageRank score (0.3).
        DIVERSITY_PENALTY_STEP: Penalty increment per duplicate community (0.05).
    """

    SCORE_WEIGHT = 0.7
    PAGERANK_WEIGHT = 0.3
    DIVERSITY_PENALTY_STEP = 0.05

    def __init__(
        self,
        graph: OntologyGraph,
        community_engine: Optional["CommunityEngine"] = None,
    ):
        """Initialize reranker.

        Args:
            graph: Ontology graph for PageRank computation.
            community_engine: Optional community engine for diversity penalties.
        """
        self.graph = graph
        self.community_engine = community_engine
        self._pagerank_cache: Optional[dict[str, float]] = None

    def rerank(
        self,
        results: list,  # list[SearchResult]
        top_k: int = 10,
    ) -> list[RerankedResult]:
        """Rerank search results.

        Args:
            results: List of SearchResult from HybridSearcher.
            top_k: Number of results to return.

        Returns:
            Reranked results sorted by reranked_score descending.
        """
        if not results:
            return []

        # Get PageRank scores (cached)
        pagerank = self._get_pagerank()
        max_pr = max(pagerank.values()) if pagerank else 0.0

        # Score all results
        scored = []
        community_counts: dict[int, int] = {}  # community_id -> count seen

        # First pass: compute base scores (without diversity)
        for r in results:
            pr = pagerank.get(r.node_id, 0.0)
            pr_normalized = pr / max_pr if max_pr > 0 else 0.0

            base_score = (
                r.score * self.SCORE_WEIGHT + pr_normalized * self.PAGERANK_WEIGHT
            )

            scored.append(
                {
                    "node_id": r.node_id,
                    "node_type": r.node_type,
                    "original_score": r.score,
                    "base_score": base_score,
                    "pagerank_score": pr_normalized,
                }
            )

        # Sort by base score first
        scored.sort(key=lambda x: x["base_score"], reverse=True)

        # Second pass: apply diversity penalty in sorted order
        reranked = []
        for item in scored:
            # Get community for diversity penalty
            penalty = 0.0
            if self.community_engine is not None:
                community = self.community_engine.get_community_for_node(
                    item["node_id"]
                )
                if community is not None:
                    count = community_counts.get(community.id, 0)
                    penalty = count * self.DIVERSITY_PENALTY_STEP
                    community_counts[community.id] = count + 1

            final_score = max(0.0, item["base_score"] - penalty)

            reranked.append(
                RerankedResult(
                    node_id=item["node_id"],
                    node_type=item["node_type"],
                    original_score=item["original_score"],
                    reranked_score=final_score,
                    pagerank_score=item["pagerank_score"],
                    diversity_penalty=penalty,
                )
            )

        # Sort by final reranked score
        reranked.sort(key=lambda x: x.reranked_score, reverse=True)
        return reranked[:top_k]

    def _get_pagerank(self) -> dict[str, float]:
        """Get PageRank scores, using cache.

        Returns:
            Dictionary mapping node IDs to PageRank scores.
        """
        if self._pagerank_cache is None:
            self._pagerank_cache = self.graph.pagerank()
        return self._pagerank_cache

    def invalidate_cache(self):
        """Clear cached PageRank scores (call after graph changes)."""
        self._pagerank_cache = None

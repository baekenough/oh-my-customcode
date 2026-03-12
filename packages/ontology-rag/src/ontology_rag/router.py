"""LLM-based semantic routing for agent/skill selection.

Uses a fast LLM (Haiku) instead of embedding models for semantic matching.
This avoids external ML dependencies while leveraging the LLM already available
in the Claude Code environment.
"""

from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING
import json

from ontology_rag.ontology import Ontology
from ontology_rag.graph import OntologyGraph
from ontology_rag.hybrid_search import _strip_korean_particles

if TYPE_CHECKING:
    from ontology_rag.hybrid_search import HybridSearcher


@dataclass
class RoutingResult:
    """Result of semantic routing to an agent."""

    agent: str
    confidence: float  # 0.0-1.0
    reasoning: str
    matched_keywords: list[str]
    suggested_skills: list[str]
    suggested_rules: list[str]
    category: str  # Agent class


@dataclass
class IntentClassification:
    """Classification of user intent."""

    action: str  # e.g., "review", "create", "fix", "analyze"
    domain: str  # e.g., "golang", "python", "infrastructure"
    file_patterns: list[str]  # e.g., ["*.go", "go.mod"]
    keywords: list[str]
    confidence: float


class SemanticRouter:
    """Route queries to appropriate agents using LLM-based classification.

    This router uses a fast LLM (e.g., Claude Haiku) to classify user intent
    and match it to the most appropriate agent. No embedding models required.

    In production (MCP server), this calls the LLM API.
    For testing, use the keyword-based fallback.

    Attributes:
        ontology: Ontology instance with agents/skills/rules.
        graph: OntologyGraph instance for dependency traversal.
        llm_client: Optional LLM client for semantic routing.
        hybrid_searcher: Optional HybridSearcher for hybrid routing.
        keyword_index: Inverted index for keyword-based fallback.
    """

    def __init__(self, ontology: Ontology, graph: OntologyGraph, llm_client=None, hybrid_searcher=None):
        """Initialize semantic router.

        Args:
            ontology: Ontology instance with agents/skills/rules
            graph: OntologyGraph instance for dependency traversal
            llm_client: Optional LLM client for semantic routing.
                        If None, uses keyword-based fallback.
            hybrid_searcher: Optional HybridSearcher instance for hybrid routing.
        """
        self.ontology = ontology
        self.graph = graph
        self.llm_client = llm_client
        self.hybrid_searcher: Optional["HybridSearcher"] = hybrid_searcher
        self._build_keyword_index()

    def _build_keyword_index(self):
        """Build inverted index: keyword -> [(entity_type, entity_name, weight)]."""
        self.keyword_index: dict[str, list[tuple[str, str, float]]] = {}

        # Index agent keywords
        for agent in self.ontology.agents.values():
            for kw in agent.keywords:
                self.keyword_index.setdefault(kw.lower(), []).append(
                    ("agent", agent.name, 1.0)
                )
            for pattern in agent.file_patterns:
                self.keyword_index.setdefault(pattern.lower(), []).append(
                    ("agent", agent.name, 0.8)
                )

        # Index skill keywords
        for skill in self.ontology.skills.values():
            for kw in skill.keywords:
                self.keyword_index.setdefault(kw.lower(), []).append(
                    ("skill", skill.name, 0.7)
                )

        # Index rule keywords
        for rule in self.ontology.rules.values():
            for kw in rule.keywords:
                self.keyword_index.setdefault(kw.lower(), []).append(
                    ("rule", rule.name, 0.5)
                )

    def _build_classification_prompt(self, query: str) -> str:
        """Build prompt for LLM-based intent classification.

        Args:
            query: User query string.

        Returns:
            Formatted prompt for LLM.
        """
        agent_list = []
        for cls_name, agents in self.ontology.agent_classes.items():
            agent_summaries = []
            for a in agents:
                agent_info = self.ontology.agents.get(a)
                if agent_info:
                    agent_summaries.append(f"  - {a}: {agent_info.summary}")
            agent_list.append(f"{cls_name}:\n" + "\n".join(agent_summaries))

        return f"""Classify the following user query and select the most appropriate agent.

Available agents by category:
{chr(10).join(agent_list)}

User query: "{query}"

Respond in JSON format only:
{{
  "agent": "agent-name",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "action": "review|create|fix|analyze|deploy|test|manage|other",
  "domain": "detected domain",
  "keywords": ["matched", "keywords"],
  "file_patterns": ["*.ext"]
}}"""

    async def route_with_llm(self, query: str) -> RoutingResult:
        """Route using LLM classification (requires llm_client).

        Args:
            query: User query string.

        Returns:
            RoutingResult with agent selection and metadata.
        """
        if not self.llm_client:
            return self.route_with_keywords(query)

        prompt = self._build_classification_prompt(query)

        response = await self.llm_client.classify(prompt)
        try:
            result = json.loads(response)
            agent_name = result["agent"]
        except (json.JSONDecodeError, KeyError):
            return self.route_with_keywords(query)

        agent_info = self.ontology.agents.get(agent_name)

        # Get dependencies from graph
        deps = self.graph.get_agent_dependencies(agent_name)

        return RoutingResult(
            agent=agent_name,
            confidence=result["confidence"],
            reasoning=result["reasoning"],
            matched_keywords=result.get("keywords", []),
            suggested_skills=deps.get("skills", []),
            suggested_rules=deps.get("rules", []),
            category=agent_info.agent_class if agent_info else "",
        )

    def route_with_keywords(self, query: str) -> RoutingResult:
        """Fallback routing using keyword matching (no LLM needed).

        This method uses an inverted index to match query terms against
        agent keywords and file patterns. Scoring combines exact matches,
        file pattern matches, and substring matches.

        Args:
            query: User query string.

        Returns:
            RoutingResult with best matching agent.
        """
        query_words = query.lower().split()

        # Score each agent based on keyword matches
        agent_scores: dict[str, float] = {}
        matched_keywords: dict[str, list[str]] = {}

        for word in query_words:
            # Exact match
            if word in self.keyword_index:
                for entity_type, entity_name, weight in self.keyword_index[word]:
                    if entity_type == "agent":
                        agent_scores[entity_name] = agent_scores.get(entity_name, 0) + weight
                        matched_keywords.setdefault(entity_name, []).append(word)

            # Korean particle-stripped match (e.g. "go로" -> "go")
            stripped = _strip_korean_particles(word)
            if stripped != word and stripped in self.keyword_index:
                for entity_type, entity_name, weight in self.keyword_index[stripped]:
                    if entity_type == "agent":
                        agent_scores[entity_name] = (
                            agent_scores.get(entity_name, 0) + weight * 0.9
                        )
                        matched_keywords.setdefault(entity_name, []).append(stripped)

            # Check file patterns (e.g., ".go" matches "*.go")
            for kw, entries in self.keyword_index.items():
                if kw.startswith("*.") and word.endswith(kw[1:]):
                    for entity_type, entity_name, weight in entries:
                        if entity_type == "agent":
                            agent_scores[entity_name] = (
                                agent_scores.get(entity_name, 0) + weight * 0.8
                            )

            # Partial match (substring)
            for kw, entries in self.keyword_index.items():
                if len(kw) > 2 and kw in word:
                    for entity_type, entity_name, weight in entries:
                        if entity_type == "agent":
                            agent_scores[entity_name] = (
                                agent_scores.get(entity_name, 0) + weight * 0.3
                            )

        if not agent_scores:
            return RoutingResult(
                agent="",
                confidence=0.0,
                reasoning="No matching agent found",
                matched_keywords=[],
                suggested_skills=[],
                suggested_rules=[],
                category="",
            )

        # Select best agent
        best_agent = max(agent_scores, key=agent_scores.get)
        max_score = agent_scores[best_agent]

        # Normalize confidence (0-1 range)
        confidence = min(max_score / 3.0, 1.0)  # 3 keyword matches = 100%

        agent_info = self.ontology.agents.get(best_agent)
        deps = self.graph.get_agent_dependencies(best_agent)

        return RoutingResult(
            agent=best_agent,
            confidence=confidence,
            reasoning=f"Matched keywords: {matched_keywords.get(best_agent, [])}",
            matched_keywords=matched_keywords.get(best_agent, []),
            suggested_skills=deps.get("skills", []),
            suggested_rules=deps.get("rules", []),
            category=agent_info.agent_class if agent_info else "",
        )

    def route_with_hybrid(self, query: str) -> RoutingResult:
        """Route using hybrid search combining keyword, graph, and community signals.

        Falls back to route_with_keywords() if hybrid_searcher is not available.

        Args:
            query: User query string.

        Returns:
            RoutingResult with best matching agent.
        """
        if self.hybrid_searcher is None:
            return self.route_with_keywords(query)

        # Use keyword-best match as anchor to enable graph scoring
        kw_result = self.route_with_keywords(query)
        anchor = kw_result.agent if kw_result.agent else None
        results = self.hybrid_searcher.search(query, anchor_node=anchor, top_k=1, entity_type="Agent")

        if not results:
            return self.route_with_keywords(query)

        best = results[0]
        agent_info = self.ontology.agents.get(best.node_id)
        deps = self.graph.get_agent_dependencies(best.node_id)

        return RoutingResult(
            agent=best.node_id,
            confidence=min(best.score, 1.0),
            reasoning=f"Hybrid search: kw={best.keyword_score:.2f} graph={best.graph_score:.2f} community={best.community_score:.2f}",
            matched_keywords=[],  # Hybrid doesn't track individual keyword matches
            suggested_skills=deps.get("skills", []),
            suggested_rules=deps.get("rules", []),
            category=agent_info.agent_class if agent_info else "",
        )

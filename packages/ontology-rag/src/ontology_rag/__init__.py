"""oh-my-customcode Ontology+RAG Context Engine.

Provides intelligent context loading for Claude Code agent systems.
Uses ontology-based knowledge graphs and hierarchical loading
to reduce token usage by 75-95% while maintaining quality.
"""

from .ontology import Ontology, AgentInfo, SkillInfo, RuleInfo
from .graph import OntologyGraph, GraphNode, GraphEdge, HAS_NETWORKX
from .router import SemanticRouter, RoutingResult, IntentClassification
from .loader import HierarchicalLoader, LoadedContext
from .budget import BudgetManager, TokenBudget, QueryComplexity
from .cache import SemanticCache
from .token_logger import TokenLogger
from .community import CommunityEngine, Community
from .hybrid_search import HybridSearcher, SearchResult
from .reranker import Reranker, RerankedResult
from .watcher import OntologyWatcher, HAS_WATCHDOG

__version__ = "0.2.0"
__all__ = [
    # Phase 1: Core
    "Ontology",
    "AgentInfo",
    "SkillInfo",
    "RuleInfo",
    "OntologyGraph",
    "GraphNode",
    "GraphEdge",
    "HAS_NETWORKX",
    "SemanticRouter",
    "RoutingResult",
    "IntentClassification",
    "HierarchicalLoader",
    "LoadedContext",
    # Phase 2: MCP + Caching
    "BudgetManager",
    "TokenBudget",
    "QueryComplexity",
    "SemanticCache",
    "TokenLogger",
    # Phase 3: GraphRAG
    "CommunityEngine",
    "Community",
    "HybridSearcher",
    "SearchResult",
    "Reranker",
    "RerankedResult",
    "OntologyWatcher",
    "HAS_WATCHDOG",
]

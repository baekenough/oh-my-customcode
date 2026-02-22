"""oh-my-customcode Ontology+RAG Context Engine.

Provides intelligent context loading for Claude Code agent systems.
Uses ontology-based knowledge graphs and hierarchical loading
to reduce token usage by 75-95% while maintaining quality.
"""

from .ontology import Ontology, AgentInfo, SkillInfo, RuleInfo
from .graph import OntologyGraph, GraphNode, GraphEdge, HAS_NETWORKX
from ._rust_backend import HAS_RUST as HAS_RUST_BACKEND
from .router import SemanticRouter, RoutingResult, IntentClassification
from .loader import HierarchicalLoader, LoadedContext
from .budget import BudgetManager, TokenBudget, QueryComplexity, AdaptiveBudgetManager, BudgetAnalysis
from .cache import SemanticCache
from .token_logger import TokenLogger
from .community import CommunityEngine, Community
from .hybrid_search import HybridSearcher, SearchResult
from .reranker import Reranker, RerankedResult
from .watcher import OntologyWatcher, HAS_WATCHDOG
from .compressor import ContextCompressor, RuleDecomposer, DecomposedRule, RuleSection
from .monitor import MonitoringDashboard, MonitoringSnapshot, PhaseComparison
from .ab_test import ABTestRunner, ABResult, ABSummary

__version__ = "0.3.0"
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
    "HAS_RUST_BACKEND",
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
    # Phase 4: Advanced Optimization + Monitoring
    "ContextCompressor",
    "RuleDecomposer",
    "DecomposedRule",
    "RuleSection",
    "AdaptiveBudgetManager",
    "BudgetAnalysis",
    "MonitoringDashboard",
    "MonitoringSnapshot",
    "PhaseComparison",
    "ABTestRunner",
    "ABResult",
    "ABSummary",
]

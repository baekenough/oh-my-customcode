"""oh-my-customcode Ontology+RAG Context Engine.

Provides intelligent context loading for Claude Code agent systems.
Uses ontology-based knowledge graphs and hierarchical loading
to reduce token usage by 75-95% while maintaining quality.
"""

from .ontology import Ontology, AgentInfo, SkillInfo, RuleInfo
from .graph import OntologyGraph, GraphNode, GraphEdge
from .router import SemanticRouter, RoutingResult, IntentClassification
from .loader import HierarchicalLoader, LoadedContext
from .budget import BudgetManager, TokenBudget, QueryComplexity
from .cache import SemanticCache
from .token_logger import TokenLogger

__version__ = "0.1.0"
__all__ = [
    "Ontology",
    "AgentInfo",
    "SkillInfo",
    "RuleInfo",
    "OntologyGraph",
    "GraphNode",
    "GraphEdge",
    "SemanticRouter",
    "RoutingResult",
    "IntentClassification",
    "HierarchicalLoader",
    "LoadedContext",
    "BudgetManager",
    "TokenBudget",
    "QueryComplexity",
    "SemanticCache",
    "TokenLogger",
]

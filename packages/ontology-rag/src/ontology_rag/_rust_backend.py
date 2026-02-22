"""Rust backend for ontology-rag graph operations.

Thin wrapper that imports Rust native module and provides Python fallback.
Set ONTOLOGY_RAG_DISABLE_RUST=1 to force fallback mode.
"""
import os

HAS_RUST = False
_rust = None

if not os.environ.get("ONTOLOGY_RAG_DISABLE_RUST"):
    try:
        import ontology_graph_rs as _rust
        HAS_RUST = True
    except ImportError:
        pass


def bfs(adjacency, start, max_depth, relation_filter=None):
    if HAS_RUST:
        return _rust.bfs(adjacency, start, max_depth, relation_filter)
    return None


def neighbors(adjacency, node_id, relation=None):
    if HAS_RUST:
        return _rust.neighbors(adjacency, node_id, relation)
    return None


def reverse_neighbors(reverse_adjacency, node_id, relation=None):
    if HAS_RUST:
        return _rust.reverse_neighbors(reverse_adjacency, node_id, relation)
    return None


def pagerank(node_ids, edges, damping=0.85, max_iter=100, tolerance=1e-6):
    if HAS_RUST:
        return _rust.pagerank(node_ids, edges, damping, max_iter, tolerance)
    return None


def batch_hybrid_score(node_ids, keyword_scores, bfs_depths, community_scores, pagerank_scores, weights):
    if HAS_RUST:
        return _rust.batch_hybrid_score(node_ids, keyword_scores, bfs_depths, community_scores, pagerank_scores, weights)
    return None

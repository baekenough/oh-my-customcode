#!/usr/bin/env python3
"""Benchmark BFS and PageRank with and without Rust backend.

Standalone script — not a pytest test.

Usage:
    python benchmarks/bench_graph.py
    ONTOLOGY_RAG_DISABLE_RUST=1 python benchmarks/bench_graph.py
"""

import json
import os
import random
import sys
import tempfile
import time
from pathlib import Path


def build_synthetic_graph(tmp_dir: Path, num_nodes: int, num_edges: int) -> Path:
    """Generate a synthetic graph JSON file."""
    random.seed(42)
    graphs_dir = tmp_dir / "graphs"
    graphs_dir.mkdir(parents=True, exist_ok=True)

    node_ids = [f"node_{i}" for i in range(num_nodes)]
    nodes = {nid: {"type": "Agent", "class": "TestNode"} for nid in node_ids}

    edges = []
    edge_set = set()
    attempts = 0
    while len(edges) < num_edges and attempts < num_edges * 10:
        src = random.choice(node_ids)
        tgt = random.choice(node_ids)
        if src != tgt and (src, tgt) not in edge_set:
            edges.append({"source": src, "target": tgt, "relation": "depends_on"})
            edge_set.add((src, tgt))
        attempts += 1

    graph_data = {
        "description": "Synthetic benchmark graph",
        "version": "1.0.0",
        "nodes": nodes,
        "edges": edges,
        "adjacency": {},
    }
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))
    return tmp_dir


def benchmark_bfs(graph, start_node: str, max_depth: int, runs: int = 5) -> float:
    """Return median elapsed time in seconds over `runs` iterations."""
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        graph.bfs(start_node, max_depth=max_depth)
        times.append(time.perf_counter() - t0)
    times.sort()
    return times[len(times) // 2]


def benchmark_pagerank(graph, runs: int = 5) -> float:
    """Return median elapsed time in seconds over `runs` iterations."""
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        graph.pagerank()
        times.append(time.perf_counter() - t0)
    times.sort()
    return times[len(times) // 2]


def print_table(rows: list[tuple], headers: tuple):
    col_widths = [max(len(str(row[i])) for row in [headers] + rows) for i in range(len(headers))]
    fmt = "  ".join(f"{{:<{w}}}" for w in col_widths)
    sep = "  ".join("-" * w for w in col_widths)
    print(fmt.format(*headers))
    print(sep)
    for row in rows:
        print(fmt.format(*row))


def main():
    # Import after potential env var manipulation
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from ontology_rag.graph import OntologyGraph
    from ontology_rag._rust_backend import HAS_RUST

    rust_status = "enabled" if HAS_RUST else "disabled (fallback)"
    print(f"\nontology-rag graph benchmarks — Rust: {rust_status}")
    print("=" * 60)

    sizes = [
        (50, 150),
        (100, 300),
        (500, 1500),
    ]

    bfs_rows = []
    pagerank_rows = []

    with tempfile.TemporaryDirectory() as tmp:
        for num_nodes, num_edges in sizes:
            tmp_dir = Path(tmp) / f"graph_{num_nodes}"
            build_synthetic_graph(tmp_dir, num_nodes, num_edges)
            graph = OntologyGraph(tmp_dir / "graphs")

            bfs_time = benchmark_bfs(graph, "node_0", max_depth=3)
            pr_time = benchmark_pagerank(graph)

            bfs_rows.append((num_nodes, num_edges, f"{bfs_time * 1000:.2f} ms"))
            pagerank_rows.append((num_nodes, num_edges, f"{pr_time * 1000:.2f} ms"))

    print("\nBFS (max_depth=3, median of 5 runs):")
    print_table(bfs_rows, ("nodes", "edges", "time"))

    print("\nPageRank (median of 5 runs):")
    print_table(pagerank_rows, ("nodes", "edges", "time"))

    print()


if __name__ == "__main__":
    main()

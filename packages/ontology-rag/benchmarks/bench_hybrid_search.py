#!/usr/bin/env python3
"""Benchmark hybrid search scoring with and without Rust batch_hybrid_score.

Standalone script — not a pytest test.

Usage:
    python benchmarks/bench_hybrid_search.py
    ONTOLOGY_RAG_DISABLE_RUST=1 python benchmarks/bench_hybrid_search.py
"""

import json
import os
import random
import sys
import tempfile
import time
import yaml
from pathlib import Path


def build_synthetic_ontology(tmp_dir: Path, num_agents: int) -> Path:
    """Generate a synthetic ontology directory."""
    random.seed(42)
    ontology_dir = tmp_dir / "ontology"
    graphs_dir = ontology_dir / "graphs"
    graphs_dir.mkdir(parents=True, exist_ok=True)

    agent_names = [f"agent-{i}" for i in range(num_agents)]

    agents_data = {
        "version": "1.0.0",
        "classes": {"TestAgent": {"agents": agent_names, "description": "Test agents"}},
        "agents": {
            name: {
                "class": "TestAgent",
                "description": f"Test agent {i}",
                "model": "sonnet",
                "skills": [],
                "tools": ["Read"],
                "summary": f"Agent {i} for benchmarking",
                "keywords": [f"keyword_{i}", f"tag_{i % 10}"],
                "file_patterns": [f"*.py"],
            }
            for i, name in enumerate(agent_names)
        },
    }
    (ontology_dir / "agents.yaml").write_text(yaml.dump(agents_data))
    (ontology_dir / "skills.yaml").write_text(yaml.dump({"version": "1.0.0", "classes": {}, "skills": {}}))
    (ontology_dir / "rules.yaml").write_text(yaml.dump({"version": "1.0.0", "categories": {}, "rules": {}}))

    nodes = {name: {"type": "Agent", "class": "TestAgent"} for name in agent_names}
    edges = [
        {"source": agent_names[i], "target": agent_names[(i + 1) % num_agents], "relation": "depends_on"}
        for i in range(min(num_agents * 2, 200))
    ]

    graph_data = {"description": "Benchmark graph", "version": "1.0.0", "nodes": nodes, "edges": edges, "adjacency": {}}
    (graphs_dir / "full-graph.json").write_text(json.dumps(graph_data))

    return ontology_dir


def benchmark_search(searcher, query: str, runs: int = 5) -> float:
    """Return median elapsed time in seconds over `runs` iterations."""
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        searcher.search(query, top_k=10)
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
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from ontology_rag.graph import OntologyGraph
    from ontology_rag.ontology import Ontology
    from ontology_rag.hybrid_search import HybridSearcher
    from ontology_rag._rust_backend import HAS_RUST

    rust_status = "enabled" if HAS_RUST else "disabled (fallback)"
    print(f"\nontology-rag hybrid search benchmarks — Rust: {rust_status}")
    print("=" * 60)

    sizes = [50, 100, 200]
    rows = []

    with tempfile.TemporaryDirectory() as tmp:
        for num_agents in sizes:
            tmp_dir = Path(tmp) / f"onto_{num_agents}"
            ontology_dir = build_synthetic_ontology(tmp_dir, num_agents)

            ontology = Ontology(ontology_dir)
            graph = OntologyGraph(ontology_dir / "graphs")
            searcher = HybridSearcher(ontology, graph)

            elapsed = benchmark_search(searcher, "keyword_5 tag_3", runs=5)
            rows.append((num_agents, f"{elapsed * 1000:.2f} ms"))

    print("\nHybrid search scoring (median of 5 runs):")
    print_table(rows, ("agents", "time"))
    print()


if __name__ == "__main__":
    main()

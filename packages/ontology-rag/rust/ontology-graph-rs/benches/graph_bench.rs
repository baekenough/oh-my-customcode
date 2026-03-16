use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use ontology_graph_rs::graph::bfs_internal;
use ontology_graph_rs::pagerank::pagerank_internal;
use ontology_graph_rs::scoring::batch_hybrid_score_internal;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a linear chain adjacency map:  node_0 -> node_1 -> ... -> node_{n-1}
fn build_chain_adjacency(n: usize) -> HashMap<String, HashMap<String, Vec<String>>> {
    let mut adj: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
    for i in 0..n.saturating_sub(1) {
        adj.entry(format!("node_{i}"))
            .or_default()
            .entry("edge".to_string())
            .or_default()
            .push(format!("node_{}", i + 1));
    }
    adj
}

/// Build a list of node IDs for `n` nodes.
fn node_ids(n: usize) -> Vec<String> {
    (0..n).map(|i| format!("node_{i}")).collect()
}

/// Build a linear chain edge list: (node_0, node_1), ..., (node_{n-2}, node_{n-1})
fn chain_edges(n: usize) -> Vec<(String, String)> {
    (0..n.saturating_sub(1))
        .map(|i| (format!("node_{i}"), format!("node_{}", i + 1)))
        .collect()
}

// ---------------------------------------------------------------------------
// BFS benchmarks
// ---------------------------------------------------------------------------

fn bench_bfs(c: &mut Criterion) {
    let mut group = c.benchmark_group("bfs");

    for &n in &[100usize, 500, 1000] {
        let adj = build_chain_adjacency(n);
        let start = "node_0".to_string();

        group.bench_with_input(BenchmarkId::new("chain", n), &n, |b, _| {
            b.iter(|| {
                bfs_internal(
                    black_box(adj.clone()),
                    black_box(start.clone()),
                    black_box(n + 1),
                    black_box(None),
                )
            })
        });
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// PageRank benchmarks
// ---------------------------------------------------------------------------

fn bench_pagerank(c: &mut Criterion) {
    let mut group = c.benchmark_group("pagerank");

    for &n in &[50usize, 100, 200] {
        let ids = node_ids(n);
        let edges = chain_edges(n);

        group.bench_with_input(BenchmarkId::new("chain", n), &n, |b, _| {
            b.iter(|| {
                pagerank_internal(
                    black_box(ids.clone()),
                    black_box(edges.clone()),
                    black_box(0.85),
                    black_box(100),
                    black_box(1e-6),
                )
            })
        });
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// Hybrid scoring benchmarks
// ---------------------------------------------------------------------------

fn bench_hybrid_score(c: &mut Criterion) {
    let mut group = c.benchmark_group("hybrid_score");

    for &n in &[100usize, 500, 1000] {
        let ids = node_ids(n);
        let kw: HashMap<String, f64> = ids.iter().map(|id| (id.clone(), 0.5)).collect();
        let depths: HashMap<String, usize> = ids.iter().enumerate().map(|(i, id)| (id.clone(), i)).collect();
        let comm: HashMap<String, f64> = ids.iter().map(|id| (id.clone(), 0.3)).collect();
        let pr: HashMap<String, f64> = ids.iter().map(|id| (id.clone(), 0.01)).collect();
        let weights = (0.4f64, 0.3, 0.2, 0.1);

        group.bench_with_input(BenchmarkId::new("nodes", n), &n, |b, _| {
            b.iter(|| {
                batch_hybrid_score_internal(
                    black_box(ids.clone()),
                    black_box(kw.clone()),
                    black_box(depths.clone()),
                    black_box(comm.clone()),
                    black_box(pr.clone()),
                    black_box(weights),
                )
            })
        });
    }

    group.finish();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

criterion_group!(benches, bench_bfs, bench_pagerank, bench_hybrid_score);
criterion_main!(benches);

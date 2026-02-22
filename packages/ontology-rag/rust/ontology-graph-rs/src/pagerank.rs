use pyo3::prelude::*;
use std::collections::HashMap;

/// Power iteration PageRank.
///
/// Handles dangling nodes (nodes with no outgoing edges) by redistributing
/// their rank equally across all nodes.
///
/// # Arguments
/// * `node_ids` - all node IDs in the graph
/// * `edges` - list of (source, target) directed edges
/// * `damping` - damping factor, default 0.85
/// * `max_iter` - maximum number of iterations, default 100
/// * `tolerance` - convergence threshold (L1 norm), default 1e-6
///
/// # Returns
/// Map of node_id -> PageRank score (scores sum to 1.0)
#[pyfunction]
pub fn pagerank(
    node_ids: Vec<String>,
    edges: Vec<(String, String)>,
    damping: Option<f64>,
    max_iter: Option<usize>,
    tolerance: Option<f64>,
) -> HashMap<String, f64> {
    let n = node_ids.len();
    if n == 0 {
        return HashMap::new();
    }

    let d = damping.unwrap_or(0.85);
    let max_iterations = max_iter.unwrap_or(100);
    let tol = tolerance.unwrap_or(1e-6);

    // Build index for O(1) lookup
    let node_index: HashMap<&str, usize> = node_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();

    // Build outlink and inlink structures
    // out_links[i] = number of outgoing edges from node i
    // in_links[i] = list of nodes that link to node i
    let mut out_degree = vec![0usize; n];
    let mut in_links: Vec<Vec<usize>> = vec![Vec::new(); n];

    for (src, tgt) in &edges {
        let Some(&si) = node_index.get(src.as_str()) else {
            continue;
        };
        let Some(&ti) = node_index.get(tgt.as_str()) else {
            continue;
        };
        if si == ti {
            // Skip self-loops
            continue;
        }
        out_degree[si] += 1;
        in_links[ti].push(si);
    }

    // Initial uniform distribution
    let init = 1.0 / n as f64;
    let mut rank = vec![init; n];
    let teleport = (1.0 - d) / n as f64;

    for _ in 0..max_iterations {
        let mut new_rank = vec![teleport; n];

        // Accumulate dangling node rank: nodes with out_degree == 0
        let dangling_sum: f64 = rank
            .iter()
            .enumerate()
            .filter(|(i, _)| out_degree[*i] == 0)
            .map(|(_, r)| r)
            .sum();

        let dangling_contribution = d * dangling_sum / n as f64;

        for i in 0..n {
            new_rank[i] += dangling_contribution;
            for &src_idx in &in_links[i] {
                new_rank[i] += d * rank[src_idx] / out_degree[src_idx] as f64;
            }
        }

        // Check convergence (L1 norm)
        let delta: f64 = rank
            .iter()
            .zip(new_rank.iter())
            .map(|(old, new)| (old - new).abs())
            .sum();

        rank = new_rank;

        if delta < tol {
            break;
        }
    }

    node_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.clone(), rank[i]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn test_pagerank_empty() {
        let result = pagerank(vec![], vec![], None, None, None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_pagerank_single_node() {
        let result = pagerank(
            vec!["A".to_string()],
            vec![],
            None,
            None,
            None,
        );
        assert!(approx_eq(result["A"], 1.0, 1e-6));
    }

    #[test]
    fn test_pagerank_scores_sum_to_one() {
        let nodes: Vec<String> = ["A", "B", "C", "D"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
            ("C".to_string(), "A".to_string()),
            ("D".to_string(), "A".to_string()),
        ];
        let result = pagerank(nodes, edges, None, None, None);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
    }

    #[test]
    fn test_pagerank_uniform_cycle() {
        // In a symmetric cycle all nodes have equal rank
        let nodes: Vec<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
            ("C".to_string(), "A".to_string()),
        ];
        let result = pagerank(nodes, edges, Some(0.85), Some(200), Some(1e-9));
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
        // All should be ~1/3
        for score in result.values() {
            assert!(approx_eq(*score, 1.0 / 3.0, 0.01));
        }
    }

    #[test]
    fn test_pagerank_hub_gets_higher_score() {
        // B is pointed to by everyone — should have higher rank
        let nodes: Vec<String> = ["A", "B", "C", "D"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("C".to_string(), "B".to_string()),
            ("D".to_string(), "B".to_string()),
            ("B".to_string(), "A".to_string()),
        ];
        let result = pagerank(nodes, edges, None, None, None);
        assert!(result["B"] > result["A"]);
        assert!(result["B"] > result["C"]);
        assert!(result["B"] > result["D"]);
    }

    #[test]
    fn test_pagerank_dangling_nodes() {
        // D has no outgoing edges (dangling)
        let nodes: Vec<String> = ["A", "B", "C", "D"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
            ("C".to_string(), "A".to_string()),
            // D is dangling
        ];
        let result = pagerank(nodes, edges, None, None, None);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
        // All scores should be positive
        for score in result.values() {
            assert!(*score > 0.0);
        }
    }

    #[test]
    fn test_pagerank_self_loops_ignored() {
        let nodes: Vec<String> = ["A", "B"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "A".to_string()), // self-loop
            ("A".to_string(), "B".to_string()),
        ];
        let result = pagerank(nodes, edges, None, None, None);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
    }

    #[test]
    fn test_pagerank_disconnected_components() {
        // Two separate components
        let nodes: Vec<String> = ["A", "B", "C", "D"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("C".to_string(), "D".to_string()),
        ];
        let result = pagerank(nodes, edges, None, None, None);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
    }

    #[test]
    fn test_pagerank_custom_damping() {
        let nodes: Vec<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let edges = vec![
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
        ];
        let result = pagerank(nodes, edges, Some(0.5), None, None);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
    }
}

use pyo3::exceptions::PyValueError;
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
/// * `damping` - damping factor in (0.0, 1.0), default 0.85
/// * `max_iter` - maximum number of iterations, default 100
/// * `tolerance` - convergence threshold (L1 norm), default 1e-6
///
/// # Returns
/// Map of node_id -> PageRank score (scores sum to 1.0)
///
/// # Errors
/// - `PyValueError` if `damping` is not in the range (0.0, 1.0)
/// - `PyValueError` if `tolerance` is not positive
/// - `PyValueError` if any node ID in `node_ids` is an empty string
#[pyfunction]
pub fn pagerank(
    node_ids: Vec<String>,
    edges: Vec<(String, String)>,
    damping: Option<f64>,
    max_iter: Option<usize>,
    tolerance: Option<f64>,
) -> PyResult<HashMap<String, f64>> {
    let d = damping.unwrap_or(0.85);
    if !(0.0 < d && d < 1.0) {
        return Err(PyValueError::new_err(format!(
            "damping must be in the open interval (0.0, 1.0), got {d}"
        )));
    }

    let tol = tolerance.unwrap_or(1e-6);
    if tol <= 0.0 {
        return Err(PyValueError::new_err(format!(
            "tolerance must be positive, got {tol}"
        )));
    }

    for id in &node_ids {
        if id.is_empty() {
            return Err(PyValueError::new_err(
                "node_ids must not contain empty strings",
            ));
        }
    }

    let max_iterations = max_iter.unwrap_or(100);

    Ok(pagerank_internal(node_ids, edges, d, max_iterations, tol))
}

/// Pure-Rust PageRank implementation (no PyO3 overhead).
///
/// Called by the `pagerank` pyfunction and by benchmarks.
/// Preconditions (not re-validated here):
/// - `damping` ∈ (0.0, 1.0)
/// - `tolerance` > 0.0
pub fn pagerank_internal(
    node_ids: Vec<String>,
    edges: Vec<(String, String)>,
    damping: f64,
    max_iterations: usize,
    tolerance: f64,
) -> HashMap<String, f64> {
    let n = node_ids.len();
    if n == 0 {
        return HashMap::new();
    }

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
    let teleport = (1.0 - damping) / n as f64;

    for _ in 0..max_iterations {
        let mut new_rank = vec![teleport; n];

        // Accumulate dangling node rank: nodes with out_degree == 0
        let dangling_sum: f64 = rank
            .iter()
            .enumerate()
            .filter(|(i, _)| out_degree[*i] == 0)
            .map(|(_, r)| r)
            .sum();

        let dangling_contribution = damping * dangling_sum / n as f64;

        for i in 0..n {
            new_rank[i] += dangling_contribution;
            for &src_idx in &in_links[i] {
                new_rank[i] += damping * rank[src_idx] / out_degree[src_idx] as f64;
            }
        }

        // Check convergence (L1 norm)
        let delta: f64 = rank
            .iter()
            .zip(new_rank.iter())
            .map(|(old, new)| (old - new).abs())
            .sum();

        rank = new_rank;

        if delta < tolerance {
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
        let result = pagerank_internal(vec![], vec![], 0.85, 100, 1e-6);
        assert!(result.is_empty());
    }

    #[test]
    fn test_pagerank_single_node() {
        let result = pagerank_internal(
            vec!["A".to_string()],
            vec![],
            0.85,
            100,
            1e-6,
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
        let result = pagerank_internal(nodes, edges, 0.85, 100, 1e-6);
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
        let result = pagerank_internal(nodes, edges, 0.85, 200, 1e-9);
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
        let result = pagerank_internal(nodes, edges, 0.85, 100, 1e-6);
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
        let result = pagerank_internal(nodes, edges, 0.85, 100, 1e-6);
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
        let result = pagerank_internal(nodes, edges, 0.85, 100, 1e-6);
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
        let result = pagerank_internal(nodes, edges, 0.85, 100, 1e-6);
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
        let result = pagerank_internal(nodes, edges, 0.5, 100, 1e-6);
        let total: f64 = result.values().sum();
        assert!(approx_eq(total, 1.0, 1e-6));
    }

    // --- PyErr validation tests ---

    #[test]
    fn test_pagerank_invalid_damping_zero() {
        assert!(pagerank(vec!["A".to_string()], vec![], Some(0.0), None, None).is_err());
    }

    #[test]
    fn test_pagerank_invalid_damping_one() {
        assert!(pagerank(vec!["A".to_string()], vec![], Some(1.0), None, None).is_err());
    }

    #[test]
    fn test_pagerank_invalid_damping_negative() {
        assert!(pagerank(vec!["A".to_string()], vec![], Some(-0.1), None, None).is_err());
    }

    #[test]
    fn test_pagerank_invalid_tolerance_zero() {
        assert!(pagerank(vec!["A".to_string()], vec![], None, None, Some(0.0)).is_err());
    }

    #[test]
    fn test_pagerank_invalid_tolerance_negative() {
        assert!(pagerank(vec!["A".to_string()], vec![], None, None, Some(-1e-6)).is_err());
    }

    #[test]
    fn test_pagerank_empty_node_id() {
        assert!(pagerank(vec!["".to_string()], vec![], None, None, None).is_err());
    }
}

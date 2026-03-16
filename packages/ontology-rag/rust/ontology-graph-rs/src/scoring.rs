use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use std::collections::HashMap;

/// Batch hybrid scoring for search results.
///
/// Combines keyword relevance, graph proximity, community membership, and
/// node importance (PageRank) into a single weighted final score.
///
/// Score formulas:
/// - graph_score = 1.0 / (depth + 1)  [depth=0 => 1.0, depth=1 => 0.5, ...]
/// - importance_score = pagerank / max_pagerank  [normalized to [0, 1]]
/// - final_score = w_kw * keyword + w_graph * graph + w_comm * community + w_imp * importance
///
/// # Arguments
/// * `node_ids` - nodes to score
/// * `keyword_scores` - keyword relevance scores per node (absent => 0.0)
/// * `bfs_depths` - BFS depth from query node (absent => treated as max depth)
/// * `community_scores` - community membership scores (absent => 0.0)
/// * `pagerank_scores` - raw PageRank values (absent => 0.0)
/// * `weights` - (keyword, graph, community, importance); each component must be >= 0.0
///
/// # Returns
/// List of (node_id, final_score, keyword_score, graph_score, community_score, importance_score)
/// sorted by final_score descending.
///
/// # Errors
/// - `PyValueError` if any weight in `weights` is negative
/// - `PyValueError` if `node_ids` contains empty strings
#[pyfunction]
pub fn batch_hybrid_score(
    node_ids: Vec<String>,
    keyword_scores: HashMap<String, f64>,
    bfs_depths: HashMap<String, usize>,
    community_scores: HashMap<String, f64>,
    pagerank_scores: HashMap<String, f64>,
    weights: (f64, f64, f64, f64),
) -> PyResult<Vec<(String, f64, f64, f64, f64, f64)>> {
    let (w_kw, w_graph, w_comm, w_imp) = weights;
    if w_kw < 0.0 || w_graph < 0.0 || w_comm < 0.0 || w_imp < 0.0 {
        return Err(PyValueError::new_err(format!(
            "all weights must be >= 0.0, got ({w_kw}, {w_graph}, {w_comm}, {w_imp})"
        )));
    }

    for id in &node_ids {
        if id.is_empty() {
            return Err(PyValueError::new_err(
                "node_ids must not contain empty strings",
            ));
        }
    }

    Ok(batch_hybrid_score_internal(
        node_ids,
        keyword_scores,
        bfs_depths,
        community_scores,
        pagerank_scores,
        weights,
    ))
}

/// Pure-Rust hybrid scoring implementation (no PyO3 overhead).
///
/// Called by the `batch_hybrid_score` pyfunction and by benchmarks.
/// Preconditions (not re-validated here):
/// - All weights >= 0.0
/// - No empty strings in `node_ids`
pub fn batch_hybrid_score_internal(
    node_ids: Vec<String>,
    keyword_scores: HashMap<String, f64>,
    bfs_depths: HashMap<String, usize>,
    community_scores: HashMap<String, f64>,
    pagerank_scores: HashMap<String, f64>,
    weights: (f64, f64, f64, f64),
) -> Vec<(String, f64, f64, f64, f64, f64)> {
    if node_ids.is_empty() {
        return Vec::new();
    }

    let (w_kw, w_graph, w_comm, w_imp) = weights;

    // Find max PageRank for normalization; avoid division by zero
    let max_pr = pagerank_scores
        .values()
        .cloned()
        .fold(f64::NEG_INFINITY, f64::max);
    let max_pr = if max_pr <= 0.0 { 1.0 } else { max_pr };

    // Determine "missing depth" fallback: one beyond deepest observed depth
    let max_observed_depth = bfs_depths.values().cloned().max().unwrap_or(0);
    let missing_depth = max_observed_depth + 1;

    let mut results: Vec<(String, f64, f64, f64, f64, f64)> = node_ids
        .into_iter()
        .map(|node_id| {
            let keyword_score = keyword_scores.get(&node_id).cloned().unwrap_or(0.0);

            let depth = bfs_depths
                .get(&node_id)
                .cloned()
                .unwrap_or(missing_depth);
            let graph_score = 1.0 / (depth as f64 + 1.0);

            let community_score = community_scores.get(&node_id).cloned().unwrap_or(0.0);

            let raw_pr = pagerank_scores.get(&node_id).cloned().unwrap_or(0.0);
            let importance_score = raw_pr / max_pr;

            let final_score = w_kw * keyword_score
                + w_graph * graph_score
                + w_comm * community_score
                + w_imp * importance_score;

            (
                node_id,
                final_score,
                keyword_score,
                graph_score,
                community_score,
                importance_score,
            )
        })
        .collect();

    // Sort by final_score descending; use node_id as tiebreaker for stability
    results.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn test_batch_hybrid_score_empty() {
        let result = batch_hybrid_score_internal(
            vec![],
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            (0.4, 0.3, 0.2, 0.1),
        );
        assert!(result.is_empty());
    }

    #[test]
    fn test_graph_score_formula() {
        let nodes = vec!["A".to_string()];
        let depths: HashMap<String, usize> = [("A".to_string(), 0)].into();

        let result = batch_hybrid_score_internal(
            nodes,
            HashMap::new(),
            depths,
            HashMap::new(),
            HashMap::new(),
            (0.0, 1.0, 0.0, 0.0), // only graph weight
        );
        // depth=0 => graph_score = 1.0 / (0+1) = 1.0
        assert!(approx_eq(result[0].3, 1.0, 1e-9));
        assert!(approx_eq(result[0].1, 1.0, 1e-9));
    }

    #[test]
    fn test_graph_score_depth_one() {
        let nodes = vec!["A".to_string()];
        let depths: HashMap<String, usize> = [("A".to_string(), 1)].into();

        let result = batch_hybrid_score_internal(
            nodes,
            HashMap::new(),
            depths,
            HashMap::new(),
            HashMap::new(),
            (0.0, 1.0, 0.0, 0.0),
        );
        // depth=1 => graph_score = 1.0 / 2.0 = 0.5
        assert!(approx_eq(result[0].3, 0.5, 1e-9));
    }

    #[test]
    fn test_importance_normalization() {
        let nodes = vec!["A".to_string(), "B".to_string()];
        let pr: HashMap<String, f64> = [("A".to_string(), 0.3), ("B".to_string(), 0.6)].into();

        let result = batch_hybrid_score_internal(
            nodes,
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            pr,
            (0.0, 0.0, 0.0, 1.0), // only importance weight
        );

        // max_pr = 0.6; A: 0.3/0.6=0.5, B: 0.6/0.6=1.0
        // sorted descending: B first
        let (ref b_id, b_final, _, _, _, b_imp) = result[0];
        let (ref a_id, a_final, _, _, _, a_imp) = result[1];
        assert_eq!(b_id, "B");
        assert!(approx_eq(b_imp, 1.0, 1e-9));
        assert!(approx_eq(b_final, 1.0, 1e-9));
        assert_eq!(a_id, "A");
        assert!(approx_eq(a_imp, 0.5, 1e-9));
        assert!(approx_eq(a_final, 0.5, 1e-9));
    }

    #[test]
    fn test_sorted_descending() {
        let nodes: Vec<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let kw: HashMap<String, f64> = [
            ("A".to_string(), 0.1),
            ("B".to_string(), 0.9),
            ("C".to_string(), 0.5),
        ]
        .into();

        let result = batch_hybrid_score_internal(
            nodes,
            kw,
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            (1.0, 0.0, 0.0, 0.0),
        );

        assert_eq!(result[0].0, "B");
        assert_eq!(result[1].0, "C");
        assert_eq!(result[2].0, "A");
    }

    #[test]
    fn test_missing_node_data_defaults() {
        let nodes = vec!["X".to_string()];
        let result = batch_hybrid_score_internal(
            nodes,
            HashMap::new(), // no keyword score
            HashMap::new(), // no depth
            HashMap::new(), // no community
            HashMap::new(), // no pagerank
            (0.25, 0.25, 0.25, 0.25),
        );
        // keyword=0, graph=1/(0+1+1)=0.5 (missing_depth=1), community=0, importance=0
        // final = 0.25*0 + 0.25*0.5 + 0.25*0 + 0.25*0 = 0.125
        assert!(approx_eq(result[0].1, 0.125, 1e-9));
    }

    #[test]
    fn test_all_weights_combined() {
        let nodes = vec!["A".to_string()];
        let kw: HashMap<String, f64> = [("A".to_string(), 1.0)].into();
        let depths: HashMap<String, usize> = [("A".to_string(), 0)].into();
        let comm: HashMap<String, f64> = [("A".to_string(), 0.8)].into();
        let pr: HashMap<String, f64> = [("A".to_string(), 1.0)].into();

        let result = batch_hybrid_score_internal(
            nodes,
            kw,
            depths,
            comm,
            pr,
            (0.4, 0.3, 0.2, 0.1),
        );
        // keyword=1.0, graph=1.0, community=0.8, importance=1.0
        // final = 0.4*1.0 + 0.3*1.0 + 0.2*0.8 + 0.1*1.0 = 0.4+0.3+0.16+0.1 = 0.96
        assert!(approx_eq(result[0].1, 0.96, 1e-9));
        assert!(approx_eq(result[0].2, 1.0, 1e-9));  // keyword_score
        assert!(approx_eq(result[0].3, 1.0, 1e-9));  // graph_score
        assert!(approx_eq(result[0].4, 0.8, 1e-9));  // community_score
        assert!(approx_eq(result[0].5, 1.0, 1e-9));  // importance_score
    }

    #[test]
    fn test_zero_max_pagerank_no_panic() {
        let nodes = vec!["A".to_string(), "B".to_string()];
        // All pagerank scores are 0.0
        let pr: HashMap<String, f64> = [("A".to_string(), 0.0), ("B".to_string(), 0.0)].into();
        let result = batch_hybrid_score_internal(
            nodes,
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            pr,
            (0.0, 0.0, 0.0, 1.0),
        );
        // max_pr treated as 1.0 to avoid division by zero
        for &(_, _, _, _, _, importance) in &result {
            assert!(approx_eq(importance, 0.0, 1e-9));
        }
    }

    // --- PyErr validation tests ---

    #[test]
    fn test_negative_weight_returns_error() {
        assert!(batch_hybrid_score(
            vec!["A".to_string()],
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            (-0.1, 0.3, 0.2, 0.1),
        )
        .is_err());
    }

    #[test]
    fn test_negative_graph_weight_returns_error() {
        assert!(batch_hybrid_score(
            vec!["A".to_string()],
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            (0.4, -1.0, 0.2, 0.1),
        )
        .is_err());
    }

    #[test]
    fn test_empty_node_id_returns_error() {
        assert!(batch_hybrid_score(
            vec!["".to_string()],
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            (0.4, 0.3, 0.2, 0.1),
        )
        .is_err());
    }
}

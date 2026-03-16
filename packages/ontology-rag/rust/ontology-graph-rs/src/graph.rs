use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use std::collections::{HashMap, HashSet, VecDeque};

/// BFS traversal from a start node up to max_depth.
///
/// # Arguments
/// * `adjacency` - node -> relation -> [targets]
/// * `start` - starting node ID
/// * `max_depth` - maximum traversal depth
/// * `relation_filter` - if Some, only traverse edges matching these relation types
///
/// # Returns
/// Map of node_id -> depth reached during traversal
///
/// # Errors
/// Returns `PyValueError` if `start` is an empty string.
#[pyfunction]
pub fn bfs(
    adjacency: HashMap<String, HashMap<String, Vec<String>>>,
    start: String,
    max_depth: usize,
    relation_filter: Option<Vec<String>>,
) -> PyResult<HashMap<String, usize>> {
    if start.is_empty() {
        return Err(PyValueError::new_err(
            "start node ID must not be empty",
        ));
    }

    Ok(bfs_internal(adjacency, start, max_depth, relation_filter))
}

/// Pure-Rust BFS implementation (no PyO3 overhead).
///
/// Called by the `bfs` pyfunction and by benchmarks.
pub fn bfs_internal(
    adjacency: HashMap<String, HashMap<String, Vec<String>>>,
    start: String,
    max_depth: usize,
    relation_filter: Option<Vec<String>>,
) -> HashMap<String, usize> {
    let mut visited: HashMap<String, usize> = HashMap::new();
    let mut queue: VecDeque<(String, usize)> = VecDeque::new();

    // Check start node exists (still record it even if no outgoing edges)
    if !adjacency.contains_key(&start) && adjacency.is_empty() {
        return visited;
    }

    visited.insert(start.clone(), 0);
    queue.push_back((start, 0));

    let filter_set: Option<HashSet<&str>> = relation_filter
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect());

    while let Some((node, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }

        let Some(relations) = adjacency.get(&node) else {
            continue;
        };

        for (relation, targets) in relations {
            // Apply relation filter if provided
            if let Some(ref allowed) = filter_set {
                if !allowed.contains(relation.as_str()) {
                    continue;
                }
            }

            for target in targets {
                if !visited.contains_key(target) {
                    let next_depth = depth + 1;
                    visited.insert(target.clone(), next_depth);
                    queue.push_back((target.clone(), next_depth));
                }
            }
        }
    }

    visited
}

/// Get direct neighbors of a node.
///
/// # Arguments
/// * `adjacency` - node -> relation -> [targets]
/// * `node_id` - the node to look up
/// * `relation` - if Some, only return neighbors via this relation type
///
/// # Returns
/// List of neighbor node IDs (deduplicated)
///
/// # Errors
/// Returns `PyValueError` if `node_id` is an empty string.
#[pyfunction]
pub fn neighbors(
    adjacency: HashMap<String, HashMap<String, Vec<String>>>,
    node_id: String,
    relation: Option<String>,
) -> PyResult<Vec<String>> {
    if node_id.is_empty() {
        return Err(PyValueError::new_err(
            "node_id must not be empty",
        ));
    }

    Ok(neighbors_internal(&adjacency, &node_id, relation.as_deref()))
}

/// Pure-Rust neighbors implementation (no PyO3 overhead).
pub fn neighbors_internal(
    adjacency: &HashMap<String, HashMap<String, Vec<String>>>,
    node_id: &str,
    relation: Option<&str>,
) -> Vec<String> {
    let Some(relations) = adjacency.get(node_id) else {
        return Vec::new();
    };

    let mut seen: HashSet<String> = HashSet::new();
    let mut result: Vec<String> = Vec::new();

    match relation {
        Some(rel) => {
            if let Some(targets) = relations.get(rel) {
                for t in targets {
                    if seen.insert(t.clone()) {
                        result.push(t.clone());
                    }
                }
            }
        }
        None => {
            for targets in relations.values() {
                for t in targets {
                    if seen.insert(t.clone()) {
                        result.push(t.clone());
                    }
                }
            }
        }
    }

    result
}

/// Get nodes that point TO this node (reverse lookup).
///
/// # Arguments
/// * `reverse_adjacency` - same structure as adjacency but reversed (target -> relation -> [sources])
/// * `node_id` - the node to look up
/// * `relation` - if Some, only return predecessors via this relation type
///
/// # Returns
/// List of predecessor node IDs (deduplicated)
///
/// # Errors
/// Returns `PyValueError` if `node_id` is an empty string.
#[pyfunction]
pub fn reverse_neighbors(
    reverse_adjacency: HashMap<String, HashMap<String, Vec<String>>>,
    node_id: String,
    relation: Option<String>,
) -> PyResult<Vec<String>> {
    if node_id.is_empty() {
        return Err(PyValueError::new_err(
            "node_id must not be empty",
        ));
    }

    Ok(neighbors_internal(
        &reverse_adjacency,
        &node_id,
        relation.as_deref(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_adjacency(
        edges: &[(&str, &str, &str)],
    ) -> HashMap<String, HashMap<String, Vec<String>>> {
        let mut adj: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        for (src, rel, tgt) in edges {
            adj.entry(src.to_string())
                .or_default()
                .entry(rel.to_string())
                .or_default()
                .push(tgt.to_string());
        }
        adj
    }

    #[test]
    fn test_bfs_simple() {
        let adj = make_adjacency(&[("A", "edge", "B"), ("B", "edge", "C"), ("C", "edge", "D")]);
        let result = bfs_internal(adj, "A".to_string(), 10, None);
        assert_eq!(result["A"], 0);
        assert_eq!(result["B"], 1);
        assert_eq!(result["C"], 2);
        assert_eq!(result["D"], 3);
    }

    #[test]
    fn test_bfs_max_depth() {
        let adj = make_adjacency(&[("A", "edge", "B"), ("B", "edge", "C"), ("C", "edge", "D")]);
        let result = bfs_internal(adj, "A".to_string(), 2, None);
        assert_eq!(result.get("A"), Some(&0));
        assert_eq!(result.get("B"), Some(&1));
        assert_eq!(result.get("C"), Some(&2));
        // D is at depth 3, beyond max_depth=2
        assert!(!result.contains_key("D"));
    }

    #[test]
    fn test_bfs_relation_filter() {
        let adj = make_adjacency(&[
            ("A", "rel1", "B"),
            ("A", "rel2", "C"),
            ("B", "rel1", "D"),
        ]);
        let result = bfs_internal(adj, "A".to_string(), 10, Some(vec!["rel1".to_string()]));
        assert!(result.contains_key("B"));
        assert!(result.contains_key("D"));
        assert!(!result.contains_key("C")); // filtered out
    }

    #[test]
    fn test_bfs_empty_graph() {
        let adj: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        let result = bfs_internal(adj, "A".to_string(), 10, None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_bfs_disconnected() {
        let adj = make_adjacency(&[("A", "edge", "B"), ("C", "edge", "D")]);
        let result = bfs_internal(adj, "A".to_string(), 10, None);
        assert!(result.contains_key("A"));
        assert!(result.contains_key("B"));
        assert!(!result.contains_key("C"));
        assert!(!result.contains_key("D"));
    }

    #[test]
    fn test_bfs_cycle() {
        let adj = make_adjacency(&[("A", "edge", "B"), ("B", "edge", "A")]);
        let result = bfs_internal(adj, "A".to_string(), 10, None);
        assert_eq!(result["A"], 0);
        assert_eq!(result["B"], 1);
        // No infinite loop
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_bfs_empty_start_returns_error() {
        let adj = make_adjacency(&[("A", "edge", "B")]);
        // bfs() (pyfunction) validates; bfs_internal bypasses for benchmark use
        // Test via the public pyfunction signature logic:
        assert!(bfs(adj, "".to_string(), 10, None).is_err());
    }

    #[test]
    fn test_neighbors_no_filter() {
        let adj = make_adjacency(&[("A", "rel1", "B"), ("A", "rel2", "C"), ("A", "rel1", "D")]);
        let mut result = neighbors_internal(&adj, "A", None);
        result.sort();
        assert_eq!(result, vec!["B", "C", "D"]);
    }

    #[test]
    fn test_neighbors_with_filter() {
        let adj = make_adjacency(&[("A", "rel1", "B"), ("A", "rel2", "C")]);
        let result = neighbors_internal(&adj, "A", Some("rel1"));
        assert_eq!(result, vec!["B"]);
    }

    #[test]
    fn test_neighbors_missing_node() {
        let adj = make_adjacency(&[("A", "edge", "B")]);
        let result = neighbors_internal(&adj, "Z", None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_neighbors_empty_node_id_returns_error() {
        let adj = make_adjacency(&[("A", "edge", "B")]);
        assert!(neighbors(adj, "".to_string(), None).is_err());
    }

    #[test]
    fn test_reverse_neighbors() {
        // Reverse adjacency: target -> relation -> [sources that point to target]
        // "A" is pointed to by B and C, so: "A" -> "edge" -> ["B", "C"]
        let rev = make_adjacency(&[("A", "edge", "B"), ("A", "edge", "C")]);
        let mut result = neighbors_internal(&rev, "A", None);
        result.sort();
        assert_eq!(result, vec!["B", "C"]);
    }

    #[test]
    fn test_neighbors_deduplication() {
        let mut adj: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();
        adj.entry("A".to_string())
            .or_default()
            .entry("rel1".to_string())
            .or_default()
            .extend(["B".to_string(), "B".to_string()]);
        let result = neighbors_internal(&adj, "A", None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], "B");
    }
}

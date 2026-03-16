mod graph;
mod pagerank;
mod scoring;

use pyo3::prelude::*;

/// High-performance graph operations for ontology-rag.
///
/// This module provides BFS traversal, PageRank, and hybrid scoring
/// as Rust-native implementations for maximum CPU throughput.
///
/// All public functions validate their inputs and return descriptive
/// `PyValueError` messages on invalid arguments.
#[pymodule]
fn ontology_graph_rs(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(graph::bfs, m)?)?;
    m.add_function(wrap_pyfunction!(graph::neighbors, m)?)?;
    m.add_function(wrap_pyfunction!(graph::reverse_neighbors, m)?)?;
    m.add_function(wrap_pyfunction!(pagerank::pagerank, m)?)?;
    m.add_function(wrap_pyfunction!(scoring::batch_hybrid_score, m)?)?;
    Ok(())
}

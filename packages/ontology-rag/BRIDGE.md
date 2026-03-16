# TypeScript -> Python -> Rust Bridge

## Architecture

```
TypeScript (Claude Code)
  | MCP stdio protocol
Python (ontology_rag.mcp_server)
  | PyO3 FFI
Rust (ontology_graph_rs)
```

## Data Flow

1. **TypeScript**: Orchestrator calls MCP tools (`get_agent_for_task`, `ontology_traverse`, etc.)
2. **Python**: MCP server receives JSON-RPC request, deserializes, calls ontology functions
3. **Rust**: When graph operations are needed (BFS, PageRank, scoring), Python calls into Rust via PyO3
4. **Return**: Rust -> Python dict/list -> JSON-RPC response -> TypeScript

## Rust Module Functions

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `bfs` | Breadth-first search from a node | adjacency map, start node, max_depth, optional relation filter | dict of node_id -> depth |
| `neighbors` | Get direct neighbors | adjacency map, node_id, optional relation filter | list of neighbor IDs (deduplicated) |
| `reverse_neighbors` | Get nodes pointing to this node | reverse adjacency map, node_id, optional relation filter | list of predecessor IDs (deduplicated) |
| `pagerank` | Compute PageRank scores | node list, edge list, damping, max_iter, tolerance | dict of node_id -> score (sums to 1.0) |
| `batch_hybrid_score` | Combined relevance scoring | node list, keyword/depth/community/pagerank maps, weights tuple | sorted list of (node_id, final, kw, graph, comm, imp) |

## Input Validation (PyO3 Error Handling)

All functions raise `ValueError` with descriptive messages on invalid input:

| Function | Validated Conditions |
|----------|---------------------|
| `bfs` | `start` node ID must not be empty |
| `neighbors` | `node_id` must not be empty |
| `reverse_neighbors` | `node_id` must not be empty |
| `pagerank` | `damping` in (0.0, 1.0); `tolerance` > 0.0; no empty node IDs |
| `batch_hybrid_score` | all weights >= 0.0; no empty node IDs |

Edge cases handled silently (return empty or partial results):

- BFS on empty graph returns `{}`
- `neighbors` on unknown node returns `[]`
- PageRank edges referencing unknown nodes are skipped
- Self-loop edges in PageRank are ignored
- Missing score/depth entries in `batch_hybrid_score` use sensible defaults (0.0 or max_depth+1)

## Performance Characteristics

- Rust graph operations: ~10-100x faster than pure Python for large graphs
- PyO3 overhead: ~1-5 us per function call (negligible for graph ops >= 50 nodes)
- Typical ontology size: 100-500 nodes; both Python and Rust are fast at this scale
- Benefit grows with graph size and complex queries (PageRank, multi-hop BFS)
- All internal algorithms have pure-Rust counterparts (`bfs_internal`, `pagerank_internal`,
  `batch_hybrid_score_internal`) callable from benchmarks without PyO3 overhead

## Internal vs PyO3 Functions

Each public `#[pyfunction]` delegates to a `*_internal` pure-Rust function after validation:

```
bfs(...)                  <- PyO3 wrapper: validates inputs, raises PyValueError
  -> bfs_internal(...)    <- Pure Rust: used by benchmarks and tests

pagerank(...)
  -> pagerank_internal(...)

batch_hybrid_score(...)
  -> batch_hybrid_score_internal(...)
```

This pattern keeps benchmark code free of PyO3 overhead and makes the core algorithms
independently testable.

## Building

```bash
cd packages/ontology-rag
pip install maturin
maturin develop --release
```

The compiled extension (`ontology_graph_rs.so` / `.pyd`) is placed in the Python
package directory and imported automatically by the MCP server.

## Running Tests

```bash
cd packages/ontology-rag/rust/ontology-graph-rs
cargo test
```

## Running Benchmarks

```bash
cd packages/ontology-rag/rust/ontology-graph-rs
cargo bench
# HTML report: target/criterion/report/index.html
```

Benchmark groups: `bfs/chain/{100,500,1000}`, `pagerank/chain/{50,100,200}`,
`hybrid_score/nodes/{100,500,1000}`.

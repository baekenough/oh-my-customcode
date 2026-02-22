"""Tests for Rust backend glue layer."""

import os
import unittest.mock as mock


def test_has_rust_flag_exists():
    """HAS_RUST flag must always be accessible."""
    from ontology_rag._rust_backend import HAS_RUST
    assert isinstance(HAS_RUST, bool)


def test_fallback_returns_none_when_rust_disabled(monkeypatch):
    """All functions return None when ONTOLOGY_RAG_DISABLE_RUST=1."""
    monkeypatch.setenv("ONTOLOGY_RAG_DISABLE_RUST", "1")

    # Re-import with env var set
    import importlib
    import ontology_rag._rust_backend as rb
    importlib.reload(rb)

    assert rb.HAS_RUST is False
    assert rb.bfs({}, "start", 2) is None
    assert rb.neighbors({}, "node") is None
    assert rb.reverse_neighbors({}, "node") is None
    assert rb.pagerank([], []) is None
    assert rb.batch_hybrid_score([], {}, {}, {}, {}, (0.5, 0.3, 0.15, 0.05)) is None


def test_bfs_signature():
    """bfs() accepts adjacency, start, max_depth, relation_filter."""
    from ontology_rag._rust_backend import bfs
    # With Rust unavailable, returns None — just verify call signature works
    result = bfs({"a": {"x": ["b"]}}, "a", 2, None)
    assert result is None or isinstance(result, dict)


def test_neighbors_signature():
    """neighbors() accepts adjacency, node_id, relation."""
    from ontology_rag._rust_backend import neighbors
    result = neighbors({"a": {"x": ["b"]}}, "a", None)
    assert result is None or isinstance(result, list)


def test_reverse_neighbors_signature():
    """reverse_neighbors() accepts reverse_adjacency, node_id, relation."""
    from ontology_rag._rust_backend import reverse_neighbors
    result = reverse_neighbors({"b": {"x": ["a"]}}, "b", None)
    assert result is None or isinstance(result, list)


def test_pagerank_signature():
    """pagerank() accepts node_ids, edges with optional params."""
    from ontology_rag._rust_backend import pagerank
    result = pagerank(["a", "b"], [("a", "b")])
    assert result is None or isinstance(result, dict)


def test_batch_hybrid_score_signature():
    """batch_hybrid_score() accepts all required arguments."""
    from ontology_rag._rust_backend import batch_hybrid_score
    weights = (0.5, 0.3, 0.15, 0.05)
    result = batch_hybrid_score(
        ["node1"],
        {"node1": 0.8},
        {"node1": 1},
        {"node1": 0.3},
        {"node1": 0.01},
        weights,
    )
    assert result is None or isinstance(result, list)


def test_rust_active_path_bfs():
    """When Rust module is present, bfs delegates to _rust.bfs."""
    import ontology_rag._rust_backend as rb
    import importlib

    fake_rust = mock.MagicMock()
    fake_rust.bfs.return_value = {"start": 0, "b": 1}

    with mock.patch.dict(os.environ, {}, clear=False):
        # Patch the module-level _rust and HAS_RUST
        original_rust = rb._rust
        original_has_rust = rb.HAS_RUST
        try:
            rb._rust = fake_rust
            rb.HAS_RUST = True
            result = rb.bfs({"a": {}}, "start", 2)
            assert result == {"start": 0, "b": 1}
            fake_rust.bfs.assert_called_once()
        finally:
            rb._rust = original_rust
            rb.HAS_RUST = original_has_rust


def test_rust_active_path_pagerank():
    """When Rust module is present, pagerank delegates to _rust.pagerank."""
    import ontology_rag._rust_backend as rb

    fake_rust = mock.MagicMock()
    fake_rust.pagerank.return_value = {"a": 0.5, "b": 0.5}

    original_rust = rb._rust
    original_has_rust = rb.HAS_RUST
    try:
        rb._rust = fake_rust
        rb.HAS_RUST = True
        result = rb.pagerank(["a", "b"], [("a", "b")])
        assert result == {"a": 0.5, "b": 0.5}
        fake_rust.pagerank.assert_called_once()
    finally:
        rb._rust = original_rust
        rb.HAS_RUST = original_has_rust


def test_rust_active_path_batch_hybrid_score():
    """When Rust module is present, batch_hybrid_score delegates correctly."""
    import ontology_rag._rust_backend as rb

    fake_rust = mock.MagicMock()
    fake_result = [("node1", 0.75, 0.8, 0.5, 0.3, 0.01)]
    fake_rust.batch_hybrid_score.return_value = fake_result

    original_rust = rb._rust
    original_has_rust = rb.HAS_RUST
    try:
        rb._rust = fake_rust
        rb.HAS_RUST = True
        result = rb.batch_hybrid_score(
            ["node1"], {"node1": 0.8}, {"node1": 1},
            {"node1": 0.3}, {"node1": 0.01}, (0.5, 0.3, 0.15, 0.05),
        )
        assert result == fake_result
    finally:
        rb._rust = original_rust
        rb.HAS_RUST = original_has_rust

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Building ontology-graph-rs..."
pip install maturin
maturin develop --release --manifest-path rust/ontology-graph-rs/Cargo.toml
echo "Done. Test with: python -c 'from ontology_rag._rust_backend import HAS_RUST; print(f\"Rust available: {HAS_RUST}\")'"

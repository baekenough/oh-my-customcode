# oh-my-customcode — Rust Native Modules

Pure-Rust library for CPU-bound CLI operations.

## Workspace members

| Crate | Purpose |
|-------|---------|
| `cli-native` | Scope filtering, lockfile hashing, file tree scanning |

## cli-native

### Modules

| Module | Description |
|--------|-------------|
| `scope_filter` | Maps `subagent_type` strings to domains (`backend`, `frontend`, ...) |
| `lockfile_hasher` | SHA-256 content hashing + diff for change detection |
| `file_tree_scanner` | Scans `.claude/agents/` and `.claude/skills/`, extracts frontmatter |

### Quick start

```bash
cd rust/
cargo test --all
cargo bench
```

### Design

- Zero Python/Node dependencies — pure Rust
- Minimal deps: `sha2`, `walkdir`, `thiserror`
- `criterion` benchmarks with HTML reports (`target/criterion/`)

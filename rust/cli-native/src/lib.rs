//! # cli-native
//!
//! Pure-Rust library for CPU-bound CLI operations in oh-my-customcode.
//!
//! ## Modules
//!
//! - [`scope_filter`] — Agent domain filtering (subagent_type → domain mapping)
//! - [`lockfile_hasher`] — SHA-256 content hashing for change detection
//! - [`file_tree_scanner`] — Fast `.claude/` directory scanning with frontmatter extraction
//!
//! ## Design principles
//!
//! - Zero Python/Node dependencies — pure Rust library
//! - Minimal dependencies: `sha2`, `walkdir`, `thiserror`
//! - All public functions have `_internal`-style equivalents called directly from benchmarks
//! - Errors use [`error::Error`] with [`thiserror`] for ergonomic propagation

pub mod error;
pub mod file_tree_scanner;
pub mod lockfile_hasher;
pub mod scope_filter;

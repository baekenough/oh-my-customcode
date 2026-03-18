//! Unified error type for all `cli-native` operations.

use std::path::PathBuf;
use thiserror::Error;

/// Top-level error type returned by all public `cli-native` functions.
#[derive(Debug, Error)]
pub enum Error {
    /// An I/O error occurred while reading or writing a file or directory.
    #[error("I/O error on {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// A directory traversal error (from `walkdir`).
    #[error("directory walk error: {source}")]
    Walk {
        #[source]
        source: Box<walkdir::Error>,
    },
}

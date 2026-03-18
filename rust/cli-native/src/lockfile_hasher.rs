//! Content hash calculation for change detection.
//!
//! Computes SHA-256 hashes of `.claude/` files and compares snapshots
//! to detect which files changed between two points in time.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

use crate::error::Error;

/// A single entry in a diff result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffEntry {
    /// Relative path of the file (relative to the scanned directory root).
    pub path: String,
    /// The kind of change detected.
    pub kind: DiffKind,
}

/// Classification of a detected change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffKind {
    /// File exists in `new` but not in `old`.
    Added,
    /// File exists in `old` but not in `new`.
    Removed,
    /// File exists in both but the hash differs.
    Modified,
}

/// Computes the SHA-256 hash of a file's contents.
///
/// Returns a lowercase hex-encoded string of 64 characters.
///
/// # Errors
///
/// Returns [`Error::Io`] if the file cannot be read.
///
/// # Examples
///
/// ```no_run
/// use std::path::Path;
/// use cli_native::lockfile_hasher::hash_file;
///
/// let hash = hash_file(Path::new("Cargo.toml")).unwrap();
/// assert_eq!(hash.len(), 64);
/// ```
pub fn hash_file(path: &Path) -> Result<String, Error> {
    let contents = fs::read(path).map_err(|e| Error::Io {
        path: path.to_path_buf(),
        source: e,
    })?;
    let digest = Sha256::digest(&contents);
    Ok(format!("{digest:x}"))
}

/// Computes SHA-256 hashes for all files in `dir` whose names match `extension_filter`.
///
/// The returned map uses paths **relative to `dir`** as keys (with `/` separator).
///
/// `extension_filter` is a simple extension filter (e.g. `"*.md"` matches files ending in `.md`).
/// Pass `"*"` to include all files.
///
/// # Errors
///
/// Returns [`Error::Io`] if the directory cannot be read or a file cannot be hashed.
///
/// # Examples
///
/// ```no_run
/// use std::path::Path;
/// use cli_native::lockfile_hasher::hash_directory;
///
/// let hashes = hash_directory(Path::new(".claude/agents"), "*.md").unwrap();
/// println!("Found {} agent files", hashes.len());
/// ```
pub fn hash_directory(dir: &Path, extension_filter: &str) -> Result<HashMap<String, String>, Error> {
    let mut map = HashMap::new();

    if !dir.exists() {
        return Ok(map);
    }

    let suffix = extension_filter
        .strip_prefix('*')
        .unwrap_or(extension_filter)
        .to_owned();
    let match_all = extension_filter == "*";

    for entry in walkdir::WalkDir::new(dir)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
    {
        let entry = entry.map_err(|e| Error::Walk {
            source: Box::new(e),
        })?;

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        if !match_all && !file_name.ends_with(&suffix) {
            continue;
        }

        let rel = relative_path(dir, path);
        let hash = hash_file(path)?;
        map.insert(rel, hash);
    }

    Ok(map)
}

/// Compares two hash maps and returns entries that were added, removed, or modified.
///
/// Order within the returned `Vec` is deterministic (sorted by path).
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
/// use cli_native::lockfile_hasher::{diff_hashes, DiffKind};
///
/// let mut old = HashMap::new();
/// old.insert("a.md".to_owned(), "aaa".to_owned());
/// old.insert("b.md".to_owned(), "bbb".to_owned());
///
/// let mut new = HashMap::new();
/// new.insert("a.md".to_owned(), "zzz".to_owned()); // modified
/// new.insert("c.md".to_owned(), "ccc".to_owned()); // added
/// // b.md is absent → removed
///
/// let diff = diff_hashes(&old, &new);
/// assert_eq!(diff.len(), 3);
/// let kinds: Vec<_> = diff.iter().map(|d| d.kind.clone()).collect();
/// // sorted by path: a.md (Modified), b.md (Removed), c.md (Added)
/// assert_eq!(kinds, vec![DiffKind::Modified, DiffKind::Removed, DiffKind::Added]);
/// ```
pub fn diff_hashes(
    old: &HashMap<String, String>,
    new: &HashMap<String, String>,
) -> Vec<DiffEntry> {
    let mut entries = Vec::new();

    // Detect modified and removed
    for (path, old_hash) in old {
        match new.get(path) {
            Some(new_hash) if new_hash != old_hash => entries.push(DiffEntry {
                path: path.clone(),
                kind: DiffKind::Modified,
            }),
            None => entries.push(DiffEntry {
                path: path.clone(),
                kind: DiffKind::Removed,
            }),
            _ => {}
        }
    }

    // Detect added
    for path in new.keys() {
        if !old.contains_key(path) {
            entries.push(DiffEntry {
                path: path.clone(),
                kind: DiffKind::Added,
            });
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    entries
}

/// Converts an absolute `path` to a forward-slash relative path from `base`.
fn relative_path(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

// Internal helpers exposed for benchmarks (no hashing overhead from public API wrappers).

/// Hashes a byte slice directly. Used in benchmarks to avoid file I/O overhead.
pub fn hash_bytes(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    format!("{digest:x}")
}

/// Returns a dummy PathBuf for error construction in tests.
#[allow(dead_code)]
pub(crate) fn dummy_path() -> PathBuf {
    PathBuf::from("<in-memory>")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_hash_bytes_length() {
        let hash = hash_bytes(b"hello world");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hash_bytes_deterministic() {
        let h1 = hash_bytes(b"test data");
        let h2 = hash_bytes(b"test data");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_bytes_differs() {
        let h1 = hash_bytes(b"hello");
        let h2 = hash_bytes(b"world");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_hash_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        let mut f = fs::File::create(&file_path).unwrap();
        f.write_all(b"# Agent\nname: test-agent\n").unwrap();
        drop(f);

        let hash = hash_file(&file_path).unwrap();
        assert_eq!(hash.len(), 64);

        // Same content → same hash
        let hash2 = hash_file(&file_path).unwrap();
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_hash_file_not_found() {
        let result = hash_file(Path::new("/nonexistent/path/file.md"));
        assert!(result.is_err());
    }

    #[test]
    fn test_hash_directory_md_only() {
        let dir = tempdir().unwrap();

        for name in &["agent1.md", "agent2.md", "notes.txt"] {
            let mut f = fs::File::create(dir.path().join(name)).unwrap();
            write!(f, "content of {name}").unwrap();
        }

        let hashes = hash_directory(dir.path(), "*.md").unwrap();
        assert_eq!(hashes.len(), 2);
        assert!(hashes.contains_key("agent1.md"));
        assert!(hashes.contains_key("agent2.md"));
        assert!(!hashes.contains_key("notes.txt"));
    }

    #[test]
    fn test_hash_directory_all_files() {
        let dir = tempdir().unwrap();
        for name in &["a.md", "b.yaml", "c.json"] {
            fs::write(dir.path().join(name), b"data").unwrap();
        }

        let hashes = hash_directory(dir.path(), "*").unwrap();
        assert_eq!(hashes.len(), 3);
    }

    #[test]
    fn test_hash_directory_nonexistent_returns_empty() {
        let hashes = hash_directory(Path::new("/nonexistent/dir"), "*.md").unwrap();
        assert!(hashes.is_empty());
    }

    #[test]
    fn test_hash_directory_nested() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("root.md"), b"root").unwrap();
        fs::write(dir.path().join("sub").join("nested.md"), b"nested").unwrap();

        let hashes = hash_directory(dir.path(), "*.md").unwrap();
        assert_eq!(hashes.len(), 2);
        assert!(hashes.contains_key("root.md"));
        assert!(hashes.contains_key("sub/nested.md"));
    }

    #[test]
    fn test_diff_hashes_added() {
        let old = HashMap::new();
        let mut new = HashMap::new();
        new.insert("new.md".to_owned(), "abc".to_owned());

        let diff = diff_hashes(&old, &new);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].kind, DiffKind::Added);
        assert_eq!(diff[0].path, "new.md");
    }

    #[test]
    fn test_diff_hashes_removed() {
        let mut old = HashMap::new();
        old.insert("gone.md".to_owned(), "abc".to_owned());
        let new = HashMap::new();

        let diff = diff_hashes(&old, &new);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].kind, DiffKind::Removed);
    }

    #[test]
    fn test_diff_hashes_modified() {
        let mut old = HashMap::new();
        old.insert("changed.md".to_owned(), "old-hash".to_owned());
        let mut new = HashMap::new();
        new.insert("changed.md".to_owned(), "new-hash".to_owned());

        let diff = diff_hashes(&old, &new);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].kind, DiffKind::Modified);
    }

    #[test]
    fn test_diff_hashes_no_change() {
        let mut old = HashMap::new();
        old.insert("same.md".to_owned(), "abc".to_owned());
        let mut new = HashMap::new();
        new.insert("same.md".to_owned(), "abc".to_owned());

        let diff = diff_hashes(&old, &new);
        assert!(diff.is_empty());
    }

    #[test]
    fn test_diff_hashes_sorted_by_path() {
        let mut old = HashMap::new();
        old.insert("b.md".to_owned(), "bbb".to_owned());
        old.insert("a.md".to_owned(), "aaa".to_owned());

        let mut new = HashMap::new();
        new.insert("a.md".to_owned(), "zzz".to_owned());
        new.insert("c.md".to_owned(), "ccc".to_owned());

        let diff = diff_hashes(&old, &new);
        assert_eq!(diff.len(), 3);
        let paths: Vec<_> = diff.iter().map(|d| d.path.as_str()).collect();
        assert_eq!(paths, vec!["a.md", "b.md", "c.md"]);
    }
}

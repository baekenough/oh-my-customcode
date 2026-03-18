//! File tree scanner for `.claude/agents/` and `.claude/skills/` directories.
//!
//! Scans directories and extracts YAML frontmatter fields (name, description, model, etc.)
//! without pulling in a full YAML parser — only `key: value` lines inside `---` fences.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::error::Error;

/// Metadata extracted from an agent file's YAML frontmatter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentInfo {
    /// Value of the `name:` frontmatter field (or derived from filename).
    pub name: String,
    /// Absolute path to the `.md` file.
    pub path: PathBuf,
    /// Key/value pairs parsed from the frontmatter block.
    pub frontmatter: HashMap<String, String>,
}

/// Metadata extracted from a skill directory's `SKILL.md` frontmatter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillInfo {
    /// Value of the `name:` frontmatter field (or derived from directory name).
    pub name: String,
    /// Absolute path to the `SKILL.md` file.
    pub path: PathBuf,
    /// Key/value pairs parsed from the frontmatter block.
    pub frontmatter: HashMap<String, String>,
}

/// Scans `dir` for agent `.md` files and parses their frontmatter.
///
/// Only direct children of `dir` are scanned (depth 1). Files without a valid
/// `---` frontmatter block are included with an empty `frontmatter` map.
///
/// # Errors
///
/// Returns [`Error::Io`] if the directory cannot be read.
///
/// # Examples
///
/// ```no_run
/// use std::path::Path;
/// use cli_native::file_tree_scanner::scan_agents;
///
/// let agents = scan_agents(Path::new(".claude/agents")).unwrap();
/// println!("Found {} agents", agents.len());
/// ```
pub fn scan_agents(dir: &Path) -> Result<Vec<AgentInfo>, Error> {
    let mut agents = Vec::new();

    if !dir.exists() {
        return Ok(agents);
    }

    let mut entries = read_dir_md_files(dir)?;
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    for path in entries {
        let frontmatter = parse_frontmatter_file(&path)?;
        let name = frontmatter
            .get("name")
            .cloned()
            .unwrap_or_else(|| stem_from_path(&path));
        agents.push(AgentInfo {
            name,
            path,
            frontmatter,
        });
    }

    Ok(agents)
}

/// Scans `dir` for skill subdirectories containing `SKILL.md` and parses their frontmatter.
///
/// Only immediate subdirectories of `dir` are checked (depth 1).
///
/// # Errors
///
/// Returns [`Error::Io`] if the directory cannot be read.
///
/// # Examples
///
/// ```no_run
/// use std::path::Path;
/// use cli_native::file_tree_scanner::scan_skills;
///
/// let skills = scan_skills(Path::new(".claude/skills")).unwrap();
/// println!("Found {} skills", skills.len());
/// ```
pub fn scan_skills(dir: &Path) -> Result<Vec<SkillInfo>, Error> {
    let mut skills = Vec::new();

    if !dir.exists() {
        return Ok(skills);
    }

    let read = fs::read_dir(dir).map_err(|e| Error::Io {
        path: dir.to_path_buf(),
        source: e,
    })?;

    let mut subdirs: Vec<PathBuf> = read
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect();

    subdirs.sort();

    for subdir in subdirs {
        let skill_file = subdir.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }
        let frontmatter = parse_frontmatter_file(&skill_file)?;
        let name = frontmatter
            .get("name")
            .cloned()
            .unwrap_or_else(|| stem_from_path(&subdir));
        skills.push(SkillInfo {
            name,
            path: skill_file,
            frontmatter,
        });
    }

    Ok(skills)
}

/// Parses simple `key: value` pairs from a YAML frontmatter block delimited by `---`.
///
/// Only the first frontmatter block is parsed. Multi-line values are not supported.
/// Comments (`#`) and blank lines are ignored.
///
/// Returns an empty map if no frontmatter block is found.
pub fn parse_frontmatter(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut lines = content.lines();

    // Expect opening `---`
    if lines.next().map(str::trim) != Some("---") {
        return map;
    }

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let k = key.trim().to_owned();
            let v = value.trim().to_owned();
            if !k.is_empty() {
                map.insert(k, v);
            }
        }
    }

    map
}

// ── Private helpers ──────────────────────────────────────────────────────────

/// Reads all `.md` files directly inside `dir` (non-recursive).
fn read_dir_md_files(dir: &Path) -> Result<Vec<PathBuf>, Error> {
    let read = fs::read_dir(dir).map_err(|e| Error::Io {
        path: dir.to_path_buf(),
        source: e,
    })?;

    let paths = read
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
        .collect();

    Ok(paths)
}

/// Reads a file and parses its frontmatter.
fn parse_frontmatter_file(path: &Path) -> Result<HashMap<String, String>, Error> {
    let content = fs::read_to_string(path).map_err(|e| Error::Io {
        path: path.to_path_buf(),
        source: e,
    })?;
    Ok(parse_frontmatter(&content))
}

/// Derives a name from a path's file stem (without extension) or directory name.
fn stem_from_path(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_owned()
}

// ── Internal benchmark helpers ────────────────────────────────────────────────

/// Parses frontmatter from a string slice directly. Used in benchmarks.
pub fn parse_frontmatter_str(content: &str) -> HashMap<String, String> {
    parse_frontmatter(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn write_file(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    // ── parse_frontmatter ────────────────────────────────────────────────────

    #[test]
    fn test_parse_frontmatter_basic() {
        let content = "---\nname: my-agent\nmodel: sonnet\ndescription: Does things\n---\n# Body";
        let fm = parse_frontmatter(content);
        assert_eq!(fm.get("name").map(String::as_str), Some("my-agent"));
        assert_eq!(fm.get("model").map(String::as_str), Some("sonnet"));
        assert_eq!(fm.get("description").map(String::as_str), Some("Does things"));
    }

    #[test]
    fn test_parse_frontmatter_no_block() {
        let content = "# Just a markdown file\nNo frontmatter here.";
        let fm = parse_frontmatter(content);
        assert!(fm.is_empty());
    }

    #[test]
    fn test_parse_frontmatter_empty_block() {
        let content = "---\n---\nBody";
        let fm = parse_frontmatter(content);
        assert!(fm.is_empty());
    }

    #[test]
    fn test_parse_frontmatter_skips_comments() {
        let content = "---\n# This is a comment\nname: agent\n---\n";
        let fm = parse_frontmatter(content);
        assert_eq!(fm.get("name").map(String::as_str), Some("agent"));
        assert!(!fm.contains_key("# This is a comment"));
    }

    #[test]
    fn test_parse_frontmatter_value_with_colon() {
        // Only the first `:` splits key from value
        let content = "---\ndescription: Does: something: complex\n---\n";
        let fm = parse_frontmatter(content);
        assert_eq!(
            fm.get("description").map(String::as_str),
            Some("Does: something: complex")
        );
    }

    #[test]
    fn test_parse_frontmatter_skips_blank_lines() {
        let content = "---\n\nname: agent\n\nmodel: haiku\n---\n";
        let fm = parse_frontmatter(content);
        assert_eq!(fm.len(), 2);
    }

    // ── scan_agents ──────────────────────────────────────────────────────────

    #[test]
    fn test_scan_agents_basic() {
        let dir = tempdir().unwrap();
        write_file(
            dir.path(),
            "lang-golang-expert.md",
            "---\nname: lang-golang-expert\nmodel: sonnet\n---\n# Body\n",
        );
        write_file(
            dir.path(),
            "fe-vercel-agent.md",
            "---\nname: fe-vercel-agent\nmodel: haiku\n---\n",
        );
        // Non-.md file should be ignored
        write_file(dir.path(), "ignore.txt", "ignored");

        let agents = scan_agents(dir.path()).unwrap();
        assert_eq!(agents.len(), 2);

        let names: Vec<_> = agents.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"fe-vercel-agent"));
        assert!(names.contains(&"lang-golang-expert"));
    }

    #[test]
    fn test_scan_agents_fallback_name() {
        let dir = tempdir().unwrap();
        write_file(dir.path(), "my-agent.md", "# No frontmatter\n");

        let agents = scan_agents(dir.path()).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "my-agent");
        assert!(agents[0].frontmatter.is_empty());
    }

    #[test]
    fn test_scan_agents_nonexistent_dir() {
        let agents = scan_agents(Path::new("/nonexistent/agents")).unwrap();
        assert!(agents.is_empty());
    }

    // ── scan_skills ──────────────────────────────────────────────────────────

    #[test]
    fn test_scan_skills_basic() {
        let dir = tempdir().unwrap();

        // Skill 1: with SKILL.md
        let skill1 = dir.path().join("dev-lead-routing");
        fs::create_dir(&skill1).unwrap();
        write_file(
            &skill1,
            "SKILL.md",
            "---\nname: dev-lead-routing\ndescription: Routes dev tasks\n---\n",
        );

        // Skill 2: directory without SKILL.md (should be skipped)
        fs::create_dir(dir.path().join("no-skill-file")).unwrap();

        // Skill 3: another valid skill
        let skill3 = dir.path().join("secretary-routing");
        fs::create_dir(&skill3).unwrap();
        write_file(
            &skill3,
            "SKILL.md",
            "---\nname: secretary-routing\n---\n",
        );

        let skills = scan_skills(dir.path()).unwrap();
        assert_eq!(skills.len(), 2);

        let names: Vec<_> = skills.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"dev-lead-routing"));
        assert!(names.contains(&"secretary-routing"));
    }

    #[test]
    fn test_scan_skills_fallback_name() {
        let dir = tempdir().unwrap();
        let skill_dir = dir.path().join("my-skill");
        fs::create_dir(&skill_dir).unwrap();
        write_file(&skill_dir, "SKILL.md", "# No frontmatter\n");

        let skills = scan_skills(dir.path()).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
    }

    #[test]
    fn test_scan_skills_nonexistent_dir() {
        let skills = scan_skills(Path::new("/nonexistent/skills")).unwrap();
        assert!(skills.is_empty());
    }

    #[test]
    fn test_scan_skills_sorted() {
        let dir = tempdir().unwrap();
        for name in &["z-skill", "a-skill", "m-skill"] {
            let skill_dir = dir.path().join(name);
            fs::create_dir(&skill_dir).unwrap();
            write_file(&skill_dir, "SKILL.md", &format!("---\nname: {name}\n---\n"));
        }

        let skills = scan_skills(dir.path()).unwrap();
        let names: Vec<_> = skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["a-skill", "m-skill", "z-skill"]);
    }

    #[test]
    fn test_agent_info_has_path() {
        let dir = tempdir().unwrap();
        write_file(
            dir.path(),
            "test-agent.md",
            "---\nname: test-agent\n---\n",
        );

        let agents = scan_agents(dir.path()).unwrap();
        assert_eq!(agents.len(), 1);
        assert!(agents[0].path.exists());
        assert!(agents[0].path.ends_with("test-agent.md"));
    }
}

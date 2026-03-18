use std::{collections::HashMap, hint::black_box, path::Path};

use cli_native::{
    file_tree_scanner::parse_frontmatter_str,
    lockfile_hasher::{diff_hashes, hash_bytes},
    scope_filter::{filter_by_domain, matches_domain, resolve_domain},
};
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};

// ── scope_filter benchmarks ────────────────────────────────────────────────

/// All 44 known agent types from the project.
const ALL_AGENTS: &[&str] = &[
    // Backend
    "lang-golang-expert",
    "lang-python-expert",
    "lang-rust-expert",
    "lang-kotlin-expert",
    "lang-typescript-expert",
    "lang-java21-expert",
    "be-fastapi-expert",
    "be-springboot-expert",
    "be-go-backend-expert",
    "be-express-expert",
    "be-nestjs-expert",
    "be-django-expert",
    // Frontend
    "fe-vercel-agent",
    "fe-vuejs-agent",
    "fe-svelte-agent",
    "fe-flutter-agent",
    // Tooling
    "tool-npm-expert",
    "tool-optimizer",
    "tool-bun-expert",
    // DE
    "de-airflow-expert",
    "de-dbt-expert",
    "de-spark-expert",
    "de-kafka-expert",
    "de-snowflake-expert",
    "de-pipeline-expert",
    // DB / DevOps
    "db-supabase-expert",
    "db-postgres-expert",
    "db-redis-expert",
    "infra-docker-expert",
    "infra-aws-expert",
    // Security
    "sec-codeql-expert",
    // Architecture
    "arch-documenter",
    "arch-speckit-agent",
    // QA
    "qa-planner",
    "qa-writer",
    "qa-engineer",
    // Management
    "mgr-creator",
    "mgr-updater",
    "mgr-supplier",
    "mgr-gitnerd",
    "mgr-sauron",
    "mgr-claude-code-bible",
    // System
    "sys-memory-keeper",
    "sys-naggy",
];

fn bench_scope_filter(c: &mut Criterion) {
    let mut group = c.benchmark_group("scope_filter");

    // resolve_domain: single lookup
    group.bench_function("resolve_domain/single", |b| {
        b.iter(|| resolve_domain(black_box("lang-golang-expert")))
    });

    // matches_domain: single check
    group.bench_function("matches_domain/single", |b| {
        b.iter(|| matches_domain(black_box("lang-golang-expert"), black_box("backend")))
    });

    // filter_by_domain: 44 agents, filter "backend" (12 matches)
    group.bench_with_input(
        BenchmarkId::new("filter_by_domain", "44_agents→backend"),
        &ALL_AGENTS,
        |b, agents| b.iter(|| filter_by_domain(black_box(agents), black_box("backend"))),
    );

    // filter_by_domain: 44 agents, filter "management" (6 matches)
    group.bench_with_input(
        BenchmarkId::new("filter_by_domain", "44_agents→management"),
        &ALL_AGENTS,
        |b, agents| b.iter(|| filter_by_domain(black_box(agents), black_box("management"))),
    );

    // filter_by_domain: 44 agents, filter all domains
    let domains = [
        "backend",
        "frontend",
        "data-engineering",
        "devops",
        "database",
        "management",
        "security",
        "qa",
        "architecture",
        "universal",
    ];
    group.bench_function("filter_by_domain/all_domains", |b| {
        b.iter(|| {
            for domain in &domains {
                let _ = filter_by_domain(black_box(ALL_AGENTS), black_box(domain));
            }
        })
    });

    group.finish();
}

// ── lockfile_hasher benchmarks ─────────────────────────────────────────────

/// Generates N fake file contents of varying sizes.
fn make_file_contents(n: usize) -> Vec<Vec<u8>> {
    (0..n)
        .map(|i| {
            let base = format!(
                "---\nname: agent-{i}\nmodel: sonnet\ndescription: Agent number {i}\n---\n# Agent {i}\n\nBody content for agent {i}.\n"
            );
            // Vary size: repeat body proportional to index
            let repeat = (i % 10) + 1;
            base.repeat(repeat).into_bytes()
        })
        .collect()
}

fn bench_lockfile_hasher(c: &mut Criterion) {
    let mut group = c.benchmark_group("lockfile_hasher");

    // hash_bytes: single 1 KB chunk
    let kb_chunk: Vec<u8> = (0u8..=255).cycle().take(1024).collect();
    group.bench_function("hash_bytes/1KB", |b| {
        b.iter(|| hash_bytes(black_box(&kb_chunk)))
    });

    // hash_bytes: 4 KB chunk
    let four_kb: Vec<u8> = (0u8..=255).cycle().take(4096).collect();
    group.bench_function("hash_bytes/4KB", |b| {
        b.iter(|| hash_bytes(black_box(&four_kb)))
    });

    // Simulate hashing 50 files (benchmark size target from spec)
    for n in [10, 50, 100] {
        let contents = make_file_contents(n);
        group.bench_with_input(
            BenchmarkId::new("hash_N_files", n),
            &contents,
            |b, contents| {
                b.iter(|| {
                    let mut map: HashMap<String, String> = HashMap::with_capacity(contents.len());
                    for (i, data) in contents.iter().enumerate() {
                        map.insert(format!("agent-{i}.md"), hash_bytes(black_box(data)));
                    }
                    map
                })
            },
        );
    }

    // diff_hashes: 50 files, 10 modified
    let contents_old = make_file_contents(50);
    let old_map: HashMap<String, String> = contents_old
        .iter()
        .enumerate()
        .map(|(i, d)| (format!("agent-{i}.md"), hash_bytes(d)))
        .collect();
    // Modify first 10 entries with genuinely different content
    let mut new_map = old_map.clone();
    for i in 0..10 {
        let modified_content = format!("MODIFIED_{i}_{}", contents_old[i].len());
        new_map.insert(
            format!("agent-{i}.md"),
            hash_bytes(modified_content.as_bytes()),
        );
    }

    group.bench_function("diff_hashes/50_files_10_modified", |b| {
        b.iter(|| diff_hashes(black_box(&old_map), black_box(&new_map)))
    });

    group.finish();
}

// ── file_tree_scanner benchmarks ───────────────────────────────────────────

/// Generates a realistic agent frontmatter string.
fn agent_md(i: usize) -> String {
    let tools = if i % 3 == 0 {
        "Read, Write, Bash, Glob, Grep"
    } else if i % 3 == 1 {
        "Read, Write, Edit"
    } else {
        "Read, Glob, Grep"
    };
    format!(
        "---\nname: agent-{i}\nmodel: sonnet\ndescription: Auto-generated agent {i}\ntools: [{tools}]\nmemory: project\n---\n\n# Agent {i}\n\nDoes something specific for domain {i}.\n"
    )
}

/// Generates a realistic SKILL.md frontmatter string.
fn skill_md(i: usize) -> String {
    format!(
        "---\nname: skill-{i}\ndescription: Skill number {i}\nscope: core\nversion: 1.0.{i}\n---\n\n# Skill {i}\n\nInstructions for skill {i}.\n"
    )
}

fn bench_file_tree_scanner(c: &mut Criterion) {
    let mut group = c.benchmark_group("file_tree_scanner");

    // parse_frontmatter: single agent file
    let sample_agent = agent_md(0);
    group.bench_function("parse_frontmatter/single_agent", |b| {
        b.iter(|| parse_frontmatter_str(black_box(&sample_agent)))
    });

    // parse_frontmatter: single skill file
    let sample_skill = skill_md(0);
    group.bench_function("parse_frontmatter/single_skill", |b| {
        b.iter(|| parse_frontmatter_str(black_box(&sample_skill)))
    });

    // Simulate scanning N agent files (parse only, no disk I/O)
    for n in [44, 100, 200] {
        let files: Vec<String> = (0..n).map(agent_md).collect();
        group.bench_with_input(
            BenchmarkId::new("parse_frontmatter_N_agents", n),
            &files,
            |b, files| {
                b.iter(|| {
                    files
                        .iter()
                        .map(|f| parse_frontmatter_str(black_box(f)))
                        .count()
                })
            },
        );
    }

    // Simulate scanning N skill files
    for n in [75, 150, 300] {
        let files: Vec<String> = (0..n).map(skill_md).collect();
        group.bench_with_input(
            BenchmarkId::new("parse_frontmatter_N_skills", n),
            &files,
            |b, files| {
                b.iter(|| {
                    files
                        .iter()
                        .map(|f| parse_frontmatter_str(black_box(f)))
                        .count()
                })
            },
        );
    }

    // Disk-based benchmark: scan actual .claude/agents/ and .claude/skills/ if present
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(Path::new("."));

    let agents_dir = project_root.join(".claude/agents");
    if agents_dir.exists() {
        group.bench_function("scan_agents/real_directory", |b| {
            b.iter(|| cli_native::file_tree_scanner::scan_agents(black_box(&agents_dir)))
        });
    }

    let skills_dir = project_root.join(".claude/skills");
    if skills_dir.exists() {
        group.bench_function("scan_skills/real_directory", |b| {
            b.iter(|| cli_native::file_tree_scanner::scan_skills(black_box(&skills_dir)))
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_scope_filter,
    bench_lockfile_hasher,
    bench_file_tree_scanner
);
criterion_main!(benches);

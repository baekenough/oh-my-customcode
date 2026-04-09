/**
 * Unit tests for findProjects() in src/cli/projects.ts
 *
 * Focus: edge cases introduced by the cwd/parent-dir addition (fix #546)
 *   - CWD project is found when not in DEFAULT_SEARCH_DIRS
 *   - Parent dir project is found when not in DEFAULT_SEARCH_DIRS
 *   - Deduplication: same project not returned twice when cwd and parent overlap
 *   - Root directory: parent === cwd does not produce duplicate search
 *   - options.paths provided: cwd/parent injection is skipped (defaults still run)
 *   - Non-existent cwd: gracefully ignored
 *   - Sibling projects under parent are found
 *
 * macOS note: tmpdir() returns a symlinked path (/var/...) but process.cwd()
 * returns the realpath (/private/var/...). Tests use realpathSync to normalize.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findProjects } from '../../../src/cli/projects.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mkDir(base: string, ...parts: string[]): Promise<string> {
  const dir = join(base, ...parts);
  await mkdir(dir, { recursive: true });
  return realpathSync(dir);
}

async function writeLockFile(dir: string, version = '0.46.0'): Promise<void> {
  await writeFile(
    join(dir, '.omcustom.lock.json'),
    JSON.stringify({ version, installedAt: '2026-01-01T00:00:00.000Z' }, null, 2),
    'utf-8'
  );
}

async function _writeClaudeMarkers(dir: string): Promise<void> {
  await mkdir(join(dir, '.claude', 'agents'), { recursive: true });
  await mkdir(join(dir, '.claude', 'skills'), { recursive: true });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let tempRoot: string;
let originalCwd: string;

beforeEach(async () => {
  // Create a temp dir that is OUTSIDE DEFAULT_SEARCH_DIRS so default search
  // does not accidentally discover our test projects.
  // Use realpathSync to normalize macOS symlinks (/var → /private/var).
  const raw = await mkdtemp(join(tmpdir(), 'omcc-projects-test-'));
  tempRoot = realpathSync(raw);
  originalCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Core fix: cwd is included in search paths
// ---------------------------------------------------------------------------

describe('findProjects() — cwd inclusion (fix #546)', () => {
  it('finds a project in cwd when cwd is outside DEFAULT_SEARCH_DIRS', async () => {
    const projectDir = await mkDir(tempRoot, 'my-project');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    const results = await findProjects();

    const found = results.find((p) => p.path === projectDir);
    expect(found).toBeDefined();
    expect(found?.detectionMethod).toBe('lockfile');
    expect(found?.version).toBe('0.46.0');
  });

  it('does not find a project via .claude markers alone (no lock file, no registry entry)', async () => {
    // With registry-based detection, .claude markers without a lock file or
    // registry entry are NOT detected (no false positives for native Claude Code).
    const projectDir = await mkDir(tempRoot, 'markers-project');
    await _writeClaudeMarkers(projectDir);
    process.chdir(projectDir);

    const results = await findProjects();

    const found = results.find((p) => p.path === projectDir);
    // Directory-only detection is removed — projects must have a lock file or registry entry.
    expect(found).toBeUndefined();
  });

  it('does not affect status when cwd is not an omcustom project', async () => {
    const nonProjectDir = await mkDir(tempRoot, 'plain-dir');
    process.chdir(nonProjectDir);

    const results = await findProjects();

    const found = results.find((p) => p.path === nonProjectDir);
    // A plain directory with no markers should not appear in results.
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Core fix: parent dir is included in search paths
// ---------------------------------------------------------------------------

describe('findProjects() — parent dir inclusion (fix #546)', () => {
  it('finds a project in the parent dir when parent is outside DEFAULT_SEARCH_DIRS', async () => {
    // Structure: tempRoot/parent-project/.omcustom.lock.json
    //            tempRoot/parent-project/sub/   ← cwd
    const parentProjectDir = await mkDir(tempRoot, 'parent-project');
    await writeLockFile(parentProjectDir);
    const childDir = await mkDir(parentProjectDir, 'sub');
    process.chdir(childDir);

    const results = await findProjects();

    const found = results.find((p) => p.path === parentProjectDir);
    expect(found).toBeDefined();
    expect(found?.detectionMethod).toBe('lockfile');
  });

  it('finds sibling projects under the same parent dir', async () => {
    // Structure: tempRoot/monorepo/app-a  (project with lock)
    //            tempRoot/monorepo/app-b  (project with lock)
    //            tempRoot/monorepo/tools  ← cwd (plain, not a project)
    const parentDir = await mkDir(tempRoot, 'monorepo');
    const projectA = await mkDir(parentDir, 'app-a');
    const projectB = await mkDir(parentDir, 'app-b');
    await writeLockFile(projectA, '0.46.0');
    await writeLockFile(projectB, '0.45.0');
    const cwdDir = await mkDir(parentDir, 'tools');
    process.chdir(cwdDir);

    const results = await findProjects();

    const foundA = results.find((p) => p.path === projectA);
    const foundB = results.find((p) => p.path === projectB);
    expect(foundA).toBeDefined();
    expect(foundB).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Deduplication: same project path must not appear more than once
// ---------------------------------------------------------------------------

describe('findProjects() — deduplication', () => {
  it('does not return the same project twice when cwd is the project itself', async () => {
    const projectDir = await mkDir(tempRoot, 'dedup-project');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    const results = await findProjects();

    const matchingPaths = results.filter((p) => p.path === projectDir);
    expect(matchingPaths.length).toBe(1);
  });

  it('does not return duplicate when both cwd and parent would discover the same project', async () => {
    // cwd = projectDir; parent = tempRoot
    // searchDirectory with `seen` Set prevents double-processing of projectDir.
    const projectDir = await mkDir(tempRoot, 'nested-project');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    const results = await findProjects();

    const matchingPaths = results.filter((p) => p.path === projectDir);
    expect(matchingPaths.length).toBe(1);
  });

  it('returns no duplicate paths across all results', async () => {
    const projectDir = await mkDir(tempRoot, 'full-dedup');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    const results = await findProjects();

    const paths = results.map((p) => p.path);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });

  it('returns consistent count across multiple invocations', async () => {
    const projectDir = await mkDir(tempRoot, 'stable-project');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    const results1 = await findProjects();
    const results2 = await findProjects();

    const count1 = results1.filter((p) => p.path === projectDir).length;
    const count2 = results2.filter((p) => p.path === projectDir).length;
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge case: parent === cwd (filesystem root /)
// ---------------------------------------------------------------------------

describe('findProjects() — root directory edge case', () => {
  it('does not throw when cwd is filesystem root (/)', async () => {
    // dirname('/') === '/' — the `parent !== cwd` guard prevents double-addition.
    const originalCwdFn = process.cwd;
    process.cwd = () => '/';
    try {
      const results = await findProjects();
      expect(Array.isArray(results)).toBe(true);
    } finally {
      process.cwd = originalCwdFn;
    }
  });

  it('returns no duplicate paths when cwd is filesystem root (/)', async () => {
    const originalCwdFn = process.cwd;
    process.cwd = () => '/';
    try {
      const results = await findProjects();
      const paths = results.map((p) => p.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    } finally {
      process.cwd = originalCwdFn;
    }
  });
});

// ---------------------------------------------------------------------------
// Edge case: options.paths provided — cwd/parent injection is skipped
// ---------------------------------------------------------------------------

describe('findProjects() — options.paths skips cwd/parent injection', () => {
  it('does not inject cwd into search when options.paths is provided', async () => {
    const projectDir = await mkDir(tempRoot, 'cwd-only-project');
    await writeLockFile(projectDir);
    process.chdir(projectDir);

    // options.paths is set → cwd injection branch is skipped.
    // We provide an empty dir that does not contain any projects.
    // Default search dirs (~/workspace etc.) may still return results from the
    // real filesystem, so we verify the cwd-specific project is NOT present.
    const emptySearchDir = await mkDir(tempRoot, 'empty-search');
    const results = await findProjects({ paths: [emptySearchDir] });

    // The project in cwd was not injected — it should not appear.
    const found = results.find((p) => p.path === projectDir);
    expect(found).toBeUndefined();
  });

  it('still finds a project when its path is explicitly in options.paths', async () => {
    const projectDir = await mkDir(tempRoot, 'explicit-project');
    await writeLockFile(projectDir);
    // Not changing cwd — project is only reachable via options.paths.

    const results = await findProjects({ paths: [tempRoot] });

    const found = results.find((p) => p.path === projectDir);
    expect(found).toBeDefined();
    expect(found?.version).toBe('0.46.0');
  });
});

// ---------------------------------------------------------------------------
// Edge case: non-existent directories are silently ignored
// ---------------------------------------------------------------------------

describe('findProjects() — non-existent directory handling', () => {
  it('does not throw when cwd() returns a non-existent path', async () => {
    const phantomDir = join(tempRoot, 'does-not-exist', 'nested');
    const originalCwdFn = process.cwd;
    process.cwd = () => phantomDir;
    try {
      const results = await findProjects();
      expect(Array.isArray(results)).toBe(true);
    } finally {
      process.cwd = originalCwdFn;
    }
  });

  it('does not throw when options.paths contains non-existent paths', async () => {
    const phantomPath = join(tempRoot, 'ghost-path-12345');
    // Should not throw; results may come from DEFAULT_SEARCH_DIRS only.
    const results = await findProjects({ paths: [phantomPath] });
    expect(Array.isArray(results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case: parent of cwd is a non-project directory
// ---------------------------------------------------------------------------

describe('findProjects() — parent dir is not a project', () => {
  it('does not include plain parent directory (without markers) in results', async () => {
    const parentDir = await mkDir(tempRoot, 'plain-parent');
    const childDir = await mkDir(parentDir, 'workspace');
    process.chdir(childDir);

    const results = await findProjects();

    // parentDir has no lock file and no .claude markers — must not appear.
    const found = results.find((p) => p.path === parentDir);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge case: parent dir check — dirname behavior
// ---------------------------------------------------------------------------

describe('findProjects() — dirname edge cases', () => {
  it('parent of a top-level temp dir differs from the dir itself', () => {
    // Sanity check: ensure our test assumption about dirname is correct.
    const dir = '/some/path/to/dir';
    const parent = dirname(dir);
    expect(parent).toBe('/some/path/to');
    expect(parent).not.toBe(dir);
  });

  it('parent of root equals root (preventing infinite loop risk)', () => {
    const root = '/';
    const parent = dirname(root);
    expect(parent).toBe('/');
    expect(parent).toBe(root); // This is what the `parent !== cwd` guard checks.
  });
});

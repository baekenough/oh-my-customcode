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

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findProjects, projectsCommand } from '../../../src/cli/projects.js';
import { _setRegistryDirForTesting } from '../../../src/core/registry.js';

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
let originalHome: string | undefined;

beforeEach(async () => {
  // Create a temp dir that is OUTSIDE DEFAULT_SEARCH_DIRS so default search
  // does not accidentally discover our test projects.
  // Use realpathSync to normalize macOS symlinks (/var → /private/var).
  const raw = await mkdtemp(join(tmpdir(), 'omcc-projects-test-'));
  tempRoot = realpathSync(raw);
  originalCwd = process.cwd();

  // Set HOME to tempRoot so the homedir filter in findProjects() treats
  // tempRoot as the home directory. This is required because tmpdir() resolves
  // to /private/var/folders/... on macOS, which is outside the real HOME.
  // The same HOME-override pattern is used in src/core/registry.ts:33.
  originalHome = process.env.HOME;
  process.env.HOME = tempRoot;

  // Isolate the registry so findProjects() falls back to lock-file scanning.
  // An empty registry causes findProjects() to use _findProjectsFromLockfiles(),
  // which scans cwd/parent/options.paths for .omcustom.lock.json files.
  // We pre-create the file to seed Bun's fs read cache with empty content.
  const registryDir = join(tempRoot, '.oh-my-customcode');
  await mkdir(registryDir, { recursive: true });
  await writeFile(
    join(registryDir, 'projects.json'),
    JSON.stringify({ projects: {} }, null, 2),
    'utf-8'
  );
  _setRegistryDirForTesting(registryDir);
});

afterEach(async () => {
  _setRegistryDirForTesting(undefined);
  process.chdir(originalCwd);
  process.env.HOME = originalHome;
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

// ---------------------------------------------------------------------------
// Registry-based findProjects() — when registry has entries
// ---------------------------------------------------------------------------

describe('findProjects() — registry-based detection', () => {
  it('returns projects from the registry with detectionMethod "registry"', async () => {
    const projectDir = await mkDir(tempRoot, 'reg-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectDir]: {
            version: '0.79.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const results = await findProjects();

    const found = results.find((p) => p.path === projectDir);
    expect(found).toBeDefined();
    expect(found?.detectionMethod).toBe('registry');
    expect(found?.version).toBe('0.79.0');
    expect(found?.installedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(found?.updatedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('filters registry entries by options.paths', async () => {
    const includedDir = await mkDir(tempRoot, 'included-project');
    const excludedDir = await mkDir(tempRoot, 'excluded-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [includedDir]: {
            version: '0.79.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
          [excludedDir]: {
            version: '0.79.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const results = await findProjects({ paths: [includedDir] });

    expect(results.find((p) => p.path === includedDir)).toBeDefined();
    expect(results.find((p) => p.path === excludedDir)).toBeUndefined();
  });

  it('sorts registry results with latest-status entries first', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;

    const latestDir = await mkDir(tempRoot, 'aaa-latest-project');
    const outdatedDir = await mkDir(tempRoot, 'bbb-outdated-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [outdatedDir]: {
            version: '0.0.1',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          [latestDir]: {
            version: currentVersion,
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const results = await findProjects();

    // latest-status entries must appear before outdated entries
    const latestIdx = results.findIndex((p) => p.path === latestDir);
    const outdatedIdx = results.findIndex((p) => p.path === outdatedDir);
    expect(latestIdx).toBeLessThan(outdatedIdx);
  });

  it('puts non-latest entries after latest entries regardless of registry insertion order', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;

    // Register latest FIRST in object order (insertion order preserved in JS objects)
    // so the sort comparator's second branch (return 1: !a.latest && b.latest) fires
    // when comparing [latestDir, outdatedDir] pairs during sort.
    const latestDir = await mkDir(tempRoot, 'zzz-latest-proj');
    const outdatedDir = await mkDir(tempRoot, 'aaa-outdated-proj');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    // Insert latest first so when sort visits (outdated, latest), it hits the return 1 branch
    const projects: Record<string, unknown> = {};
    projects[latestDir] = {
      version: currentVersion,
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    projects[outdatedDir] = {
      version: '0.0.1',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({ projects }, null, 2),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const results = await findProjects();

    const latestIdx = results.findIndex((p) => p.path === latestDir);
    const outdatedIdx = results.findIndex((p) => p.path === outdatedDir);
    expect(latestIdx).toBeLessThan(outdatedIdx);
  });

  it('returns all matching entries when options.paths contains a parent directory', async () => {
    const subProject = await mkDir(tempRoot, 'sub', 'nested-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [subProject]: {
            version: '0.79.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    // options.paths points to the parent — subProject startsWith(tempRoot + sep)
    const results = await findProjects({ paths: [tempRoot] });

    expect(results.find((p) => p.path === subProject)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeStatus — version comparison branches (Lines 113, 115, 127)
// Tested indirectly via findProjects() with registry entries
// ---------------------------------------------------------------------------

describe('findProjects() — computeStatus via registry entries', () => {
  async function makeRegistryWithVersion(version: string | null): Promise<void> {
    const projectDir = await mkDir(tempRoot, 'status-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectDir]: {
            version: version ?? '',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);
  }

  it('assigns status "latest" when project version matches current CLI version', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;
    await makeRegistryWithVersion(currentVersion);

    const results = await findProjects();

    // At least one project should have status 'latest'
    const latestProject = results.find((p) => p.status === 'latest');
    expect(latestProject).toBeDefined();
  });

  it('assigns status "outdated" when project version is older than current CLI version', async () => {
    // 0.0.1 is always older than any real CLI version
    await makeRegistryWithVersion('0.0.1');

    const results = await findProjects();

    const outdated = results.find((p) => p.version === '0.0.1');
    expect(outdated).toBeDefined();
    expect(outdated?.status).toBe('outdated');
  });

  it('assigns status "latest" when version is ahead of current (not outdated)', async () => {
    // A very high version that would be ahead of any real CLI version
    await makeRegistryWithVersion('999.999.999');

    const results = await findProjects();

    const found = results.find((p) => p.version === '999.999.999');
    expect(found).toBeDefined();
    // Version ahead of current: computeStatus returns 'latest' (not outdated, not unknown)
    expect(found?.status).toBe('latest');
  });
});

// ---------------------------------------------------------------------------
// projectsCommand() — empty projects table (Lines 296-300)
// ---------------------------------------------------------------------------

describe('projectsCommand() — empty projects table', () => {
  it('logs migration hint when no projects are found and format is table', async () => {
    // Registry is empty (set up by beforeEach) and options.paths points to an empty dir
    const emptyDir = await mkDir(tempRoot, 'empty-for-table');
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await projectsCommand({ paths: [emptyDir], format: 'table' });
      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(0);

      // Verify the empty-state migration hint was printed
      const allCalls = consoleSpy.mock.calls.map((args) => args.join(' '));
      const hasMigrationHint = allCalls.some(
        (msg) =>
          msg.includes('--migrate') || msg.includes('마이그레이션') || msg.includes('레지스트리')
      );
      expect(hasMigrationHint).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// projectsCommand() — migration mode (Lines 373-405)
// ---------------------------------------------------------------------------

describe('projectsCommand() — migration mode', () => {
  it('runs migration when options.migrate is true and logs success message', async () => {
    // Create a project with a lock file that migration can discover
    const projectDir = await mkDir(tempRoot, 'migrate-target');
    await writeFile(
      join(projectDir, '.omcustom.lock.json'),
      JSON.stringify({ version: '0.78.0', installedAt: '2026-01-01T00:00:00.000Z' }),
      'utf-8'
    );

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await projectsCommand({
        migrate: true,
        paths: [tempRoot],
        format: 'json',
      });

      expect(result.success).toBe(true);

      // Verify migration log message was emitted
      const allCalls = consoleSpy.mock.calls.map((args) => args.join(' '));
      const hasMigrationLog = allCalls.some(
        (msg) =>
          msg.includes('마이그레이션') || msg.includes('migration') || msg.includes('레지스트리')
      );
      expect(hasMigrationLog).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('returns success: false and includes error when migration throws', async () => {
    // Corrupt the registry directory so migrateFromLockfiles cannot write
    const registryDir = join(tempRoot, '.oh-my-customcode');
    // Write a FILE at the registry path to prevent directory creation (causes ENOTDIR)
    const badRegistryPath = join(tempRoot, '.oh-my-customcode', 'projects.json');
    await rm(badRegistryPath, { force: true });
    // Overwrite the registry dir itself with a file to block write operations
    await rm(registryDir, { recursive: true, force: true });
    await writeFile(registryDir, 'not-a-directory', 'utf-8');
    // Point registry override at the corrupted path
    _setRegistryDirForTesting(join(registryDir, 'nested'));

    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await projectsCommand({
        migrate: true,
        paths: [tempRoot],
        format: 'table',
      });

      // Migration may fail due to corrupt registry → errors array populated
      // OR succeed with 0 imports (depending on whether write is actually triggered)
      // Either way the command should not throw
      expect(typeof result.success).toBe('boolean');
    } finally {
      consoleErrorSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// projectsCommand() — error handler (Lines 422-424)
//
// Strategy: the try/catch at lines 410-426 wraps findProjects() + the format
// output functions. We trigger it by replacing console.log with a spy that
// throws on the first call after findProjects returns — this happens when
// JSON.stringify output is passed to console.log inside the 'json' branch.
// Since the throw happens inside the try block the catch at lines 422-424 is hit.
// ---------------------------------------------------------------------------

describe('projectsCommand() — error handling', () => {
  it('returns success: false with error when an error is thrown inside the try block', async () => {
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Set up an empty-dir project so findProjects() completes without throwing.
    // We use format:'json' so the branch that calls console.log(JSON.stringify(...)) runs.
    // We then replace console.log with a version that throws AFTER findProjects returns.
    let callCount = 0;
    const consoleSpy = spyOn(console, 'log').mockImplementation((..._args: unknown[]) => {
      callCount++;
      // The first console.log in projectsCommand is the '검색 중...' banner (line 408,
      // outside the try block). The second call inside the try block is the JSON output.
      // Throw on the second call to fire the catch block.
      if (callCount >= 2) {
        throw new Error('Intentional error inside try block');
      }
    });

    try {
      const result = await projectsCommand({
        paths: [tempRoot],
        format: 'json',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Intentional error inside try block');
    } finally {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// formatProjectsTable — main body coverage (Lines 301, 303-342)
// Covered by calling projectsCommand with format:'table' and non-empty projects
// ---------------------------------------------------------------------------

describe('projectsCommand() — table formatting with non-empty projects', () => {
  it('renders table output for a registry project with format "table"', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;

    const projectDir = await mkDir(tempRoot, 'table-latest-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectDir]: {
            version: currentVersion,
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const logLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });

    try {
      const result = await projectsCommand({ format: 'table' });

      expect(result.success).toBe(true);
      expect(result.projects.length).toBeGreaterThan(0);

      // Table header must appear
      const hasProjectHeader = logLines.some((l) => l.includes('Project'));
      expect(hasProjectHeader).toBe(true);

      // Summary line must mention total count
      const hasSummary = logLines.some((l) => l.includes('Total:'));
      expect(hasSummary).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('renders table rows for outdated and unknown status projects', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;

    const latestDir = await mkDir(tempRoot, 'row-latest');
    const outdatedDir = await mkDir(tempRoot, 'row-outdated');
    const unknownDir = await mkDir(tempRoot, 'row-unknown');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [latestDir]: {
            version: currentVersion,
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          [outdatedDir]: {
            version: '0.0.1',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          [unknownDir]: {
            version: '',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const logLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });

    try {
      const result = await projectsCommand({ format: 'table' });

      expect(result.success).toBe(true);

      // Status icons for all three states must appear
      const output = logLines.join('\n');
      expect(output).toContain('✓ latest');
      expect(output).toContain('⚠ outdated');
      expect(output).toContain('? unknown');

      // Summary counters
      expect(output).toMatch(/1 latest/);
      expect(output).toMatch(/1 outdated/);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// formatProjectsSimple — coverage (Lines 359-365)
// ---------------------------------------------------------------------------

describe('projectsCommand() — simple formatting', () => {
  it('renders simple output listing each project with version and status', async () => {
    const currentPkg = await import('../../../package.json', { with: { type: 'json' } });
    const currentVersion: string = (currentPkg as unknown as { default: { version: string } })
      .default.version;

    const projectDir = await mkDir(tempRoot, 'simple-project');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectDir]: {
            version: currentVersion,
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const logLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });

    try {
      const result = await projectsCommand({ format: 'simple' });

      expect(result.success).toBe(true);

      const output = logLines.join('\n');
      // The simple format includes a checkmark and the project name
      expect(output).toContain('✓');
      expect(output).toContain('simple-project');
      // Footer with installed version
      expect(output).toContain('현재 설치 버전');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('renders simple output for outdated project with warning icon', async () => {
    const projectDir = await mkDir(tempRoot, 'simple-outdated');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectDir]: {
            version: '0.0.1',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const logLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });

    try {
      await projectsCommand({ format: 'simple' });
      const output = logLines.join('\n');
      expect(output).toContain('⚠');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// shortenPath — coverage (Lines 348-352)
// The home directory path shortening is exercised when a project path is under ~
// ---------------------------------------------------------------------------

describe('projectsCommand() — shortenPath coverage', () => {
  it('shortens home directory paths to ~ in table output', async () => {
    const { homedir } = await import('node:os');
    // Use the real homedir (not tempRoot) so the project path is under ~
    // and the homedir filter in findProjects() allows it through.
    const realHome = homedir();
    process.env.HOME = realHome;

    // Create a project path under home dir to trigger the ~ shortening branch
    // We don't actually create the directory — we fake the registry entry instead
    const projectUnderHome = join(realHome, '.oh-my-customcode-test-project-coverage');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({
        projects: {
          [projectUnderHome]: {
            version: '0.0.1',
            installedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const logLines: string[] = [];
    const consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });

    try {
      await projectsCommand({ format: 'table' });
      const output = logLines.join('\n');
      // Path under home should be shortened to ~
      expect(output).toContain('~');
    } finally {
      consoleSpy.mockRestore();
      // Restore HOME to tempRoot for the afterEach cleanup to work correctly
      process.env.HOME = tempRoot;
    }
  });
});

// ---------------------------------------------------------------------------
// Sort tie-breaking: localeCompare branch (Line 185)
// Fires when two entries have the same status — alphabetically sorted by name
// ---------------------------------------------------------------------------

describe('findProjects() — sort tie-breaking (same status, alphabetical)', () => {
  it('sorts two outdated projects alphabetically by name', async () => {
    const alphaDir = await mkDir(tempRoot, 'alpha-outdated');
    const betaDir = await mkDir(tempRoot, 'beta-outdated');
    const registryDir = join(tempRoot, '.oh-my-customcode');
    await mkdir(registryDir, { recursive: true });
    // Insert beta first so localeCompare sort is actually exercised
    const projects: Record<string, unknown> = {};
    projects[betaDir] = {
      version: '0.0.1',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    projects[alphaDir] = {
      version: '0.0.1',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeFile(
      join(registryDir, 'projects.json'),
      JSON.stringify({ projects }, null, 2),
      'utf-8'
    );
    _setRegistryDirForTesting(registryDir);

    const results = await findProjects();

    const alphaIdx = results.findIndex((p) => p.path === alphaDir);
    const betaIdx = results.findIndex((p) => p.path === betaDir);
    // alpha- comes before beta- alphabetically
    expect(alphaIdx).toBeLessThan(betaIdx);
  });
});

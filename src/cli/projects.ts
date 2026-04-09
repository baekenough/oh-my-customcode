/**
 * omcustom projects command
 * Lists all projects on the machine where oh-my-customcode is installed,
 * and shows their version status compared to the currently installed CLI version.
 */

import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import packageJson from '../../package.json';
import { readRegistry } from '../core/registry.js';
import { fileExists, readJsonFile, resolveTemplatePath } from '../utils/fs.js';

/**
 * Lock file schema for .omcustom.lock.json
 * Note: This file may contain additional fields from the template installer
 * (lockfileVersion, templateVersion, files, etc.) — only the fields below are
 * read/written by the projects command.
 */
export interface OmcustomLockFile {
  version?: string;
  installedAt?: string;
  updatedAt?: string;
  /** Template version field from installer (read-only for version detection) */
  templateVersion?: string;
  components?: {
    agents?: number;
    skills?: number;
    rules?: number;
    guides?: number;
    hooks?: number;
  };
  customizations?: {
    agents?: string[];
    skills?: string[];
    rules?: string[];
  };
  [key: string]: unknown;
}

/**
 * Information about a project where oh-my-customcode is installed
 */
export interface ProjectInfo {
  name: string;
  path: string;
  version: string | null;
  installedAt: string | null;
  updatedAt: string | null;
  status: 'latest' | 'outdated' | 'unknown';
  detectionMethod: 'registry' | 'lockfile';
}

/**
 * Result of the projects command
 */
export interface ProjectsResult {
  success: boolean;
  projects: ProjectInfo[];
  currentVersion: string;
  errors?: string[];
}

/**
 * Options for the projects command
 */
export interface ProjectsOptions {
  paths?: string[];
  format?: 'table' | 'json' | 'simple';
  /** Run migration from lock files to registry */
  migrate?: boolean;
}

/**
 * Read the lock file from a project directory
 */
export async function readLockFile(projectDir: string): Promise<OmcustomLockFile | null> {
  const lockFilePath = join(projectDir, '.omcustom.lock.json');
  try {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(lockFilePath, 'utf-8');
    return JSON.parse(content) as OmcustomLockFile;
  } catch {
    return null;
  }
}

/**
 * Compute status relative to current CLI version
 */
function computeStatus(
  version: string | null,
  currentVersion: string
): 'latest' | 'outdated' | 'unknown' {
  if (!version) return 'unknown';

  // Normalize versions (strip leading 'v' if present)
  const normalizedInstalled = version.replace(/^v/, '');
  const normalizedCurrent = currentVersion.replace(/^v/, '');

  if (normalizedInstalled === normalizedCurrent) return 'latest';

  // Simple semver comparison
  const parseVersion = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPatch] = parseVersion(normalizedInstalled);
  const [bMaj, bMin, bPatch] = parseVersion(normalizedCurrent);

  if (
    aMaj < bMaj ||
    (aMaj === bMaj && aMin < bMin) ||
    (aMaj === bMaj && aMin === bMin && aPatch < bPatch)
  ) {
    return 'outdated';
  }

  return 'latest';
}

/**
 * Get the version from the bundled templates/manifest.json.
 * Falls back to the CLI package version if the manifest is unavailable.
 */
async function getTemplateVersion(): Promise<string> {
  const manifestPath = resolveTemplatePath('manifest.json');
  if (await fileExists(manifestPath)) {
    const manifest = await readJsonFile<{ version: string }>(manifestPath);
    return manifest.version;
  }
  return packageJson.version as string;
}

/**
 * Find all projects registered in the local registry.
 *
 * When `options.paths` is provided the registry is searched but only entries
 * whose path starts with one of the provided directories are returned.
 * This preserves backward-compatible filtering used by tests and the CLI
 * `--path` flag.
 *
 * If the registry is empty a migration hint is printed to stderr.
 */
export async function findProjects(options: ProjectsOptions = {}): Promise<ProjectInfo[]> {
  const currentVersion = await getTemplateVersion();

  const registry = await readRegistry();

  // If registry is empty, fall back to lock-file scan of provided paths (or cwd/parent)
  // so the command still works before migration is run.
  if (Object.keys(registry.projects).length === 0) {
    const fallbackResults = await _findProjectsFromLockfiles(options, currentVersion);
    if (fallbackResults.length === 0 && !options.paths) {
      // Print migration hint to stderr so it doesn't pollute json output
      process.stderr.write(
        '  No projects in registry. Run `omcustom projects --migrate` to import existing projects.\n'
      );
    }
    return fallbackResults;
  }

  const results: ProjectInfo[] = [];

  for (const [projectPath, entry] of Object.entries(registry.projects)) {
    // Filter by provided paths when options.paths is set
    if (options.paths && options.paths.length > 0) {
      const matchesPath = options.paths.some(
        (searchPath) => projectPath === searchPath || projectPath.startsWith(searchPath + sep)
      );
      if (!matchesPath) continue;
    }

    results.push({
      name: basename(projectPath),
      path: projectPath,
      version: entry.version || null,
      installedAt: entry.installedAt || null,
      updatedAt: entry.updatedAt || null,
      status: computeStatus(entry.version || null, currentVersion),
      detectionMethod: 'registry',
    });
  }

  // Sort: latest first, then by name
  return results.sort((a, b) => {
    if (a.status === 'latest' && b.status !== 'latest') return -1;
    if (a.status !== 'latest' && b.status === 'latest') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Fallback project discovery using lock-file scanning.
 * Used when the registry is empty (pre-migration state).
 * Only scans paths from `options.paths`, cwd, and parent of cwd.
 *
 * @internal
 */
async function _findProjectsFromLockfiles(
  options: ProjectsOptions,
  currentVersion: string
): Promise<ProjectInfo[]> {
  const { dirname } = await import('node:path');
  const fs = await import('node:fs/promises');

  const seen = new Set<string>();
  const results: ProjectInfo[] = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 3 || seen.has(dir)) return;
    seen.add(dir);

    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const lockFile = await readLockFile(dir);
    if (lockFile) {
      const version = lockFile.version || lockFile.templateVersion || null;
      results.push({
        name: basename(dir),
        path: dir,
        version,
        installedAt: (lockFile.installedAt as string | undefined) || null,
        updatedAt: (lockFile.updatedAt as string | undefined) || null,
        status: computeStatus(version, currentVersion),
        detectionMethod: 'lockfile',
      });
      return;
    }

    if (depth < 3) {
      const subdirs = entries.filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          e.name !== 'node_modules' &&
          e.name !== 'dist' &&
          e.name !== 'build' &&
          e.name !== '.git'
      );
      await Promise.all(
        subdirs.map((sub) => scanDir(join(dir, sub.name), depth + 1).catch(() => {}))
      );
    }
  }

  const searchPaths: string[] = options.paths ? [...options.paths] : [];

  if (!options.paths) {
    const cwd = process.cwd();
    if (!searchPaths.includes(cwd)) searchPaths.push(cwd);
    const parent = dirname(cwd);
    if (parent !== cwd && !searchPaths.includes(parent)) searchPaths.push(parent);
  }

  await Promise.all(searchPaths.map((p) => scanDir(p, 0).catch(() => {})));

  return results.sort((a, b) => {
    if (a.status === 'latest' && b.status !== 'latest') return -1;
    if (a.status !== 'latest' && b.status === 'latest') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Write or update the lock file for a project.
 * If the file already exists (e.g., from the template installer), we merge
 * version tracking fields without overwriting the existing content.
 */
export async function writeLockFile(
  projectDir: string,
  version: string,
  existing?: OmcustomLockFile | null
): Promise<void> {
  const fs = await import('node:fs/promises');
  const lockFilePath = join(projectDir, '.omcustom.lock.json');
  const now = new Date().toISOString();

  // Merge version fields into existing content (preserves template hashes etc.)
  const merged: OmcustomLockFile = {
    ...(existing || {}),
    version,
    installedAt: (existing?.installedAt as string | undefined) || now,
    updatedAt: now,
  };

  await fs.writeFile(lockFilePath, JSON.stringify(merged, null, 2), 'utf-8');
}

/**
 * Format project list as a table
 */
function formatProjectsTable(projects: ProjectInfo[], currentVersion: string): void {
  if (projects.length === 0) {
    console.log('\n  oh-my-customcode가 적용된 프로젝트를 찾을 수 없습니다.');
    console.log(
      '  레지스트리가 비어 있습니다. `omcustom projects --migrate`를 실행하여 기존 프로젝트를 가져오세요.\n'
    );
    return;
  }

  const nameWidth = Math.max(20, ...projects.map((p) => p.name.length));
  const pathWidth = Math.max(35, ...projects.map((p) => shortenPath(p.path).length));
  const versionWidth = 10;

  console.log('\n  oh-my-customcode 적용 프로젝트 목록:\n');

  const nameHeader = 'Project'.padEnd(nameWidth);
  const pathHeader = 'Path'.padEnd(pathWidth);
  const versionHeader = 'Version'.padEnd(versionWidth);
  const statusHeader = 'Status';

  console.log(`  ${nameHeader}  ${pathHeader}  ${versionHeader}  ${statusHeader}`);
  console.log(
    `  ${'─'.repeat(nameWidth)}  ${'─'.repeat(pathWidth)}  ${'─'.repeat(versionWidth)}  ${'─'.repeat(12)}`
  );

  for (const project of projects) {
    const name = project.name.padEnd(nameWidth);
    const path = shortenPath(project.path).padEnd(pathWidth);
    const version = (project.version || 'unknown').padEnd(versionWidth);
    const statusIcon =
      project.status === 'latest'
        ? '✓ latest'
        : project.status === 'outdated'
          ? '⚠ outdated'
          : '? unknown';

    console.log(`  ${name}  ${path}  ${version}  ${statusIcon}`);
  }

  console.log(`  ${'─'.repeat(nameWidth + pathWidth + versionWidth + 20)}`);

  const latestCount = projects.filter((p) => p.status === 'latest').length;
  const outdatedCount = projects.filter((p) => p.status === 'outdated').length;
  const unknownCount = projects.filter((p) => p.status === 'unknown').length;

  console.log(
    `\n  Total: ${projects.length} projects (${latestCount} latest, ${outdatedCount} outdated, ${unknownCount} unknown)`
  );
  console.log(`  Latest version: v${currentVersion}\n`);
}

/**
 * Shorten a path by replacing home directory with ~
 */
function shortenPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

/**
 * Format project list as simple text
 */
function formatProjectsSimple(projects: ProjectInfo[], currentVersion: string): void {
  console.log(`\noh-my-customcode 적용 프로젝트 (${projects.length}개):`);
  for (const project of projects) {
    const version = project.version ? `v${project.version}` : 'unknown';
    const status = project.status === 'latest' ? '✓' : project.status === 'outdated' ? '⚠' : '?';
    console.log(`  ${status} ${project.name} [${version}] — ${shortenPath(project.path)}`);
  }
  console.log(`\n현재 설치 버전: v${currentVersion}`);
}

/**
 * Run the registry migration from lock files.
 * Returns an error message if migration failed, or null on success.
 */
async function runMigration(options: ProjectsOptions): Promise<string | null> {
  const { migrateFromLockfiles } = await import('../core/registry.js');
  const { homedir: _homedir } = await import('node:os');
  const DEFAULT_SEARCH_DIRS = ['workspace', 'projects', 'dev', 'src', 'code', 'repos', 'work'];
  const home = _homedir();
  const searchDirs = [...DEFAULT_SEARCH_DIRS.map((d) => join(home, d)), ...(options.paths ?? [])];
  const cwd = process.cwd();
  if (!searchDirs.includes(cwd)) searchDirs.push(cwd);

  console.log('  레지스트리 마이그레이션 시작...');
  try {
    const imported = await migrateFromLockfiles(searchDirs);
    console.log(`  마이그레이션 완료: ${imported}개 프로젝트가 레지스트리에 추가되었습니다.`);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Execute the projects command
 */
export async function projectsCommand(options: ProjectsOptions = {}): Promise<ProjectsResult> {
  const currentVersion = await getTemplateVersion();
  const format = options.format || 'table';

  // Migration mode: scan for lock files and import them into the registry
  if (options.migrate) {
    const migrationError = await runMigration(options);
    if (migrationError) {
      console.error('  마이그레이션 실패:', migrationError);
      return { success: false, projects: [], currentVersion, errors: [migrationError] };
    }
  }

  console.log('  oh-my-customcode 적용 프로젝트를 검색 중...');

  try {
    const projects = await findProjects(options);

    if (format === 'json') {
      console.log(JSON.stringify({ currentVersion, projects }, null, 2));
    } else if (format === 'simple') {
      formatProjectsSimple(projects, currentVersion);
    } else {
      formatProjectsTable(projects, currentVersion);
    }

    return { success: true, projects, currentVersion };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('  프로젝트 검색 실패:', errorMessage);
    return { success: false, projects: [], currentVersion, errors: [errorMessage] };
  }
}

export default projectsCommand;

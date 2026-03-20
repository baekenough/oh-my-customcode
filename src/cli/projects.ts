/**
 * omcustom projects command
 * Lists all projects on the machine where oh-my-customcode is installed,
 * and shows their version status compared to the currently installed CLI version.
 */

import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import packageJson from '../../package.json';
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
  detectionMethod: 'lockfile' | 'directory';
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
}

/**
 * Default search directories (relative to home directory)
 */
const DEFAULT_SEARCH_DIRS = ['workspace', 'projects', 'dev', 'src', 'code', 'repos', 'work'];

/**
 * Maximum depth to search for projects
 */
const MAX_SEARCH_DEPTH = 3;

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
 * Check if a directory has .claude/ with oh-my-customcode markers
 */
async function hasOmcustomMarkers(dir: string): Promise<boolean> {
  const fs = await import('node:fs/promises');

  // Check for .claude/agents/ and .claude/skills/ which are oh-my-customcode specific
  const agentsDir = join(dir, '.claude', 'agents');
  const skillsDir = join(dir, '.claude', 'skills');

  try {
    const [agentsStat, skillsStat] = await Promise.allSettled([
      fs.stat(agentsDir),
      fs.stat(skillsDir),
    ]);

    return (
      agentsStat.status === 'fulfilled' &&
      agentsStat.value.isDirectory() &&
      skillsStat.status === 'fulfilled' &&
      skillsStat.value.isDirectory()
    );
  } catch {
    return false;
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
 * Search a single directory for oh-my-customcode projects (recursive up to depth)
 */
async function searchDirectory(
  dir: string,
  depth: number,
  results: ProjectInfo[],
  currentVersion: string,
  seen: Set<string>
): Promise<void> {
  if (depth > MAX_SEARCH_DEPTH || seen.has(dir)) return;
  seen.add(dir);

  const fs = await import('node:fs/promises');

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Check if this directory itself is an omcustom project
  const lockFile = await readLockFile(dir);
  if (lockFile) {
    // Prefer explicit version field; fall back to templateVersion from installer lock
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
    // Don't recurse into a found project
    return;
  }

  // Check for directory pattern (no lock file but has .claude markers)
  if (await hasOmcustomMarkers(dir)) {
    results.push({
      name: basename(dir),
      path: dir,
      version: null,
      installedAt: null,
      updatedAt: null,
      status: 'unknown',
      detectionMethod: 'directory',
    });
    // Don't recurse into a found project
    return;
  }

  // Recurse into subdirectories
  if (depth < MAX_SEARCH_DEPTH) {
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
      subdirs.map((subdir) =>
        searchDirectory(join(dir, subdir.name), depth + 1, results, currentVersion, seen)
      )
    );
  }
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
 * Find all projects on the machine where oh-my-customcode is installed
 */
export async function findProjects(options: ProjectsOptions = {}): Promise<ProjectInfo[]> {
  const currentVersion = await getTemplateVersion();
  const home = homedir();
  const seen = new Set<string>();
  const results: ProjectInfo[] = [];

  // Build search paths
  const searchPaths: string[] = [];

  // Default search directories
  for (const dir of DEFAULT_SEARCH_DIRS) {
    searchPaths.push(join(home, dir));
  }

  // User-provided additional paths
  if (options.paths) {
    searchPaths.push(...options.paths);
  }

  // Search all paths in parallel
  await Promise.all(
    searchPaths.map((searchPath) =>
      searchDirectory(searchPath, 0, results, currentVersion, seen).catch(() => {
        // Silently ignore directories that don't exist or can't be read
      })
    )
  );

  // Sort: latest first, then by name
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
    console.log('  검색 경로: ~/workspace, ~/projects, ~/dev, ~/src, ~/code\n');
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
 * Execute the projects command
 */
export async function projectsCommand(options: ProjectsOptions = {}): Promise<ProjectsResult> {
  const currentVersion = await getTemplateVersion();
  const format = options.format || 'table';

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
